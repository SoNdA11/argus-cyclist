// Argus Cyclist - Virtual Cycling Environment for interactive bicycling experiments.
// Copyright (C) 2026  Paulo Sérgio
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Road and terrain of the realistic theme, built from the same RouteModel as the
// stylized themes (GPX distances, curves and grades are untouched):
//   asphalt (PBR, UVs along the road) · grade-colored edge bands · white edge lines ·
//   gravel shoulders · grass near the road with growing relief · rocky slopes further
//   out · a continuous mountain range on the horizon (follows the camera like a skybox).

import { Mesh, VertexData, Color3 } from './babylon.js';
import {
    ROAD_WIDTH, buildGrid, terrainWidths, buildLaneDashes, buildKmMarkers
} from './RouteMeshBuilder.js';
import { gradeColor } from './themes.js';

export const REAL_TERRAIN_WIDTH = 110; // m of terrain on each side
const CHUNK_SAMPLES = 250;
const EDGE_BAND = 0.3;     // grade-colored band on each road edge
const LINE_IN = 0.42;      // white line from the edge (inner side)
const LINE_W = 0.13;
const SHOULDER = 1.3;      // gravel shoulder width
const NEAR_OFFSETS = [5, 11, 18, 26];        // grass band (m from the shoulder's outer edge)
const FAR_OFFSETS = [26, 40, 60, 85, 110];   // rocky slopes

function smoothstep(a, b, x) {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
}

/** Smooth world-space noise in about [-1, 1] (several octaves of sines). */
export function terrainNoise(x, z) {
    return 0.5 * Math.sin(x * 0.011 + 1.7) * Math.cos(z * 0.013 + 0.4)
        + 0.3 * Math.sin(x * 0.031 - z * 0.027 + 2.1)
        + 0.2 * Math.sin((x + z) * 0.057 + 0.9) * Math.cos((x - z) * 0.049);
}

/**
 * Terrain height at lateral distance `lat` from the road edge: flat next to the
 * shoulder, then hills (and dips) that grow with the distance.
 */
export function terrainHeight(yRoad, lat, x, z, hills) {
    const t = smoothstep(3, 50, lat);
    return yRoad - 0.15 - 0.01 * Math.min(lat, 20) + hills * t * (0.25 + terrainNoise(x, z));
}

/** Mesh with positions/indices/uvs (and optional colors); normals computed and oriented up. */
function buildMesh(name, scene, positions, indices, uvs, colors = null) {
    const mesh = new Mesh(name, scene);
    const vd = new VertexData();
    vd.positions = positions;
    vd.indices = indices;
    vd.uvs = uvs;
    if (colors) vd.colors = colors;
    const normals = [];
    VertexData.ComputeNormals(positions, indices, normals);
    let up = 0;
    for (let i = 1; i < normals.length; i += 3) up += normals[i];
    if (up < 0) {
        for (let i = 0; i < indices.length; i += 3) { const t = indices[i + 1]; indices[i + 1] = indices[i + 2]; indices[i + 2] = t; }
        normals.length = 0;
        VertexData.ComputeNormals(positions, indices, normals);
    }
    vd.normals = normals;
    vd.applyToMesh(mesh);
    mesh.isPickable = false;
    mesh.freezeWorldMatrix();
    return mesh;
}

function gridIndices(rows, cols) {
    const idx = [];
    for (let i = 0; i < rows - 1; i++) {
        for (let c = 0; c < cols - 1; c++) {
            const a = i * cols + c, b = a + 1, d = a + cols, e = d + 1;
            idx.push(a, d, b, b, d, e);
        }
    }
    return idx;
}

/**
 * Builds road + terrain. Returns {receivers: Mesh[], heightAt(i, side, lat), widths}
 * so vegetation can sit on the same ground.
 */
