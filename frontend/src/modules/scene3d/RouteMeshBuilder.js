// Argus Cyclist - Virtual Cycling Environment for interactive bicycling experiments.
// Copyright (C) 2026  Paulo Sérgio
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Builds the procedural 3D world from the active route:
//   RouteModel        resamples the GPX at a fixed step, projects lat/lon to local
//                     meters, smooths path and elevation and answers sample(distance).
//   buildRouteWorld   road ribbon colored by grade, terrain strips, lane dashes,
//                     instanced props, km markers, ground plane and horizon skyline.
//
// Distances are the same as the backend's (RoutePoint.distance), so the rider can be
// placed with telemetry total_dist modulo the route length, exactly like the game loop.

import {
    Mesh, VertexData, StandardMaterial, TransformNode,
    CreateBox, CreateCylinder, Vector3, Matrix, Quaternion, Color3
} from './babylon.js';
import { gradeColor } from './themes.js';

export const ROAD_WIDTH = 7;           // m
const EDGE_WIDTH = 0.3;                // grade-colored strip on each road edge
const TERRAIN_WIDTH = 60;              // m of terrain on each side of the road
const SHOULDER = 3;                    // m of flat shoulder before the terrain slopes
const CHUNK_SAMPLES = 250;             // samples per mesh chunk (frustum culling)
const MAX_SAMPLES = 20000;             // caps memory on very long routes
const APRON = 60;                      // m of extra road before/after open routes
const EARTH_R = 6371000;

// ---------------------------------------------------------------------------
// Route model
// ---------------------------------------------------------------------------

function boxSmooth(src, radius, passes) {
    let a = Float64Array.from(src);
    const n = a.length;
    for (let p = 0; p < passes; p++) {
        const out = new Float64Array(n);
        let sum = 0, count = 0;
        // Running window with clamped ends.
        for (let i = -radius; i <= radius; i++) { if (i >= 0 && i < n) { sum += a[i]; count++; } }
        for (let i = 0; i < n; i++) {
            out[i] = sum / count;
            const drop = i - radius, add = i + radius + 1;
            if (drop >= 0) { sum -= a[drop]; count--; }
            if (add < n) { sum += a[add]; count++; }
        }
        a = out;
    }
    return a;
}

function normalizePoints(points) {
    if (!Array.isArray(points) || points.length < 2) return null;
    const pts = [];
    for (const p of points) {
        const lat = Number(p.lat ?? p.latitude), lon = Number(p.lon ?? p.longitude);
        const dist = Number(p.distance);
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(dist)) continue;
        if (pts.length && dist < pts[pts.length - 1].dist) continue;
        pts.push({
            lat, lon, dist,
            ele: Number(p.elevation ?? p.ele ?? 0) || 0,
            grade: Number(p.grade ?? 0) || 0
        });
    }
    if (pts.length < 2) return null;
    const total = pts[pts.length - 1].dist;
    const allZero = pts.every(p => p.lat === 0 && p.lon === 0);
    return total > 20 && !allZero ? pts : null;
}

export class RouteModel {
    /** @param {Array|null} points backend RoutePoints ({lat, lon, elevation, distance, grade}) */
    constructor(points) {
        const pts = normalizePoints(points);
        this.synthetic = !pts;
        if (pts) this._fromGPX(pts);
        else this._synthetic();
        this._derive();
    }

