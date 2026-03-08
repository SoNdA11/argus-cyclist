/*
    Argus Cyclist - Virtual Cycling Environment for interactive bicycling experiments.
    Copyright (C) 2026  Paulo Sérgio

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.
*/

import './styles/main.css';
import { CONFIG } from './config.js';
import { MapController } from './modules/MapController.js';
import { UIManager } from './modules/UIManager.js';
import { ElevationChart } from './modules/ElevationChart.js';
import { WorkoutController } from './modules/WorkoutController.js';

// Importações do Capacitor para a versão Mobile
import { Capacitor } from '@capacitor/core';
import { CapacitorBluetoothService } from './modules/CapacitorBluetoothService.js';

// =====================
// MOBILE WAILS POLYFILL
// =====================
if (typeof window.go === 'undefined') {
    window.go = {
        main: {
            App: new Proxy({}, {
                get: function(target, prop) {
                    if (prop === 'GetUserProfile') return async () => ({ name: "Mobile", weight: 75, bike_weight: 9, ftp: 200, units: "metric" });
                    if (prop === 'GetTotalStats') return async () => ({ total_km: 0, total_time: 0 });
                    if (prop === 'GetActivities') return async () => [];
                    if (prop === 'GetMonthlyActivities') return async () => [];
                    if (prop === 'GetPowerCurve') return async () => [];
                    if (prop === 'GetCareerDashboard') return async () => ({ pmc: [], mmp: [] });
                    
                    return async () => { console.log("Mocked Go App call:", prop); return null; };
                }
            })
        }
    };
}

// =======================
// MOBILE PHYSICS POLYFILL
// =======================
if (typeof window.WasmCalculateSpeed === 'undefined') {
    window.WasmCalculateSpeed = function(watts, gradePct, riderWeight, bikeWeight) {
        if (watts <= 0) {
            if (gradePct < -2.0) return Math.sqrt(-gradePct / 100 * 9.81 * 2);
            return 0;
        }

        const m = (riderWeight || 75) + (bikeWeight || 9); // Total Mass
        const g = 9.81; // Gravity
        const crr = 0.004; // Rolling Resistance
        const cdA = 0.32; // Aerodynamic Coefficient
        const rho = 1.225; // Air Density
        const gradeDecimal = gradePct / 100.0;
        
        // Transmission losses (3%)
        const powerToWheel = watts * 0.97;

        let v = 5.0; // Initial starting point (m/s)
        
        // Newton-Raphson method for finding the exact speed.
        for (let i = 0; i < 10; i++) {
            const F_grav = g * m * Math.sin(Math.atan(gradeDecimal));
            const F_roll = g * m * Math.cos(Math.atan(gradeDecimal)) * crr;
            const F_aero = 0.5 * cdA * rho * v * v;
            
            const P_total = (F_grav + F_roll + F_aero) * v;
            const P_diff = P_total - powerToWheel;
            
            const dP_dv = F_grav + F_roll + 1.5 * cdA * rho * v * v;
            
            v = v - (P_diff / dP_dv);
            if (v < 0) return 0;
        }
        
        return v;
    };
}

if (typeof window.runtime === 'undefined') {
    window.runtime = {
        EventsOn: (event, cb) => console.log("Mocked Wails Event:", event),
        EventsEmit: () => {}
    };
}
// ==========================
// APPLICATION INITIALIZATION
// ==========================

const mapCtrl = new MapController();
window.mapController = mapCtrl;

const ui = new UIManager();
window.ui = ui;

const chart = new ElevationChart('elevationCanvas');
window.chart = chart;

const workoutCtrl = new WorkoutController();
window.workoutCtrl = workoutCtrl;

// Global State
window.totalRouteDistance = 0;
window.isRecording = false;
let isFinishTriggered = false;

// Bluetooth Mobile Initialization (Capacitor)
let mobileBLE = null;
if (Capacitor.isNativePlatform()) {
    mobileBLE = new CapacitorBluetoothService();
    window.mobileBLE = mobileBLE;
    console.log("Native Mobile Mode Detected (Capacitor)");
    
    document.getElementById('btnScanTrainer').classList.add('hidden');
    document.getElementById('trainerList').classList.add('hidden');
    document.getElementById('btnConnTrainer').classList.remove('hidden');
    
    document.getElementById('btnScanHR').classList.add('hidden');
    document.getElementById('hrList').classList.add('hidden');
    document.getElementById('btnConnHR').classList.remove('hidden');
}

