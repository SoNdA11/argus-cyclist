// Argus Cyclist - Virtual Cycling Environment for interactive bicycling experiments.
// Copyright (C) 2026  Paulo Sérgio
// SPDX-License-Identifier: GPL-3.0-or-later
//
// 3D scene that follows the active ride. It consumes the same TelemetryEventBus as the
// HUD, so desktop (Wails) and Android (Capacitor) share it unchanged.
//
// F1: opened as a full-screen overlay with Ctrl+Shift+3 (the "3D" view tab comes in F2).
// Keys while open: N theme, F stats overlay, P demo ride, +/- demo speed, Esc close.
//
// Demo ride: on-screen buttons that make the rider pedal without a trainer or session.
// It feeds synthetic 1 Hz samples through the same interpolator as real telemetry.

import { Engine, Scene, Color3, Color4, Vector3, HemisphericLight, DirectionalLight, GlowLayer, SceneInstrumentation } from './babylon.js';
import { RouteModel, buildRouteWorld, buildSkyline } from './RouteMeshBuilder.js';
import { StateInterpolator } from './StateInterpolator.js';
import { CyclistRig } from './CyclistRig.js';
import { ChaseCamera } from './ChaseCamera.js';
import { THEMES, THEME_ORDER } from './themes.js';

const RIDER_LATERAL = 1.2;     // m right of the road center (right lane)
const THEME_KEY = 'argus.scene3d.theme';
const ADAPT_INTERVAL = 2000;   // ms between quality checks
const ADAPT_MIN_FPS = 45;
const MAX_SCALING = 1.5;
const DEMO_SPEEDS = [0, 10, 15, 20, 25, 30, 35, 40, 50, 60]; // km/h
const DEMO_DEFAULT = 4;                                       // index → 25 km/h

const DEMO_BTN = 'height:34px;width:34px;border:0;border-radius:8px;background:rgba(255,255,255,.15);' +
    'color:#fff;font:15px sans-serif;cursor:pointer;';

function loadTheme() {
    try {
        const t = localStorage.getItem(THEME_KEY);
        if (t && THEMES[t]) return t;
    } catch { /* storage unavailable */ }
    return 'night';
}

function saveTheme(t) {
    try { localStorage.setItem(THEME_KEY, t); } catch { /* storage unavailable */ }
}

export class Scene3DController {
    /**
     * @param {object} deps
     * @param {{subscribe: Function, unsubscribe: Function}} deps.bus telemetry bus
     * @param {() => Promise<Array>|Array} deps.getRoutePoints returns the active route points
     */
    constructor({ bus, getRoutePoints }) {
        this.bus = bus;
        this.getRoutePoints = getRoutePoints;
        this.theme = loadTheme();
        this.interp = new StateInterpolator();
        this.engine = null;
        this.scene = null;
        this.model = null;
        this.overlay = null;
        this.showStats = true;
        this.quality = { scaling: 1, glow: true, adjustments: 0 };
        this._routePoints = null;
        this.demo = { active: false, speedIdx: DEMO_DEFAULT, distance: 0, timer: null, last: 0 };
        this._onTelemetry = (d) => {
            if (this.demo.active) return; // the demo drives the rider while it runs
            this.interp.push(d);
            if (this._waitingEl) this._waitingEl.style.display = 'none';
        };
        this._onKey = (e) => this._key(e);
        this._onResize = () => this.engine?.resize();
        this._onVisibility = () => this._syncRenderLoop();
    }

    get isOpen() {
        return !!this.overlay;
    }

    async open() {
        if (this.isOpen) return;
        this._createOverlay();
        this._createEngine();
        this.bus.subscribe(this._onTelemetry);
        window.addEventListener('keydown', this._onKey, true);
        window.addEventListener('resize', this._onResize);
        document.addEventListener('visibilitychange', this._onVisibility);
        await this.refreshRoute();
        this._syncRenderLoop();
    }

    close() {
        if (!this.isOpen) return;
        this.stopDemo();
        this.bus.unsubscribe(this._onTelemetry);
        window.removeEventListener('keydown', this._onKey, true);
        window.removeEventListener('resize', this._onResize);
        document.removeEventListener('visibilitychange', this._onVisibility);
        this._disposeScene();
        // Releasing the engine frees the WebGL context (MapLibre keeps its own).
        this.engine.stopRenderLoop();
        this.engine.dispose();
        this.engine = null;
        this.overlay.remove();
        this.overlay = null;
        this._waitingEl = null;
        this._demoBtn = null;
        this._demoSpeedEl = null;
    }

    /** Re-reads the active route from the app and rebuilds the world if it changed. */
    async refreshRoute() {
        let points = null;
        try {
            points = await this.getRoutePoints();
        } catch (e) {
            console.warn('[scene3d] route unavailable, using demo loop', e);
        }
        this.setRoute(points);
    }

