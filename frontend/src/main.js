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

import './styles/main.css';
import { CONFIG } from './config.js';
import { MapController } from './modules/MapController.js';
import { UIManager } from './modules/UIManager.js';
import { ElevationChart } from './modules/ElevationChart.js';
import { WorkoutController } from './modules/WorkoutController.js';

// ==========================
// APPLICATION INITIALIZATION
// ==========================

// Core controllers
const mapCtrl = new MapController();
window.mapController = mapCtrl;
const ui = new UIManager();

const chart = new ElevationChart('elevationCanvas');
window.chart = chart;

const workoutCtrl = new WorkoutController();

// Global state
window.totalRouteDistance = 0;
let isRecording = false;
let isFinishTriggered = false;

window.closeWorkout = async () => {
    if (confirm("Stop the structured workout and return to Free Ride?")) {
        
        if (typeof workoutCtrl !== 'undefined') {
            workoutCtrl.hide();
        }

        // Notify the backend to stop ERG Mode and return to normal simulation (SIM)
        if (window.go && window.go.main && window.go.main.App) {
            try {
                await window.go.main.App.SetTrainerMode('SIM');
            } catch (e) {
                console.error("Error returning to SIM mode:", e);
            }
        }
    }
};

// Initialize the map
mapCtrl.init('map-container');

// Open Settings
ui.toggleSettings(true);


// ==================
// UI EVENT LISTENERS
// ==================


document.getElementById('selectTrainerMode').addEventListener('change', async (e) => {
    const mode = e.target.value;
    const ergControl = document.getElementById('ergControl');

    if (mode === 'ERG') {
        ergControl.classList.remove('hidden');
    } else {
        ergControl.classList.add('hidden');
    }

    if (window.go && window.go.main && window.go.main.App) {
        await window.go.main.App.SetTrainerMode(mode);
        console.log("Trainer Mode Switched to:", mode);
    }
});


document.getElementById('btnSetPower').addEventListener('click', async () => {
    const watts = parseFloat(document.getElementById('inputTargetPower').value);
    if (window.go && window.go.main && window.go.main.App) {
        await window.go.main.App.SetPowerTarget(watts);
        console.log("ERG Power Set to:", watts);
    }
});

document.getElementById('btnCloseSettings').addEventListener('click', () => {
    ui.toggleSettings(false);
});

document.getElementById('btnOpenSettings').addEventListener('click', () => {
    ui.toggleSettings(true);
});

// ==================
// DEVICE CONNECTIONS
// ==================

// ---------------------------
// SMART TRAINER (REAL)
// ---------------------------

// 1. SCAN TRAINERS
document.getElementById('btnScanTrainer').addEventListener('click', async () => {
    const btnScan = document.getElementById('btnScanTrainer');
    const btnConn = document.getElementById('btnConnTrainer');
    const list = document.getElementById('trainerList');
    const status = document.getElementById('statusTrainer');

    btnScan.innerText = "⏳";
    btnScan.disabled = true;
    status.innerText = "Scanning...";

    try {
        const devices = await window.go.main.App.ScanTrainers();
        
        list.innerHTML = '<option value="">Select device...</option>';
        
        if (devices && devices.length > 0) {
            devices.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d.address; // MAC Address
                opt.text = d.name;     // Nome
                list.appendChild(opt);
            });
            list.classList.remove('hidden');
            btnConn.classList.remove('hidden');
            btnScan.classList.add('hidden');
            status.innerText = "Select a device";
        } else {
            status.innerText = "No devices found";
            btnScan.innerText = "🔍";
            btnScan.disabled = false;
        }
    } catch (err) {
        status.innerText = "Scan error";
        btnScan.innerText = "🔍";
        btnScan.disabled = false;
    }
});

// 2. CONNECT TRAINER
document.getElementById('btnConnTrainer').addEventListener('click', async () => {
    const btnVirtual = document.getElementById('btnConnVirtual');
    const btnReal = document.getElementById('btnConnTrainer');
    const btnScan = document.getElementById('btnScanTrainer');
    const list = document.getElementById('trainerList');
    const status = document.getElementById('statusTrainer');

    if (status.innerText === "Trainer Connected") {
        await window.go.main.App.DisconnectTrainer();
        status.innerText = "Disconnected";
        status.style.color = "";  
        
        btnReal.innerText = "🔗"; 
        btnReal.classList.add('hidden');
        list.classList.add('hidden');
        list.disabled = false;
        btnScan.classList.remove('hidden');
        btnScan.innerText = "🔍";
        btnScan.disabled = false;
        btnVirtual.disabled = false; 
        return;
    }

    const selectedMac = list.value;
    if (!selectedMac) {
        alert("Please select a trainer from the list.");
        return;
    }

    btnReal.innerText = "⏳";
    btnReal.disabled = true;
    btnVirtual.disabled = true;
    list.disabled = true;

    try {
        const result = await window.go.main.App.ConnectTrainer(selectedMac);
        status.innerText = result; 
        status.style.color = "var(--argus-safe)";
        btnReal.innerText = "❌";
        btnReal.disabled = false;
    } catch (err) {
        status.innerText = "Error connecting";
        status.style.color = "var(--argus-alert)";
        btnReal.innerText = "🔗";
        btnReal.disabled = false;
        btnVirtual.disabled = false;
        list.disabled = false;
    }
});