    _fromGPX(pts) {
        const total = pts[pts.length - 1].dist;
        const step = Math.max(2, total / MAX_SAMPLES);
        const n = Math.max(2, Math.floor(total / step) + 1);
        const lat0 = pts[0].lat, lon0 = pts[0].lon;
        const kLat = (Math.PI / 180) * EARTH_R;
        const kLon = kLat * Math.cos(lat0 * Math.PI / 180);

        const x = new Float64Array(n), z = new Float64Array(n), ele = new Float64Array(n), grade = new Float64Array(n);
        let j = 0;
        for (let i = 0; i < n; i++) {
            const s = Math.min(i * step, total);
            while (j < pts.length - 2 && pts[j + 1].dist < s) j++;
            const a = pts[j], b = pts[j + 1];
            const seg = b.dist - a.dist;
            const t = seg > 0 ? Math.min(1, Math.max(0, (s - a.dist) / seg)) : 0;
            // East = +x, north = +z (Babylon is left-handed with y up: map orientation, no mirroring).
            x[i] = (a.lon + (b.lon - a.lon) * t - lon0) * kLon;
            z[i] = (a.lat + (b.lat - a.lat) * t - lat0) * kLat;
            ele[i] = a.ele + (b.ele - a.ele) * t;
            grade[i] = a.grade + (b.grade - a.grade) * t;
        }
        this.length = total;
        this.step = step;
        // GPS noise makes the path zig-zag; ~10 m smoothing keeps the shape and removes jitter.
        this.x = boxSmooth(x, 2, 2);
        this.z = boxSmooth(z, 2, 2);
        // Elevation over ~40 m windows: no stair steps from coarse GPX altitude.
        const ys = boxSmooth(ele, Math.max(1, Math.round(20 / step)), 2);
        const y0 = ys[0];
        this.y = ys.map(v => v - y0);
        this.grade = grade;
    }

    // Fallback when no GPX is loaded (free ride / KOM with direct grade): gentle flat loop.
    _synthetic() {
        const step = 2, total = 4000, n = total / step + 1;
        const x = new Float64Array(n), z = new Float64Array(n);
        let px = 0, pz = 0;
        for (let i = 0; i < n; i++) {
            const s = i * step;
            const h = (2 * Math.PI * s) / total + 0.5 * Math.sin((6 * Math.PI * s) / total);
            x[i] = px; z[i] = pz;
            px += Math.sin(h) * step; pz += Math.cos(h) * step;
        }
        this.length = total;
        this.step = step;
        this.x = x; this.z = z;
        this.y = new Float64Array(n);
        this.grade = new Float64Array(n);
    }

    _derive() {
        const n = this.x.length, step = this.step;
        this.n = n;
        const h = new Float64Array(n);
        let prev = 0;
        for (let i = 0; i < n; i++) {
            const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
            let v = Math.atan2(this.x[b] - this.x[a], this.z[b] - this.z[a]);
            if (i > 0) { while (v - prev > Math.PI) v -= 2 * Math.PI; while (v - prev < -Math.PI) v += 2 * Math.PI; }
            h[i] = prev = v;
        }
        this.heading = h;
        // Curvature (rad/m): positive = turning right (heading grows clockwise seen from above).
        const k = new Float64Array(n);
        for (let i = 0; i < n; i++) {
            const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
            k[i] = (h[b] - h[a]) / (step * (b - a) || 1);
        }
        this.curvature = boxSmooth(k, 4, 2);
        let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (let i = 0; i < n; i++) {
            minY = Math.min(minY, this.y[i]); maxY = Math.max(maxY, this.y[i]);
            minX = Math.min(minX, this.x[i]); maxX = Math.max(maxX, this.x[i]);
            minZ = Math.min(minZ, this.z[i]); maxZ = Math.max(maxZ, this.z[i]);
        }
        this.bounds = { minX, maxX, minY, maxY, minZ, maxZ };
        // Circuits (start ≈ end) wrap seamlessly; open routes must not wrap for the camera.
        this.closed = Math.hypot(this.x[n - 1] - this.x[0], this.z[n - 1] - this.z[0]) < 30;
    }

    /** Wraps a distance into [0, length), matching the backend's math.Mod on total_dist. */
    wrap(s) {
        const L = this.length;
        return ((s % L) + L) % L;
    }

