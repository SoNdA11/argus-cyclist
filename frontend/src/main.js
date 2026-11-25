// Argus Cyclist - Virtual Cycling Environment for interactive bicycling experiments.
// Copyright (C) 2026  Paulo Sérgio
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import './styles/main.css';
import homeScreenHtml from './components/homeScreen.html?raw';
import settingsModalHtml from './components/settingsModal.html?raw';
import confirmModalHtml from './components/confirmModal.html?raw';
import './styles/studio-hud.css';
import './styles/argus-ui.css';
import '@fontsource/barlow-condensed/latin-600';
import '@fontsource/barlow-condensed/latin-700';
import '@fontsource/barlow-condensed/latin-800';
import '@fontsource/inter/latin-400';
import '@fontsource/inter/latin-600';
import '@fontsource/inter/latin-700';
import './styles/event-broadcast.css';
import './styles/ai-chat.css';
import cooldownModalHtml from './components/cooldownModal.html?raw';
import eventHubPageHtml from './components/eventHubPage.html?raw';
import eventLeaderboardModalHtml from './components/eventLeaderboardModal.html?raw';
import studioHudHtml from './components/studioHudOverlay.html?raw';
import eventLiveHudHtml from './components/eventLiveHud.html?raw';
import challengeResultModalHtml from './components/challengeResultModal.html?raw';
import fitnessTestModalHtml from './components/fitnessTestModal.html?raw';
import ftpAssessmentConfirmModalHtml from './components/ftpAssessmentConfirmModal.html?raw';
import tutorialModalHtml from './components/tutorialModal.html?raw';
import raceHistoryModalHtml from './components/raceHistoryModal.html?raw';
import trophyModalHtml from './components/trophyModal.html?raw';
import bikeComponentsModalHtml from './components/bikeComponentsModal.html?raw';
import aiChatPanelHtml from './components/aiChatPanel.html?raw';
import recoveryModalHtml from './components/recoveryModal.html?raw';
import defaultAvatarUrl from './assets/images/avatar-default.png';

// Plain src paths in the HTML partials are not bundled by Vite: the default photo is
// imported above and written into the markup here.
const DEFAULT_AVATAR_TOKEN = '%DEFAULT_AVATAR%';

document.body.insertAdjacentHTML('beforeend', (
    homeScreenHtml +
    settingsModalHtml +
    confirmModalHtml +
    cooldownModalHtml +
    eventHubPageHtml +
    eventLeaderboardModalHtml +
    studioHudHtml +
    eventLiveHudHtml +
    challengeResultModalHtml +
    fitnessTestModalHtml +
    ftpAssessmentConfirmModalHtml +
    tutorialModalHtml +
    raceHistoryModalHtml +
    trophyModalHtml +
    bikeComponentsModalHtml +
    aiChatPanelHtml +
    recoveryModalHtml
).replaceAll(DEFAULT_AVATAR_TOKEN, defaultAvatarUrl));
import { MapController } from './modules/MapController.js';
import { UIManager } from './modules/UIManager.js';
import { ElevationChart } from './modules/ElevationChart.js';
import { WorkoutController } from './modules/WorkoutController.js';
import { ChallengeController } from './modules/ChallengeController.js';
import { FullscreenHUDController } from './modules/FullscreenHUDController.js';
import { EventBroadcastHud } from './modules/EventBroadcastHud.js';
import { AIChatController } from './modules/AIChatController.js';

// Capacitor imports for the Mobile version
import { Capacitor } from '@capacitor/core';
import { CapacitorBluetoothService } from './modules/CapacitorBluetoothService.js';
import { telemetryBus } from './modules/TelemetryEventBus.js';