window.closeWorkout = async () => {
    if (confirm("Stop the structured workout and return to Free Ride?")) {
        if (typeof workoutCtrl !== 'undefined') workoutCtrl.hide();

        if (Capacitor.isNativePlatform()) {
            console.log("Mobile: Returned to SIM mode.");
        } else if (window.go && window.go.main && window.go.main.App) {
            try { 
                await window.go.main.App.SetTrainerMode('SIM'); 
            } catch (e) { 
                console.error("Error returning to SIM mode:", e); 
            }
        }
    }
};

mapCtrl.init('map-container');
ui.toggleSettings(true);


// ==================
// UI EVENT LISTENERS
// ==================

document.getElementById('selectTrainerMode').addEventListener('change', async (e) => {
    const mode = e.target.value;
    const ergControl = document.getElementById('ergControl');

    if (mode === 'ERG') ergControl.classList.remove('hidden');
    else ergControl.classList.add('hidden');

    if (!Capacitor.isNativePlatform() && window.go && window.go.main && window.go.main.App) {
        await window.go.main.App.SetTrainerMode(mode);
    }
});

document.getElementById('btnSetPower').addEventListener('click', async () => {
    const watts = parseFloat(document.getElementById('inputTargetPower').value);
    
    if (Capacitor.isNativePlatform() && window.mobileBLE) {
        window.mobileBLE.sendTargetPower(watts);
    } else if (!Capacitor.isNativePlatform() && window.go && window.go.main && window.go.main.App) {
        await window.go.main.App.SetPowerTarget(watts);
    }
});

document.getElementById('btnCloseSettings').addEventListener('click', () => ui.toggleSettings(false));
document.getElementById('btnOpenSettings').addEventListener('click', () => ui.toggleSettings(true));


// ==================
// DEVICE CONNECTIONS
// ==================

// 1. SCAN TRAINERS (Desktop only)
document.getElementById('btnScanTrainer').addEventListener('click', async () => {
    if (Capacitor.isNativePlatform()) return; 
    
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
                opt.value = d.address; opt.text = d.name;
                list.appendChild(opt);
            });
            list.classList.remove('hidden');
            btnConn.classList.remove('hidden');
            btnScan.classList.add('hidden');
            status.innerText = "Select a device";
        } else {
            status.innerText = "No devices found";
            btnScan.innerText = "🔍"; btnScan.disabled = false;
        }
    } catch (err) {
        status.innerText = "Scan error"; btnScan.innerText = "🔍"; btnScan.disabled = false;
    }
});

// 2. CONNECT TRAINER (Dual Mode: Mobile/Desktop)
document.getElementById('btnConnTrainer').addEventListener('click', async () => {
    const btnVirtual = document.getElementById('btnConnVirtual');
    const btnReal = document.getElementById('btnConnTrainer');
    const btnScan = document.getElementById('btnScanTrainer');
    const list = document.getElementById('trainerList');
    const status = document.getElementById('statusTrainer');

    // --- MODO MOBILE (Capacitor) ---
    if (Capacitor.isNativePlatform()) {
        if (status.innerText === "Trainer Connected") {
            await mobileBLE.disconnectTrainer();
            status.innerText = "Disconnected";
            status.style.color = "";
            btnReal.innerText = "🔗";
            return;
        }

        btnReal.innerText = "⏳";
        const success = await mobileBLE.connectTrainer(
            (msg) => { 
                status.innerText = msg;
                if (msg === "Trainer Connected") status.style.color = "var(--argus-safe)";
            },
            (data) => { 
                ui.updateTelemetry(data, window.totalRouteDistance); 
                if (window.mapController) window.mapController.updateCyclistPosition(data.lat, data.lon, data.speed, data);
            }
        );
        btnReal.innerText = success ? "❌" : "🔗";
        return;
    }

    // --- MODO DESKTOP (Wails) ---
    if (!Capacitor.isNativePlatform() && window.go && window.go.main) {
        if (status.innerText === "Trainer Connected") {
            await window.go.main.App.DisconnectTrainer();
            status.innerText = "Disconnected"; status.style.color = "";
            btnReal.innerText = "🔗"; btnReal.classList.add('hidden');
            list.classList.add('hidden'); list.disabled = false;
            btnScan.classList.remove('hidden'); btnScan.innerText = "🔍"; btnScan.disabled = false;
            btnVirtual.disabled = false;
            return;
        }

        const selectedMac = list.value;
        if (!selectedMac) { alert("Please select a trainer from the list."); return; }

        btnReal.innerText = "⏳"; btnReal.disabled = true; btnVirtual.disabled = true; list.disabled = true;

        try {
            const result = await window.go.main.App.ConnectTrainer(selectedMac);
            status.innerText = result; status.style.color = "var(--argus-safe)";
            btnReal.innerText = "❌"; btnReal.disabled = false;
        } catch (err) {
            status.innerText = "Error connecting"; status.style.color = "var(--argus-alert)";
            btnReal.innerText = "🔗"; btnReal.disabled = false; btnVirtual.disabled = false; list.disabled = false;
        }
    }
});