    /**
     * Samples the route at distance s (meters, wrapped).
     * out: {x, y, z, heading, grade, curvature}
     */
    sample(s, out = {}) {
        const f = this.wrap(s) / this.step;
        let i = Math.floor(f);
        if (i >= this.n - 1) i = this.n - 2;
        const t = Math.min(1, Math.max(0, f - i));
        const L = (arr) => arr[i] + (arr[i + 1] - arr[i]) * t;
        out.x = L(this.x); out.y = L(this.y); out.z = L(this.z);
        out.heading = L(this.heading);
        out.grade = L(this.grade);
        out.curvature = L(this.curvature);
        return out;
    }

    /**
     * Like sample(), but on open routes a distance before the start or past the end is
     * extrapolated straight along the first/last heading instead of wrapping to the other
     * end of the route (used by the camera, which looks behind/ahead of the rider).
     */
    sampleOpen(s, out = {}) {
        // s == length must not reach sample(): wrap() would send it back to 0 m.
        if (this.closed || (s >= 0 && s < this.length)) return this.sample(s, out);
        const edge = s < 0 ? 0 : this.length;
        const extra = s - edge;
        this.sample(edge === 0 ? 0 : this.length - 1e-6, out);
        out.x += Math.sin(out.heading) * extra;
        out.z += Math.cos(out.heading) * extra;
        out.curvature = 0;
        return out;
    }
}

// ---------------------------------------------------------------------------
// Spatial index of route samples (prop rejection and terrain width limits)
// ---------------------------------------------------------------------------

const CELL = 20;
function buildGrid(model) {
    const grid = new Map();
    for (let i = 0; i < model.n; i++) {
        const key = Math.floor(model.x[i] / CELL) * 100003 + Math.floor(model.z[i] / CELL);
        let list = grid.get(key);
        if (!list) grid.set(key, (list = []));
        list.push(i);
    }
    return grid;
}

function forNear(grid, x, z, radius, fn) {
    const c0x = Math.floor((x - radius) / CELL), c1x = Math.floor((x + radius) / CELL);
    const c0z = Math.floor((z - radius) / CELL), c1z = Math.floor((z + radius) / CELL);
    for (let cx = c0x; cx <= c1x; cx++) {
        for (let cz = c0z; cz <= c1z; cz++) {
            const list = grid.get(cx * 100003 + cz);
            if (list) for (const i of list) fn(i);
        }
    }
}

function nearRoad(model, grid, x, z, clearance) {
    const c2 = clearance * clearance;
    let hit = false;
    forNear(grid, x, z, clearance, (i) => {
        if (!hit) {
            const dx = model.x[i] - x, dz = model.z[i] - z;
            if (dx * dx + dz * dz < c2) hit = true;
        }
    });
    return hit;
}

// Terrain width per side, limited so the strips never fold over the road on tight
// curves (inner side) or cover another stretch of the same road (switchbacks, loops).
function terrainWidths(model, grid) {
    const n = model.n;
    const wl = new Float64Array(n).fill(TERRAIN_WIDTH), wr = new Float64Array(n).fill(TERRAIN_WIDTH);
    const half = ROAD_WIDTH / 2;
    const localSamples = Math.ceil(80 / model.step);
    const probe = TERRAIN_WIDTH * 2 + ROAD_WIDTH;
    for (let i = 0; i < n; i++) {
        const k = model.curvature[i];
        if (Math.abs(k) > 1e-4) {
            const lim = Math.max(1, 0.85 / Math.abs(k) - half);
            if (k > 0) wr[i] = Math.min(wr[i], lim); else wl[i] = Math.min(wl[i], lim);
        }
        if (i % 2) continue; // every other sample is enough; smoothing fills the gaps
        const px = model.x[i], pz = model.z[i];
        const nx = Math.cos(model.heading[i]), nz = -Math.sin(model.heading[i]);
        forNear(grid, px, pz, probe, (j) => {
            let ds = Math.abs(j - i);
            ds = Math.min(ds, n - ds); // closed loops: the start is "local" to the end
            if (ds <= localSamples) return;
            const dx = model.x[j] - px, dz = model.z[j] - pz;
            const d = Math.sqrt(dx * dx + dz * dz);
            const lim = Math.max(1, d / 2 - half - 1);
            if (dx * nx + dz * nz >= 0) { if (lim < wr[i]) wr[i] = lim; } else if (lim < wl[i]) wl[i] = lim;
        });
        if (i + 1 < n) { wl[i + 1] = Math.min(wl[i + 1], wl[i]); wr[i + 1] = Math.min(wr[i + 1], wr[i]); }
    }
    // Min-filter then average: the limit reaches a bit before/after the pinch point.
    const minFilter = (a, r) => {
        const out = new Float64Array(n);
        for (let i = 0; i < n; i++) {
            let m = Infinity;
            for (let j = Math.max(0, i - r); j <= Math.min(n - 1, i + r); j++) m = Math.min(m, a[j]);
            out[i] = m;
        }
        return out;
    };
    const r = Math.max(3, Math.round(25 / model.step));
    return { wl: boxSmooth(minFilter(wl, r), r, 1), wr: boxSmooth(minFilter(wr, r), r, 1) };
}

