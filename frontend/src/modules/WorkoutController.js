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

import * as echarts from 'echarts';
import { telemetryBus } from './TelemetryEventBus.js';
import { Capacitor } from '@capacitor/core';

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

        this.studioCanvas = document.getElementById('studio-workout-canvas');
        this.studioCtx = this.studioCanvas ? this.studioCanvas.getContext('2d') : null;

        this.lastWidth = 0;

        // Mobile (Capacitor) State
        this.mobileInterval = null;
        this.mobileElapsedTime = 0;
        this.intensityPct = 100;

        // --- BINDING EVENTS ---

        // 1. Desktop Mode (Wails)
        if (window.runtime && !Capacitor.isNativePlatform()) {
            window.runtime.EventsOn("workout_loaded", (wo) => this.loadWorkout(wo));
            window.runtime.EventsOn("workout_status", (state) => this.updateStatus(state));
            window.runtime.EventsOn("workout_finished", (status) => {
                if (!this.activeWorkout) return;
                if (status === "completed") {
                    this.showCompletionActions();
                    this.showToast("Workout completed!\n\nSwitched to Free Ride (SIM).\nYou can repeat or load a new workout.", 5000);
                } else {
                    this.hide();
                }
            });
            telemetryBus.subscribe((data) => this.updateTelemetry(data));
        }

        window.addEventListener('resize', () => {
            if (this.activeWorkout && !this.panel.classList.contains('hidden')) {
                this.lastWidth = 0;
                this.renderGraph(this.lastPct || 0);
            }
        });
    }

    showCompletionActions() {
        if (this.list) this.list.classList.add('hidden');
        const actions = document.getElementById('workout-completion-actions');
        if (actions) actions.classList.remove('hidden');
        if (this.elMessage) this.elMessage.innerText = "WORKOUT COMPLETE";
        if (this.elTarget) this.elTarget.innerText = "--";
        if (this.elTimer) this.elTimer.innerText = "--:--";
    }

    getProp(obj, keys) {
        if (!obj) return undefined;
        for (const key of keys) {
            if (obj[key] !== undefined) return obj[key];
        }
        return undefined;
    }

    /**
     * Loads the workout. Called by Wails on Desktop, or manually on Mobile via WASM.
     */
    loadWorkout(workout) {
        console.log("WORKOUT: Loading...", workout);
        this.activeWorkout = workout;
        this.panel.classList.remove('hidden');

        if (this.list) this.list.classList.remove('hidden');
        const actions = document.getElementById('workout-completion-actions');
        if (actions) actions.classList.add('hidden');

        const isTest = this.getProp(workout, ['is_test', 'IsTest']);
        if (isTest) {
            document.getElementById('map-container').style.display = 'none';
            const footer = document.querySelector('footer');
            if (footer) footer.style.display = 'none';

            const leftSidebar = document.querySelector('.hud-sidebar:not(#workout-panel)');
            if (leftSidebar) leftSidebar.style.display = 'none';

            document.getElementById('dashboard-view').classList.remove('hidden');

            if (window.ui) {
                window.ui.isDashboardMode = true;
                window.ui.initLiveChart();
                setTimeout(() => { if (window.ui.liveChartInstance) window.ui.liveChartInstance.resize(); }, 150);
            }
        } else {
            document.getElementById('map-container').style.display = '';
            document.getElementById('dashboard-view').classList.add('hidden');
            const footer = document.querySelector('footer');
            if (footer) footer.style.display = '';

            const leftSidebar = document.querySelector('.hud-sidebar:not(#workout-panel)');
            if (leftSidebar) leftSidebar.style.display = '';

        }


        setTimeout(() => {
            if (window.mapController && window.mapController.map) {
                window.mapController.map.resize();
            } else {
                window.dispatchEvent(new Event('resize'));
            }
        }, 50);

        this.renderList();

        requestAnimationFrame(() => this.renderGraph(0));

        // --- MOBILE ONLY: Start Local Timer ---
        if (Capacitor.isNativePlatform()) {
            this.startMobileWorkoutLoop();
        }
    }

    hide() {
        this.panel.classList.add('hidden');
        this.activeWorkout = null;
        this.stopMobileWorkoutLoop();

        document.getElementById('map-container').style.display = '';
        document.getElementById('dashboard-view').classList.add('hidden');

        const footer = document.querySelector('footer');
        if (footer) footer.style.display = '';

        const leftSidebar = document.querySelector('.hud-sidebar:not(#workout-panel)');
        if (leftSidebar) leftSidebar.style.display = '';

        if (window.ui) {
            window.ui.isDashboardMode = false;
        }

        setTimeout(() => {
            if (window.mapController && window.mapController.map) {
                window.mapController.map.resize();
            } else {
                window.dispatchEvent(new Event('resize'));
            }
        }, 50);

        if (window.ui) {
            window.ui.toggleStudioMode(false);
        }
    }

    initStudioChart() {
        if (!this.studioCanvas) return;
        setTimeout(() => {
            const rect = this.studioCanvas.parentElement.getBoundingClientRect();
            this.studioCanvas.width = rect.width;
            this.studioCanvas.height = rect.height;
            this.renderGraph(this.lastPct || 0);
        }, 100);
    }

    // =================================
    // MOBILE (CAPACITOR) WORKOUT ENGINE
    // =================================

    startMobileWorkoutLoop() {
        this.stopMobileWorkoutLoop();
        this.mobileElapsedTime = 0;
        this.currentSegIdx = -1;

        const segments = this.getProp(this.activeWorkout, ['segments', 'Segments']) || [];
        const totalDuration = this.getProp(this.activeWorkout, ['total_duration', 'TotalDuration']) ||
            segments.reduce((acc, s) => acc + (this.getProp(s, ['duration', 'DurationSeconds']) || 0), 0);

        if (totalDuration === 0) return;

        this.mobileInterval = setInterval(() => {
            if (!window.isRecording) return; // Only count time if session is active

            this.mobileElapsedTime++;
            let accumulatedTime = 0;
            let currentSegment = null;
            let segmentElapsed = 0;

            // Find current segment
            for (let i = 0; i < segments.length; i++) {
                const seg = segments[i];
                const dur = this.getProp(seg, ['duration', 'DurationSeconds']);

                if (this.mobileElapsedTime <= accumulatedTime + dur) {
                    currentSegment = seg;
                    segmentElapsed = this.mobileElapsedTime - accumulatedTime;
                    break;
                }
                accumulatedTime += dur;
            }

            if (!currentSegment) {
                // Workout Finished
                this.hide();
                this.showToast("Workout completed!\nSwitched to Free Ride.", 5000);
                if (window.mobileBLE) window.mobileBLE.setERGMode(false); // Return to SIM
                return;
            }

            const ftp = window.ui ? window.ui.inputFTP.value : 200;
            const startFactor = this.getProp(currentSegment, ['start_factor', 'StartFactor']) || 0;
            const endFactor = this.getProp(currentSegment, ['end_factor', 'EndFactor']) || startFactor;
            const dur = this.getProp(currentSegment, ['duration', 'DurationSeconds']);

            // Calculate interpolated target power (for Ramps)
            const progress = segmentElapsed / dur;
            const currentFactor = startFactor + (endFactor - startFactor) * progress;
            const targetWatts = Math.round(ftp * currentFactor * (this.intensityPct / 100));

            const completionPct = (this.mobileElapsedTime / totalDuration) * 100;
            const timeRemain = dur - segmentElapsed;

            // Update UI State object matching Go backend structure
            const state = {
                is_active: true,
                completion_percent: completionPct,
                target_power: targetWatts,
                segment_time_remain: timeRemain,
                current_segment_index: this.getProp(currentSegment, ['index', 'Index']),
                segment_duration: dur,
                intensity_pct: this.intensityPct
            };

            this.updateStatus(state);

            // SEND ERG COMMAND TO TRAINER (Only if changed to avoid flooding)
            if (window.mobileBLE && targetWatts !== this.lastTargetWatts) {
                window.mobileBLE.sendTargetPower(targetWatts);
                this.lastTargetWatts = targetWatts;
            }

        }, 1000);
    }

    stopMobileWorkoutLoop() {
        if (this.mobileInterval) {
            clearInterval(this.mobileInterval);
            this.mobileInterval = null;
        }
        this.lastTargetWatts = -1;
    }

    // =========================================
    // UI UPDATES (Shared by Desktop and Mobile)
    // =========================================

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

        const isFreeRide = this.getProp(state, ['is_free_ride', 'IsFreeRide']);

        if (isFreeRide) {
            this.elTarget.innerText = "FREE RIDE";
            this.elTarget.style.color = "#3498db";
            this.elMessage.innerText = "FREE RIDE - CONTROL YOUR GEARS";
            this.elMessage.style.color = "#3498db";
            
            if (window.ui && window.ui.els.studioTarget) {
                window.ui.els.studioTarget.innerText = "FREE RIDE";
                window.ui.els.studioTarget.style.color = "#3498db";
            }
        } else {
            this.elTarget.innerText = `${targetPower}w`;
            this.elTarget.style.color = "";
            this.elMessage.style.color = "";

            if (window.ui && window.ui.els.studioTarget) {
                window.ui.els.studioTarget.innerText = `${targetPower}W`;
                window.ui.els.studioTarget.style.color = "";
            }
        }

        if (window.ui && window.ui.isDashboardMode) {
            const dashPowerSub = document.getElementById('dash-wkg');
            if (dashPowerSub) {
                if (isFreeRide) {
                    dashPowerSub.innerHTML = `<span style="color:#3498db; font-weight:bold; font-size:1.1rem; letter-spacing:1px;">TARGET: FREE RIDE</span>`;
                } else {
                    dashPowerSub.innerHTML = `<span style="color:#f1c40f; font-weight:bold; font-size:1.1rem; letter-spacing:1px;">TARGET: ${targetPower} W</span>`;
                }
            }
        }

        const intensityPct = this.getProp(state, ['intensity_pct', 'IntensityPct']);
        if (intensityPct) {
            const text = `${intensityPct}%`;
            if (this.elIntensity) this.elIntensity.innerText = text;
            if (window.ui && window.ui.els.studioIntensity) {
                window.ui.els.studioIntensity.innerText = text;
            }
        }

        const m = Math.floor(timeRemain / 60);
        const s = timeRemain % 60;
        const timeStr = `${m}:${s.toString().padStart(2, '0')}`;
        this.elTimer.innerText = timeStr;
        this.elCompletion.innerText = Math.floor(completionPct) + "%";

        if (window.ui && window.ui.els.studioTimer) {
            window.ui.els.studioTimer.innerText = timeStr;
        }

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
                if (!isFreeRide) {
                    const label = this.getSegmentTypeLabel(currentIdx);
                    this.elMessage.innerText = label;
                    if (window.ui && window.ui.els.studioTimerLabel) {
                        window.ui.els.studioTimerLabel.innerText = label;
                    }
                }
            }
        }

        // Update Zone Visual Cue
        if (window.ui && window.ui.isStudioMode) {
            const segments = this.getProp(this.activeWorkout, ['segments', 'Segments']);
            const seg = segments.find(s => this.getProp(s, ['index', 'Index']) === currentIdx);
            if (seg) {
                const factor = this.getProp(seg, ['start_factor', 'StartFactor']);
                const zone = this.getZone(factor);
                
                // Clear previous zones
                for (let i = 1; i <= 6; i++) window.ui.els.studioHud.classList.remove(`zone-${i}`);
                window.ui.els.studioHud.classList.add(`zone-${zone}`);
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
        this.lastPct = completionPct; // Store for re-renders
        
        // Render on Standard Canvas (Sidebar)
        if (this.canvas && this.ctx && this.panel && !this.panel.classList.contains('hidden')) {
            this._drawGraphOnCanvas(this.canvas, this.ctx, completionPct);
        }

        // Render on Studio Canvas
        if (this.studioCanvas && this.studioCtx && window.ui && window.ui.isStudioMode) {
            this._drawGraphOnCanvas(this.studioCanvas, this.studioCtx, completionPct);
        }
    }

    _drawGraphOnCanvas(canvas, ctx, completionPct) {
        if (!this.activeWorkout) return;

        const segments = this.getProp(this.activeWorkout, ['segments', 'Segments']);
        if (!segments || segments.length === 0) return;

        let totalDur = this.getProp(this.activeWorkout, ['total_duration', 'TotalDuration']);
        if (!totalDur) {
            totalDur = segments.reduce((acc, s) => acc + (this.getProp(s, ['duration', 'DurationSeconds', 'Duration']) || 0), 0);
        }
        if (!totalDur || totalDur === 0) return;

        const rect = canvas.parentElement.getBoundingClientRect();
        if (canvas.width !== rect.width || canvas.height !== rect.height) {
            canvas.width = rect.width;
            canvas.height = rect.height;
        } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }

        const w = canvas.width;
        const h = canvas.height;

        ctx.fillStyle = "rgba(0,0,0,0.2)";
        ctx.fillRect(0, 0, w, h);

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

            ctx.fillStyle = this.getZoneColor(startFactor);

            ctx.beginPath();
            ctx.moveTo(x, h);
            ctx.lineTo(x, yStart);
            ctx.lineTo(x + segW, yEnd);
            ctx.lineTo(x + segW, h);
            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = "rgba(0,0,0,0.3)";
            ctx.lineWidth = 1;
            ctx.stroke();

            x += segW;
        });

        const cursorX = (completionPct / 100) * w;
        if (isFinite(cursorX)) {
            ctx.fillStyle = "rgba(0,0,0,0.6)";
            ctx.fillRect(0, 0, cursorX, h);

            ctx.beginPath();
            ctx.moveTo(cursorX, 0);
            ctx.lineTo(cursorX, h);
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 2;
            ctx.stroke();
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

        const updateDisplay = (pct) => {
            const text = `${pct}%`;
            if (this.elIntensity) this.elIntensity.innerText = text;
            if (window.ui && window.ui.els.studioIntensity) {
                window.ui.els.studioIntensity.innerText = text;
            }
        };

        // Mobile Logic
        if (Capacitor.isNativePlatform()) {
            this.intensityPct += delta;
            if (this.intensityPct < 50) this.intensityPct = 50;
            if (this.intensityPct > 150) this.intensityPct = 150;
            updateDisplay(this.intensityPct);
            return;
        }

        // Desktop Logic
        try {
            if (window.go && window.go.main) {
                const newPct = await window.go.main.App.ChangeWorkoutIntensity(delta);
                updateDisplay(newPct);
            }
        } catch (err) {
            console.error("Error adjusting intensity:", err);
        }
    }
}