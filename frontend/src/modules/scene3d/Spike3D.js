// Argus Cyclist - Virtual Cycling Environment for interactive bicycling experiments.
// Copyright (C) 2026  Paulo Sérgio
// SPDX-License-Identifier: GPL-3.0-or-later
//
// F0 spike: performance test scene for Babylon.js inside the Wails WebView.
// Opens with Ctrl+Shift+3 (or automatically when VITE_SPIKE3D_AUTO=1, which also
// runs a benchmark across configurations and logs the results to the Wails terminal).
// This file is a throwaway benchmark: the real renderer is built in F1.

import {
    Engine, Scene, Color3, Color4, Vector3, Matrix, Quaternion,
    MeshBuilder, StandardMaterial, TransformNode, FreeCamera,
    HemisphericLight, DirectionalLight, GlowLayer, SceneInstrumentation
} from '@babylonjs/core';

const ROUTE_LEN = 3000;   // m
const STEP = 2;           // m
const ROAD_W = 6;         // m

// Same grade scale as MapController (route colors), with a visible color above 15%.
const GRADE_STOPS = [
    [-10, '#2ecc71'], [0, '#2ecc71'], [3, '#f1c40f'], [6, '#e67e22'],
    [9, '#e74c3c'], [12, '#8e44ad'], [15, '#4a0e6e']
];

function gradeColor(g) {
    if (g <= GRADE_STOPS[0][0]) return Color3.FromHexString(GRADE_STOPS[0][1]);
    for (let i = 1; i < GRADE_STOPS.length; i++) {
        const [g1, c1] = GRADE_STOPS[i];
        const [g0, c0] = GRADE_STOPS[i - 1];
        if (g <= g1) {
            return Color3.Lerp(Color3.FromHexString(c0), Color3.FromHexString(c1), (g - g0) / (g1 - g0));
        }
    }
    return Color3.FromHexString(GRADE_STOPS[GRADE_STOPS.length - 1][1]);
}

const THEMES = {
    night: {
        sky: '#070b1e', fog: '#1a0f3a', fogDensity: 0.006,
        ground: '#0b1030', asphalt: '#15182a', prop: '#00e5ff', gate: '#ff2bd6',
        hemi: 0.35, sun: 0.0, glow: true
    },
    day: {
        sky: '#8ec9f0', fog: '#cfe6f5', fogDensity: 0.0035,
        ground: '#5f9e4f', asphalt: '#3a3d45', prop: '#2f6b35', gate: '#ff6a00',
        hemi: 0.75, sun: 0.9, glow: false
    }
};

function buildRoute() {
    const pts = [];
    let x = 0, z = 0;
    for (let s = 0; s <= ROUTE_LEN; s += STEP) {
        const heading = 0.6 * Math.sin(s / 300) + 0.3 * Math.sin(s / 97);
        const y = 15 * Math.sin(s / 400) + 5 * Math.sin(s / 130);
        pts.push({ s, x, y, z, heading });
        x += Math.sin(heading) * STEP;
        z += Math.cos(heading) * STEP;
    }
    for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        pts[i].grade = ((b.y - a.y) / (b.s - a.s || 1)) * 100;
    }
    return pts;
}

function sampleRoute(pts, s) {
    s = ((s % ROUTE_LEN) + ROUTE_LEN) % ROUTE_LEN;
    const i = Math.min(pts.length - 2, Math.floor(s / STEP));
    const a = pts[i], b = pts[i + 1], t = (s - a.s) / STEP;
    const pos = new Vector3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
    const fwd = new Vector3(b.x - a.x, b.y - a.y, b.z - a.z).normalize();
    return { pos, fwd, heading: a.heading + (b.heading - a.heading) * t, grade: a.grade };
}

