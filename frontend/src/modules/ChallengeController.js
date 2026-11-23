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

import { telemetryBus } from './TelemetryEventBus.js';

// Rider names are free text typed at the event hub; never inject them as raw HTML.
import { GhostTrack, formatGap } from './GhostTrack.js';

const FAIR_MODE_KEY = 'argus.fairMode';
const OVERTAKE_HYSTERESIS = 0.15; // s of gap before announcing a change of lead
const FINISH_BANNER_MS = 2200;     // finish banner over the 3D before the result screen
const GHOST_STEP = 5;            // m between ghost samples (domain.GhostStep)
const RACE_IDLE_LIMIT = 15;      // s nearly stopped before a race counts as not finished
const RACE_IDLE_SPEED = 1;       // km/h

/** Formats seconds as "23.45 s" or "1:02.37". */
export function formatRaceTime(seconds) {
    const t = Math.max(0, seconds || 0);
    if (t < 60) return `${t.toFixed(2)} s`;
    const m = Math.floor(t / 60);
    return `${m}:${(t - m * 60).toFixed(2).padStart(5, '0')}`;
}

/**
 * Finish time by linear interpolation between the samples around the line:
 * t = t0 + (L - d0) / (d1 - d0) * (t1 - t0). samples: [{t, d}] ascending in d.
 */
export function interpolateFinish(samples, distance) {
    for (let i = 1; i < samples.length; i++) {
        const a = samples[i - 1], b = samples[i];
        if (b.d >= distance) {
            if (b.d <= a.d) return b.t;
            return a.t + ((distance - a.d) / (b.d - a.d)) * (b.t - a.t);
        }
    }
    return null;
}