// ---------------------------
// SIMULATOR (VIRTUAL TRAINER)
// ---------------------------

document.getElementById('btnConnVirtual').addEventListener('click', async () => {
    if (Capacitor.isNativePlatform()) { alert("Virtual Simulator not available on mobile yet."); return; }
    
    const btnVirtual = document.getElementById('btnConnVirtual');
    const btnReal = document.getElementById('btnConnTrainer');
    const btnScan = document.getElementById('btnScanTrainer');
    const list = document.getElementById('trainerList');
    const status = document.getElementById('statusTrainer');

    if (status.innerText === "Simulator Active") {
        await window.go.main.App.DisconnectTrainer();
        status.innerText = "Disconnected"; status.style.color = "";
        btnVirtual.innerText = "💻"; btnScan.disabled = false;
        return;
    }

    btnVirtual.innerText = "⏳"; btnVirtual.disabled = true; btnScan.disabled = true;
    if (!btnReal.classList.contains('hidden')) btnReal.disabled = true;

    try {
        const result = await window.go.main.App.ConnectVirtualTrainer();
        status.innerText = result; status.style.color = "#00ADD8";
        btnVirtual.innerText = "❌"; btnVirtual.disabled = false;
        list.classList.add('hidden'); btnReal.classList.add('hidden'); btnScan.classList.remove('hidden');
    } catch (err) {
        status.innerText = "Error: " + err; status.style.color = "var(--argus-alert)";
        btnVirtual.innerText = "💻"; btnVirtual.disabled = false; btnScan.disabled = false;
    }
});

// 1. SCAN HR (Desktop only)
document.getElementById('btnScanHR').addEventListener('click', async () => {
    if (Capacitor.isNativePlatform()) return;
    
    const btnScan = document.getElementById('btnScanHR');
    const btnConn = document.getElementById('btnConnHR');
    const list = document.getElementById('hrList');
    const status = document.getElementById('statusHR');

    btnScan.innerText = "⏳"; btnScan.disabled = true; status.innerText = "Scanning...";

    try {
        const devices = await window.go.main.App.ScanHeartRate();
        list.innerHTML = '<option value="">Select device...</option>';

        if (devices && devices.length > 0) {
            devices.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d.address; opt.text = d.name; list.appendChild(opt);
            });
            list.classList.remove('hidden'); btnConn.classList.remove('hidden'); btnScan.classList.add('hidden');
            status.innerText = "Select a device";
        } else {
            status.innerText = "No devices found"; btnScan.innerText = "🔍"; btnScan.disabled = false;
        }
    } catch (err) { status.innerText = "Scan error"; btnScan.innerText = "🔍"; btnScan.disabled = false; }
});

