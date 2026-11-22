// Argus Cyclist - Virtual Cycling Environment for interactive bicycling experiments.
// Copyright (C) 2026  Paulo Sérgio
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Procedural vegetation and rocks for the realistic theme. No external models: every
// template is generated once (pines, broadleaf trees, bushes, rocks, grass tufts) with
// PBR materials (real bark/rock textures, canvas-painted foliage) and per-vertex
// ambient occlusion. Instances are grouped in 400 m chunks along the route; each chunk
// switches between a detailed and a simplified template (LOD) or turns off with the
// camera distance, so only nearby chunks cost draw calls.

import {
    Mesh, VertexData, PBRMaterial, DynamicTexture, Color3, Vector3, Matrix, Quaternion,
    CreateCylinder, CreateIcoSphere, CreatePlane, CreateTube
} from './babylon.js';
import { ROAD_WIDTH, nearRoad, seededRandom } from './RouteMeshBuilder.js';
import { terrainNoise } from './RealisticWorld.js';

const CHUNK_LENGTH = 400; // m
const LOD_INTERVAL = 300; // ms between visibility updates
const GRASS_DIST = 90;    // m: grass tufts only close to the camera

// ---------------------------------------------------------------------------
// Canvas-painted foliage textures
// ---------------------------------------------------------------------------

function paintTexture(scene, name, size, paint, alpha = false) {
    const tex = new DynamicTexture(name, { width: size, height: size }, scene, true);
    tex.hasAlpha = alpha;
    const ctx = tex.getContext();
    paint(ctx, size);
    tex.update(true);
    tex.anisotropicFilteringLevel = 4;
    return tex;
}

function needleTexture(scene) {
    const rnd = seededRandom(11);
    return paintTexture(scene, 'tex-needles', 256, (ctx, s) => {
        ctx.fillStyle = '#25401f';
        ctx.fillRect(0, 0, s, s);
        const greens = ['#2f5228', '#3c6a32', '#4d7d3c', '#1f3819', '#5b8c45'];
        ctx.lineCap = 'round';
        for (let i = 0; i < 2600; i++) {
            const x = rnd() * s, y = rnd() * s, len = 4 + rnd() * 9;
            const a = Math.PI / 2 + (rnd() - 0.5) * 1.4;
            ctx.strokeStyle = greens[(rnd() * greens.length) | 0];
            ctx.lineWidth = 1 + rnd() * 1.4;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
            ctx.stroke();
        }
    });
}

