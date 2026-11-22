// Argus Cyclist - Virtual Cycling Environment for interactive bicycling experiments.
// Copyright (C) 2026  Paulo Sérgio
// SPDX-License-Identifier: GPL-3.0-or-later
//
// 3D scene that follows the active ride. It consumes the same TelemetryEventBus as the
// HUD, so desktop (Wails) and Android (Capacitor) share it unchanged.
//
// The scene is mounted once inside the main view container (#map-container), as a layer
// over the map. Every existing piece of UI that hides that container (dashboard, Studio,
// workouts) therefore hides the scene too; rendering pauses whenever the layer has no
// size, the window is hidden, or the "Map" view is selected, and resumes instantly.
//
// Keys while visible: N theme, M minimap, F debug panel (stats + demo ride), P demo ride,
// +/- demo speed.
//
// Demo ride: buttons that make the rider pedal without a trainer or session (shown with
// the debug panel). It feeds synthetic 1 Hz samples through the same interpolator as
// real telemetry.

import { Engine, Scene, Color3, Color4, Vector3, HemisphericLight, DirectionalLight, GlowLayer, SceneInstrumentation, CreateBox } from './babylon.js';
import { RouteModel, buildRouteWorld, buildSkyline } from './RouteMeshBuilder.js';
import { StateInterpolator } from './StateInterpolator.js';
import { CyclistRig, BIKE_TYPES } from './CyclistRig.js';
import { ChaseCamera } from './ChaseCamera.js';
import { THEMES, THEME_ORDER } from './themes.js';
import { MiniMap } from './MiniMap.js';
import { buildRaceMarkers, buildFloatingLabel } from './RaceMarkers.js';
import { MaterialLibrary, setupRealisticEnvironment, QUALITY_PRESETS, QUALITY_ORDER } from './Environment.js';
import { buildRealisticRoad, buildMountainRing } from './RealisticWorld.js';
import { Vegetation } from './Vegetation.js';

const RIDER_LATERAL = 1.2;     // m right of the road center (right lane)
const GHOST_LATERAL = -1.0;    // ghosts ride in the left lane
const THEME_KEY = 'argus.scene3d.theme';
const ADAPT_INTERVAL = 2000;   // ms between quality checks
const ADAPT_MIN_FPS = 45;
const MAX_SCALING = 1.5;
const DEMO_SPEEDS = [0, 10, 15, 20, 25, 30, 35, 40, 50, 60]; // km/h
const DEMO_DEFAULT = 4;                                       // index → 25 km/h
const MINIMAP_INTERVAL = 66;  // ms between minimap redraws (~15 Hz)
const MINIMAP_KEY = 'argus.scene3d.minimap';
const QUALITY_KEY = 'argus.scene3d.quality';
const BIKE_KEY = 'argus.scene3d.bike';

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

function loadBike() {
    try {
        const b = localStorage.getItem(BIKE_KEY);
        if (b && BIKE_TYPES.includes(b)) return b;
    } catch { /* storage unavailable */ }
    return 'road';
}

function loadQuality() {
    try {
        const q = localStorage.getItem(QUALITY_KEY);
        if (q && QUALITY_PRESETS[q]) return q;
    } catch { /* storage unavailable */ }
    return 'medium';
}

function loadFlag(key, fallback) {
    try {
        const v = localStorage.getItem(key);
        if (v === '1' || v === '0') return v === '1';
    } catch { /* storage unavailable */ }
    return fallback;
}