// 2. CONNECT HR (Dual Mode)
document.getElementById('btnConnHR').addEventListener('click', async () => {
    const btnReal = document.getElementById('btnConnHR');
    const btnScan = document.getElementById('btnScanHR');
    const list = document.getElementById('hrList');
    const status = document.getElementById('statusHR');

    // --- MOBILE MODE ---
    if (Capacitor.isNativePlatform()) {
        if (status.innerText === "HR Connected") {
            await mobileBLE.disconnectHeartRate();
            status.innerText = "Disconnected"; status.style.color = ""; btnReal.innerText = "🔗";
            return;
        }

        btnReal.innerText = "⏳";
        const success = await mobileBLE.connectHeartRate((msg) => { 
            status.innerText = msg;
            if (msg === "HR Connected") status.style.color = "var(--argus-safe)";
        });
        btnReal.innerText = success ? "❌" : "🔗";
        return;
    }

    // --- DESKTOP MODE ---
    if (!Capacitor.isNativePlatform() && window.go && window.go.main) {
        if (status.innerText === "HR Monitor Connected" || status.innerText === "Connected") {
            await window.go.main.App.DisconnectHeartRate();
            status.innerText = "Disconnected"; status.style.color = "";
            btnReal.innerText = "🔗"; btnReal.classList.add('hidden');
            list.classList.add('hidden'); list.disabled = false;
            btnScan.classList.remove('hidden'); btnScan.innerText = "🔍"; btnScan.disabled = false;
            return;
        }

        const selectedMac = list.value;
        if (!selectedMac) { alert("Please select a HR monitor from the list."); return; }

        btnReal.innerText = "⏳"; btnReal.disabled = true; list.disabled = true;

        try {
            const result = await window.go.main.App.ConnectHeartRate(selectedMac);
            status.innerText = result; status.style.color = "var(--argus-safe)";
            btnReal.innerText = "❌"; btnReal.disabled = false;
        } catch (err) {
            status.innerText = "Error"; status.style.color = "var(--argus-alert)";
            btnReal.innerText = "🔗"; btnReal.disabled = false; list.disabled = false;
        }
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
    // --- MOBILE MODE ---
    if (Capacitor.isNativePlatform()) {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = '.gpx';
        input.onchange = e => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => { parseGPXForMobile(ev.target.result, file.name); };
            reader.readAsText(file);
        };
        input.click();
        return;
    }

    // --- DESKTOP MODE (Wails) ---
    try {
        if (!window.go || !window.go.main) return;
        const filename = await window.go.main.App.SelectGPX();
        if (filename) {
            ui.setFilename(filename);
            ui.els.btnAction.classList.remove('hidden');

            const routePoints = await window.go.main.App.GetRoutePath();

            if (routePoints.length > 1) {
                window.totalRouteDistance = routePoints[routePoints.length - 1].distance;
                ui.showRoutePreview(window.totalRouteDistance);

                const features = [];
                for (let i = 0; i < routePoints.length - 1; i++) {
                    features.push({
                        type: 'Feature', properties: { grade: routePoints[i].grade },
                        geometry: { type: 'LineString', coordinates: [[routePoints[i].lon, routePoints[i].lat], [routePoints[i + 1].lon, routePoints[i + 1].lat]] }
                    });
                }

                mapCtrl.renderRoute({ type: 'FeatureCollection', features: features });
                mapCtrl.setInitialPosition(routePoints[0].lat, routePoints[0].lon);
                
                const elevations = await window.go.main.App.GetElevationProfile();
                chart.setData(elevations);
            }
        }
    } catch (e) { alert("Error importing GPX: " + e); }
});

