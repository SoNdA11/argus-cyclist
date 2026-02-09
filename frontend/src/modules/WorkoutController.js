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

export class WorkoutController {
    constructor() {
        this.panel = document.getElementById('workout-panel');
        this.list = document.getElementById('workout-list');

        // UI Elements
        this.elTarget = document.getElementById('wo-target');
        this.elTimer = document.getElementById('wo-timer');
        this.elMessage = document.getElementById('wo-message');
        this.elCompletion = document.getElementById('wo-completion');
        this.elDistDone = document.getElementById('wo-dist-done');
        this.elDistRem = document.getElementById('wo-dist-rem');

        this.elIntensity = document.getElementById('wo-intensity');
        window.workoutCtrl = this;

        this.activeWorkout = null;
        this.currentSegIdx = -1;

        this.canvas = document.getElementById('workout-canvas');
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;

        this.lastWidth = 0;

        if (window.runtime) {
            window.runtime.EventsOn("workout_loaded", (wo) => this.loadWorkout(wo));
            window.runtime.EventsOn("workout_status", (state) => this.updateStatus(state));
            window.runtime.EventsOn("workout_finished", (status) => {
                this.hide();
                if (status === "completed") {
                    this.showToast("Workout completed!\n\nSwitched to Free Ride (SIM).\nKeep pedaling to continue, or stop to finish the workout.", 5000);
                }
            });
            window.runtime.EventsOn("telemetry_update", (data) => this.updateTelemetry(data));
        }

        window.addEventListener('resize', () => {
            if (this.activeWorkout && !this.panel.classList.contains('hidden')) {
                this.lastWidth = 0;
                this.renderGraph(this.lastPct || 0);
            }
        });
    }

    getProp(obj, keys) {
        if (!obj) return undefined;
        for (const key of keys) {
            if (obj[key] !== undefined) return obj[key];
        }
        return undefined;
    }

    loadWorkout(workout) {
        console.log("WORKOUT: Loading...", workout);
        this.activeWorkout = workout;
        this.panel.classList.remove('hidden');

        this.renderList();

        requestAnimationFrame(() => this.renderGraph(0));
    }

    hide() {
        this.panel.classList.add('hidden');
        this.activeWorkout = null;

        setTimeout(() => {
            if (window.mapController && window.mapController.map) {
                window.mapController.map.resize();
            }
            else {
                window.dispatchEvent(new Event('resize'));
            }
        }, 50);
    }

    updateTelemetry(data) {
        if (!this.activeWorkout) return;

        const totalDist = this.getProp(data, ['total_dist', 'TotalDistance']);
        const distKm = (totalDist / 1000).toFixed(1);

        if (this.elDistDone) this.elDistDone.innerText = `${distKm} km`;

        if (window.totalRouteDistance && window.totalRouteDistance > 0) {
            const rem = Math.max(0, window.totalRouteDistance - totalDist);
            if (this.elDistRem) this.elDistRem.innerText = `${(rem / 1000).toFixed(1)} km`;
        } else {
            if (this.elDistRem) this.elDistRem.innerText = "--";
        }
    }

    updateStatus(state) {
        const isActive = this.getProp(state, ['is_active', 'IsActive']);
        if (!isActive) return;

        const completionPct = this.getProp(state, ['completion_percent', 'CompletionPercent']) || 0;
        this.lastPct = completionPct;

        const targetPower = this.getProp(state, ['target_power', 'TargetPower']);
        const timeRemain = this.getProp(state, ['segment_time_remain', 'SegmentTimeRemain']);
        const currentIdx = this.getProp(state, ['current_segment_index', 'CurrentSegmentIdx']);
        const segDuration = this.getProp(state, ['segment_duration', 'SegmentDuration']);

        this.elTarget.innerText = `${targetPower}w`;

        const intensityPct = this.getProp(state, ['intensity_pct', 'IntensityPct']);
        if (intensityPct && this.elIntensity) {
            this.elIntensity.innerText = `${intensityPct}%`;
        }

        const m = Math.floor(timeRemain / 60);
        const s = timeRemain % 60;
        this.elTimer.innerText = `${m}:${s.toString().padStart(2, '0')}`;

        this.elCompletion.innerText = Math.floor(completionPct) + "%";

        if (this.currentSegIdx !== currentIdx) {
            const prevProg = document.getElementById(`prog-${this.currentSegIdx}`);
            const prevSeg = document.getElementById(`seg-${this.currentSegIdx}`);
            if (prevProg) prevProg.style.width = '100%';
            if (prevSeg) prevSeg.classList.remove('active');

            this.currentSegIdx = currentIdx;

            const curr = document.getElementById(`seg-${this.currentSegIdx}`);
            if (curr) {
                curr.classList.add('active');
                curr.scrollIntoView({ behavior: 'smooth', block: 'center' });
                this.elMessage.innerText = this.getSegmentTypeLabel(currentIdx);
            }
        }

        const currentProg = document.getElementById(`prog-${this.currentSegIdx}`);
        if (currentProg && segDuration > 0) {
            const elapsed = segDuration - timeRemain;
            const pct = (elapsed / segDuration) * 100;
            currentProg.style.width = `${pct}%`;
        }
        this.renderGraph(completionPct);
    }