    /** Uses the given route points (null → demo loop). Rebuilds only on change. */
    setRoute(points) {
        const list = Array.isArray(points) && points.length > 1 ? points : null;
        if (this.model && this._sameRoute(list)) return;
        this._routePoints = list;
        this.model = new RouteModel(list);
        if (this.isOpen) this._buildScene();
    }

    _sameRoute(list) {
        const prev = this._routePoints;
        if (!prev || !list) return prev === list;
        if (prev.length !== list.length) return false;
        const a = prev[prev.length - 1], b = list[list.length - 1];
        return a.distance === b.distance && a.lat === b.lat && a.lon === b.lon && prev[0].lat === list[0].lat;
    }

    setTheme(name) {
        if (!THEMES[name] || name === this.theme) return;
        this.theme = name;
        saveTheme(name);
        if (this.isOpen) this._buildScene();
    }

    cycleTheme() {
        const i = THEME_ORDER.indexOf(this.theme);
        this.setTheme(THEME_ORDER[(i + 1) % THEME_ORDER.length]);
    }

    // ----- Demo ride (no trainer) -----

    toggleDemo() {
        if (this.demo.active) this.stopDemo();
        else this.startDemo();
    }

    startDemo() {
        if (this.demo.active) return;
        const d = this.demo;
        d.active = true;
        d.distance = this.interp.hasData ? this.interp.distance : 0;
        d.last = performance.now();
        if (this._waitingEl) this._waitingEl.style.display = 'none';
        this._pushDemoSample();
        d.timer = setInterval(() => this._pushDemoSample(), 1000);
        this._renderDemo();
    }

    stopDemo() {
        const d = this.demo;
        if (!d.active) return;
        clearInterval(d.timer);
        d.timer = null;
        d.active = false;
        // Brake to a stop where the demo left the rider; real telemetry takes over again.
        this.interp.push({ total_dist: d.distance, speed: 0, cadence: 0 });
        this._renderDemo();
    }

    changeDemoSpeed(delta) {
        const d = this.demo;
        d.speedIdx = Math.max(0, Math.min(DEMO_SPEEDS.length - 1, d.speedIdx + delta));
        if (!d.active && delta > 0) this.startDemo();
        this._renderDemo();
    }

    _demoCadence(kmh) {
        return kmh > 0 ? Math.min(105, 62 + kmh) : 0;
    }

    // Mimics the backend: integrates distance and emits one sample per second.
    _pushDemoSample() {
        const d = this.demo, now = performance.now();
        const kmh = DEMO_SPEEDS[d.speedIdx];
        d.distance += (kmh / 3.6) * ((now - d.last) / 1000);
        d.last = now;
        this.interp.push({ total_dist: d.distance, speed: kmh, cadence: this._demoCadence(kmh) }, now);
    }

    _renderDemo() {
        if (!this._demoBtn) return;
        const kmh = DEMO_SPEEDS[this.demo.speedIdx];
        this._demoBtn.textContent = this.demo.active ? '⏸ Parar demo' : '▶ Pedalar (demo)';
        this._demoSpeedEl.textContent = `${kmh} km/h · ${this._demoCadence(kmh)} rpm`;
    }

    /** Resolves with a JPEG data URL of the next rendered frame (diagnostics). */
    captureFrame(quality = 0.8) {
        return new Promise((resolve) => {
            if (!this.scene) { resolve(null); return; }
            this.scene.onAfterRenderObservable.addOnce(() => resolve(this.canvas.toDataURL('image/jpeg', quality)));
        });
    }

    getStats() {
        const instr = this._instr;
        return {
            fps: this.engine ? this.engine.getFps() : 0,
            cpuFrameMs: instr ? instr.frameTimeCounter.lastSecAverage : 0,
            drawCalls: instr ? instr.drawCallsCounter.current : 0,
            canvas: this.canvas ? `${this.canvas.width}x${this.canvas.height}` : '',
            theme: this.theme,
            scaling: this.quality.scaling,
            glow: !!this._glow,
            distance: this.interp.distance,
            speedKmh: this.interp.speed * 3.6,
            cadence: this.interp.cadence,
            routeLength: this.model ? this.model.length : 0,
            routeSamples: this.model ? this.model.n : 0,
            synthetic: this.model ? this.model.synthetic : true,
            interp: { ...this.interp.stats }
        };
    }

    // ------------------------------------------------------------------