// GPX Parser for Mobile
function parseGPXForMobile(gpxText, filename) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(gpxText, "text/xml");
    const trkpts = xmlDoc.getElementsByTagName("trkpt");
    
    if (trkpts.length === 0) { alert("No route points found in GPX"); return; }

    const points = [];
    let totalDist = 0;
    
    const calcDist = (lat1, lon1, lat2, lon2) => {
        const R = 6371e3; const p1 = lat1 * Math.PI/180; const p2 = lat2 * Math.PI/180;
        const dp = (lat2-lat1) * Math.PI/180; const dl = (lon2-lon1) * Math.PI/180;
        const a = Math.sin(dp/2) * Math.sin(dp/2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl/2) * Math.sin(dl/2);
        return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
    };

    for (let i = 0; i < trkpts.length; i++) {
        const lat = parseFloat(trkpts[i].getAttribute("lat"));
        const lon = parseFloat(trkpts[i].getAttribute("lon"));
        const eleNode = trkpts[i].getElementsByTagName("ele")[0];
        const ele = eleNode ? parseFloat(eleNode.textContent) : 0;
        
        if (i > 0) totalDist += calcDist(points[i-1].lat, points[i-1].lon, lat, lon);
        points.push({ lat, lon, ele, distance: totalDist, grade: 0 });
    }

    for (let i = 1; i < points.length; i++) {
        const p1 = points[i-1]; const p2 = points[i];
        const dDist = p2.distance - p1.distance;
        p2.grade = dDist > 0 ? ((p2.ele - p1.ele) / dDist) * 100 : p1.grade;
    }
    
    const smoothedPoints = points.map((p, i, arr) => {
        let start = Math.max(0, i-2), end = Math.min(arr.length-1, i+2), sumGrade = 0;
        for(let j=start; j<=end; j++) sumGrade += arr[j].grade;
        return { ...p, grade: sumGrade / (end - start + 1) };
    });

    window.mobileRoutePoints = smoothedPoints;
    window.totalRouteDistance = totalDist;

    window.WasmGetRoutePoint = function(dist) {
        const pts = window.mobileRoutePoints;
        if (!pts || pts.length === 0) return null;
        const safeDist = dist % window.totalRouteDistance;
        let idx = 0;
        for (let i = 0; i < pts.length; i++) { if (pts[i].distance >= safeDist) { idx = i; break; } }
        return JSON.stringify(pts[idx]);
    };

    ui.setFilename(filename);
    ui.els.btnAction.classList.remove('hidden');
    ui.showRoutePreview(window.totalRouteDistance);

    const features = [];
    for (let i = 0; i < smoothedPoints.length - 1; i++) {
        features.push({
            type: 'Feature', properties: { grade: smoothedPoints[i].grade },
            geometry: { type: 'LineString', coordinates: [[smoothedPoints[i].lon, smoothedPoints[i].lat], [smoothedPoints[i+1].lon, smoothedPoints[i+1].lat]] }
        });
    }
    
    window.mapController.renderRoute({ type: 'FeatureCollection', features: features });
    window.mapController.setInitialPosition(smoothedPoints[0].lat, smoothedPoints[0].lon);
    window.chart.setData(smoothedPoints.map(p => p.ele));
}


// ==============
// WORKOUT IMPORT
// ==============

document.getElementById('btnLoadWorkout').addEventListener('click', async () => {
    // --- MOBILE MODE (Capacitor) ---
    if (Capacitor.isNativePlatform()) {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = '.zwo';
        input.onchange = e => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => { parseZWOForMobile(ev.target.result); };
            reader.readAsText(file);
        };
        input.click();
        return;
    }

    // --- DESKTOP MODE (Wails) ---
    try {
        if (!window.go || !window.go.main) return;
        const result = await window.go.main.App.LoadWorkout();
        if (result) {
            console.log("Workout loaded:", result);
            ui.els.btnAction.classList.remove('hidden');
        }
    } catch (e) { alert("Error loading workout: " + e); }
});

// ZWO Parser for Mobile
function parseZWOForMobile(xmlString) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");
    
    const workoutObj = { Segments: [], TotalDuration: 0 };
    const workoutNodes = xmlDoc.getElementsByTagName("workout");
    
    if (workoutNodes.length === 0) { alert("Invalid ZWO file."); return; }
    
    const elements = workoutNodes[0].children;
    let idx = 0;

    for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        const type = el.tagName;
        const dur = parseInt(el.getAttribute("Duration")) || 0;
        
        if (type === "SteadyState" || type === "FreeRide") {
            const pwr = parseFloat(el.getAttribute("Power")) || 0;
            workoutObj.Segments.push({ Index: idx++, Type: "STEADY", DurationSeconds: dur, StartFactor: pwr, EndFactor: pwr });
            workoutObj.TotalDuration += dur;
        } else if (type === "Warmup" || type === "Cooldown" || type === "Ramp") {
            const pwrLow = parseFloat(el.getAttribute("PowerLow")) || 0;
            const pwrHigh = parseFloat(el.getAttribute("PowerHigh")) || 0;
            workoutObj.Segments.push({ Index: idx++, Type: "RAMP", DurationSeconds: dur, StartFactor: pwrLow, EndFactor: pwrHigh });
            workoutObj.TotalDuration += dur;
        } else if (type === "IntervalsT") {
            const repeat = parseInt(el.getAttribute("Repeat")) || 1;
            const onDur = parseInt(el.getAttribute("OnDuration")) || 0;
            const offDur = parseInt(el.getAttribute("OffDuration")) || 0;
            const onPwr = parseFloat(el.getAttribute("OnPower")) || 0;
            const offPwr = parseFloat(el.getAttribute("OffPower")) || 0;

            for (let r = 0; r < repeat; r++) {
                workoutObj.Segments.push({ Index: idx++, Type: "INTERVAL_ON", DurationSeconds: onDur, StartFactor: onPwr, EndFactor: onPwr });
                workoutObj.Segments.push({ Index: idx++, Type: "INTERVAL_OFF", DurationSeconds: offDur, StartFactor: offPwr, EndFactor: offPwr });
                workoutObj.TotalDuration += (onDur + offDur);
            }
        }
    }

    window.workoutCtrl.loadWorkout(workoutObj);
    ui.els.btnAction.classList.remove('hidden');
}