// ---------------------------
// SIMULATOR (VIRTUAL TRAINER)
// ---------------------------
document.getElementById('btnConnVirtual').addEventListener('click', async () => {
    const btnVirtual = document.getElementById('btnConnVirtual');
    const btnReal = document.getElementById('btnConnTrainer');
    const btnScan = document.getElementById('btnScanTrainer');
    const list = document.getElementById('trainerList');
    const status = document.getElementById('statusTrainer');

    if (status.innerText === "Simulator Active") {
        await window.go.main.App.DisconnectTrainer();
        status.innerText = "Disconnected";
        status.style.color = "";  
        btnVirtual.innerText = "💻"; 
        btnScan.disabled = false;
        return;
    }

    btnVirtual.innerText = "⏳";
    btnVirtual.disabled = true;
    btnScan.disabled = true; 
    if(!btnReal.classList.contains('hidden')) btnReal.disabled = true;

    try {
        const result = await window.go.main.App.ConnectVirtualTrainer();
        status.innerText = result; 
        status.style.color = "#00ADD8";
        btnVirtual.innerText = "❌"; 
        btnVirtual.disabled = false;

        list.classList.add('hidden');
        btnReal.classList.add('hidden');
        btnScan.classList.remove('hidden');

        const toast = document.getElementById('toast-notification');
        if (toast) {
            toast.innerText = "💻 Virtual Trainer Mode Activated!";
            toast.classList.remove('hidden');
            toast.style.display = 'block';
            setTimeout(() => {
                toast.classList.add('hidden');
                toast.style.display = 'none';
            }, 3000);
        }

    } catch (err) {
        status.innerText = "Error: " + err;
        status.style.color = "var(--argus-alert)";
        btnVirtual.innerText = "💻";
        btnVirtual.disabled = false;
        btnScan.disabled = false;
    }
});

// ---------------------------
// HEART RATE MONITOR
// ---------------------------

// 1. SCAN HR
document.getElementById('btnScanHR').addEventListener('click', async () => {
    const btnScan = document.getElementById('btnScanHR');
    const btnConn = document.getElementById('btnConnHR');
    const list = document.getElementById('hrList');
    const status = document.getElementById('statusHR');

    btnScan.innerText = "⏳";
    btnScan.disabled = true;
    status.innerText = "Scanning...";

    try {
        const devices = await window.go.main.App.ScanHeartRate();
        
        list.innerHTML = '<option value="">Select device...</option>';
        
        if (devices && devices.length > 0) {
            devices.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d.address;
                opt.text = d.name;
                list.appendChild(opt);
            });
            list.classList.remove('hidden');
            btnConn.classList.remove('hidden');
            btnScan.classList.add('hidden');
            status.innerText = "Select a device";
        } else {
            status.innerText = "No devices found";
            btnScan.innerText = "🔍";
            btnScan.disabled = false;
        }
    } catch (err) {
        status.innerText = "Scan error";
        btnScan.innerText = "🔍";
        btnScan.disabled = false;
    }
});

// 2. CONNECT HR
document.getElementById('btnConnHR').addEventListener('click', async () => {
    const btnReal = document.getElementById('btnConnHR');
    const btnScan = document.getElementById('btnScanHR');
    const list = document.getElementById('hrList');
    const status = document.getElementById('statusHR');

    if (status.innerText === "HR Monitor Connected" || status.innerText === "Connected") {
        await window.go.main.App.DisconnectHeartRate();
        status.innerText = "Disconnected";
        status.style.color = ""; 
        
        btnReal.innerText = "🔗";   
        btnReal.classList.add('hidden');
        list.classList.add('hidden');
        list.disabled = false;
        btnScan.classList.remove('hidden');
        btnScan.innerText = "🔍";
        btnScan.disabled = false;
        return;
    }

    const selectedMac = list.value;
    if (!selectedMac) {
        alert("Please select a HR monitor from the list.");
        return;
    }

    btnReal.innerText = "⏳";
    btnReal.disabled = true;
    list.disabled = true;

    try {
        const result = await window.go.main.App.ConnectHeartRate(selectedMac);
        status.innerText = result; 
        status.style.color = "var(--argus-safe)";
        btnReal.innerText = "❌"; 
        btnReal.disabled = false;
    } catch (err) {
        status.innerText = "Error";
        status.style.color = "var(--argus-alert)";
        btnReal.innerText = "🔗";
        btnReal.disabled = false;
        list.disabled = false;
    }
});

// ============
// MAP CONTROLS
// ============

document.getElementById('btnLayers').addEventListener('click', () => {
    mapCtrl.toggleLayer();
    chart.draw();
});

document.getElementById('btnCenter').addEventListener('click', () => {
    mapCtrl.centerCamera();
});

