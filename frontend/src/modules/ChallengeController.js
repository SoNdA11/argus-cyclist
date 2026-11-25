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
import { formatClock, zoneForPct } from './EventBroadcastHud.js';

const FAIR_MODE_KEY = 'argus.fairMode';
const OVERTAKE_HYSTERESIS = 0.15; // s of gap before announcing a change of lead
const FINISH_BANNER_MS = 2200;     // finish banner over the 3D before the result screen
const RESULT_AUTO_NEXT_S = 20;     // result screen hands over to the next athlete after this
const TOWER_ROWS = 7;              // rows of the live classification tower
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

// Event hub (pt-BR, fair visitors): label of the LARGAR button and the tip per challenge.
// `live` is the tag of the live graphics and the result screen, `countdown` the line under 3-2-1.
const HUB_MODE_TEXT = {
    sprint200: {
        name: 'SPRINT 200 M', live: 'SPRINT 200 M',
        tip: 'O ghost do recorde larga ao seu lado. Bata o tempo dele até a chegada.',
        countdown: 'PREPARE-SE · O GHOST LARGA JUNTO'
    },
    climb400: {
        name: 'SUBIDA 400 M', live: 'SUBIDA 400 M',
        tip: 'A resistência do rolo segue a ladeira e o seu peso conta. O ghost do recorde sobe junto.',
        countdown: 'A LADEIRA COMEÇA EM 3% · SEU PESO CONTA'
    },
    timeTrial: {
        name: 'DESAFIO DE ZONAS', live: 'DESAFIO DE ZONAS · 60 S',
        tip: 'Quanto mais alta a zona de potência, mais pontos por segundo. Segure a Z5 por 3 s para o bônus máximo.',
        countdown: 'QUANTO MAIS ALTA A ZONA, MAIS PONTOS POR SEGUNDO'
    }
};
const CATEGORY_TEXT = { F: 'Feminino', M: 'Masculino' };
const CATEGORY_TITLE = { G: 'GERAL', F: 'FEMININO', M: 'MASCULINO' };