// ==================
// RECORDING CONTROLS
// ==================

async function finishWorkout() {
    isFinishTriggered = true;
    window.isRecording = false;
    
    // --- MOBILE MODE (Capacitor) ---
    if (Capacitor.isNativePlatform()) {
        ui.setRecordingState('IDLE');
        ui.showFinishModal({ distance: window.totalRouteDistance, duration: window.workoutCtrl ? window.workoutCtrl.mobileElapsedTime : 0 });
        alert("Mobile version currently supports live metrics. FIT file saving is available on Desktop.");
        return;
    }

    // --- DESKTOP MODE (Wails) ---
    try {
        if (!window.go || !window.go.main) return;
        const sessionSummary = await window.go.main.App.FinishSession();
        ui.showFinishModal(sessionSummary);
    } catch (e) { alert("Error when saving: " + e); }
}

document.getElementById('btnAction').addEventListener('click', async () => {
    try {
        if (!window.isRecording) {
            isFinishTriggered = false;
            window.isRecording = true;
            ui.setRecordingState('RECORDING');
        } else {
            window.isRecording = false;
            ui.setRecordingState('PAUSED');
        }

        if (!Capacitor.isNativePlatform() && window.go && window.go.main) {
            await window.go.main.App.ToggleSession();
        }
    } catch (e) { alert("Error: " + e); }
});

document.getElementById('btnResume').addEventListener('click', async () => {
    window.isRecording = true;
    ui.setRecordingState('RECORDING');
    if (!Capacitor.isNativePlatform() && window.go && window.go.main) {
        await window.go.main.App.ToggleSession();
    }
});

document.getElementById('btnFinishSave').addEventListener('click', async () => {
    await finishWorkout();
});

document.getElementById('btnDiscard').addEventListener('click', async () => {
    if (confirm("Discard this activity? It won't be saved.")) {
        if (!Capacitor.isNativePlatform() && window.go && window.go.main) {
            await window.go.main.App.DiscardSession();
        }
        ui.setRecordingState('IDLE');
        window.isRecording = false;
    }
});


// =======================
// KEYBOARD DEBUG CONTROLS
// =======================

document.addEventListener('keydown', async (e) => {
    let delta = 0;
    if (e.key === "ArrowUp") delta = 10;
    if (e.key === "ArrowDown") delta = -10;

    if (delta !== 0 && !Capacitor.isNativePlatform() && window.go && window.go.main && window.go.main.App) {
        await window.go.main.App.ChangePowerSimulation(delta);
    }
});


// =======================
// TAB NAVIGATION (GLOBAL)
// =======================

function openTab(tabId, event) {
    document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

    document.getElementById(tabId).classList.add('active');
    event.currentTarget.classList.add('active');

    if (tabId === 'tab-career') {
        setTimeout(() => { window.ui.loadCareerDashboard(); }, 50);
    }
}
window.openTab = openTab;

if (window.runtime && !Capacitor.isNativePlatform()) {
    window.runtime.EventsOn("ble_connection_status", (data) => {
        if (data.stage === "READY") mapCtrl.followCyclist = true;
    });

    window.runtime.EventsOn("status_change", (status) => {
        if (status === "RECORDING") { ui.setRecordingState('RECORDING'); window.isRecording = true; }
        else if (status === "PAUSED") { ui.setRecordingState('PAUSED'); window.isRecording = true; }
        else { ui.setRecordingState('IDLE'); window.isRecording = false; }
    });

    window.runtime.EventsOn("telemetry_update", (data) => {
        ui.updateTelemetry(data, totalRouteDistance);
        mapCtrl.updateCyclistPosition(data.lat, data.lon, data.speed, data);
    });
}