export function buildRealisticRoad(scene, model, theme, lib) {
    const grid = buildGrid(model);
    const { wl, wr } = terrainWidths(model, grid, REAL_TERRAIN_WIDTH);
    const n = model.n, half = ROAD_WIDTH / 2;
    const hills = theme.hills ?? 9;
    const receivers = [];

    const asphalt = lib.pbr('asphalt_track', { roughness: 0.95 });
    const gravel = lib.pbr('gravel_floor_02');
    const grass = lib.pbr('grass004', { tint: theme.grassTint || '#ffffff' });
    // Same lawn further out (larger tiles + tonal variation): no visible seam between bands.
    const slopes = lib.pbr('grass004', { name: 'grass-far', tint: theme.farGrassTint || '#eef2dc' });
    const bandMat = lib.plain('edge-band', '#ffffff', { roughness: 0.55 });
    const lineMat = lib.plain('white-line', '#f3f3ef', { roughness: 0.5 });

    const heightAt = (i, side, lat) => {
        const nx = Math.cos(model.heading[i]), nz = -Math.sin(model.heading[i]);
        const x = model.x[i] + nx * side * (half + lat), z = model.z[i] + nz * side * (half + lat);
        return terrainHeight(model.y[i], lat, x, z, hills);
    };

    for (let c0 = 0; c0 < n - 1; c0 += CHUNK_SAMPLES) {
        const c1 = Math.min(n - 1, c0 + CHUNK_SAMPLES);
        const rows = c1 - c0 + 1;
        const A = { p: [], u: [] }, B = { p: [], u: [], c: [] }, L = { p: [], u: [] }, S = { p: [], u: [] };
        const N = { p: [], u: [], c: [] }, F = { p: [], u: [], c: [] };

        for (let i = c0; i <= c1; i++) {
            const x = model.x[i], y = model.y[i], z = model.z[i], s = i * model.step;
            const nx = Math.cos(model.heading[i]), nz = -Math.sin(model.heading[i]);
            const at = (off, yy) => [x + nx * off, yy, z + nz * off];

            // Asphalt: u across (4 m tiles), v along the road.
            for (const off of [-half, half]) { A.p.push(...at(off, y + 0.02)); A.u.push((off + half) / 4, s / 4); }

            // Grade bands and white lines (thin strips just above the asphalt).
            const g = gradeColor(model.grade[i]);
            for (const off of [-half, -half + EDGE_BAND, half - EDGE_BAND, half]) {
                B.p.push(...at(off, y + 0.03)); B.u.push(0, 0); B.c.push(g.r, g.g, g.b, 1);
            }
            for (const off of [-half + LINE_IN, -half + LINE_IN + LINE_W, half - LINE_IN - LINE_W, half - LINE_IN]) {
                L.p.push(...at(off, y + 0.031)); L.u.push(0, 0);
            }

            // Per side: shoulder strip, near grass band, far slopes. Columns always run
            // left to right (the left side is built outer → inner) so every quad winds
            // the same way and all normals point up.
            for (const side of [-1, 1]) {
                const w = side > 0 ? wr[i] : wl[i];
                const sh = Math.min(SHOULDER, w);
                const sp = [], su = [], np = [], nu = [], nc = [], fp = [], fu = [], fc = [];
                sp.push(at(side * half, y - 0.01), at(side * (half + sh), y - 0.1));
                su.push([0, s / 2], [sh / 2, s / 2]);

                for (const lat of [sh, ...NEAR_OFFSETS].map((o) => Math.min(o, w))) {
                    const [px, , pz] = at(side * (half + lat), 0);
                    const py = lat <= sh + 1e-6 ? y - 0.12 : terrainHeight(y, lat, px, pz, hills);
                    np.push([px, py, pz]); nu.push([px / 3.5, pz / 3.5]);
                    // Patchy tint: lighter/darker grass, a bit of dry soil by the shoulder.
                    const v = 0.88 + 0.14 * terrainNoise(px * 2.3, pz * 2.3);
                    const dry = lat < 2.5 ? 0.08 : 0;
                    nc.push([v + dry, v + dry * 0.5, v - dry, 1]);
                }
                for (const lat of FAR_OFFSETS.map((o) => Math.min(o, w))) {
                    const [px, , pz] = at(side * (half + lat), 0);
                    const py = terrainHeight(y, lat, px, pz, hills);
                    fp.push([px, py, pz]); fu.push([px / 9, pz / 9]);
                    // Patches plus drier (yellower) grass on the hilltops.
                    const v = 0.86 + 0.14 * terrainNoise(px * 1.1, pz * 1.1);
                    const dry = Math.min(0.18, Math.max(0, (py - y) / 40));
                    fc.push([v + dry, v + dry * 0.6, v - dry * 0.8, 1]);
                }
                const order = (arr) => (side < 0 ? arr.reverse() : arr);
                for (const v of order(sp)) S.p.push(...v);
                for (const v of order(su)) S.u.push(...v);
                for (const v of order(np)) N.p.push(...v);
                for (const v of order(nu)) N.u.push(...v);
                for (const v of order(nc)) N.c.push(...v);
                for (const v of order(fp)) F.p.push(...v);
                for (const v of order(fu)) F.u.push(...v);
                for (const v of order(fc)) F.c.push(...v);
            }
        }

        const tag = `${c0}`;
        const mk = (name, data, cols, mat, colors) => {
            const m = buildMesh(`${name}-${tag}`, scene, data.p, gridIndices(rows, cols), data.u, colors ? data.c : null);
            m.material = mat;
            return m;
        };
        // Strips with two independent columns per side are laid out [L0, L1, R0, R1].
        const pairIdx = (cols, pairs) => {
            const idx = [];
            for (let i = 0; i < rows - 1; i++) {
                for (const [a0, a1] of pairs) {
                    const a = i * cols + a0, b = i * cols + a1, d = (i + 1) * cols + a0, e = (i + 1) * cols + a1;
                    idx.push(a, d, b, b, d, e);
                }
            }
            return idx;
        };
        receivers.push(mk('asphalt', A, 2, asphalt));
        const band = buildMesh(`band-${tag}`, scene, B.p, pairIdx(4, [[0, 1], [2, 3]]), B.u, B.c);
        band.material = bandMat;
        const lines = buildMesh(`lines-${tag}`, scene, L.p, pairIdx(4, [[0, 1], [2, 3]]), L.u);
        lines.material = lineMat;
        const shoulders = buildMesh(`shoulder-${tag}`, scene, S.p, pairIdx(4, [[0, 1], [2, 3]]), S.u);
        shoulders.material = gravel;
        const nc = NEAR_OFFSETS.length + 1, fc = FAR_OFFSETS.length;
        const near = buildMesh(`near-${tag}`, scene, N.p, pairIdx(2 * nc, sidePairs(nc)), N.u, N.c);
        near.material = grass;
        const far = buildMesh(`far-${tag}`, scene, F.p, pairIdx(2 * fc, sidePairs(fc)), F.u, F.c);
        far.material = slopes;
        receivers.push(band, lines, shoulders, near);
    }

    buildLaneDashes(scene, model, { ...theme, laneLine: '#f3f3ef', edgeEmissive: false });
    buildKmMarkers(scene, model, { ...theme, edgeEmissive: false });

    return { receivers, heightAt, widths: { wl, wr }, grid };
}

