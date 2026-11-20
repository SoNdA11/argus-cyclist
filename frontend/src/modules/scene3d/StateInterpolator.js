// Argus Cyclist - Virtual Cycling Environment for interactive bicycling experiments.
// Copyright (C) 2026  Paulo Sérgio
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Turns the ~1 Hz telemetry stream into a smooth 60 fps state for the renderer.
// Between samples the distance is extrapolated with the last speed; when a new sample
// arrives the gap is closed gradually (never moving backwards), so the rider neither
// jumps nor stutters. Times use the browser clock at arrival, not the Go timestamp,
// so both sides never need synchronized clocks.

const CORRECTION_RATE = 1.2;   // 1/s: fraction of the position error removed per second
const SNAP_ERROR = 40;         // m: larger gaps (new session, route change) snap instantly
const MAX_EXTRAPOLATION = 2.5; // s without data before the rider coasts to a stop
const COAST_DECAY = 1.5;       // 1/s speed decay while coasting

export class StateInterpolator {
    constructor() {
        this.reset();
    }

    reset() {
        this.hasData = false;
        this.distance = 0;       // displayed distance (m, total_dist domain)
        this.speed = 0;          // displayed speed (m/s)
        this.cadence = 0;        // displayed cadence (rpm)
        this.power = 0;
        this.grade = 0;
        this._sampleDist = 0;
        this._sampleSpeed = 0;
        this._sampleCadence = 0;
        this._sampleTime = 0;
        // Diagnostics for the debug overlay / auto test.
        this.stats = { samples: 0, snaps: 0, errSum: 0, errMax: 0 };
    }

    /** Feeds a telemetry_update payload ({total_dist, speed km/h, cadence, power, grade}). */
    push(data, now = performance.now()) {
        const dist = Number(data.total_dist);
        if (!Number.isFinite(dist)) return;
        const speed = Math.max(0, (Number(data.speed) || 0) / 3.6);
        this._sampleCadence = Math.max(0, Number(data.cadence) || 0);
        this.power = Number(data.power) || 0;
        this.grade = Number(data.grade) || 0;

        if (!this.hasData || dist < this._sampleDist - 1 || Math.abs(dist - this.distance) > SNAP_ERROR) {
            if (this.hasData) this.stats.snaps++;
            this.distance = dist;
            this.speed = speed;
            this.hasData = true;
        } else {
            const err = Math.abs(dist - this.distance);
            this.stats.samples++;
            this.stats.errSum += err;
            this.stats.errMax = Math.max(this.stats.errMax, err);
        }
        this._sampleDist = dist;
        this._sampleSpeed = speed;
        this._sampleTime = now;
    }

    /** Advances the displayed state by dt seconds. */
    update(dt, now = performance.now()) {
        if (!this.hasData || dt <= 0) return;
        const age = (now - this._sampleTime) / 1000;

        // Where the backend's rider should be right now.
        let targetSpeed = this._sampleSpeed;
        let target = this._sampleDist + this._sampleSpeed * Math.min(age, MAX_EXTRAPOLATION);
        if (age > MAX_EXTRAPOLATION) {
            // Data stopped (pause, sensor loss): coast to a stop instead of running away.
            targetSpeed = this._sampleSpeed * Math.exp(-COAST_DECAY * (age - MAX_EXTRAPOLATION));
            target = this.distance;
        }

        const err = target - this.distance;
        const k = 1 - Math.exp(-CORRECTION_RATE * dt);
        // Forward motion at the target speed plus a smooth share of the error; never backwards.
        const step = Math.max(0, targetSpeed * dt + err * k);
        this.distance += step;

        const kv = 1 - Math.exp(-4 * dt);
        this.speed += (step / dt - this.speed) * kv;
        const kc = 1 - Math.exp(-3 * dt);
        this.cadence += (this._sampleCadence - this.cadence) * kc;
    }
}