function saveFlag(key, on) {
    try { localStorage.setItem(key, on ? '1' : '0'); } catch { /* storage unavailable */ }
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
        this.layer = null;
        this.active = true;          // false while another main view (Map) is selected
        this.covered = false;        // true while a full-screen page (home, event hub) is on top
        this.hintEnabled = true;     // "Start a ride" hint (off during event races)
        this.race = null;            // {start, finish, ghost: GhostTrack|null, ghostLabel, clock}
        this.showDebug = false;      // stats + demo controls (key F)
        this.qualityName = loadQuality();
        this.bikeType = loadBike();
        this.quality = { scaling: 1, glow: true, shadows: true, adjustments: 0 };
        this._routePoints = null;
        this._rendering = false;
        this.demo = { active: false, speedIdx: DEMO_DEFAULT, distance: 0, timer: null, last: 0 };
        this._onTelemetry = (d) => {
            if (this.demo.active) return; // the demo drives the rider while it runs
            this.interp.push(d);
            this._updateWaiting();
        };
        this._onKey = (e) => this._key(e);
        this._onVisibility = () => this._syncRenderLoop();
    }

    get isMounted() {
        return !!this.layer;
    }

    /** True while frames are being rendered (mounted, active and on screen). */
    get isRendering() {
        return this._rendering;
    }

    /** Mounts the scene as a full-size layer inside `container` (kept until dispose()). */
    async mount(container) {
        if (this.isMounted) return;
        this._createLayer(container);
        this._createEngine();
        this.bus.subscribe(this._onTelemetry);
        window.addEventListener('keydown', this._onKey, true);
        document.addEventListener('visibilitychange', this._onVisibility);
        // Size changes (window resize, sidebar toggles) and display:none (size 0) both land here.
        this._resizeObserver = new ResizeObserver(() => {
            if (this.engine) this.engine.resize();
            this._syncRenderLoop();
        });
        this._resizeObserver.observe(this.layer);
        await this.refreshRoute();
        this._syncRenderLoop();
    }

    /** Shows (true) or hides (false) the scene layer; hidden means no rendering. */
    setActive(active) {
        this.active = !!active;
        if (this.layer) this.layer.style.display = this.active ? '' : 'none';
        // Map markers (the blue cyclist arrow) belong to the Map view only.
        if (this._container) this._container.classList.toggle('scene3d-active', this.active);
        this._syncRenderLoop();
    }

    /** Puts the rider back at the start, standing still (e.g. before an event race). */
    resetRide() {
        this.stopDemo();
        this.interp.reset();
        if (this.chase) this.chase.reset(0, RIDER_LATERAL);
        if (this.rider && this.model) this._placeRider(0);
        this._updateWaiting();
    }

    /**
     * Shows the race furniture (start/finish gates) and, when given, a ghost replaying
     * a recorded attempt. `clock()` returns the race time in seconds (0 before GO).
     * @param {{start?: number, finish: number, ghost?: import('./GhostTrack.js').GhostTrack, ghostLabel?: string, clock: () => number}} race
     */
    setRace(race) {
        this.race = race;
        if (this.scene) this._applyRace();
    }

    clearRace() {
        this.race = null;
        this._disposeRace();
    }

    _disposeRace() {
        if (this._raceRoot) { this._raceRoot.dispose(false, true); this._raceRoot = null; }
        if (this.ghostRig) { this.ghostRig.dispose(); this.ghostRig = null; }
    }

    _applyRace() {
        this._disposeRace();
        const race = this.race;
        if (!race || !this.scene) return;
        this._raceRoot = buildRaceMarkers(this.scene, this.model, race);
        const shadows = this.env && this.env.shadows;
        if (shadows) for (const m of this._raceRoot.getChildMeshes()) shadows.addShadowCaster(m, false);
        if (race.ghost && race.ghost.valid) {
            this.ghostRig = new CyclistRig(this.scene, { name: 'ghost', jersey: '#00e5ff', frame: '#a5f3fc', alpha: 0.42, pbr: this.realistic, bike: this.bikeType });
            if (race.ghostLabel) buildFloatingLabel(this.scene, this.ghostRig.root, race.ghostLabel, { accent: '#00e5ff' });
            if (shadows) this.ghostRig.whenReady((rig) => this._castShadows(rig, shadows));
            this._ghostPose = {};
            this._placeGhost(0);
        }
    }

    _placeGhost(dt) {
        const ghost = this.race.ghost;
        const t = Math.max(0, this.race.clock ? this.race.clock() : 0);
        this.ghostDistance = ghost.distanceAt(t);
        const pose = this.model.sample(this.ghostDistance, this._ghostPose);
        const speed = ghost.speedAt(t);
        this.ghostRig.update(dt, pose, GHOST_LATERAL, speed, speed > 0.3 ? 88 : 0);
    }

    /** Event layout: minimap in the bottom-left corner, free of the race HUD. */
    setEventLayout(on) {
        this.eventLayout = !!on;
        if (this.minimap) this.minimap.setCorner(this.eventLayout ? 'bottom-left' : 'top-right');
    }

    /** Shows or hides the "Start a ride" hint. */
    setHintVisible(visible) {
        this.hintEnabled = !!visible;
        this._updateWaiting();
    }

    /** Pauses rendering while a full-screen page covers the scene (it stays mounted). */
    setCovered(covered) {
        this.covered = !!covered;
        this._syncRenderLoop();
    }

    /** Full teardown: releases the WebGL context. */
    dispose() {
        if (!this.isMounted) return;
        this.stopDemo();
        this.bus.unsubscribe(this._onTelemetry);
        window.removeEventListener('keydown', this._onKey, true);
        document.removeEventListener('visibilitychange', this._onVisibility);
        this._resizeObserver.disconnect();
        this._resizeObserver = null;
        this._disposeScene();
        this._rendering = false;
        this.engine.stopRenderLoop();
        this.engine.dispose();
        this.engine = null;
        this.minimap.dispose();
        this.minimap = null;
        this._container.classList.remove('scene3d-active');
        this._container = null;
        this.layer.remove();
        this.layer = null;
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
        if (this.minimap) this.minimap.setRoute(this.model);
        if (this.isMounted) this._buildScene();
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
        if (this.isMounted) this._buildScene();
    }

    /** Graphics preset of the realistic theme: 'low' | 'medium' | 'high'. */
    setQuality(name) {
        if (!QUALITY_PRESETS[name]) return;
        this.qualityName = name;
        try { localStorage.setItem(QUALITY_KEY, name); } catch { /* storage unavailable */ }
        this.quality = { scaling: 1, glow: true, shadows: true, adjustments: 0 };
        if (this.isMounted) this._buildScene();
    }

    /** Bike model of the rider (and ghosts): 'road' or 'tt'. Visual only (no physics change). */
    setBikeType(type) {
        if (!BIKE_TYPES.includes(type)) return;
        this.bikeType = type;
        try { localStorage.setItem(BIKE_KEY, type); } catch { /* storage unavailable */ }
        if (!this.scene) return;
        this.rider.dispose();
        this._createRider(THEMES[this.theme]);
        this._placeRider(0);
        if (this.race) this._applyRace();
    }

    _createRider(t) {
        this.rider = new CyclistRig(this.scene || this._buildingScene, {
            name: 'rider', jersey: t.rider.jersey, frame: t.rider.frame, pbr: !!t.realistic, bike: this.bikeType
        });
        const shadows = this.env && this.env.shadows;
        // The bike is a GLB loaded asynchronously: cast shadows once the rig is complete.
        if (shadows) this.rider.whenReady((rig) => this._castShadows(rig, shadows));
    }

    _castShadows(rig, shadows) {
        // The generator may have been dropped (adaptive quality) while the model loaded.
        if (!this.env || this.env.shadows !== shadows) return;
        for (const m of rig.meshes) shadows.addShadowCaster(m, false);
    }

    cycleQuality() {
        const i = QUALITY_ORDER.indexOf(this.qualityName);
        this.setQuality(QUALITY_ORDER[(i + 1) % QUALITY_ORDER.length]);
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
        this._updateWaiting();
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
        this._demoBtn.textContent = this.demo.active ? '⏸ Stop demo' : '▶ Demo ride';
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
            quality: this.realistic ? this.qualityName : null,
            bike: this.bikeType,
            buildMs: this.lastBuildMs || 0,
            shadows: !!(this.env && this.env.shadows),
            vegetation: this.vegetation ? { ...this.vegetation.stats, visible: this.vegetation.chunks.filter((c) => c.state !== 'off').length } : null,
            interp: { ...this.interp.stats }
        };
    }

    // ------------------------------------------------------------------

    _createLayer(container) {
        const el = document.createElement('div');
        el.className = 'scene3d-layer';
        // Above anything MapLibre puts in the container (the cyclist marker uses z-index 500).
        el.style.cssText = 'position:absolute;inset:0;z-index:1000;background:#000;overflow:hidden';
        el.innerHTML =
            '<canvas style="width:100%;height:100%;display:block;outline:none;touch-action:none"></canvas>' +
            '<pre data-role="stats" style="position:absolute;top:10px;left:10px;margin:0;padding:8px 10px;' +
            'background:rgba(0,0,0,.55);color:#9effa0;font:12px/1.35 monospace;border-radius:6px;pointer-events:none"></pre>' +
            '<div data-role="waiting" style="position:absolute;left:50%;bottom:28px;transform:translateX(-50%);' +
            'padding:10px 18px;border-radius:8px;background:rgba(0,0,0,.6);color:#fff;font:15px sans-serif;' +
            'white-space:nowrap;pointer-events:none">Start a ride to pedal</div>' +
            '<div data-role="demo" style="position:absolute;right:16px;bottom:16px;display:flex;align-items:center;gap:6px;' +
            'padding:8px;border-radius:10px;background:rgba(0,0,0,.55);color:#fff;font:14px sans-serif">' +
            '<button data-act="toggle" title="Pedal without a trainer (P)" style="' + DEMO_BTN + 'width:auto;padding:0 14px"></button>' +
            '<button data-act="slower" title="Slower (-)" style="' + DEMO_BTN + '">−</button>' +
            '<span data-role="demo-speed" style="min-width:110px;text-align:center"></span>' +
            '<button data-act="faster" title="Faster (+)" style="' + DEMO_BTN + '">+</button></div>';
        container.appendChild(el);
        this._container = container;
        el.querySelector('[data-act="toggle"]').addEventListener('click', () => this.toggleDemo());
        el.querySelector('[data-act="slower"]').addEventListener('click', () => this.changeDemoSpeed(-1));
        el.querySelector('[data-act="faster"]').addEventListener('click', () => this.changeDemoSpeed(1));
        this.layer = el;
        this.canvas = el.querySelector('canvas');
        this.minimap = new MiniMap(el);
        this.minimap.setVisible(loadFlag(MINIMAP_KEY, true));
        if (this.eventLayout) this.minimap.setCorner('bottom-left');
        if (this.model) this.minimap.setRoute(this.model);
        this._statsEl = el.querySelector('[data-role="stats"]');
        this._waitingEl = el.querySelector('[data-role="waiting"]');
        this._demoEl = el.querySelector('[data-role="demo"]');
        this._demoBtn = el.querySelector('[data-act="toggle"]');
        this._demoSpeedEl = el.querySelector('[data-role="demo-speed"]');
        if (!this.active) el.style.display = 'none';
        container.classList.toggle('scene3d-active', this.active);
        this._renderDemo();
        this._applyDebug();
        this._updateWaiting();
    }

    _applyDebug() {
        this._statsEl.style.display = this.showDebug ? '' : 'none';
        this._demoEl.style.display = this.showDebug ? 'flex' : 'none';
    }

    _updateWaiting() {
        if (this._waitingEl) {
            const show = this.hintEnabled && !this.interp.hasData && !this.demo.active;
            this._waitingEl.style.display = show ? '' : 'none';
        }
    }

    _createEngine() {
        this.engine = new Engine(this.canvas, true, {
            preserveDrawingBuffer: false, stencil: false, powerPreference: 'high-performance'
        }, false);
        this.engine.setHardwareScalingLevel(this.quality.scaling);
    }

    _syncRenderLoop() {
        if (!this.engine) return;
        const shouldRender = !!this.scene && this.active && !this.covered && document.visibilityState !== 'hidden' &&
            this.layer.clientWidth > 0 && this.layer.clientHeight > 0;
        if (shouldRender === this._rendering) return;
        this._rendering = shouldRender;
        this.engine.stopRenderLoop();
        if (!shouldRender) return;
        this._lastAdapt = performance.now() + 3000; // let it warm up before judging FPS
        this._lastStats = 0;
        this._lastMinimap = 0;
        this.engine.resize();
        this.engine.runRenderLoop(() => this._frame());
    }

    _key(e) {
        if (!this._rendering || e.ctrlKey || e.metaKey || e.altKey) return;
        const tag = e.target?.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'select' || tag === 'textarea' || e.target?.isContentEditable) return;
        const k = e.key.toLowerCase();
        if (k === 'n') this.cycleTheme();
        else if (k === 'q') this.cycleQuality();
        else if (k === 'b') this.setBikeType(this.bikeType === 'road' ? 'tt' : 'road');
        else if (k === 'm') { this.minimap.setVisible(!this.minimap.visible); saveFlag(MINIMAP_KEY, this.minimap.visible); }
        else if (k === 'f') { this.showDebug = !this.showDebug; this._applyDebug(); }
        else if (k === 'p') this.toggleDemo();
        else if (k === '+' || k === '=') this.changeDemoSpeed(1);
        else if (k === '-') this.changeDemoSpeed(-1);
        else return;
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
        this._raceRoot = null;   // disposed with the scene
        this.ghostRig = null;
        this.mountains = null;
        this.vegetation = null;
        this.env = null;
        this.lib = null;
    }

    _buildScene() {
        const buildStart = performance.now();
        this._disposeScene();
        const t = THEMES[this.theme];
        const scene = new Scene(this.engine);
        scene.skipPointerMovePicking = true;
        scene.autoClear = true;
        scene.clearColor = Color4.FromHexString(t.sky + 'ff');
        this.scene = null; // set at the end; the render loop waits for a complete scene

        this.chase = new ChaseCamera(scene, this.model);
        scene.activeCamera = this.chase.camera;
        this.realistic = !!t.realistic;
        if (this.realistic) this._buildRealistic(scene, t);
        else this._buildStylized(scene, t);

        this._instr = new SceneInstrumentation(scene);
        this._instr.captureFrameTime = true;

        // Static world: skip per-frame bounding updates. Camera-following meshes (sky,
        // horizon, ground) are always drawn; the rider moves every frame.
        const follows = (m) => m === this.groundPlane || m === this.mountains || m.name === 'skybox' ||
            (this.skyline && m.isDescendantOf(this.skyline));
        for (const m of scene.meshes) {
            if (follows(m)) m.alwaysSelectAsActiveMesh = true;
            else if (!m.isDescendantOf(this.rider.root)) m.doNotSyncBoundingInfo = true;
        }
        // Freezing materials before the HDR environment has loaded would lock them
        // without image-based lighting, so the realistic theme keeps them live.
        if (!this.realistic) scene.executeWhenReady(() => { if (this.scene === scene) scene.freezeMaterials(); });

        this._pose = {};
        this.scene = scene;
        this._buildingScene = null;
        this._applyRace(); // after the static-mesh pass: the ghost moves every frame
        this.chase.reset(this.interp.distance, RIDER_LATERAL);
        this._placeRider(0);
        if (this.vegetation) this.vegetation.update(this.chase.camera.position, performance.now(), true);
        this.lastBuildMs = performance.now() - buildStart;
        // A rebuilt scene needs the loop restarted even if it was already running.
        this._rendering = false;
        this._syncRenderLoop();
    }

    _buildStylized(scene, t) {
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
        this._buildingScene = scene;
        this._createRider(t);

        if (t.glow && this.quality.glow) {
            const glow = new GlowLayer('glow', scene, { mainTextureRatio: 0.5, blurKernelSize: 32 });
            glow.intensity = t.glowIntensity;
            // Grade-colored edges use vertex colors, which the default glow pass ignores.
            for (const m of scene.meshes) if (m.name.startsWith('edge-')) glow.referenceMeshToUseItsOwnMaterial(m);
            this._glow = glow;
        }
    }

    _buildRealistic(scene, t) {
        const preset = QUALITY_PRESETS[this.qualityName];
        if (this.quality.adjustments === 0) {
            this.quality.scaling = preset.scaling;
            this.engine.setHardwareScalingLevel(preset.scaling);
        }
        const lib = new MaterialLibrary(scene);
        this.lib = lib;
        this.env = setupRealisticEnvironment(scene, this.chase.camera, t, this.quality.shadows ? this.qualityName : 'low');

        const road = buildRealisticRoad(scene, this.model, t, lib);
        // Road paint and km markers from the shared builders: PBR so the sun does not burn them.
        const paint = lib.plain('road-paint', '#f3f3ef', { roughness: 0.5 });
        const marker = lib.plain('km-marker', t.markerColor, { roughness: 0.4 });
        for (const m of scene.meshes) {
            if (m.name === 'lane-dash') m.material = paint;
            else if (m.name === 'km-marker') m.material = marker;
        }

        const ground = CreateBox('ground-plane', { width: 1, height: 1, depth: 1 }, scene);
        ground.scaling.set(6000, 0.2, 6000);
        ground.position.y = this.model.bounds.minY - 4;
        ground.material = lib.pbr('aerial_grass_rock', { uScale: 140, vScale: 140, name: 'ground', tint: t.slopeTint });
        ground.isPickable = false;
        this.groundPlane = ground;
        this.mountains = buildMountainRing(scene, lib, t);

        this._buildingScene = scene;
        this._createRider(t);
        this.vegetation = new Vegetation(scene, this.model, road, lib, preset);
        if (this.env.shadows) for (const m of road.receivers) m.receiveShadows = true;
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
        if (this.ghostRig) this._placeGhost(dt);
        this.chase.update(dt, this.interp.distance, RIDER_LATERAL, this.interp.speed);
        const cam = this.chase.camera.position;
        if (this.skyline) this.skyline.position.set(cam.x, Math.max(this.model.bounds.minY, cam.y - 60), cam.z);
        // Ground follows the camera horizontally, 45 m below the rider (roads further below
        // are fogged anyway); at the route minimum it sits just under the terrain.
        this.groundPlane.position.set(cam.x, Math.max(this.model.bounds.minY - 4, this._pose.y - 45), cam.z);
        if (this.mountains) this.mountains.position.set(cam.x, this.groundPlane.position.y, cam.z);
        if (this.env) this.env.update(this.rider.root.position);
        if (this.vegetation) this.vegetation.update(cam, now);
        this.scene.render();

        if (now - this._lastMinimap > MINIMAP_INTERVAL) {
            this._lastMinimap = now;
            this.minimap.update(this._pose, this.ghostRig ? this._ghostPose : null);
        }
        if (now - this._lastAdapt > ADAPT_INTERVAL) this._adapt(now);
        if (this.showDebug && now - this._lastStats > 500) {
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
        } else if (this.env && this.env.shadows) {
            this.quality.shadows = false;
            this.env.shadows.dispose();
            this.env.shadows = null;
        } else {
            return;
        }
        this.quality.adjustments++;
        console.info(`[scene3d] fps ${fps.toFixed(0)} < ${ADAPT_MIN_FPS}: scaling ${this.quality.scaling}, glow ${!!this._glow}`);
    }

    _renderStats() {
        const s = this.getStats();
        const route = s.synthetic ? 'demo loop (no GPX)' : `${(s.routeLength / 1000).toFixed(2)} km`;
        const source = this.demo.active ? '  [demo]' : '';
        this._statsEl.textContent =
            `FPS ${s.fps.toFixed(0)}  CPU ${s.cpuFrameMs.toFixed(1)} ms  draw calls ${s.drawCalls}\n` +
            `canvas ${s.canvas}  scale ${s.scaling}  glow ${s.glow ? 'on' : 'off'}\n` +
            `route ${route}  theme ${THEMES[s.theme].label}${s.quality ? `  quality ${s.quality}  shadows ${s.shadows ? 'on' : 'off'}` : ''}\n` +
            `dist ${s.distance.toFixed(1)} m  ${s.speedKmh.toFixed(1)} km/h  ${s.cadence.toFixed(0)} rpm${source}\n` +
            `[N] theme  [Q] quality  [B] bike  [M] minimap  [F] panel  [P] demo  [+/-] speed`;
    }
}
