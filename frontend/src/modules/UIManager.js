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
            inputName : document.getElementById('inputName'),
            inputFTP : document.getElementById('inputFTP'),

            // History & statistics
            historyContainer : document.getElementById('historyContainer'),
            statTotalDist : document.getElementById('statTotalDist'),
            statTotalActivities : document.getElementById('statTotalActivities')
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
        
        console.log("Profile Loaded:", profile);
    } catch (e) {
        console.error("Error loading profile:", e);
        }
    }

    /**
     * Save user profile to backend.
     */
    async saveUserProfile() {
    const profile = {
        name: this.els.inputName.value,
        weight: parseFloat(this.els.inputRiderWeight.value),
        bike_weight: parseFloat(this.els.inputBikeWeight.value),
        ftp: parseInt(this.els.inputFTP.value),
        units: this.els.selectUnits.value
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
        
        // Update global stats
        this.els.statTotalDist.innerText = stats.total_km.toFixed(1) + " km";
        this.els.statTotalActivities.innerText = activities.length;

        this.els.historyContainer.innerHTML = "";
        
        if (activities.length === 0) {
            this.els.historyContainer.innerHTML = "<div style='padding:1rem'>No activities yet. Go ride!</div>";
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

    } catch (e) {
        console.error("Error loading history:", e);
    }
    }

    async saveRoute() {
        const points = window.mapController.getGeneratedRoute();
        if (!points || points.length === 0) {
            alert("Create a route first by clicking 2 points on map.");
            return;
        }

        const name = document.getElementById('editorRouteName').value.trim();
        
        try {
            // Chama o Backend para salvar
            const result = await window.go.main.App.SaveGeneratedGPX(name, points);
            alert(result); // Mostra "Saved: ..."
            
            this.cancelRoute(); // Fecha editor
            
            // Opcional: Recarregar lista de rotas se você tiver uma
            
        } catch (e) {
            alert("Error saving: " + e);
        }
    }
}