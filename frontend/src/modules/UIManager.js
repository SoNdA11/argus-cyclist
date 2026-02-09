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

            // History & statistics
            historyContainer: document.getElementById('historyContainer'),
            statTotalDist: document.getElementById('statTotalDist'),
            statTotalActivities: document.getElementById('statTotalActivities')
        };

        // --- GLOBAL ACCESS ---
        window.ui = this;

        // --- TIMER STATE ---
        this.timerInterval = null;
        this.secondsElapsed = 0;

        // --- USER PREFERENCES ---
        this.riderWeight = CONFIG.DEFAULT_RIDER_WEIGHT;
        this.bikeWeight = CONFIG.DEFAULT_BIKE_WEIGHT;
        this.units = CONFIG.DEFAULT_UNITS; // 'metric' or 'imperial'

        // --- CHART & CALENDAR STATE ---
        this.currentDate = new Date();
        window.changeMonth = (d) => this.changeMonth(d);

        // --- PHOTO ---
        this.currentPhotoData = "";

        this.level = 1;
        this.xp = 0;
        this.nextLevelXp = 500;
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
    // TELEMETRY UPDATES
    // =================

    /**
     * Update all telemetry-related UI elements.
     * @param {Object} data - Telemetry data from backend
     * @param {number} totalRouteDistance - Total route distance in meters
     */
    updateTelemetry(data, totalRouteDistance = 0) {
        // Raw telemetry values
        this.els.watts.innerHTML = `${data.power}<span class="data-unit">w</span>`;
        this.els.rpm.innerHTML = `${data.cadence}<span class="data-unit">rpm</span>`;
        this.els.hr.innerHTML = `${data.heart_rate}<span class="data-unit">❤</span>`;
        this.els.grade.innerHTML = `${data.grade.toFixed(1)}<span class="data-unit">%</span>`;

        // Speed (unit-aware)
        const speedObj = this.formatSpeed(data.speed);
        this.els.speed.innerHTML = `${speedObj.val}<span class="data-unit">${speedObj.unit}</span>`;

        // Distance (unit-aware)
        const distObj = this.formatDist(data.total_dist);
        this.els.dist.innerHTML = `${distObj.val}<span class="data-unit">${distObj.unit}</span>`;

        // Watts per kilogram
        const totalWeight = this.riderWeight;
        const wkgVal = (data.power / totalWeight).toFixed(2);
        this.els.wkg.innerHTML = `${wkgVal}<span class="data-unit">w/kg</span>`;

        // Remaining distance and route progress cursor
        if (totalRouteDistance > 0) {
            const remainingMeters = Math.max(0, totalRouteDistance - data.total_dist);
            const remObj = this.formatDist(remainingMeters);
            this.els.distRem.innerHTML = `${remObj.val}<span class="data-unit">${remObj.unit}</span>`;

            // Cursor
            const pct = Math.min((data.total_dist / totalRouteDistance) * 100, 100);
            this.els.cursor.style.left = pct + '%';
        }
    }

    /**
     * Display the currently loaded route filename.
     */
    setFilename(name) {
        this.els.filename.innerText = "| " + name;
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
        this.els.time.innerText = `${h}:${m}:${s}`;
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

            this.riderWeight = profile.weight;
            this.bikeWeight = profile.bike_weight;
            this.els.selectUnits.value = profile.units || "metric";
            this.units = this.els.selectUnits.value;

            this.level = profile.level || 1;
            this.xp = profile.current_xp || 0;

            const lvlLabel = document.getElementById('level-val');
            if (lvlLabel) lvlLabel.innerText = this.level;
            this.updateXPBarUI();

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
            units: this.els.selectUnits.value,
            level: this.level,
            current_xp: parseInt(this.xp)
        };

        try {
            await window.go.main.App.UpdateUserProfile(profile);
            this.riderWeight = profile.weight;
            this.bikeWeight = profile.bike_weight;
            this.units = profile.units;
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

            const distVal = act.total_distance || 0;
            const dist = (distVal / 1000).toFixed(1) + " km";
            const name = act.route_name || "Treino Livre";
            const pwr = act.avg_power || 0;

            // Escape Windows paths for JS strings
            const rawFilename = act.filename || "";
            const safeFilename = rawFilename.replace(/\\/g, '\\\\');

            const div = document.createElement('div');
            div.className = 'history-item';

            div.innerHTML = `
                <span>${date} - <small>${name}</small></span>
                <span>${dist}</span>
                <span>${pwr}w</span>
                <span 
                    title="Abrir Pasta: ${rawFilename}" 
                    style="cursor: pointer; text-align: center; font-size: 1.2rem;"
                    onclick="window.go.main.App.OpenFileFolder('${safeFilename}')"
                >
                    📂
                </span>
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

        // Espaços vazios
        for (let i = 0; i < firstDay; i++) container.innerHTML += `<div></div>`;

        // Dias
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
                // Formata data: DD/MM/YYYY HH:MM
                const dateObj = new Date(rec.date);
                const dateStr = dateObj.toLocaleDateString() + " " + dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                // Se o watt for 0, mostra traço
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

    async loadUserProfile() {
        try {
            const profile = await window.go.main.App.GetUserProfile();

            this.els.inputName.value = profile.name || "";

            document.getElementById('profileNameDisplay').innerText = profile.name || "Cyclist";

            this.els.inputRiderWeight.value = profile.weight || 75;
            this.els.inputBikeWeight.value = profile.bike_weight || 9;
            this.els.inputFTP.value = profile.ftp || 200;
            this.els.selectUnits.value = profile.units || "metric";

            this.level = profile.level || 1;
            this.xp = profile.current_xp || 0;
            const lvlLabel = document.getElementById('level-val');
            if (lvlLabel) lvlLabel.innerText = this.level;
            this.updateXPBarUI();

            if (profile.photo && profile.photo.length > 10) {
                document.getElementById('profileImage').src = profile.photo;
                this.currentPhotoData = profile.photo;
            }

        } catch (e) {
            console.error("Error loading profile:", e);
        }
    }

    async saveUserProfile() {
        const profile = {
            name: this.els.inputName.value,
            photo: this.currentPhotoData,
            weight: parseFloat(this.els.inputRiderWeight.value),
            bike_weight: parseFloat(this.els.inputBikeWeight.value),
            ftp: parseInt(this.els.inputFTP.value),
            units: this.els.selectUnits.value,
            level: this.level,
            current_xp: parseInt(this.xp)
        };

        try {
            await window.go.main.App.UpdateUserProfile(profile);
            document.getElementById('profileNameDisplay').innerText = profile.name;

        } catch (e) {
            alert("Error saving profile: " + e);
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

    showFinishModal() {
        const modal = document.getElementById('finishModal');
        if (modal) {
            modal.classList.add('active');
        }
    }

    closeFinishModal() {
        const modal = document.getElementById('finishModal');
        if (modal) modal.classList.remove('active');
        this.setRecordingState('IDLE');
    }
}