// Smooth world-space noise in [0, 1] for low-poly hills (same value wherever strips overlap).
function hillNoise(x, z) {
    const v = Math.sin(x * 0.013 + 1.3) + Math.sin(z * 0.011 + 0.7) + Math.sin((x + z) * 0.0071) + Math.sin((x - z) * 0.019) * 0.5;
    return Math.max(0, v / 3.5 + 0.35);
}

// Terrain profile across the road: [lateral offset from road edge, height offset].
function farHeight(yRoad, x, z, hills) {
    return yRoad - 1.2 + hills * hillNoise(x, z);
}

function terrainY(yRoad, off, width, yFar) {
    const sh = Math.min(SHOULDER, width * 0.5);
    if (off <= sh) return yRoad - 0.03 - (0.22 * off) / sh;
    const t = Math.min(1, (off - sh) / Math.max(0.01, width - sh));
    return yRoad - 0.25 + (yFar - (yRoad - 0.25)) * t;
}

// ---------------------------------------------------------------------------
// Mesh helpers
// ---------------------------------------------------------------------------

function makeMesh(name, scene, positions, indices, colors) {
    const mesh = new Mesh(name, scene);
    const vd = new VertexData();
    vd.positions = positions;
    vd.indices = indices;
    vd.colors = colors;
    const normals = [];
    VertexData.ComputeNormals(positions, indices, normals);
    // Our quads are wound consistently; flip once if the normals point down.
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

function stripIndices(indices, samples, cols, pairs) {
    for (let i = 0; i < samples - 1; i++) {
        for (const [c0, c1] of pairs) {
            const a = i * cols + c0, b = i * cols + c1, c = (i + 1) * cols + c0, d = (i + 1) * cols + c1;
            indices.push(a, c, b, b, c, d);
        }
    }
}

function material(scene, name, hex, { emissive = false, emissiveScale = 1, vertexColors = false } = {}) {
    const m = new StandardMaterial(name, scene);
    const c = Color3.FromHexString(hex);
    m.diffuseColor = vertexColors ? Color3.White() : c;
    m.specularColor = Color3.Black();
    if (emissive) {
        m.emissiveColor = vertexColors ? Color3.White() : c.scale(emissiveScale);
        m.disableLighting = emissiveScale >= 1;
    }
    m.backFaceCulling = false;
    return m;
}

function thinInstances(mesh, matrices) {
    if (!matrices.length) { mesh.setEnabled(false); return mesh; }
    const buf = new Float32Array(matrices.length * 16);
    matrices.forEach((m, i) => m.copyToArray(buf, i * 16));
    mesh.thinInstanceSetBuffer('matrix', buf, 16, true);
    mesh.isPickable = false;
    return mesh;
}

function seededRandom(seed) {
    let s = seed % 2147483647 || 1;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const _q = new Quaternion();
function placement(x, y, z, yaw, sx, sy, sz, pitch = 0) {
    Quaternion.RotationYawPitchRollToRef(yaw, pitch, 0, _q);
    return Matrix.Compose(new Vector3(sx, sy, sz), _q.clone(), new Vector3(x, y, z));
}

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------

export function buildRouteWorld(scene, model, theme) {
    const grid = buildGrid(model);
    const { wl, wr } = terrainWidths(model, grid);
    const half = ROAD_WIDTH / 2;
    const n = model.n;
    const ground = Color3.FromHexString(theme.ground);
    const asphalt = Color3.FromHexString(theme.asphalt);
    const hills = theme.hills ?? 0;

    const roadMat = material(scene, 'road-terrain', '#ffffff', { vertexColors: true });
    const edgeMat = material(scene, 'road-edge', '#ffffff', { vertexColors: true, emissive: theme.edgeEmissive });
    roadMat.zOffset = 0;
    edgeMat.zOffset = -2; // edges win depth ties against the asphalt

    // Per-sample cross-section (8 vertices): farL, shoulderL, edgeL(terrain), edgeL(road),
    // edgeR(road), edgeR(terrain), shoulderR, farR.
    // One mesh pair (terrain+road, grade edges) per list of cross-sections.
    const emitStrip = (name, sections) => {
        const pos = [], col = [], idx = [];
        const epos = [], ecol = [], eidx = [];
        for (const { x, y, z, heading, grade, left, right } of sections) {
            const nx = Math.cos(heading), nz = -Math.sin(heading); // right-hand normal
            const tone = 0.92 + 0.16 * hillNoise(x * 3.1, z * 3.1);
            const gc = ground.scale(tone);
            const xfL = x - nx * (half + left), zfL = z - nz * (half + left);
            const xfR = x + nx * (half + right), zfR = z + nz * (half + right);
            const yfL = farHeight(y, xfL, zfL, hills), yfR = farHeight(y, xfR, zfR, hills);
            const shL = Math.min(SHOULDER, left * 0.5), shR = Math.min(SHOULDER, right * 0.5);
            const verts = [
                [xfL, yfL, zfL, gc],
                [x - nx * (half + shL), y - 0.25, z - nz * (half + shL), gc],
                [x - nx * half, y - 0.03, z - nz * half, gc],
                [x - nx * half, y + 0.02, z - nz * half, asphalt],
                [x + nx * half, y + 0.02, z + nz * half, asphalt],
                [x + nx * half, y - 0.03, z + nz * half, gc],
                [x + nx * (half + shR), y - 0.25, z + nz * (half + shR), gc],
                [xfR, yfR, zfR, gc]
            ];
            for (const [vx, vy, vz, c] of verts) { pos.push(vx, vy, vz); col.push(c.r, c.g, c.b, 1); }

            const g = gradeColor(grade);
            const ew = half - EDGE_WIDTH;
            for (const off of [-half, -ew, ew, half]) {
                epos.push(x + nx * off, y + 0.03, z + nz * off);
                ecol.push(g.r, g.g, g.b, 1);
            }
        }
        stripIndices(idx, sections.length, 8, [[0, 1], [1, 2], [3, 4], [5, 6], [6, 7]]);
        stripIndices(eidx, sections.length, 4, [[0, 1], [2, 3]]);
        makeMesh(`road-${name}`, scene, pos, idx, col).material = roadMat;
        makeMesh(`edge-${name}`, scene, epos, eidx, ecol).material = edgeMat;
    };

    const atSample = (i) => ({
        x: model.x[i], y: model.y[i], z: model.z[i], heading: model.heading[i],
        grade: model.grade[i], left: wl[i], right: wr[i]
    });
    for (let c0 = 0; c0 < n - 1; c0 += CHUNK_SAMPLES) {
        const sections = [];
        for (let i = c0; i <= Math.min(n - 1, c0 + CHUNK_SAMPLES); i++) sections.push(atSample(i));
        emitStrip(c0, sections);
    }

    // Open routes: straight road "aprons" before the start and after the end, so the
    // chase camera (behind the rider at 0 m) never looks at the bare ground plane.
    if (!model.closed) {
        const apron = (from, to, widthIdx) => {
            const sections = [];
            for (let s = from; s <= to + 1e-6; s += 2) {
                const p = model.sampleOpen(s);
                sections.push({ ...p, grade: 0, left: wl[widthIdx], right: wr[widthIdx] });
            }
            return sections;
        };
        emitStrip('apron-start', apron(-APRON, 0, 0));
        emitStrip('apron-end', apron(model.length, model.length + APRON, n - 1));
    }

    // Ground plane under the terrain strips. The caller moves it with the camera (it would
    // sit hundreds of meters below on long descents if it stayed at the route minimum).
    const plane = CreateBox('ground-plane', { width: 1, height: 1, depth: 1 }, scene);
    plane.scaling.set(6000, 0.2, 6000);
    plane.position.y = model.bounds.minY - 4;
    plane.material = material(scene, 'ground-plane', theme.ground);
    plane.isPickable = false;
    plane.alwaysSelectAsActiveMesh = true;

    buildLaneDashes(scene, model, theme);
    buildProps(scene, model, theme, grid, wl, wr);
    buildKmMarkers(scene, model, theme);
    return { groundPlane: plane };
}

function buildLaneDashes(scene, model, theme) {
    const dash = CreateBox('lane-dash', { width: 0.14, height: 0.02, depth: 3 }, scene);
    dash.material = material(scene, 'lane', theme.laneLine, { emissive: theme.edgeEmissive, emissiveScale: 1 });
    const mats = [];
    for (let s = 4; s < model.length - 2; s += 9) {
        const p = model.sample(s);
        mats.push(placement(p.x, p.y + 0.035, p.z, p.heading, 1, 1, 1, -Math.atan(p.grade / 100)));
    }
    thinInstances(dash, mats);
}

function buildKmMarkers(scene, model, theme) {
    if (model.length < 1500) return;
    const bar = CreateBox('km-marker', { size: 1 }, scene);
    bar.material = material(scene, 'km-marker', theme.markerColor, { emissive: true, emissiveScale: theme.edgeEmissive ? 1 : 0.25 });
    const mats = [];
    const half = ROAD_WIDTH / 2;
    for (let s = 1000; s < model.length - 50; s += 1000) {
        const p = model.sample(s);
        const nx = Math.cos(p.heading), nz = -Math.sin(p.heading);
        for (const side of [-1, 1]) {
            const ox = p.x + nx * side * (half + 0.6), oz = p.z + nz * side * (half + 0.6);
            mats.push(placement(ox, p.y + 2.6, oz, p.heading, 0.3, 5.2, 0.3));
        }
        mats.push(placement(p.x, p.y + 5.2, p.z, p.heading, ROAD_WIDTH + 1.5, 0.45, 0.35));
    }
    thinInstances(bar, mats);
}

function buildProps(scene, model, theme, grid, wl, wr) {
    const rnd = seededRandom(Math.round(model.length) + 7);
    const half = ROAD_WIDTH / 2;
    const hills = theme.hills ?? 0;
    const maxProps = 6000;

    // Ground height at lateral offset `off` (from road edge) on one side of sample i.
    const groundAt = (i, side, off) => {
        const w = side > 0 ? wr[i] : wl[i];
        const nx = Math.cos(model.heading[i]), nz = -Math.sin(model.heading[i]);
        const y = model.y[i];
        const xf = model.x[i] + nx * side * (half + w), zf = model.z[i] + nz * side * (half + w);
        return terrainY(y, off, w, farHeight(y, xf, zf, hills));
    };

    // Picks a spot `off` meters from the road edge; null if it lands on another stretch of road.
    const spot = (i, side, off, clearance) => {
        const w = side > 0 ? wr[i] : wl[i];
        if (off > w - 1) return null;
        const nx = Math.cos(model.heading[i]), nz = -Math.sin(model.heading[i]);
        const x = model.x[i] + nx * side * (half + off), z = model.z[i] + nz * side * (half + off);
        if (nearRoad(model, grid, x, z, half + clearance)) return null;
        return { x, z, y: groundAt(i, side, off) };
    };

    const every = (meters) => Math.max(1, Math.round(meters / model.step));

    if (theme.props === 'trees') {
        const crown = CreateCylinder('tree-crown', { diameterTop: 0, diameterBottom: 2.6, height: 4.2, tessellation: 6 }, scene);
        crown.bakeTransformIntoVertices(Matrix.Translation(0, 1.1 + 2.1, 0));
        crown.material = material(scene, 'tree-crown', theme.propColor);
        const trunk = CreateCylinder('tree-trunk', { diameter: 0.35, height: 1.2, tessellation: 5 }, scene);
        trunk.bakeTransformIntoVertices(Matrix.Translation(0, 0.6, 0));
        trunk.material = material(scene, 'tree-trunk', theme.propColor2);
        const rock = CreateBox('rock', { size: 1 }, scene);
        rock.material = material(scene, 'rock', '#8a8f96');
        const trees = [], rocks = [];
        const stride = every(7);
        for (let i = 0; i < model.n && trees.length < maxProps; i += stride) {
            for (const side of [-1, 1]) {
                if (rnd() < 0.35) continue;
                const p = spot(i, side, 4 + Math.pow(rnd(), 1.6) * 45, 2.5);
                if (!p) continue;
                const s = 0.7 + rnd() * 0.9;
                trees.push(placement(p.x, p.y - 0.1, p.z, rnd() * 6.28, s, s * (0.85 + rnd() * 0.4), s));
            }
            if (rnd() < 0.08) {
                const side = rnd() < 0.5 ? -1 : 1;
                const p = spot(i, side, 2 + rnd() * 20, 1.5);
                if (p) {
                    const s = 0.4 + rnd() * 1.1;
                    rocks.push(placement(p.x, p.y + s * 0.2, p.z, rnd() * 6.28, s * 1.3, s * 0.8, s, rnd() * 0.5));
                }
            }
        }
        thinInstances(crown, trees);
        thinInstances(trunk, trees);
        thinInstances(rock, rocks);
    } else {
        // Neon posts along the road and dark blocks with glowing roof rims.
        const post = CreateBox('neon-post', { width: 0.12, height: 3, depth: 0.12 }, scene);
        post.bakeTransformIntoVertices(Matrix.Translation(0, 1.5, 0));
        post.material = material(scene, 'neon-post', theme.propColor, { emissive: true });
        const block = CreateBox('block', { size: 1 }, scene);
        block.bakeTransformIntoVertices(Matrix.Translation(0, 0.5, 0));
        const blockMat = material(scene, 'block', theme.ground);
        blockMat.diffuseColor = Color3.FromHexString(theme.ground).scale(1.6);
        block.material = blockMat;
        const rimA = CreateBox('rim-a', { size: 1 }, scene);
        rimA.material = material(scene, 'rim-a', theme.propColor, { emissive: true });
        const rimB = CreateBox('rim-b', { size: 1 }, scene);
        rimB.material = material(scene, 'rim-b', theme.markerColor, { emissive: true });

        const posts = [], blocks = [], rimsA = [], rimsB = [];
        const postStride = every(24);
        for (let i = 0; i < model.n && posts.length < maxProps; i += postStride) {
            for (const side of [-1, 1]) {
                const p = spot(i, side, 1.2, 0.5);
                if (p) posts.push(placement(p.x, p.y, p.z, 0, 1, 1, 1));
            }
        }
        const blockStride = every(28);
        for (let i = 0; i < model.n && blocks.length < maxProps / 2; i += blockStride) {
            for (const side of [-1, 1]) {
                if (rnd() < 0.4) continue;
                const off = 14 + rnd() * 40;
                const w = 6 + rnd() * 10, d = 6 + rnd() * 10, h = 5 + Math.pow(rnd(), 2) * 30;
                const p = spot(i, side, off, Math.max(w, d) / 2 + 3);
                if (!p) continue;
                const yaw = model.heading[i] + (rnd() - 0.5) * 0.3;
                blocks.push(placement(p.x, p.y - 0.5, p.z, yaw, w, h, d));
                (rnd() < 0.6 ? rimsA : rimsB).push(placement(p.x, p.y - 0.5 + h + 0.1, p.z, yaw, w + 0.3, 0.25, d + 0.3));
            }
        }
        thinInstances(post, posts);
        thinInstances(block, blocks);
        thinInstances(rimA, rimsA);
        thinInstances(rimB, rimsB);
    }
}

// Horizon ring (mountains by day, city by night). Not fogged: its color is pre-blended
// toward the fog color instead, so it reads as distant. The caller keeps it centered
// on the camera so it behaves like a skybox.
export function buildSkyline(scene, theme) {
    const root = new TransformNode('skyline', scene);
    const rnd = seededRandom(1234);
    const fog = Color3.FromHexString(theme.fog);
    const tint = (hex, k) => Color3.Lerp(Color3.FromHexString(hex), fog, k);

    const mat = (name, color, emissive) => {
        const m = new StandardMaterial(name, scene);
        m.diffuseColor = color;
        m.specularColor = Color3.Black();
        m.emissiveColor = emissive ? color : color.scale(0.55);
        m.disableLighting = true;
        m.fogEnabled = false;
        return m;
    };

    if (theme.skyline === 'mountains') {
        // Separate meshes, not clone(): thin-instance buffers live on the (shared) geometry.
        const cone = (id) => {
            const m = CreateCylinder(id, { diameterTop: 0, diameterBottom: 2, height: 1, tessellation: 5 }, scene);
            m.bakeTransformIntoVertices(Matrix.Translation(0, 0.5, 0));
            return m;
        };
        const peak = cone('mountain');
        peak.material = mat('mountain', tint(theme.skylineColor, 0.35));
        const cap = cone('mountain-cap');
        cap.material = mat('mountain-cap', tint(theme.skylineAccent, 0.15));
        const peaks = [], caps = [];
        for (let i = 0; i < 46; i++) {
            const a = (i / 46) * Math.PI * 2 + rnd() * 0.1;
            const r = 1300 + rnd() * 300;
            const h = 120 + rnd() * 320, base = 200 + rnd() * 260;
            const x = Math.sin(a) * r, z = Math.cos(a) * r, yaw = rnd() * 6.28;
            peaks.push(placement(x, -40, z, yaw, base, h, base));
            if (h > 260) caps.push(placement(x, -40 + h * 0.72, z, yaw, base * 0.285, h * 0.285, base * 0.285));
        }
        for (const m of [peak, cap]) { m.parent = root; m.isPickable = false; m.applyFog = false; }
        thinInstances(peak, peaks);
        thinInstances(cap, caps);
    } else {
        const tower = CreateBox('tower', { size: 1 }, scene);
        tower.bakeTransformIntoVertices(Matrix.Translation(0, 0.5, 0));
        tower.material = mat('tower', tint(theme.skylineColor, 0.2));
        const top = CreateBox('tower-top', { size: 1 }, scene);
        top.material = mat('tower-top', tint(theme.skylineAccent, 0.35), true);
        const towers = [], tops = [];
        for (let i = 0; i < 140; i++) {
            const a = (i / 140) * Math.PI * 2 + rnd() * 0.04;
            const r = 1250 + rnd() * 350;
            const w = 30 + rnd() * 80, h = 50 + Math.pow(rnd(), 1.5) * 260;
            const x = Math.sin(a) * r, z = Math.cos(a) * r;
            towers.push(placement(x, -30, z, a, w, h, w * 0.8));
            if (rnd() < 0.5) tops.push(placement(x, -30 + h + 2, z, a, w + 2, 3, w * 0.8 + 2));
        }
        for (const m of [tower, top]) { m.parent = root; m.isPickable = false; m.applyFog = false; }
        thinInstances(tower, towers);
        thinInstances(top, tops);
    }
    return root;
}
