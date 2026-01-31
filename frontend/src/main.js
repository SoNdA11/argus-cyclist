import './styles/main.css';
import { CONFIG } from './config.js';
import { MapController } from './modules/MapController.js';
import { UIManager } from './modules/UIManager.js';
import { ElevationChart } from './modules/ElevationChart.js';

// ==========================
// APPLICATION INITIALIZATION
// ==========================

// Core controllers
const mapCtrl = new MapController();
window.mapController = mapCtrl;
const ui = new UIManager();
const chart = new ElevationChart('elevationCanvas');

// Global state
let totalRouteDistance = 0;
let isRecording = false;
let isFinishTriggered = false;

// Initialize the map
mapCtrl.init('map-container');

// Open Settings
ui.toggleSettings(true);

// Validate Mapbox token
if (!CONFIG.MAPBOX_TOKEN || !CONFIG.MAPBOX_TOKEN.startsWith('pk.')) {
    ui.showTokenWarning();
}

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

document.getElementById('btnConnTrainer').addEventListener('click', async () => {
    const btn = document.getElementById('btnConnTrainer');
    const status = document.getElementById('statusTrainer');

    btn.innerText = "Scanning...";
    btn.disabled = true;

    try {
        const result = await window.go.main.App.ConnectTrainer();
        status.innerText = result; // Ex: "Trainer Connected"
        status.style.color = "var(--argus-safe)";
        btn.innerText = "Connected";
    } catch (err) {
        status.innerText = "Error: " + err;
        status.style.color = "var(--argus-alert)";
        btn.innerText = "Retry";
        btn.disabled = false;
    }
});

document.getElementById('btnConnHR').addEventListener('click', async () => {
    const btn = document.getElementById('btnConnHR');
    const status = document.getElementById('statusHR');

    btn.innerText = "Scanning...";
    btn.disabled = true;

    try {
        const result = await window.go.main.App.ConnectHeartRate();
        status.innerText = result;
        status.style.color = "var(--argus-safe)";
        btn.innerText = "Connected";
    } catch (err) {
        status.innerText = "Error";
        btn.innerText = "Retry";
        btn.disabled = false;
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

                // Cache total route distance (meters)
                totalRouteDistance = routePoints[routePoints.length - 1].distance;
            }
        }
    } catch (e) {
        alert("Error importing GPX: " + e);
    }
});

// ==================
// RECORDING CONTROLS
// ==================

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
    await window.go.main.App.FinishSession();
    ui.setRecordingState('IDLE');
    isRecording = false;
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
            if (data.total_dist >= totalRouteDistance - 20) {
                finishWorkout();
            }
        }
    });

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
}