    _createOverlay() {
        const el = document.createElement('div');
        el.className = 'scene3d-overlay';
        el.style.cssText = 'position:fixed;inset:0;z-index:9000;background:#000';
        el.innerHTML =
            '<canvas style="width:100%;height:100%;display:block;outline:none;touch-action:none"></canvas>' +
            '<pre data-role="stats" style="position:absolute;top:10px;left:10px;margin:0;padding:8px 10px;' +
            'background:rgba(0,0,0,.55);color:#9effa0;font:12px/1.35 monospace;border-radius:6px;pointer-events:none"></pre>' +
            '<div data-role="waiting" style="position:absolute;left:50%;bottom:48px;transform:translateX(-50%);' +
            'padding:10px 18px;border-radius:8px;background:rgba(0,0,0,.6);color:#fff;font:15px sans-serif;pointer-events:none">' +
            'Aguardando telemetria: inicie uma sessão para pedalar</div>' +
            '<div data-role="demo" style="position:absolute;right:16px;bottom:16px;display:flex;align-items:center;gap:6px;' +
            'padding:8px;border-radius:10px;background:rgba(0,0,0,.55);color:#fff;font:14px sans-serif">' +
            '<button data-act="toggle" title="Pedalar sem rolo (P)" style="' + DEMO_BTN + 'width:auto;padding:0 14px">▶ Pedalar (demo)</button>' +
            '<button data-act="slower" title="Mais devagar (-)" style="' + DEMO_BTN + '">−</button>' +
            '<span data-role="demo-speed" style="min-width:110px;text-align:center"></span>' +
            '<button data-act="faster" title="Mais rápido (+)" style="' + DEMO_BTN + '">+</button></div>' +
            '<button data-role="close" title="Fechar (Esc)" style="position:absolute;top:10px;right:10px;width:36px;height:36px;' +
            'border:0;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;font:20px sans-serif;cursor:pointer">×</button>';
        document.body.appendChild(el);
        el.querySelector('[data-role="close"]').addEventListener('click', () => this.close());
        el.querySelector('[data-act="toggle"]').addEventListener('click', () => this.toggleDemo());
        el.querySelector('[data-act="slower"]').addEventListener('click', () => this.changeDemoSpeed(-1));
        el.querySelector('[data-act="faster"]').addEventListener('click', () => this.changeDemoSpeed(1));
        this._demoBtn = el.querySelector('[data-act="toggle"]');
        this._demoSpeedEl = el.querySelector('[data-role="demo-speed"]');
        this._renderDemo();
        this.overlay = el;
        this.canvas = el.querySelector('canvas');
        this._statsEl = el.querySelector('[data-role="stats"]');
        this._waitingEl = this.interp.hasData ? null : el.querySelector('[data-role="waiting"]');
        if (!this._waitingEl) el.querySelector('[data-role="waiting"]').style.display = 'none';
    }

    _createEngine() {
        this.engine = new Engine(this.canvas, true, {
            preserveDrawingBuffer: false, stencil: false, powerPreference: 'high-performance'
        }, false);
        this.engine.setHardwareScalingLevel(this.quality.scaling);
    }

    _syncRenderLoop() {
        if (!this.engine) return;
        this.engine.stopRenderLoop();
        if (document.visibilityState === 'hidden' || !this.scene) return;
        this._lastAdapt = performance.now() + 3000; // let it warm up first
        this._lastStats = 0;
        this.engine.runRenderLoop(() => this._frame());
    }

    _key(e) {
        if (!this.isOpen) return;
        const k = e.key.toLowerCase();
        if (k === 'escape') this.close();
        else if (k === 'n' && !e.ctrlKey && !e.metaKey) this.cycleTheme();
        else if (k === 'p' && !e.ctrlKey && !e.metaKey) this.toggleDemo();
        else if ((k === '+' || k === '=') && !e.ctrlKey) this.changeDemoSpeed(1);
        else if (k === '-' && !e.ctrlKey) this.changeDemoSpeed(-1);
        else if (k === 'f' && !e.ctrlKey && !e.metaKey) {
            this.showStats = !this.showStats;
            this._statsEl.style.display = this.showStats ? '' : 'none';
        } else return;
        e.stopPropagation();
        e.preventDefault();
    }

    _disposeScene() {
        if (this.scene) {
            this.scene.dispose();
            this.scene = null;
        }
        this._glow = null;
        this._instr = null;
        this.rider = null;
        this.chase = null;
        this.skyline = null;
        this.groundPlane = null;
    }