// ---------- Cyclist with 2-bone IK legs ----------
function buildCyclist(scene, name, jerseyHex, alpha) {
    const root = new TransformNode(name, scene);
    const mat = (hex) => {
        const m = new StandardMaterial(`${name}-m-${hex}`, scene);
        m.diffuseColor = Color3.FromHexString(hex);
        m.specularColor = new Color3(0.1, 0.1, 0.1);
        if (alpha < 1) { m.alpha = alpha; m.emissiveColor = Color3.FromHexString(hex).scale(0.6); }
        return m;
    };
    const frameMat = mat('#d0d4dc'), tireMat = mat('#111111'), jersey = mat(jerseyHex), skin = mat('#e0b48c');

    const wheelR = 0.34;
    const mkWheel = (z) => {
        const w = MeshBuilder.CreateTorus(`${name}-wheel`, { diameter: wheelR * 2, thickness: 0.035, tessellation: 24 }, scene);
        w.rotation.z = Math.PI / 2; w.position.set(0, wheelR, z); w.material = tireMat; w.parent = root;
        return w;
    };
    const wheels = [mkWheel(-0.5), mkWheel(0.5)];

    const tube = (from, to, d, m) => {
        const t = MeshBuilder.CreateTube(`${name}-tube`, { path: [from, to], radius: d, tessellation: 6 }, scene);
        t.material = m; t.parent = root; return t;
    };
    const bb = new Vector3(0, 0.3, -0.05), seat = new Vector3(0, 0.95, -0.22), head = new Vector3(0, 0.92, 0.42);
    tube(new Vector3(0, wheelR, -0.5), bb, 0.018, frameMat);
    tube(bb, seat, 0.02, frameMat);
    tube(seat, head, 0.02, frameMat);
    tube(bb, head, 0.022, frameMat);
    tube(head, new Vector3(0, wheelR, 0.5), 0.018, frameMat);

    const torso = MeshBuilder.CreateCapsule(`${name}-torso`, { radius: 0.13, height: 0.62 }, scene);
    torso.material = jersey; torso.parent = root;
    torso.position.set(0, 1.22, 0.05); torso.rotation.x = 1.0;
    const headM = MeshBuilder.CreateSphere(`${name}-head`, { diameter: 0.22, segments: 8 }, scene);
    headM.material = skin; headM.parent = root; headM.position.set(0, 1.42, 0.38);
    const helmet = MeshBuilder.CreateSphere(`${name}-helmet`, { diameter: 0.25, segments: 8, slice: 0.5 }, scene);
    helmet.material = jersey; helmet.parent = root; helmet.position.set(0, 1.45, 0.37);

    // Legs: thigh + shin per side, positioned each frame by IK from the crank angle.
    const L1 = 0.44, L2 = 0.43, CRANK = 0.17;
    const hip = new Vector3(0, 0.98, -0.18);
    const legs = [-1, 1].map((side) => ({
        side,
        thigh: MeshBuilder.CreateCylinder(`${name}-thigh`, { height: L1, diameter: 0.12, tessellation: 8 }, scene),
        shin: MeshBuilder.CreateCylinder(`${name}-shin`, { height: L2, diameter: 0.09, tessellation: 8 }, scene)
    }));
    legs.forEach((l) => { l.thigh.material = jersey; l.shin.material = skin; l.thigh.parent = root; l.shin.parent = root; });

    const placeBone = (mesh, a, b) => {
        mesh.position.copyFrom(a.add(b).scale(0.5));
        const dir = b.subtract(a).normalize();
        mesh.rotationQuaternion = Quaternion.FromUnitVectorsToRef(Vector3.Up(), dir, new Quaternion());
    };

    let crank = 0;
    return {
        root,
        update(dt, speedMs, cadenceRpm) {
            crank += (cadenceRpm / 60) * 2 * Math.PI * dt;
            wheels.forEach((w) => { w.rotation.x += (speedMs / wheelR) * dt; });
            for (const l of legs) {
                const a = crank + (l.side > 0 ? 0 : Math.PI);
                const x = l.side * 0.11;
                const pedal = new Vector3(x, bb.y + Math.sin(a) * CRANK, bb.z + Math.cos(a) * CRANK);
                const h = new Vector3(x, hip.y, hip.z);
                const d = Math.min(L1 + L2 - 1e-3, Vector3.Distance(h, pedal));
                // Law of cosines: angle at hip between hip→pedal and thigh.
                const cosA = (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d);
                const ang = Math.acos(Math.max(-1, Math.min(1, cosA)));
                const toPedal = pedal.subtract(h).normalize();
                // Rotate in the sagittal (y,z) plane; knee bends forward (+z).
                const base = Math.atan2(toPedal.z, -toPedal.y);
                const kAng = base + ang;
                const knee = new Vector3(x, h.y - Math.cos(kAng) * L1, h.z + Math.sin(kAng) * L1);
                placeBone(l.thigh, h, knee);
                placeBone(l.shin, knee, pedal);
            }
        }
    };
}

