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

// Capacitor imports for the Mobile version
import { Capacitor } from '@capacitor/core';
import { CapacitorBluetoothService } from './modules/CapacitorBluetoothService.js';

// =====================
// MOBILE WAILS POLYFILL
// =====================
if (typeof window.go === 'undefined') {
    window.go = {
        main: {
            App: new Proxy({}, {
                get: function (target, prop) {
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
    window.WasmCalculateSpeed = function (watts, gradePct, riderWeight, bikeWeight) {
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
        EventsEmit: () => { }
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

// --- Dashboard Toggle Event ---
document.getElementById('btnToggleView').addEventListener('click', () => {
    window.ui.toggleDashboardMode();
});

// ==================
// DEVICE CONNECTIONS
// ==================

const svgIcons = {
    scan: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`,
    bt: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6.5 6.5 17.5 17.5 12 23 12 1 17.5 6.5 6.5 17.5"></polyline></svg>`,
    virtual: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="2" y1="20" x2="22" y2="20"></line></svg>`,
    disconnect: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
    wait: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 22h14"></path><path d="M5 2h14"></path><path d="M14 22V18.13a4 4 0 0 0-1.17-2.83L12 14.4l-1.83.9A4 4 0 0 0 9 18.13V22"></path><path d="M14 2v3.87a4 4 0 0 1-1.17 2.83L12 9.6l-1.83-.9A4 4 0 0 1 9 5.87V2"></path></svg>`
};

// 1. SCAN TRAINERS (Desktop only)
document.getElementById('btnScanTrainer').addEventListener('click', async () => {
    if (Capacitor.isNativePlatform()) return;

    const btnScan = document.getElementById('btnScanTrainer');
    const btnConn = document.getElementById('btnConnTrainer');
    const list = document.getElementById('trainerList');
    const status = document.getElementById('statusTrainer');

    btnScan.innerHTML = svgIcons.wait;
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
            btnScan.innerHTML = svgIcons.scan; btnScan.disabled = false;
        }
    } catch (err) {
        status.innerText = "Scan error"; btnScan.innerHTML = svgIcons.scan; btnScan.disabled = false;
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
            btnReal.innerHTML = svgIcons.bt;
            return;
        }

        btnReal.innerHTML = svgIcons.wait;
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
        btnReal.innerHTML = success ? svgIcons.disconnect : svgIcons.bt;
        return;
    }

    // --- MODO DESKTOP (Wails) ---
    if (!Capacitor.isNativePlatform() && window.go && window.go.main) {
        if (status.innerText === "Trainer Connected") {
            await window.go.main.App.DisconnectTrainer();
            status.innerText = "Disconnected"; status.style.color = "";
            btnReal.innerHTML = svgIcons.bt; btnReal.classList.add('hidden');
            list.classList.add('hidden'); list.disabled = false;
            btnScan.classList.remove('hidden'); btnScan.innerHTML = svgIcons.scan; btnScan.disabled = false;
            btnVirtual.disabled = false;
            return;
        }

        const selectedMac = list.value;
        if (!selectedMac) { alert("Please select a trainer from the list."); return; }

        btnReal.innerHTML = svgIcons.wait; btnReal.disabled = true; btnVirtual.disabled = true; list.disabled = true;

        try {
            const result = await window.go.main.App.ConnectTrainer(selectedMac);
            status.innerText = result; status.style.color = "var(--argus-safe)";
            btnReal.innerHTML = svgIcons.disconnect; btnReal.disabled = false;
        } catch (err) {
            status.innerText = "Error connecting"; status.style.color = "var(--argus-alert)";
            btnReal.innerHTML = svgIcons.bt; btnReal.disabled = false; btnVirtual.disabled = false; list.disabled = false;
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
        btnVirtual.innerHTML = svgIcons.virtual; btnScan.disabled = false;
        return;
    }

    btnVirtual.innerHTML = svgIcons.wait; btnVirtual.disabled = true; btnScan.disabled = true;
    if (!btnReal.classList.contains('hidden')) btnReal.disabled = true;

    try {
        const result = await window.go.main.App.ConnectVirtualTrainer();
        status.innerText = result; status.style.color = "#00ADD8";
        // Usa um X vermelho elegante quando conectado (para poder desconectar)
        btnVirtual.innerHTML = svgIcons.disconnect; btnVirtual.disabled = false;
        list.classList.add('hidden'); btnReal.classList.add('hidden'); btnScan.classList.remove('hidden');
    } catch (err) {
        status.innerText = "Error: " + err; status.style.color = "var(--argus-alert)";
        btnVirtual.innerHTML = svgIcons.virtual; btnVirtual.disabled = false; btnScan.disabled = false;
    }
});

// 1. SCAN HR (Desktop only)
document.getElementById('btnScanHR').addEventListener('click', async () => {
    if (Capacitor.isNativePlatform()) return;

    const btnScan = document.getElementById('btnScanHR');
    const btnConn = document.getElementById('btnConnHR');
    const list = document.getElementById('hrList');
    const status = document.getElementById('statusHR');

    btnScan.innerHTML = svgIcons.wait; btnScan.disabled = true; status.innerText = "Scanning...";

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
            status.innerText = "No devices found"; btnScan.innerHTML = svgIcons.scan; btnScan.disabled = false;
        }
    } catch (err) { status.innerText = "Scan error"; btnScan.innerHTML = svgIcons.scan; btnScan.disabled = false; }
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
            status.innerText = "Disconnected"; status.style.color = ""; btnReal.innerHTML = svgIcons.bt;
            return;
        }

        btnReal.innerHTML = svgIcons.wait;
        const success = await mobileBLE.connectHeartRate((msg) => {
            status.innerText = msg;
            if (msg === "HR Connected") status.style.color = "var(--argus-safe)";
        });
        btnReal.innerHTML = success ? svgIcons.disconnect : svgIcons.bt;
        return;
    }

    // --- DESKTOP MODE ---
    if (!Capacitor.isNativePlatform() && window.go && window.go.main) {
        if (status.innerText === "HR Monitor Connected" || status.innerText === "Connected") {
            await window.go.main.App.DisconnectHeartRate();
            status.innerText = "Disconnected"; status.style.color = "";
            btnReal.innerHTML = svgIcons.bt; btnReal.classList.add('hidden');
            list.classList.add('hidden'); list.disabled = false;
            btnScan.classList.remove('hidden'); btnScan.innerHTML = svgIcons.scan; btnScan.disabled = false;
            return;
        }

        const selectedMac = list.value;
        if (!selectedMac) { alert("Please select a HR monitor from the list."); return; }

        btnReal.innerHTML = svgIcons.wait; btnReal.disabled = true; list.disabled = true;

        try {
            const result = await window.go.main.App.ConnectHeartRate(selectedMac);
            status.innerText = result; status.style.color = "var(--argus-safe)";
            btnReal.innerHTML = svgIcons.disconnect; btnReal.disabled = false;
        } catch (err) {
            status.innerText = "Error"; status.style.color = "var(--argus-alert)";
            btnReal.innerHTML = svgIcons.bt; btnReal.disabled = false; list.disabled = false;
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
        const R = 6371e3; const p1 = lat1 * Math.PI / 180; const p2 = lat2 * Math.PI / 180;
        const dp = (lat2 - lat1) * Math.PI / 180; const dl = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
        return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
    };

    for (let i = 0; i < trkpts.length; i++) {
        const lat = parseFloat(trkpts[i].getAttribute("lat"));
        const lon = parseFloat(trkpts[i].getAttribute("lon"));
        const eleNode = trkpts[i].getElementsByTagName("ele")[0];
        const ele = eleNode ? parseFloat(eleNode.textContent) : 0;

        if (i > 0) totalDist += calcDist(points[i - 1].lat, points[i - 1].lon, lat, lon);
        points.push({ lat, lon, ele, distance: totalDist, grade: 0 });
    }

    for (let i = 1; i < points.length; i++) {
        const p1 = points[i - 1]; const p2 = points[i];
        const dDist = p2.distance - p1.distance;
        p2.grade = dDist > 0 ? ((p2.ele - p1.ele) / dDist) * 100 : p1.grade;
    }

    const smoothedPoints = points.map((p, i, arr) => {
        let start = Math.max(0, i - 2), end = Math.min(arr.length - 1, i + 2), sumGrade = 0;
        for (let j = start; j <= end; j++) sumGrade += arr[j].grade;
        return { ...p, grade: sumGrade / (end - start + 1) };
    });

    window.mobileRoutePoints = smoothedPoints;
    window.totalRouteDistance = totalDist;

    window.WasmGetRoutePoint = function (dist) {
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
            geometry: { type: 'LineString', coordinates: [[smoothedPoints[i].lon, smoothedPoints[i].lat], [smoothedPoints[i + 1].lon, smoothedPoints[i + 1].lat]] }
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
        if (data.stage === "READY") {
            mapCtrl.followCyclist = true;
        }
    });

    window.runtime.EventsOn("status_change", (status) => {
        if (status === "RECORDING") {
            ui.setRecordingState('RECORDING');
            window.isRecording = true;
        }
        else if (status === "PAUSED") {
            ui.setRecordingState('PAUSED');
            window.isRecording = true;
        }
        else {
            ui.setRecordingState('IDLE');
            window.isRecording = false;

            if (window.ui) {
                window.ui.resetDashboardData();
            }
        }
    });

    window.runtime.EventsOn("telemetry_update", (data) => {
        ui.updateTelemetry(data, totalRouteDistance);
        mapCtrl.updateCyclistPosition(data.lat, data.lon, data.speed, data);
    });
}

// =====================================
// HOME SCREEN & PROFILE SELECTION LOGIC
// =====================================

let newAvatarBase64 = "";

window.toggleCreateForm = (show) => {
    const grid = document.getElementById('profileGrid');
    const form = document.getElementById('createProfileForm');
    const subtitle = document.getElementById('homeSubtitle');

    if (show) {
        grid.style.display = 'none';
        form.classList.remove('hidden');
        form.style.display = 'block';
        if (subtitle) subtitle.innerText = "Create a new rider profile";
    } else {
        grid.style.display = 'flex';
        form.classList.add('hidden');
        form.style.display = 'none';
        if (subtitle) subtitle.innerText = "Welcome back! Select your rider profile.";
    }
};

window.selectAvatar = async () => {
    try {
        const base64 = await window.go.main.App.SelectProfileImage();
        if (base64) {
            document.getElementById('newAvatarPreview').src = base64;
            newAvatarBase64 = base64;
        }
    } catch (err) { console.error(err); }
};

window.createProfile = async () => {
    const nameInput = document.getElementById('newRiderName').value;
    const weightInput = parseFloat(document.getElementById('newRiderWeight').value) || 75.0;
    const ftpInput = parseFloat(document.getElementById('newRiderFTP').value) || 200.0;

    if (!nameInput.trim()) {
        alert("Please provide the cyclist's name.");
        return;
    }

    try {
        console.log("Sending data to Go...", { nameInput, weightInput, ftpInput });

        const id = await window.go.main.App.CreateLocalAccount(nameInput, newAvatarBase64, weightInput, ftpInput);

        console.log("Success! Account ID created:", id);

        if (id) {
            await window.loginProfile(id);
        }
    } catch (err) {
        console.error("Backend error:", err);
        alert("Error creating account: " + err);
    }
};

window.loginProfile = async (id) => {
    try {
        await window.go.main.App.SelectLocalAccount(id);
        document.getElementById('homeScreen').classList.remove('active');

        if (window.ui) {
            window.ui.loadUserProfile();
            window.ui.loadHistory();
        }
    } catch (err) {
        console.error("Login Error:", err);
        alert("Error logging in: " + err);
    }
};

window.logoutProfile = async () => {
    // 1. Avoid switching accounts mid-workout
    if (window.isRecording || (document.getElementById('btnAction') && document.getElementById('btnAction').innerText === "STOP")) {
        alert("Please finish and save your current workout before switching profiles.");
        return;
    }

    // 2. Disconnect the sensors and RESET THE BACKEND MEMORY
    if (window.go && window.go.main && window.go.main.App) {
        try {
            await window.go.main.App.DisconnectTrainer();
            await window.go.main.App.DisconnectHeartRate();
            if (window.go.main.App.ResetAppState) {
                await window.go.main.App.ResetAppState();
            }
        } catch (err) {
            console.log("No devices to disconnect or error resetting state.");
        }
    }

    // 3. Close the settings and clear the HUD
    if (window.ui) {
        window.ui.toggleSettings(false);
        window.ui.resetDashboardData();
        window.ui.showRoutePreview(0); // Reset the distances

        // Clears the filename in the header and hides the Start button
        if (window.ui.els.filename) window.ui.els.filename.innerText = "";
        if (window.ui.els.btnAction) window.ui.els.btnAction.classList.add('hidden');
    }

    // 4. Clear the map and charts
    window.totalRouteDistance = 0;

    if (window.mapController && window.mapController.map) {
        const source = window.mapController.map.getSource('route');
        if (source) {
            source.setData({ type: 'FeatureCollection', features: [] });
        }
    }

    if (window.chart) {
        window.chart.setData([]);
    }

    if (window.workoutCtrl) {
        window.workoutCtrl.hide();
    }

    // 5. Displays the home screen again
    const homeScreen = document.getElementById('homeScreen');
    if (homeScreen) {
        homeScreen.classList.add('active');
    }

    initHomeScreen();
};

function formatHomeTime(seconds) {
    if (!seconds) return "0h 0m";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

async function initHomeScreen() {
    const grid = document.getElementById('profileGrid');
    grid.innerHTML = "";

    try {
        const accounts = await window.go.main.App.GetLocalAccounts();

        // Renders existing accounts
        if (accounts && accounts.length > 0) {
            accounts.forEach(acc => {
                const photo = acc.avatar && acc.avatar.length > 10 ? acc.avatar : "src/assets/images/argus-cyclist.png";
                const km = (acc.total_km || 0).toFixed(1);
                const time = formatHomeTime(acc.total_time);
                const lvl = acc.level || 1;

                grid.innerHTML += `
                    <div class="profile-card" onclick="window.loginProfile('${acc.id}')">
                        <img src="${photo}" alt="Avatar">
                        <h4 style="margin-bottom: 5px; font-size: 1.2rem;">${acc.name}</h4>
                        <div class="profile-stats">
                            <span>📈 Level ${lvl}</span>
                            <span>🚴🏼 ${km} km</span>
                            <span>⏱️ ${time}</span>
                        </div>
                    </div>
                `;
            });
        }

        // "New Account" Card
        grid.innerHTML += `
            <div class="profile-card profile-card-new" onclick="window.toggleCreateForm(true)">
                <div class="plus-icon">+</div>
                <h4>New Rider</h4>
            </div>
        `;
    } catch (err) {
        console.error("Error loading accounts:", err);
    }
}

// Call this explicitly when Wails finishes mounting the runtime
document.addEventListener("DOMContentLoaded", () => {
    // We wait 300ms to guarantee window.go.main is ready
    setTimeout(() => {
        initHomeScreen();
    }, 300);
});