    _buildScene() {
        this._disposeScene();
        const t = THEMES[this.theme];
        const scene = new Scene(this.engine);
        scene.skipPointerMovePicking = true;
        scene.autoClear = true;
        scene.clearColor = Color4.FromHexString(t.sky + 'ff');
        scene.fogMode = Scene.FOGMODE_EXP2;
        scene.fogDensity = t.fogDensity;
        scene.fogColor = Color3.FromHexString(t.fog);
        scene.ambientColor = new Color3(0.25, 0.25, 0.25);

        const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
        hemi.intensity = t.hemi;
        hemi.groundColor = Color3.FromHexString(t.hemiGround);
        if (t.sun > 0) {
            const sun = new DirectionalLight('sun', new Vector3(-0.45, -1, 0.3), scene);
            sun.intensity = t.sun;
        }

        this.groundPlane = buildRouteWorld(scene, this.model, t).groundPlane;
        this.skyline = buildSkyline(scene, t);
        this.rider = new CyclistRig(scene, { name: 'rider', jersey: t.rider.jersey, frame: t.rider.frame });
        this.chase = new ChaseCamera(scene, this.model);
        scene.activeCamera = this.chase.camera;

        if (t.glow && this.quality.glow) {
            const glow = new GlowLayer('glow', scene, { mainTextureRatio: 0.5, blurKernelSize: 32 });
            glow.intensity = t.glowIntensity;
            // Grade-colored edges use vertex colors, which the default glow pass ignores.
            for (const m of scene.meshes) if (m.name.startsWith('edge-')) glow.referenceMeshToUseItsOwnMaterial(m);
            this._glow = glow;
        }

        this._instr = new SceneInstrumentation(scene);
        this._instr.captureFrameTime = true;

        // Static world: skip per-frame bounding updates. The skyline follows the camera
        // and is always visible; the rider moves every frame.
        for (const m of scene.meshes) {
            if (m.isDescendantOf(this.skyline)) m.alwaysSelectAsActiveMesh = true;
            else if (m !== this.groundPlane && !m.isDescendantOf(this.rider.root)) m.doNotSyncBoundingInfo = true;
        }
        scene.executeWhenReady(() => { if (this.scene === scene) scene.freezeMaterials(); });

        this._pose = {};
        this.scene = scene;
        this.chase.reset(this.interp.distance, RIDER_LATERAL);
        this._placeRider(0);
        this._syncRenderLoop();
    }

    _placeRider(dt) {
        const pose = this.model.sample(this.interp.distance, this._pose);
        this.rider.update(dt, pose, RIDER_LATERAL, this.interp.speed, this.interp.cadence);
    }

    _frame() {
        const dt = Math.min(0.1, this.engine.getDeltaTime() / 1000);
        const now = performance.now();
        this.interp.update(dt, now);
        this._placeRider(dt);
        this.chase.update(dt, this.interp.distance, RIDER_LATERAL);
        const cam = this.chase.camera.position;
        this.skyline.position.set(cam.x, Math.max(this.model.bounds.minY, cam.y - 60), cam.z);
        // Ground follows the camera horizontally, 45 m below the rider (roads further below
        // are fogged anyway); at the route minimum it sits just under the terrain.
        this.groundPlane.position.set(cam.x, Math.max(this.model.bounds.minY - 4, this._pose.y - 45), cam.z);
        this.scene.render();

        if (now - this._lastAdapt > ADAPT_INTERVAL) this._adapt(now);
        if (this.showStats && now - this._lastStats > 500) {
            this._lastStats = now;
            this._renderStats();
        }
    }

    // Degrades quality when the GPU cannot keep up: first resolution, then glow.
    _adapt(now) {
        this._lastAdapt = now;
        const fps = this.engine.getFps();
        if (fps >= ADAPT_MIN_FPS) return;
        if (this.quality.scaling < MAX_SCALING) {
            this.quality.scaling = Math.min(MAX_SCALING, this.quality.scaling + 0.25);
            this.engine.setHardwareScalingLevel(this.quality.scaling);
        } else if (this._glow) {
            this.quality.glow = false;
            this._glow.dispose();
            this._glow = null;
        } else {
            return;
        }
        this.quality.adjustments++;
        console.info(`[scene3d] fps ${fps.toFixed(0)} < ${ADAPT_MIN_FPS}: scaling ${this.quality.scaling}, glow ${!!this._glow}`);
    }

    _renderStats() {
        const s = this.getStats();
        const route = s.synthetic ? 'demo (sem GPX)' : `${(s.routeLength / 1000).toFixed(2)} km`;
        const source = this.demo.active ? '  [demo]' : '';
        this._statsEl.textContent =
            `FPS ${s.fps.toFixed(0)}  CPU ${s.cpuFrameMs.toFixed(1)} ms  draw calls ${s.drawCalls}\n` +
            `canvas ${s.canvas}  escala ${s.scaling}  glow ${s.glow ? 'on' : 'off'}\n` +
            `percurso ${route}  tema ${THEMES[s.theme].label}\n` +
            `dist ${s.distance.toFixed(1)} m  ${s.speedKmh.toFixed(1)} km/h  ${s.cadence.toFixed(0)} rpm${source}\n` +
            `[N] tema  [F] painel  [P] demo  [+/-] vel.  [Esc] fechar`;
    }
}