// ---------- World ----------
function buildWorld(scene, pts, theme) {
    const t = THEMES[theme];
    const left = [], right = [], farL = [], farR = [], colors = [];
    for (const p of pts) {
        const nx = Math.cos(p.heading), nz = -Math.sin(p.heading); // right-hand normal
        left.push(new Vector3(p.x - nx * ROAD_W / 2, p.y + 0.02, p.z - nz * ROAD_W / 2));
        right.push(new Vector3(p.x + nx * ROAD_W / 2, p.y + 0.02, p.z + nz * ROAD_W / 2));
        farL.push(new Vector3(p.x - nx * 80, p.y - 3, p.z - nz * 80));
        farR.push(new Vector3(p.x + nx * 80, p.y - 3, p.z + nz * 80));
    }

    const asphalt = new StandardMaterial('asphalt', scene);
    asphalt.diffuseColor = Color3.FromHexString(t.asphalt);
    asphalt.specularColor = new Color3(0.05, 0.05, 0.05);
    MeshBuilder.CreateRibbon('road', { pathArray: [left, right] }, scene).material = asphalt;

    // Grade-colored edge strips (emissive → glow at night).
    const edgeMat = new StandardMaterial('edge', scene);
    edgeMat.disableLighting = true;
    edgeMat.emissiveColor = Color3.White();
    for (const side of [left, right]) {
        const inner = side.map((v, i) => Vector3.Lerp(v, (side === left ? right : left)[i], 0.06).addInPlaceFromFloats(0, 0.01, 0));
        const cols = [];
        for (let k = 0; k < 2; k++) for (const p of pts) { const c = gradeColor(p.grade); cols.push(new Color4(c.r, c.g, c.b, 1)); }
        const strip = MeshBuilder.CreateRibbon('edge', { pathArray: [side.map(v => v.add(new Vector3(0, 0.01, 0))), inner], colors: cols }, scene);
        strip.material = edgeMat;
    }

    const groundMat = new StandardMaterial('ground', scene);
    groundMat.diffuseColor = Color3.FromHexString(t.ground);
    groundMat.specularColor = Color3.Black();
    MeshBuilder.CreateRibbon('terrainL', { pathArray: [farL, left] }, scene).material = groundMat;
    MeshBuilder.CreateRibbon('terrainR', { pathArray: [right, farR] }, scene).material = groundMat;

    // Instanced props: neon posts (night) or cone trees (day).
    const propMat = new StandardMaterial('prop', scene);
    propMat.diffuseColor = Color3.FromHexString(t.prop);
    if (theme === 'night') propMat.emissiveColor = Color3.FromHexString(t.prop);
    const prop = theme === 'night'
        ? MeshBuilder.CreateBox('post', { width: 0.15, depth: 0.15, height: 3 }, scene)
        : MeshBuilder.CreateCylinder('tree', { diameterTop: 0, diameterBottom: 2.2, height: 5, tessellation: 6 }, scene);
    prop.material = propMat;
    const mats = [];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < pts.length; i += theme === 'night' ? 10 : 4) {
        const p = pts[i];
        const nx = Math.cos(p.heading), nz = -Math.sin(p.heading);
        for (const side of [-1, 1]) {
            const off = theme === 'night' ? ROAD_W / 2 + 1 : ROAD_W / 2 + 6 + rnd() * 30;
            mats.push(Matrix.Translation(p.x + side * nx * off, p.y + (theme === 'night' ? 1.5 : 2.5), p.z + side * nz * off));
        }
    }
    const buf = new Float32Array(mats.length * 16);
    mats.forEach((m, i) => m.copyToArray(buf, i * 16));
    prop.thinInstanceSetBuffer('matrix', buf, 16);

    // Gates every 250 m (three boxes each, thin-instanced).
    const gateMat = new StandardMaterial('gate', scene);
    gateMat.diffuseColor = Color3.FromHexString(t.gate);
    gateMat.emissiveColor = Color3.FromHexString(t.gate).scale(theme === 'night' ? 1 : 0.2);
    const gate = MeshBuilder.CreateBox('gate', { size: 1 }, scene);
    gate.material = gateMat;
    const gm = [];
    for (let s = 250; s < ROUTE_LEN; s += 250) {
        const p = pts[Math.round(s / STEP)];
        const rot = Matrix.RotationY(p.heading);
        const at = (lx, ly, sx, sy, sz) =>
            Matrix.Scaling(sx, sy, sz).multiply(Matrix.Translation(lx, ly, 0)).multiply(rot).multiply(Matrix.Translation(p.x, p.y, p.z));
        gm.push(at(-ROAD_W / 2 - 0.4, 2.5, 0.3, 5, 0.3), at(ROAD_W / 2 + 0.4, 2.5, 0.3, 5, 0.3), at(0, 5, ROAD_W + 1.1, 0.35, 0.3));
    }
    const gbuf = new Float32Array(gm.length * 16);
    gm.forEach((m, i) => m.copyToArray(gbuf, i * 16));
    gate.thinInstanceSetBuffer('matrix', gbuf, 16);
}

