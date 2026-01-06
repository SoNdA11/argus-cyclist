import './styles/main.css';
import { CONFIG } from './config.js';
import { MapController } from './modules/MapController.js';
import { UIManager } from './modules/UIManager.js';
import { ElevationChart } from './modules/ElevationChart.js';

// --- INITIALIZATION ---
const mapCtrl = new MapController();
const ui = new UIManager();
const chart = new ElevationChart('elevationCanvas');

let totalRouteDistance = 0;
let isRecording = false;

// Initialize Map
mapCtrl.init('map-container');

// Open Settings/Welcome immediately
ui.toggleSettings(true);

// Verify Token
if (!CONFIG.MAPBOX_TOKEN || !CONFIG.MAPBOX_TOKEN.startsWith('pk.')) {
    ui.showTokenWarning();
}

// --- EVENT LISTENERS (UI) ---

document.getElementById('btnCloseSettings').addEventListener('click', () => {
    ui.toggleSettings(false);
});

document.getElementById('btnOpenSettings').addEventListener('click', () => {
    ui.toggleSettings(true);
});

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

document.getElementById('btnLayers').addEventListener('click', () => {
    mapCtrl.toggleLayer();
    chart.draw();
});

document.getElementById('btnCenter').addEventListener('click', () => {
    mapCtrl.centerCamera();
});

document.getElementById('btnImport').addEventListener('click', async () => {
    try {
        const filename = await window.go.main.App.SelectGPX();
        if (filename) {
            ui.setFilename(filename);
            ui.els.btnAction.classList.remove('hidden');

            const routePoints = await window.go.main.App.GetRoutePath();
            
            if (routePoints.length > 1) {
                const features = [];
                for(let i=0; i < routePoints.length - 1; i++) {
                    features.push({
                        type: 'Feature',
                        properties: { grade: routePoints[i].grade }, 
                        geometry: {
                            type: 'LineString',
                            coordinates: [
                                [routePoints[i].lon, routePoints[i].lat],
                                [routePoints[i+1].lon, routePoints[i+1].lat]
                            ]
                        }
                    });
                }
                
                const geoJson = { type: 'FeatureCollection', features: features };
                mapCtrl.renderRoute(geoJson);

                const start = routePoints[0];
                mapCtrl.setInitialPosition(start.lat, start.lon);

                const elevations = await window.go.main.App.GetElevationProfile();
                chart.setData(elevations);
                
                totalRouteDistance = routePoints[routePoints.length-1].distance;
            }
        }
    } catch (e) { 
        alert("Error importing GPX: " + e); 
    }
});

document.getElementById('btnAction').addEventListener('click', async () => {
    if (!isRecording) {
        try { 
            await window.go.main.App.ToggleSession(); 
        } catch(e) { alert("Error: " + e); }
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
    if(confirm("Discard this activity? It won't be saved.")) {
        await window.go.main.App.DiscardSession();
        ui.setRecordingState('IDLE');
        isRecording = false;
    }
});

document.addEventListener('keydown', async (e) => {
    let delta = 0; 
    if(e.key === "ArrowUp") delta = 10; 
    if(e.key === "ArrowDown") delta = -10;
    
    if(delta !== 0 && window.go && window.go.main && window.go.main.App) {
        await window.go.main.App.ChangePowerSimulation(delta);
    }
});

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