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

export class ChallengeController {
    constructor(ui, mapCtrl, chart) {
        this.ui = ui;
        this.mapCtrl = mapCtrl;
        this.chart = chart;

        this.els = {
            homeScreen: document.getElementById('homeScreen'),
            eventHubModal: document.getElementById('eventHubPage'),
            leaderboardModal: document.getElementById('eventLeaderboardModal'),
            leaderboardPanels: document.getElementById('eventLeaderboardPanels'),
            resultModal: document.getElementById('challengeResultModal'),
            overlay: document.getElementById('challengeOverlay'),
            modeLabel: document.getElementById('challengeModeLabel'),
            riderLabel: document.getElementById('challengeRiderLabel'),
            statusLabel: document.getElementById('challengeStatusLabel'),
            timerValue: document.getElementById('challengeTimerValue'),
            powerValue: document.getElementById('challengePowerValue'),
            powerUnit: document.getElementById('challengePowerUnit'),
            primaryLabel: document.getElementById('challengePrimaryLabel'),
            secondaryLabel: document.getElementById('challengeSecondaryLabel'),
            secondaryValue: document.getElementById('challengeSecondaryValue'),
            tertiaryLabel: document.getElementById('challengeTertiaryLabel'),
            tertiaryValue: document.getElementById('challengeTertiaryValue'),
            graceMetric: document.getElementById('challengeGraceMetric'),
            graceValue: document.getElementById('challengeGraceValue'),
            inlineLeaderboard: document.getElementById('challengeLeaderboardPanel'),
            resultMode: document.getElementById('challengeResultMode'),
            resultTitle: document.getElementById('challengeResultTitle'),
            resultValue: document.getElementById('challengeResultValue'),
            resultDescription: document.getElementById('challengeResultDescription'),
            riderInput: document.getElementById('eventRiderName'),
            targetPowerInput: document.getElementById('eventTargetPower'),
            eventTrainerStatus: document.getElementById('eventTrainerStatus'),
            backdropCanvas: document.getElementById('challengeBackdropCanvas'),
            telemetryCanvas: document.getElementById('challengeTelemetryCanvas'),
            trainerStatus: document.getElementById('statusTrainer')
        };

        this.backdropCtx = this.els.backdropCanvas?.getContext('2d');
        this.telemetryCtx = this.els.telemetryCanvas?.getContext('2d');

        this.leaderboards = {
            sprint: [],
            kom: [],
            timeTrial: []
        };

        this.modeMeta = {
            sprint: {
                title: 'Sprint',
                fullTitle: 'Sprint (Maximum Power Test)',
                metric: 'Peak Power',
                unit: 'W'
            },
            kom: {
                title: 'KOM',
                fullTitle: 'King of the Mountain',
                metric: 'Distance',
                unit: 'm'
            },
            timeTrial: {
                title: 'Time Trial',
                fullTitle: 'Time Trial (Precision Pacing)',
                metric: 'Score',
                unit: 'pts'
            }
        };

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
        this.tunnelParticles = Array.from({ length: 140 }, () => this.makeTunnelParticle(true));

        this.lastKOMGrade = null;
        this.lastTTColor = null;

        window.challengeController = this;

        telemetryBus.subscribe((data) => this.updateTelemetry(data));

        this.bindEvents();
        this.resizeCanvases();

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

        document.getElementById('btnLaunchSprint')?.addEventListener('click', () => this.launchSprint());
        document.getElementById('btnLaunchKOM')?.addEventListener('click', () => this.launchKOM());
        document.getElementById('btnLaunchTimeTrial')?.addEventListener('click', () => this.launchTimeTrial());

        document.getElementById('btnAbortChallenge')?.addEventListener('click', async () => {
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
        [this.els.backdropCanvas, this.els.telemetryCanvas].forEach((canvas) => {
            if (!canvas) return;
            canvas.width = window.innerWidth * window.devicePixelRatio;
            canvas.height = window.innerHeight * window.devicePixelRatio;
            canvas.style.width = `${window.innerWidth}px`;
            canvas.style.height = `${window.innerHeight}px`;
        });

        if (this.backdropCtx) this.backdropCtx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
        if (this.telemetryCtx) this.telemetryCtx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);

        this.lastKOMGrade = null;
        this.lastTTColor = null;
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
        this.renderLeaderboardModal();
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
        if (!window.go?.main?.App?.GetEventLeaderboard) return;

        for (const type of Object.keys(this.modeMeta)) {
            try {
                const records = await window.go.main.App.GetEventLeaderboard(type);
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
        await this.refreshTrainerStatus();

        if (!await this.hasTrainerConnection()) {
            alert('Connect a trainer or activate the simulator before starting an event challenge.');
            return false;
        }

        if (window.isRecording) {
            alert('Finish the current session before starting a new event challenge.');
            return false;
        }

        if (mode === 'kom') {
            if (window.go?.main?.App?.SetDirectGrade) {
                await window.go.main.App.SetDirectGrade(0);
            }
        } else {
            if (window.go?.main?.App?.SetDirectGrade) {
                await window.go.main.App.SetDirectGrade(0);
            }
            this.clearRoutePreview();
        }

        return true;
    }

    updateKOMGrade(distanceMeters) {
        if (!window.go?.main?.App?.SetDirectGrade) return;

        const gradeSchedule = [
            { pct: 0, grade: 0 },
            { pct: 0.05, grade: 0 },
            { pct: 0.10, grade: 1 },
            { pct: 0.20, grade: 2 },
            { pct: 0.30, grade: 3 },
            { pct: 0.40, grade: 4 },
            { pct: 0.50, grade: 5 },
            { pct: 0.60, grade: 6 },
            { pct: 0.70, grade: 7 },
            { pct: 0.80, grade: 8 },
            { pct: 0.90, grade: 8 },
            { pct: 1.00, grade: 8 }
        ];

        const routeDistance = 3000;
        const pct = Math.min(1, distanceMeters / routeDistance);

        for (let i = 0; i < gradeSchedule.length - 1; i++) {
            if (pct >= gradeSchedule[i].pct && pct <= gradeSchedule[i + 1].pct) {
                const t = (pct - gradeSchedule[i].pct) / (gradeSchedule[i + 1].pct - gradeSchedule[i].pct);
                const grade = gradeSchedule[i].grade + t * (gradeSchedule[i + 1].grade - gradeSchedule[i].grade);
                window.go.main.App.SetDirectGrade(grade);
                return;
            }
        }
        window.go.main.App.SetDirectGrade(gradeSchedule[gradeSchedule.length - 1].grade);
    }

    updateKOMGradeByTime(elapsedSeconds) {
        if (!window.go?.main?.App?.SetDirectGrade) return;

        const duration = 60;
        const maxGrade = 7;
        const pct = Math.min(1, elapsedSeconds / duration);

        let grade = 0;
        if (pct <= 0.15) {
            grade = 0;
        } else if (pct <= 0.35) {
            grade = (pct - 0.15) / 0.2 * 2;
        } else if (pct <= 0.6) {
            grade = 2 + (pct - 0.35) / 0.25 * 3;
        } else {
            grade = 5 + (pct - 0.6) / 0.4 * (maxGrade - 5);
        }

        grade = Math.min(maxGrade, grade);

        window.go.main.App.SetDirectGrade(grade);

        if (this.lastTelemetry) {
            this.lastTelemetry.grade = grade;
        }
    }

    async loadKOMRoute() {
        const routePoints = this.createVirtualKOMRoute();

        if (!routePoints || routePoints.length === 0) return;

        window.totalRouteDistance = routePoints[routePoints.length - 1].distance;

        if (window.ui?.setFilename) {
            window.ui.setFilename('KOM Challenge Route');
        }

        this.ui.showRoutePreview(window.totalRouteDistance);

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

        this.mapCtrl.renderRoute({ type: 'FeatureCollection', features });
        this.mapCtrl.setInitialPosition(routePoints[0].lat, routePoints[0].lon);

        const elevations = routePoints.map(p => p.ele);
        this.chart.setData(elevations);
    }

    createVirtualKOMRoute() {
        const points = [];
        const numPoints = 30;
        const startLat = -23.560000;
        const startLon = -46.650000;
        const startEle = 760.0;

        const latStep = 0.0012;
        const lonStep = 0.0012;

        const gradeSchedule = [
            { pct: 0, grade: 0 },
            { pct: 0.05, grade: 0 },
            { pct: 0.10, grade: 1 },
            { pct: 0.20, grade: 2 },
            { pct: 0.30, grade: 3 },
            { pct: 0.40, grade: 4 },
            { pct: 0.50, grade: 5 },
            { pct: 0.60, grade: 6 },
            { pct: 0.70, grade: 7 },
            { pct: 0.80, grade: 8 },
            { pct: 0.90, grade: 8 },
            { pct: 1.00, grade: 8 }
        ];

        let currentEle = startEle;

        for (let i = 0; i < numPoints; i++) {
            const pct = i / (numPoints - 1);
            const grade = this.interpolateGrade(pct, gradeSchedule);

            if (i > 0) {
                const distSinceLast = 100;
                currentEle += distSinceLast * (grade / 100);
            }

            points.push({
                lat: startLat - (i * latStep),
                lon: startLon - (i * lonStep),
                ele: currentEle,
                grade: grade,
                distance: i * 100
            });
        }

        return points;
    }

    interpolateGrade(pct, schedule) {
        for (let i = 0; i < schedule.length - 1; i++) {
            if (pct >= schedule[i].pct && pct <= schedule[i + 1].pct) {
                const t = (pct - schedule[i].pct) / (schedule[i + 1].pct - schedule[i].pct);
                return schedule[i].grade + t * (schedule[i + 1].grade - schedule[i].grade);
            }
        }
        return schedule[schedule.length - 1].grade;
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

        document.body.classList.add('suppress-map-modals');

        if (window.go?.main?.App?.DiscardSession) {
            await window.go.main.App.DiscardSession();
        }

        window.isRecording = false;
        if (this.ui && this.ui.setRecordingState) {
            this.ui.setRecordingState('IDLE');
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

    async launchSprint() {
        const riderName = this.getRiderName();
        if (!riderName) return;
        if (!await this.prepareChallengeEnvironment('sprint')) return;

        await this.startChallenge({
            type: 'sprint',
            riderName,
            duration: 15,
            started: false,
            peakPower: 0,
            threshold: 5
        });
    }

    async launchKOM() {
        const riderName = this.getRiderName();
        if (!riderName) return;
        if (!await this.prepareChallengeEnvironment('kom')) return;

        await this.startChallenge({
            type: 'kom',
            riderName,
            duration: 60,
            started: false,
            bestDistance: 0,
            threshold: 5
        });
    }

    async launchTimeTrial() {
        const riderName = this.getRiderName();
        if (!riderName) return;

        const targetPowerInput = this.els.targetPowerInput;
        const rawValue = targetPowerInput?.value;
        const parsedValue = parseInt(rawValue, 10);
        const targetPower = (!isNaN(parsedValue) && parsedValue > 0) ? parsedValue : 250;

        if (!await this.prepareChallengeEnvironment('timeTrial')) return;

        const calculatedTolerance = Math.max(targetPower * 0.12, 20);

        await this.startChallenge({
            type: 'timeTrial',
            riderName,
            duration: 60,
            started: false,
            targetPower,
            tolerance: calculatedTolerance,
            score: 0,
            graceRemaining: 10,
            threshold: 5,
            history: new Array(180).fill(targetPower),
            isOutOfZone: false
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
                initialDistance: this.lastTelemetry.total_dist || 0
            };

            this.updateChallengeChrome();
            this.openChallengeOverlay();
            await this.startBackendSession();
            this.startAnimationLoop();
        } catch (error) {
            console.error(error);
            alert(`Unable to start challenge: ${error}`);
            this.cleanupChallengeState();
        }
    }

    openChallengeOverlay() {
        document.body.classList.add('challenge-mode-active');
        this.els.overlay?.classList.remove('hidden');
    }

    closeChallengeOverlay() {
        document.body.classList.remove('challenge-mode-active');
        this.els.overlay?.classList.add('hidden');
    }

    updateChallengeChrome() {
        if (!this.activeChallenge) return;

        const meta = this.modeMeta[this.activeChallenge.type];
        this.els.modeLabel.textContent = meta.fullTitle;

        const cleanRiderName = this.activeChallenge.riderName.replace(/ \[[MFG]\]$/, '');
        this.els.riderLabel.textContent = cleanRiderName;

        this.els.statusLabel.textContent = 'Waiting for first pedal stroke';
        this.els.primaryLabel.textContent = this.activeChallenge.type === 'kom' ? 'Distance Covered' : 'Live Power';
        this.els.secondaryLabel.textContent = this.activeChallenge.type === 'kom' ? 'Live Power' : meta.metric;
        this.els.tertiaryLabel.textContent = this.activeChallenge.type === 'kom' ? 'Current Grade' : 'Cadence';

        this.els.graceMetric.style.display = this.activeChallenge.type === 'timeTrial' ? 'block' : 'none';

        this.els.secondaryValue.textContent = this.activeChallenge.type === 'kom' ? '0 W' : this.formatResultValue(this.activeChallenge.type, 0);
        this.els.powerUnit.textContent = this.activeChallenge.type === 'kom' ? 'meters' : 'watts';
        this.els.tertiaryValue.textContent = this.activeChallenge.type === 'kom' ? '0.0 %' : '0 rpm';
        this.els.powerValue.textContent = '0';
        this.els.timerValue.textContent = `${this.activeChallenge.duration.toFixed(1)}s`;

        if (this.activeChallenge.type === 'timeTrial') {
            this.els.secondaryValue.textContent = '0 pts';
            this.els.statusLabel.textContent = `Target locked at ${this.activeChallenge.targetPower} W`;
            this.els.graceValue.textContent = '10s';
        }
        this.renderInlineLeaderboard();
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

        if (!this.activeChallenge.started && this.lastTelemetry.power > this.activeChallenge.threshold) {
            this.activeChallenge.started = true;
            this.activeChallenge.startTime = now;
            this.els.statusLabel.textContent = 'Challenge live';
        }

        if (this.activeChallenge.started && !this.activeChallenge.finalized) {
            const elapsed = (now - this.activeChallenge.startTime) / 1000;
            const remaining = Math.max(0, this.activeChallenge.duration - elapsed);
            this.els.timerValue.textContent = `${remaining.toFixed(1)}s`;

            let activeDt = rawDt;
            if (elapsed < activeDt) {
                activeDt = Math.max(0, elapsed);
            }
            if (elapsed > this.activeChallenge.duration) {
                const overshoot = elapsed - this.activeChallenge.duration;
                activeDt = Math.max(0, activeDt - overshoot);
            }

            if (this.activeChallenge.type === 'kom') {
                this.updateKOMGradeByTime(elapsed);
            }

            if (this.activeChallenge.type === 'timeTrial') {
                this.updateTimeTrial(activeDt);
            }

            if (remaining <= 0) {
                this.finishActiveChallenge(true, 'Challenge complete');
                return;
            }
        } else if (!this.activeChallenge.started) {
            this.els.timerValue.textContent = `${this.activeChallenge.duration.toFixed(1)}s`;
        }

        this.syncDisplayedTelemetry();
        this.drawCurrentChallenge(dt);
        this.animationFrame = requestAnimationFrame((frameTime) => this.tick(frameTime));
    }

    updateTimeTrial(dt) {
        const challenge = this.activeChallenge;
        const minZone = challenge.targetPower - challenge.tolerance;
        const maxZone = challenge.targetPower + challenge.tolerance;
        const inZone = this.lastTelemetry.power >= minZone && this.lastTelemetry.power <= maxZone;

        challenge.history.push(this.lastTelemetry.power);
        if (challenge.history.length > 180) challenge.history.shift();

        if (!challenge.started) return;

        if (inZone) {
            challenge.isOutOfZone = false;
            challenge.graceRemaining = 10;
            challenge.score += Math.pow(challenge.targetPower, 1.5) * dt;
            this.els.statusLabel.textContent = 'Inside target zone';
        } else {
            challenge.isOutOfZone = true;
            challenge.graceRemaining = Math.max(0, challenge.graceRemaining - dt);
            this.els.statusLabel.textContent = 'Recover target power';

            if (challenge.graceRemaining <= 0) {
                this.finishActiveChallenge(false, 'Challenge failed');
                return;
            }
        }

        this.els.graceValue.textContent = `${challenge.graceRemaining.toFixed(1)}s`;
    }

    syncDisplayedTelemetry() {
        if (!this.activeChallenge) return;

        const power = Math.round(this.lastTelemetry.power || 0);
        const cadence = Math.round(this.lastTelemetry.cadence || 0);

        this.els.powerValue.textContent = this.activeChallenge.type === 'kom'
            ? this.formatDistance(this.activeChallenge.bestDistance || 0, false)
            : `${power}`;

        if (this.activeChallenge.type === 'sprint') {
            this.els.secondaryValue.textContent = `${Math.round(this.activeChallenge.peakPower || 0)} W`;
            this.els.tertiaryValue.textContent = `${cadence} rpm`;
        }

        if (this.activeChallenge.type === 'kom') {
            this.els.secondaryValue.textContent = `${power} W`;
            this.els.tertiaryValue.textContent = `${(this.lastTelemetry.grade || 0).toFixed(1)} %`;
        }

        if (this.activeChallenge.type === 'timeTrial') {
            const target = this.activeChallenge.targetPower;
            const tolerance = this.activeChallenge.tolerance;
            this.els.primaryLabel.textContent = `Live Power vs ${target} W`;
            this.els.secondaryValue.textContent = `${Math.round(this.activeChallenge.score)} pts`;
            this.els.tertiaryValue.textContent = `±${Math.round(tolerance)} W`;

            if (!this.activeChallenge.started) {
                this.els.statusLabel.textContent = `Target locked at ${target} W`;
            }
        }
    }

    updateTelemetry(data) {
        let relativeDist = 0;
        if (this.activeChallenge?.type === 'kom' && data.total_dist !== undefined) {
            if (!this.activeChallenge.started) {
                this.activeChallenge.initialDistance = data.total_dist || 0;
            }
            
            const currentDist = data.total_dist || 0;
            relativeDist = Math.max(0, currentDist - (this.activeChallenge.initialDistance || 0));

            const grade = this.getGradeForDistance(relativeDist);
            data.grade = grade;
            this.updateKOMGrade(relativeDist);
        }

        this.lastTelemetry = data;

        if (!this.activeChallenge || this.activeChallenge.finalized) return;

        if (this.activeChallenge.type === 'sprint') {
            this.activeChallenge.peakPower = Math.max(this.activeChallenge.peakPower, data.power || 0);
        }

        if (this.activeChallenge.type === 'kom') {
            this.activeChallenge.bestDistance = Math.max(this.activeChallenge.bestDistance, relativeDist);
        }
    }

    getGradeForDistance(distanceMeters) {
        const gradeSchedule = [
            { pct: 0, grade: 0 },
            { pct: 0.05, grade: 0 },
            { pct: 0.10, grade: 1 },
            { pct: 0.20, grade: 2 },
            { pct: 0.30, grade: 3 },
            { pct: 0.40, grade: 4 },
            { pct: 0.50, grade: 5 },
            { pct: 0.60, grade: 6 },
            { pct: 0.70, grade: 7 },
            { pct: 0.80, grade: 8 },
            { pct: 0.90, grade: 8 },
            { pct: 1.00, grade: 8 }
        ];

        const routeDistance = 3000;
        const pct = Math.min(1, distanceMeters / routeDistance);

        for (let i = 0; i < gradeSchedule.length - 1; i++) {
            if (pct >= gradeSchedule[i].pct && pct <= gradeSchedule[i + 1].pct) {
                const t = (pct - gradeSchedule[i].pct) / (gradeSchedule[i + 1].pct - gradeSchedule[i].pct);
                return gradeSchedule[i].grade + t * (gradeSchedule[i + 1].grade - gradeSchedule[i].grade);
            }
        }
        return gradeSchedule[gradeSchedule.length - 1].grade;
    }

    drawCurrentChallenge(dt) {
        const type = this.activeChallenge?.type;
        if (!type) return;

        if (type === 'sprint') {
            this.drawSprintTunnel(dt);
            this.telemetryCtx?.clearRect(0, 0, window.innerWidth, window.innerHeight);
            return;
        }

        if (type === 'kom') {
            this.drawKOMBackdrop();
            this.drawKOMTelemetry();
            return;
        }

        this.drawTimeTrialBackdrop();
        this.drawTimeTrialTelemetry();
    }

    clearTelemetryCanvas() {
        this.backdropCtx?.clearRect(0, 0, window.innerWidth, window.innerHeight);
        this.telemetryCtx?.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }

    makeTunnelParticle(randomizeDepth = false) {
        const angle = Math.random() * Math.PI * 2;
        return {
            angle,
            cosA: Math.cos(angle),
            sinA: Math.sin(angle),
            depth: randomizeDepth ? Math.random() : 1,
            lane: Math.random() * 0.55 + 0.2
        };
    }

    drawSprintTunnel(dt) {
        const ctx = this.backdropCtx;
        if (!ctx) return;

        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        ctx.fillStyle = 'rgba(4, 8, 18, 0.38)';
        ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        const powerFactor = Math.min(1.4, (this.lastTelemetry.power || 0) / 1000);
        const hue = 210 - powerFactor * 190;
        const speed = 0.42 + powerFactor * 2.2;

        for (const particle of this.tunnelParticles) {
            particle.depth -= dt * speed;
            if (particle.depth <= 0.02) {
                Object.assign(particle, this.makeTunnelParticle(false));
                particle.depth = 1;
            }

            const radius = (1 - particle.depth) * Math.min(window.innerWidth, window.innerHeight) * particle.lane;
            const alpha = (1 - particle.depth) * 0.95;
            const lineLength = 18 + powerFactor * 110 * (1 - particle.depth);
            const x = cx + particle.cosA * radius;
            const y = cy + particle.sinA * radius;

            ctx.beginPath();
            ctx.lineWidth = 1.5 + powerFactor * 3.5;
            ctx.strokeStyle = `hsla(${hue}, 100%, ${55 + powerFactor * 20}%, ${alpha})`;
            ctx.shadowBlur = 10 + powerFactor * 20;
            ctx.shadowColor = `hsla(${hue}, 100%, 60%, ${Math.min(0.8, alpha)})`;
            ctx.moveTo(x, y);
            ctx.lineTo(
                x + particle.cosA * lineLength,
                y + particle.sinA * lineLength
            );
            ctx.stroke();
        }
    }

    drawKOMBackdrop() {
        const ctx = this.backdropCtx;
        if (!ctx) return;

        const currentGrade = this.lastTelemetry.grade || 0;
        if (this.lastKOMGrade === currentGrade) return;
        this.lastKOMGrade = currentGrade;

        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        const gradient = ctx.createLinearGradient(0, 0, 0, window.innerHeight);
        gradient.addColorStop(0, 'rgba(20, 83, 45, 0.35)');
        gradient.addColorStop(0.5, 'rgba(30, 41, 59, 0.2)');
        gradient.addColorStop(1, 'rgba(2, 6, 23, 0.95)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

        const hillHeight = 120 + Math.min(180, (this.lastTelemetry.grade || 0) * 10);
        ctx.beginPath();
        ctx.moveTo(0, window.innerHeight);
        ctx.quadraticCurveTo(window.innerWidth * 0.2, window.innerHeight - hillHeight, window.innerWidth * 0.45, window.innerHeight - 60);
        ctx.quadraticCurveTo(window.innerWidth * 0.72, window.innerHeight - 220, window.innerWidth, window.innerHeight - 140);
        ctx.lineTo(window.innerWidth, window.innerHeight);
        ctx.closePath();
        ctx.fillStyle = 'rgba(163, 230, 53, 0.12)';
        ctx.fill();
    }

    drawKOMTelemetry() {
        const ctx = this.telemetryCtx;
        if (!ctx) return;

        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

        const progress = window.totalRouteDistance > 0 ? (this.activeChallenge.bestDistance || 0) / window.totalRouteDistance : 0;
        const barWidth = Math.min(window.innerWidth * 0.62, 680);
        const x = (window.innerWidth - barWidth) / 2;
        const y = window.innerHeight - 110;

        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(x, y, barWidth, 10);
        ctx.fillStyle = '#facc15';
        ctx.fillRect(x, y, Math.max(0, Math.min(barWidth, barWidth * progress)), 10);
        ctx.shadowBlur = 14;
        ctx.shadowColor = 'rgba(250, 204, 21, 0.75)';
        ctx.beginPath();
        ctx.arc(x + barWidth * progress, y + 5, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }

    drawTimeTrialBackdrop() {
        const ctx = this.backdropCtx;
        if (!ctx) return;

        const color = this.getTimeTrialColor();
        if (this.lastTTColor === color) return;
        this.lastTTColor = color;

        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

        const gradient = ctx.createRadialGradient(
            window.innerWidth * 0.5,
            window.innerHeight * 0.45,
            20,
            window.innerWidth * 0.5,
            window.innerHeight * 0.45,
            window.innerWidth * 0.6
        );
        gradient.addColorStop(0, this.alpha(color, 0.18));
        gradient.addColorStop(1, 'rgba(2, 6, 23, 0.96)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    }

    drawTimeTrialTelemetry() {
        const ctx = this.telemetryCtx;
        if (!ctx) return;

        const history = this.activeChallenge.history || [];
        const color = this.getTimeTrialColor();

        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 1;

        for (let x = 0; x < window.innerWidth; x += 48) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, window.innerHeight);
            ctx.stroke();
        }
        for (let y = 0; y < window.innerHeight; y += 48) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(window.innerWidth, y);
            ctx.stroke();
        }

        const centerY = window.innerHeight * 0.55;
        const pixelsPerWatt = 1.9;
        const toleranceBand = this.activeChallenge.tolerance * pixelsPerWatt;
        ctx.fillStyle = this.alpha('#00ff9d', 0.08);
        ctx.fillRect(0, centerY - toleranceBand, window.innerWidth, toleranceBand * 2);

        ctx.setLineDash([6, 10]);
        ctx.strokeStyle = this.alpha('#00ff9d', 0.35);
        ctx.beginPath();
        ctx.moveTo(0, centerY - toleranceBand);
        ctx.lineTo(window.innerWidth, centerY - toleranceBand);
        ctx.moveTo(0, centerY + toleranceBand);
        ctx.lineTo(window.innerWidth, centerY + toleranceBand);
        ctx.stroke();
        ctx.setLineDash([]);

        if (history.length < 2) return;

        const stepX = window.innerWidth / (history.length - 1);
        ctx.beginPath();

        for (let i = 0; i < history.length; i++) {
            const x = i * stepX;
            const diff = this.activeChallenge.targetPower - history[i];
            const y = centerY + diff * pixelsPerWatt;

            if (i === 0) {
                ctx.moveTo(x, y);
                continue;
            }

            const prevX = (i - 1) * stepX;
            const prevDiff = this.activeChallenge.targetPower - history[i - 1];
            const prevY = centerY + prevDiff * pixelsPerWatt;
            const cpX = (prevX + x) / 2;
            ctx.quadraticCurveTo(prevX, prevY, cpX, (prevY + y) / 2);
        }

        ctx.lineWidth = 4;
        ctx.strokeStyle = color;
        ctx.shadowBlur = 22;
        ctx.shadowColor = this.alpha(color, 0.75);
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    getTimeTrialColor() {
        if (!this.activeChallenge?.started) return '#00f0ff';
        return this.activeChallenge.isOutOfZone ? '#ff355e' : '#00ff9d';
    }

    alpha(hex, alpha) {
        if (hex.startsWith('rgba')) return hex;
        const clean = hex.replace('#', '');
        const bigint = parseInt(clean, 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    formatDistance(value, withUnit = true) {
        const meters = Math.max(0, value || 0);
        if (!withUnit) return `${meters.toFixed(0)}`;
        return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${meters.toFixed(0)} m`;
    }

    formatResultValue(type, value) {
        if (type === 'sprint') return `${Math.round(value || 0)} W`;
        if (type === 'kom') return this.formatDistance(value || 0);
        return `${Math.round(value || 0)} pts`;
    }

    renderInlineLeaderboard() {
        const challenge = this.activeChallenge;
        if (!challenge) return;

        const currentCleanName = challenge.riderName.replace(/ \[[MFG]\]$/, '');

        const entries = [...this.leaderboards[challenge.type]]
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);

        const liveValue = this.getLiveLeaderboardValue();
        const currentRow = {
            rider: currentCleanName,
            isCurrentPlayer: true,
            value: liveValue
        };

        const filteredEntries = entries.filter(e => e.rider !== currentCleanName);

        const preview = [...filteredEntries, currentRow]
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);

        this.els.inlineLeaderboard.innerHTML = `
            <div class="challenge-chip-label">Event Ranking</div>
            ${preview.map((entry, index) => `
                <div class="challenge-inline-entry ${entry.isCurrentPlayer ? 'is-active' : ''}">
                    <span>${index + 1}.</span>
                    <strong>${entry.rider}</strong>
                    <span>${this.formatResultValue(challenge.type, entry.value)}</span>
                </div>
            `).join('')}
        `;
    }

    getLiveLeaderboardValue() {
        if (!this.activeChallenge) return 0;
        if (this.activeChallenge.type === 'sprint') return this.activeChallenge.peakPower || 0;
        if (this.activeChallenge.type === 'kom') return this.activeChallenge.bestDistance || 0;
        return this.activeChallenge.score || 0;
    }

    async saveResult(type, rider, value, status) {
        if (!rider || value <= 0) return;

        this.leaderboards[type].push({
            rider,
            value,
            status,
            createdAt: Date.now()
        });
        this.leaderboards[type].sort((a, b) => b.value - a.value);

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

            filteredEntries = filteredEntries.sort((a, b) => b.value - a.value).slice(0, 150);

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
                        <strong class="lb-podium-name" title="${entry.rider}">${entry.rider}</strong>
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
                                <strong class="lb-row-name">${entry.rider}</strong>
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

        if (challenge.type === 'timeTrial' && success) {
            challenge.score *= 1.25;
            title = 'Challenge complete (+25% Survival Bonus!)';
        }

        let finalValue = this.getLiveLeaderboardValue();
        let description = success
            ? 'Result saved to the offline leaderboard.'
            : finalValue > 0
                ? 'Partial result saved to the offline leaderboard.'
                : 'No valid score was saved for this attempt.';

        let displayValue = this.formatResultValue(challenge.type, finalValue);

        if (challenge.type === 'timeTrial' && !success) {
            title = 'Pacing Failed';
            finalValue = 0;
            displayValue = 'FAILED';
            description = "You couldn't maintain the target power within the zone for 1 minute. Don't get discouraged! Take a sip of water, recover your legs, and show what you're capable of in the next attempt. You've got this!";
        }

        this.saveResult(challenge.type, challenge.riderName, finalValue, success ? 'success' : 'failed');
        this.renderInlineLeaderboard();

        this.closeChallengeOverlay();
        this.stopAnimationLoop();

        // Show the result UI FIRST, before stopping the backend session.
        // This prevents the brief flash of the reset main UI (settings screen)
        // that happens when DiscardSession emits status_change → IDLE.
        this.openEventHub();

        this.els.resultMode.textContent = this.modeMeta[challenge.type].fullTitle;
        this.els.resultTitle.textContent = title;
        this.els.resultValue.textContent = displayValue;
        this.els.resultDescription.textContent = description;

        this.els.resultValue.style.color = (challenge.type === 'timeTrial' && !success) ? '#ef4444' : 'var(--power-color)';

        this.openModal(this.els.resultModal);

        // Now stop the backend session safely behind the result overlay
        await this.stopBackendSession();

        this.cleanupChallengeState();
    }

    async abortActiveChallenge({ reopenHub = true } = {}) {
        if (!this.activeChallenge) return;

        this.closeChallengeOverlay();
        this.stopAnimationLoop();

        // Show the hub FIRST to cover the screen before backend cleanup
        if (reopenHub) {
            this.openEventHub();
        }

        await this.stopBackendSession();
        this.cleanupChallengeState();
    }

    cleanupChallengeState() {
        this.activeChallenge = null;
        this.stopAnimationLoop();
        this.closeChallengeOverlay();
        document.body.classList.remove('challenge-mode-active');

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
                                    <div style="font-weight: 700; color: #fff;">${this.modeMeta[r.event_mode]?.fullTitle || r.event_mode} - ${this.formatResultValue(r.event_mode, r.score)}</div>
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