// ---------- Spike lifecycle ----------
export class Spike3D {
    constructor() {
        this.overlay = null;
        this.engine = null;
        this.opts = { theme: 'night', glow: true, scaling: 1, aa: false };
    }

    open(opts = {}) {
        Object.assign(this.opts, opts);
        if (!this.overlay) {
            this.overlay = document.createElement('div');
            this.overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#000';
            this.overlay.innerHTML = '<canvas style="width:100%;height:100%;display:block;outline:none"></canvas>' +
                '<pre style="position:absolute;top:8px;left:8px;margin:0;padding:8px 10px;background:rgba(0,0,0,.6);' +
                'color:#0f0;font:12px monospace;pointer-events:none"></pre>';
            document.body.appendChild(this.overlay);
            this._onKey = (e) => this._key(e);
            window.addEventListener('keydown', this._onKey, true);
        }
        this._build();
    }

    close() {
        this._dispose();
        if (this.overlay) {
            window.removeEventListener('keydown', this._onKey, true);
            this.overlay.remove();
            this.overlay = null;
        }
    }

    _key(e) {
        const k = e.key.toLowerCase();
        if (k === 'escape') this.close();
        else if (k === 'n') { this.opts.theme = this.opts.theme === 'night' ? 'day' : 'night'; this.opts.glow = THEMES[this.opts.theme].glow; this._build(); }
        else if (k === 'g') { this.opts.glow = !this.opts.glow; this._build(); }
        else if (k === 's') { this.opts.scaling = this.opts.scaling >= 1.5 ? 1 : this.opts.scaling + 0.25; this.engine.setHardwareScalingLevel(this.opts.scaling); }
        else if (k === 'a') { this.opts.aa = !this.opts.aa; this._build(); }
        else return;
        e.stopPropagation(); e.preventDefault();
    }

    _dispose() {
        if (this._onResize) { window.removeEventListener('resize', this._onResize); this._onResize = null; }
        if (this.engine) { this.engine.stopRenderLoop(); this.engine.dispose(); this.engine = null; }
    }

