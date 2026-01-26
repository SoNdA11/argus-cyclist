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

// Workout Gallery
const workoutModal = document.getElementById('workoutModal');
document.getElementById('btnOpenWorkouts').addEventListener('click', () => {
    workoutModal.classList.remove('hidden');
    loadWorkoutGallery();
});
document.getElementById('btnCloseWorkouts').addEventListener('click', () => workoutModal.classList.add('hidden'));

async function loadWorkoutGallery() {
    const list = document.getElementById('workoutList');
    list.innerHTML = '<div class="text-gray-500">Loading workouts...</div>';
    
    // Treinos de exemplo (No futuro virão do backend)
    const sampleWorkouts = [
        { id: 'ramp-test', name: 'Ramp Test', description: 'Classic FTP test to find your limits.', duration: '20 min', path: 'sample-workouts/ramp-test.json' },
        { id: 'sweet-spot', name: 'Sweet Spot Intervals', description: 'Build aerobic engine with 2x10min intervals.', duration: '45 min', path: 'sample-workouts/sweet-spot.json' },
        { id: 'vo2-max', name: 'VO2 Max Boost', description: 'Short, intense bursts to improve top-end power.', duration: '30 min', path: 'sample-workouts/vo2max.json' }
    ];

    list.innerHTML = sampleWorkouts.map(w => `
        <div class="bg-gray-900 p-4 rounded-xl border border-gray-700 hover:border-blue-500 transition-all cursor-pointer group" onclick="window.ui.selectWorkout('${w.path}')">
            <div class="flex justify-between items-start mb-2">
                <h4 class="font-bold text-lg group-hover:text-blue-400">${w.name}</h4>
                <span class="text-xs bg-gray-800 px-2 py-1 rounded text-gray-400">${w.duration}</span>
            </div>
            <p class="text-sm text-gray-500">${w.description}</p>
        </div>
    `).join('');
}

window.ui.selectWorkout = async (path) => {
    if (window.go && window.go.main && window.go.main.App) {
        try {
            await window.go.main.App.StartWorkout(path);
            workoutModal.classList.add('hidden');
            document.getElementById('workoutHUD').classList.remove('hidden');
            console.log("Workout started:", path);
        } catch (e) {
            alert("Error starting workout: " + e);
        }
    }
};

document.getElementById('btnStopWorkout').addEventListener('click', async () => {
    if (window.go && window.go.main && window.go.main.App) {
        await window.go.main.App.StopWorkout();
        document.getElementById('workoutHUD').classList.add('hidden');
    }
});

// Eventos do Workout Engine
if (window.runtime) {
    window.runtime.EventsOn("workout_update", (state) => {
        document.getElementById('stepTimer').innerText = formatTime(state.remainingInStep);
        document.getElementById('targetPowerDisplay').innerText = Math.round(state.targetPower);
        document.getElementById('stepProgressBar').style.width = `${(state.elapsedInStep / (state.elapsedInStep + state.remainingInStep)) * 100}%`;
        
        // Aqui poderíamos atualizar a lista de próximos passos
    });

    window.runtime.EventsOn("workout_finished", () => {
        alert("Workout Finished! Great job!");
        document.getElementById('workoutHUD').classList.add('hidden');
    });
}

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

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
    if (!isRecording) {
        try {
            await window.go.main.App.ToggleSession();
        } catch (e) { alert("Error: " + e); }
    } else {
        await window.go.main.App.ToggleSession();
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
        mapCtrl.updateCyclistPosition(data.lat, data.lon, data.speed);
    });
}