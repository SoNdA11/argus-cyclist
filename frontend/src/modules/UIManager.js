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
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

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

    // ========================================
    // PHYSIOLOGICAL METRICS ZONES (SCIENTIFIC)
    // ========================================

    getTSSColor(value) {
        if (!value || value <= 0) return 'var(--text-main)';
        if (value < 150) return '#2ecc71'; // Safe (Green)
        if (value <= 300) return '#3498db'; // Neutral (Blue)
        if (value <= 450) return '#f1c40f'; // Warn (Yellow)
        return '#e74c3c'; // Alert (Red)
    }

    getIFColor(value) {
        if (!value || value <= 0) return 'var(--text-main)';
        if (value < 0.75) return '#2ecc71'; // Safe
        if (value <= 0.85) return '#3498db'; // Neutral
        if (value <= 0.95) return '#f1c40f'; // Warn
        return '#e74c3c'; // Alert
    }

    getTRIMPColor(value) {
        if (!value || value <= 0) return 'var(--text-main)';
        if (value <= 70) return '#2ecc71'; // Safe
        if (value <= 140) return '#3498db'; // Neutral
        if (value <= 250) return '#f1c40f'; // Warn
        return '#e74c3c'; // Alert
    }

    getDriftColor(value) {
        if (value == null || isNaN(value)) return 'var(--text-main)';
        if (value < 5) return '#2ecc71'; // Safe
        if (value < 10) return '#f1c40f'; // Warn (Yellow)
        return '#e74c3c'; // Alert (Poor Endurance)
    }

    getHRRColor(value) {
        if (!value || value <= 0) return 'var(--text-main)'; // Default fallback
        if (value < 12) return '#e74c3c'; // Alert (Severe Risk)
        if (value <= 20) return '#f1c40f'; // Warn (Average)
        if (value <= 35) return '#2ecc71'; // Safe (Good)
        return '#3498db'; // Elite (Neutral/Blue indicator)
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
     * Opens the settings modal on the Profile tab and focuses the FTP field.
     */
    async openProfileSettings() {
        this.toggleSettings(true);

        document.querySelectorAll('.tab-pane').forEach((el) => el.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach((el) => el.classList.remove('active'));

        const profileTab = document.getElementById('tab-profile');
        const profileTabButton = document.querySelector('.tab-btn[onclick*="tab-profile"]');

        if (profileTab) profileTab.classList.add('active');
        if (profileTabButton) profileTabButton.classList.add('active');

        await this.loadUserProfile();

        if (this.els.inputFTP) {
            this.els.inputFTP.focus();
            this.els.inputFTP.select();
        }
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

            const isUploaded = act.uploaded_to_strava;
            const stravaColor = isUploaded ? '#FC4C02' : 'var(--text-muted)';
            const stravaTitle = isUploaded ? 'Already uploaded to Strava' : 'Upload to Strava';
            const stravaAction = isUploaded ? '' : `onclick="event.stopPropagation(); window.uploadHistoricalToStrava(${act.id || act.ID}, event)"`;
            const stravaCursor = isUploaded ? 'default' : 'pointer';

            div.innerHTML = `
                <span style="flex: 2;">${date} - <small style="color: var(--text-muted);">${name}</small></span>
                <span style="flex: 1; text-align: center;">${dist}</span>
                <span style="flex: 1; text-align: center; color: var(--power-color); font-weight: bold;">${pwr}w</span>
                <span style="flex: 1; text-align: center; color: #e74c3c; font-weight: bold;" title="TRIMP">${trimp}</span> 
                
                <div style="display: flex; gap: 12px; width: 100px; justify-content: flex-end; align-items: center; padding-right: 10px;">
                    
                    <span 
                        title="${stravaTitle}" 
                        class="icon-minimal"
                        id="btn-strava-hist-${act.id || act.ID}"
                        style="color: ${stravaColor}; cursor: ${stravaCursor};"
                        ${stravaAction}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                        </svg>
                    </span>

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
                            const targetId = ${act.id || act.ID};
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
            document.getElementById('finish-hrr').innerText = `${summary.activity.hrr_1 || 0} / ${summary.activity.hrr_2 || 0} bpm`;

            const decouplingEl = document.getElementById('finish-decoupling');
            if (decouplingEl) {
                const durationSec = summary.activity.duration || 0;
                const drift = summary.activity.aerobic_decoupling || 0;

                // Only show valid decoupling for rides longer than 1 hour (3600s)
                if (durationSec >= 3600) {
                    // Display yellow warning emoji if drift > 5%
                    const warning = drift > 5.0 ? `<span title="High Cardiovascular Drift! Indicates lack of base aerobic conditioning." style="color: #f1c40f; font-size: 1.1rem;">⚠️</span>` : '';
                    decouplingEl.innerHTML = `${drift.toFixed(1)}% ${warning}`;
                } else {
                    decouplingEl.innerText = 'N/A (<1h)';
                }
            }

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
        this.currentViewedActivity = activity;

        try {
            const modal = document.getElementById('activityDetailModal');
            document.getElementById('detail-route-name').innerText = activity.route_name || "Free Ride";

            document.getElementById('detail-metrics-grid').innerHTML = "<p style='grid-column: span 5; text-align: center; padding: 20px;'>Loading FIT file data...</p>";
            modal.classList.add('active');

            const rawFilename = activity.filename || "";
            const safeFilename = rawFilename.replace(/\\/g, '\\\\');
            const details = await window.go.main.App.GetActivityDetails(safeFilename);

            if (!details || !details.power || details.power.length === 0) {
                document.getElementById('detail-metrics-grid').innerHTML = "<p style='grid-column: span 5; text-align: center; padding: 20px;'>No telemetry data in this file.</p>";
                return;
            }

            const durationMin = Math.round(activity.duration / 60);
            const distKm = (activity.total_distance / 1000).toFixed(2);
            const decoupling = activity.duration >= 3600 ? (activity.aerobic_decoupling || 0).toFixed(1) + '%' : 'N/A';

            // 1. Refactored tooltips: using data-metric and forcing z-index to ensure clickability
            const trimpTooltip = `
                <span class="tooltip-wrapper">
                    TRIMP <span class="info-icon" style="cursor: pointer; position: relative; z-index: 50;" data-metric="TRIMP">?</span>
                    <div class="tooltip-content">
                        <strong style="color: #fff; display: block; margin-bottom: 5px;">Training Impulse (Banister)</strong>
                        <table class="tooltip-table">
                            <tr><td><span class="dot-safe">●</span> 0 - 70</td><td style="text-align: right;">Recovery</td></tr>
                            <tr><td><span class="dot-neutral">●</span> 71 - 140</td><td style="text-align: right;">Maintenance</td></tr>
                            <tr><td><span class="dot-warn">●</span> 141 - 250</td><td style="text-align: right;">Hard</td></tr>
                            <tr><td><span class="dot-alert">●</span> &gt; 250</td><td style="text-align: right;">Extreme</td></tr>
                        </table>
                    </div>
                </span>
            `;

            const driftTooltip = `
                <span class="tooltip-wrapper">
                    Pw:HR Drift <span class="info-icon" style="cursor: pointer; position: relative; z-index: 50;" data-metric="DRIFT">?</span>
                    <div class="tooltip-content">
                        <strong style="color: #fff; display: block; margin-bottom: 5px;">Aerobic Decoupling (Friel)</strong>
                        <table class="tooltip-table">
                            <tr><td><span class="dot-safe">●</span> &lt; 5%</td><td style="text-align: right;">Solid Base</td></tr>
                            <tr><td><span class="dot-warn">●</span> 5 - 9.9%</td><td style="text-align: right;">Moderate</td></tr>
                            <tr><td><span class="dot-alert">●</span> &gt; 10%</td><td style="text-align: right;">Poor Endurance</td></tr>
                        </table>
                        <div style="margin-top: 8px; font-size: 0.7rem; color: #aaa; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 5px; line-height: 1.3;">
                            <i>Note: High drift is expected during interval training. Only valid for steady-state efforts.</i>
                        </div>
                    </div>
                </span>
            `;

            const hrrTooltip = `
                <span class="tooltip-wrapper">
                    HRR (1m/2m) <span class="info-icon" style="cursor: pointer; position: relative; z-index: 50;" data-metric="HRR">?</span>
                    <div class="tooltip-content">
                        <strong style="color: #fff; display: block; margin-bottom: 5px;">HR Recovery 1M (Cole et al.)</strong>
                        <table class="tooltip-table">
                            <tr><td><span class="dot-alert">●</span> &lt; 12 bpm</td><td style="text-align: right;">Severe Risk</td></tr>
                            <tr><td><span class="dot-warn">●</span> 13 - 20 bpm</td><td style="text-align: right;">Average</td></tr>
                            <tr><td><span class="dot-safe">●</span> 21 - 35 bpm</td><td style="text-align: right;">Good</td></tr>
                            <tr><td><span class="dot-neutral">●</span> &gt; 35 bpm</td><td style="text-align: right;">Elite</td></tr>
                        </table>
                    </div>
                </span>
            `;

            const ifTooltip = `
                <span class="tooltip-wrapper">
                    IF® <span class="info-icon" style="cursor: pointer; position: relative; z-index: 50;" data-metric="IF">?</span>
                    <div class="tooltip-content">
                        <strong style="color: #fff; display: block; margin-bottom: 5px;">Intensity Factor (Allen)</strong>
                        <table class="tooltip-table">
                            <tr><td><span class="dot-safe">●</span> &lt; 0.75</td><td style="text-align: right;">Recovery</td></tr>
                            <tr><td><span class="dot-neutral">●</span> 0.75 - 0.85</td><td style="text-align: right;">Endurance</td></tr>
                            <tr><td><span class="dot-warn">●</span> 0.85 - 0.95</td><td style="text-align: right;">Tempo / Sweet Spot</td></tr>
                            <tr><td><span class="dot-alert">●</span> &gt; 0.95</td><td style="text-align: right;">Threshold / Race</td></tr>
                        </table>
                    </div>
                </span>
            `;

            const tssTooltip = `
                <span class="tooltip-wrapper">
                    TSS® <span class="info-icon" style="cursor: pointer; position: relative; z-index: 50;" data-metric="TSS">?</span>
                    <div class="tooltip-content">
                        <strong style="color: #fff; display: block; margin-bottom: 5px;">Training Stress Score</strong>
                        <table class="tooltip-table">
                            <tr><td><span class="dot-safe">●</span> &lt; 150</td><td style="text-align: right;">Low (1 day rec.)</td></tr>
                            <tr><td><span class="dot-neutral">●</span> 150 - 300</td><td style="text-align: right;">Medium (1-2 days)</td></tr>
                            <tr><td><span class="dot-warn">●</span> 300 - 450</td><td style="text-align: right;">High (2+ days)</td></tr>
                            <tr><td><span class="dot-alert">●</span> &gt; 450</td><td style="text-align: right;">Epic (Several days)</td></tr>
                        </table>
                    </div>
                </span>
            `;

            const ifValue = activity.intensity_factor || 0;
            const tssValue = activity.tss || 0;
            const trimpValue = activity.trimp || 0;

            const driftValue = activity.duration >= 3600 ? activity.aerobic_decoupling : null;

            const ifColor = this.getIFColor(ifValue);
            const tssColor = this.getTSSColor(tssValue);
            const trimpColor = this.getTRIMPColor(trimpValue);
            const driftColor = driftValue !== null ? this.getDriftColor(driftValue) : 'var(--text-main)';
            const hrrColor = this.getHRRColor(activity.hrr_1);

            document.getElementById('detail-metrics-grid').innerHTML = `
                <div class="modern-stat-card"><span class="label">Duration</span><span class="value">${durationMin} m</span></div>
                <div class="modern-stat-card"><span class="label">Distance</span><span class="value">${distKm} km</span></div>
                <div class="modern-stat-card"><span class="label">Avg Power</span><span class="value" style="color:var(--power-color)">${activity.avg_power} w</span></div>
                <div class="modern-stat-card"><span class="label">NP®</span><span class="value" style="color:var(--power-color)">${activity.normalized_power || '--'} w</span></div>
                <div class="modern-stat-card"><span class="label">Calories</span><span class="value">${activity.calories || '--'} kcal</span></div>
                
                <div class="modern-stat-card">
                    <span class="label">${ifTooltip}</span>
                    <span class="value" style="color: ${ifColor}">${ifValue.toFixed(2)}</span>
                </div>
                <div class="modern-stat-card">
                    <span class="label">${tssTooltip}</span>
                    <span class="value" style="color: ${tssColor}">${tssValue.toFixed(1)}</span>
                </div>
                <div class="modern-stat-card">
                    <span class="label">${trimpTooltip}</span>
                    <span class="value" style="color: ${trimpColor}">${trimpValue || '--'}</span>
                </div>
                <div class="modern-stat-card">
                    <span class="label">${driftTooltip}</span>
                    <span class="value" style="color: ${driftColor}">${decoupling}</span>
                </div>
                <div class="modern-stat-card">
                    <span class="label">${hrrTooltip}</span>
                    <span class="value" style="color: ${hrrColor}">${activity.hrr_1 || 0}/${activity.hrr_2 || 0}</span>
                </div>
            `;

            // 2. Anexa os Eventos de Clique de forma segura via JS Moderno
            const infoIcons = document.querySelectorAll('#detail-metrics-grid .info-icon');
            infoIcons.forEach(icon => {
                icon.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation(); // Impede a tabela preta ou qualquer outro elemento de "roubar" o clique
                    const metricId = e.currentTarget.getAttribute('data-metric');
                    if (metricId) {
                        this.renderKnowledgeModal(metricId);
                    }
                });
            });

            // 3. Renderização da Analysis Box e Gráficos
            let analysisBox = document.getElementById('physiological-analysis-box');
            if (!analysisBox) {
                const chartsRow = document.querySelector('.charts-row');
                analysisBox = document.createElement('div');
                analysisBox.id = 'physiological-analysis-box';
                analysisBox.style.cssText = `
                    margin-top: 15px; 
                    padding: 15px; 
                    background: rgba(0,0,0,0.3); 
                    border: 1px dashed rgba(255,255,255,0.2); 
                    border-radius: 8px;
                    display: flex;
                    justify-content: space-around;
                    align-items: center;
                `;
                chartsRow.parentNode.insertBefore(analysisBox, chartsRow.nextSibling);
            }

            analysisBox.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: center; padding-right: 25px; margin-right: 15px; border-right: 1px solid rgba(255,255,255,0.1);">
                    <label style="display: flex; align-items: center; gap: 12px; cursor: pointer; color: #fff; font-size: 0.95rem; font-weight: bold; margin: 0; white-space: nowrap;">
                        <div class="toggle-switch">
                            <input type="checkbox" id="toggle-vt-lines" checked>
                            <span class="slider"></span>
                        </div>
                        Show VT1 & VT2
                    </label>
                </div>
                
                <div id="vt1-container" style="text-align: center; transition: opacity 0.3s; flex: 1;">
                    <h4 style="color: #2ecc71; margin:0 0 5px 0; font-size: 0.8rem; text-transform: uppercase;">VT1 / LT1 (Aerobic)</h4>
                    <span style="color: #ccc; font-size: 0.85rem;">Drag the <strong style="color:#2ecc71">GREEN</strong> line</span>
                    <div id="vt1-data" style="font-family: monospace; font-size: 1.2rem; font-weight: bold; margin-top: 5px;">-- w | -- bpm</div>
                </div>
                
                <div style="width: 1px; background: rgba(255,255,255,0.1); align-self: stretch; margin: 0 10px;"></div>
                
                <div id="vt2-container" style="text-align: center; transition: opacity 0.3s; flex: 1;">
                    <h4 style="color: #9b59b6; margin:0 0 5px 0; font-size: 0.8rem; text-transform: uppercase;">VT2 / LT2 (Anaerobic)</h4>
                    <span style="color: #ccc; font-size: 0.85rem;">Drag the <strong style="color:#9b59b6">PURPLE</strong> line</span>
                    <div id="vt2-data" style="font-family: monospace; font-size: 1.2rem; font-weight: bold; margin-top: 5px;">-- w | -- bpm</div>
                </div>
            `;

            this.renderMasterChart(details);
            this.renderMMPChart(details.power);

        } catch (error) {
            console.error("Error loading details:", error);
            document.getElementById('detail-metrics-grid').innerHTML = `<p style="grid-column: span 5; text-align: center; color: var(--argus-alert); padding: 20px;">Error: ${error}</p>`;
        }
    }

    renderMasterChart(details) {
        const chartDom = document.getElementById('masterChart');

        if (this.masterChartInstance) {
            this.masterChartInstance.dispose();
        }

        this.masterChartInstance = echarts.init(chartDom, 'dark', { background: 'transparent' });

        const timeAxis = details.time || [];
        const dataLength = timeAxis.length;

        let vt1Index = Math.floor(dataLength * 0.3);
        let vt2Index = Math.floor(dataLength * 0.7);

        const updatePhysioBox = (type, dataIndex) => {
            if (dataIndex < 0) dataIndex = 0;
            if (dataIndex >= dataLength) dataIndex = dataLength - 1;

            const pwr = details.power[dataIndex] || 0;
            const hr = details.hr[dataIndex] || 0;

            const el = document.getElementById(`${type}-data`);
            if (el) {
                el.innerText = `${pwr} w | ${hr} bpm`;
                el.style.color = '#fff';
                setTimeout(() => el.style.color = '', 300);
            }
        };

        const option = {
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'cross' }
            },
            legend: {
                data: ['Elevation', 'Power (w)', 'Heart Rate (bpm)', 'Cadence (rpm)', 'VT1', 'VT2'],
                textStyle: { color: '#ccc' },
                selected: { 'Elevation': false },
                top: 0
            },
            grid: { left: '3%', right: '4%', bottom: '12%', top: '12%', containLabel: true },
            dataZoom: [
                { type: 'inside', start: 0, end: 100 },
                { start: 0, end: 100, height: 20, bottom: 5 }
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
                    splitLine: { lineStyle: { color: '#333', type: 'dashed' } }
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
                    areaStyle: { color: 'rgba(120, 120, 120, 0.25)' },
                    data: details.elevation || []
                },
                {
                    name: 'Power (w)',
                    type: 'line',
                    yAxisIndex: 0,
                    symbol: 'none',
                    itemStyle: { color: '#f1c40f' },
                    lineStyle: { width: 2.5, color: '#f1c40f' },
                    areaStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: 'rgba(241, 196, 15, 0.3)' },
                            { offset: 1, color: 'rgba(241, 196, 15, 0.0)' }
                        ])
                    },
                    data: details.power
                },
                {
                    name: 'Heart Rate (bpm)',
                    type: 'line',
                    yAxisIndex: 1,
                    symbol: 'none',
                    itemStyle: { color: '#e74c3c' },
                    lineStyle: { width: 2.5, color: '#e74c3c' },
                    areaStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: 'rgba(231, 76, 60, 0.25)' },
                            { offset: 1, color: 'rgba(231, 76, 60, 0.0)' }
                        ])
                    },
                    data: details.hr
                },
                {
                    name: 'Cadence (rpm)',
                    type: 'line',
                    yAxisIndex: 1,
                    symbol: 'none',
                    itemStyle: { color: '#3498db' },
                    lineStyle: { width: 1.5, color: '#3498db', type: 'dashed' },
                    data: details.cadence
                },
                {
                    name: 'VT1',
                    type: 'line',
                    data: [],
                    symbol: 'none',
                    itemStyle: { color: '#2ecc71' },
                    lineStyle: { width: 2, color: '#2ecc71', type: 'dashed' }
                },
                {
                    name: 'VT2',
                    type: 'line',
                    data: [],
                    symbol: 'none',
                    itemStyle: { color: '#9b59b6' },
                    lineStyle: { width: 2, color: '#9b59b6', type: 'dashed' }
                }
            ]
        };

        this.masterChartInstance.setOption(option);

        setTimeout(() => {
            const chart = this.masterChartInstance;
            const updateLinePosition = (type, dx, dy) => {
                const pt = chart.convertFromPixel({ seriesIndex: 0 }, [dx, dy]);
                if (pt) {
                    const dataIndex = Math.round(pt[0]);
                    updatePhysioBox(type, dataIndex);
                }
            };

            updatePhysioBox('vt1', vt1Index);
            updatePhysioBox('vt2', vt2Index);

            const startPt1 = chart.convertToPixel({ seriesIndex: 0 }, [vt1Index, 0]);
            const startPt2 = chart.convertToPixel({ seriesIndex: 0 }, [vt2Index, 0]);

            const gridRect = chart.getModel().getComponent('grid').coordinateSystem.getRect();
            const topY = gridRect.y;
            const bottomY = gridRect.y + gridRect.height;

            chart.setOption({
                graphic: [
                    {
                        type: 'group',
                        id: 'vt1-line',
                        bounding: 'raw',
                        position: [startPt1[0], topY],
                        draggable: 'horizontal',
                        ondrag: function (e) {
                            if (this.x < gridRect.x) this.x = gridRect.x;
                            if (this.x > gridRect.x + gridRect.width) this.x = gridRect.x + gridRect.width;
                            updateLinePosition('vt1', this.x, bottomY);
                        },
                        children: [
                            {
                                type: 'line',
                                shape: { x1: 0, y1: 0, x2: 0, y2: gridRect.height },
                                style: { stroke: '#2ecc71', lineWidth: 2, lineDash: [5, 5], opacity: 1 },
                                z: 100
                            },
                            {
                                type: 'rect',
                                shape: { x: -16, y: -10, width: 32, height: 20, r: 4 },
                                style: { fill: '#2ecc71', opacity: 1 },
                                z: 101
                            },
                            {
                                type: 'text',
                                x: -11, y: -5,
                                style: { text: 'VT1', fill: '#fff', font: 'bold 11px sans-serif', opacity: 1 },
                                z: 102
                            }
                        ]
                    },
                    {
                        type: 'group',
                        id: 'vt2-line',
                        bounding: 'raw',
                        position: [startPt2[0], topY],
                        draggable: 'horizontal',
                        ondrag: function (e) {
                            if (this.x < gridRect.x) this.x = gridRect.x;
                            if (this.x > gridRect.x + gridRect.width) this.x = gridRect.x + gridRect.width;
                            updateLinePosition('vt2', this.x, bottomY);
                        },
                        children: [
                            {
                                type: 'line',
                                shape: { x1: 0, y1: 0, x2: 0, y2: gridRect.height },
                                style: { stroke: '#9b59b6', lineWidth: 2, lineDash: [5, 5], opacity: 1 },
                                z: 100
                            },
                            {
                                type: 'rect',
                                shape: { x: -16, y: -10, width: 32, height: 20, r: 4 },
                                style: { fill: '#9b59b6', opacity: 1 },
                                z: 101
                            },
                            {
                                type: 'text',
                                x: -11, y: -5,
                                style: { text: 'VT2', fill: '#fff', font: 'bold 11px sans-serif', opacity: 1 },
                                z: 102
                            }
                        ]
                    }
                ]
            });

            const toggleBtn = document.getElementById('toggle-vt-lines');
            const vt1Container = document.getElementById('vt1-container');
            const vt2Container = document.getElementById('vt2-container');

            if (toggleBtn) {
                toggleBtn.onchange = (e) => {
                    const isVisible = e.target.checked;
                    const graphicOpacity = isVisible ? 1 : 0;

                    chart.dispatchAction({
                        type: isVisible ? 'legendSelect' : 'legendUnSelect',
                        name: 'VT1'
                    });
                    chart.dispatchAction({
                        type: isVisible ? 'legendSelect' : 'legendUnSelect',
                        name: 'VT2'
                    });

                    chart.setOption({
                        graphic: [
                            {
                                id: 'vt1-line',
                                children: [{ style: { opacity: graphicOpacity } }, { style: { opacity: graphicOpacity } }, { style: { opacity: graphicOpacity } }]
                            },
                            {
                                id: 'vt2-line',
                                children: [{ style: { opacity: graphicOpacity } }, { style: { opacity: graphicOpacity } }, { style: { opacity: graphicOpacity } }]
                            }
                        ]
                    });

                    if (vt1Container) vt1Container.style.opacity = isVisible ? '1' : '0.3';
                    if (vt2Container) vt2Container.style.opacity = isVisible ? '1' : '0.3';
                };
            }

            chart.on('legendselectchanged', function (params) {
                if (params.name === 'VT1' || params.name === 'VT2') {
                    const isVT1Visible = params.selected['VT1'];
                    const isVT2Visible = params.selected['VT2'];

                    chart.setOption({
                        graphic: [
                            {
                                id: 'vt1-line',
                                children: [
                                    { style: { opacity: isVT1Visible ? 1 : 0 } },
                                    { style: { opacity: isVT1Visible ? 1 : 0 } },
                                    { style: { opacity: isVT1Visible ? 1 : 0 } }
                                ]
                            },
                            {
                                id: 'vt2-line',
                                children: [
                                    { style: { opacity: isVT2Visible ? 1 : 0 } },
                                    { style: { opacity: isVT2Visible ? 1 : 0 } },
                                    { style: { opacity: isVT2Visible ? 1 : 0 } }
                                ]
                            }
                        ]
                    });

                    if (vt1Container) vt1Container.style.opacity = isVT1Visible ? '1' : '0.3';
                    if (vt2Container) vt2Container.style.opacity = isVT2Visible ? '1' : '0.3';

                    if (toggleBtn) {
                        toggleBtn.checked = (isVT1Visible || isVT2Visible);
                    }
                }
            });

        }, 100);
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
            tooltip: { trigger: 'axis' },
            grid: { left: '5%', right: '5%', bottom: '12%', top: '10%', containLabel: true },
            xAxis: {
                type: 'category',
                data: labels,
                axisLabel: { color: '#888' }
            },
            yAxis: {
                type: 'value',
                splitLine: { lineStyle: { color: '#333', type: 'dashed' } }
            },
            series: [{
                data: mmpValues,
                type: 'bar',
                itemStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: '#f1c40f' },
                        { offset: 1, color: '#e67e22' }
                    ]),
                    borderRadius: [6, 6, 0, 0]
                },
                label: {
                    show: true,
                    position: 'top',
                    color: '#fff',
                    fontWeight: 'bold',
                    fontSize: 13
                }
            }]
        };

        this.mmpChartInstance.setOption(option);
    }

    async loadCareerDashboard() {
        try {
            const dashboardData = await window.go.main.App.GetCareerDashboard();
            if (dashboardData) {
                this.renderPMCChart(dashboardData.pmc || []);
                this.renderCareerDecouplingChart(dashboardData.decoupling || []);
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

    renderCareerDecouplingChart(decouplingData) {
        const chartDom = document.getElementById('careerDecouplingChart');
        if (!chartDom) return;

        if (this.careerDecouplingChartInstance) {
            this.careerDecouplingChartInstance.dispose();
        }
        this.careerDecouplingChartInstance = echarts.init(chartDom, 'dark', { background: 'transparent' });

        // Sort data chronologically
        decouplingData.sort((a, b) => new Date(a.date) - new Date(b.date));

        const labels = decouplingData.map(d => d.date);
        const drift = decouplingData.map(d => d.decoupling);

        const option = {
            tooltip: {
                trigger: 'axis',
                formatter: '{b}: {c}% Drift'
            },
            grid: { left: '5%', right: '5%', bottom: '15%', top: '15%', containLabel: true },
            xAxis: {
                type: 'category',
                data: labels,
                axisLabel: { color: '#888' }
            },
            yAxis: {
                type: 'value',
                name: 'Drift (%)',
                splitLine: { lineStyle: { color: '#333' } }
            },
            // Dynamically color the bars: Green if <= 5% (Good base), Red if > 5% (Needs work)
            visualMap: {
                show: false,
                pieces: [
                    { gt: -100, lte: 5, color: '#2ecc71' }, // Green
                    { gt: 5, lte: 100, color: '#e74c3c' }   // Red
                ]
            },
            series: [{
                name: 'Pw:HR Decoupling',
                data: drift,
                type: 'bar',
                itemStyle: { borderRadius: [4, 4, 0, 0] },
                label: { show: true, position: 'top', formatter: '{c}%', color: '#fff' },
                markLine: {
                    data: [
                        { yAxis: 5, name: 'Threshold' }
                    ],
                    lineStyle: { color: '#f1c40f', type: 'dashed', width: 2 },
                    label: { position: 'insideEndTop', formatter: '5% Target', color: '#f1c40f' }
                }
            }]
        };

        this.careerDecouplingChartInstance.setOption(option);
    }

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

    // ===================================
    // KNOWLEDGE BASE (EDUCATIONAL MODALS)
    // ===================================

    /**
     * Retrieves the structured content for the Knowledge Base modal based on the metric ID.
     * @param {string} metricId - The identifier for the metric (e.g., 'TSS', 'IF').
     * @returns {Object} The structured educational data.
     */
    getKnowledgeBaseData(metricId) {
        const tpGlossaryLink = "https://www.trainingpeaks.com/learn/articles/glossary-of-trainingpeaks-metrics/?utm_source=newsletter&utm_medium=partner&utm_term=sauce_trademark&utm_content=cta&utm_campaign=sauce";

        const db = {
            'TSS': {
                title: 'Training Stress Score (TSS®)',
                tldr: 'Estimates the total training load of a ride by combining intensity and duration into a single score.',
                insight: 'Use TSS to guide recovery and planning. Lower scores generally allow for quicker return to hard training, while higher scores require more recovery. Individual tolerance varies based on fitness and training history.',
                science: 'Developed by Dr. Andrew Coggan, TSS combines Intensity Factor (IF) and duration to quantify overall physiological stress relative to your Functional Threshold Power (FTP).',
                link: tpGlossaryLink
            },
            'IF': {
                title: 'Intensity Factor (IF®)',
                tldr: 'Represents how intense a ride was relative to your FTP.',
                insight: 'An IF around 0.70–0.80 typically reflects endurance riding, while values near or above 1.00 indicate efforts at or above threshold. Consistently high IF values may suggest your FTP is set too low.',
                science: 'Calculated as Normalized Power® (NP) divided by Functional Threshold Power (FTP), giving a normalized measure of effort intensity.',
                link: tpGlossaryLink
            },
            'TRIMP': {
                title: 'Training Impulse (TRIMP)',
                tldr: 'Measures cardiovascular training load based on heart rate response over time.',
                insight: 'Useful when training without power data. TRIMP helps assess how taxing a session was on your cardiovascular system, especially across varying intensities.',
                science: 'Based on Dr. Eric Banister’s model, TRIMP applies an exponential weighting to heart rate, giving greater importance to time spent at higher intensities.',
                link: "https://www.firstbeat.com/en/blog/what-is-trimp/"
            },
            'DRIFT': {
                title: 'Pw:HR Drift (Aerobic Decoupling)',
                tldr: 'Indicates how much your heart rate rises relative to power over time.',
                insight: 'Low drift suggests strong aerobic efficiency and endurance. Higher drift may indicate fatigue, dehydration, or insufficient aerobic conditioning for the effort duration.',
                science: 'Popularized by Joe Friel, it compares the Power-to-Heart Rate ratio between the first and second halves of a steady effort.',
                link: tpGlossaryLink
            },
            'HRR': {
                title: 'Heart Rate Recovery (HRR 1M/2M)',
                tldr: 'Measures how many beats per minute your heart rate drops in the first and second minutes after stopping a hard effort.',
                insight: 'A faster drop generally reflects better cardiovascular fitness and recovery capacity. Slower recovery may indicate fatigue, stress, or insufficient recovery between sessions.',
                science: 'Widely used in sports cardiology, HRR reflects how quickly the parasympathetic nervous system reactivates after exercise, rapidly lowering heart rate.',
                link: "https://pezcyclingnews.com/latestnews/toolbox-heart-rate-recovery/"
            }
        };

        return db[metricId];
    }

    /**
     * Renders a glassmorphism modal containing deep-dive info about a physiological metric.
     * @param {string} metricId - The identifier for the metric.
     */
    renderKnowledgeModal(metricId) {
        // 1. Remove any existing knowledge modal to prevent duplicates
        const existingModal = document.getElementById('kb-modal');
        if (existingModal) existingModal.remove();

        // 2. Fetch the content
        const kbData = this.getKnowledgeBaseData(metricId);
        if (!kbData) return;

        // 3. Build the HTML template using Glassmorphism styling 
        const modalHtml = `
            <div id="kb-modal" class="modal-overlay active" style="z-index: 9999; display: flex; align-items: center; justify-content: center; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.6); backdrop-filter: blur(5px);" onclick="if(event.target === this) this.remove()">
                
                <div class="glass-panel" style="background: rgba(21, 32, 54, 0.95); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 12px; padding: 30px; max-width: 550px; width: 90%; color: var(--text-main); position: relative; box-shadow: 0 10px 30px rgba(0,0,0,0.5); text-align: left; animation: fadeIn 0.3s ease;">
                    
                    <span class="close-btn" onclick="document.getElementById('kb-modal').remove()" style="position: absolute; top: 15px; right: 20px; font-size: 1.5rem; cursor: pointer; color: #888; transition: color 0.2s;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#888'">&times;</span>
                    
                    <h2 style="color: #00fbff; margin-top: 0; font-size: 1.6rem; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px;">${kbData.title}</h2>
                    
                    <h4 style="color: #fff; margin-bottom: 5px; font-size: 1.1rem; text-transform: uppercase; letter-spacing: 1px;">TL;DR</h4>
                    <p style="color: #ccc; margin-top: 0; font-size: 0.95rem; line-height: 1.6;">${kbData.tldr}</p>
                    
                    <h4 style="color: #fff; margin-bottom: 5px; font-size: 1.1rem; margin-top: 25px; text-transform: uppercase; letter-spacing: 1px;">Actionable Insight</h4>
                    <p style="color: #ccc; margin-top: 0; font-size: 0.95rem; line-height: 1.6;">${kbData.insight}</p>
                    
                    <h4 style="color: #fff; margin-bottom: 5px; font-size: 1.1rem; margin-top: 25px; text-transform: uppercase; letter-spacing: 1px;">The Science</h4>
                    <p style="color: #ccc; margin-top: 0; font-size: 0.95rem; line-height: 1.6;">${kbData.science}</p>
                    
                    <div style="margin-top: 35px; text-align: center;">
                        <button onclick="window.runtime.BrowserOpenURL('${kbData.link}')" style="background: #3498db; color: white; padding: 12px 24px; border-radius: 8px; font-family: inherit; font-size: 1rem; font-weight: bold; display: inline-block; transition: background 0.2s; border: none; cursor: pointer;" onmouseover="this.style.background='#2980b9'" onmouseout="this.style.background='#3498db'">
                            Read Deep Dive Article <i class="fas fa-external-link-alt" style="margin-left: 5px;"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;

        // 4. Inject into the DOM
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    // ============================
    // EXPORT FUNCTIONS (CSV & PDF)
    // ============================

    async exportCSV() {
        if (!this.currentViewedActivity) return;
        const actId = this.currentViewedActivity.id || this.currentViewedActivity.ID;

        try {
            this.showToast("Preparing CSV file...", 2000);
            const result = await window.go.main.App.ExportActivityCSV(actId);

            if (result !== "Cancelled") {
                this.showToast(result, 4000);
            }
        } catch (error) {
            console.error("Export CSV Error:", error);
            alert("Failed to export CSV: " + error);
        }
    }

    exportPDF() {
        if (!this.currentViewedActivity) return;
        const act = this.currentViewedActivity;

        this.showToast("Generating Detailed PDF Report...", 2000);

        try {
            // Inicializa um documento PDF em formato Paisagem (Landscape) A4
            const doc = new jsPDF('landscape');

            // =========
            // 1. HEADER
            // =========
            doc.setFillColor(30, 30, 30);
            doc.rect(0, 0, 300, 35, 'F');

            doc.setFontSize(24);
            doc.setTextColor(255, 255, 255);
            doc.setFont("helvetica", "bold");
            doc.text(`ARGUS CYCLIST`, 14, 20);

            doc.setFontSize(12);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(200, 200, 200);
            doc.text(`PHYSIOLOGICAL PERFORMANCE REPORT`, 14, 28);

            // =======================
            // 2. TRAINING INFORMATION
            // =======================
            const date = new Date(act.created_at).toLocaleString();

            doc.setTextColor(40, 40, 40);
            doc.setFontSize(16);
            doc.setFont("helvetica", "bold");
            doc.text(`${act.route_name || 'Free Ride Training'}`, 14, 48);

            doc.setFontSize(11);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(120, 120, 120);
            doc.text(`Date & Time: ${date}`, 14, 55);

            // ===========================
            // 3. METRICS GRID (4 COLUMNS)
            // ===========================
            doc.setFontSize(10);
            doc.setTextColor(50, 50, 50);

            let startY = 68;
            const col1 = 14;
            const col2 = 85;
            const col3 = 155;
            const col4 = 225;

            const peakHR = act.peak_hr || '--';
            const hrRecovery = act.hrr_1 || '--';

            let driftText = '--';
            if (act.duration >= 3600 && act.aerobic_decoupling) {
                driftText = `${act.aerobic_decoupling.toFixed(2)}%`;
            }

            doc.setFont("helvetica", "bold");
            doc.text("GENERAL METRICS", col1, startY);
            doc.setFont("helvetica", "normal");
            doc.text(`Duration: ${Math.round(act.duration / 60)} min`, col1, startY + 7);
            doc.text(`Distance: ${(act.total_distance / 1000).toFixed(2)} km`, col1, startY + 14);
            doc.text(`Elevation Gain: ${Math.round(act.elevation_gain || 0)} m`, col1, startY + 21);
            doc.text(`Energy Spent: ${Math.round(act.calories || 0)} kcal`, col1, startY + 28);

            doc.setFont("helvetica", "bold");
            doc.text("POWER DYNAMICS", col2, startY);
            doc.setFont("helvetica", "normal");
            doc.text(`Avg Power: ${act.avg_power} W`, col2, startY + 7);
            doc.text(`Normalized (NP): ${act.normalized_power || '--'} W`, col2, startY + 14);
            doc.text(`Intensity Factor (IF): ${(act.intensity_factor || 0).toFixed(2)}`, col2, startY + 21);
            doc.text(`Training Stress (TSS): ${(act.tss || 0).toFixed(1)}`, col2, startY + 28);

            doc.setFont("helvetica", "bold");
            doc.text("HEART RATE", col3, startY);
            doc.setFont("helvetica", "normal");
            doc.text(`Avg HR: ${act.avg_hr} BPM`, col3, startY + 7);
            doc.text(`Max HR: ${act.max_hr} BPM`, col3, startY + 14);
            doc.text(`Peak HR: ${peakHR} BPM`, col3, startY + 21);
            doc.text(`HR Recovery (1m): ${hrRecovery} BPM`, col3, startY + 28);

            doc.setFont("helvetica", "bold");
            doc.text("ADVANCED PHYSIOLOGY", col4, startY);
            doc.setFont("helvetica", "normal");
            doc.text(`Cardio Load (TRIMP): ${(act.trimp || 0).toFixed(1)}`, col4, startY + 7);
            doc.text(`Pw:HR Drift: ${driftText}`, col4, startY + 14);
            doc.text(`Avg Speed: ${(act.avg_speed || 0).toFixed(1)} km/h`, col4, startY + 21);

            // =============================
            // 4. VISUAL GRAPHIC (TELEMETRY)
            // =============================
            if (this.masterChartInstance) {
                doc.setLineWidth(0.2);
                doc.setDrawColor(200, 200, 200);
                doc.line(14, 105, 283, 105);

                doc.setFont("helvetica", "bold");
                doc.setTextColor(40, 40, 40);
                doc.text("LIVE TELEMETRY CHART", 14, 113);

                const imgData = this.masterChartInstance.getDataURL({
                    type: 'png',
                    pixelRatio: 2,
                    backgroundColor: '#1e1e1e'
                });

                doc.addImage(imgData, 'PNG', 14, 118, 269, 85);
            }

            // ============
            // 5. SAVE FILE
            // ============
            const filename = `Argus_Report_${date.replace(/[\/\s:]/g, '_')}.pdf`;
            doc.save(filename);

            this.showToast("Detailed PDF Exported Successfully!", 3000);

        } catch (error) {
            console.error("Export PDF Error:", error);
            alert("Failed to export PDF: " + error);
        }
    }

    toggleShareMenu(event) {
        event.stopPropagation();
        const menu = document.getElementById('share-dropdown-menu');
        if (menu.classList.contains('hidden')) {
            menu.classList.remove('hidden');
            document.addEventListener('click', this._closeShareMenuHandler);
        } else {
            menu.classList.add('hidden');
            document.removeEventListener('click', this._closeShareMenuHandler);
        }
    }

    _closeShareMenuHandler = (event) => {
        const menu = document.getElementById('share-dropdown-menu');
        const container = document.querySelector('.share-dropdown-container');
        if (container && !container.contains(event.target)) {
            menu.classList.add('hidden');
            document.removeEventListener('click', this._closeShareMenuHandler);
        }
    };

    async exportPNG() {
        if (!this.currentViewedActivity) return;

        const menu = document.getElementById('share-dropdown-menu');
        menu.classList.add('hidden');
        document.removeEventListener('click', this._closeShareMenuHandler);

        this.showToast("Generating PNG Image...", 2000);

        try {
            const modal = document.querySelector('.modern-detail-modal');
            if (!modal) {
                throw new Error("Modal not found");
            }

            const canvas = await html2canvas(modal, {
                scale: 2,
                backgroundColor: '#1e293b',
                logging: false,
                useCORS: true
            });

            const link = document.createElement('a');
            const act = this.currentViewedActivity;
            const date = new Date(act.created_at).toLocaleDateString().replace(/[\/\s]/g, '_');
            link.download = `Argus_Ride_${date}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();

            this.showToast("PNG Image Exported Successfully!", 3000);
        } catch (error) {
            console.error("Export PNG Error:", error);
            this.showToast("Failed to export PNG: " + error.message, 4000);
        }
    }
}

// Attach global function to handle historical Strava uploads
window.uploadHistoricalToStrava = async (id, event) => {
    event.stopPropagation();

    const btn = document.getElementById(`btn-strava-hist-${id}`);
    if (!btn) return;

    // Prevent double-clicks and show loading state
    btn.style.opacity = '0.5';
    btn.style.pointerEvents = 'none';

    try {
        // Validate if user has connected Strava
        const isConn = await window.go.main.App.IsStravaConnected();
        if (!isConn) {
            alert("Please connect your Strava account in Settings > Profile & Devices first.");
            btn.style.opacity = '1';
            btn.style.pointerEvents = 'auto';
            return;
        }

        window.ui.showToast("Uploading activity to Strava...", 3000);

        await window.go.main.App.UploadActivityToStrava(id);

        window.ui.showToast("Successfully uploaded to Strava! 🏆", 5000);

        // Update the UI icon visually to indicate success
        btn.style.color = '#FC4C02'; // Strava Orange
        btn.style.opacity = '1';
        btn.title = "Already uploaded to Strava";
        btn.onclick = null;
        btn.style.cursor = 'default';

    } catch (err) {
        console.error("Upload error:", err);
        alert("Failed to upload: " + err);

        // Revert button state so user can try again
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
    }
};
