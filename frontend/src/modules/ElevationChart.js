/*
    Argus Cyclist - Virtual Cycling Environment for interactive bicycling experiments.
    Copyright (C) 2026  Paulo Sérgio

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

// Route elevation profile drawn on a canvas.
// - x follows the real distance (GPX points are unevenly spaced), so the progress cursor,
//   which is a percentage of the distance, lines up with the drawing;
// - the route is resampled to about one point every 2 px and lightly smoothed;
// - colour comes from the real grade (%) measured over ~100 m, so climbs read as blocks;
// - the canvas is drawn at the screen's real resolution (device pixel ratio and CSS zoom).

const SAMPLE_PX = 2;          // one resampled point every 2 CSS px
const SMOOTH_M = 40;          // half-width of the elevation moving average, in metres
const GRADE_SPAN_M = 100;     // distance the grade is measured over, in metres

// Same slope colours as the route legend (argus-ui.css zone tokens).
const GRADE_COLORS = [
    { max: -1, color: '#4c95f2' },        // descent
    { max: 3, color: '#3fd08a' },         // up to 3%
    { max: 6, color: '#ffd23d' },         // 3-6%
    { max: 9, color: '#ff8c3a' },         // 6-9%
    { max: Infinity, color: '#ff4d5e' }   // 9% and steeper
];

export class ElevationChart {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.data = [];
        this.distances = null;
        this.progress = 0;
        this.isPaused = false;
        this._profile = null;   // resampled profile cached per width

        window.addEventListener('resize', () => {
            if (!this.isPaused) this.draw();
        });
        // The panel also changes size without a window resize (workout plan, view changes).
        if (window.ResizeObserver && this.canvas.parentElement) {
            new ResizeObserver(() => { if (!this.isPaused) this.draw(); }).observe(this.canvas.parentElement);
        }
    }

    setPaused(paused) {
        this.isPaused = paused;
        if (paused) {
            this.ctx.setTransform(1, 0, 0, 1, 0, 0);
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        } else {
            this.draw();
        }
    }

    /**
     * @param {number[]} elevations metres, one per route point
     * @param {number[]} [distances] cumulative metres for each point; even spacing when absent
     */
    setData(elevations, distances = null) {
        this.data = Array.isArray(elevations) ? elevations : [];
        this.distances = Array.isArray(distances) && distances.length === this.data.length && distances.every(Number.isFinite) ? distances : null;
        this._profile = null;
        if (!this.isPaused) this.draw();
    }

    setProgress(pct) {
        this.progress = pct;
        if (!this.isPaused) this.draw();
    }

    getGradientColor(gradePct) {
        return GRADE_COLORS.find((g) => gradePct <= g.max).color;
    }

    /** Resamples the route to `count` evenly spaced points, smooths it and measures the grade. */
    _buildProfile(count) {
        const n = this.data.length;
        const dist = this.distances || this.data.map((_, i) => i);
        const total = dist[n - 1] - dist[0];
        if (!(total > 0)) return null;

        // Even distance steps, linear interpolation between the original points.
        const step = total / (count - 1);
        const ele = new Array(count);
        let j = 0;
        for (let i = 0; i < count; i++) {
            const d = dist[0] + i * step;
            while (j < n - 2 && dist[j + 1] < d) j++;
            const span = dist[j + 1] - dist[j] || 1;
            const t = Math.min(1, Math.max(0, (d - dist[j]) / span));
            ele[i] = this.data[j] + (this.data[j + 1] - this.data[j]) * t;
        }

        // Light moving average (keeps the shape of the climbs, drops GPS noise).
        // Without real distances the spacing is unknown: no smoothing, grade from neighbours.
        const metric = !!this.distances;
        const half = metric ? Math.min(6, Math.round(SMOOTH_M / step)) : 0;
        const smooth = ele.map((_, i) => {
            let sum = 0, cnt = 0;
            for (let k = Math.max(0, i - half); k <= Math.min(count - 1, i + half); k++) { sum += ele[k]; cnt++; }
            return sum / cnt;
        });

        // Grade over ~100 m (or one step when the steps are longer than that).
        const reach = metric ? Math.max(1, Math.round(GRADE_SPAN_M / 2 / step)) : 1;
        const grade = smooth.map((_, i) => {
            const a = Math.max(0, i - reach), b = Math.min(count - 1, i + reach);
            const run = (b - a) * step;
            return metric && run > 0 ? ((smooth[b] - smooth[a]) / run) * 100 : (smooth[b] - smooth[a]);
        });

        let min = Infinity, max = -Infinity;
        for (const e of smooth) { if (e < min) min = e; if (e > max) max = e; }
        return { ele: smooth, grade, min, max, count };
    }

    draw() {
        const parent = this.canvas.parentElement;
        const w = parent.offsetWidth;    // layout size (CSS px, before zoom)
        const h = parent.offsetHeight;
        if (!w || !h) return;

        // Backing store at the real screen resolution: the panel may be scaled by CSS zoom
        // and the screen may have a device pixel ratio above 1.
        const rect = parent.getBoundingClientRect();
        const scale = (rect.width / w || 1) * (window.devicePixelRatio || 1);
        const bw = Math.round(w * scale), bh = Math.round(h * scale);
        if (this.canvas.width !== bw || this.canvas.height !== bh) {
            this.canvas.width = bw;
            this.canvas.height = bh;
        }
        const ctx = this.ctx;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, bw, bh);

        if (this.isPaused || !this.data || this.data.length < 2) return;

        const count = Math.max(2, Math.round(w / SAMPLE_PX) + 1);
        if (!this._profile || this._profile.count !== count) this._profile = this._buildProfile(count);
        const p = this._profile;
        if (!p) return;

        ctx.setTransform(scale, 0, 0, scale, 0, 0);   // draw in layout px
        const range = p.max - p.min || 1;
        const x = (i) => (i / (p.count - 1)) * w;
        const y = (e) => h - ((e - p.min) / range) * (h * 0.8) - (h * 0.1);

        // Filled area under the profile.
        const fill = ctx.createLinearGradient(0, h, 0, 0);
        fill.addColorStop(0, 'rgba(159, 178, 201, 0.10)');
        fill.addColorStop(1, 'rgba(159, 178, 201, 0.24)');
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let i = 0; i < p.count; i++) ctx.lineTo(x(i), y(p.ele[i]));
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();

        // Line: one path per run of the same colour (no speckles between segments).
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        let i = 0;
        while (i < p.count - 1) {
            const color = this.getGradientColor(p.grade[i]);
            ctx.beginPath();
            ctx.moveTo(x(i), y(p.ele[i]));
            while (i < p.count - 1 && this.getGradientColor(p.grade[i]) === color) {
                i++;
                ctx.lineTo(x(i), y(p.ele[i]));
            }
            ctx.strokeStyle = color;
            ctx.stroke();
        }
    }
}
