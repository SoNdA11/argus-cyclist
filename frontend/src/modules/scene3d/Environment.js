// Argus Cyclist - Virtual Cycling Environment for interactive bicycling experiments.
// Copyright (C) 2026  Paulo Sérgio
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Lighting, sky and materials of the realistic theme:
//  - PBR materials from the bundled CC0 texture sets (see assets/scene3d/CREDITS.md)
//  - HDR sky as background and image-based lighting
//  - sun with a soft shadow that follows the rider (small frustum = cheap)
//  - linear fog for aerial perspective, ACES tone mapping, optional post-processing
//  - quality presets (low / medium / high) selectable at runtime

import {
    PBRMaterial, StandardMaterial, Texture, HDRCubeTexture, DirectionalLight, HemisphericLight,
    ShadowGenerator, DefaultRenderingPipeline, ImageProcessingConfiguration,
    CreateBox, Color3, Vector3, Scene
} from './babylon.js';
import skyUrl from '../../assets/scene3d/sky_kloofendal_48d_partly_cloudy_puresky_1k.hdr?url';

const TEXTURE_URLS = import.meta.glob('../../assets/scene3d/textures/*.jpg', { eager: true, as: 'url' });

function textureUrl(set, map) {
    const key = Object.keys(TEXTURE_URLS).find((k) => k.endsWith(`/${set}_${map}.jpg`));
    return key ? TEXTURE_URLS[key] : null;
}

// ---------------------------------------------------------------------------
// Quality presets
// ---------------------------------------------------------------------------

export const QUALITY_PRESETS = {
    low: { label: 'Low', shadows: 0, post: false, vegetation: 0.55, grass: false, scaling: 1.25, treeHighDist: 120, treeFarDist: 650 },
    medium: { label: 'Medium', shadows: 1024, post: false, vegetation: 1, grass: true, scaling: 1, treeHighDist: 180, treeFarDist: 900 },
    high: { label: 'High', shadows: 2048, post: true, vegetation: 1.35, grass: true, scaling: 1, treeHighDist: 260, treeFarDist: 1200 }
};
export const QUALITY_ORDER = ['low', 'medium', 'high'];

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

/** Per-scene cache of PBR materials built from the bundled texture sets. */
export class MaterialLibrary {
    constructor(scene) {
        this.scene = scene;
        this.cache = new Map();
    }

    _tex(set, map, uScale, vScale) {
        const url = textureUrl(set, map);
        if (!url) return null;
        const t = new Texture(url, this.scene, false, true, Texture.TRILINEAR_SAMPLINGMODE);
        t.uScale = uScale;
        t.vScale = vScale;
        t.anisotropicFilteringLevel = 8;
        return t;
    }

    /**
     * PBR material from a texture set (`<set>_diff/_nor/_arm.jpg`).
     * Textures tile `uScale × vScale` times per UV unit.
     */
    pbr(set, { uScale = 1, vScale = 1, tint = null, roughness = 1, name = set } = {}) {
        const key = `${name}|${uScale}|${vScale}`;
        if (this.cache.has(key)) return this.cache.get(key);
        const m = new PBRMaterial(`pbr-${name}`, this.scene);
        m.albedoTexture = this._tex(set, 'diff', uScale, vScale);
        m.bumpTexture = this._tex(set, 'nor', uScale, vScale);
        m.metallicTexture = this._tex(set, 'arm', uScale, vScale);
        m.useAmbientOcclusionFromMetallicTextureRed = true;
        m.useRoughnessFromMetallicTextureGreen = true;
        m.useMetallnessFromMetallicTextureBlue = true;
        m.metallic = 1;            // multiplies the texture's blue channel
        m.roughness = roughness;   // multiplies the texture's green channel
        m.invertNormalMapY = true; // Poly Haven ships OpenGL-convention normals
        if (tint) m.albedoColor = Color3.FromHexString(tint);
        this.cache.set(key, m);
        return m;
    }