// =====================
// MOBILE WAILS POLYFILL
// =====================
if (typeof window.go === 'undefined') {
    window.go = {
        main: {
            App: new Proxy({}, {
                get: function (target, prop) {
                    if (prop === 'GetUserProfile') return async () => ({ name: "Mobile", weight: 75, bike_weight: 9, ftp: 200, units: "metric" });
                    if (prop === 'GetLevelProgress') return async () => ({ level: 1, xp: 0, level_xp: 0, next_level_xp: 500 });
                    if (prop === 'GetTotalStats') return async () => ({ total_km: 0, total_time: 0 });
                    if (prop === 'GetActivities') return async () => [];
                    if (prop === 'GetMonthlyActivities') return async () => [];
                    if (prop === 'GetPowerCurve') return async () => [];
                    if (prop === 'GetCareerDashboard') return async () => ({ pmc: [], mmp: [] });

                    if (prop === 'GetLocalAccounts') return async () => {
                        const saved = localStorage.getItem('mobile_accounts');
                        return saved ? JSON.parse(saved) : [];
                    };

                    if (prop === 'CreateLocalAccount') return async (name, avatar, weight, ftp) => {
                        console.log("Mocked CreateLocalAccount:", name);
                        const id = "mob_" + Date.now();
                        const newAcc = { id, name, avatar, weight, ftp, total_km: 0, total_time: 0, level: 1 };

                        const saved = localStorage.getItem('mobile_accounts');
                        const accounts = saved ? JSON.parse(saved) : [];
                        accounts.push(newAcc);
                        localStorage.setItem('mobile_accounts', JSON.stringify(accounts));

                        return id;
                    };

                    if (prop === 'SelectLocalAccount') return async (id) => {
                        console.log("Mocked SelectLocalAccount:", id);
                        return true;
                    };

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

const hud = new FullscreenHUDController();
window.hud = hud;

const ui = new UIManager();
ui.hud = hud;
window.ui = ui;

const chart = new ElevationChart('elevationCanvas');
window.chart = chart;

const workoutCtrl = new WorkoutController();
window.workoutCtrl = workoutCtrl;

const challengeCtrl = new ChallengeController(ui, new EventBroadcastHud(), mapCtrl, chart);
window.challengeCtrl = challengeCtrl;

const aiChatCtrl = new AIChatController();
window.aiChatCtrl = aiChatCtrl;

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

let pendingAssessmentTest = null;

function closeAssessmentFTPConfirmModal() {
    const modal = document.getElementById('ftpAssessmentConfirmModal');
    if (!modal) return;

    modal.classList.remove('active');
    modal.classList.add('hidden');
    pendingAssessmentTest = null;
}

async function openAssessmentFTPConfirmModal(test) {
    const profile = await window.go.main.App.GetUserProfile();
    const ftp = profile?.ftp || 200;

    pendingAssessmentTest = test;

    const message = document.getElementById('ftpAssessmentConfirmMessage');
    const proceedButton = document.getElementById('btnProceedAssessmentFTP');

    if (message) {
        message.textContent = `You are about to start an FTP Assessment. Your current saved FTP is ${ftp} W. The test warm-up and scaling will be based on this value.`;
    }

    if (proceedButton) {
        proceedButton.textContent = `Proceed with ${ftp} W`;
    }

    const modal = document.getElementById('ftpAssessmentConfirmModal');
    if (!modal) return;

    modal.classList.remove('hidden');
    modal.classList.add('active');
}

window.closeAssessmentFTPConfirmModal = closeAssessmentFTPConfirmModal;

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

document.getElementById('btnOpenSettings').addEventListener('click', async () => {
    ui.toggleSettings(true);
    await window.checkStravaStatus();
    bindIntervalsUI();
});

document.getElementById('btnTrophy').addEventListener('click', () => {
    ui.toggleTrophyModal(true);
});

document.getElementById('btnCloseTrophy').addEventListener('click', () => {
    ui.toggleTrophyModal(false);
});

document.getElementById('btnCloseBikeComponents').addEventListener('click', () => {
    ui.toggleBikeComponentsModal(false);
});

document.getElementById('btnEditAssessmentFTP').addEventListener('click', async () => {
    closeAssessmentFTPConfirmModal();
await ui.openProfileSettings();
        await window.checkStravaStatus();
        bindIntervalsUI();
});

document.getElementById('btnProceedAssessmentFTP').addEventListener('click', async () => {
    if (!pendingAssessmentTest) return;

    const selectedTest = pendingAssessmentTest;
    closeAssessmentFTPConfirmModal();

    await window.go.main.App.SetBuiltInWorkout(selectedTest.test_type);
    window.ui.els.btnAction.classList.remove('hidden');
});

document.getElementById('btnJustRide').addEventListener('click', () => {
    window.totalRouteDistance = 0;
    if (window.mapController) window.mapController.renderRoute({ type: 'FeatureCollection', features: [] });
    if (window.workoutCtrl && window.workoutCtrl.activeWorkout) {
        window.workoutCtrl.panel.classList.add('hidden');
    }

    ui.showRoutePreview(0);
    ui.els.btnAction.classList.remove('hidden');
    ui.toggleStudioMode(true);
});

// ==================
// STRAVA INTEGRATION
// ==================

document.getElementById('btnConnectStrava').addEventListener('click', async () => {
    if (Capacitor && Capacitor.isNativePlatform()) {
        alert("Strava OAuth is currently only supported on the Desktop version.");
        return;
    }

    const btn = document.getElementById('btnConnectStrava');
    const status = document.getElementById('statusStrava');

    // Set UI to loading state
    btn.disabled = true;
    btn.innerHTML = "Waiting for browser...";
    status.innerText = "Check the opened tab to authorize.";
    status.style.color = "var(--text-muted)";

    try {
        // Trigger the Go backend OAuth2 flow
        const result = await window.go.main.App.ConnectStrava();

        if (result === "ok") {
            btn.innerHTML = "✓ Strava Connected";
            status.innerText = "Ready to auto-upload";
            status.style.color = "var(--argus-safe)";
        }
    } catch (err) {
        console.error("Strava Connection Error:", err);
        btn.disabled = false;
        btn.innerHTML = "Connect with Strava";
        status.innerText = "Connection failed or timed out.";
        status.style.color = "var(--argus-alert)";
        alert("Error connecting to Strava: " + err);
    }
});

// ==================
// DEVICE CONNECTIONS
// ==================

// INTERVALS.ICU INTEGRATION
// =========================

async function refreshIntervalsStatus() {
    try {
        const isConnected = await window.go.main.App.IsIntervalsConnected();
        const btnSave = document.getElementById('btnSaveIntervals');
        const btnDisconnect = document.getElementById('btnDisconnectIntervals');
        const status = document.getElementById('statusIntervals');
        const statusText = document.getElementById('statusIntervalsText');
        if (!btnSave) return;
        if (isConnected) {
            btnSave.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Connected`;
            btnSave.disabled = true;
            btnDisconnect.classList.remove('hidden');
            if (status) {
                status.classList.add('connected');
                if (statusText) statusText.innerText = "Connected";
            }
        } else {
            btnSave.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"></path><path d="M22 2 15 22l-4-9-9-4Z"></path></svg> Connect`;
            btnSave.disabled = false;
            btnDisconnect.classList.add('hidden');
            if (status) {
                status.classList.remove('connected');
                if (statusText) statusText.innerText = "Not connected";
            }
        }
    } catch (e) {
        console.error("Falha ao checar status do Intervals.icu", e);
    }
}

let intervalsBound = false;

function bindIntervalsUI() {
    const btnSave = document.getElementById('btnSaveIntervals');
    const btnDisconnect = document.getElementById('btnDisconnectIntervals');
    if (!btnSave) return;

    if (intervalsBound) {
        refreshIntervalsStatus();
        return;
    }
    intervalsBound = true;

    btnSave.addEventListener('click', async () => {
        const athleteID = document.getElementById('inputIntervalsAthleteID').value.trim();
        const apiKey = document.getElementById('inputIntervalsAPIKey').value.trim();
        if (!apiKey) {
            alert("Please enter your Intervals.icu API key.");
            return;
        }
        btnSave.disabled = true;
        btnSave.innerHTML = "Saving...";
        try {
            await window.go.main.App.SaveIntervalsCredentials(athleteID, apiKey);
            await refreshIntervalsStatus();
        } catch (err) {
            console.error("Intervals.icu Connection Error:", err);
            btnSave.disabled = false;
            btnSave.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"></path><path d="M22 2 15 22l-4-9-9-4Z"></path></svg> Connect`;
            alert("Error connecting to Intervals.icu: " + err);
        }
    });

    btnDisconnect.addEventListener('click', async () => {
        if (confirm("Disconnect Argus Cyclist from your Intervals.icu account?")) {
            await window.go.main.App.DisconnectIntervals();
            document.getElementById('inputIntervalsAthleteID').value = '';
            document.getElementById('inputIntervalsAPIKey').value = '';
            await refreshIntervalsStatus();
        }
    });

    refreshIntervalsStatus();
}

window.bindIntervalsUI = bindIntervalsUI;
window.refreshIntervalsStatus = refreshIntervalsStatus;

// ==================
// DEVICE CONNECTIONS
// ==================

const svgIcons = {
    scan: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`,
    bt: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6.5 6.5 17.5 17.5 12 23 12 1 17.5 6.5 6.5 17.5"></polyline></svg>`,
    virtual: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="2" y1="20" x2="22" y2="20"></line></svg>`,
    disconnect: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
    wait: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 22h14"></path><path d="M5 2h14"></path><path d="M14 22V18.13a4 4 0 0 0-1.17-2.83L12 14.4l-1.83.9A4 4 0 0 0 9 18.13V22"></path><path d="M14 2v3.87a4 4 0 0 1-1.17 2.83L12 9.6l-1.83-.9A4 4 0 0 1 9 5.87V2"></path></svg>`,
    dist: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 3 4 4 4 4s1 0 1 1v4c0 1-1 1-1 1H3"></path><path d="M15 21c-3 0-7-1-7-8V5c0-1.25.756-2.017 2-2h4c1.25 0 2 .75 2 1.972V11c0 3-4 4-4 4s-1 0-1 1v4c0 1 1 1 1 1h3"></path></svg>`,
    time: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
    elev: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 3 4 8 5-5 5 15H2L8 3z"></path></svg>`
};

const trainerUIs = [
    {
        status: document.getElementById('statusTrainer'),
        list: document.getElementById('trainerList'),
        scan: document.getElementById('btnScanTrainer'),
        connect: document.getElementById('btnConnTrainer'),
        virtual: document.getElementById('btnConnVirtual'),
        type: 'settings'
    },
    {
        status: document.getElementById('eventTrainerStatus'),
        list: document.getElementById('eventTrainerList'),
        scan: document.getElementById('btnEventScanTrainer'),
        connect: document.getElementById('btnEventConnectTrainer'),
        virtual: document.getElementById('btnEventConnectVirtual'),
        type: 'event'
    }
];

function eventButton(icon, label) {
    return `${icon}<span>${label}</span>`;
}

function getTrainerStateLabel(state) {
    if (!state?.trainer_connected) return "Disconnected";
    return state.trainer_kind === 'virtual' ? "Simulator Active" : "Trainer Connected";
}

const EVENT_TRAINER_TEXT = {
    'Disconnected': 'Desconectado',
    'Simulator Active': 'Simulador ativo',
    'Trainer Connected': 'Rolo conectado',
    'Scanning...': 'Procurando rolo...',
    'Select a device': 'Escolha o rolo',
    'No devices found': 'Nenhum rolo encontrado',
    'Scan error': 'Erro na busca'
};

function setTrainerStatusForAll(text, color = "") {
    trainerUIs.forEach((uiSet) => {
        if (!uiSet.status) return;
        uiSet.status.innerText = uiSet.type === 'event' ? (EVENT_TRAINER_TEXT[text] || text) : text;
        uiSet.status.style.color = color;
    });
}

function populateTrainerLists(devices) {
    trainerUIs.forEach((uiSet) => {
        if (!uiSet.list) return;
        uiSet.list.innerHTML = '<option value="">Select device...</option>';
        devices.forEach((device) => {
            const opt = document.createElement('option');
            opt.value = device.address;
            opt.text = device.name;
            uiSet.list.appendChild(opt);
        });
    });
}

function syncTrainerListsValue(sourceValue) {
    trainerUIs.forEach((uiSet) => {
        if (uiSet.list) uiSet.list.value = sourceValue;
    });
}

function renderTrainerUIState(state) {
    const label = getTrainerStateLabel(state);
    const equip = document.getElementById('eventEquip');
    if (equip) equip.dataset.state = !state?.trainer_connected ? 'off' : state.trainer_kind === 'virtual' ? 'virtual' : 'real';
    const color = !state?.trainer_connected ? "" : state.trainer_kind === 'virtual' ? "#00ADD8" : "var(--argus-safe)";
    setTrainerStatusForAll(label, color);

    trainerUIs.forEach((uiSet) => {
        if (!uiSet.scan || !uiSet.connect || !uiSet.virtual) return;

        // Reset disabled states
        uiSet.scan.disabled = false;
        uiSet.connect.disabled = false;
        uiSet.virtual.disabled = false;

        // Get the disconnect button for event type
        const btnDisc = uiSet.type === 'event'
            ? document.getElementById('btnEventDisconnectTrainer')
            : null;

        if (uiSet.type === 'settings') {
            // Settings panel uses icon-based buttons
            uiSet.scan.innerHTML = svgIcons.scan;
            uiSet.connect.innerHTML = state?.trainer_connected && state.trainer_kind === 'real' ? svgIcons.disconnect : svgIcons.bt;
            uiSet.virtual.innerHTML = state?.trainer_connected && state.trainer_kind === 'virtual' ? svgIcons.disconnect : svgIcons.virtual;
        }

        if (uiSet.type === 'event') {
            uiSet.scan.innerHTML = eventButton(svgIcons.bt, 'Procurar rolo');
            uiSet.virtual.innerHTML = eventButton(svgIcons.virtual, 'Simulador');
            uiSet.connect.innerHTML = eventButton(svgIcons.bt, 'Conectar');
        }

        if (state?.trainer_connected && state.trainer_kind === 'real') {
            // ── REAL TRAINER CONNECTED ──
            if (uiSet.type === 'settings') {
                uiSet.connect.classList.remove('hidden');
                uiSet.scan.classList.add('hidden');
                uiSet.virtual.disabled = true;
            } else {
                // Event Hub: hide scan/sim/connect, show disconnect
                uiSet.scan.classList.add('hidden');
                uiSet.virtual.classList.add('hidden');
                uiSet.connect.classList.add('hidden');
                if (uiSet.list) uiSet.list.classList.add('hidden');
                if (btnDisc) {
                    btnDisc.classList.remove('hidden');
                    btnDisc.innerHTML = eventButton(svgIcons.disconnect, 'Desconectar');
                }
            }
        } else if (state?.trainer_connected && state.trainer_kind === 'virtual') {
            // ── VIRTUAL TRAINER CONNECTED ──
            if (uiSet.type === 'settings') {
                uiSet.connect.classList.add('hidden');
                uiSet.virtual.classList.remove('hidden');
                uiSet.scan.disabled = true;
                uiSet.connect.disabled = true;
            } else {
                // Event Hub: hide scan/connect, show disconnect
                uiSet.scan.classList.add('hidden');
                uiSet.virtual.classList.add('hidden');
                uiSet.connect.classList.add('hidden');
                if (uiSet.list) uiSet.list.classList.add('hidden');
                if (btnDisc) {
                    btnDisc.classList.remove('hidden');
                    btnDisc.innerHTML = eventButton(svgIcons.disconnect, 'Desconectar');
                }
            }
        } else {
            // ── DISCONNECTED ──
            if (uiSet.type === 'settings') {
                uiSet.scan.classList.remove('hidden');
                if (uiSet.list && uiSet.list.options.length > 1) {
                    uiSet.connect.classList.remove('hidden');
                } else {
                    uiSet.connect.classList.add('hidden');
                }
            } else {
                // Event Hub: show scan/sim, hide connect (until scan), hide disconnect
                uiSet.scan.classList.remove('hidden');
                uiSet.virtual.classList.remove('hidden');
                if (uiSet.list && uiSet.list.options.length > 1) {
                    uiSet.connect.classList.remove('hidden');
                    if (uiSet.list) uiSet.list.classList.remove('hidden');
                } else {
                    uiSet.connect.classList.add('hidden');
                }
                if (btnDisc) btnDisc.classList.add('hidden');
            }
        }
    });
}

let lastTrainerKind = 'real';

async function refreshTrainerConnectionState() {
    if (window.go?.main?.App?.GetDeviceConnectionState) {
        const state = await window.go.main.App.GetDeviceConnectionState();
        lastTrainerKind = state?.trainer_kind || 'real';
        renderTrainerUIState(state);
        return state;
    }

    lastTrainerKind = 'real';
    return { trainer_connected: false, trainer_kind: 'real' };
}
window.refreshTrainerConnectionState = refreshTrainerConnectionState;

async function scanTrainerDevices() {
    if (Capacitor.isNativePlatform()) return;

    trainerUIs.forEach((uiSet) => {
        if (uiSet.scan) {
            if (uiSet.type === 'settings') uiSet.scan.innerHTML = svgIcons.wait;
            else uiSet.scan.innerHTML = eventButton(svgIcons.wait, 'Procurando...');
            uiSet.scan.disabled = true;
        }
    });
    setTrainerStatusForAll("Scanning...");

    try {
        const devices = await window.go.main.App.ScanTrainers();
        populateTrainerLists(devices || []);

        if (devices && devices.length > 0) {
            trainerUIs.forEach((uiSet) => {
                uiSet.list?.classList.remove('hidden');
                uiSet.connect?.classList.remove('hidden');
                if (uiSet.type === 'settings') uiSet.scan?.classList.add('hidden');
            });
            setTrainerStatusForAll("Select a device");
        } else {
            setTrainerStatusForAll("No devices found");
            trainerUIs.forEach((uiSet) => {
                if (uiSet.scan) {
                    if (uiSet.type === 'settings') uiSet.scan.innerHTML = svgIcons.scan;
                    else uiSet.scan.innerHTML = eventButton(svgIcons.bt, 'Procurar rolo');
                    uiSet.scan.disabled = false;
                }
            });
        }
    } catch (err) {
        setTrainerStatusForAll("Scan error");
        trainerUIs.forEach((uiSet) => {
            if (uiSet.scan) {
                if (uiSet.type === 'settings') uiSet.scan.innerHTML = svgIcons.scan;
                else uiSet.scan.innerHTML = eventButton(svgIcons.bt, 'Procurar rolo');
                uiSet.scan.disabled = false;
            }
        });
    }
}

document.getElementById('btnScanTrainer')?.addEventListener('click', scanTrainerDevices);
document.getElementById('btnEventScanTrainer')?.addEventListener('click', scanTrainerDevices);
// The event hub's status text is translated, so its buttons read the real connection state.
async function eventTrainerState() {
    try { return await window.go?.main?.App?.GetDeviceConnectionState?.(); } catch { return null; }
}

document.getElementById('btnEventConnectTrainer')?.addEventListener('click', async () => {
    const status = document.getElementById('eventTrainerStatus');
    const list = document.getElementById('eventTrainerList');

    if (!Capacitor.isNativePlatform() && window.go && window.go.main) {
        const state = await eventTrainerState();
        if (state?.trainer_connected && state.trainer_kind === 'real') {
            await window.go.main.App.DisconnectTrainer();
            return;
        }

        const selectedMac = list.value;
        if (!selectedMac) { status.innerText = "Escolha um rolo na lista"; return; }

        document.getElementById('btnEventConnectTrainer').disabled = true;
        try {
            await window.go.main.App.ConnectTrainer(selectedMac);
        } catch (err) {
            status.innerText = "Erro ao conectar";
            status.style.color = "var(--argus-alert)";
            document.getElementById('btnEventConnectTrainer').disabled = false;
        }
    }
});

document.getElementById('btnEventConnectVirtual')?.addEventListener('click', async () => {
    if (Capacitor.isNativePlatform()) return;
    const status = document.getElementById('eventTrainerStatus');

    const state = await eventTrainerState();
    if (state?.trainer_connected && state.trainer_kind === 'virtual') {
        await window.go.main.App.DisconnectTrainer();
        return;
    }

    document.getElementById('btnEventConnectVirtual').disabled = true;
    try {
        await window.go.main.App.ConnectVirtualTrainer();
    } catch (err) {
        status.innerText = String(err).includes('Fair Mode') ? "Simulador bloqueado (Modo Feira)" : "Erro ao conectar";
        status.style.color = "var(--argus-alert)";
        document.getElementById('btnEventConnectVirtual').disabled = false;
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
                telemetryBus.publish(data);
                updateMapPosition(data);
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

// Shared post-finish handling: shows the summary modal and wires up the
// upload buttons. Reused by the normal finish flow and by the recovery of
// an unfinished session found on startup.
async function handleSessionFinished(sessionSummary) {
    ui.showFinishModal(sessionSummary);

    if (sessionSummary.new_ftp > 0) {
        setTimeout(() => {
            const msg = `Physiological Assessment Complete!\n\nNew Estimated FTP: ${sessionSummary.new_ftp} W\nMax HR Reached: ${sessionSummary.new_max_hr} BPM\n\nWould you like to update your profile with these new metrics?`;
            if (confirm(msg)) {
                window.go.main.App.GetUserProfile().then(profile => {
                    profile.ftp = sessionSummary.new_ftp;
                    if (sessionSummary.new_max_hr > profile.max_hr) {
                        profile.max_hr = sessionSummary.new_max_hr;
                    }
                    window.go.main.App.UpdateUserProfile(profile).then(() => {
                        alert("Profile successfully updated!");
                        if (window.ui) window.ui.loadUserProfile();
                    });
                });
            }
        }, 1000);
    }

    try {
        if (window.go.main.App.IsStravaConnected) {
            const isConnected = await window.go.main.App.IsStravaConnected();
            const btnStrava = document.getElementById('btnUploadStrava');

            if (isConnected) {
                btnStrava.classList.remove('hidden');
                btnStrava.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 5px;">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                    </svg> Upload to Strava`;
                btnStrava.disabled = false;
                btnStrava.style.backgroundColor = "#FC4C02";
            } else {
                btnStrava.classList.add('hidden');
            }
        }
    } catch (e) {
        console.log("Strava validation skipped", e);
    }

    try {
        if (window.go.main.App.IsIntervalsConnected) {
            const isConnected = await window.go.main.App.IsIntervalsConnected();
            const btnIntervals = document.getElementById('btnUploadIntervals');

            if (isConnected) {
                btnIntervals.classList.remove('hidden');
                btnIntervals.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 5px;">
                        <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline>
                        <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path>
                    </svg> Upload to Intervals.icu`;
                btnIntervals.disabled = false;
            } else {
                btnIntervals.classList.add('hidden');
            }
        }
    } catch (e) {
        console.log("Intervals.icu validation skipped", e);
    }
}

async function finishWorkout() {
    isFinishTriggered = true;
    window.isRecording = false;
    if (window.ui) window.ui.resetTimer();
    if (window.workoutCtrl) window.workoutCtrl.hide();

    if (Capacitor.isNativePlatform()) {
        ui.setRecordingState('IDLE');
        ui.showFinishModal({ distance: window.totalRouteDistance, duration: window.workoutCtrl ? window.workoutCtrl.mobileElapsedTime : 0 });
        alert("Mobile version currently supports live metrics. FIT file saving is available on Desktop.");
        return;
    }

    try {
        if (!window.go || !window.go.main) return;
        const sessionSummary = await window.go.main.App.FinishSession();
        await handleSessionFinished(sessionSummary);
    } catch (e) { alert("Error when saving: " + e); }
}
window.finishWorkout = finishWorkout;


// ==================
// SESSION RECOVERY (unfinished session left behind by a crash)
// ==================

async function recoverPendingSession() {
    const modal = document.getElementById('recoveryModal');
    try {
        const sessionSummary = await window.go.main.App.RecoverPendingSession();
        modal.classList.remove('active');
        await handleSessionFinished(sessionSummary);
    } catch (e) {
        alert("Error recovering session: " + e);
    }
}

async function discardPendingSession() {
    const modal = document.getElementById('recoveryModal');
    try {
        await window.go.main.App.DiscardPendingRecovery();
    } catch (e) {
        console.log("Discard recovery error", e);
    }
    modal.classList.remove('active');
}

// Asks the backend for an unfinished session snapshot and, when one exists,
// offers to recover or discard it.
async function initSessionRecovery() {
    if (Capacitor.isNativePlatform()) return;
    if (!window.go || !window.go.main || !window.go.main.App) return;

    try {
        const pending = await window.go.main.App.CheckPendingRecovery();
        if (!pending) return;

        const modal = document.getElementById('recoveryModal');
        const details = document.getElementById('recoveryDetails');
        if (!modal || !details) return;

        const startedAt = pending.started_at ? new Date(pending.started_at) : null;
        const durationMin = Math.max(1, Math.round((pending.active_time || 0) / 60));
        const distanceKm = (pending.distance_km || 0).toFixed(1);

        const parts = [];
        if (startedAt && !isNaN(startedAt)) {
            parts.push(`<strong>${startedAt.toLocaleString()}</strong>`);
        }
        parts.push(`~${durationMin} min`, `${distanceKm} km`);
        if (pending.route_name) parts.push(pending.route_name);

        details.innerHTML = `An unfinished session was found and can still be saved:<br>${parts.join(' &middot; ')}`;
        modal.classList.add('active');
    } catch (e) {
        console.log("Session recovery check skipped", e);
    }
}

document.getElementById('btnRecoverSession').addEventListener('click', recoverPendingSession);
document.getElementById('btnDiscardRecovery').addEventListener('click', discardPendingSession);


window.uploadToStrava = async () => {
    const btn = document.getElementById('btnUploadStrava');
    btn.innerHTML = "Uploading...";
    btn.disabled = true;

    try {
        await window.go.main.App.UploadLastWorkoutToStrava();
        btn.innerHTML = "✓ Uploaded";
        btn.style.backgroundColor = "var(--argus-safe)";
        alert("Workout successfully uploaded to Strava!");
    } catch (err) {
        console.error("Upload error:", err);
        btn.innerHTML = "Upload Failed";
        btn.style.backgroundColor = "var(--argus-alert)";
        alert("Failed to upload: " + err);
        btn.disabled = false;
    }
};

window.uploadToIntervals = async () => {
    const btn = document.getElementById('btnUploadIntervals');
    btn.innerHTML = "Uploading...";
    btn.disabled = true;

    try {
        await window.go.main.App.UploadLastWorkoutToIntervals();
        btn.innerHTML = "✓ Uploaded";
        btn.style.backgroundColor = "var(--argus-safe)";
        window.ui.showToast("Workout successfully uploaded to Intervals.icu!", 5000);
    } catch (err) {
        console.error("Intervals upload error:", err);
        btn.innerHTML = "Upload Failed";
        btn.style.backgroundColor = "var(--argus-alert)";
        window.ui.showToast("Failed to upload to Intervals.icu: " + err, 5000);
        btn.disabled = false;
    }
};

window.toggleRecording = async () => {
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
};

document.getElementById('btnAction').addEventListener('click', window.toggleRecording);


document.getElementById('btnResume').addEventListener('click', async () => {
    window.isRecording = true;
    ui.setRecordingState('RECORDING');
    if (!Capacitor.isNativePlatform() && window.go && window.go.main) {
        await window.go.main.App.ToggleSession();
    }
});

document.getElementById('btnFinishSave').addEventListener('click', async () => {
    try {
        const res = await window.go.main.App.InitiateCooldown();

        if (res === "SKIP") {
            await finishWorkout();
        } else {
            document.getElementById('confirmModal').classList.remove('active');
            const cdModal = document.getElementById('cooldownModal');
            cdModal.classList.remove('hidden', 'hide');
            cdModal.classList.add('active');
            cdModal.style.display = 'flex';
            cdModal.style.zIndex = '100000';
        }
    } catch (e) {
        await finishWorkout();
    }
});

document.getElementById('btnSkipCooldown').addEventListener('click', async () => {
    const cdModal = document.getElementById('cooldownModal');
    cdModal.classList.remove('active');
    cdModal.style.display = 'none';
    await finishWorkout();
});

document.getElementById('btnDiscard').addEventListener('click', async () => {
    if (confirm("Discard this activity? It won't be saved.")) {
        if (!Capacitor.isNativePlatform() && window.go && window.go.main) {
            await window.go.main.App.DiscardSession();
        }
        if (window.ui) {
            window.ui.setRecordingState('IDLE');
            window.ui.resetTimer();
            if (window.ui.isStudioMode) window.ui.toggleStudioMode(false);
        }
        if (window.workoutCtrl) window.workoutCtrl.hide();
        window.isRecording = false;
    }
});

document.getElementById('btnFitnessTests').addEventListener('click', async () => {
    if (Capacitor.isNativePlatform()) { alert("Fitness Tests not available on mobile yet."); return; }
    try {
        if (!window.go || !window.go.main) return;

        const tests = await window.go.main.App.GetFitnessTests();

        if (!tests || !Array.isArray(tests)) {
            alert("The tests were not found in memory. You need to restart 'wails dev' in the terminal for it to recognize the new function in app.go.!");
            return;
        }

        const list = document.getElementById('fitnessTestList');
        list.innerHTML = '';

        tests.forEach(test => {
            const btn = document.createElement('div');
            btn.style.cssText = "background: var(--bg-elevated); padding: 15px; border-radius: 8px; cursor: pointer; border: 2px solid transparent; transition: all 0.2s ease; transform: scale(1); box-shadow: 0 4px 6px rgba(0,0,0,0.1);";

            btn.innerHTML = `
                <h4 style="margin:0 0 5px 0; color: #fff;">${test.metadata.name}</h4>
                <p style="margin:0; font-size: 12px; color: var(--text-muted);">${test.metadata.description}</p>
                <div style="margin-top: 10px; font-size: 11px; font-weight: bold; color: var(--zone-3);">DURATION: ${Math.round(test.total_duration / 60)} MIN</div>
            `;

            btn.onmouseover = () => {
                btn.style.borderColor = "var(--zone-4)";
                btn.style.transform = "scale(1.03)";
                btn.style.background = "rgba(255, 255, 255, 0.05)";
                btn.style.boxShadow = "0 8px 15px rgba(0,0,0,0.4)";
            };
            btn.onmouseout = () => {
                btn.style.borderColor = "transparent";
                btn.style.transform = "scale(1)";
                btn.style.background = "var(--bg-elevated)";
                btn.style.boxShadow = "0 4px 6px rgba(0,0,0,0.1)";
            };

            btn.onclick = async () => {
                const modal = document.getElementById('fitnessTestModal');
                modal.classList.remove('active');
                modal.classList.add('hidden');

                await openAssessmentFTPConfirmModal(test);
            };
            list.appendChild(btn);
        });

        const modal = document.getElementById('fitnessTestModal');
        modal.classList.remove('hidden');
        modal.classList.add('active');

    } catch (e) { alert("Error loading tests: " + e); }
});


// =======================
// KEYBOARD DEBUG CONTROLS
// =======================

document.addEventListener('keydown', async (e) => {
    // Ignorar quando o usuário estiver interagindo com input/select
    const tag = e.target?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;

    // Só ajusta potência no simulador virtual (e nunca com o Modo Feira ligado)
    if (lastTrainerKind !== 'virtual' || window.fairMode) return;

    let delta = 0;
    if (e.key === "ArrowUp") delta = 10;
    if (e.key === "ArrowDown") delta = -10;

    if (delta !== 0 && !Capacitor.isNativePlatform() && window.go && window.go.main && window.go.main.App) {
        await window.go.main.App.ChangePowerSimulation(delta);
    }
});


// ==============================================
// MAIN VIEW — 3D scene (default) / real map / dashboard
// The 3D scene is a layer inside #map-container, so the existing code that hides the
// map (dashboard, Studio, workouts) hides it too. The scene loads on first use.
// ==============================================

const MAIN_VIEW_KEY = 'argus.mainView';
let mainView = loadMainView();      // '3d' | 'map' (dashboard is a separate UI mode)
let lastMapTelemetry = null;

function loadMainView() {
    try {
        const v = localStorage.getItem(MAIN_VIEW_KEY);
        if (v === '3d' || v === 'map') return v;
    } catch { /* storage unavailable */ }
    return '3d';
}

// The scene sprints from the rider's power relative to the active profile's FTP.
async function refreshScene3DFtp() {
    try {
        const profile = await window.go?.main?.App?.GetUserProfile?.();
        if (window.scene3d) window.scene3d.setFtp(profile?.ftp);
    } catch { /* keeps the previous FTP */ }
}

let scene3dLoading = null;
function ensureScene3D() {
    if (!scene3dLoading) {
        scene3dLoading = import('./modules/argus-scene/ArgusScene3D.js').then(({ ArgusScene3D }) => {
            const scene3d = new ArgusScene3D({ bus: telemetryBus });
            scene3d.active = mainView === '3d';
            scene3d.covered = isFullScreenPageOpen();
            scene3d.mount(document.getElementById('map-container')); // throws without WebGL 2
            window.scene3d = scene3d;
            refreshScene3DFtp();
            return scene3d;
        }).catch((e) => {
            console.error('[scene3d] failed to load, falling back to the map', e);
            scene3dLoading = null;
            setMainView('map');
            throw e;
        });
    }
    return scene3dLoading;
}

// The map only follows the rider while it is visible; the latest sample is applied
// when the user switches back to it (MapLibre animations would compete with the 3D).
function updateMapPosition(data) {
    if (!window.mapController) return;
    if (mainView === 'map' || !window.scene3d) {
        window.mapController.updateCyclistPosition(data.lat, data.lon, data.speed, data);
    } else {
        lastMapTelemetry = data;
    }
}

function setMainView(view) {
    const ui = window.ui;
    if (view === 'dashboard') {
        if (ui && !ui.isDashboardMode) ui.toggleDashboardMode();
        updateViewSwitch();
        return;
    }
    if (ui && ui.isDashboardMode) ui.toggleDashboardMode();
    mainView = view;
    try { localStorage.setItem(MAIN_VIEW_KEY, view); } catch { /* storage unavailable */ }

    if (view === '3d') {
        ensureScene3D().then((scene3d) => scene3d.setActive(true)).catch(() => { });
    } else {
        if (window.scene3d) window.scene3d.setActive(false);
        if (window.mapController) {
            if (lastMapTelemetry) {
                const d = lastMapTelemetry;
                lastMapTelemetry = null;
                window.mapController.updateCyclistPosition(d.lat, d.lon, d.speed, d);
            }
            setTimeout(() => window.mapController.forceResize(), 50);
        }
    }
    updateViewSwitch();
}
window.setMainView = setMainView;

function updateViewSwitch() {
    const current = window.ui && window.ui.isDashboardMode ? 'dashboard' : mainView;
    document.querySelectorAll('#viewSwitch button').forEach((btn) => {
        const on = btn.dataset.view === current;
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
}

document.querySelectorAll('#viewSwitch button').forEach((btn) => {
    btn.addEventListener('click', () => setMainView(btn.dataset.view));
});

// Workouts toggle the dashboard on their own: keep the switch in sync.
const dashboardViewEl = document.getElementById('dashboard-view');
if (dashboardViewEl) new MutationObserver(updateViewSwitch).observe(dashboardViewEl, { attributes: true, attributeFilter: ['class'] });

// Full-screen pages (profile selection, event hub) cover the scene: no rendering under them.
// The event hub is not a cover: the live scene shows through on its right.
function isFullScreenPageOpen() {
    return !!document.querySelector('.home-overlay.active:not(#eventHubPage)');
}
function syncHomeOpenClass() {
    document.body.classList.toggle('ar-home-open', !!document.getElementById('homeScreen')?.classList.contains('active'));
}
const pageObserver = new MutationObserver(() => {
    syncHomeOpenClass();
    if (window.scene3d) window.scene3d.setCovered(isFullScreenPageOpen());
});
syncHomeOpenClass();
document.querySelectorAll('.home-overlay').forEach((el) => pageObserver.observe(el, { attributes: true, attributeFilter: ['class'] }));

// Event races and challenges show the 3D rider behind their HUD, whatever main view
// is selected; the previous view comes back when the challenge ends.
let eventSceneActive = false;
// race (optional): {start, finish, ghost, ghostLabel, clock} for distance races.
async function setEventScene(on, race = null) {
    eventSceneActive = !!on;
    if (eventSceneActive) {
        try {
            const scene3d = await ensureScene3D();
            if (!eventSceneActive) return; // ended while loading
            refreshScene3DFtp();
            scene3d.resetRide();           // the rider waits on the start line
            if (race) scene3d.setRace(race); else scene3d.clearRace();
            scene3d.setActive(true);
        } catch { /* the HUD still works without the 3D scene */ }
    } else if (window.scene3d) {
        window.scene3d.clearRace();
        window.scene3d.releaseRide();
        window.scene3d.setActive(mainView === '3d');
    }
}
window.setEventScene = setEventScene;

// Graphics quality (render resolution): stored by the scene (and here when it is not
// loaded yet), selectable from the event hub.
const QUALITY_KEY = 'argus.scene.quality';     // same key and default as ArgusScene3D.js
const DEFAULT_QUALITY = 'high';
const QUALITY_LABELS = { low: 'Baixo', medium: 'Médio', high: 'Alto' }; // event hub (pt-BR)
const readPref = (key, fallback) => { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } };

function setGraphicsQuality(name) {
    try { localStorage.setItem(QUALITY_KEY, name); } catch { /* storage unavailable */ }
    if (window.scene3d) window.scene3d.setQuality(name);
    const label = document.querySelector('#btnGraphicsQuality [data-role="label"]');
    if (label) label.textContent = `Gráficos: ${QUALITY_LABELS[name] || name}`;
}
window.setGraphicsQuality = setGraphicsQuality;

const qualityButton = document.getElementById('btnGraphicsQuality');
if (qualityButton) {
    setGraphicsQuality(readPref(QUALITY_KEY, DEFAULT_QUALITY));
    qualityButton.addEventListener('click', () => {
        const order = ['low', 'medium', 'high'];
        const current = readPref(QUALITY_KEY, DEFAULT_QUALITY);
        setGraphicsQuality(order[(order.indexOf(current) + 1) % order.length]);
    });
}

document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.code === 'Digit3') {
        e.preventDefault();
        setMainView('3d');
    }
});

updateViewSwitch();
if (mainView === '3d') ensureScene3D().catch(() => { });

// Dev-only end-to-end check (VITE_SCENE3D_AUTO=1 ./run-dev.sh): virtual trainer at
// 250 W on the loaded route (built-in KOM climb if none), both themes, FPS and
// interpolation stats logged to the Wails terminal. The session is discarded at the end.
// VITE_SCENE3D_AUTO=demo uses the scene's demo ride instead (no trainer, no session).
if (import.meta.env.VITE_SCENE3D_AUTO === '1' || import.meta.env.VITE_SCENE3D_AUTO === 'demo') {
    window.addEventListener('load', () => setTimeout(() => runScene3DAutoCheck().catch(e => console.error(e)), 3000));
}

// Dev-only race check (VITE_RACE_AUTO=1 ./run-dev.sh): runs the three distance races on
// the simulator, a slower repeat of the sprint (ranking keeps the best per rider),
// checks the Fair Mode lock, logs everything to the Wails terminal and deletes the
// test records at the end.
if (import.meta.env.VITE_RACE_AUTO === '1') {
    window.addEventListener('load', () => setTimeout(() => runRaceAutoCheck().catch(e => window.runtime?.LogInfo?.(`[race] ERROR ${e}`)), 3000));
}

async function runRaceAutoCheck() {
    const App = window.go.main.App;
    const cc = window.challengeController;
    const log = (msg) => { console.log(msg); window.runtime?.LogInfo?.(msg); };
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const NAME = 'AutoTest';
    const RAW = `${NAME} [G]`;
    const result = () => ['challengeResultTitle', 'challengeResultValue', 'challengeResultRank', 'challengeResultDescription']
        .map((id) => document.getElementById(id)?.textContent?.trim()).join(' | ');

    await cc.setFairMode(false);
    await ensureScene3D();
    await cc.enterEventMode();
    document.getElementById('eventRiderName').value = NAME;
    document.getElementById('eventRiderGender').value = 'G';
    document.getElementById('eventRiderWeight').value = '70';
    log(`[race] trainer: ${await App.ConnectVirtualTrainer()}`);
    await cc.refreshTrainerStatus();
    log(`[race] sim power: ${await App.ChangePowerSimulation(300)}`);

    // Every on-screen message is logged.
    const flash = cc.flashMessage.bind(cc);
    let finishShot = null;
    cc.flashMessage = (text, opts = {}) => {
        log(`[race] message: "${text}"${opts.sub ? ` / "${opts.sub}"` : ''}`);
        return flash(text, opts);
    };
    
    const showFinish = cc.hud.showFinish.bind(cc.hud);
    cc.hud.showFinish = (opts = {}) => {
        log(`[race] finish banner: "${opts.label} ${opts.value}" / "${opts.note}"`);
        if (finishShot) window.scene3d?.captureFrame(0.75).then((img) => img && log(`[scene3d-shot] ${finishShot} ${img}`));
        return showFinish(opts);
    };
    const shot = async (tag) => {
        const img = await window.scene3d?.captureFrame(0.75);
        if (img) log(`[scene3d-shot] ${tag} ${img}`);
    };
    const probe = (mode) => {
        const sc = window.scene3d, s = sc?.getState(), c = cc.activeChallenge;
        log(`[race] 3d during ${mode}: rendering=${sc?.isRendering} rider=${s?.courseDistanceM.toFixed(1)} ` +
            `ghost=${s?.ghostDistanceM == null ? 'none' : s.ghostDistanceM.toFixed(1)} gap=${c?.gap === null || c?.gap === undefined ? '-' : c.gap.toFixed(2)} ` +
            `gates=${sc?.hasGates} fps=${s?.fps.toFixed(0)} liveHud=${!document.getElementById('eventLiveHud').classList.contains('hidden')} ` +
            `hudGap="${document.querySelector('#eventLiveHud [data-role="gap"]')?.textContent} ${document.querySelector('#eventLiveHud [data-role="gapWord"]')?.textContent}" ` +
            `tower="${document.querySelector('#eventLiveHud [data-role="towerRows"]')?.textContent.replace(/\s+/g, ' ').trim()}"`);
    };

    // opts: {gateShot, probeAt (ms after GO, with capture), powerSteps: [[ms after GO, delta]], finishShot}
    const race = async (mode, opts = {}) => {
        const t0 = performance.now();
        const simBefore = await App.ChangePowerSimulation(0); // delta 0 only reads the override
        finishShot = opts.finishShot || null;
        const launched = cc.launchRace(mode);
        if (opts.gateShot) { await wait(1800); await shot(opts.gateShot); }
        await launched; // resolves at GO
        const go = performance.now();
        for (const [at, delta] of opts.powerSteps || []) {
            setTimeout(() => App.ChangePowerSimulation(delta).then((v) => log(`[race] power step at ${at} ms: override ${v} W`)), at);
        }
        if (opts.probeAt) { await wait(opts.probeAt); probe(mode); await shot(`ghost_${mode}`); }
        const limit = (cc.modeMeta[mode].maxDuration + 20) * 1000;
        while (cc.activeChallenge && performance.now() - go < limit) await wait(250);
        const podium = document.getElementById('challengeResultPodium');
        log(`[race] ${mode}: ${result()} (wall ${((performance.now() - t0) / 1000).toFixed(1)} s incl. countdown; ` +
            `sim override ${simBefore} -> ${await App.ChangePowerSimulation(0)} W)`);
        if (podium) log(`[race] podium: ${podium.textContent.replace(/\s+/g, ' ').trim()}`);
        cc.returnToEventHub();
        await wait(1500);
    };

    await race('sprint200', { gateShot: 'gate_start', finishShot: 'finish_sprint200' });
    await race('climb400', { probeAt: 20000 });
    log(`[race] after races: 3d rendering=${window.scene3d?.isRendering} (main view ${mainView}, hub open)`);

    log(`[race] slower sprint: sim power ${await App.ChangePowerSimulation(-150)}`);
    await race('sprint200', { probeAt: 8000 });

    // Start far behind the record, then accelerate past it: one lead change, new record.
    log(`[race] overtake sprint: sim power ${await App.ChangePowerSimulation(250 - (await App.ChangePowerSimulation(0)))}`);
    await race('sprint200', { powerSteps: [[6000, 650]], probeAt: 14000, finishShot: 'finish_overtake' });
    log(`[race] override reset to ${await App.ChangePowerSimulation(300 - (await App.ChangePowerSimulation(0)))}`);

    const ranking = await App.GetEventRanking('sprint200', true);
    const mine = ranking.filter((r) => r.rider_name === RAW);
    log(`[race] sprint200 ranking (incl. simulated): ${mine.length} entry for ${RAW}: ` +
        mine.map((r) => `${r.score.toFixed(2)} s sim=${r.is_simulated} w=${r.weight} ghost=${JSON.parse(r.ghost || '[]').length}`).join(', '));
    const official = await App.GetEventRanking('sprint200', false);
    log(`[race] sprint200 official ranking has ${RAW}: ${official.some((r) => r.rider_name === RAW)}`);

    // No power at all: the rider never moves and the race ends as not finished.
    log(`[race] zero power: sim power ${await App.ChangePowerSimulation(-150 - (await App.ChangePowerSimulation(0)))}`);
    await race('sprint200');

    // The Zone Challenge (points) still runs its own one-minute flow.
    log(`[race] zone challenge: sim power ${await App.ChangePowerSimulation(250 - (await App.ChangePowerSimulation(0)))}`);
    {
        const t0 = performance.now();
        await cc.launchTimeTrial();
        while (cc.activeChallenge && performance.now() - t0 < 120000) await wait(250);
        log(`[race] timeTrial: ${result()} (wall ${((performance.now() - t0) / 1000).toFixed(1)} s)`);
        cc.returnToEventHub();
        const zr = await App.GetEventRanking('timeTrial', true);
        log(`[race] timeTrial ranking entry: ${JSON.stringify(zr.filter((r) => r.rider_name === RAW).map((r) => [r.score, r.is_simulated, r.weight]))}`);
        await wait(1500);
    }

    await cc.setFairMode(true);
    let connectErr = 'none';
    try { await App.ConnectVirtualTrainer(); } catch (e) { connectErr = String(e); }
    log(`[race] fair mode on: connect simulator -> ${connectErr}; power override -> ${await App.ChangePowerSimulation(50)}; state ${JSON.stringify(await App.GetDeviceConnectionState())}`);
    await cc.setFairMode(false);

    const history = await App.GetRaceHistory(RAW);
    for (const r of history) await App.DeleteEventRecord(r.id);
    log(`[race] cleanup: deleted ${history.length} test records; remaining ${(await App.GetRaceHistory(RAW)).length}`);
    log('[race] done');
}

async function runScene3DAutoCheck() {
    const App = window.go.main.App;
    const log = (msg) => { console.log(msg); window.runtime?.LogInfo?.(msg); };
    // Surface page errors and console warnings in the Wails terminal during the check.
    window.addEventListener('error', (e) => log(`[scene3d] PAGE ERROR ${e.message} @ ${e.filename}:${e.lineno}`));
    const consoleError = console.error.bind(console), consoleWarn = console.warn.bind(console);
    console.error = (...a) => { consoleError(...a); window.runtime?.LogInfo?.(`[scene3d] console.error ${a.map(String).join(' ').slice(0, 300)}`); };
    console.warn = (...a) => { consoleWarn(...a); window.runtime?.LogInfo?.(`[scene3d] console.warn ${a.map(String).join(' ').slice(0, 300)}`); };
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const secs = Number(import.meta.env.VITE_SCENE3D_AUTO_SECS || 20);
    const demo = import.meta.env.VITE_SCENE3D_AUTO === 'demo';
    const fmt = (s) => `dist=${s.courseDistanceM.toFixed(1)} speed=${s.speedKmh.toFixed(1)} power=${s.power.toFixed(0)} ` +
        `cadence=${s.cadence.toFixed(0)} sprint=${s.sprint.toFixed(2)} fps=${s.fps.toFixed(1)} camera=${s.camera}`;

    const route = await App.GetRoutePath();
    if (!route || route.length < 2) await App.LoadPredefinedKOMSegment();
    if (!demo) {
        log(`[scene3d] trainer: ${await App.ConnectVirtualTrainer()}`);
        log(`[scene3d] session: ${await App.ToggleSession()}`);
        log(`[scene3d] sim power: ${await App.ChangePowerSimulation(250)}`);
    }
    let samples = 0;
    const countSample = () => { samples++; };
    telemetryBus.subscribe(countSample);
    window.ui?.toggleStudioMode?.(false);
    document.querySelectorAll('.home-overlay.active').forEach((el) => el.classList.remove('active'));
    const previousView = mainView;
    setMainView('3d');
    const scene3d = await ensureScene3D();
    if (demo) scene3d.scene.clearRideData(); // no trainer: let the scene ride on its own physics
    await wait(3000);
    log(`[scene3d] telemetry samples in 3 s: ${samples}`);
    telemetryBus.unsubscribe(countSample);
    log(`[scene3d] start ua="${navigator.userAgent}" dpr=${window.devicePixelRatio} quality=${scene3d.qualityName}`);

    await wait(secs * 1000);
    log(`[scene3d] cruise ${fmt(scene3d.getState())}`);
    const shot = async (tag) => {
        const img = await scene3d.captureFrame(0.75);
        if (img) log(`[scene3d-shot] ${tag} ${img}`);
    };
    await shot('chase');

    // Sprint: well above FTP (simulator only; the demo forces it).
    if (demo) scene3d.scene.setSprint(true);
    else log(`[scene3d] sim power: ${await App.ChangePowerSimulation(500)}`);
    await wait(4000);
    log(`[scene3d] sprint ${fmt(scene3d.getState())}`);
    await shot('sprint');
    if (demo) scene3d.scene.setSprint(null);
    else await App.ChangePowerSimulation(-500);

    // Graphics presets (VITE_SCENE3D_QUALITY=1): FPS per render resolution.
    if (import.meta.env.VITE_SCENE3D_QUALITY === '1') {
        const previousQuality = scene3d.qualityName;
        for (const q of ['low', 'medium', 'high']) {
            scene3d.setQuality(q);
            await wait(6000);
            log(`[scene3d] quality=${q} canvas=${scene3d.scene.canvas.width}x${scene3d.scene.canvas.height} ${fmt(scene3d.getState())}`);
            await shot(`quality_${q}`);
        }
        scene3d.setQuality(previousQuality);
    }

    // Stopping (pausing the session) must stop the legs too.
    if (!demo) {
        log(`[scene3d] pause: ${await App.ToggleSession()}`);
        await wait(6000);
        log(`[scene3d] after stop: ${fmt(scene3d.getState())}`);
    }

    // View switching: the scene must render only in the 3D view and never add contexts.
    const canvases = () => document.querySelectorAll('canvas').length;
    const before = canvases();
    let wrong = 0;
    log(`[scene3d] switch-test start canvases=${before}`);
    for (let i = 0; i < 50; i++) {
        for (const [view, expect] of [['map', false], ['dashboard', false], ['3d', true]]) {
            setMainView(view);
            await wait(120);
            if (scene3d.isRendering !== expect) wrong++;
        }
    }
    await wait(2000);
    log(`[scene3d] switch-test done cycles=50 wrongStates=${wrong} canvases=${canvases()} (before ${before}) ` +
        `fpsAfter=${scene3d.getState().fps.toFixed(0)} rendering3d=${scene3d.isRendering}`);
    const markerShown = () => {
        const m = document.querySelector('#map-container .maplibregl-marker');
        return m ? getComputedStyle(m).display !== 'none' : 'no-marker';
    };
    log(`[scene3d] 3d view marker shown=${markerShown()}`);
    setMainView('map');
    await wait(500);
    log(`[scene3d] map view rendering=${scene3d.isRendering} marker shown=${markerShown()}`);
    setMainView(previousView);
    if (!demo) {
        await App.DiscardSession();
        await App.DisconnectTrainer();
    }
    log('[scene3d] done');
}

// =======================
// TAB NAVIGATION (GLOBAL)
// =======================

function openTab(tabId, event) {
    document.querySelectorAll('.tab-pane').forEach(el => {
        el.classList.remove('active');
        el.style.display = 'none';
    });
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

    const pane = document.getElementById(tabId);
    pane.classList.add('active');
    pane.style.display = 'flex';
    event.currentTarget.classList.add('active');

    if (tabId === 'tab-career') {
        setTimeout(() => { window.ui.loadCareerDashboard(); }, 50);
    }
}
window.openTab = openTab;

if (window.runtime && !Capacitor.isNativePlatform()) {

    window.runtime.EventsOn("ble_connection_status", (data) => {
        if (data?.msg) {
            const tone = data.stage?.includes('CONNECTED')
                ? (data.msg.includes('Virtual') ? "#00ADD8" : "var(--argus-safe)")
                : "";
            setTrainerStatusForAll(data.msg, tone);
        }
        if (data.stage === "READY") {
            mapCtrl.followCyclist = true;
        }

        refreshTrainerConnectionState();
    });

    window.runtime.EventsOn("status_change", (status) => {
        if (status === "RECORDING") {
            ui.setRecordingState('RECORDING');
            window.isRecording = true;
            // Event modes load their own route (e.g. the KOM segment) right before starting.
            if (window.scene3d) window.scene3d.refreshRoute();
        }
        else if (status === "PAUSED") {
            ui.setRecordingState('PAUSED');
            window.isRecording = true;
        }
        else {
            // When a challenge mode (KOM, Sprint, etc.) is ending, it manages
            // its own UI lifecycle. The suppress-map-modals flag indicates the
            // challenge controller is handling cleanup — skip the full UI reset
            // to prevent a visual flash of the settings/config screen.
            if (document.body.classList.contains('suppress-map-modals')) {
                window.isRecording = false;
                return;
            }

            ui.setRecordingState('IDLE');
            window.isRecording = false;

            if (window.ui) {
                window.ui.resetDashboardData();
            }
        }
    });

    window.runtime.EventsOn("telemetry_update", (data) => {
        telemetryBus.publish(data);
        updateMapPosition(data);
    });

    window.runtime.EventsOn("cooldown_update", (data) => {
        const modal = document.getElementById('cooldownModal');
        if (modal && modal.classList.contains('active')) {
            const m = Math.floor(data.time_left / 60);
            const s = data.time_left % 60;
            document.getElementById('cooldownTimer').innerText = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
            document.getElementById('cooldownHR').innerText = `${data.current_hr} bpm`;
        }
    });

    window.runtime.EventsOn("cooldown_complete", async (summary) => {
        const cdModal = document.getElementById('cooldownModal');
        cdModal.classList.remove('active');
        cdModal.style.display = 'none';
        if (window.ui) {
            window.ui.showFinishModal(summary);
        }

        try {
            if (window.go && window.go.main && window.go.main.App.IsStravaConnected) {
                const isConnected = await window.go.main.App.IsStravaConnected();
                const btnStrava = document.getElementById('btnUploadStrava');

                if (isConnected) {
                    btnStrava.classList.remove('hidden');
                    btnStrava.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 5px;">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                    </svg> Upload to Strava`;
                    btnStrava.disabled = false;
                    btnStrava.style.backgroundColor = "#FC4C02";
                } else {
                    btnStrava.classList.add('hidden');
                }
            }
        } catch (e) {
            console.log("Strava validation skipped", e);
        }
    });
}

// =====================================
// HOME SCREEN & PROFILE SELECTION LOGIC
// =====================================

let newAvatarBase64 = "";

function getTimeGreeting() {
    const h = new Date().getHours();
    if (h < 5) return "Good night";
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
}

function formatCompactNumber(n) {
    const num = Number(n || 0);
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return `${num.toFixed(1)}`;
}

window.toggleCreateForm = (show) => {
    const select = document.getElementById('homeSelect');
    const form = document.getElementById('createProfileForm');
    const footer = document.getElementById('homeFooter');
    const welcome = document.getElementById('homeWelcome');

    select?.classList.toggle('hidden', !!show);
    footer?.classList.toggle('hidden', !!show);
    form?.classList.toggle('hidden', !show);
    const error = document.getElementById('newRiderError');
    if (error) error.textContent = '';
    if (welcome) welcome.innerText = show ? 'NEW RIDER' : getTimeGreeting().toUpperCase();
    if (show) document.getElementById('newRiderName')?.focus();
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

    const formError = document.getElementById('newRiderError');
    if (!nameInput.trim()) {
        if (formError) formError.textContent = "Enter the rider's name.";
        document.getElementById('newRiderName')?.focus();
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
        if (formError) formError.textContent = `Could not create the rider: ${err}`;
    }
};

window.checkStravaStatus = async () => {
    if (!Capacitor.isNativePlatform() && window.go && window.go.main) {
        try {
            const isConn = await window.go.main.App.IsStravaConnected();
            const btn = document.getElementById('btnConnectStrava');
            const btnDisconnect = document.getElementById('btnDisconnectStrava');
            const status = document.getElementById('statusStrava');

            if (isConn) {
                btn.innerHTML = "✓ Strava Connected";
                btn.disabled = true;
                btnDisconnect.classList.remove('hidden');
                status.innerText = "Ready to auto-upload";
                status.style.color = "var(--argus-safe)";
            } else {
                btn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 5px;">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                    </svg> Connect with Strava`;
                btn.disabled = false;
                btnDisconnect.classList.add('hidden');
                status.innerText = "Not connected";
                status.style.color = "var(--text-muted)";
            }
        } catch (e) { console.error("Falha ao checar status do Strava", e); }
    }
};

document.getElementById('btnDisconnectStrava').addEventListener('click', async () => {
    if (confirm("Disconnect Argus Cyclist from your Strava account?")) {
        try {
            await window.go.main.App.DisconnectStrava();
            await window.checkStravaStatus();
        } catch (err) {
            console.error("Disconnect error:", err);
        }
    }
});

window.deleteProfile = async (id, name, event) => {
    event?.stopPropagation?.();

    if (confirm(`Are you sure you want to permanently delete the profile "${name}"?\n\nAll your workout history, settings, and progress will be lost. This cannot be undone.`)) {
        try {
            await window.go.main.App.DeleteLocalAccount(id);
            // Refresh the grid immediately after successful deletion
            initHomeScreen();
        } catch (err) {
            console.error("Error deleting profile:", err);
            alert("Failed to delete profile: " + err);
        }
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

        if (window.challengeCtrl) {
            window.challengeCtrl.restoreMainLayout();
        }

        await window.checkStravaStatus();

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

    if (window.challengeCtrl) {
        await window.challengeCtrl.abortActiveChallenge();
    }

    // 5. Displays the home screen again
    const homeScreen = document.getElementById('homeScreen');
    if (homeScreen) {
        homeScreen.classList.add('active');
    }
    await refreshTrainerConnectionState();
    initHomeScreen();
};

function formatHomeTime(seconds) {
    if (!seconds) return "0h 0m";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

function escapeHomeText(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

// Home rider list: a click selects a rider, a double click (or RIDE / Enter) logs in.
let homeAccounts = [];
let homeSelectedId = null;

function selectHomeRider(id) {
    homeSelectedId = id;
    const acc = homeAccounts.find((a) => String(a.id) === String(id));
    document.querySelectorAll('#profileGrid .ar-rider[data-id]').forEach((row) => {
        row.setAttribute('aria-checked', row.dataset.id === String(id) ? 'true' : 'false');
        row.tabIndex = row.dataset.id === String(id) ? 0 : -1;
    });
    const ride = document.getElementById('btnHomeRide');
    const label = document.getElementById('homeRideLabel');
    const del = document.getElementById('btnHomeDeleteRider');
    if (ride) ride.disabled = !acc;
    if (label) label.textContent = acc ? `AS ${acc.name.toUpperCase()}` : 'SELECT A RIDER';
    if (del) del.disabled = !acc;
}

function rideSelectedRider() {
    if (homeSelectedId !== null) window.loginProfile(homeSelectedId);
}

document.getElementById('btnHomeRide')?.addEventListener('click', rideSelectedRider);
document.getElementById('btnHomeDeleteRider')?.addEventListener('click', (e) => {
    const acc = homeAccounts.find((a) => String(a.id) === String(homeSelectedId));
    if (acc) window.deleteProfile(acc.id, acc.name, e);
});

// The home owns the keyboard while it is open: arrows move the selection, Enter rides.
document.addEventListener('keydown', (e) => {
    const home = document.getElementById('homeScreen');
    if (!home?.classList.contains('active') || document.getElementById('homeSelect')?.classList.contains('hidden')) return;
    const tag = e.target?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    const ids = homeAccounts.map((a) => String(a.id));
    if (!ids.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const i = ids.indexOf(String(homeSelectedId)) + (e.key === 'ArrowDown' ? 1 : -1);
        selectHomeRider(ids[(i + ids.length) % ids.length]);
        document.querySelector(`#profileGrid .ar-rider[data-id="${homeSelectedId}"]`)?.focus();
        e.preventDefault();
    } else if (e.key === 'Enter' && tag !== 'button') {
        e.preventDefault();
        rideSelectedRider();
    }
});

async function initHomeScreen() {
    const grid = document.getElementById('profileGrid');
    grid.innerHTML = "";
    window.toggleCreateForm(false);

    try {
        const rawAccounts = await window.go.main.App.GetLocalAccounts();
        homeAccounts = (rawAccounts || []).filter(acc => acc.name !== 'Event Mode');
        const subtitle = document.getElementById('homeSubtitle');
        if (subtitle) {
            subtitle.innerText = !homeAccounts.length ? 'Create your first rider to begin'
                : homeAccounts.length === 1 ? 'Select your profile to start' : "Choose who's riding today";
        }

        grid.innerHTML = homeAccounts.map((acc) => {
            const photo = acc.avatar && acc.avatar.length > 10 ? acc.avatar : defaultAvatarUrl;
            const name = escapeHomeText(acc.name);
            const meta = [acc.weight ? `${acc.weight} kg` : '', acc.ftp ? `FTP ${acc.ftp} W` : ''].filter(Boolean).join(' · ');
            return `
                <div class="ar-rider" role="radio" aria-checked="false" tabindex="-1" data-id="${escapeHomeText(acc.id)}">
                    <img class="ar-rider-photo" src="${photo}" alt="">
                    <span class="ar-rider-name">
                        <strong>${name}</strong>
                        <span class="ar-rider-meta"><span class="ar-badge">LVL ${acc.level || 1}</span>${escapeHomeText(meta)}</span>
                    </span>
                    <span class="ar-rider-stat"><span class="ar-num">${formatCompactNumber(acc.total_km || 0)}</span><span class="ar-unit"> km</span></span>
                    <span class="ar-rider-stat"><span class="ar-num">${Math.round(acc.total_elevation || 0)}</span><span class="ar-unit"> m</span></span>
                    <span class="ar-rider-stat"><span class="ar-num">${formatHomeTime(acc.total_time)}</span></span>
                </div>`;
        }).join('') + `
            <div class="ar-rider ar-rider-new" role="button" tabindex="0" id="homeNewRider">
                <span class="ar-rider-photo" aria-hidden="true">
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"></path></svg>
                </span>
                <span class="ar-rider-name">
                    <strong>NEW RIDER</strong>
                    <span class="ar-rider-meta">Name, weight and FTP</span>
                </span>
            </div>`;

        grid.querySelectorAll('.ar-rider[data-id]').forEach((row) => {
            row.addEventListener('click', () => selectHomeRider(row.dataset.id));
            row.addEventListener('dblclick', () => window.loginProfile(row.dataset.id));
        });
        const newRow = document.getElementById('homeNewRider');
        newRow?.addEventListener('click', () => window.toggleCreateForm(true));
        newRow?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.toggleCreateForm(true); }
        });

        const keep = homeAccounts.some((a) => String(a.id) === String(homeSelectedId));
        selectHomeRider(keep ? homeSelectedId : (homeAccounts[0]?.id ?? null));
    } catch (err) {
        console.error("Error loading accounts:", err);
    }
}

// =========================
// ONBOARDING TUTORIAL LOGIC
// =========================

let currentTutorialStep = 1;
const totalTutorialSteps = 10;

function initTutorial() {
    const tutorialSeen = localStorage.getItem('argus_tutorial_seen');
    if (!tutorialSeen) {
        showTutorial();
    }

    // Event listeners
    document.getElementById('btnNextStep').addEventListener('click', nextTutorialStep);
    document.getElementById('btnPrevStep').addEventListener('click', prevTutorialStep);
    document.getElementById('btnFinishTutorial').addEventListener('click', finishTutorial);

    const btnSkip = document.getElementById('btnSkipTutorial');
    if (btnSkip) {
        btnSkip.addEventListener('click', finishTutorial);
    }

    const btnViewTut = document.getElementById('btnViewTutorial');
    if (btnViewTut) {
        btnViewTut.addEventListener('click', () => {
            if (window.ui) window.ui.toggleSettings(false);
            showTutorial();
        });
    }
}

function showTutorial() {
    currentTutorialStep = 1;
    updateTutorialUI();
    const modal = document.getElementById('tutorialModal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('active');
    }
}

function updateTutorialUI() {
    document.querySelectorAll('.tutorial-step').forEach(step => {
        step.classList.remove('active');
        if (parseInt(step.dataset.step) === currentTutorialStep) {
            step.classList.add('active');
        }
    });

    // Update dots
    const indicators = document.querySelector('.step-indicators');
    if (indicators) {
        if (currentTutorialStep === 1) indicators.classList.add('hidden');
        else indicators.classList.remove('hidden');
    }

    document.querySelectorAll('.step-indicators .dot').forEach(dot => {
        dot.classList.remove('active');
        if (parseInt(dot.dataset.step) === currentTutorialStep) {
            dot.classList.add('active');
        }
    });

    // Update buttons
    const btnPrev = document.getElementById('btnPrevStep');
    const btnNext = document.getElementById('btnNextStep');
    const btnFinish = document.getElementById('btnFinishTutorial');

    if (btnPrev && btnNext && btnFinish) {
        if (currentTutorialStep === 1) {
            btnPrev.classList.add('hidden');
        } else {
            btnPrev.classList.remove('hidden');
        }

        if (currentTutorialStep === totalTutorialSteps) {
            btnNext.classList.add('hidden');
            btnFinish.classList.remove('hidden');
        } else {
            btnNext.classList.remove('hidden');
            btnFinish.classList.add('hidden');
        }
    }
}

function nextTutorialStep() {
    if (currentTutorialStep < totalTutorialSteps) {
        currentTutorialStep++;
        updateTutorialUI();
    }
}

function prevTutorialStep() {
    if (currentTutorialStep > 1) {
        currentTutorialStep--;
        updateTutorialUI();
    }
}

function finishTutorial() {
    const modal = document.getElementById('tutorialModal');
    if (modal) {
        modal.classList.remove('active');
        modal.classList.add('hidden');
    }

    const chk = document.getElementById('chkDoNotShowAgain');
    if (chk && chk.checked) {
        localStorage.setItem('argus_tutorial_seen', 'true');
    }
}

window.closeTutorial = function () {
    finishTutorial();
}

// Call this explicitly when Wails finishes mounting the runtime
document.addEventListener("DOMContentLoaded", () => {
    // We wait 300ms to guarantee window.go.main is ready
    setTimeout(() => {
        initHomeScreen();
        refreshTrainerConnectionState();
        initTutorial();
        bindIntervalsUI();
        initSessionRecovery();
    }, 300);
});
