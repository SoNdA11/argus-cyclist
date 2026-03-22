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

import { CONFIG } from '../config.js';
import * as echarts from 'echarts';

/**
 * UIManager
 * Responsible for handling all UI updates, user interactions,
 * formatting, timers, modals, and integration with backend (Go/Wails).
 */

export class UIManager {
    constructor() {
        /**
         * Cached DOM elements used throughout the UI.
         * This avoids repeated DOM queries and improves performance.
         */
        this.els = {
            // Telemetry values
            watts: document.getElementById('watts'),
            hr: document.getElementById('hr'),
            rpm: document.getElementById('rpm'),
            grade: document.getElementById('grade'),
            elevation: document.getElementById('elevation'),
            dist: document.getElementById('dist'),
            speed: document.getElementById('speed'),
            time: document.getElementById('time'),
            wkg: document.getElementById('wkg'),
            distRem: document.getElementById('distRem'),

            // Main controls
            btnImport: document.getElementById('btnImport'),
            btnAction: document.getElementById('btnAction'),
            btnOpenSettings: document.getElementById('btnOpenSettings'),

            // Settings Modal Elements
            settingsModal: document.getElementById('settingsModal'),
            btnCloseSettings: document.getElementById('btnCloseSettings'),
            inputRiderWeight: document.getElementById('inputRiderWeight'),
            inputBikeWeight: document.getElementById('inputBikeWeight'),
            selectUnits: document.getElementById('selectUnits'),

            // Confirm Modal Elements
            confirmModal: document.getElementById('confirmModal'),
            btnResume: document.getElementById('btnResume'),
            btnFinishSave: document.getElementById('btnFinishSave'),
            btnDiscard: document.getElementById('btnDiscard'),

            // Route progress
            cursor: document.getElementById('progressCursor'),
            filename: document.getElementById('filename'),

            // Warning & profile
            tokenWarning: document.getElementById('token-warning'),
            inputName: document.getElementById('inputName'),
            inputFTP: document.getElementById('inputFTP'),
            inputMaxHR: document.getElementById('inputMaxHR'),
            inputLTHR: document.getElementById('inputLTHR'),
            inputRestingHR: document.getElementById('inputRestingHR'),

            // History & statistics
            historyContainer: document.getElementById('historyContainer'),
            statTotalDist: document.getElementById('statTotalDist'),
            statTotalActivities: document.getElementById('statTotalActivities'),

            // --- Dashboard Elements ---
            btnToggleView: document.getElementById('btnToggleView'),
            dashboardView: document.getElementById('dashboard-view'),
            mapContainer: document.getElementById('map-container'),
            hudSidebar: document.querySelector('.hud-sidebar'),
            dashPower: document.getElementById('dash-power'),
            dashWkg: document.getElementById('dash-wkg'),
            dashHr: document.getElementById('dash-hr'),
            dashRpm: document.getElementById('dash-rpm'),
            dashSpeed: document.getElementById('dash-speed'),
            dashDist: document.getElementById('dash-dist'),
            dashTime: document.getElementById('dash-time'),
        };

        // --- GLOBAL ACCESS ---
        window.ui = this;

        // --- VIEW STATE ---
        this.isDashboardMode = false; // Tracks if map is hidden

        // --- TIMER STATE ---
        this.timerInterval = null;
        this.secondsElapsed = 0;

        // --- USER PREFERENCES ---
        this.riderWeight = CONFIG.DEFAULT_RIDER_WEIGHT;
        this.bikeWeight = CONFIG.DEFAULT_BIKE_WEIGHT;
        this.units = CONFIG.DEFAULT_UNITS; // 'metric' or 'imperial'

        // Form & Zones Thresholds
        this.ftp = 200; // Default FTP fallback
        this.maxHr = 190; // Default Max HR fallback for zones

        // --- CHART & CALENDAR STATE ---
        this.currentDate = new Date();
        window.changeMonth = (d) => this.changeMonth(d);

        // --- PHOTO ---
        this.currentPhotoData = "";

        this.level = 1;
        this.xp = 0;
        this.nextLevelXp = 500;

        // --- Live Chart Data Arrays ---
        this.liveChartInstance = null;
        this.liveTimeData = [];
        this.livePowerData = [];
        this.liveHrData = [];
        this.liveCadenceData = [];

        const workoutPanel = document.getElementById('workout-panel');
        if (workoutPanel && this.els.dashboardView) {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.attributeName === 'class') {
                        const isOpen = !workoutPanel.classList.contains('hidden');
                        this.els.dashboardView.style.right = isOpen ? '340px' : '0px';
                        if (this.liveChartInstance) {
                            setTimeout(() => this.liveChartInstance.resize(), 300);
                        }
                    }
                });
            });
            observer.observe(workoutPanel, { attributes: true });
        }
    }

    // ===========
    // VIEW TOGGLE
    // ===========

    /**
     * Toggles the application between Map View and Offline Dashboard View
     */
    toggleDashboardMode() {
        this.isDashboardMode = !this.isDashboardMode;

        if (this.isDashboardMode) {
            this.els.dashboardView.classList.remove('hidden');
            this.els.mapContainer.style.display = 'none';
            this.els.hudSidebar.style.display = 'none';

            // --- Initialize and resize chart ---
            this.initLiveChart();
            if (this.liveChartInstance) {
                setTimeout(() => this.liveChartInstance.resize(), 100);
            }
        } else {
            this.els.dashboardView.classList.add('hidden');
            this.els.mapContainer.style.display = 'block';
            this.els.hudSidebar.style.display = 'flex';

            setTimeout(() => {
                if (window.mapController) {
                    window.mapController.forceResize();
                }
            }, 100);
        }
    }

    // ====================
    // LIVE DASHBOARD CHART
    // ====================

    initLiveChart() {
        const chartDom = document.getElementById('liveDashboardChart');
        if (!chartDom) return;

        // Initialize ECharts instance if it doesn't exist
        if (!this.liveChartInstance) {
            this.liveChartInstance = echarts.init(chartDom, 'dark', { background: 'transparent' });
        }

        const option = {
            animation: false,
            tooltip: { trigger: 'axis' },
            legend: {
                data: ['Power (w)', 'Heart Rate (bpm)', 'Cadence (rpm)'],
                textStyle: { color: '#ccc' },
                top: 0
            },
            grid: { left: '3%', right: '3%', bottom: '5%', top: 40, containLabel: true },
            xAxis: {
                type: 'category',
                boundaryGap: false,
                data: this.liveTimeData,
                axisLabel: { color: '#888' },
                splitLine: { show: false }
            },
            yAxis: [
                {
                    type: 'value',
                    name: 'Watts',
                    position: 'left',
                    splitLine: { lineStyle: { color: '#333', type: 'dashed' } }
                },
                {
                    type: 'value',
                    name: 'BPM / RPM',
                    position: 'right',
                    splitLine: { show: false }
                }
            ],
            series: [
                {
                    name: 'Power (w)',
                    type: 'line',
                    yAxisIndex: 0,
                    symbol: 'none',
                    itemStyle: { color: '#f1c40f' },
                    areaStyle: { color: 'rgba(241, 196, 15, 0.1)' },
                    data: this.livePowerData
                },
                {
                    name: 'Heart Rate (bpm)',
                    type: 'line',
                    yAxisIndex: 1,
                    symbol: 'none',
                    itemStyle: { color: '#e74c3c' },
                    smooth: true,
                    data: this.liveHrData
                },
                {
                    name: 'Cadence (rpm)',
                    type: 'line',
                    yAxisIndex: 1,
                    symbol: 'none',
                    itemStyle: { color: '#3498db' },
                    smooth: true,
                    data: this.liveCadenceData
                }
            ]
        };

        this.liveChartInstance.setOption(option);
    }

    // =========================
    // PREFERENCES & UNIT FORMAT
    // =========================

    /**
     * Format distance according to selected unit system.
     * @param {number} meters
     * @returns {{val: string, unit: string}}
     */
    formatDist(meters) {
        if (this.units === 'imperial') {
            const miles = meters * 0.000621371;
            return { val: miles.toFixed(2), unit: 'mi' };
        }
        return { val: (meters / 1000).toFixed(2), unit: 'km' };
    }

    /**
     * Format speed according to selected unit system.
     * @param {number} kph
     * @returns {{val: string, unit: string}}
     */
    formatSpeed(kph) {
        if (this.units === 'imperial') {
            const mph = kph * 0.621371;
            return { val: mph.toFixed(1), unit: 'mph' };
        }
        return { val: kph.toFixed(1), unit: 'km/h' };
    }

    // =================
    // TELEMETRY ZONES
    // =================

    getPowerZoneColor(power) {
        if (!power || power === 0) return ''; // Fallback to CSS default when coasting
        const pct = power / this.ftp;
        if (pct < 0.55) return 'var(--zone-1)'; // Recovery
        if (pct < 0.75) return 'var(--zone-2)'; // Endurance
        if (pct < 0.90) return 'var(--zone-3)'; // Tempo
        if (pct < 1.05) return 'var(--zone-4)'; // Threshold
        if (pct < 1.20) return 'var(--zone-5)'; // VO2 Max
        return 'var(--zone-6)';                 // Anaerobic
    }

    getHeartRateZoneColor(hr) {
        if (!hr || hr === 0) return ''; // Fallback to CSS default
        const pct = hr / this.maxHr;
        if (pct < 0.60) return 'var(--zone-1)';
        if (pct < 0.70) return 'var(--zone-2)';
        if (pct < 0.80) return 'var(--zone-3)';
        if (pct < 0.90) return 'var(--zone-4)';
        return 'var(--zone-6)'; // Red for zone 5+ HR
    }

    // =================
    // TELEMETRY UPDATES
    // =================

    /**
     * Update all telemetry-related UI elements.
     * @param {Object} data - Telemetry data from backend
     * @param {number} totalRouteDistance - Total route distance in meters
     */
    updateTelemetry(data, totalRouteDistance = 0) {
        // Evaluate dynamic zone colors
        const powerColor = this.getPowerZoneColor(data.power);
        const hrColor = this.getHeartRateZoneColor(data.heart_rate);

        // Raw telemetry values
        this.els.watts.innerHTML = `${data.power}<span class="data-unit">w</span>`;
        this.els.watts.style.color = powerColor;

        this.els.rpm.innerHTML = `${data.cadence}<span class="data-unit">rpm</span>`;

        this.els.hr.innerHTML = `${data.heart_rate}<span class="data-unit">❤</span>`;
        this.els.hr.style.color = hrColor;

        this.els.grade.innerHTML = `${data.grade.toFixed(1)}<span class="data-unit">%</span>`;

        // Speed (unit-aware)
        const speedObj = this.formatSpeed(data.speed);
        this.els.speed.innerHTML = `${speedObj.val}<span class="data-unit">${speedObj.unit}</span>`;

        // Distance (unit-aware)
        const distObj = this.formatDist(data.total_dist);
        this.els.dist.innerHTML = `${distObj.val}<span class="data-unit">${distObj.unit}</span>`;

        // Elevation Gain (unit-aware and NaN-safe)
        if (this.els.elevation) {
            const accumulatedGain = data.elevation_gain || 0;
            const isImperial = this.units === 'imperial';
            const eleVal = isImperial ? (accumulatedGain * 3.28084) : accumulatedGain;
            const eleUnit = isImperial ? 'ft' : 'm';

            this.els.elevation.innerHTML = `${Math.round(eleVal)}<span class="data-unit">${eleUnit}</span>`;
        }

        // Watts per kilogram
        const totalWeight = this.riderWeight;
        const wkgVal = (data.power / totalWeight).toFixed(2);
        this.els.wkg.innerHTML = `${wkgVal}<span class="data-unit">w/kg</span>`;

        // Remaining distance and route progress cursor (Laps Support)
        if (totalRouteDistance > 0) {
            const lapDist = data.total_dist % totalRouteDistance;
            const remainingMeters = Math.max(0, totalRouteDistance - lapDist);
            const remObj = this.formatDist(remainingMeters);

            const currentLap = Math.floor(data.total_dist / totalRouteDistance) + 1;

            this.els.distRem.innerHTML = `${remObj.val}<span class="data-unit">${remObj.unit} (L${currentLap})</span>`;

            const pct = Math.min((lapDist / totalRouteDistance) * 100, 100);
            this.els.cursor.style.left = pct + '%';
        }

        // --- NEW: Update Dashboard Mode Data & Chart ---
        if (this.isDashboardMode) {
            this.els.dashPower.innerHTML = `${data.power}<span class="dash-unit">w</span>`;
            this.els.dashPower.style.color = powerColor;

            this.els.dashWkg.innerText = `${wkgVal} w/kg`;

            this.els.dashHr.innerHTML = `${data.heart_rate}<span class="dash-unit">bpm</span>`;
            this.els.dashHr.style.color = hrColor;

            this.els.dashRpm.innerHTML = `${data.cadence}<span class="dash-unit">rpm</span>`;
            this.els.dashSpeed.innerHTML = `${speedObj.val}<span class="dash-unit">${speedObj.unit}</span>`;
            this.els.dashDist.innerHTML = `${distObj.val}<span class="dash-unit">${distObj.unit}</span>`;

            // Keep chart data array length to max 60 seconds (or points) so it scrolls horizontally
            if (this.livePowerData.length > 60) {
                this.livePowerData.shift();
                this.liveHrData.shift();
                this.liveCadenceData.shift();
                this.liveTimeData.shift();
            }

            const h = Math.floor((this.secondsElapsed || 0) / 3600).toString().padStart(2, '0');
            const m = Math.floor(((this.secondsElapsed || 0) % 3600) / 60).toString().padStart(2, '0');
            const s = ((this.secondsElapsed || 0) % 60).toString().padStart(2, '0');
            const timeStr = `${h}:${m}:${s}`;

            this.liveTimeData.push(timeStr);
            this.livePowerData.push(data.power);
            this.liveHrData.push(data.heart_rate);
            this.liveCadenceData.push(data.cadence);

            if (this.liveChartInstance) {
                this.liveChartInstance.setOption({
                    xAxis: { data: this.liveTimeData },
                    series: [
                        { data: this.livePowerData },
                        { data: this.liveHrData },
                        { data: this.liveCadenceData }
                    ]
                });
            }
        }
    }

    /**
     * Display the currently loaded route filename.
     */
    setFilename(name) {
        this.els.filename.innerText = "| " + name;
    }

    // ===============
    // RESET TELEMETRY
    // ===============

    resetDashboardData() {
        this.secondsElapsed = 0;
        this.updateTimerDisplay();

        if (this.els.dashPower) {
            this.els.dashPower.innerHTML = `0<span class="dash-unit">w</span>`;
            this.els.dashPower.style.color = '';
        }
        if (this.els.dashWkg) this.els.dashWkg.innerText = `0.0 w/kg`;
        if (this.els.dashHr) {
            this.els.dashHr.innerHTML = `--<span class="dash-unit">bpm</span>`;
            this.els.dashHr.style.color = '';
        }
        if (this.els.dashRpm) this.els.dashRpm.innerHTML = `0<span class="dash-unit">rpm</span>`;
        if (this.els.dashSpeed) this.els.dashSpeed.innerHTML = `0.0<span class="dash-unit">km/h</span>`;
        if (this.els.dashDist) this.els.dashDist.innerHTML = `0.00<span class="dash-unit">km</span>`;

        if (this.els.watts) {
            this.els.watts.innerHTML = `0<span class="data-unit">w</span>`;
            this.els.watts.style.color = '';
        }
        if (this.els.wkg) this.els.wkg.innerHTML = `0.0<span class="data-unit">w/kg</span>`;
        if (this.els.hr) {
            this.els.hr.innerHTML = `--<span class="data-unit">❤</span>`;
            this.els.hr.style.color = '';
        }
        if (this.els.rpm) this.els.rpm.innerHTML = `0<span class="data-unit">rpm</span>`;
        if (this.els.speed) this.els.speed.innerHTML = `0.0<span class="data-unit">km/h</span>`;
        if (this.els.dist) this.els.dist.innerHTML = `0.0<span class="data-unit">km</span>`;

        this.liveTimeData = [];
        this.livePowerData = [];
        this.liveHrData = [];
        this.liveCadenceData = [];

        if (this.liveChartInstance) {
            this.liveChartInstance.setOption({
                xAxis: { data: this.liveTimeData },
                series: [
                    { data: this.livePowerData },
                    { data: this.liveHrData },
                    { data: this.liveCadenceData }
                ]
            });
        }
    }

    // =============
    // ROUTE PREVIEW
    // =============

    /**
     * Display route statistics before the ride starts.
     * @param {number} totalDistance - Total route distance in meters
     * @param {number} totalElevation - Total elevation gain in meters (optional)
     */
    showRoutePreview(totalDistance, totalElevation = 0) {
        // Reset telemetry values to zero/dash
        this.els.watts.innerHTML = `0<span class="data-unit">w</span>`;
        this.els.watts.style.color = '';

        this.els.rpm.innerHTML = `0<span class="data-unit">rpm</span>`;

        this.els.hr.innerHTML = `--<span class="data-unit">❤</span>`;
        this.els.hr.style.color = '';

        this.els.grade.innerHTML = `0.0<span class="data-unit">%</span>`;

        if (this.els.elevation) {
            const eleUnit = this.units === 'imperial' ? 'ft' : 'm';
            this.els.elevation.innerHTML = `0<span class="data-unit">${eleUnit}</span>`;
        }

        this.els.speed.innerHTML = `0.0<span class="data-unit">km/h</span>`; // Or miles based on preference
        this.els.wkg.innerHTML = `0.0<span class="data-unit">w/kg</span>`;

        // Reset Timer
        this.els.time.innerText = `00:00:00`;

        // Set the Total Distance
        const distObj = this.formatDist(totalDistance);
        this.els.dist.innerHTML = `0.0<span class="data-unit">${distObj.unit}</span>`; // Start at 0

        // Set the Remaining Distance to the Total Distance
        const remObj = this.formatDist(totalDistance);
        this.els.distRem.innerHTML = `${remObj.val}<span class="data-unit">${remObj.unit}</span>`;

        // Reset Cursor
        if (this.els.cursor) {
            this.els.cursor.style.left = '0%';
        }
    }

    // ===========
    // TIMER LOGIC
    // ===========

    startTimer() {
        this.stopTimer();
        this.updateTimerDisplay();
        this.timerInterval = setInterval(() => {
            this.secondsElapsed++;
            this.updateTimerDisplay();
        }, 1000);
    }

    stopTimer() {
        if (this.timerInterval) clearInterval(this.timerInterval);
    }

    resetTimer() {
        this.stopTimer();
        this.secondsElapsed = 0;
        this.updateTimerDisplay();
    }

    startRouteEditor() {
        document.getElementById('routeEditorPanel').style.display = 'block';
        document.getElementById('btnOpenEditor').style.display = 'none'; // Esconde botão de abrir

        // Zera stats
        document.getElementById('editorDist').innerText = "0.0 km";
        document.getElementById('editorElev').innerText = "0 m";
        document.getElementById('editorRouteName').value = "";

        window.mapController.enableEditorMode();
    }

    cancelRoute() {
        document.getElementById('routeEditorPanel').style.display = 'none';
        document.getElementById('btnOpenEditor').style.display = 'block';

        window.mapController.disableEditorMode();
    }

    /**
     * Update HH:MM:SS timer display.
     */
    updateTimerDisplay() {
        const h = Math.floor(this.secondsElapsed / 3600).toString().padStart(2, '0');
        const m = Math.floor((this.secondsElapsed % 3600) / 60).toString().padStart(2, '0');
        const s = (this.secondsElapsed % 60).toString().padStart(2, '0');
        const timeStr = `${h}:${m}:${s}`;

        this.els.time.innerText = timeStr;

        // --- Update Dashboard Time ---
        if (this.els.dashTime) {
            this.els.dashTime.innerText = timeStr;
        }
    }

    // ===================
    // MODALS & UI STATES
    // ===================

    /**
     * Open or close the settings modal.
     */
    toggleSettings(show) {
        if (show) {
            this.loadUserProfile();
            this.loadHistory(); // Load history when opening settings
            this.els.settingsModal.classList.add('active');
        } else {
            this.saveUserProfile();
            this.els.settingsModal.classList.remove('active');
        }
    }

    /**
     * Open or close the confirmation modal.
     */
    toggleConfirmModal(show) {
        if (show) this.els.confirmModal.classList.add('active');
        else this.els.confirmModal.classList.remove('active');
    }

    /**
     * Update UI based on recording state.
     * @param {'RECORDING' | 'PAUSED' | 'IDLE'} state
     */
    setRecordingState(state) {
        if (state === 'RECORDING') {
            this.els.btnAction.innerText = "STOP";
            this.els.btnAction.className = "btn-action btn-stop";
            this.els.btnImport.disabled = true;
            this.startTimer();
            this.toggleConfirmModal(false);
        } else if (state === 'PAUSED') {
            this.stopTimer();
            this.toggleConfirmModal(true);
        } else { // IDLE
            this.els.btnAction.innerText = "START RIDE";
            this.els.btnAction.className = "btn-action btn-start";
            this.els.btnImport.disabled = false;
            this.resetTimer();
            this.toggleConfirmModal(false);
        }
    }

    /**
     * Show authentication/token warning message.
     */
    showTokenWarning() {
        this.els.tokenWarning.classList.remove('hidden');
        this.els.tokenWarning.style.display = 'block';
    }

    // ==========================
    // DATABASE / BACKEND METHODS
    // ==========================

    /**
     * Load user profile from backend (Go/Wails).
     */
    async loadUserProfile() {
        try {
            const profile = await window.go.main.App.GetUserProfile();

            this.els.inputName.value = profile.name || "";
            this.els.inputRiderWeight.value = profile.weight || 75;
            this.els.inputBikeWeight.value = profile.bike_weight || 9;
            this.els.inputFTP.value = profile.ftp || 200;
            this.els.inputMaxHR.value = profile.max_hr || 190;
            this.els.inputLTHR.value = profile.lthr || 170;
            this.els.inputRestingHR.value = profile.resting_hr || 60;

            this.riderWeight = profile.weight;
            this.bikeWeight = profile.bike_weight;
            this.els.selectUnits.value = profile.units || "metric";
            this.units = this.els.selectUnits.value;

            // Sync logic states for dynamic zones
            this.ftp = profile.ftp || 200;
            this.maxHr = profile.max_hr || 190;

            this.level = profile.level || 1;
            this.xp = profile.current_xp || 0;

            const lvlLabel = document.getElementById('level-val');
            if (lvlLabel) lvlLabel.innerText = this.level;
            this.updateXPBarUI();

            // Set Photo Details Update if on main view
            if (document.getElementById('profileNameDisplay')) {
                document.getElementById('profileNameDisplay').innerText = profile.name || "Cyclist";
            }
            if (profile.photo && profile.photo.length > 10 && document.getElementById('profileImage')) {
                document.getElementById('profileImage').src = profile.photo;
                this.currentPhotoData = profile.photo;
            }

            console.log("Profile Loaded:", profile);
        } catch (e) {
            console.error("Error loading profile:", e);
        }
    }

    // --- CHART & CALENDAR LOGIC ---

    formatDuration(seconds) {
        if (!seconds) {
            return "00:00";
        }

        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);

        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }

        return `${minutes}m`;
    }

    changeMonth(delta) {
        this.currentDate.setMonth(
            this.currentDate.getMonth() + delta
        );

        this.renderCalendar();
    }

    /**
     * Save user profile to backend.
     */
    async saveUserProfile() {
        const profile = {
            name: this.els.inputName.value,
            photo: this.currentPhotoData,
            weight: parseFloat(this.els.inputRiderWeight.value),
            bike_weight: parseFloat(this.els.inputBikeWeight.value),
            ftp: parseInt(this.els.inputFTP.value),
            max_hr: parseInt(this.els.inputMaxHR.value) || 190,
            lthr: parseInt(this.els.inputLTHR.value) || 170,
            resting_hr: parseInt(this.els.inputRestingHR.value) || 60,

            units: this.els.selectUnits.value,
            level: this.level,
            current_xp: parseInt(this.xp)
        };

        try {
            await window.go.main.App.UpdateUserProfile(profile);
            this.riderWeight = profile.weight;
            this.bikeWeight = profile.bike_weight;
            this.units = profile.units;
            this.ftp = profile.ftp;

            if (document.getElementById('profileNameDisplay')) {
                document.getElementById('profileNameDisplay').innerText = profile.name;
            }
            console.log("Profile Saved");
        } catch (e) {
            alert("Error saving profile: " + e);
        }
    }

    /**
     * Load activity history and global statistics.
     */
    async loadHistory() {
        try {
            const activities = await window.go.main.App.GetActivities();
            const stats = await window.go.main.App.GetTotalStats();

            this.renderPowerCurve();
            this.renderCalendar();

            if (stats) {
                this.els.statTotalDist.innerText = (stats.total_km || 0).toFixed(1) + " km";
                this.els.statTotalActivities.innerText = activities.length;

                const totalSec = stats.total_time || 0;
                const h = Math.floor(totalSec / 3600);
                const m = Math.floor((totalSec % 3600) / 60);
                document.getElementById('statTotalTime').innerText = `${h}h ${m}m`;
            }

            this.renderActivityList(activities);
        } catch (e) { console.error(e); }
    }

    renderActivityList(activities) {
        this.els.historyContainer.innerHTML = "";
        if (!activities || activities.length === 0) {
            this.els.historyContainer.innerHTML = "<div style='padding:1rem'>No activities.</div>";
            return;
        }

        activities.forEach(act => {
            const date = act.created_at ? new Date(act.created_at).toLocaleDateString() : "--/--";
            const dist = (act.total_distance / 1000).toFixed(1) + " km";
            const name = act.route_name || "Free Training";
            const pwr = act.avg_power || 0;
            const trimp = act.trimp || 0;

            const rawFilename = act.filename || "";
            const safeFilename = rawFilename.replace(/\\/g, '\\\\');

            const div = document.createElement('div');
            div.className = 'history-item';
            div.style.cursor = 'pointer';

            div.onmouseover = () => div.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
            div.onmouseout = () => div.style.backgroundColor = 'transparent';

            div.onclick = () => {
                this.openActivityDetail(act);
            };

            div.innerHTML = `
    <span style="flex: 2;">${date} - <small style="color: var(--text-muted);">${name}</small></span>
    
    <span style="flex: 1; text-align: center;">${dist}</span>
    
    <span style="flex: 1; text-align: center; color: var(--power-color); font-weight: bold;">${pwr}w</span>

    <span style="flex: 1; text-align: center; color: #e74c3c; font-weight: bold;" title="TRIMP">${trimp}</span> <div style="display: flex; gap: 12px; width: 80px; justify-content: flex-end; align-items: center; padding-right: 10px;">
    
    <div style="display: flex; gap: 12px; width: 80px; justify-content: flex-end; align-items: center; padding-right: 10px;">
        
        <span 
            title="Open Folder" 
            class="icon-minimal"
            onclick="event.stopPropagation(); window.go.main.App.OpenFileFolder('${safeFilename}')"
        >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>
            </svg>
        </span>
        
        <span 
            title="Delete Workout" 
            class="icon-minimal icon-minimal-danger"
            onclick="event.stopPropagation(); if(confirm('Are you sure you want to delete this workout? Statistics will be recalculated and the file will be removed from disk.')) { 
                const targetId = ${act.ID ? act.ID : act.id};
                window.go.main.App.DeleteActivityHistory(targetId).then(() => {
                    window.ui.toggleSettings(true);
                    window.ui.loadCareerDashboard(); 
                }).catch(err => alert('Error deleting: ' + err)); 
            }"
        >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
            </svg>
        </span>
        
    </div>
`;

            this.els.historyContainer.appendChild(div);
        });
    }

    async renderCalendar() {
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth() + 1;

        document.getElementById('calendarTitle').innerText = this.currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });
        const container = document.getElementById('calendarGrid');
        container.innerHTML = "";

        // Cabeçalhos
        ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach(d => container.innerHTML += `<div class="cal-day-header">${d}</div>`);

        const activities = await window.go.main.App.GetMonthlyActivities(year, month);
        const actMap = {};
        activities.forEach(a => actMap[new Date(a.created_at).getDate()] = true);

        const firstDay = new Date(year, month - 1, 1).getDay();
        const daysInMonth = new Date(year, month, 0).getDate();
        const today = new Date();

        for (let i = 0; i < firstDay; i++) container.innerHTML += `<div></div>`;

        for (let d = 1; d <= daysInMonth; d++) {
            const hasAct = actMap[d];
            const isToday = (d === today.getDate() && month - 1 === today.getMonth() && year === today.getFullYear());
            let cls = "cal-day";
            if (hasAct) cls += " active";
            if (isToday) cls += " today";

            const dot = hasAct ? `<div class="cal-dot"></div>` : '';
            container.innerHTML += `<div class="${cls}">${d}${dot}</div>`;
        }
    }

    async renderBestEfforts() {
        try {
            const best = await window.go.main.App.GetBestEfforts();

            document.getElementById('recPower').innerText = (best.max_power || 0) + "w";

            const distKm = (best.max_distance || 0) / 1000;
            document.getElementById('recDist').innerText = distKm.toFixed(1) + "km";

            document.getElementById('recTime').innerText = this.formatDuration(best.max_duration || 0);

        } catch (e) {
            console.error("Error loading records:", e);
        }
    }

    formatDurationLabel(seconds) {
        if (seconds < 60) return seconds + "s";
        return (seconds / 60) + "min";
    }

    async renderPowerCurve() {
        try {
            const records = await window.go.main.App.GetPowerCurve();
            const tbody = document.getElementById('powerCurveBody');
            tbody.innerHTML = "";

            records.forEach(rec => {
                const label = this.formatDurationLabel(rec.duration);
                const dateObj = new Date(rec.date);
                const dateStr = dateObj.toLocaleDateString() + " " + dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                if (rec.watts === 0) return;

                const row = `
                    <tr>
                        <td>${label}</td>
                        <td class="col-watts">${rec.watts}w</td>
                        <td>${rec.wkg.toFixed(2)}</td>
                        <td class="col-date">${dateStr}</td>
                    </tr>
                `;
                tbody.innerHTML += row;
            });

            if (tbody.innerHTML === "") {
                tbody.innerHTML = "<tr><td colspan='4' style='text-align:center; padding:10px;'>No records yet</td></tr>";
            }

        } catch (e) { console.error(e); }
    }

    async saveRoute() {
        const points = window.mapController.getGeneratedRoute();
        if (!points || points.length === 0) {
            alert("Create a route first by clicking 2 points on map.");
            return;
        }

        const name = document.getElementById('editorRouteName').value.trim();

        try {
            const result = await window.go.main.App.SaveGeneratedGPX(name, points);
            alert(result);

            this.cancelRoute();
        } catch (e) {
            alert("Error saving: " + e);
        }
    }

    async selectProfileImage() {
        try {
            const base64Data = await window.go.main.App.SelectProfileImage();
            if (base64Data) {
                document.getElementById('profileImage').src = base64Data;
                this.currentPhotoData = base64Data;
            }
        } catch (e) {
            console.error(e);
        }
    }

    addXP(amount) {
        this.xp += amount;

        if (this.xp >= this.nextLevelXp) {
            this.levelUp();
        }

        this.updateXPBarUI();
    }

    levelUp() {
        this.level++;
        this.xp = Math.max(0, this.xp - this.nextLevelXp);
        this.nextLevelXp = Math.floor(this.nextLevelXp * 1.2);

        console.log(`LEVEL UP! Nível ${this.level}`);

        const lvlLabel = document.getElementById('level-val');
        if (lvlLabel) lvlLabel.innerText = this.level;

        this.saveUserProfile();
    }

    updateXPBarUI() {
        const pct = Math.min((this.xp / this.nextLevelXp) * 100, 100);

        const bar = document.getElementById('xp-fill');
        if (bar) {
            bar.style.width = `${pct}%`;
        }
    }

    showFinishModal(summary) {
        const modal = document.getElementById('finishModal');
        if (!modal) return;

        if (summary && summary.activity) {
            document.getElementById('finish-np').innerText = summary.activity.normalized_power ? `${summary.activity.normalized_power} w` : '-- w';
            document.getElementById('finish-if').innerText = summary.activity.intensity_factor ? summary.activity.intensity_factor.toFixed(2) : '--';
            document.getElementById('finish-tss').innerText = summary.activity.tss ? summary.activity.tss.toFixed(1) : '--';
            document.getElementById('finish-cal').innerText = summary.activity.calories ? summary.activity.calories : '--';
            document.getElementById('finish-trimp').innerText = summary.activity.trimp || '--';

            if (summary.zones && summary.activity.duration > 0) {
                this.renderZoneBar(summary.zones, summary.activity.duration);
            }
        }

        modal.classList.add('active');
    }

    renderZoneBar(zones, totalDurationSec) {
        const bar = document.getElementById('finish-zones-bar');
        if (!bar) return;

        bar.innerHTML = '';

        const zoneKeys = [
            { key: 'z1_time', color: 'var(--zone-1)' },
            { key: 'z2_time', color: 'var(--zone-2)' },
            { key: 'z3_time', color: 'var(--zone-3)' },
            { key: 'z4_time', color: 'var(--zone-4)' },
            { key: 'z5_time', color: 'var(--zone-5)' },
            { key: 'z6_time', color: 'var(--zone-6)' }
        ];

        zoneKeys.forEach(zone => {
            const timeInSec = zones[zone.key] || 0;
            if (timeInSec > 0) {
                const pct = (timeInSec / totalDurationSec) * 100;
                const segment = document.createElement('div');
                segment.className = 'zone-segment';
                segment.style.width = `${pct}%`;
                segment.style.backgroundColor = zone.color;

                const mins = Math.floor(timeInSec / 60);
                segment.title = `${Math.round(pct)}% (${mins} min)`;

                bar.appendChild(segment);
            }
        });
    }

    closeFinishModal() {
        const modal = document.getElementById('finishModal');
        if (modal) modal.classList.remove('active');
        this.setRecordingState('IDLE');
    }

    closeDetailModal() {
        const modal = document.getElementById('activityDetailModal');
        if (modal) modal.classList.remove('active');

        if (this.masterChartInstance) {
            this.masterChartInstance.dispose();
            this.masterChartInstance = null;
        }
        if (this.mmpChartInstance) {
            this.mmpChartInstance.dispose();
            this.mmpChartInstance = null;
        }
    }

    async openActivityDetail(activity) {
        try {
            const modal = document.getElementById('activityDetailModal');
            document.getElementById('detail-route-name').innerText = activity.route_name || "Treino Livre";
            document.getElementById('detail-metrics').innerHTML = "<p>Carregando dados do arquivo FIT...</p>";
            modal.classList.add('active');

            const rawFilename = activity.filename || "";
            const safeFilename = rawFilename.replace(/\\/g, '\\\\');
            const details = await window.go.main.App.GetActivityDetails(safeFilename);

            if (!details || !details.power || details.power.length === 0) {
                document.getElementById('detail-metrics').innerHTML = "<p>Sem dados de telemetria neste arquivo.</p>";
                return;
            }

            const durationMin = Math.round(activity.duration / 60);
            const distKm = (activity.total_distance / 1000).toFixed(2);

            document.getElementById('detail-metrics').innerHTML = `
                <div class="detail-metric-row"><span class="label">Duration</span><span class="value">${durationMin} min</span></div>
                <div class="detail-metric-row"><span class="label">Distance</span><span class="value">${distKm} km</span></div>
                <div class="detail-metric-row"><span class="label">Average Power</span><span class="value" style="color:var(--power-color)">${activity.avg_power} w</span></div>
                <div class="detail-metric-row"><span class="label">Normalized Power</span><span class="value" style="color:var(--power-color)">${activity.normalized_power || '--'} w</span></div>
                <div class="detail-metric-row"><span class="label">Intensity Factor (IF)</span><span class="value">${(activity.intensity_factor || 0).toFixed(2)}</span></div>
                <div class="detail-metric-row"><span class="label">TSS</span><span class="value">${(activity.tss || 0).toFixed(1)}</span></div>
                <div class="detail-metric-row"><span class="label">Calories</span><span class="value">${activity.calories || '--'} kcal</span></div>
            `;

            this.renderMasterChart(details);
            this.renderMMPChart(details.power);

        } catch (error) {
            console.error("Erro ao carregar detalhes:", error);
            document.getElementById('detail-metrics').innerHTML = `<p style="color:red">Erro: ${error}</p>`;
        }
    }

    renderMasterChart(details) {
        const chartDom = document.getElementById('masterChart');
        this.masterChartInstance = echarts.init(chartDom, 'dark', { background: 'transparent' });

        const timeAxis = details.time || [];

        const option = {
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'cross' }
            },
            legend: {
                data: ['Elevation', 'Power (w)', 'Heart Rate (bpm)', 'Cadence (rpm)'],
                textStyle: { color: '#ccc' },
                selected: { 'Elevation': false }
            },
            grid: { left: '3%', right: '4%', bottom: '15%', containLabel: true },
            dataZoom: [
                { type: 'inside', start: 0, end: 100 },
                { start: 0, end: 100 }
            ],
            xAxis: {
                type: 'category',
                boundaryGap: false,
                data: timeAxis,
                axisLabel: { color: '#888' }
            },
            yAxis: [
                {
                    type: 'value',
                    name: 'Watts',
                    position: 'left',
                    splitLine: { lineStyle: { color: '#333' } }
                },
                {
                    type: 'value',
                    name: 'BPM / RPM',
                    position: 'right',
                    splitLine: { show: false }
                },
                {
                    type: 'value',
                    show: false,
                    min: 'dataMin',
                    max: function (value) {
                        if (value.max === value.min) return value.max + 10;
                        return value.max + (value.max - value.min) * 0.8;
                    }
                }
            ],
            series: [
                {
                    name: 'Elevation',
                    type: 'line',
                    yAxisIndex: 2,
                    symbol: 'none',
                    itemStyle: { color: '#888888' },
                    lineStyle: { width: 0 },
                    areaStyle: {
                        color: 'rgba(120, 120, 120, 0.25)'
                    },
                    data: details.elevation || []
                },
                {
                    name: 'Power (w)',
                    type: 'line',
                    yAxisIndex: 0,
                    symbol: 'none',
                    itemStyle: { color: '#f1c40f' },
                    lineStyle: { width: 1.5, color: '#f1c40f' },
                    data: details.power
                },
                {
                    name: 'Heart Rate (bpm)',
                    type: 'line',
                    yAxisIndex: 1,
                    symbol: 'none',
                    itemStyle: { color: '#e74c3c' },
                    lineStyle: { width: 1.5, color: '#e74c3c' },
                    data: details.hr
                },
                {
                    name: 'Cadence (rpm)',
                    type: 'line',
                    yAxisIndex: 1,
                    symbol: 'none',
                    itemStyle: { color: '#3498db' },
                    lineStyle: { width: 1, color: '#3498db' },
                    data: details.cadence
                }
            ]
        };

        this.masterChartInstance.setOption(option);
    }

    renderMMPChart(powerData) {
        const chartDom = document.getElementById('mmpChart');
        this.mmpChartInstance = echarts.init(chartDom, 'dark', { background: 'transparent' });

        const intervals = [1, 5, 15, 30, 60, 300, 600, 1200];
        const mmpValues = intervals.map(duration => {
            if (powerData.length < duration) return 0;
            let maxAvg = 0;
            for (let i = 0; i <= powerData.length - duration; i++) {
                let sum = 0;
                for (let j = 0; j < duration; j++) sum += powerData[i + j];
                let avg = sum / duration;
                if (avg > maxAvg) maxAvg = avg;
            }
            return Math.round(maxAvg);
        });

        const labels = ['1s', '5s', '15s', '30s', '1m', '5m', '10m', '20m'];

        const option = {
            title: { text: 'Power Curve (MMP)', textStyle: { fontSize: 12, color: '#aaa' } },
            tooltip: { trigger: 'axis' },
            grid: { left: '10%', right: '5%', bottom: '15%', top: '20%' },
            xAxis: {
                type: 'category',
                data: labels,
                axisLabel: { color: '#888' }
            },
            yAxis: {
                type: 'value',
                splitLine: { lineStyle: { color: '#333' } }
            },
            series: [{
                data: mmpValues,
                type: 'bar',
                itemStyle: { color: '#e67e22', borderRadius: [4, 4, 0, 0] },
                label: { show: true, position: 'top', color: '#fff' }
            }]
        };

        this.mmpChartInstance.setOption(option);
    }

    async loadCareerDashboard() {
        try {
            const dashboardData = await window.go.main.App.GetCareerDashboard();
            if (dashboardData) {
                this.renderPMCChart(dashboardData.pmc || []);
                this.renderCareerMMPChart(dashboardData.mmp || []);
            }
        } catch (error) {
            console.error("Error loading Career Dashboard:", error);
        }
    }

    renderPMCChart(pmcData) {
        const chartDom = document.getElementById('pmcChart');
        if (!chartDom) return;

        if (this.pmcChartInstance) {
            this.pmcChartInstance.dispose();
        }
        this.pmcChartInstance = echarts.init(chartDom, 'dark', { background: 'transparent' });

        const dates = pmcData.map(d => d.date);
        const ctl = pmcData.map(d => d.ctl);
        const atl = pmcData.map(d => d.atl);
        const tsb = pmcData.map(d => d.tsb);

        const option = {
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'cross' }
            },
            legend: {
                data: ['CTL (Fitness)', 'ATL (Fatigue)', 'TSB (Form)'],
                textStyle: { color: '#ccc' }
            },
            grid: { left: '5%', right: '5%', bottom: '15%', containLabel: true },
            dataZoom: [
                { type: 'inside', start: pmcData.length > 90 ? 70 : 0, end: 100 },
                { start: pmcData.length > 90 ? 70 : 0, end: 100 }
            ],
            xAxis: {
                type: 'category',
                boundaryGap: false,
                data: dates,
                axisLabel: { color: '#888' }
            },
            yAxis: {
                type: 'value',
                splitLine: { lineStyle: { color: '#333' } }
            },
            series: [
                {
                    name: 'TSB (Form)',
                    type: 'bar',
                    itemStyle: { color: '#3498db' },
                    data: tsb
                },
                {
                    name: 'ATL (Fatigue)',
                    type: 'line',
                    symbol: 'none',
                    itemStyle: { color: '#e056fd' },
                    lineStyle: { width: 2, color: '#e056fd' },
                    data: atl
                },
                {
                    name: 'CTL (Fitness)',
                    type: 'line',
                    symbol: 'none',
                    itemStyle: { color: '#f1c40f' },
                    lineStyle: { width: 3, color: '#f1c40f' },
                    areaStyle: { color: 'rgba(241, 196, 15, 0.2)' },
                    data: ctl
                }
            ]
        };

        this.pmcChartInstance.setOption(option);
    }

    renderCareerMMPChart(mmpData) {
        const chartDom = document.getElementById('careerMmpChart');
        if (!chartDom) return;

        if (this.careerMmpChartInstance) {
            this.careerMmpChartInstance.dispose();
        }
        this.careerMmpChartInstance = echarts.init(chartDom, 'dark', { background: 'transparent' });

        mmpData.sort((a, b) => a.duration - b.duration);

        const formatDuration = (secs) => {
            if (secs < 60) return secs + 's';
            return Math.floor(secs / 60) + 'm';
        };

        const labels = mmpData.map(d => formatDuration(d.duration));
        const watts = mmpData.map(d => d.watts);

        const option = {
            tooltip: { trigger: 'axis' },
            grid: { left: '5%', right: '5%', bottom: '15%', top: '15%', containLabel: true },
            xAxis: {
                type: 'category',
                data: labels,
                axisLabel: { color: '#888' }
            },
            yAxis: {
                type: 'value',
                name: 'Watts',
                splitLine: { lineStyle: { color: '#333' } }
            },
            series: [{
                name: 'Max Power All-Time',
                data: watts,
                type: 'bar',
                itemStyle: { color: '#f39c12', borderRadius: [4, 4, 0, 0] },
                label: { show: true, position: 'top', color: '#fff' }
            }]
        };

        this.careerMmpChartInstance.setOption(option);
    }

}