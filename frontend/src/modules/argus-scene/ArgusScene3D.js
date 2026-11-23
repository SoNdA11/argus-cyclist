// Argus Cyclist - Virtual Cycling Environment for interactive bicycling experiments.
// Copyright (C) 2026  Paulo Sérgio
// SPDX-License-Identifier: GPL-3.0-or-later
//
// App wrapper around the "Litoral Potiguar" 3D scene (argus-scene.module.js), shared by
// the main view and the event mode. It is mounted once as a full-size layer inside the
// main view container (#map-container), over the map, and kept for the app's lifetime:
// a single WebGL context, paused whenever the layer is hidden, covered by a full-screen
// page, has no size, or the window is hidden.
//
// Telemetry comes from the same TelemetryEventBus as the HUD (Wails and Capacitor alike).
// The rider only moves with real telemetry: without a session it stands still (the scene's
// own internal physics is never used, so it never looks like phantom power). When the
// samples stop (pause, end of session) the rider brakes to a stop after STALE_MS.
//
// The scene's visual terrain is procedural: route grades keep coming from the app's route
// (the trainer and the records are unchanged); only the distance is shared, so the race
// gates and the record ghost sit at the right meters.
//
// The legs turn only while the rider produces power (see animatedCadence); with no power
// the bike may still roll (coasting) with the legs still.
//
// Key while visible: C cycles the camera (chase → drone → cinematic).

import { createArgusScene } from './argus-scene.module.js';

const STALE_MS = 2500;           // ms without samples before the rider stops
const DEFAULT_FTP = 250;         // W, sprint threshold when no profile FTP is known
const GHOST_CADENCE = 88;        // rpm shown on the ghost while it moves
// Fixed mid-morning light (~9h, sun ~50° high): best visibility, no day/night cycle.
const TIME_OF_DAY = 0.2;
const PEDAL_MIN_POWER = 5;       // W: below this the legs stay still (coasting or stopped)

/**
 * Cadence shown by the legs: they only turn while the rider produces power. The virtual
 * trainer reports a fixed cadence even at 0 W, and trainers can lag a few samples on
 * cadence, so power is the source of truth. With power but no cadence sensor, the legs
 * use a plausible cadence for that power.
 */
export function animatedCadence(power, cadence) {
    if (!(power >= PEDAL_MIN_POWER)) return 0;
    if (cadence > 0) return cadence;
    return Math.min(100, Math.max(70, 70 + power / 10));
}

// Render scale over the screen's devicePixelRatio (supersampling above 1): sharper rider,
// bike and scenery at the cost of GPU fill rate.
export const QUALITY_RENDER_SCALE = { low: 1, medium: 1.5, high: 2 };
const MAX_PIXEL_RATIO = 3;
// New key: the Babylon-era key often held 'low', which would keep the new scene blurry.
export const QUALITY_KEY = 'argus.scene.quality';
export const DEFAULT_QUALITY = 'high';

function loadQuality() {
    try {
        const q = localStorage.getItem(QUALITY_KEY);
        if (q && QUALITY_RENDER_SCALE[q]) return q;
    } catch { /* storage unavailable */ }
    return DEFAULT_QUALITY;
}

export class ArgusScene3D {
    /** @param {{bus: {subscribe: Function, unsubscribe: Function}}} deps */
    constructor({ bus }) {
        this.bus = bus;
        this.scene = null;
        this.layer = null;
        this.active = true;     // false while another main view (Map) is selected
        this.covered = false;   // true while a full-screen page (home, event hub) is on top
        this.qualityName = loadQuality();
        this.ftp = DEFAULT_FTP;
        this.hasGates = false;
        this.hasGhost = false;
        this._rendering = false;
        this._lastSample = 0;
        this._stopped = false;
        this._onTelemetry = (d) => this._telemetry(d);
        this._onKey = (e) => this._key(e);
        this._onVisibility = () => this._syncRenderLoop();
    }