/** Elapsed time at every `step` meters from 0 to `distance` (2 decimals), for ghosts. */
export function buildGhost(samples, distance, step = GHOST_STEP) {
    const out = [];
    let i = 1;
    for (let d = 0; d <= distance + 1e-9; d += step) {
        while (i < samples.length - 1 && samples[i].d < d) i++;
        const a = samples[i - 1], b = samples[i];
        const t = b.d > a.d ? a.t + ((Math.min(d, b.d) - a.d) / (b.d - a.d)) * (b.t - a.t) : b.t;
        out.push(Math.round(Math.max(0, t) * 100) / 100);
    }
    return out;
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

export class ChallengeController {
    constructor(ui, hud, mapCtrl, chart) {
        this.ui = ui;
        this.hud = hud;
        this.mapCtrl = mapCtrl;
        this.chart = chart;

        this.els = {
            homeScreen: document.getElementById('homeScreen'),
            eventHubModal: document.getElementById('eventHubPage'),
            leaderboardModal: document.getElementById('eventLeaderboardModal'),
            leaderboardPanels: document.getElementById('eventLeaderboardPanels'),
            resultModal: document.getElementById('challengeResultModal'),
            resultMode: document.getElementById('challengeResultMode'),
            resultTitle: document.getElementById('challengeResultTitle'),
            resultValue: document.getElementById('challengeResultValue'),
            resultRank: document.getElementById('challengeResultRank'),
            resultDescription: document.getElementById('challengeResultDescription'),
            riderInput: document.getElementById('eventRiderName'),
            eventTrainerStatus: document.getElementById('eventTrainerStatus'),
            trainerStatus: document.getElementById('statusTrainer')
        };

        // Active modes. Distance races rank by the lowest time (ascending).
        this.modeMeta = {
            sprint200: {
                title: 'Sprint 200 m',
                fullTitle: 'Sprint · 200 m',
                metric: 'Time',
                kind: 'race',
                distance: 200,
                maxDuration: 90,
                ascending: true
            },
            climb400: {
                title: 'Climb 400 m',
                fullTitle: 'Climb · 400 m',
                metric: 'Time',
                kind: 'race',
                distance: 400,
                maxDuration: 240,
                ascending: true
            },
            timeTrial: {
                title: 'Zone Challenge',
                fullTitle: 'Zone Challenge (Power Accumulation)',
                metric: 'Score',
                unit: 'pts',
                kind: 'points',
                ascending: false
            }
        };

        // Retired modes: still shown in the race history, never ranked.
        this.legacyMeta = {
            sprint: { title: 'Sprint (legacy)', fullTitle: 'Sprint · Max Power (legacy)', unit: 'W' },
            kom: { title: 'KOM (legacy)', fullTitle: 'King of the Mountain (legacy)', unit: 'm' },
            tt1k: { title: 'Time Trial 1 km (legacy)', fullTitle: 'Time Trial · 1 km (legacy)', time: true }
        };

        this.leaderboards = Object.fromEntries(Object.keys(this.modeMeta).map((k) => [k, []]));
        this.includeSimulated = false;
        this.fairMode = false;

        this.lastTelemetry = {
            power: 0,
            cadence: 0,
            grade: 0,
            speed: 0,
            total_dist: 0,
            elevation_gain: 0
        };

        this.activeChallenge = null;
        this.leaderboardFilter = 'G';
        this.animationFrame = null;
        this.lastFrameTime = 0;
        this.lastKnownRank = -1;
        this.leaderboardUpdateAccumulator = 0;

        window.challengeController = this;

        this._telemetryCallback = (data) => this.updateTelemetry(data);
        telemetryBus.subscribe(this._telemetryCallback);

        this.bindEvents();
        this.resizeCanvases();
        this.restoreFairMode();

        window.addEventListener('resize', () => this.resizeCanvases());
    }

    bindEvents() {
        document.getElementById('btnHomeEventMode')?.addEventListener('click', () => this.enterEventMode());
        document.getElementById('btnHomeLeaderboard')?.addEventListener('click', () => this.openLeaderboard());
        document.getElementById('btnEventLeaderboard')?.addEventListener('click', () => this.openLeaderboard());
        document.getElementById('btnRaceHistory')?.addEventListener('click', () => {
            this.closeModal(this.els.eventHubModal);
            this.openRaceHistoryModal();
        });
        document.getElementById('btnEventClose')?.addEventListener('click', () => this.closeModal(this.els.eventHubModal));
        document.getElementById('btnCloseEventHub')?.addEventListener('click', () => {
            this.closeModal(this.els.eventHubModal);
            this.restoreMainLayout();

            if (!this.activeChallenge) {
                const homeScreen = document.getElementById('homeScreen');
                if (homeScreen) homeScreen.classList.add('active');

                if (window.go?.main?.App?.DisconnectTrainer) window.go.main.App.DisconnectTrainer();
            }
        });

        document.getElementById('btnCloseEventLeaderboard')?.addEventListener('click', () => {
            this.closeModal(this.els.leaderboardModal);
            this.openEventHub();
        });

        document.getElementById('btnCloseRaceHistory')?.addEventListener('click', () => {
            this.closeModal(document.getElementById('raceHistoryModal'));
            this.openEventHub();
        });

        document.getElementById('btnChallengeResultClose')?.addEventListener('click', () => this.returnToEventHub());
        document.getElementById('btnChallengeResultLeaderboard')?.addEventListener('click', () => {
            this.closeModal(this.els.resultModal);
            this.openLeaderboard();
        });

        document.getElementById('btnLaunchSprint')?.addEventListener('click', () => this.launchRace('sprint200'));
        document.getElementById('btnLaunchKOM')?.addEventListener('click', () => this.launchRace('climb400'));
        document.getElementById('btnLaunchTimeTrial')?.addEventListener('click', () => this.launchTimeTrial());

        document.getElementById('btnFairMode')?.addEventListener('click', () => this.setFairMode(!this.fairMode));
        document.getElementById('lbIncludeSimulated')?.addEventListener('change', async (e) => {
            this.includeSimulated = e.target.checked;
            await this.fetchLeaderboardsFromDB();
            this.renderLeaderboardModal();
        });

        document.getElementById('hud-abort-btn')?.addEventListener('click', async () => {
            await this.abortActiveChallenge();
        });

        this.els.riderInput?.addEventListener('input', (e) => this.generateDynamicAvatar(e.target.value));

        document.getElementById('btnEventDisconnectTrainer')?.addEventListener('click', async () => {
            try {
                if (window.go?.main?.App?.DisconnectTrainer) {
                    await window.go.main.App.DisconnectTrainer();
                }
                // Use global unified state refresh to update both panels
                await this.refreshTrainerStatus();
            } catch (e) {
                console.error('Error disconnecting trainer:', e);
                await this.refreshTrainerStatus();
            }
        });
    }

    getGenderEmoji(name) {
        if (!name) return '👤';
        const firstName = name.trim().split(' ')[0].toLowerCase();

        const maleNames = ['lucas', 'nicolas', 'mateus', 'matheus', 'marcos', 'thomas', 'douglas', 'gabriel', 'rafael', 'daniel', 'miguel', 'samuel', 'davi', 'joão', 'joao', 'guilherme', 'henrique', 'felipe', 'andre', 'andré', 'luis', 'luís', 'luiz', 'jonatas'];
        const femaleNames = ['raquel', 'isabel', 'karen', 'yasmin', 'aline', 'viviane', 'simone', 'eliane', 'beatriz', 'ruth', 'ester', 'cibele', 'michelle', 'iris', 'lais', 'laís', 'carmen', 'suelen'];

        let isFemale = false;
        let isMale = false;

        if (femaleNames.includes(firstName)) {
            isFemale = true;
        } else if (maleNames.includes(firstName)) {
            isMale = true;
        } else if (firstName.endsWith('a') || firstName.endsWith('y') || firstName.endsWith('z') || firstName.endsWith('elle') || firstName.endsWith('ete')) {
            isFemale = true;
        } else if (firstName.endsWith('o') || firstName.endsWith('r') || firstName.endsWith('s') || firstName.endsWith('l') || firstName.endsWith('m') || firstName.endsWith('n') || firstName.endsWith('i') || firstName.endsWith('u')) {
            isMale = true;
        }

        const maleFaces = ['👨', '👱‍♂️', '👨‍🦱', '🧔', '👨‍🦰', '👨‍🦳', '😎', '🚴‍♂️', '👦'];
        const femaleFaces = ['👩', '👱‍♀️', '👩‍🦱', '👩‍🦰', '👩‍🦳', '😎', '🚴‍♀️', '👧', '👩‍🦲'];
        const neutralFaces = ['🧑', '😎', '🤓', '🚴', '🚀', '⚡'];

        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        hash = Math.abs(hash);

        if (isFemale) return femaleFaces[hash % femaleFaces.length];
        if (isMale) return maleFaces[hash % maleFaces.length];
        return neutralFaces[hash % neutralFaces.length];
    }

    detectGender(name) {
        if (!name) return 'G';
        const firstName = name.trim().split(' ')[0].toLowerCase();
        const maleNames = ['lucas', 'nicolas', 'mateus', 'matheus', 'marcos', 'thomas', 'douglas', 'gabriel', 'rafael', 'daniel', 'miguel', 'samuel', 'davi', 'joão', 'joao', 'guilherme', 'henrique', 'felipe', 'andre', 'andré', 'luis', 'luís', 'luiz', 'jonatas', 'paulo'];
        const femaleNames = ['raquel', 'isabel', 'karen', 'yasmin', 'aline', 'viviane', 'simone', 'eliane', 'beatriz', 'ruth', 'ester', 'cibele', 'michelle', 'iris', 'lais', 'laís', 'carmen', 'suelen', 'maria'];

        if (femaleNames.includes(firstName)) return 'F';
        if (maleNames.includes(firstName)) return 'M';
        if (firstName.endsWith('a') || firstName.endsWith('y') || firstName.endsWith('z') || firstName.endsWith('elle') || firstName.endsWith('ete')) return 'F';
        if (firstName.endsWith('o') || firstName.endsWith('r') || firstName.endsWith('s') || firstName.endsWith('l') || firstName.endsWith('m') || firstName.endsWith('n') || firstName.endsWith('i') || firstName.endsWith('u')) return 'M';
        return 'G';
    }

    setLeaderboardFilter(filter) {
        this.leaderboardFilter = filter;
        this.renderLeaderboardModal();

        document.querySelectorAll('.lb-filter-btn').forEach(btn => {
            if (btn.dataset.filter === filter) {
                btn.style.background = 'rgba(56,189,248,0.2)';
                btn.style.color = '#38bdf8';
            } else {
                btn.style.background = 'transparent';
                btn.style.color = '#aaa';
            }
        });
    }

    generateDynamicAvatar(name) {
        const avatarEl = document.getElementById('dynamicAvatar');
        if (!avatarEl) return;

        if (!name || name.trim() === '') {
            avatarEl.innerHTML = '👤';
            avatarEl.style.background = '#38bdf8';
            avatarEl.style.boxShadow = '0 0 20px rgba(56, 189, 248, 0.3)';
            return;
        }

        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        const hue = Math.abs(hash % 360);

        const emoji = this.getGenderEmoji(name);

        avatarEl.innerHTML = `<span style="font-size: 2.4rem; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.4)); line-height: 1;">${emoji}</span>`;

        avatarEl.style.background = `hsl(${hue}, 70%, 50%)`;
        avatarEl.style.boxShadow = `0 0 20px hsl(${hue}, 70%, 50%, 0.4), inset 0 0 15px rgba(0,0,0,0.2)`;
        avatarEl.style.transform = 'scale(1.1)';
        setTimeout(() => {
            if (avatarEl) avatarEl.style.transform = 'scale(1)';
        }, 150);
    }

    getAvatarHTML(name, size = 40) {
        if (!name || name.trim() === '') {
            return `<div class="lb-avatar" style="width:${size}px; height:${size}px; background:#38bdf8; font-size:${size * 0.5}px;">👤</div>`;
        }

        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        const hue = Math.abs(hash % 360);
        const emoji = this.getGenderEmoji(name);

        return `
            <div class="lb-avatar" style="width:${size}px; height:${size}px; background-color:hsl(${hue}, 70%, 50%); display: flex; align-items: center; justify-content: center; box-shadow: inset 0 0 10px rgba(0,0,0,0.3);">
                <span style="font-size: ${size * 0.55}px; line-height: 1; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4));">${emoji}</span>
            </div>
        `;
    }

    resizeCanvases() {
    }

    async enterEventMode() {
        if (window.go?.main?.App?.EnsureEventModeProfile) {
            await window.go.main.App.EnsureEventModeProfile();
        }

        await this.refreshTrainerStatus();
        await this.fetchLeaderboardsFromDB();

        const homeScreen = document.getElementById('homeScreen');
        if (homeScreen) homeScreen.classList.remove('active');

        this.openEventHub();
    }

    openEventHub() {
        this.openModal(this.els.eventHubModal);
        this.closeModal(this.els.resultModal);
    }

    async openLeaderboard() {
        await this.fetchLeaderboardsFromDB();
        const genderSelect = document.getElementById('eventRiderGender');
        const defaultFilter = genderSelect && genderSelect.value !== 'G' ? genderSelect.value : 'G';
        this.setLeaderboardFilter(defaultFilter);
        this.openModal(this.els.leaderboardModal);
    }

    openModal(el) {
        if (!el) return;
        el.classList.remove('hidden');
        el.classList.add('active');
    }

    closeModal(el) {
        if (!el) return;
        el.classList.remove('active');
        el.classList.add('hidden');
    }

    metaFor(mode) {
        return this.modeMeta[mode] || this.legacyMeta[mode] || { title: mode, fullTitle: mode };
    }

    isRace(mode) {
        return this.modeMeta[mode]?.kind === 'race';
    }

    // ----- Fair Mode (operator lock) -----

    restoreFairMode() {
        let on = false;
        try { on = localStorage.getItem(FAIR_MODE_KEY) === '1'; } catch { /* storage unavailable */ }
        this.setFairMode(on, { persist: false });
    }

    async setFairMode(on, { persist = true } = {}) {
        this.fairMode = !!on;
        window.fairMode = this.fairMode;
        if (persist) {
            try { localStorage.setItem(FAIR_MODE_KEY, this.fairMode ? '1' : '0'); } catch { /* storage unavailable */ }
        }
        try {
            if (window.go?.main?.App?.SetFairMode) await window.go.main.App.SetFairMode(this.fairMode);
        } catch (e) {
            console.error('Failed to set Fair Mode:', e);
        }
        const btn = document.getElementById('btnFairMode');
        if (btn) {
            btn.querySelector('[data-role="label"]').textContent = `Fair Mode: ${this.fairMode ? 'ON' : 'OFF'}`;
            btn.style.color = this.fairMode ? '#22c55e' : '#94a3b8';
            btn.style.borderColor = this.fairMode ? 'rgba(34,197,94,0.5)' : 'rgba(255,255,255,0.15)';
            btn.style.background = this.fairMode ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.05)';
        }
        const virtualBtn = document.getElementById('btnEventConnectVirtual');
        if (virtualBtn) virtualBtn.disabled = this.fairMode;
        await this.refreshTrainerStatus();
    }

    /** Weight in kg; 0 when optional and left empty; null (after an alert) when invalid. */
    getRiderWeight({ required = true } = {}) {
        const raw = document.getElementById('eventRiderWeight')?.value;
        const kg = Number(raw);
        if (!raw && !required) return 0;
        if (!Number.isFinite(kg) || kg < 35 || kg > 150) {
            alert('Please enter the cyclist weight (35-150 kg) before starting a race.');
            return null;
        }
        return kg;
    }

    getRiderName() {
        const nameInput = this.els.riderInput;
        const genderInput = document.getElementById('eventRiderGender');
        const name = nameInput?.value?.trim();

        if (!name) {
            alert('Please enter the cyclist name before starting the event.');
            return '';
        }

        const gender = genderInput?.value || 'G';
        return `${name} [${gender}]`;
    }

    async fetchLeaderboardsFromDB() {
        if (!window.go?.main?.App?.GetEventRanking) return;

        for (const type of Object.keys(this.modeMeta)) {
            try {
                const records = await window.go.main.App.GetEventRanking(type, this.includeSimulated);
                this.leaderboards[type] = (records || []).map(r => {
                    let rawName = r.rider_name;
                    let cleanName = rawName;
                    let gender = 'G';

                    const match = rawName.match(/(.+) \[([MFG])\]$/);
                    if (match) {
                        cleanName = match[1].trim();
                        gender = match[2];
                    } else {
                        gender = this.detectGender(cleanName);
                    }

                    return {
                        rider: cleanName,
                        rawRider: rawName,
                        gender: gender,
                        value: r.score,
                        status: r.status,
                        isSimulated: !!r.is_simulated,
                        createdAt: new Date(r.created_at).getTime()
                    };
                });
            } catch (e) {
                console.error(`Failed to fetch leaderboard for ${type}:`, e);
                this.leaderboards[type] = [];
            }
        }
    }

    async hasTrainerConnection() {
        if (window.go?.main?.App?.GetDeviceConnectionState) {
            const state = await window.go.main.App.GetDeviceConnectionState();
            return !!state?.trainer_connected;
        }
        const status = this.els.trainerStatus?.innerText || '';
        return ['Trainer Connected', 'Simulator Active', 'Virtual Trainer Connected'].includes(status);
    }

    async refreshTrainerStatus() {
        // Delegate to the global unified trainer UI system (main.js)
        // which manages both Settings and Event Hub buttons consistently.
        if (window.refreshTrainerConnectionState) {
            const state = await window.refreshTrainerConnectionState();

            // Update the Event Hub's own status text and color
            const statusEl = this.els.eventTrainerStatus;
            if (statusEl) {
                if (state?.trainer_connected) {
                    statusEl.textContent = state.trainer_kind === 'virtual' ? 'Simulator Active' : 'Trainer Connected';
                    statusEl.style.color = state.trainer_kind === 'virtual' ? '#00ADD8' : '#22c55e';
                } else {
                    statusEl.textContent = 'Disconnected';
                    statusEl.style.color = '#ef4444';
                }
            }

            return;
        }

        // Fallback: manual check if global function is not available
        let isConnected = false;

        if (window.go?.main?.App?.GetDeviceConnectionState) {
            const state = await window.go.main.App.GetDeviceConnectionState();
            isConnected = !!state?.trainer_connected;
        }

        const statusEl = this.els.eventTrainerStatus;
        if (statusEl) {
            statusEl.textContent = isConnected ? 'Trainer Connected' : 'Disconnected';
            statusEl.style.color = isConnected ? '#22c55e' : '#ef4444';
        }
    }

    async prepareChallengeEnvironment(mode) {
        if (this._aborting) {
            console.warn('Cannot start challenge: previous session is still cleaning up.');
            return false;
        }

        await this.refreshTrainerStatus();

        if (!await this.hasTrainerConnection()) {
            alert('Connect a trainer or activate the simulator before starting an event challenge.');
            return false;
        }

        if (window.isRecording) {
            alert('Finish the current session before starting a new event challenge.');
            return false;
        }

        if (window.go?.main?.App?.SetDirectGrade) {
            await window.go.main.App.SetDirectGrade(0);
        }
        if (!this.isRace(mode)) this.clearRoutePreview();

        return true;
    }

    clearRoutePreview() {
        window.totalRouteDistance = 0;
        this.ui.showRoutePreview(0);

        if (window.ui?.els?.filename) {
            window.ui.els.filename.innerText = '';
        }

        if (this.mapCtrl?.map) {
            const source = this.mapCtrl.map.getSource('route');
            if (source) {
                source.setData({ type: 'FeatureCollection', features: [] });
            }
        }

        this.chart?.setData([]);
    }

    async startBackendSession() {
        window.isRecording = true;
        if (this.ui && this.ui.setRecordingState) {
            this.ui.setRecordingState('RECORDING');
        }

        document.body.classList.add('suppress-map-modals');

        if (window.go?.main?.App?.ToggleSession) {
            const result = await window.go.main.App.ToggleSession();
            if (typeof result === 'string' && result.toLowerCase().includes('error')) {
                window.isRecording = false;
                if (this.ui) this.ui.setRecordingState('IDLE');
                document.body.classList.remove('suppress-map-modals');
                throw new Error(result);
            }
        }
    }

    async stopBackendSession() {
        if (!window.isRecording) return;

        window.isRecording = false;

        document.body.classList.add('suppress-map-modals');

        if (this.ui && this.ui.setRecordingState) {
            this.ui.setRecordingState('IDLE');
        }

        if (window.go?.main?.App?.DiscardSession) {
            await window.go.main.App.DiscardSession();
        }

        // Fully reset the main dashboard data so that when the Event Hub
        // is closed, the user sees a clean idle state — not stale KOM data.
        if (this.ui && this.ui.resetDashboardData) {
            this.ui.resetDashboardData();
        }

        const intrudingModals = ['confirmModal', 'finishModal', 'cooldownModal'];
        intrudingModals.forEach(id => {
            const modal = document.getElementById(id);
            if (modal) {
                modal.classList.remove('active');
                modal.classList.add('hidden');
            }
        });

        setTimeout(() => {
            document.body.classList.remove('suppress-map-modals');
        }, 1500);
    }

    async launchRace(mode) {
        const meta = this.modeMeta[mode];
        const riderName = this.getRiderName();
        if (!riderName) return;
        const weight = this.getRiderWeight();
        if (!weight) return;
        if (!await this.prepareChallengeEnvironment(mode)) return;

        let simulated = false;
        try {
            await window.go.main.App.SetEventRiderWeight(weight);
            await window.go.main.App.SetEventCourse(mode);
            const state = await window.go.main.App.GetDeviceConnectionState();
            simulated = state?.trainer_kind === 'virtual';
        } catch (e) {
            alert(`Unable to prepare the race: ${e}`);
            return;
        }
        const record = await this.loadRecordGhost(mode, simulated);

        await this.startChallenge({
            type: mode,
            kind: 'race',
            riderName,
            weight,
            simulated,
            distance: meta.distance,
            duration: meta.maxDuration,
            phase: 'countdown',
            samples: [{ t: 0, d: 0 }],
            progress: 0,
            idleTime: 0,
            started: false,
            ghost: record?.track || null,
            record: record ? { name: record.name, score: record.score } : null,
            gap: null,
            ahead: null
        });
    }

    /**
     * Ghost of the current record for a mode: the best official attempt (simulated
     * attempts race the best including simulated ones, so testing without a trainer
     * still shows a ghost). Null when nobody has a replayable attempt yet.
     */
    async loadRecordGhost(mode, includeSimulated) {
        try {
            const ranking = await window.go.main.App.GetEventRanking(mode, includeSimulated);
            const best = (ranking || []).find((r) => r.ghost);
            if (!best) return null;
            const track = new GhostTrack(JSON.parse(best.ghost), GHOST_STEP);
            if (!track.valid) return null;
            return { track, name: best.rider_name.replace(/ \[[MFG]\]$/, ''), score: best.score };
        } catch (e) {
            console.warn('No record ghost:', e);
            return null;
        }
    }

    /** Race time (s) since GO, on the display clock; 0 before GO. */
    raceClock(c) {
        return c.goTime ? (performance.now() - c.goTime) / 1000 : 0;
    }

    /** Scene configuration for a distance race (gates + record ghost). */
    raceSceneConfig(c) {
        return {
            start: 0,
            finish: c.distance,
            ghost: c.ghost,
            ghostLabel: c.record ? `RECORD · ${c.record.name} · ${formatRaceTime(c.record.score)}` : null,
            clock: () => this.raceClock(c)
        };
    }

    /** Short message over the 3D: 'toast' (top) or 'big' (center). */
    flashMessage(text, { color = '#ffffff', size = 'toast', ms = 1800, sub = '' } = {}) {
        const el = document.createElement('div');
        const big = size === 'big';
        el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);z-index:10040;pointer-events:none;' +
            `top:${big ? '34vh' : '15vh'};text-align:center;font-family:sans-serif;color:${color};` +
            'text-shadow:0 2px 18px rgba(0,0,0,.65);transition:opacity .35s ease;opacity:1;white-space:nowrap';
        el.innerHTML = `<div style="font-weight:900;font-size:${big ? '12vh' : '4.2vh'};line-height:1">${escapeHtml(text)}</div>` +
            (sub ? `<div style="font-weight:700;font-size:${big ? '4.2vh' : '2.4vh'};margin-top:1.2vh;color:#fff">${escapeHtml(sub)}</div>` : '');
        document.body.appendChild(el);
        setTimeout(() => { el.style.opacity = '0'; }, ms);
        setTimeout(() => el.remove(), ms + 400);
    }

    async launchTimeTrial() {
        const riderName = this.getRiderName();
        if (!riderName) return;
        // Optional here (power-based score), but recorded with the result when given.
        const weight = this.getRiderWeight({ required: false });
        if (weight === null) return;
        if (weight) {
            try {
                await window.go.main.App.SetEventRiderWeight(weight);
            } catch (e) {
                alert(`Unable to set the weight: ${e}`);
                return;
            }
        }

        if (!await this.prepareChallengeEnvironment('timeTrial')) return;

        const ftp = this.ui?.ftp || 200;

        await this.startChallenge({
            type: 'timeTrial',
            riderName,
            duration: 60,
            started: false,
            threshold: 5,
            ftp,
            score: 0,
            currentZone: 'z1',
            currentMultiplier: 1.0,
            consecutiveTimeInZ5Plus: 0,
            isZ5PlusActive: false,
            powerHistory: [],
            consistencyHistory: [],
            consistencyFactor: 1.0,
            consistencyTimer: 0,
            zoneCounts: { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0, z6: 0 }
        });
    }

    async startChallenge(config) {
        try {
            this.closeModal(this.els.eventHubModal);
            this.closeModal(this.els.resultModal);
            this.closeModal(this.els.leaderboardModal);

            this.activeChallenge = {
                ...config,
                startTime: 0,
                finalized: false,
                finishedAt: 0,
                initialDistance: this.lastTelemetry.total_dist || 0,
                _waitingForTelemetry: true
            };

            this.updateChallengeChrome();
            this.openChallengeOverlay(config.type);
            if (config.kind === 'race') {
                // Distance only accumulates once the session starts, at GO: a standing start
                // for everyone, whatever they pedal during the countdown.
                const challenge = this.activeChallenge;
                this.startAnimationLoop();
                if (!await this.runCountdown(challenge)) return;
                await this.startBackendSession();
                challenge.phase = 'racing';
                challenge.started = true;
                challenge.goTime = performance.now();
                challenge._waitingForTelemetry = false;
                if (this.hud) this.hud.setStatus('GO!');
            } else {
                await this.startBackendSession();
                this.startAnimationLoop();
            }
        } catch (error) {
            console.error(error);
            alert(`Unable to start challenge: ${error}`);
            this.cleanupChallengeState();
        }
    }

    /** 3-2-1-GO overlay. Resolves false if the challenge was aborted meanwhile. */
    async runCountdown(challenge) {
        const el = document.createElement('div');
        el.className = 'race-countdown';
        el.style.cssText = 'position:fixed;inset:0;z-index:10050;display:flex;align-items:center;justify-content:center;' +
            'pointer-events:none;font:900 22vh/1 sans-serif;color:#fff;text-shadow:0 0 40px rgba(56,189,248,.8)';
        document.body.appendChild(el);
        const alive = () => this.activeChallenge === challenge && !challenge.finalized;
        try {
            for (const label of ['3', '2', '1']) {
                if (!alive()) return false;
                el.textContent = label;
                if (this.hud) this.hud.setStatus(`Get ready: ${label}`);
                await new Promise((r) => setTimeout(r, 1000));
            }
            if (!alive()) return false;
            el.textContent = 'GO!';
            el.style.color = '#22c55e';
            setTimeout(() => el.remove(), 700);
            return true;
        } finally {
            if (!alive()) el.remove();
        }
    }

    openChallengeOverlay(mode) {
        if (this.hud) {
            this.hud.open(mode);
            // Transparent HUD laid out around the 3D rider (see .hud-over-3d).
            this.hud.el.hud.classList.add('hud-over-3d');
        }
        if (this.ui) {
            this.ui.els.header.style.display = 'none';
            this.ui.els.mapContainer.style.display = ''; // hosts the 3D scene behind the HUD
            this.ui.els.hudSidebar.style.display = 'none';
            if (this.ui.els.footer) this.ui.els.footer.style.display = 'none';
        }
        const c = this.activeChallenge;
        window.setEventScene?.(true, c && c.kind === 'race' ? this.raceSceneConfig(c) : null);
    }

    closeChallengeOverlay() {
        if (this.hud) {
            this.hud.el.hud.classList.remove('hud-over-3d');
            this.hud.close();
        }
        window.setEventScene?.(false);
    }

    restoreMainLayout() {
        if (this.ui) {
            this.ui.els.header.style.display = '';
            this.ui.els.mapContainer.style.display = '';
            this.ui.els.hudSidebar.style.display = '';
            if (this.ui.els.footer) this.ui.els.footer.style.display = '';
        }
    }

    updateChallengeChrome() {
        if (!this.activeChallenge) return;

        const meta = this.modeMeta[this.activeChallenge.type];
        const cleanRiderName = this.activeChallenge.riderName.replace(/ \[[MFG]\]$/, '');

        if (this.hud) {
            this.hud.setMode(meta.fullTitle);
            this.hud.setRiderName(cleanRiderName);
            this.hud.setStatus('Waiting for first pedal stroke');
            this.hud.setTimer(`${this.activeChallenge.duration.toFixed(1)}s`, 'TIME REMAINING');

            if (this.activeChallenge.kind === 'race') {
                this.hud.setStatus('Get ready');
                this.hud.setTimer(formatRaceTime(0), 'TIME');
                this.hud.setPrimaryMetric(`${this.activeChallenge.distance}`, 'M TO GO');
                this.hud.setSecondaryMetric('SPEED', '0.0 km/h');
                if (this.activeChallenge.ghost) {
                    this.hud.setTertiaryMetric('VS RECORD', '—');
                } else {
                    this.hud.setTertiaryMetric('POWER', '0 W');
                }
            } else if (this.activeChallenge.type === 'timeTrial') {
                this.hud.setPrimaryMetric('0', 'PTS');
                this.hud.setSecondaryMetric('LIVE POWER', '0 W');
                this.hud.setTertiaryMetric('MULTIPLIER', '1.0x');
                this.hud.setZone('Z1', 1);
                this.hud.setStatus('Power Accumulation Mode');
            } else {
                this.hud.setPrimaryMetric('0', 'W');
                this.hud.setSecondaryMetric('PEAK POWER', '0 W');
                this.hud.setTertiaryMetric('CADENCE', '0 rpm');
            }
        }

        this.updateInlineLeaderboard();
    }

    startAnimationLoop() {
        this.stopAnimationLoop();
        this.lastFrameTime = performance.now();
        this.animationFrame = requestAnimationFrame((now) => this.tick(now));
    }

    stopAnimationLoop() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
    }

    tick(now) {
        if (!this.activeChallenge) return;

        const rawDt = (now - this.lastFrameTime) / 1000;
        const dt = Math.min(0.05, Math.max(0.001, rawDt));
        this.lastFrameTime = now;

        if (this.activeChallenge.kind === 'race') {
            this.tickRace(now, rawDt);
            if (!this.activeChallenge) return;
            this.leaderboardUpdateAccumulator += rawDt;
            if (this.leaderboardUpdateAccumulator >= 0.4) {
                this.updateInlineLeaderboard();
                this.leaderboardUpdateAccumulator = 0;
            }
            this.animationFrame = requestAnimationFrame((frameTime) => this.tick(frameTime));
            return;
        }

        if (!this.activeChallenge.started && !this.activeChallenge._waitingForTelemetry && this.lastTelemetry.power > this.activeChallenge.threshold) {
            this.activeChallenge.started = true;
            this.activeChallenge.startTime = now;
            if (this.hud) this.hud.setStatus('Challenge live');
        }

        if (this.activeChallenge.started && !this.activeChallenge.finalized) {
            const elapsed = (now - this.activeChallenge.startTime) / 1000;
            const remaining = Math.max(0, this.activeChallenge.duration - elapsed);
            if (this.hud) this.hud.setTimer(`${remaining.toFixed(1)}s`);

            let activeDt = rawDt;
            if (elapsed < activeDt) {
                activeDt = Math.max(0, elapsed);
            }
            if (elapsed > this.activeChallenge.duration) {
                const overshoot = elapsed - this.activeChallenge.duration;
                activeDt = Math.max(0, activeDt - overshoot);
            }

            if (this.activeChallenge.type === 'timeTrial') {
                this.updateTimeTrial(activeDt);
            }

            if (remaining <= 0) {
                this.finishActiveChallenge(true, 'Challenge complete');
                return;
            }
        } else if (!this.activeChallenge.started) {
            if (this.hud) this.hud.setTimer(`${this.activeChallenge.duration.toFixed(1)}s`);
        }

        this.syncDisplayedTelemetry();
        this.drawCurrentChallenge();

        this.leaderboardUpdateAccumulator += rawDt;
        if (this.leaderboardUpdateAccumulator >= 0.4) {
            this.updateInlineLeaderboard();
            this.leaderboardUpdateAccumulator = 0;
        }

        this.animationFrame = requestAnimationFrame((frameTime) => this.tick(frameTime));
    }

    tickRace(now, rawDt) {
        const c = this.activeChallenge;
        if (c.phase !== 'racing' || c.finalized) return;

        // Display clock: wall time since GO (the result uses the backend clock).
        const elapsed = (now - c.goTime) / 1000;
        const speed = this.lastTelemetry.speed || 0;
        const remaining = Math.max(0, c.distance - c.progress);
        if (this.hud) {
            this.hud.setTimer(formatRaceTime(elapsed), 'TIME');
            this.hud.setPrimaryMetric(remaining.toFixed(0), 'M TO GO');
            this.hud.setSecondaryMetric('SPEED', `${speed.toFixed(1)} km/h`);
            const power = Math.round(this.lastTelemetry.power || 0);
            const pct = Math.round((c.progress / c.distance) * 100);
            if (c.ghost) {
                this.hud.setTertiaryMetric('VS RECORD', c.gap === null ? '—' : formatGap(c.gap));
                this.hud.el.tertiaryValue.style.color = c.gap === null ? '' : (c.gap < 0 ? '#22c55e' : '#ef4444');
                this.hud.setStatus(`${pct}% · ${power} W`);
            } else {
                this.hud.setTertiaryMetric('POWER', `${power} W`);
                this.hud.setStatus(`${pct}%`);
            }
        }

        // Not finishing: too slow for too long, or over the time limit.
        c.idleTime = elapsed > 5 && speed < RACE_IDLE_SPEED ? c.idleTime + rawDt : 0;
        if (c.idleTime > RACE_IDLE_LIMIT) {
            this.finishRaceDNF('Stopped before the finish line');
        } else if (elapsed > c.duration) {
            this.finishRaceDNF(`Time limit (${c.duration} s) reached`);
        }
    }

    handleRaceTelemetry(data) {
        const c = this.activeChallenge;
        if (c.phase !== 'racing' || c.finalized) return;
        const d = Number(data.total_dist), t = Number(data.elapsed);
        if (!Number.isFinite(d) || !Number.isFinite(t) || t <= 0) return;
        const last = c.samples[c.samples.length - 1];
        if (d < last.d || t <= last.t) return; // stale sample from before GO
        c.samples.push({ t, d });
        c.progress = Math.min(c.distance, d);
        if (c.ghost && d > 5 && d < c.distance) this.updateGhostGap(c, d, t);
        if (d >= c.distance) {
            const seconds = interpolateFinish(c.samples, c.distance);
            if (seconds) this.finishRace(seconds);
        }
    }

    /** Gap to the record ghost at the rider's latest sample, announcing lead changes. */
    updateGhostGap(c, d, t) {
        c.gap = c.ghost.gapAt(d, t);
        const ahead = c.gap < 0;
        if (c.ahead === null) {
            c.ahead = ahead; // initial state: no announcement
        } else if (ahead !== c.ahead && Math.abs(c.gap) > OVERTAKE_HYSTERESIS) {
            c.ahead = ahead;
            if (ahead) this.flashMessage('You passed the record!', { color: '#22c55e' });
            else this.flashMessage('The record is ahead', { color: '#f97316' });
        }
    }

    async finishRace(seconds) {
        const c = this.activeChallenge;
        if (!c || c.finalized) return;
        c.finalized = true;
        c.finishTime = seconds;
        this.stopAnimationLoop();

        const ghost = JSON.stringify(buildGhost(c.samples, c.distance));
        let saveError = null;
        try {
            // Saved before the session is discarded: the FIT data lives in the session.
            await window.go.main.App.SaveRaceResult(c.riderName, c.type, seconds, ghost);
        } catch (e) {
            saveError = e;
            console.error('Failed to save race result:', e);
        }

        await this.fetchLeaderboardsFromDB();
        const placing = await this.describePlacing(c, seconds);

        // Finish banner over the 3D while the rider rolls through the line.
        const vsRecord = c.record ? seconds - c.record.score : null;
        const sub = placing.record ? 'NEW RECORD!'
            : (vsRecord !== null ? `${formatGap(vsRecord)} vs record` : '');
        this.flashMessage(formatRaceTime(seconds), {
            size: 'big', ms: FINISH_BANNER_MS - 300, sub,
            color: placing.record ? '#facc15' : '#ffffff'
        });
        if (this.hud) this.hud.setStatus('FINISH');
        await new Promise((r) => setTimeout(r, FINISH_BANNER_MS));
        this.closeChallengeOverlay();

        this.showResult(c, {
            title: placing.record ? 'New record!' : 'Finish!',
            value: formatRaceTime(seconds),
            rank: placing.rank,
            description: saveError ? `Could not save the result: ${saveError}` : placing.description,
            podium: placing.podium,
            vsRecord
        });

        await this.stopBackendSession();
        this.cleanupChallengeState();
    }

    async finishRaceDNF(reason) {
        const c = this.activeChallenge;
        if (!c || c.finalized) return;
        c.finalized = true;
        this.stopAnimationLoop();
        this.closeChallengeOverlay();
        this.showResult(c, {
            title: 'Did not finish',
            value: `${c.progress.toFixed(0)} / ${c.distance} m`,
            rank: null,
            description: `${reason}. Results only count when you cross the line.`
        });
        await this.stopBackendSession();
        this.cleanupChallengeState();
    }

    /** Position text for a finished race, from the freshly fetched ranking. */
    async describePlacing(c, seconds) {
        let ranking = [];
        try {
            ranking = await window.go.main.App.GetEventRanking(c.type, c.simulated);
        } catch (e) {
            console.error(e);
        }
        const key = c.riderName.trim().toLowerCase();
        const idx = ranking.findIndex((r) => r.rider_name.trim().toLowerCase() === key);
        const best = idx >= 0 ? ranking[idx].score : seconds;
        const isBest = Math.abs(best - seconds) < 0.005;
        const pos = idx >= 0 ? `#${idx + 1} of ${ranking.length}` : null;
        const simulatedNote = c.simulated ? ' Ridden on the simulator: not part of the official ranking.' : '';
        let description;
        if (!pos) description = 'Result saved.';
        else if (isBest) description = `You are ${pos} in the ranking.`;
        else description = `Your best is still ${formatRaceTime(best)} (${pos}).`;
        return {
            rank: pos ? (c.simulated ? `Simulated ${pos}` : pos) : null,
            record: idx === 0 && isBest && !c.simulated,
            description: description + simulatedNote,
            podium: ranking.slice(0, 3).map((r, i) => ({
                place: i + 1,
                name: r.rider_name.replace(/ \[[MFG]\]$/, ''),
                time: r.score,
                isYou: r.rider_name.trim().toLowerCase() === key
            }))
        };
    }

    showResult(c, { title, value, rank, description, podium = null, vsRecord = null }) {
        this.openEventHub();
        const modal = this.els.resultModal;
        modal.classList.remove('mode-sprint', 'mode-kom', 'mode-tt');
        const modeClassMap = { sprint200: 'mode-sprint', climb400: 'mode-kom', tt1k: 'mode-tt', timeTrial: 'mode-tt' }; // tt1k: legacy records
        modal.classList.add(modeClassMap[c.type] || 'mode-sprint');
        this.els.resultMode.textContent = this.metaFor(c.type).fullTitle;
        this.els.resultTitle.textContent = title;
        this.els.resultValue.textContent = value;
        this.els.resultValue.style.color = '';
        if (this.els.resultRank) {
            this.els.resultRank.textContent = rank || '';
            this.els.resultRank.style.display = rank ? '' : 'none';
        }
        this.els.resultDescription.textContent = description;
        const podiumEl = document.getElementById('challengeResultPodium');
        if (podiumEl) {
            const medals = ['🥇', '🥈', '🥉'];
            podiumEl.innerHTML = podium && podium.length ? `
                ${vsRecord !== null ? `<div class="result-vs-record" style="color:${vsRecord < 0 ? '#22c55e' : '#f97316'}">${formatGap(vsRecord)} vs previous record</div>` : ''}
                ${podium.map((p) => `
                    <div class="result-podium-row${p.isYou ? ' is-you' : ''}">
                        <span>${medals[p.place - 1]}</span>
                        <strong>${escapeHtml(p.name)}</strong>
                        <span>${formatRaceTime(p.time)}</span>
                    </div>`).join('')}` : '';
            podiumEl.style.display = podium && podium.length ? '' : 'none';
        }
        this.openModal(modal);
    }

    updateTimeTrial(dt) {
        const challenge = this.activeChallenge;
        const power = this.lastTelemetry.power || 0;

        challenge.powerHistory.push(power);
        if (challenge.powerHistory.length > 180) challenge.powerHistory.shift();

        if (!challenge.started) return;

        if (power <= 0) {
            challenge.consistencyHistory = [];
            challenge.consistencyTimer = 0;
            challenge.consistencyFactor = 1.0;
            challenge.currentMultiplier = 1.0;
            challenge.consecutiveTimeInZ5Plus = 0;
            challenge.isZ5PlusActive = false;
            return;
        }

        const avgPower = challenge.powerHistory.reduce((a, b) => a + b, 0) / challenge.powerHistory.length;
        const pct = challenge.ftp > 0 ? (avgPower / challenge.ftp) * 100 : 0;

        let zone;
        let baseMultiplier;
        if (pct < 55) {
            zone = 'z1';
            baseMultiplier = 1.0;
        } else if (pct < 75) {
            zone = 'z2';
            baseMultiplier = 1.0;
        } else if (pct < 90) {
            zone = 'z3';
            baseMultiplier = 1.5;
        } else if (pct < 105) {
            zone = 'z4';
            baseMultiplier = 2.2;
        } else if (pct < 121) {
            zone = 'z5';
            baseMultiplier = 3.5;
        } else {
            zone = 'z6';
            baseMultiplier = 5.0;
        }

        challenge.currentZone = zone;
        challenge.zoneCounts[zone] = (challenge.zoneCounts[zone] || 0) + dt;

        if (zone === 'z5' || zone === 'z6') {
            challenge.consecutiveTimeInZ5Plus += dt;
        } else {
            challenge.consecutiveTimeInZ5Plus = 0;
            challenge.isZ5PlusActive = false;
        }

        if (challenge.consecutiveTimeInZ5Plus >= 3) {
            challenge.isZ5PlusActive = true;
        }

        const zoneMultiplier = (zone === 'z5' || zone === 'z6') && !challenge.isZ5PlusActive
            ? 2.2
            : baseMultiplier;

        challenge.consistencyHistory.push(power);
        if (challenge.consistencyHistory.length > 600) {
            const excess = challenge.consistencyHistory.length - 600;
            challenge.consistencyHistory.splice(0, excess);
        }

        if (challenge.consistencyHistory.length >= 600) {
            const max = Math.max(...challenge.consistencyHistory);
            const min = Math.min(...challenge.consistencyHistory);
            const mean = challenge.consistencyHistory.reduce((a, b) => a + b, 0) / challenge.consistencyHistory.length;
            const variation = mean > 0 ? ((max - min) / mean) * 100 : 999;

            if (variation < 5) {
                challenge.consistencyTimer += dt;
            } else {
                challenge.consistencyTimer = 0;
                challenge.consistencyFactor = 1.0;
            }

            while (challenge.consistencyTimer >= 10) {
                challenge.consistencyFactor *= 1.2;
                challenge.consistencyTimer -= 10;
            }
        }

        const activeMultiplier = zoneMultiplier * challenge.consistencyFactor;
        challenge.currentMultiplier = activeMultiplier;

        challenge.score += activeMultiplier * dt;

        const zoneNames = {
            z1: 'Z1 - Recovery',
            z2: 'Z2 - Endurance',
            z3: 'Z3 - Tempo',
            z4: 'Z4 - Threshold',
            z5: 'Z5 - VO2Max',
            z6: 'Z6 - Anaerobic'
        };
        if (this.hud) this.hud.setStatus(zoneNames[zone] || 'Z1');
    }

    syncDisplayedTelemetry() {
        if (!this.activeChallenge || !this.hud) return;

        const power = Math.round(this.lastTelemetry.power || 0);

        if (this.activeChallenge.type === 'timeTrial') {
            this.hud.setPrimaryMetric(`${Math.round(this.activeChallenge.score)}`);
            this.hud.setSecondaryMetric('LIVE POWER', `${power} W`);
            this.hud.setTertiaryMetric('MULTIPLIER', `${(this.activeChallenge.currentMultiplier || 1.0).toFixed(2)}x`);

            const shortNames = { z1: 'Z1', z2: 'Z2', z3: 'Z3', z4: 'Z4', z5: 'Z5', z6: 'Z6' };
            const zoneMap = { z1: 1, z2: 2, z3: 3, z4: 4, z5: 5, z6: 6 };
            const currentZone = this.activeChallenge.currentZone || 'z1';
            this.hud.setZone(shortNames[currentZone] || 'Z1', zoneMap[currentZone]);

            if (!this.activeChallenge.started) {
                this.hud.setStatus('Power Accumulation Mode');
            }
        }
    }

    updateTelemetry(data) {
        if (this.activeChallenge?._waitingForTelemetry) {
            this.activeChallenge._waitingForTelemetry = false;
        }

        this.lastTelemetry = data;

        if (!this.activeChallenge || this.activeChallenge.finalized) return;

        if (this.activeChallenge.kind === 'race') {
            this.handleRaceTelemetry(data);
        }
    }

    drawCurrentChallenge() {
        this.backdropCtx?.clearRect(0, 0, window.innerWidth, window.innerHeight);
        this.telemetryCtx?.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }

    clearTelemetryCanvas() {
        this.backdropCtx?.clearRect(0, 0, window.innerWidth, window.innerHeight);
        this.telemetryCtx?.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }

    formatDistance(value, withUnit = true) {
        const meters = Math.max(0, value || 0);
        if (!withUnit) return `${meters.toFixed(0)}`;
        return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${meters.toFixed(0)} m`;
    }

    formatResultValue(type, value) {
        if (this.isRace(type) || this.legacyMeta[type]?.time) return formatRaceTime(value);
        if (type === 'sprint') return `${Math.round(value || 0)} W`;
        if (type === 'kom') return this.formatDistance(value || 0);
        return `${Math.round(value || 0)} pts`;
    }

    /** Sort comparator for a mode: ascending for races (time), descending for points. */
    rankCompare(type) {
        return this.modeMeta[type]?.ascending ? (a, b) => a.value - b.value : (a, b) => b.value - a.value;
    }

    updateInlineLeaderboard() {
        const challenge = this.activeChallenge;
        if (!challenge) return;

        const currentCleanName = challenge.riderName.replace(/ \[[MFG]\]$/, '');
        const genderMatch = challenge.riderName.match(/\[([MFG])\]$/);
        const currentGender = genderMatch ? genderMatch[1] : 'G';
        const compare = this.rankCompare(challenge.type);

        const entries = [...this.leaderboards[challenge.type]]
            .filter(e => currentGender === 'G' || e.gender === currentGender)
            .sort(compare);

        let preview;
        let currentRank = -1;
        if (challenge.kind === 'race') {
            // A running clock cannot be ranked against finished times: show the top 5
            // and the rider's live time below them.
            preview = entries.slice(0, 5);
            const elapsed = challenge.goTime ? (performance.now() - challenge.goTime) / 1000 : 0;
            preview.push({ rider: currentCleanName, isCurrentPlayer: true, value: elapsed, live: true });
        } else {
            const currentRow = { rider: currentCleanName, isCurrentPlayer: true, value: this.getLiveLeaderboardValue() };
            const all = [...entries.slice(0, 5).filter(e => e.rider !== currentCleanName), currentRow].sort(compare);
            currentRank = all.findIndex(e => e.isCurrentPlayer) + 1;
            preview = all.slice(0, 5);
        }
        const rankImproved = this.lastKnownRank > 0 && currentRank > 0 && currentRank < this.lastKnownRank;
        this.lastKnownRank = currentRank;

        const html = `
            <div class="challenge-chip-label">Event Ranking</div>
            ${preview.map((entry, index) => `
                <div class="challenge-inline-entry ${entry.isCurrentPlayer ? 'is-active' : ''}" data-index="${index}">
                    <span>${entry.live ? '▶' : `${index + 1}.`}</span>
                    <strong>${escapeHtml(entry.rider)}</strong>
                    <span>${this.formatResultValue(challenge.type, entry.value)}</span>
                </div>
            `).join('')}
        `;

        if (this.hud) this.hud.showLeaderboard(html);

        if (rankImproved) {
            const activeRow = document.querySelector('.challenge-inline-entry.is-active');
            if (activeRow) {
                activeRow.classList.add('challenge-rank-climb');
                setTimeout(() => activeRow.classList.remove('challenge-rank-climb'), 1000);
            }
        }
    }

    getLiveLeaderboardValue() {
        if (!this.activeChallenge) return 0;
        return this.activeChallenge.score || 0;
    }

    async saveResult(type, rider, value, status) {
        if (!rider || value <= 0) return;

        const match = rider.match(/(.+) \[([MFG])\]$/);
        const cleanName = match ? match[1].trim() : rider;
        const gender = match ? match[2] : this.detectGender(rider);

        this.leaderboards[type].push({
            rider: cleanName,
            rawRider: rider,
            gender,
            value,
            status,
            createdAt: Date.now()
        });
        this.leaderboards[type].sort(this.rankCompare(type));

        if (window.go?.main?.App?.SaveEventResult) {
            try {
                await window.go.main.App.SaveEventResult(rider, type, value, status);
            } catch (e) {
                console.error("Failed to save event result:", e);
            }
        }
    }

    async resetLeaderboard(type) {
        if (confirm(`Are you sure you want to clear the ranking for ${type === 'all' ? 'ALL events' : this.modeMeta[type].title}? This cannot be undone.`)) {
            if (window.go?.main?.App?.ResetEventLeaderboard) {
                await window.go.main.App.ResetEventLeaderboard(type);
                await this.fetchLeaderboardsFromDB();
                this.renderLeaderboardModal();
            }
        }
    }

    renderLeaderboardModal() {
        this.els.leaderboardPanels.innerHTML = Object.entries(this.modeMeta).map(([type, meta]) => {
            let filteredEntries = this.leaderboards[type].filter(e => {
                if (this.leaderboardFilter === 'G') return true;
                return e.gender === this.leaderboardFilter;
            });

            filteredEntries = filteredEntries.sort(this.rankCompare(type)).slice(0, 150);

            const p1 = filteredEntries[0] || null;
            const p2 = filteredEntries[1] || null;
            const p3 = filteredEntries[2] || null;
            const rest = filteredEntries.slice(3);

            const renderPodiumStep = (entry, place, label) => {
                if (!entry) return `
                    <div class="lb-podium-col empty is-${place}">
                        <div class="lb-podium-block"><span class="lb-podium-rank">${label}</span></div>
                    </div>`;

                const avatarSize = place === 'first' ? 76 : 56;
                return `
                    <div class="lb-podium-col is-${place}">
                        <div style="margin-bottom: 8px;">
                            ${this.getAvatarHTML(entry.rider, avatarSize)}
                        </div>
                        <strong class="lb-podium-name" title="${escapeHtml(entry.rider)}">${escapeHtml(entry.rider)}${entry.isSimulated ? ' <small style="color:#00ADD8">(sim)</small>' : ''}</strong>
                        <div class="lb-podium-score">${this.formatResultValue(type, entry.value)}</div>
                        <div class="lb-podium-block">
                            <span class="lb-podium-rank">${label}</span>
                        </div>
                    </div>
                `;
            };

            return `
                <section class="leaderboard-category-card">
                    <div class="lb-cat-header">
                        <h3>${meta.fullTitle}</h3>
                        <button onclick="window.challengeController.resetLeaderboard('${type}')" class="btn-icon-small danger" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; cursor: pointer;" title="Clear Ranking">Reset</button>
                    </div>
                    
                    <div class="leaderboard-podium-kahoot">
                        ${renderPodiumStep(p2, 'second', '2nd')}
                        ${renderPodiumStep(p1, 'first', '1st')}
                        ${renderPodiumStep(p3, 'third', '3rd')}
                    </div>

                    <div class="leaderboard-scroll-list">
                        ${rest.length ? rest.map((entry, index) => `
                            <div class="leaderboard-row">
                                <span class="lb-row-rank">${index + 4}</span>
                                <div>
                                    ${this.getAvatarHTML(entry.rider, 36)}
                                </div>
                                <strong class="lb-row-name">${escapeHtml(entry.rider)}${entry.isSimulated ? ' <small style="color:#00ADD8">(sim)</small>' : ''}</strong>
                                <span class="leaderboard-score" style="font-weight: 800;">${this.formatResultValue(type, entry.value)}</span>
                            </div>
                        `).join('') : '<div style="text-align: center; color: rgba(255,255,255,0.3); font-size: 0.8rem; margin-top: 10px;">No more attempts</div>'}
                    </div>
                </section>
            `;
        }).join('');
    }

    async finishActiveChallenge(success, title) {
        if (!this.activeChallenge || this.activeChallenge.finalized) return;

        this.activeChallenge.finalized = true;
        const challenge = this.activeChallenge;

        let finalValue = this.getLiveLeaderboardValue();
        let displayValue = this.formatResultValue(challenge.type, finalValue);

        let description = 'Result saved to the offline leaderboard.';

        // Started now, awaited before stopBackendSession(): SaveEventResult reads the FIT
        // data from the live session, which DiscardSession wipes.
        const savePromise = this.saveResult(challenge.type, challenge.riderName, finalValue, 'success');
        this.updateInlineLeaderboard();

        this.closeChallengeOverlay();
        this.stopAnimationLoop();

        // Show the result UI FIRST, before stopping the backend session.
        // This prevents the brief flash of the reset main UI (settings screen)
        // that happens when DiscardSession emits status_change → IDLE.

        this.showResult(challenge, { title, value: displayValue, rank: null, description });

        await savePromise;

        // Now stop the backend session safely behind the result overlay
        await this.stopBackendSession();

        this.cleanupChallengeState();
    }

    async abortActiveChallenge({ reopenHub = true } = {}) {
        if (!this.activeChallenge || this.activeChallenge.finalized) return;
        if (this._aborting) return;
        this._aborting = true;

        // Parar imediatamente — sem esperar backend
        this.activeChallenge.finalized = true;
        this.stopAnimationLoop();
        this.closeChallengeOverlay();

        if (reopenHub) {
            this.openEventHub();
        }

        // UI já está limpa e Event Hub reaberto; backend pode terminar em background
        try {
            await this.stopBackendSession();
        } catch (e) {
            console.error('Error during backend session discard:', e);
        }
        this.cleanupChallengeState();
    }

    cleanupChallengeState() {
        if (this.hud?.el?.tertiaryValue) this.hud.el.tertiaryValue.style.color = '';
        this.activeChallenge = null;
        this._aborting = false;
        this.stopAnimationLoop();
        this.closeChallengeOverlay();

        if (window.go?.main?.App?.SetDirectGrade) {
            window.go.main.App.SetDirectGrade(0);
        }
    }

    returnToEventHub() {
        this.closeModal(this.els.resultModal);
        this.openEventHub();
    }

    async openRaceHistoryModal() {
        const modal = document.getElementById('raceHistoryModal');
        if (!modal) return;

        const listEl = document.getElementById('raceHistoryList');
        listEl.innerHTML = '<div style="color: #ccc; text-align: center; padding: 20px;">Loading history...</div>';
        this.openModal(modal);

        const riderName = this.getRiderName();
        if (!riderName) {
            listEl.innerHTML = '<div style="color: #ef4444; text-align: center; padding: 20px;">Please enter your Cyclist Name first.</div>';
            return;
        }

        try {
            const records = await window.go.main.App.GetRaceHistory(riderName);
            if (!records || records.length === 0) {
                listEl.innerHTML = '<div style="color: #ccc; text-align: center; padding: 20px;">No events completed yet.</div>';
                return;
            }

            listEl.innerHTML = records.map(r => {
                const date = new Date(r.created_at).toLocaleString();
                const isExportable = r.duration >= 5 && r.filename;
                const statusHtml = r.duration < 5
                        ? '<span style="color: #ef4444; font-size: 0.8rem; font-weight: 600;">Too short (<5s)</span>'
                        : (!r.filename ? '<span style="color: #ef4444; font-size: 0.8rem; font-weight: 600;">No FIT data</span>' : '');
                
                return `
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                        <label class="race-history-item" style="flex: 1; display: flex; align-items: center; justify-content: space-between; padding: 15px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; cursor: ${isExportable ? 'pointer' : 'default'}; opacity: ${isExportable ? '1' : '0.6'}; transition: background 0.2s;">
                            <div style="display: flex; align-items: center; gap: 15px;">
                                <input type="checkbox" class="export-checkbox" value="${r.id}" ${!isExportable ? 'disabled' : ''} style="width: 18px; height: 18px;">
                                <div>
                                    <div style="font-weight: 700; color: #fff;">${escapeHtml(this.metaFor(r.event_mode).fullTitle)} - ${this.formatResultValue(r.event_mode, r.score)}${r.is_simulated ? ' (simulated)' : ''}</div>
                                    <div style="font-size: 0.8rem; color: #aaa;">${date} &bull; ${r.duration}s</div>
                                </div>
                            </div>
                            <div>${statusHtml}</div>
                        </label>
                        <button class="btn-delete-event" data-id="${r.id}" title="Delete Record" style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: #ef4444; border-radius: 12px; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        </button>
                    </div>
                `;
            }).join('');

            // Attach delete listeners
            document.querySelectorAll('.btn-delete-event').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    const id = parseInt(btn.getAttribute('data-id'));
                    if (confirm("Are you sure you want to delete this record? This will NOT delete the associated .fit file from your disk, but it will remove it from this list.")) {
                        try {
                            await window.go.main.App.DeleteEventRecord(id);
                            this.openRaceHistoryModal(); // Refresh
                        } catch (err) {
                            alert("Failed to delete: " + err);
                        }
                    }
                });
            });

            // Attach download button handler
            const btnDownload = document.getElementById('btnDownloadFit');
            const newBtn = btnDownload.cloneNode(true);
            btnDownload.parentNode.replaceChild(newBtn, btnDownload);
            
            newBtn.addEventListener('click', async () => {
                const checkboxes = document.querySelectorAll('.export-checkbox:checked');
                const selectedIds = Array.from(checkboxes).map(cb => parseInt(cb.value));

                if (selectedIds.length === 0) {
                    alert("Please select at least one event to download.");
                    return;
                }

                newBtn.disabled = true;
                const statusDiv = document.getElementById('exportStatus');
                statusDiv.style.display = 'flex';
                statusDiv.innerHTML = '<span class="cyclist-spinner">💾</span> Exporting...';

                try {
                    const result = await window.go.main.App.DownloadEventRecords(selectedIds);
                    if (result === "Cancelled") {
                        statusDiv.style.display = 'none';
                    } else {
                        statusDiv.innerHTML = `<span style="color: #22c55e;">${result}</span>`;
                        setTimeout(() => statusDiv.style.display = 'none', 3000);
                    }
                } catch (err) {
                    alert("Download Failed: " + err);
                    statusDiv.style.display = 'none';
                } finally {
                    newBtn.disabled = false;
                }
            });

        } catch (e) {
            listEl.innerHTML = `<div style="color: #ef4444; text-align: center; padding: 20px;">Failed to load history: ${e}</div>`;
        }
    }
}