// Column pairs for a per-side strip of `cols` vertices: left side 0..cols-1, right side cols..2cols-1.
function sidePairs(cols) {
    const pairs = [];
    for (let k = 0; k < cols - 1; k++) pairs.push([k, k + 1], [cols + k, cols + k + 1]);
    return pairs;
}

/**
 * Horizon mountains: a polar height field from 380 m to 2.4 km around the camera
 * (moved with it, so it behaves like a skybox), green at the foot, rock above,
 * snow on the highest ridges. Fog fades the far ring into the sky.
 */
export function buildMountainRing(scene, lib, theme) {
    const rings = 64, segs = 300, rMin = 380, rMax = 2400;
    const pos = [], uv = [], col = [];
    const low = Color3.FromHexString(theme.mountainLow || '#6f8a58');
    const rock = Color3.FromHexString(theme.mountainRock || '#8d8c84');
    const snow = Color3.FromHexString('#f4f6f8');
    for (let i = 0; i < rings; i++) {
        const r = rMin * Math.pow(rMax / rMin, i / (rings - 1));
        for (let j = 0; j <= segs; j++) {
            const a = (j / segs) * Math.PI * 2;
            const x = Math.sin(a) * r, z = Math.cos(a) * r;
            const rise = smoothstep(rMin, 1150, r);
            const base = 0.5 + 0.5 * terrainNoise(x * 0.18, z * 0.18);
            const ridge = 1 - Math.abs(terrainNoise(x * 0.42 + 31, z * 0.42 - 17));
            const h = rise * (25 + 420 * base * base * (0.45 + 0.55 * ridge));
            pos.push(x, h, z);
            uv.push(x / 140, z / 140);
            const tRock = smoothstep(90, 200, h), tSnow = smoothstep(300, 380, h);
            const c = Color3.Lerp(Color3.Lerp(low, rock, tRock), snow, tSnow);
            col.push(c.r, c.g, c.b, 1);
        }
    }
    const idx = gridIndices(rings, segs + 1);
    const mesh = buildMesh('mountains', scene, pos, idx, uv, col);
    mesh.material = lib.pbr('aerial_grass_rock', { name: 'mountains', tint: '#ffffff' });
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.unfreezeWorldMatrix(); // follows the camera
    return mesh;
}