    get isMounted() {
        return !!this.scene;
    }

    /** True while frames are being rendered (mounted, active and on screen). */
    get isRendering() {
        return this._rendering;
    }

    /** Mounts the scene inside `container`. Throws when WebGL 2 is unavailable. */
    mount(container) {
        if (this.isMounted) return;
        const el = document.createElement('div');
        el.className = 'scene3d-layer';
        // Above anything MapLibre puts in the container (the cyclist marker uses z-index 500).
        el.style.cssText = 'position:absolute;inset:0;z-index:1000;background:#0a1022;overflow:hidden';
        container.appendChild(el);
        try {
            this.scene = createArgusScene(el, {
                camera: 'chase',
                timeOfDay: TIME_OF_DAY,
                dayCycleSeconds: 0,   // the hour never changes
                ftp: this.ftp,
                maxPixelRatio: MAX_PIXEL_RATIO,
                renderScale: QUALITY_RENDER_SCALE[this.qualityName],
                autoStart: false
            });
        } catch (e) {
            el.remove();
            throw e;
        }
        this.layer = el;
        this._container = container;
        this.bus.subscribe(this._onTelemetry);
        window.addEventListener('keydown', this._onKey, true);
        document.addEventListener('visibilitychange', this._onVisibility);
        // display:none (size 0) and window resizes both land here.
        this._resizeObserver = new ResizeObserver(() => this._syncRenderLoop());
        this._resizeObserver.observe(el);
        this._watchdog = setInterval(() => this._checkStale(), 500);
        this.releaseRide(); // no session yet: stand still instead of the scene's own ride
        this.scene.halt();  // ...from the first frame, without braking from the scene's start speed
        this.setActive(this.active);
    }

    /** Full teardown: releases the WebGL context and removes the layer. */
    dispose() {
        if (!this.isMounted) return;
        this.bus.unsubscribe(this._onTelemetry);
        window.removeEventListener('keydown', this._onKey, true);
        document.removeEventListener('visibilitychange', this._onVisibility);
        clearInterval(this._watchdog);
        this._resizeObserver.disconnect();
        this.scene.dispose();
        this.scene = null;
        this._rendering = false;
        this._container.classList.remove('scene3d-active');
        this._container = null;
        this.layer.remove();
        this.layer = null;
    }

    /** Shows (true) or hides (false) the scene layer; hidden means no rendering. */
    setActive(active) {
        this.active = !!active;
        if (this.layer) this.layer.style.display = this.active ? '' : 'none';
        // Map markers (the blue cyclist arrow) belong to the Map view only.
        if (this._container) this._container.classList.toggle('scene3d-active', this.active);
        this._syncRenderLoop();
    }

    /** Pauses rendering while a full-screen page covers the scene (it stays mounted). */
    setCovered(covered) {
        this.covered = !!covered;
        this._syncRenderLoop();
    }

    /** FTP (W) of the rider: the scene sprints above ~1.35–1.65 × FTP. */
    setFtp(watts) {
        const w = Number(watts);
        this.ftp = Number.isFinite(w) && w > 0 ? w : DEFAULT_FTP;
        if (this.scene) this.scene.setFtp(this.ftp);
    }

    /** Graphics preset: 'low' | 'medium' | 'high' (render resolution: 1×, 1.5×, 2× the screen's). */
    setQuality(name) {
        if (!QUALITY_RENDER_SCALE[name]) return;
        this.qualityName = name;
        try { localStorage.setItem(QUALITY_KEY, name); } catch { /* storage unavailable */ }
        if (this.scene) this.scene.setRenderScale(QUALITY_RENDER_SCALE[name]);
    }

    cycleCamera() {
        if (!this.scene) return;
        const order = ['chase', 'drone', 'cinematic'];
        this.scene.setCamera(order[(order.indexOf(this.scene.getCamera()) + 1) % order.length]);
    }