function leafTexture(scene) {
    const rnd = seededRandom(23);
    return paintTexture(scene, 'tex-leaves', 256, (ctx, s) => {
        ctx.fillStyle = '#3a5f2c';
        ctx.fillRect(0, 0, s, s);
        // Many small leaves with close tones: reads as foliage, not camouflage.
        const greens = ['#3f6830', '#46722f', '#4f7c35', '#365a29', '#57843a', '#5e8a3e'];
        for (let i = 0; i < 4200; i++) {
            const x = rnd() * s, y = rnd() * s, r = 1.6 + rnd() * 2.6;
            ctx.fillStyle = greens[(rnd() * greens.length) | 0];
            ctx.beginPath();
            ctx.ellipse(x, y, r, r * 0.55, rnd() * Math.PI, 0, Math.PI * 2);
            ctx.fill();
        }
        // Light dapples where the sun hits the outer leaves.
        ctx.globalAlpha = 0.35;
        for (let i = 0; i < 500; i++) {
            ctx.fillStyle = '#8fb35a';
            ctx.beginPath();
            ctx.ellipse(rnd() * s, rnd() * s, 1.5, 1, rnd() * Math.PI, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    });
}

function grassTexture(scene) {
    const rnd = seededRandom(5);
    return paintTexture(scene, 'tex-grass-tuft', 128, (ctx, s) => {
        ctx.clearRect(0, 0, s, s);
        for (let i = 0; i < 70; i++) {
            const x0 = s * (0.12 + 0.76 * rnd()), h = s * (0.35 + 0.6 * rnd()), bend = (rnd() - 0.5) * s * 0.4;
            // Muted, slightly dry greens: blends with the lawn texture instead of popping.
            const g = 70 + (rnd() * 55) | 0;
            ctx.fillStyle = `rgb(${(g * 0.72) | 0},${g + 18},${(g * 0.36) | 0})`;
            ctx.beginPath();
            ctx.moveTo(x0 - 1.4, s);
            ctx.quadraticCurveTo(x0 + bend * 0.5, s - h * 0.6, x0 + bend, s - h);
            ctx.quadraticCurveTo(x0 + bend * 0.5 + 0.6, s - h * 0.6, x0 + 1.4, s);
            ctx.fill();
        }
    }, true);
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/** Applies fn(x, y, z) → [x, y, z] to every vertex, then recomputes normals. */
function deform(mesh, fn) {
    const pos = mesh.getVerticesData('position');
    for (let i = 0; i < pos.length; i += 3) {
        const [x, y, z] = fn(pos[i], pos[i + 1], pos[i + 2]);
        pos[i] = x; pos[i + 1] = y; pos[i + 2] = z;
    }
    mesh.setVerticesData('position', pos, true);
    const normals = [];
    VertexData.ComputeNormals(pos, mesh.getIndices(), normals);
    mesh.setVerticesData('normal', normals, true);
}

/** Per-vertex colors from fn(x, y, z) → brightness (ambient occlusion and tint variation). */
function shade(mesh, fn, tint = [1, 1, 1]) {
    const pos = mesh.getVerticesData('position');
    const col = new Float32Array((pos.length / 3) * 4);
    for (let i = 0, j = 0; i < pos.length; i += 3, j += 4) {
        const v = fn(pos[i], pos[i + 1], pos[i + 2]);
        col[j] = v * tint[0]; col[j + 1] = v * tint[1]; col[j + 2] = v * tint[2]; col[j + 3] = 1;
    }
    mesh.setVerticesData('color', col, true);
}

function merge(meshes, name) {
    const merged = Mesh.MergeMeshes(meshes, true, true, undefined, false, true);
    merged.name = name;
    return merged;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

function pineTemplate(scene, mats, detailed) {
    const H = 10;
    const trunk = CreateCylinder('pine-trunk', { height: H * 0.85, diameterTop: 0.12, diameterBottom: 0.5, tessellation: detailed ? 9 : 5 }, scene);
    trunk.position.y = H * 0.425;
    trunk.bakeCurrentTransformIntoVertices();
    shade(trunk, (x, y) => 0.75 + 0.25 * Math.min(1, y / 3));
    trunk.material = mats.bark;

    const tiers = detailed ? 7 : 3;
    const parts = [];
    for (let k = 0; k < tiers; k++) {
        const f = k / tiers;
        const r = 2.7 * (1 - f * 0.85);
        const h = (detailed ? 2.5 : 3.6) * (1 - f * 0.35);
        const y0 = 1.8 + f * (H - 2.6);
        const tier = CreateCylinder(`pine-tier${k}`, {
            height: h, diameterTop: 0.25, diameterBottom: 2 * r,
            tessellation: detailed ? 18 : 7, subdivisions: detailed ? 3 : 1
        }, scene);
        tier.position.y = y0 + h / 2;
        tier.bakeCurrentTransformIntoVertices();
        const seed = k * 1.7;
        deform(tier, (x, y, z) => {
            const rad = Math.hypot(x, z);
            if (rad < 0.2) return [x, y, z];
            const a = Math.atan2(z, x);
            // Jagged branch tips that droop at the outside.
            const jag = 0.78 + 0.32 * (0.5 + 0.5 * Math.sin(a * 7 + seed)) * (0.6 + 0.4 * Math.sin(a * 3.3 - seed));
            const k2 = jag;
            const droop = -0.45 * Math.pow(rad / r, 2);
            return [x * k2, y + droop, z * k2];
        });
        shade(tier, (x, y, z) => {
            const rad = Math.hypot(x, z) / r;
            return 0.42 + 0.58 * Math.min(1, rad) * (0.85 + 0.15 * Math.sin(y * 3));
        });
        parts.push(tier);
    }
    const foliage = merge(parts, 'pine-foliage');
    foliage.material = mats.needles;
    const mesh = merge([trunk, foliage], detailed ? 'pine' : 'pine-low');
    return mesh;
}

function broadleafTemplate(scene, mats, detailed) {
    const rnd = seededRandom(detailed ? 31 : 37);
    const trunkPath = [new Vector3(0, 0, 0), new Vector3(0.1, 1.6, 0.05), new Vector3(-0.05, 3.2, 0.1)];
    const trunk = CreateTube('broad-trunk', { path: trunkPath, radiusFunction: (i) => [0.32, 0.24, 0.17][i], tessellation: detailed ? 9 : 5, cap: 2 }, scene);
    const branches = [trunk];
    if (detailed) {
        for (const [dx, dz] of [[1.2, 0.3], [-1.0, 0.6], [0.2, -1.1]]) {
            branches.push(CreateTube('broad-branch', {
                path: [new Vector3(0, 2.6, 0), new Vector3(dx * 0.6, 3.6, dz * 0.6), new Vector3(dx, 4.4, dz)],
                radiusFunction: (i) => [0.13, 0.09, 0.05][i], tessellation: 6, cap: 2
            }, scene));
        }
    }
    const wood = merge(branches, 'broad-wood');
    shade(wood, (x, y) => 0.7 + 0.3 * Math.min(1, y / 3));
    wood.material = mats.bark;

    const blobs = [];
    const count = detailed ? 7 : 3;
    for (let k = 0; k < count; k++) {
        const a = (k / count) * Math.PI * 2 + rnd();
        const rr = k === 0 ? 0 : 1.2 + rnd() * 0.6;
        const radius = (k === 0 ? 2.1 : 1.4 + rnd() * 0.7) * (detailed ? 1 : 1.25);
        const blob = CreateIcoSphere('broad-blob', { radius, subdivisions: detailed ? 3 : 1, flat: false }, scene);
        blob.position.set(Math.cos(a) * rr, 5.0 + rnd() * 1.4 - (k === 0 ? -0.6 : 0), Math.sin(a) * rr);
        blob.bakeCurrentTransformIntoVertices();
        blobs.push(blob);
    }
    const canopy = merge(blobs, 'broad-canopy');
    const cy = 5.4;
    deform(canopy, (x, y, z) => {
        const n = 1 + 0.16 * terrainNoise(x * 9 + 3, (y + z) * 9);
        return [x * n, cy + (y - cy) * n * 0.92, z * n];
    });
    shade(canopy, (x, y, z) => {
        const out = Math.min(1, Math.hypot(x, y - cy, z) / 3.2);
        const top = Math.min(1, Math.max(0, (y - 3.8) / 4));
        return 0.38 + 0.4 * out + 0.25 * top;
    });
    canopy.material = mats.leaves;
    return merge([wood, canopy], detailed ? 'broadleaf' : 'broadleaf-low');
}

function bushTemplate(scene, mats, detailed) {
    const rnd = seededRandom(detailed ? 41 : 43);
    const blobs = [];
    for (let k = 0; k < (detailed ? 3 : 1); k++) {
        const b = CreateIcoSphere('bush-blob', { radius: detailed ? 0.55 + rnd() * 0.3 : 0.85, subdivisions: detailed ? 2 : 1 }, scene);
        b.position.set((rnd() - 0.5) * 0.9, 0.45, (rnd() - 0.5) * 0.9);
        b.bakeCurrentTransformIntoVertices();
        blobs.push(b);
    }
    const bush = blobs.length > 1 ? merge(blobs, 'bush') : blobs[0];
    deform(bush, (x, y, z) => {
        const n = 1 + 0.2 * terrainNoise(x * 13, z * 13 + y * 7);
        return [x * n, Math.max(0, y * n * 0.85), z * n];
    });
    shade(bush, (x, y) => 0.45 + 0.55 * Math.min(1, y / 0.9), [0.9, 1, 0.85]);
    bush.material = mats.leaves;
    bush.name = detailed ? 'bush' : 'bush-low';
    return bush;
}

function rockTemplate(scene, mats, detailed) {
    const rock = CreateIcoSphere(detailed ? 'rock' : 'rock-low', { radius: 1, subdivisions: detailed ? 3 : 1 }, scene);
    deform(rock, (x, y, z) => {
        const n = 1 + 0.22 * terrainNoise(x * 19 + 7, z * 19 - y * 11) + 0.08 * terrainNoise(x * 53, y * 53 + z * 31);
        return [x * n * 1.15, Math.max(-0.15, y * n * 0.62), z * n];
    });
    shade(rock, (x, y) => 0.6 + 0.4 * Math.min(1, (y + 0.15) / 0.75));
    rock.material = mats.rock;
    return rock;
}

function grassTuftTemplate(scene, mats) {
    const quads = [];
    for (let k = 0; k < 3; k++) {
        const q = CreatePlane('tuft', { width: 0.7, height: 0.42, sideOrientation: Mesh.DOUBLESIDE }, scene);
        q.position.y = 0.2;
        q.rotation.y = (k * Math.PI) / 3;
        q.bakeCurrentTransformIntoVertices();
        quads.push(q);
    }
    const tuft = merge(quads, 'grass-tuft');
    tuft.material = mats.grass;
    return tuft;
}

function buildMaterials(scene, lib) {
    const foliage = (name, tex, tint) => {
        const m = new PBRMaterial(name, scene);
        m.albedoTexture = tex;
        m.albedoColor = Color3.FromHexString(tint);
        m.roughness = 0.92;
        m.metallic = 0;
        return m;
    };
    const grass = new PBRMaterial('mat-grass-tuft', scene);
    grass.albedoTexture = grassTexture(scene);
    grass.albedoTexture.hasAlpha = true;
    grass.useAlphaFromAlbedoTexture = true;
    grass.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHATEST;
    grass.alphaCutOff = 0.4;
    grass.backFaceCulling = false;
    grass.roughness = 0.95;
    grass.metallic = 0;
    return {
        bark: lib.pbr('knotted_pine_bark', { uScale: 1, vScale: 3 }),
        rock: lib.pbr('rocky_terrain_02', { uScale: 2, vScale: 2, name: 'rock-props' }),
        needles: foliage('mat-needles', needleTexture(scene), '#ffffff'),
        leaves: foliage('mat-leaves', leafTexture(scene), '#ffffff'),
        grass
    };
}

// ---------------------------------------------------------------------------
// Placement and LOD
// ---------------------------------------------------------------------------

const TYPES = ['pine', 'broadleaf', 'bush', 'rock'];

export class Vegetation {
    /**
     * @param {Scene} scene
     * @param {RouteModel} model
     * @param {{heightAt: Function, widths: {wl, wr}, grid: Map}} road from buildRealisticRoad
     * @param {MaterialLibrary} lib
     * @param {object} quality preset (vegetation density, grass, LOD distances)
     */
    constructor(scene, model, road, lib, quality) {
        this.scene = scene;
        this.quality = quality;
        const mats = buildMaterials(scene, lib);
        const templates = {
            pine: [pineTemplate(scene, mats, true), pineTemplate(scene, mats, false)],
            broadleaf: [broadleafTemplate(scene, mats, true), broadleafTemplate(scene, mats, false)],
            bush: [bushTemplate(scene, mats, true), bushTemplate(scene, mats, false)],
            rock: [rockTemplate(scene, mats, true), rockTemplate(scene, mats, false)]
        };
        const tuft = quality.grass ? grassTuftTemplate(scene, mats) : null;
        for (const t of Object.values(templates)) for (const m of t) m.setEnabled(false);
        if (tuft) tuft.setEnabled(false);

        this.chunks = this._place(model, road, quality, templates, tuft);
        for (const t of Object.values(templates)) for (const m of t) m.dispose(false, false); // keep materials
        if (tuft) tuft.dispose(false, false);
        this._last = 0;
        this.stats = { chunks: this.chunks.length, instances: 0 };
        for (const c of this.chunks) this.stats.instances += c.count;
    }

    _place(model, road, quality, templates, tuft) {
        const rnd = seededRandom(Math.round(model.length) * 7 + 3);
        const half = ROAD_WIDTH / 2;
        const { wl, wr } = road.widths;
        const step = model.step;
        const density = quality.vegetation;
        const chunks = [];
        const perChunk = Math.max(1, Math.round(CHUNK_LENGTH / step));

        for (let c0 = 0; c0 < model.n; c0 += perChunk) {
            const c1 = Math.min(model.n - 1, c0 + perChunk);
            const lists = { pine: [], broadleaf: [], bush: [], rock: [], tuft: [] };
            const spot = (i, side, lat, clearance) => {
                const w = side > 0 ? wr[i] : wl[i];
                if (lat > w - 1) return null;
                const nx = Math.cos(model.heading[i]), nz = -Math.sin(model.heading[i]);
                const x = model.x[i] + nx * side * (half + lat), z = model.z[i] + nz * side * (half + lat);
                if (nearRoad(model, road.grid, x, z, half + clearance)) return null;
                return { x, z, y: road.heightAt(i, side, lat) };
            };
            const put = (list, p, yaw, sx, sy, sz, sink = 0.15) => {
                const q = Quaternion.RotationYawPitchRoll(yaw, 0, 0);
                list.push(Matrix.Compose(new Vector3(sx, sy, sz), q, new Vector3(p.x, p.y - sink, p.z)));
            };

            for (let i = c0; i < c1; i += Math.max(1, Math.round(5 / step))) {
                for (const side of [-1, 1]) {
                    // Trees: sparse by the road, denser in groves further out.
                    const grove = 0.5 + 0.5 * terrainNoise(model.x[i] * 0.02 + side * 50, model.z[i] * 0.02);
                    if (rnd() < 0.8 * density * (0.3 + grove)) {
                        const lat = 7 + Math.pow(rnd(), 1.3) * 95;
                        const p = spot(i, side, lat, 4);
                        if (p) {
                            const pine = rnd() < 0.58;
                            const s = (pine ? 0.75 : 0.8) + rnd() * 0.6;
                            put(pine ? lists.pine : lists.broadleaf, p, rnd() * 6.28, s, s * (0.85 + rnd() * 0.35), s, 0.2);
                        }
                    }
                    if (rnd() < 0.4 * density) {
                        const p = spot(i, side, 2.5 + rnd() * 20, 1.5);
                        if (p) { const s = 0.7 + rnd() * 0.9; put(lists.bush, p, rnd() * 6.28, s, s * (0.7 + rnd() * 0.5), s, 0.1); }
                    }
                    if (rnd() < 0.05 * density) {
                        const p = spot(i, side, 3 + rnd() * 60, 2);
                        if (p) { const s = 0.4 + Math.pow(rnd(), 2) * 2.2; put(lists.rock, p, rnd() * 6.28, s, s * (0.7 + rnd() * 0.5), s * (0.8 + rnd() * 0.4), 0.25 * s); }
                    }
                    if (tuft) {
                        for (let k = 0; k < 3; k++) {
                            if (rnd() < 0.7 * density) {
                                const p = spot(i, side, 1.4 + Math.pow(rnd(), 1.5) * 12, 0.9);
                                if (p) { const s = 0.7 + rnd() * 0.8; put(lists.tuft, p, rnd() * 6.28, s, s * (0.8 + rnd() * 0.6), s, 0.02); }
                            }
                        }
                    }
                }
            }

            const mid = Math.round((c0 + c1) / 2);
            const chunk = {
                center: new Vector3(model.x[mid], model.y[mid], model.z[mid]),
                radius: (CHUNK_LENGTH / 2) + 110,
                high: [], low: [], grass: null, state: 'off', count: 0
            };
            for (const type of TYPES) {
                const mats = lists[type];
                if (!mats.length) continue;
                chunk.count += mats.length;
                chunk.high.push(this._instanced(templates[type][0], `${type}-${c0}`, mats));
                chunk.low.push(this._instanced(templates[type][1], `${type}-low-${c0}`, mats));
            }
            if (tuft && lists.tuft.length) chunk.grass = this._instanced(tuft, `tufts-${c0}`, lists.tuft);
            for (const m of [...chunk.high, ...chunk.low]) m.setEnabled(false);
            if (chunk.grass) chunk.grass.setEnabled(false);
            chunks.push(chunk);
        }
        return chunks;
    }

    // Each chunk owns its geometry: thin-instance buffers live on the geometry, so a
    // shared one would be overwritten by the next chunk.
    _instanced(template, name, matrices) {
        const mesh = template.clone(name);
        mesh.makeGeometryUnique();
        const buf = new Float32Array(matrices.length * 16);
        matrices.forEach((m, k) => m.copyToArray(buf, k * 16));
        mesh.thinInstanceSetBuffer('matrix', buf, 16, true);
        mesh.isPickable = false;
        mesh.doNotSyncBoundingInfo = true;
        mesh.freezeWorldMatrix();
        return mesh;
    }

    /** Switches chunk LODs from the camera position (cheap; throttled). */
    update(cameraPos, now = performance.now(), force = false) {
        if (!force && now - this._last < LOD_INTERVAL) return;
        this._last = now;
        const q = this.quality;
        for (const c of this.chunks) {
            const d = Math.max(0, Vector3.Distance(cameraPos, c.center) - c.radius);
            const state = d < q.treeHighDist ? 'high' : d < q.treeFarDist ? 'low' : 'off';
            if (state !== c.state) {
                for (const m of c.high) m.setEnabled(state === 'high');
                for (const m of c.low) m.setEnabled(state === 'low');
                c.state = state;
            }
            if (c.grass) c.grass.setEnabled(d < GRASS_DIST);
        }
    }
}
