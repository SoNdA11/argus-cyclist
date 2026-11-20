// Argus Cyclist - Virtual Cycling Environment for interactive bicycling experiments.
// Copyright (C) 2026  Paulo Sérgio
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Replay of a recorded race attempt ("ghost"). The record stores the elapsed time at
// every `step` meters (EventRecord.ghost), so the ghost's position at any race time is
// a lookup with linear interpolation, and so is the time gap at any distance.
// Pure functions: no Babylon dependency, testable in Node.

export class GhostTrack {
    /**
     * @param {number[]} times elapsed seconds at 0, step, 2·step, … meters (non-decreasing)
     * @param {number} step meters between samples
     */
    constructor(times, step = 5) {
        this.times = Array.isArray(times) ? times.map(Number).filter(Number.isFinite) : [];
        this.step = step;
        this.distance = Math.max(0, (this.times.length - 1) * step);
        this.finishTime = this.times.length ? this.times[this.times.length - 1] : 0;
    }

    get valid() {
        return this.times.length >= 2 && this.finishTime > 0;
    }

    /** Distance (m) covered at race time t (s); clamped to [0, distance]. */
    distanceAt(t) {
        const T = this.times;
        if (!this.valid || t <= 0) return 0;
        if (t >= this.finishTime) return this.distance;
        // Binary search for the last sample with time <= t.
        let lo = 0, hi = T.length - 1;
        while (hi - lo > 1) {
            const mid = (lo + hi) >> 1;
            if (T[mid] <= t) lo = mid; else hi = mid;
        }
        const span = T[hi] - T[lo];
        const frac = span > 0 ? (t - T[lo]) / span : 0;
        return (lo + frac) * this.step;
    }

    /** Race time (s) at which the ghost passed distance d (m). */
    timeAt(d) {
        const T = this.times;
        if (!this.valid) return 0;
        if (d <= 0) return T[0];
        if (d >= this.distance) return this.finishTime;
        const f = d / this.step;
        const i = Math.floor(f);
        return T[i] + (T[i + 1] - T[i]) * (f - i);
    }

    /** Ghost speed (m/s) at race time t, from the sample interval it is in. */
    speedAt(t) {
        if (!this.valid || t <= 0 || t >= this.finishTime) return 0;
        const d0 = this.distanceAt(t - 0.5), d1 = this.distanceAt(t + 0.5);
        return Math.max(0, d1 - d0);
    }

    /**
     * Time gap of a rider at distance d reached at race time t: negative = ahead of
     * the ghost (the ghost got there later), positive = behind.
     */
    gapAt(d, t) {
        return t - this.timeAt(d);
    }
}

/** Formats a gap as "−1.24 s" / "+0.80 s" (true minus sign for readability). */
export function formatGap(seconds) {
    const v = Math.abs(seconds) < 0.005 ? 0 : seconds;
    return `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(2)} s`;
}