    /** Stops the rider where it is and makes that spot distance 0 (race start line). */
    resetRide() {
        this._lastSample = 0;
        this._stopped = true;
        if (this.scene) this.scene.resetRide();
    }

    /**
     * Leaves the race course: the rider stands still where it is, and the next session's
     * first sample becomes its new starting point (no jump).
     */
    releaseRide() {
        this._lastSample = 0;
        this._stopped = true;
        if (!this.scene) return;
        this.scene.clearRideData(); // frees the course origin
        this.scene.setRideData({ power: 0, cadence: 0, speedKmh: 0 });
    }

    /**
     * Race furniture: start/finish gates and, when given, the record ghost replaying a
     * recorded attempt. `clock()` returns the race time in seconds (0 before GO).
     * Call after resetRide(): the gates are placed relative to the current start line.
     * @param {{start?: number, finish: number, ghost?: import('../GhostTrack.js').GhostTrack, ghostLabel?: string, clock: () => number}} race
     */
    setRace(race) {
        if (!this.scene) return;
        this.scene.setRace({ start: race.start, finish: race.finish });
        this.hasGates = true;
        const ghost = race.ghost;
        if (ghost && ghost.valid) {
            this.scene.setGhost(() => {
                const t = Math.max(0, race.clock ? race.clock() : 0);
                const speed = ghost.speedAt(t);
                return { distanceM: ghost.distanceAt(t), speedKmh: speed * 3.6, cadence: speed > 0.3 ? GHOST_CADENCE : 0 };
            }, race.ghostLabel || null);
            this.hasGhost = true;
        } else {
            this.scene.setGhost(null);
            this.hasGhost = false;
        }
    }

    clearRace() {
        if (this.scene) this.scene.clearRace();
        this.hasGates = false;
        this.hasGhost = false;
    }

    /** Scene state: distances (course and ghost), speed, power, cadence, sprint, fps. */
    getState() {
        return this.scene ? this.scene.getState() : null;
    }

    /** Resolves with a JPEG data URL of the next rendered frame (null when not rendering). */
    captureFrame(quality = 0.8) {
        return this.scene && this._rendering ? this.scene.captureFrame(quality) : Promise.resolve(null);
    }

    // ------------------------------------------------------------------

    _telemetry(d) {
        if (!this.scene) return;
        const dist = Number(d.total_dist);
        const power = Math.max(0, Number(d.power) || 0);
        const data = {
            power,
            cadence: animatedCadence(power, Math.max(0, Number(d.cadence) || 0)),
            speedKmh: Math.max(0, Number(d.speed) || 0)
        };
        if (Number.isFinite(dist)) data.distanceM = dist;
        this.scene.setRideData(data);
        this._lastSample = performance.now();
        this._stopped = false;
    }

    // Samples stopped (pause, finished session, sensor loss): brake to a stop in place.
    _checkStale() {
        if (!this.scene || this._stopped || !this._lastSample) return;
        if (performance.now() - this._lastSample < STALE_MS) return;
        this._stopped = true;
        this.scene.setRideData({ power: 0, cadence: 0, speedKmh: 0 });
    }

    _syncRenderLoop() {
        if (!this.scene) return;
        const should = this.active && !this.covered && document.visibilityState !== 'hidden' &&
            this.layer.clientWidth > 0 && this.layer.clientHeight > 0;
        if (should === this._rendering) return;
        this._rendering = should;
        if (should) {
            this.scene.resize();
            this.scene.start();
        } else {
            this.scene.stop();
        }
    }

    _key(e) {
        if (!this._rendering || e.ctrlKey || e.metaKey || e.altKey) return;
        const tag = e.target?.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'select' || tag === 'textarea' || e.target?.isContentEditable) return;
        if (e.key.toLowerCase() !== 'c') return;
        this.cycleCamera();
        e.stopPropagation();
        e.preventDefault();
    }
}
