// Argus Cyclist - Virtual Cycling Environment for interactive bicycling experiments.
// Copyright (C) 2026  Paulo Sérgio
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Race furniture for event races: START and FINISH gates over the road (banner text
// drawn on a DynamicTexture), a checkered finish line on the asphalt, and the text
// labels used above ghosts. Everything is emissive, so it reads in both themes.

import {
    StandardMaterial, DynamicTexture, Color3, Quaternion, Vector3,
    CreateBox, CreatePlane, TransformNode, Mesh
} from './babylon.js';
import { ROAD_WIDTH } from './RouteMeshBuilder.js';

// Low enough for the chase camera (2.3 m high, 6.5 m behind) to see the whole banner
// while the rider waits under the start gate.
const GATE_HEIGHT = 4.4;
const BANNER_HEIGHT = 1.1;

/** Emissive material showing a canvas drawn by `draw(ctx, w, h)`. */
function canvasMaterial(scene, name, width, height, draw, { alpha = false } = {}) {
    const tex = new DynamicTexture(`${name}-tex`, { width, height }, scene, true);
    tex.hasAlpha = alpha;
    tex.anisotropicFilteringLevel = 8; // readable at grazing angles (road markings)
    const ctx = tex.getContext();
    draw(ctx, width, height);
    tex.update(true);
    const mat = new StandardMaterial(`${name}-mat`, scene);
    mat.diffuseColor = Color3.Black();
    mat.specularColor = Color3.Black();
    mat.emissiveTexture = tex;
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    if (alpha) {
        mat.opacityTexture = tex;
        mat.useAlphaFromDiffuseTexture = false;
    }
    return mat;
}

/** Text label texture: rounded box with centered bold text. */
export function labelMaterial(scene, name, text, { bg = 'rgba(2,6,23,0.75)', fg = '#ffffff', accent = null, width = 512, height = 112 } = {}) {
    return canvasMaterial(scene, name, width, height, (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        const r = h * 0.3;
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.moveTo(r, 0); ctx.lineTo(w - r, 0); ctx.quadraticCurveTo(w, 0, w, r);
        ctx.lineTo(w, h - r); ctx.quadraticCurveTo(w, h, w - r, h);
        ctx.lineTo(r, h); ctx.quadraticCurveTo(0, h, 0, h - r);
        ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0);
        ctx.fill();
        if (accent) { ctx.fillStyle = accent; ctx.fillRect(0, h - 8, w, 8); }
        ctx.fillStyle = fg;
        ctx.font = `bold ${Math.round(h * 0.46)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, w / 2, h * 0.48, w - 24);
    }, { alpha: true });
}

function bannerMaterial(scene, name, text, color) {
    return canvasMaterial(scene, name, 1024, 160, (ctx, w, h) => {
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, w, h);
        // Checkered side blocks.
        const sq = h / 4;
        for (let side = 0; side < 2; side++) {
            for (let i = 0; i < 4; i++) {
                for (let j = 0; j < 3; j++) {
                    ctx.fillStyle = (i + j) % 2 ? '#111' : '#fff';
                    ctx.fillRect(side ? w - (j + 1) * sq : j * sq, i * sq, sq, sq);
                }
            }
        }
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 104px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, w / 2, h / 2 + 4);
    });
}

function checkerMaterial(scene, name) {
    return canvasMaterial(scene, name, 512, 128, (ctx, w, h) => {
        const n = 8, m = 2, sw = w / n, sh = h / m;
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < m; j++) {
                ctx.fillStyle = (i + j) % 2 ? '#111111' : '#f5f5f5';
                ctx.fillRect(i * sw, j * sh, sw, sh);
            }
        }
    });
}

function orient(node, pose, pitch = true) {
    node.rotationQuaternion = Quaternion.RotationYawPitchRoll(pose.heading, pitch ? -Math.atan((pose.grade || 0) / 100) : 0, 0);
}

function buildGate(scene, model, root, s, text, color, withLine) {
    const pose = model.sampleOpen(s);
    const gate = new TransformNode(`gate-${text}`, scene);
    gate.parent = root;
    gate.position.set(pose.x, pose.y, pose.z);
    orient(gate, pose, false); // posts stay vertical

    const postMat = new StandardMaterial(`gate-${text}-post`, scene);
    postMat.diffuseColor = Color3.FromHexString(color);
    postMat.emissiveColor = Color3.FromHexString(color).scale(0.6);
    postMat.specularColor = Color3.Black();
    const half = ROAD_WIDTH / 2 + 0.5;
    for (const side of [-1, 1]) {
        const post = CreateBox(`gate-${text}-post`, { width: 0.35, height: GATE_HEIGHT, depth: 0.35 }, scene);
        post.parent = gate;
        post.position.set(side * half, GATE_HEIGHT / 2, 0);
        post.material = postMat;
    }

    // Banner facing the approaching rider (CreatePlane's front faces -Z, i.e. backwards).
    const banner = CreatePlane(`gate-${text}-banner`, { width: 2 * half + 0.35, height: BANNER_HEIGHT, sideOrientation: Mesh.DOUBLESIDE }, scene);
    banner.parent = gate;
    banner.position.set(0, GATE_HEIGHT - BANNER_HEIGHT / 2, 0);
    banner.material = bannerMaterial(scene, `gate-${text}`, text, color);

    if (withLine) {
        // A plane laid on the asphalt (its front faces -Z; +90° about X turns it up).
        const holder = new TransformNode(`gate-${text}-line-holder`, scene);
        holder.parent = root;
        holder.position.set(pose.x, pose.y + 0.05, pose.z);
        orient(holder, pose);
        const line = CreatePlane(`gate-${text}-line`, { width: ROAD_WIDTH, height: 1.6 }, scene);
        line.parent = holder;
        line.rotation.x = Math.PI / 2;
        line.material = checkerMaterial(scene, `gate-${text}-checker`);
        line.isPickable = false;
    }
    for (const m of gate.getChildMeshes()) m.isPickable = false;
}

/**
 * Builds the gates of a race. Returns the root node (dispose() removes everything).
 * @param {{start?: number, finish: number}} race distances (m) along the route
 */
export function buildRaceMarkers(scene, model, race) {
    const root = new TransformNode('race-markers', scene);
    buildGate(scene, model, root, race.start || 0, 'START', '#0ea5e9', false);
    if (race.finish > 0) buildGate(scene, model, root, race.finish, 'FINISH', '#ef4444', true);
    return root;
}

/** Billboard text above a rider (e.g. the ghost's name and time). */
export function buildFloatingLabel(scene, parent, text, opts = {}) {
    const plane = CreatePlane('floating-label', { width: 2.6, height: 0.57 }, scene);
    plane.parent = parent;
    plane.position = new Vector3(0, opts.height ?? 2.2, 0);
    plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
    plane.material = labelMaterial(scene, 'floating-label', text, opts);
    plane.isPickable = false;
    return plane;
}