// ==========
// GPX IMPORT
// ==========

document.getElementById('btnImport').addEventListener('click', async () => {
    try {
        const filename = await window.go.main.App.SelectGPX();
        if (filename) {
            ui.setFilename(filename);
            ui.els.btnAction.classList.remove('hidden');

            const routePoints = await window.go.main.App.GetRoutePath();

            if (routePoints.length > 1) {
                window.totalRouteDistance = routePoints[routePoints.length - 1].distance;

                ui.showRoutePreview(window.totalRouteDistance);

                // Build GeoJSON from route segments
                const features = [];
                for (let i = 0; i < routePoints.length - 1; i++) {
                    features.push({
                        type: 'Feature',
                        properties: { grade: routePoints[i].grade },
                        geometry: {
                            type: 'LineString',
                            coordinates: [
                                [routePoints[i].lon, routePoints[i].lat],
                                [routePoints[i + 1].lon, routePoints[i + 1].lat]
                            ]
                        }
                    });
                }

                const geoJson = { type: 'FeatureCollection', features: features };
                mapCtrl.renderRoute(geoJson);

                // Set initial camera position
                const start = routePoints[0];
                mapCtrl.setInitialPosition(start.lat, start.lon);

                // Load elevation profile
                const elevations = await window.go.main.App.GetElevationProfile();
                chart.setData(elevations);
            }
        }
    } catch (e) {
        alert("Error importing GPX: " + e);
    }
});

// ==================
// WORKOUT IMPORT
// ==================

document.getElementById('btnLoadWorkout').addEventListener('click', async () => {
    try {
        const result = await window.go.main.App.LoadWorkout();
        if (result) {
            console.log("Workout loaded:", result);
            ui.els.btnAction.classList.remove('hidden');
        }
    } catch (e) {
        alert("Error loading workout: " + e);
    }
});

// ==================
// RECORDING CONTROLS
// ==================

// Isolated function to centralize the session finish logic
async function finishWorkout() {
    isFinishTriggered = true;
    isRecording = false;
    try {
        await window.go.main.App.FinishSession();
        ui.showFinishModal();
    } catch (e) {
        console.error("Error saving workout:", e);
        alert("Error when saving: " + e);
    }
}

document.getElementById('btnAction').addEventListener('click', async () => {
    try {
        if (!isRecording) {
            isFinishTriggered = false;

            console.log("Starting a new activity...");
        }
        else {
            console.log("Pausing activity...");
        }
        await window.go.main.App.ToggleSession();

    } catch (e) {
        console.error("Error switching session:", e);
        alert("Error: " + e);
    }
});

document.getElementById('btnResume').addEventListener('click', async () => {
    await window.go.main.App.ToggleSession();
});

document.getElementById('btnFinishSave').addEventListener('click', async () => {
    await finishWorkout();
});

document.getElementById('btnDiscard').addEventListener('click', async () => {
    if (confirm("Discard this activity? It won't be saved.")) {
        await window.go.main.App.DiscardSession();
        ui.setRecordingState('IDLE');
        isRecording = false;
    }
});

// =======================
// KEYBOARD DEBUG CONTROLS
// =======================

document.addEventListener('keydown', async (e) => {
    let delta = 0;
    if (e.key === "ArrowUp") delta = 10;
    if (e.key === "ArrowDown") delta = -10;

    if (delta !== 0 && window.go && window.go.main && window.go.main.App) {
        await window.go.main.App.ChangePowerSimulation(delta);
    }
});

// =======================
// TAB NAVIGATION (GLOBAL)
// =======================

/**
 * Switch visible tab content and active button.
 */
function openTab(tabId, event) {
    document.querySelectorAll('.tab-pane')
        .forEach(el => el.classList.remove('active'));

    document.querySelectorAll('.tab-btn')
        .forEach(el => el.classList.remove('active'));

    document.getElementById(tabId).classList.add('active');
    event.currentTarget.classList.add('active');
}

// Expose function to global scope (used by inline HTML handlers)
window.openTab = openTab;

// --- WAILS RUNTIME EVENTS ---

if (window.runtime) {
    window.runtime.EventsOn("ble_connection_status", (data) => {
        if (data.stage === "READY") {
            mapCtrl.followCyclist = true;
        }
    });

    window.runtime.EventsOn("status_change", (status) => {
        console.log("Status changed to:", status);

        if (status === "RECORDING") {
            ui.setRecordingState('RECORDING');
            isRecording = true;
        }
        else if (status === "PAUSED") {
            ui.setRecordingState('PAUSED');
            isRecording = true;
        }
        else {
            ui.setRecordingState('IDLE');
            isRecording = false;
        }
    });

    window.runtime.EventsOn("telemetry_update", (data) => {
        ui.updateTelemetry(data, totalRouteDistance);
        mapCtrl.updateCyclistPosition(data.lat, data.lon, data.speed, data);

        if (isRecording && totalRouteDistance > 0 && !isFinishTriggered) {
            if (data.total_dist >= totalRouteDistance) {
                finishWorkout();
            }
        }
    });
}