    _build() {
        this._dispose();
        const canvas = this.overlay.querySelector('canvas');
        const statsEl = this.overlay.querySelector('pre');
        const o = this.opts, t = THEMES[o.theme];

        const engine = new Engine(canvas, o.aa, { preserveDrawingBuffer: false, stencil: false, powerPreference: 'high-performance' }, false);
        engine.setHardwareScalingLevel(o.scaling);
        this.engine = engine;

        const scene = new Scene(engine);
        scene.skipPointerMovePicking = true;
        scene.clearColor = Color4.FromHexString(t.sky + 'ff');
        scene.fogMode = Scene.FOGMODE_EXP2;
        scene.fogDensity = t.fogDensity;
        scene.fogColor = Color3.FromHexString(t.fog);
        scene.ambientColor = new Color3(0.3, 0.3, 0.3);

        const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
        hemi.intensity = t.hemi;
        if (t.sun > 0) { const sun = new DirectionalLight('sun', new Vector3(-0.4, -1, 0.3), scene); sun.intensity = t.sun; }
        if (o.glow) { const gl = new GlowLayer('glow', scene, { mainTextureRatio: 0.5, blurKernelSize: 32 }); gl.intensity = 0.8; }

        const pts = buildRoute();
        buildWorld(scene, pts, o.theme);

        const rider = buildCyclist(scene, 'rider', '#ff3b30', 1);
        const ghosts = [buildCyclist(scene, 'ghostA', '#00e5ff', 0.4), buildCyclist(scene, 'ghostB', '#ffd60a', 0.4)];

        const cam = new FreeCamera('cam', new Vector3(0, 3, -6), scene);
        cam.minZ = 0.1; cam.maxZ = 600; cam.fov = 0.9;

        const instr = new SceneInstrumentation(scene);
        instr.captureFrameTime = true;

        const state = { s: 20, v: 10, gs: [24, 14], gv: [9.6, 10.4] };
        const camPos = new Vector3(0, 3, -6);
        const place = (node, s, lateral) => {
            const smp = sampleRoute(pts, s);
            const nx = Math.cos(smp.heading), nz = -Math.sin(smp.heading);
            node.position.set(smp.pos.x + nx * lateral, smp.pos.y + 0.02, smp.pos.z + nz * lateral);
            node.rotation.y = smp.heading;
            node.rotation.x = -Math.atan(smp.grade / 100);
            return smp;
        };

        this.frames = 0;
        scene.onBeforeRenderObservable.add(() => {
            const dt = Math.min(0.05, engine.getDeltaTime() / 1000);
            state.s += state.v * dt;
            const smp = place(rider.root, state.s, 1.2);
            rider.update(dt, state.v, 90);
            ghosts.forEach((g, i) => { state.gs[i] += state.gv[i] * dt; place(g.root, state.gs[i], i ? -0.4 : 2.4); g.update(dt, state.gv[i], 85); });

            const target = smp.pos.add(smp.fwd.scale(-6.5)).addInPlaceFromFloats(0, 2.4, 0);
            Vector3.LerpToRef(camPos, target, Math.min(1, dt * 4), camPos);
            cam.position.copyFrom(camPos);
            cam.setTarget(smp.pos.add(smp.fwd.scale(5)).addInPlaceFromFloats(0, 1, 0));
            this.frames++;
        });

        let last = 0;
        engine.runRenderLoop(() => {
            scene.render();
            const now = performance.now();
            if (now - last > 500) {
                last = now;
                statsEl.textContent =
                    `FPS ${engine.getFps().toFixed(0)}  CPU frame ${instr.frameTimeCounter.lastSecAverage.toFixed(1)} ms\n` +
                    `draw calls ${instr.drawCallsCounter.current}  canvas ${canvas.width}x${canvas.height}\n` +
                    `theme ${o.theme}  glow ${o.glow}  scaling ${o.scaling}  aa ${o.aa}\n` +
                    `[N] tema  [G] glow  [S] escala  [A] antialias  [Esc] sair`;
            }
        });
        this._instr = instr;
        this._canvas = canvas;
        window.addEventListener('resize', this._onResize = () => engine.resize());
    }

    // Benchmark: runs each configuration for `secs` seconds and logs average FPS.
    async benchmark(secs = 12) {
        const configs = [
            { theme: 'night', glow: true, scaling: 1, aa: false },
            { theme: 'night', glow: false, scaling: 1, aa: false },
            { theme: 'day', glow: false, scaling: 1, aa: false },
            { theme: 'night', glow: true, scaling: 1.5, aa: false },
            { theme: 'night', glow: true, scaling: 1, aa: true },
            { theme: 'day', glow: false, scaling: 1, aa: true }
        ];
        const log = (msg) => { console.log(msg); window.runtime?.LogInfo?.(msg); };
        log(`[spike3d] start ua="${navigator.userAgent}" dpr=${window.devicePixelRatio}`);
        for (const c of configs) {
            this.open(c);
            await new Promise(r => setTimeout(r, 3000)); // warm-up
            const f0 = this.frames, t0 = performance.now();
            await new Promise(r => setTimeout(r, (secs - 3) * 1000));
            const fps = (this.frames - f0) / ((performance.now() - t0) / 1000);
            log(`[spike3d] ${JSON.stringify(c)} canvas=${this._canvas.width}x${this._canvas.height} ` +
                `fps=${fps.toFixed(1)} cpuFrameMs=${this._instr.frameTimeCounter.lastSecAverage.toFixed(1)} ` +
                `drawCalls=${this._instr.drawCallsCounter.current} renderer="${this.engine.getGlInfo().renderer}" webgl=${this.engine.webGLVersion} ` +
                `visible=${document.visibilityState} focus=${document.hasFocus()}`);
        }
        log('[spike3d] done');
    }
}
