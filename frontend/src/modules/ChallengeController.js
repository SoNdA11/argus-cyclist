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

export class ChallengeController {
    constructor(ui, mapCtrl, chart) {
        this.ui = ui;
        this.mapCtrl = mapCtrl;
        this.chart = chart;

        this.els = {
            homeScreen: document.getElementById('homeScreen'),
            eventHubModal: document.getElementById('eventHubModal'),
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
        this.animationFrame = null;
        this.lastFrameTime = 0;
        this.tunnelParticles = Array.from({ length: 140 }, () => this.makeTunnelParticle(true));

        this.bindEvents();
        this.resizeCanvases();

        window.addEventListener('resize', () => this.resizeCanvases());
    }

    bindEvents() {
        document.getElementById('btnHomeEventMode')?.addEventListener('click', () => this.enterEventMode());
        document.getElementById('btnHomeLeaderboard')?.addEventListener('click', () => this.openLeaderboard());
        document.getElementById('btnEventLeaderboard')?.addEventListener('click', () => this.openLeaderboard());
        document.getElementById('btnEventClose')?.addEventListener('click', () => this.closeModal(this.els.eventHubModal));
        document.getElementById('btnCloseEventHub')?.addEventListener('click', () => {
            this.closeModal(this.els.eventHubModal);

            if (!this.activeChallenge) {
                const homeScreen = document.getElementById('homeScreen');
                if (homeScreen) homeScreen.classList.add('active');

                if (window.go?.main?.App?.DisconnectTrainer) window.go.main.App.DisconnectTrainer();
            }
        });

        document.getElementById('btnCloseEventLeaderboard')?.addEventListener('click', () => this.closeModal(this.els.leaderboardModal));
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
    }

    async enterEventMode() {
        if (window.go?.main?.App?.EnsureEventModeProfile) {
            await window.go.main.App.EnsureEventModeProfile();
        }

        await this.refreshTrainerStatus();

        const homeScreen = document.getElementById('homeScreen');
        if (homeScreen) homeScreen.classList.remove('active');

        this.openEventHub();
    }

    openEventHub() {
        this.openModal(this.els.eventHubModal);
        this.closeModal(this.els.resultModal);
    }

    openLeaderboard() {
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
        const name = this.els.riderInput?.value?.trim();
        if (!name) {
            alert('Please enter the cyclist name before starting the event.');
            return '';
        }
        return name;
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
        let text = this.els.trainerStatus?.innerText || 'Disconnected';

        if (window.go?.main?.App?.GetDeviceConnectionState) {
            const state = await window.go.main.App.GetDeviceConnectionState();
            if (state?.trainer_connected) {
                text = state.trainer_kind === 'virtual' ? 'Simulator Active' : 'Trainer Connected';
            } else {
                text = 'Disconnected';
            }
        }

        if (this.els.eventTrainerStatus) {
            this.els.eventTrainerStatus.textContent = text;
            this.els.eventTrainerStatus.style.color = text === 'Disconnected'
                ? 'var(--text-main)'
                : text === 'Simulator Active'
                    ? '#38bdf8'
                    : 'var(--argus-safe)';
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

        if (window.go?.main?.App?.ResetAppState) {
            await window.go.main.App.ResetAppState();
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
        this.ui.setRecordingState('RECORDING');
        const result = await window.go.main.App.ToggleSession();
        if (typeof result === 'string' && result.toLowerCase().includes('error')) {
            window.isRecording = false;
            this.ui.setRecordingState('IDLE');
            throw new Error(result);
        }
    }

    async stopBackendSession() {
        if (!window.isRecording) return;

        if (window.go?.main?.App?.DiscardSession) {
            await window.go.main.App.DiscardSession();
        }

        window.isRecording = false;
        this.ui.setRecordingState('IDLE');
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

        await this.startChallenge({
            type: 'timeTrial',
            riderName,
            duration: 60,
            started: false,
            targetPower,
            tolerance: targetPower * 0.05,
            score: 0,
            graceRemaining: 5,
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
                finishedAt: 0
            };

            this.lastTelemetry = {
                power: 0,
                cadence: 0,
                grade: 0,
                speed: 0,
                total_dist: 0,
                elevation_gain: 0
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
        this.els.riderLabel.textContent = this.activeChallenge.riderName;
        this.els.statusLabel.textContent = 'Waiting for first pedal stroke';
        this.els.primaryLabel.textContent = this.activeChallenge.type === 'kom' ? 'Distance Covered' : 'Live Power';
        this.els.secondaryLabel.textContent = meta.metric;
        this.els.tertiaryLabel.textContent = this.activeChallenge.type === 'kom' ? 'Current Grade' : 'Cadence';
        this.els.graceMetric.style.display = this.activeChallenge.type === 'timeTrial' ? 'block' : 'none';
        this.els.secondaryValue.textContent = this.formatResultValue(this.activeChallenge.type, 0);
        this.els.powerUnit.textContent = this.activeChallenge.type === 'kom' ? 'meters' : 'watts';
        this.els.tertiaryValue.textContent = this.activeChallenge.type === 'kom' ? '0.0 %' : '0 rpm';
        this.els.powerValue.textContent = '0';
        this.els.timerValue.textContent = `${this.activeChallenge.duration.toFixed(1)}s`;
        if (this.activeChallenge.type === 'timeTrial') {
            this.els.secondaryValue.textContent = '0 pts';
            this.els.statusLabel.textContent = `Target locked at ${this.activeChallenge.targetPower} W`;
            this.els.graceValue.textContent = '5.0s';
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
            challenge.graceRemaining = 5;
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
            this.els.secondaryValue.textContent = this.formatDistance(this.activeChallenge.bestDistance || 0);
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
        if (this.activeChallenge?.type === 'kom' && data.total_dist !== undefined) {
            const dist = data.total_dist || 0;
            const grade = this.getGradeForDistance(dist);
            data.grade = grade;

            this.updateKOMGrade(dist);
        }

        this.lastTelemetry = data;

        if (!this.activeChallenge || this.activeChallenge.finalized) return;

        if (this.activeChallenge.type === 'sprint') {
            this.activeChallenge.peakPower = Math.max(this.activeChallenge.peakPower, data.power || 0);
        }

        if (this.activeChallenge.type === 'kom') {
            this.activeChallenge.bestDistance = Math.max(this.activeChallenge.bestDistance, data.total_dist || 0);
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
        return {
            angle: Math.random() * Math.PI * 2,
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
            const x = cx + Math.cos(particle.angle) * radius;
            const y = cy + Math.sin(particle.angle) * radius;

            ctx.beginPath();
            ctx.lineWidth = 1.5 + powerFactor * 3.5;
            ctx.strokeStyle = `hsla(${hue}, 100%, ${55 + powerFactor * 20}%, ${alpha})`;
            ctx.shadowBlur = 10 + powerFactor * 20;
            ctx.shadowColor = `hsla(${hue}, 100%, 60%, ${Math.min(0.8, alpha)})`;
            ctx.moveTo(x, y);
            ctx.lineTo(
                x + Math.cos(particle.angle) * lineLength,
                y + Math.sin(particle.angle) * lineLength
            );
            ctx.stroke();
        }
    }

    drawKOMBackdrop() {
        const ctx = this.backdropCtx;
        if (!ctx) return;

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

        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        const color = this.getTimeTrialColor();

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

        const entries = [...this.leaderboards[challenge.type]]
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);

        const liveValue = this.getLiveLeaderboardValue();
        const currentRow = {
            rider: challenge.riderName,
            value: liveValue
        };

        const preview = [...entries, currentRow].sort((a, b) => b.value - a.value).slice(0, 5);

        this.els.inlineLeaderboard.innerHTML = `
            <div class="challenge-chip-label">Event Ranking</div>
            ${preview.map((entry, index) => `
                <div class="challenge-inline-entry ${entry.rider === challenge.riderName ? 'is-active' : ''}">
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

    saveResult(type, rider, value, status) {
        if (!rider || value <= 0) return;
        this.leaderboards[type].push({
            rider,
            value,
            status,
            createdAt: Date.now()
        });
        this.leaderboards[type].sort((a, b) => b.value - a.value);
    }

    renderLeaderboardModal() {
        this.els.leaderboardPanels.innerHTML = Object.entries(this.modeMeta).map(([type, meta]) => {
            const entries = [...this.leaderboards[type]].sort((a, b) => b.value - a.value);
            const podium = [entries[0], entries[1], entries[2]];
            const rest = entries.slice(3, 10);

            return `
                <section class="leaderboard-category-card">
                    <h3>${meta.fullTitle}</h3>
                    <div class="leaderboard-podium">
                        ${podium.map((entry, index) => `
                            <div class="leaderboard-podium-entry ${entry ? `is-${['first', 'second', 'third'][index]}` : ''}">
                                <div class="leaderboard-podium-rank">${index + 1}${['st', 'nd', 'rd'][index] || 'th'}</div>
                                <strong>${entry?.rider || 'Open Slot'}</strong>
                                <div class="leaderboard-score">${entry ? this.formatResultValue(type, entry.value) : '--'}</div>
                            </div>
                        `).join('')}
                    </div>
                    <div class="leaderboard-list">
                        ${rest.length ? rest.map((entry, index) => `
                            <div class="leaderboard-row">
                                <span>${index + 4}.</span>
                                <strong>${entry.rider}</strong>
                                <span class="leaderboard-score">${this.formatResultValue(type, entry.value)}</span>
                            </div>
                        `).join('') : '<div class="leaderboard-row"><span>4.</span><strong>No attempts yet</strong><span class="leaderboard-score">--</span></div>'}
                    </div>
                </section>
            `;
        }).join('');
    }

    async finishActiveChallenge(success, title) {
        if (!this.activeChallenge || this.activeChallenge.finalized) return;

        this.activeChallenge.finalized = true;
        const challenge = this.activeChallenge;

        // Apply completion bonus for Time Trial
        if (challenge.type === 'timeTrial' && success) {
            // 25% Completion Bonus for surviving the full 60 seconds
            challenge.score *= 1.25;
            title = 'Challenge complete (+25% Survival Bonus!)';
        }

        const finalValue = this.getLiveLeaderboardValue();
        const description = success
            ? 'Result saved to the offline leaderboard.'
            : finalValue > 0
                ? 'Partial result saved to the offline leaderboard.'
                : 'No valid score was saved for this attempt.';

        this.saveResult(challenge.type, challenge.riderName, finalValue, success ? 'success' : 'failed');
        this.renderInlineLeaderboard();

        this.closeChallengeOverlay();
        this.stopAnimationLoop();
        await this.stopBackendSession();

        this.els.resultMode.textContent = this.modeMeta[challenge.type].fullTitle;
        this.els.resultTitle.textContent = title;
        this.els.resultValue.textContent = this.formatResultValue(challenge.type, finalValue);
        this.els.resultDescription.textContent = description;
        this.openModal(this.els.resultModal);

        this.cleanupChallengeState();
    }

    async abortActiveChallenge({ reopenHub = true } = {}) {
        if (!this.activeChallenge) return;

        this.closeChallengeOverlay();
        this.stopAnimationLoop();
        await this.stopBackendSession();
        this.cleanupChallengeState();
        if (reopenHub) {
            this.openEventHub();
        }
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
}