/** Splits "Ana [F]" into the display name and the category letter. */
function parseRiderName(raw) {
    const m = String(raw || '').match(/^(.*) \[([MFG])\]$/);
    return m ? { name: m[1].trim(), gender: m[2] } : { name: String(raw || '').trim(), gender: null };
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
        this.selectedMode = 'sprint200'; // highlighted row of the hub's start list
        this.inEventMode = false;        // between entering the hub and leaving it with ✕
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
            this.setEventModeActive(false);
            window.setEventScene?.(false);

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

        // Result screen: same athlete again, next athlete (clean start list) or the ranking.
        document.getElementById('btnChallengeResultRetry')?.addEventListener('click', () => this.retryLastChallenge());
        document.getElementById('btnChallengeResultClose')?.addEventListener('click', () => this.nextAthlete());
        document.getElementById('btnChallengeResultLeaderboard')?.addEventListener('click', () => {
            this.closeModal(this.els.resultModal);
            this.openLeaderboard();
        });

        // Ranking: category pills and the operator's per-challenge reset.
        document.querySelectorAll('#eventLeaderboardModal .lb-filter-btn').forEach((btn) => {
            btn.addEventListener('click', () => this.setLeaderboardFilter(btn.dataset.filter));
        });
        this.els.leaderboardPanels?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-reset]');
            if (btn) this.resetLeaderboard(btn.dataset.reset);
        });

        // Start list: a click selects a challenge, a double click (or LARGAR / Enter) starts it.
        document.querySelectorAll('#eventHubPage .ev-start-row').forEach((row) => {
            row.addEventListener('click', () => this.selectHubMode(row.dataset.mode));
            row.addEventListener('dblclick', () => this.launchSelectedMode());
        });
        document.getElementById('btnEventStart')?.addEventListener('click', () => this.launchSelectedMode());
        document.addEventListener('keydown', (e) => this.handleHubKey(e));
        ['eventRiderName', 'eventRiderWeight'].forEach((id) => {
            document.getElementById(id)?.addEventListener('input', (e) => {
                e.target.classList.remove('ev-invalid');
                this.showHubMessage('');
            });
        });

        document.getElementById('btnFairMode')?.addEventListener('click', () => this.setFairMode(!this.fairMode));
        document.getElementById('lbIncludeSimulated')?.addEventListener('change', async (e) => {
            this.includeSimulated = e.target.checked;
            await this.fetchLeaderboardsFromDB();
            this.renderLeaderboardModal();
        });

        document.getElementById('btnEventAbort')?.addEventListener('click', async () => {
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

        document.querySelectorAll('#eventLeaderboardModal .lb-filter-btn').forEach((btn) => {
            btn.setAttribute('aria-pressed', btn.dataset.filter === filter ? 'true' : 'false');
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
        this.setEventModeActive(true);
        this.openModal(this.els.eventHubModal);
        this.closeModal(this.els.resultModal);
        this.showHubScene();
        this.selectHubMode(this.selectedMode);
        this.renderHubRecords();
        this.fetchLeaderboardsFromDB().then(() => this.renderHubRecords()).catch(() => { });
    }

    /** Full-screen 3D behind the start list, the rider waiting on the start line. */
    showHubScene() {
        if (this.ui) {
            this.ui.els.header.style.display = 'none';
            this.ui.els.mapContainer.style.display = '';
            this.ui.els.hudSidebar.style.display = 'none';
            if (this.ui.els.footer) this.ui.els.footer.style.display = 'none';
        }
        window.setEventScene?.(true);
    }

    // ----- Hub: start list -----

    selectHubMode(mode) {
        if (!this.modeMeta[mode]) return;
        this.selectedMode = mode;
        document.querySelectorAll('#eventHubPage .ev-start-row').forEach((row) => {
            row.setAttribute('aria-checked', row.dataset.mode === mode ? 'true' : 'false');
        });
        const label = document.querySelector('#btnEventStart [data-role="label"]');
        if (label) label.textContent = HUB_MODE_TEXT[mode].name;
        const tip = document.getElementById('eventHubTip');
        if (tip) tip.textContent = HUB_MODE_TEXT[mode].tip;
    }

    launchSelectedMode() {
        if (this.activeChallenge) return;
        if (this.selectedMode === 'timeTrial') this.launchTimeTrial();
        else this.launchRace(this.selectedMode);
    }

    handleHubKey(e) {
        if (!this.els.eventHubModal?.classList.contains('active') || this.activeChallenge) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const tag = e.target?.tagName?.toLowerCase();
        const typing = tag === 'input' || tag === 'select' || tag === 'textarea';
        const order = Object.keys(this.modeMeta);
        if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !typing) {
            const i = order.indexOf(this.selectedMode) + (e.key === 'ArrowDown' ? 1 : -1);
            this.selectHubMode(order[(i + order.length) % order.length]);
            document.querySelector(`#eventHubPage .ev-start-row[data-mode="${this.selectedMode}"]`)?.focus();
            e.preventDefault();
        } else if (e.key === 'Enter' && tag !== 'button' && tag !== 'select') {
            // Buttons handle Enter themselves; in the name/weight fields Enter starts the race.
            e.preventDefault();
            this.launchSelectedMode();
        }
    }

    /** Best official result per mode, shown on its start-list row. */
    renderHubRecords() {
        document.querySelectorAll('#eventHubPage .ev-start-row').forEach((row) => {
            const mode = row.dataset.mode, cell = row.querySelector('[data-role="record"]');
            if (!cell || !this.modeMeta[mode]) return;
            const best = (this.leaderboards[mode] || []).filter((e) => !e.isSimulated).sort(this.rankCompare(mode))[0];
            cell.classList.toggle('is-empty', !best);
            cell.innerHTML = best
                ? `<strong>${escapeHtml(this.formatResultValue(mode, best.value))}</strong><span>${escapeHtml(best.rider)}${CATEGORY_TEXT[best.gender] ? ' · ' + CATEGORY_TEXT[best.gender] : ''}</span>`
                : '<strong>Seja o primeiro</strong><span>Sem recorde ainda</span>';
        });
    }

    /** Inline message under the athlete fields (falls back to an alert outside the hub). */
    showHubMessage(text, fieldId = null) {
        const el = document.getElementById('eventHubMessage');
        const hubOpen = this.els.eventHubModal?.classList.contains('active');
        if (fieldId) {
            const field = document.getElementById(fieldId);
            field?.classList.add('ev-invalid');
            if (hubOpen) field?.focus();
        }
        if (el && hubOpen) el.textContent = text;
        else if (text) alert(text);
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
        // While the start list is open the 3D frames the rider in the free area on its right.
        if (el === this.els.eventHubModal) document.body.classList.add('ev-hub-open');
    }

    closeModal(el) {
        if (!el) return;
        el.classList.remove('active');
        el.classList.add('hidden');
        if (el === this.els.eventHubModal) document.body.classList.remove('ev-hub-open');
        if (el === this.els.resultModal) this.stopResultTimer();
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
            btn.querySelector('[data-role="label"]').textContent = `Modo Feira: ${this.fairMode ? 'ligado' : 'desligado'}`;
            btn.classList.toggle('is-on', this.fairMode);
            btn.setAttribute('aria-pressed', this.fairMode ? 'true' : 'false');
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
            this.showHubMessage('Informe o peso do atleta (35 a 150 kg) antes de largar.', 'eventRiderWeight');
            return null;
        }
        return kg;
    }

    getRiderName() {
        const nameInput = this.els.riderInput;
        const genderInput = document.getElementById('eventRiderGender');
        const name = nameInput?.value?.trim();

        if (!name) {
            this.showHubMessage('Digite o nome do atleta antes de largar.', 'eventRiderName');
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
                this.leaderboards[type] = (records || []).map((r) => this.toLeaderboardEntry(r));
            } catch (e) {
                console.error(`Failed to fetch leaderboard for ${type}:`, e);
                this.leaderboards[type] = [];
            }
        }
    }

    /** EventRecord from the backend → ranking entry (name without the category suffix). */
    toLeaderboardEntry(r) {
        const parsed = parseRiderName(r.rider_name);
        return {
            rider: parsed.name,
            rawRider: r.rider_name,
            gender: parsed.gender || this.detectGender(parsed.name),
            value: r.score,
            status: r.status,
            isSimulated: !!r.is_simulated,
            createdAt: new Date(r.created_at).getTime()
        };
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
                    statusEl.textContent = state.trainer_kind === 'virtual' ? 'Simulador ativo' : 'Rolo conectado';
                } else {
                    statusEl.textContent = 'Desconectado';
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
            statusEl.textContent = isConnected ? 'Rolo conectado' : 'Desconectado';
        }
    }

    async prepareChallengeEnvironment(mode) {
        if (this._aborting) {
            console.warn('Cannot start challenge: previous session is still cleaning up.');
            return false;
        }

        await this.refreshTrainerStatus();

        if (!await this.hasTrainerConnection()) {
            this.showHubMessage('Conecte o rolo ou ative o simulador (canto superior direito) antes de largar.');
            return false;
        }

        if (window.isRecording) {
            this.showHubMessage('Termine a sessão em andamento antes de largar um desafio.');
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
        let profile = null;
        try {
            await window.go.main.App.SetEventRiderWeight(weight);
            await window.go.main.App.SetEventCourse(mode);
            const state = await window.go.main.App.GetDeviceConnectionState();
            simulated = state?.trainer_kind === 'virtual';
            // The loaded course's elevation shapes the 3D road (flat sprint, uphill climb) and
            // the climb's profile graphic.
            const route = await window.go.main.App.GetRoutePath();
            profile = (route || []).map((p) => ({ d: p.distance, h: p.elevation, grade: p.grade }));
        } catch (e) {
            this.showHubMessage(`Não foi possível preparar a corrida: ${e}`);
            return;
        }
        const record = await this.loadRecordGhost(mode, simulated);

        await this.startChallenge({
            type: mode,
            kind: 'race',
            riderName,
            weight,
            simulated,
            profile,
            distance: meta.distance,
            duration: meta.maxDuration,
            phase: 'countdown',
            samples: [{ t: 0, d: 0 }],
            progress: 0,
            lastSampleAt: 0,
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
            profile: c.profile,
            ghost: c.ghost,
            ghostLabel: c.record ? `RECORDE · ${c.record.name} · ${formatRaceTime(c.record.score)}` : null,
            clock: () => this.raceClock(c)
        };
    }

    /** Short message over the 3D: 'toast' (top) or 'big' (center). */
    flashMessage(text, { color = '#ffffff', size = 'toast', ms = 1800, sub = '' } = {}) {
        const el = document.createElement('div');
        const big = size === 'big';
        el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);z-index:10040;pointer-events:none;' +
            `top:${big ? '34vh' : '22vh'};text-align:center;font-family:var(--ev-font-display);letter-spacing:2px;color:${color};` +
            'text-shadow:0 2px 18px rgba(0,0,0,.65);transition:opacity .35s ease;opacity:1;white-space:nowrap';
        el.innerHTML = `<div style="font-weight:800;font-size:${big ? '12vh' : '5vh'};line-height:1">${escapeHtml(text)}</div>` +
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
                this.showHubMessage(`Não foi possível registrar o peso: ${e}`);
                return;
            }
        }

        if (!await this.prepareChallengeEnvironment('timeTrial')) return;

        const ftp = this.ui?.ftp || 200;
        let simulated = false;
        try {
            const state = await window.go.main.App.GetDeviceConnectionState();
            simulated = state?.trainer_kind === 'virtual';
        } catch { /* placing then uses the official ranking */ }

        await this.startChallenge({
            type: 'timeTrial',
            kind: 'points',
            riderName,
            weight,
            simulated,
            duration: 60,
            phase: 'countdown',
            started: false,
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
                // Attempt stats for the result screen, counted from GO.
                stats: { powerSum: 0, samples: 0, peakPower: 0, maxSpeed: 0 }
            };

            this.openChallengeOverlay(config.type);
            this.updateInlineLeaderboard();

            // Everyone gets the same 3-2-1-GO. Races: distance only accumulates once the
            // session starts, at GO (a standing start whatever they pedal during the
            // countdown). Zone Challenge: the minute runs from GO.
            const challenge = this.activeChallenge;
            this.startAnimationLoop();
            if (!await this.runCountdown(challenge)) return;
            await this.startBackendSession();
            if (this.activeChallenge !== challenge || challenge.finalized) return;
            challenge.phase = config.kind === 'race' ? 'racing' : 'live';
            challenge.started = true;
            challenge.goTime = performance.now();
            challenge.startTime = challenge.goTime;
        } catch (error) {
            console.error(error);
            this.showHubMessage(`Não foi possível iniciar o desafio: ${error}`);
            this.cleanupChallengeState();
        }
    }

    /** 3-2-1-VAI! over the live graphics. Resolves false if the challenge was aborted meanwhile. */
    async runCountdown(challenge) {
        const alive = () => this.activeChallenge === challenge && !challenge.finalized;
        const text = HUB_MODE_TEXT[challenge.type];
        const sub = challenge.kind === 'race' && !challenge.ghost
            ? 'PREPARE-SE · VOCÊ ABRE O RANKING'
            : text.countdown;
        for (const label of ['3', '2', '1']) {
            if (!alive()) return false;
            this.hud?.showCountdown(label, sub);
            await new Promise((r) => setTimeout(r, 1000));
        }
        if (!alive()) {
            this.hud?.hideCountdown();
            return false;
        }
        this.hud?.showCountdown('VAI!', sub);
        setTimeout(() => { if (this.activeChallenge === challenge) this.hud?.hideCountdown(); }, 700);
        return true;
    }

    /** "Feminino · 62 kg" under the athlete's name. */
    riderInfo(c) {
        const { gender } = parseRiderName(c.riderName);
        return [CATEGORY_TEXT[gender], c.weight ? `${Math.round(c.weight)} kg` : ''].filter(Boolean).join(' · ');
    }

    openChallengeOverlay(mode) {
        const c = this.activeChallenge;
        this.hud?.open(mode, {
            title: HUB_MODE_TEXT[mode]?.live || '',
            rider: parseRiderName(c?.riderName).name,
            riderInfo: c ? this.riderInfo(c) : '',
            record: c?.record || null,
            distance: c?.distance || 0,
            profile: c?.profile || null,
            ftp: c?.ftp
        });
        if (this.ui) {
            this.ui.els.header.style.display = 'none';
            this.ui.els.mapContainer.style.display = ''; // hosts the 3D scene behind the HUD
            this.ui.els.hudSidebar.style.display = 'none';
            if (this.ui.els.footer) this.ui.els.footer.style.display = 'none';
        }
        window.setEventScene?.(true, c && c.kind === 'race' ? this.raceSceneConfig(c) : null);
    }

    closeChallengeOverlay() {
        this.hud?.close();
        // Still in event mode (result, back to the start list): keep the event scene, race
        // furniture cleared and the rider stopped. Only leaving event mode hands it back.
        window.setEventScene?.(this.inEventMode);
    }

    /** Event mode session: from entering the hub until leaving it with ✕. */
    setEventModeActive(on) {
        this.inEventMode = !!on;
        document.body.classList.toggle('ev-event-mode', this.inEventMode);
        if (!on) return;
        // The settings panel opens on its own at startup; it has no place under the event UI.
        const settings = document.getElementById('settingsModal');
        if (settings?.classList.contains('active')) {
            settings.classList.remove('active');
            document.querySelector('header')?.classList.remove('header-dimmed');
        }
    }

    restoreMainLayout() {
        if (this.ui) {
            this.ui.els.header.style.display = '';
            this.ui.els.mapContainer.style.display = '';
            this.ui.els.hudSidebar.style.display = '';
            if (this.ui.els.footer) this.ui.els.footer.style.display = '';
        }
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

        if (this.activeChallenge.started && !this.activeChallenge.finalized) {
            const elapsed = (now - this.activeChallenge.startTime) / 1000;
            const remaining = Math.max(0, this.activeChallenge.duration - elapsed);
            this.hud?.setClock(remaining >= 59.5 ? '1:00' : `0:${String(Math.ceil(remaining)).padStart(2, '0')}`);

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
                this.finishActiveChallenge();
                return;
            }
        }

        this.syncDisplayedTelemetry();

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
        if (this.hud) {
            this.hud.setClock(formatClock(elapsed));
            const d = this.displayDistance(c, now);
            const ghostD = c.ghost ? c.ghost.distanceAt(elapsed) : null;
            if (c.type === 'climb400') this.hud.setClimb(d, ghostD, this.lastTelemetry.grade);
            else this.hud.setTrack(d, ghostD);
            this.hud.setGap(c.ghost ? c.gap : null);
            this.syncRaceMetrics(c);
        }

        // Not finishing: too slow for too long, or over the time limit.
        c.idleTime = elapsed > 5 && speed < RACE_IDLE_SPEED ? c.idleTime + rawDt : 0;
        if (c.idleTime > RACE_IDLE_LIMIT) {
            this.finishRaceDNF('Parou antes da linha de chegada');
        } else if (elapsed > c.duration) {
            this.finishRaceDNF(`Tempo limite de ${c.duration} s esgotado`);
        }
    }

    /**
     * Rider distance for the graphics: the last telemetry sample carried forward at the
     * current speed (up to 1 s), so the marker glides between samples instead of jumping.
     */
    displayDistance(c, now) {
        if (!c.lastSampleAt) return c.progress;
        const ahead = Math.min(1, (now - c.lastSampleAt) / 1000) * (this.lastTelemetry.speed || 0) / 3.6;
        return Math.min(c.distance, c.progress + ahead);
    }

    /** Power, cadence, speed and W/kg strip of a race. */
    syncRaceMetrics(c) {
        const power = Math.round(this.lastTelemetry.power || 0);
        this.hud.setMetrics({
            power,
            cadence: Math.round(this.lastTelemetry.cadence || 0),
            speed: (this.lastTelemetry.speed || 0).toFixed(1),
            wkg: c.weight ? (power / c.weight).toFixed(1) : '—'
        });
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
        c.lastSampleAt = performance.now();
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
            if (ahead) this.flashMessage('VOCÊ PASSOU O RECORDE!', { color: '#5ad66a' });
            else this.flashMessage('O RECORDE ESTÁ À FRENTE', { color: '#ff6b6f' });
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
        this.hud?.setClock(formatClock(seconds));
        if (c.type === 'climb400') this.hud?.setClimb(c.distance, null, this.lastTelemetry.grade);
        else this.hud?.setTrack(c.distance, null);
        this.updateInlineLeaderboard();
        this.hud?.showFinish({
            label: 'CHEGADA',
            value: formatRaceTime(seconds),
            note: this.finishNote(placing, vsRecord),
            tone: placing.record ? 'record' : (vsRecord !== null && vsRecord > 0 ? 'behind' : 'even')
        });
        await new Promise((r) => setTimeout(r, FINISH_BANNER_MS));
        this.closeChallengeOverlay();

        this.showResult(c, {
            kicker: 'TEMPO FINAL',
            value: formatClock(seconds),
            unit: seconds < 60 ? 's' : '',
            placing,
            delta: vsRecord,
            description: saveError ? `Não foi possível salvar o resultado: ${saveError}` : this.recordText(c, placing, vsRecord),
            stats: this.attemptStats(c)
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
            kicker: 'NÃO COMPLETOU',
            value: c.progress.toFixed(0),
            unit: `/ ${c.distance} m`,
            placing: null,
            delta: null,
            description: `${reason}. O tempo só vale cruzando a linha de chegada.`,
            stats: this.attemptStats(c)
        });
        await this.stopBackendSession();
        this.cleanupChallengeState();
    }

    /** "NOVO RECORDE · 1º LUGAR" / "+0.76 s DO RECORDE · 3º LUGAR" under the finish banner. */
    finishNote(placing, vsRecord) {
        if (placing.record) return 'NOVO RECORDE · 1º LUGAR';
        const pos = !placing.position ? '' : `${placing.isBest ? '' : 'SUA MELHOR: '}${placing.position}º LUGAR`;
        const gap = vsRecord !== null ? `${formatGap(vsRecord)} DO RECORDE` : '';
        return [gap, pos].filter(Boolean).join(' · ');
    }

    /** Line next to the result badge, about the previous record. */
    recordText(c, placing, delta) {
        const sim = c.simulated ? ' Feito no simulador: fica fora do ranking oficial.' : '';
        const unit = (v) => this.formatResultValue(c.type, v);
        if (!c.record) return `Primeira marca desta prova.${sim}`;
        if (placing?.record) return `sobre o recorde anterior de ${c.record.name} (${unit(c.record.score)}).${sim}`;
        if (placing && !placing.isBest) return `Sua melhor marca continua ${unit(placing.best)}.${sim}`;
        return `do recorde de ${c.record.name} (${unit(c.record.score)}).${sim}`;
    }

    /**
     * Where a finished attempt landed, from the freshly fetched ranking of its mode
     * (simulated attempts rank among simulated ones, so testing still shows a position).
     */
    async describePlacing(c, value) {
        let ranking = [];
        try {
            ranking = await window.go.main.App.GetEventRanking(c.type, c.simulated);
        } catch (e) {
            console.error(e);
        }
        const entries = (ranking || []).map((r) => this.toLeaderboardEntry(r));
        const key = c.riderName.trim().toLowerCase();
        const idx = entries.findIndex((e) => e.rawRider.trim().toLowerCase() === key);
        const best = idx >= 0 ? entries[idx].value : value;
        const isBest = Math.abs(best - value) < 0.005;
        return {
            position: idx >= 0 ? idx + 1 : null,
            total: entries.length,
            best,
            isBest,
            record: idx === 0 && isBest && !c.simulated,
            entries
        };
    }

    /** Stats grid of the result screen, from what the rider produced since GO. */
    attemptStats(c) {
        const s = c.stats;
        const avg = s.samples ? s.powerSum / s.samples : 0;
        const stat = (label, value, unit = '') => ({ label, value, unit });
        if (c.type === 'timeTrial') {
            const z4plus = ['z4', 'z5', 'z6'].reduce((sum, z) => sum + (c.zoneCounts?.[z] || 0), 0);
            const top = ['z6', 'z5', 'z4', 'z3', 'z2', 'z1'].find((z) => (c.zoneCounts?.[z] || 0) >= 1);
            return [
                stat('POT. MÉDIA', Math.round(avg), 'W'),
                stat('PICO', Math.round(s.peakPower), 'W'),
                stat('TEMPO Z4+', Math.round(z4plus), 's'),
                stat('ZONA MÁX.', top ? top.toUpperCase() : '—')
            ];
        }
        return [
            stat('POT. MÉDIA', Math.round(avg), 'W'),
            stat('PICO', Math.round(s.peakPower), 'W'),
            stat('W/KG MÉDIO', c.weight ? (avg / c.weight).toFixed(1) : '—'),
            stat('VEL. MÁX.', s.maxSpeed.toFixed(1), 'km/h')
        ];
    }

    /**
     * Result screen over the blurred live scene.
     * r: { kicker, value, unit, placing (describePlacing() or null), delta (vs the previous
     *      record, in the mode's unit; negative = better for times), description, stats }
     */
    showResult(c, { kicker, value, unit = '', placing = null, delta = null, description = '', stats = [] }) {
        this.lastAttempt = { type: c.type };
        this.closeModal(this.els.eventHubModal);
        this.showHubScene();

        const { name, gender } = parseRiderName(c.riderName);
        const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
        set('challengeResultMode', HUB_MODE_TEXT[c.type]?.live || this.metaFor(c.type).title);
        set('challengeResultRider', name.toUpperCase());
        set('challengeResultRiderInfo', this.riderInfo(c));
        document.getElementById('challengeResultRiderInfo')?.classList.toggle('hidden', !this.riderInfo(c));
        set('challengeResultTitle', kicker);

        const valueEl = document.getElementById('challengeResultValue');
        if (valueEl) valueEl.innerHTML = `${escapeHtml(value)}${unit ? `<small> ${escapeHtml(unit)}</small>` : ''}`;

        // Badge: new record, position, or simulated / not ranked.
        const badge = document.getElementById('challengeResultRank');
        if (badge) {
            let text = '', tone = 'pos';
            if (placing?.record) { text = 'NOVO RECORDE'; tone = 'record'; }
            else if (placing?.position && placing.isBest) text = `${placing.position}º LUGAR`;
            else if (placing?.position) text = `MELHOR: ${placing.position}º LUGAR`;
            if (c.simulated && text) text += ' · SIMULADOR';
            badge.textContent = text;
            badge.dataset.tone = tone;
            badge.classList.toggle('hidden', !text);
        }
        const deltaEl = document.getElementById('challengeResultDelta');
        if (deltaEl) {
            const show = delta !== null && placing;
            const better = this.modeMeta[c.type]?.ascending ? delta < 0 : delta > 0;
            deltaEl.textContent = !show ? '' : this.isRace(c.type)
                ? formatGap(delta)
                : `${delta > 0 ? '+' : '−'}${Math.abs(Math.round(delta))} pts`;
            deltaEl.dataset.tone = better ? 'ahead' : 'behind';
            deltaEl.classList.toggle('hidden', !show);
        }
        set('challengeResultDescription', description);

        const statsEl = document.getElementById('challengeResultStats');
        if (statsEl) {
            statsEl.innerHTML = stats.map((s) => `
                <div class="ev-result-stat">
                    <span>${escapeHtml(s.label)}</span>
                    <strong>${escapeHtml(s.value)}${s.unit ? `<small> ${escapeHtml(s.unit)}</small>` : ''}</strong>
                </div>`).join('');
            statsEl.classList.toggle('hidden', !stats.length);
        }

        this.renderResultPodium(c, gender, placing);
        this.openModal(this.els.resultModal);
        this.startResultTimer();
    }

    /** Podium (top 3) and places 4-6 of the rider's category, the rider highlighted. */
    renderResultPodium(c, gender, placing) {
        const cat = gender === 'F' || gender === 'M' ? gender : 'G';
        const title = document.getElementById('challengeResultPodiumTitle');
        if (title) title.textContent = `PÓDIO · ${HUB_MODE_TEXT[c.type]?.name || ''} · ${CATEGORY_TITLE[cat]}`;
        const list = (placing?.entries || this.leaderboards[c.type] || [])
            .filter((e) => cat === 'G' || e.gender === cat)
            .sort(this.rankCompare(c.type));
        const key = c.riderName.trim().toLowerCase();
        const isYou = (e) => e.rawRider?.trim().toLowerCase() === key;
        const fmt = (e) => this.formatResultValue(c.type, e.value).replace(/ s$/, '');

        const podium = document.getElementById('challengeResultPodium');
        if (podium) {
            const step = (e, place) => `
                <div class="ev-podium-col is-${place}${e && isYou(e) ? ' is-you' : ''}">
                    <span class="ev-podium-name">${e ? escapeHtml(e.rider) : '—'}</span>
                    <span class="ev-podium-val">${e ? escapeHtml(fmt(e)) : ''}</span>
                    <div class="ev-podium-block">${place}</div>
                </div>`;
            podium.innerHTML = step(list[1], 2) + step(list[0], 1) + step(list[2], 3);
        }
        const rest = document.getElementById('challengeResultRest');
        if (rest) {
            const rows = list.slice(3, 6);
            rest.innerHTML = rows.map((e, i) => `
                <div class="ev-result-rest-row${isYou(e) ? ' is-you' : ''}">
                    <span>${i + 4}</span><strong>${escapeHtml(e.rider)}</strong><em>${escapeHtml(fmt(e))}</em>
                </div>`).join('');
            rest.classList.toggle('hidden', !rows.length);
        }
    }

    /** "Próximo atleta em 20 s": the result hands over to a clean start list by itself. */
    startResultTimer() {
        this.stopResultTimer();
        const label = document.getElementById('challengeResultAuto');
        let left = RESULT_AUTO_NEXT_S;
        const paint = () => { if (label) label.textContent = `Próximo atleta em ${left} s`; };
        paint();
        this.resultTimer = setInterval(() => {
            left -= 1;
            if (left <= 0) this.nextAthlete();
            else paint();
        }, 1000);
    }

    stopResultTimer() {
        if (this.resultTimer) clearInterval(this.resultTimer);
        this.resultTimer = null;
    }

    /** Result → start list cleared for the next visitor. */
    nextAthlete() {
        this.closeModal(this.els.resultModal);
        const name = document.getElementById('eventRiderName');
        const weight = document.getElementById('eventRiderWeight');
        const gender = document.getElementById('eventRiderGender');
        if (name) name.value = '';
        if (weight) weight.value = '';
        if (gender) gender.value = 'G';
        this.openEventHub();
        this.showHubMessage('');
        name?.focus();
    }

    /** Result → same athlete, same challenge (the start list still holds their data). */
    retryLastChallenge() {
        this.closeModal(this.els.resultModal);
        this.openEventHub();
        if (this.lastAttempt) this.selectHubMode(this.lastAttempt.type);
        this.launchSelectedMode();
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
        challenge.currentPct = pct;
        challenge.baseMultiplier = baseMultiplier;

        challenge.score += activeMultiplier * dt;
    }

    /** Zone Challenge graphics: score, multiplier, zone bar, current zone and metric strip. */
    syncDisplayedTelemetry() {
        const c = this.activeChallenge;
        if (!c || !this.hud || c.type !== 'timeTrial') return;

        const power = Math.round(this.lastTelemetry.power || 0);
        const live = c.started && power > 0;
        const pct = live ? (c.currentPct ?? (c.ftp > 0 ? (power / c.ftp) * 100 : 0)) : 0;
        const zone = live ? zoneForPct(pct) : null;

        this.hud.setScore(c.score, live ? c.currentMultiplier : 1, zone, this.zoneHint(c, zone));
        this.hud.setZone(zone, pct);
        this.hud.setMetrics({
            power,
            pct: Math.round(c.ftp > 0 ? (power / c.ftp) * 100 : 0),
            cadence: Math.round(this.lastTelemetry.cadence || 0)
        });
    }

    zoneHint(c, zone) {
        if (!c.started) return 'Fique na Z4 ou acima para pontuar mais rápido.';
        if (!zone) return 'Pedale para somar pontos.';
        if (zone.id >= 5 && !c.isZ5PlusActive) {
            return `Segure a Z5+ por ${Math.max(0, 3 - c.consecutiveTimeInZ5Plus).toFixed(1)} s para liberar ×${(c.baseMultiplier || zone.mult).toFixed(1)}`;
        }
        if (zone.id >= 5) return 'Bônus máximo da zona liberado. Mantenha!';
        if (c.consistencyFactor > 1) return `Ritmo constante: bônus ×${c.consistencyFactor.toFixed(1)}`;
        return 'Suba de zona para multiplicar os pontos.';
    }

    updateTelemetry(data) {
        this.lastTelemetry = data;

        const c = this.activeChallenge;
        if (!c || c.finalized) return;

        if (c.started) {
            const s = c.stats;
            const power = Number(data.power) || 0;
            s.powerSum += power;
            s.samples += 1;
            s.peakPower = Math.max(s.peakPower, power);
            s.maxSpeed = Math.max(s.maxSpeed, Number(data.speed) || 0);
        }

        if (c.kind === 'race') {
            this.handleRaceTelemetry(data);
        }
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

    /**
     * Live classification tower: the rider's category, with the rider's live row ranked by
     * the projected finish time (races) or the current score (Zone Challenge).
     */
    updateInlineLeaderboard() {
        const c = this.activeChallenge;
        if (!c || !this.hud) return;

        const { name, gender } = parseRiderName(c.riderName);
        const cat = gender === 'F' || gender === 'M' ? gender : 'G';
        const compare = this.rankCompare(c.type);
        // Once finished the attempt is already saved: its live row stands for the rider.
        const self = c.riderName.trim().toLowerCase();
        const rows = (this.leaderboards[c.type] || [])
            .filter((e) => cat === 'G' || e.gender === cat)
            .filter((e) => !c.finalized || e.rawRider?.trim().toLowerCase() !== self)
            .map((e) => ({ name: e.rider, value: e.value, text: this.formatResultValue(c.type, e.value).replace(/ s$/, '') }));

        let live, hint;
        if (c.kind === 'race') {
            const finished = c.finalized && c.finishTime;
            const elapsed = c.goTime ? (performance.now() - c.goTime) / 1000 : 0;
            const v = (this.lastTelemetry.speed || 0) / 3.6;
            const d = this.displayDistance(c, performance.now());
            const proj = finished ? c.finishTime
                : (elapsed > 1 && v > 0.5 ? elapsed + (c.distance - d) / v : null);
            live = {
                name: name.toUpperCase(),
                value: proj ?? Infinity,
                text: proj === null ? '—' : `${finished ? '' : '~'}${formatClock(proj)}`,
                live: true
            };
            hint = finished ? 'FINAL' : 'PROJEÇÃO';
        } else {
            const score = Math.floor(c.score || 0);
            live = { name: `${name.toUpperCase()} (agora)`, value: score, text: String(score), live: true };
            hint = c.finalized ? 'FINAL' : 'AO VIVO';
            rows.forEach((r) => { r.text = String(Math.round(r.value)); });
        }

        const all = [...rows, live].sort(compare);
        const pos = all.indexOf(live);
        let shown = all.slice(0, TOWER_ROWS).map((r, i) => ({ ...r, pos: i + 1 }));
        if (pos >= TOWER_ROWS) {
            shown = [...shown.slice(0, TOWER_ROWS - 1), { ...live, pos: pos + 1 }];
        }
        this.hud.setTower(shown.map((r) => ({ pos: r.pos, name: r.name, value: r.text, live: !!r.live })), hint);
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
        const what = type === 'all' ? 'TODAS as provas' : HUB_MODE_TEXT[type]?.name || type;
        if (!confirm(`Zerar o ranking de ${what}? Isso não pode ser desfeito.`)) return;
        if (window.go?.main?.App?.ResetEventLeaderboard) {
            await window.go.main.App.ResetEventLeaderboard(type);
            await this.fetchLeaderboardsFromDB();
            this.renderLeaderboardModal();
        }
    }

    /** Ranking screen: one tower per challenge, filtered by the selected category. */
    renderLeaderboardModal() {
        const medal = ['gold', 'silver', 'bronze'];
        this.els.leaderboardPanels.innerHTML = Object.entries(this.modeMeta).map(([type, meta]) => {
            const entries = this.leaderboards[type]
                .filter((e) => this.leaderboardFilter === 'G' || e.gender === this.leaderboardFilter)
                .sort(this.rankCompare(type))
                .slice(0, 50);
            const rows = entries.map((e, i) => `
                <div class="ev-rank-row${e.isSimulated ? ' is-sim' : ''}">
                    <span class="ev-rank-pos${i < 3 ? ` is-${medal[i]}` : ''}">${i + 1}</span>
                    <span class="ev-rank-who">
                        <strong>${escapeHtml(e.rider)}${e.isSimulated ? ' · simulador' : ''}</strong>
                        <small>${CATEGORY_TEXT[e.gender] || 'Sem categoria'}</small>
                    </span>
                    <span class="ev-rank-val">${escapeHtml(this.formatResultValue(type, e.value).replace(/ s$/, ''))}</span>
                </div>`).join('');
            return `
                <section class="ev-rank-tower">
                    <div class="ev-rank-head">
                        <span class="ev-tag ev-tag--accent">${escapeHtml(HUB_MODE_TEXT[type]?.live || meta.title)}</span>
                        <span class="ev-rank-sub">${entries.length} ${entries.length === 1 ? 'atleta' : 'atletas'}</span>
                        <button class="ev-rank-reset" type="button" data-reset="${type}" title="Zerar o ranking desta prova (operador)">Zerar</button>
                    </div>
                    <div class="ev-rank-cols"><span>POS</span><span>ATLETA</span><span>${meta.kind === 'points' ? 'PONTOS' : 'TEMPO'}</span></div>
                    <div class="ev-rank-list">
                        ${rows || '<div class="ev-rank-empty">Nenhuma tentativa nesta categoria ainda.</div>'}
                    </div>
                </section>`;
        }).join('');
    }

    async finishActiveChallenge() {
        const c = this.activeChallenge;
        if (!c || c.finalized) return;
        c.finalized = true;
        this.stopAnimationLoop();

        const score = Math.round(c.score || 0);
        // Best before this attempt, for the "vs record" line (same pool as the placing).
        let previous = null;
        try {
            const before = await window.go.main.App.GetEventRanking(c.type, c.simulated);
            if (before?.length) previous = { name: parseRiderName(before[0].rider_name).name, score: before[0].score };
        } catch { /* no previous record */ }
        c.record = previous;

        // Awaited before stopBackendSession(): SaveEventResult reads the FIT data from the
        // live session, which DiscardSession wipes.
        await this.saveResult(c.type, c.riderName, score, 'success');
        await this.fetchLeaderboardsFromDB();
        const placing = await this.describePlacing(c, score);
        const delta = previous ? score - previous.score : null;

        this.hud?.setClock('0:00');
        this.updateInlineLeaderboard();
        this.hud?.showFinish({
            label: 'FIM',
            value: `${score} PTS`,
            note: placing.record ? 'NOVO RECORDE · 1º LUGAR'
                : [placing.position ? `${placing.position}º LUGAR` : '', previous ? `RECORDE: ${previous.name.toUpperCase()} ${Math.round(previous.score)} PTS` : '']
                    .filter(Boolean).join(' · '),
            tone: placing.record ? 'record' : 'even'
        });
        await new Promise((r) => setTimeout(r, FINISH_BANNER_MS));
        this.closeChallengeOverlay();

        this.showResult(c, {
            kicker: 'PONTOS',
            value: String(score),
            unit: 'pts',
            placing,
            delta: score > 0 ? delta : null,
            description: score > 0 ? this.recordText(c, placing, delta) : 'Nenhum ponto: pedale mais forte na próxima.',
            stats: this.attemptStats(c)
        });

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