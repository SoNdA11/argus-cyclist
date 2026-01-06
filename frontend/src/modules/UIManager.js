import { CONFIG } from '../config.js';

export class UIManager {
    constructor() {
        this.els = {
            watts: document.getElementById('watts'), 
            hr: document.getElementById('hr'), 
            rpm: document.getElementById('rpm'), 
            grade: document.getElementById('grade'), 
            dist: document.getElementById('dist'), 
            speed: document.getElementById('speed'),
            time: document.getElementById('time'),
            wkg: document.getElementById('wkg'),        // NEW
            distRem: document.getElementById('distRem'), // NEW
            
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

            cursor: document.getElementById('progressCursor'),
            filename: document.getElementById('filename'),
            tokenWarning: document.getElementById('token-warning')
        };
        
        // State
        this.timerInterval = null;
        this.secondsElapsed = 0;
        
        // User Preferences
        this.riderWeight = CONFIG.DEFAULT_RIDER_WEIGHT;
        this.bikeWeight = CONFIG.DEFAULT_BIKE_WEIGHT;
        this.units = CONFIG.DEFAULT_UNITS; // 'metric' or 'imperial'
    }

    // --- PREFERENCES & UNITS ---

    updatePreferences() {
        this.riderWeight = parseFloat(this.els.inputRiderWeight.value) || 70;
        this.bikeWeight = parseFloat(this.els.inputBikeWeight.value) || 8;
        this.units = this.els.selectUnits.value;
    }

    formatDist(meters) {
        if (this.units === 'imperial') {
            const miles = meters * 0.000621371;
            return { val: miles.toFixed(2), unit: 'mi' };
        }
        return { val: (meters / 1000).toFixed(2), unit: 'km' };
    }

    formatSpeed(kph) {
        if (this.units === 'imperial') {
            const mph = kph * 0.621371;
            return { val: mph.toFixed(1), unit: 'mph' };
        }
        return { val: kph.toFixed(1), unit: 'km/h' };
    }

    // --- TELEMETRY UPDATES ---

    updateTelemetry(data, totalRouteDistance = 0) {
        // Standard Data
        this.els.watts.innerHTML = `${data.power}<span class="data-unit">w</span>`;
        this.els.rpm.innerHTML = `${data.cadence}<span class="data-unit">rpm</span>`;
        this.els.hr.innerHTML = `${data.heart_rate}<span class="data-unit">❤</span>`;
        this.els.grade.innerHTML = `${data.grade.toFixed(1)}<span class="data-unit">%</span>`;

        // Units Aware Data
        const speedObj = this.formatSpeed(data.speed);
        this.els.speed.innerHTML = `${speedObj.val}<span class="data-unit">${speedObj.unit}</span>`;

        const distObj = this.formatDist(data.total_dist);
        this.els.dist.innerHTML = `${distObj.val}<span class="data-unit">${distObj.unit}</span>`;

        // Watts / Kg
        const totalWeight = this.riderWeight;
        const wkgVal = (data.power / totalWeight).toFixed(2);
        this.els.wkg.innerHTML = `${wkgVal}<span class="data-unit">w/kg</span>`;

        // Remaining Distance
        if (totalRouteDistance > 0) {
            const remainingMeters = Math.max(0, totalRouteDistance - data.total_dist);
            const remObj = this.formatDist(remainingMeters);
            this.els.distRem.innerHTML = `${remObj.val}<span class="data-unit">${remObj.unit}</span>`;
            
            // Cursor
            const pct = Math.min((data.total_dist / totalRouteDistance) * 100, 100);
            this.els.cursor.style.left = pct + '%';
        }
    }

    setFilename(name) {
        this.els.filename.innerText = "| " + name;
    }

    // --- TIMER LOGIC ---
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

    updateTimerDisplay() {
        const h = Math.floor(this.secondsElapsed / 3600).toString().padStart(2, '0');
        const m = Math.floor((this.secondsElapsed % 3600) / 60).toString().padStart(2, '0');
        const s = (this.secondsElapsed % 60).toString().padStart(2, '0');
        this.els.time.innerText = `${h}:${m}:${s}`;
    }

    // --- MODAL & STATES ---

    toggleSettings(show) {
        if (show) {
            this.els.settingsModal.classList.add('active');
        } else {
            this.updatePreferences(); // Save changes when closing
            this.els.settingsModal.classList.remove('active');
        }
    }

    toggleConfirmModal(show) {
        if (show) this.els.confirmModal.classList.add('active');
        else this.els.confirmModal.classList.remove('active');
    }

    setRecordingState(state) {
        // state: 'RECORDING', 'PAUSED', 'IDLE'
        if (state === 'RECORDING') {
            this.els.btnAction.innerText = "STOP"; 
            this.els.btnAction.className = "btn-action btn-stop"; 
            this.els.btnImport.disabled = true;
            this.startTimer();
            this.toggleConfirmModal(false);
        } else if (state === 'PAUSED') {
            // In the new flow, PAUSED basically opens the Confirm Modal
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
    
    showTokenWarning() {
        this.els.tokenWarning.classList.remove('hidden');
        this.els.tokenWarning.style.display = 'block';
    }
}