    /** Untextured PBR material (painted metal, rubber, fabric…). */
    plain(name, hex, { roughness = 0.6, metallic = 0, emissive = null, alpha = 1 } = {}) {
        const key = `plain|${name}`;
        if (this.cache.has(key)) return this.cache.get(key);
        const m = new PBRMaterial(`plain-${name}`, this.scene);
        m.albedoColor = Color3.FromHexString(hex);
        m.roughness = roughness;
        m.metallic = metallic;
        if (emissive) m.emissiveColor = Color3.FromHexString(emissive);
        if (alpha < 1) m.alpha = alpha;
        this.cache.set(key, m);
        return m;
    }
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

/**
 * Sets up sky, lights, fog, shadows and image processing for the realistic theme.
 * Returns {sun, shadows, update(focus)}; update keeps the sun's shadow frustum on the rider.
 */
export function setupRealisticEnvironment(scene, camera, theme, quality) {
    const q = QUALITY_PRESETS[quality] || QUALITY_PRESETS.medium;

    // Image-based lighting from the sky (prefiltered once at load).
    const hdr = new HDRCubeTexture(skyUrl, scene, 256, false, true, false, true);
    scene.environmentTexture = hdr;
    scene.environmentIntensity = theme.envIntensity ?? 0.9;

    // Sky: same HDR on an infinite box, never fogged (the fog color matches its horizon).
    const sky = CreateBox('skybox', { size: 4000 }, scene);
    const skyMat = new StandardMaterial('skybox-mat', scene);
    skyMat.backFaceCulling = false;
    skyMat.disableLighting = true;
    skyMat.reflectionTexture = hdr.clone();
    skyMat.reflectionTexture.coordinatesMode = Texture.SKYBOX_MODE;
    skyMat.diffuseColor = Color3.Black();
    skyMat.specularColor = Color3.Black();
    skyMat.fogEnabled = false;
    sky.material = skyMat;
    sky.infiniteDistance = true;
    sky.isPickable = false;
    sky.applyFog = false;

    // Linear fog: near scenery stays crisp, distant mountains fade into the haze.
    scene.fogMode = Scene.FOGMODE_LINEAR;
    scene.fogStart = theme.fogStart ?? 180;
    scene.fogEnd = theme.fogEnd ?? 2600;
    scene.fogColor = Color3.FromHexString(theme.fog);

    // Sun (direction roughly matches the HDR's sun) and a weak fill.
    const sunDir = new Vector3(-0.42, -0.72, 0.55).normalize();
    const sun = new DirectionalLight('sun', sunDir, scene);
    sun.intensity = theme.sun ?? 3.2;
    sun.diffuse = Color3.FromHexString('#fff4e3');
    const fill = new HemisphericLight('fill', new Vector3(0, 1, 0), scene);
    fill.intensity = theme.hemi ?? 0.25;
    fill.groundColor = Color3.FromHexString(theme.hemiGround || '#4a5a3a');

    // Soft shadow around the rider only: a 44 m frustum keeps the map sharp and cheap.
    let shadows = null;
    if (q.shadows > 0) {
        sun.autoUpdateExtends = false;
        sun.orthoLeft = -22; sun.orthoRight = 22; sun.orthoTop = 22; sun.orthoBottom = -22;
        sun.shadowMinZ = 1;
        sun.shadowMaxZ = 160;
        shadows = new ShadowGenerator(q.shadows, sun);
        shadows.usePercentageCloserFiltering = true;
        shadows.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
        shadows.bias = 0.0008;
        shadows.normalBias = 0.02;
        shadows.darkness = 0.25;
    }

    // Tone mapping and color grading (applied in the material shaders: no extra pass).
    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = theme.exposure ?? 1.0;
    ip.contrast = theme.contrast ?? 1.12;

    // High quality: mild bloom + vignette through the default pipeline.
    let pipeline = null;
    if (q.post) {
        pipeline = new DefaultRenderingPipeline('post', false, scene, [camera]);
        pipeline.bloomEnabled = true;
        pipeline.bloomThreshold = 0.85;
        pipeline.bloomWeight = 0.18;
        pipeline.bloomKernel = 48;
        pipeline.imageProcessing.vignetteEnabled = true;
        pipeline.imageProcessing.vignetteWeight = 1.2;
        pipeline.imageProcessing.vignetteColor.set(0, 0, 0, 0);
    }

    const focus = new Vector3();
    return {
        sun,
        shadows,
        pipeline,
        /** Keeps the shadow frustum centered on the rider. */
        update(pos) {
            if (!shadows) return;
            focus.copyFrom(pos);
            sun.position.copyFrom(focus).subtractInPlace(sun.direction.scale(80));
        }
    };
}