    renderGraph(completionPct) {
        if (!this.canvas || !this.ctx) return;
        if (!this.activeWorkout) return;

        const segments = this.getProp(this.activeWorkout, ['segments', 'Segments']);
        if (!segments || segments.length === 0) return;

        let totalDur = this.getProp(this.activeWorkout, ['total_duration', 'TotalDuration']);
        if (!totalDur) {
            totalDur = segments.reduce((acc, s) => acc + (this.getProp(s, ['duration', 'DurationSeconds', 'Duration']) || 0), 0);
        }
        if (!totalDur || totalDur === 0) return;

        const parent = this.canvas.parentElement;
        const rect = parent.getBoundingClientRect();

        if (this.canvas.width !== rect.width || this.canvas.height !== rect.height) {
            this.canvas.width = rect.width;
            this.canvas.height = rect.height;
            this.lastWidth = rect.width;
            this.lastHeight = rect.height;
        } else {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }

        const w = this.canvas.width;
        const h = this.canvas.height;

        this.ctx.fillStyle = "rgba(0,0,0,0.2)";
        this.ctx.fillRect(0, 0, w, h);

        let x = 0;
        const maxFactor = 1.3;

        segments.forEach(seg => {
            const duration = this.getProp(seg, ['duration', 'DurationSeconds', 'Duration']) || 0;
            const startFactor = this.getProp(seg, ['start_factor', 'StartFactor']) || 0;
            const endFactor = this.getProp(seg, ['end_factor', 'EndFactor']) || startFactor;

            const segW = (duration / totalDur) * w;
            if (!isFinite(segW)) return;

            const yStart = h - (startFactor / maxFactor) * h;
            const yEnd = h - (endFactor / maxFactor) * h;

            this.ctx.fillStyle = this.getZoneColor(startFactor);

            this.ctx.beginPath();
            this.ctx.moveTo(x, h);
            this.ctx.lineTo(x, yStart);
            this.ctx.lineTo(x + segW, yEnd);
            this.ctx.lineTo(x + segW, h);
            this.ctx.closePath();
            this.ctx.fill();

            this.ctx.strokeStyle = "rgba(0,0,0,0.3)";
            this.ctx.lineWidth = 1;
            this.ctx.stroke();

            x += segW;
        });

        const cursorX = (completionPct / 100) * w;
        if (isFinite(cursorX)) {
            this.ctx.fillStyle = "rgba(0,0,0,0.6)";
            this.ctx.fillRect(0, 0, cursorX, h);

            this.ctx.beginPath();
            this.ctx.moveTo(cursorX, 0);
            this.ctx.lineTo(cursorX, h);
            this.ctx.strokeStyle = "#fff";
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
        }
    }

    getZone(factor) {
        if (factor < 0.60) return 1;
        if (factor < 0.76) return 2;
        if (factor < 0.91) return 3;
        if (factor < 1.06) return 4;
        return 5;
    }

    getZoneColor(factor) {
        const zone = this.getZone(factor);
        switch (zone) {
            case 1: return "#7f8c8d";
            case 2: return "#3498db";
            case 3: return "#2ecc71";
            case 4: return "#f1c40f";
            case 5: return "#e74c3c";
            default: return "#fff";
        }
    }

    getSegmentTypeLabel(idx) {
        if (!this.activeWorkout) return "";
        const segments = this.getProp(this.activeWorkout, ['segments', 'Segments']);
        const seg = segments.find(s => (this.getProp(s, ['index', 'Index']) === idx));
        if (!seg) return "";

        const type = this.getProp(seg, ['type', 'Type']) || "";
        return type.replace('_', ' ');
    }

    renderList() {
        this.list.innerHTML = '';
        const segments = this.getProp(this.activeWorkout, ['segments', 'Segments']);
        if (!segments) return;

        segments.forEach((seg) => {
            const index = this.getProp(seg, ['index', 'Index']);
            const startFactor = this.getProp(seg, ['start_factor', 'StartFactor']);
            const duration = this.getProp(seg, ['duration', 'DurationSeconds', 'Duration']);
            const type = this.getProp(seg, ['type', 'Type']);

            const div = document.createElement('div');
            div.className = `workout-segment zone-${this.getZone(startFactor)}`;
            div.id = `seg-${index}`;

            const minutes = Math.floor(duration / 60);
            const seconds = duration % 60;
            const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            const powerDesc = `${Math.round(startFactor * 100)}%`;

            div.innerHTML = `
                <div class="segment-progress-fill" id="prog-${index}"></div>
                <span class="segment-info" style="position:relative; z-index:2;">
                    ${type === 'RAMP' ? 'RAMP' : powerDesc}
                </span>
                <span class="segment-duration" style="position:relative; z-index:2;">
                    ${timeStr}
                </span>
            `;
            this.list.appendChild(div);
        });
    }

    // Helper method to display a temporary notification
    showToast(message, duration = 5000) {
        const toast = document.getElementById('toast-notification');
        if (!toast) return;

        toast.innerText = message;
        toast.classList.remove('hidden');

        // Small delay to allow the CSS transition to work
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        // Removes the message after the defined time (default 5 seconds)
        setTimeout(() => {
            toast.classList.remove('show');

            // Waits for the fade-out animation to finish before hiding the element
            setTimeout(() => {
                toast.classList.add('hidden');
            }, 500);
        }, duration);
    }

    async adjustIntensity(delta) {
        if (!this.activeWorkout) return;

        try {
            const newPct = await window.go.main.App.ChangeWorkoutIntensity(delta);

            if (this.elIntensity) this.elIntensity.innerText = `${newPct}%`;

        } catch (err) {
            console.error("Error adjusting intensity:", err);
        }
    }
}