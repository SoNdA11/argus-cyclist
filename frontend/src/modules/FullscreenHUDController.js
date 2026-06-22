export class FullscreenHUDController {
    constructor() {
        this.mode = null;
        this.el = {};
        this._queryElements();
    }

    _queryElements() {
        const $ = (id) => document.getElementById(id);
        this.el.hud = $('studio-hud');
        this.el.glow = $('studio-glow');
        this.el.modeBadge = $('hud-mode-badge');
        this.el.cyclistName = $('hud-cyclist-name');
        this.el.statusLabel = $('hud-status-label');
        this.el.primaryLabel = $('hud-primary-label');
        this.el.primaryValue = $('studio-power');
        this.el.primaryUnit = $('hud-primary-unit');
        this.el.targetBox = $('studio-target-box');
        this.el.target = $('studio-target');
        this.el.timer = $('studio-timer');
        this.el.timerLabel = $('studio-timer-label');
        this.el.hr = $('studio-hr');
        this.el.rpm = $('studio-rpm');
        this.el.wkg = $('studio-wkg');
        this.el.elapsed = $('studio-elapsed');
        this.el.speed = $('studio-speed');
        this.el.avgSpeed = $('studio-avg-speed');
        this.el.dist = $('studio-dist');
        this.el.secondaryLabel = $('hud-secondary-label');
        this.el.secondaryValue = $('hud-secondary-value');
        this.el.secondaryUnit = $('hud-secondary-unit');
        this.el.tertiaryLabel = $('hud-tertiary-label');
        this.el.tertiaryValue = $('hud-tertiary-value');
        this.el.tertiaryUnit = $('hud-tertiary-unit');
        this.el.zoneValue = $('hud-zone-value');
        this.el.zoneMetric = $('hud-zone-metric');
        this.el.sideMetrics = $('hud-side-metrics');
        this.el.intensityRow = $('studio-intensity-row');
        this.el.leaderboard = $('hud-inline-leaderboard');
        this.el.graphContainer = $('hud-graph-container');
        this.el.btnExit = $('btnStudioExit');
        this.el.btnLoad = $('btnStudioLoadWorkout');
        this.el.btnStart = $('btnStudioStart');
        this.el.btnAbort = $('hud-abort-btn');
        this.el.btnIntUp = $('btnStudioIntensityUp');
        this.el.btnIntDown = $('btnStudioIntensityDown');
    }

    open(mode) {
        this.mode = mode;
        this.el.hud.classList.remove('hidden', 'mode-studio', 'mode-sprint', 'mode-kom', 'mode-tt', 'mode-timeTrial');
        
        const classMap = {
            sprint: 'sprint',
            kom: 'kom',
            timeTrial: 'tt',
            studio: 'studio'
        };
        const activeClass = classMap[mode] || mode;
        this.el.hud.classList.add(`mode-${activeClass}`);

        for (let i = 0; i <= 6; i++) this.el.hud.classList.remove(`zone-${i}`);

        if (mode === 'studio') {
            this.el.modeBadge.textContent = 'STUDIO';
            this.el.cyclistName.style.display = 'none';
            this.el.statusLabel.style.display = 'none';
            this.el.btnExit.style.display = '';
            this.el.btnAbort.classList.add('hidden');
            this.el.btnStart.classList.remove('hidden');
            this.el.btnLoad.style.display = '';
            this.el.sideMetrics.style.display = 'none';
            this.el.intensityRow.style.display = 'flex';
            this.el.leaderboard.style.display = 'none';
            this.el.graphContainer.style.display = 'block';
            this.el.targetBox.style.display = 'flex';
            this.el.timerLabel.textContent = 'NEXT INTERVAL';
            this.el.primaryLabel.textContent = 'POWER';
            this.el.primaryUnit.textContent = 'W';
        } else {
            this.el.cyclistName.style.display = '';
            this.el.statusLabel.style.display = '';
            this.el.btnExit.style.display = 'none';
            this.el.btnAbort.classList.remove('hidden');
            this.el.btnStart.classList.add('hidden');
            this.el.btnLoad.style.display = 'none';
            this.el.sideMetrics.style.display = 'flex';
            this.el.intensityRow.style.display = 'none';
            this.el.leaderboard.style.display = 'block';
            this.el.graphContainer.style.display = 'none';
            this.el.targetBox.style.display = 'none';

            const meta = this._modeMeta(mode);
            this.el.modeBadge.textContent = meta.badge;
            this.el.primaryLabel.textContent = meta.primaryLabel;
            this.el.primaryUnit.textContent = meta.primaryUnit;
            this.el.secondaryLabel.textContent = 'LIVE POWER';
            this.el.tertiaryLabel.textContent = meta.tertiaryLabel;

            if (mode === 'timeTrial') {
                this.el.zoneMetric.style.display = 'flex';
            } else {
                this.el.zoneMetric.style.display = 'none';
            }
        }
    }

    close() {
        this.el.hud.classList.add('hidden');
        this.mode = null;
    }

    isOpen() {
        return this.mode !== null;
    }

    _modeMeta(mode) {
        const map = {
            sprint: { badge: 'SPRINT', primaryLabel: 'PEAK POWER', primaryUnit: 'W', tertiaryLabel: 'CADENCE' },
            kom: { badge: 'KOM', primaryLabel: 'DISTANCE', primaryUnit: 'M', tertiaryLabel: 'GRADE' },
            timeTrial: { badge: 'TIME TRIAL', primaryLabel: 'SCORE', primaryUnit: 'PTS', tertiaryLabel: 'MULTIPLIER' }
        };
        return map[mode] || map.sprint;
    }

    setMode(text) {
        this.el.modeBadge.textContent = text;
    }

    setRiderName(name) {
        this.el.cyclistName.textContent = name || '';
    }

    setStatus(text) {
        this.el.statusLabel.textContent = text || '';
    }

    setTimer(value, label) {
        if (value !== undefined && value !== null) this.el.timer.textContent = value;
        if (label !== undefined) this.el.timerLabel.textContent = label;
    }

    setPrimaryMetric(value, unit) {
        if (value !== undefined && value !== null) this.el.primaryValue.textContent = value;
        if (unit !== undefined) this.el.primaryUnit.textContent = unit;
    }

    _splitValueAndUnit(text) {
        if (text === undefined || text === null) return { val: '', unit: '' };
        const str = String(text).trim();
        const numMatch = str.match(/^([-\d.,]+)\s*(.*)$/);
        if (numMatch) {
            return { val: numMatch[1], unit: numMatch[2] ? numMatch[2].trim() : '' };
        }
        return { val: str, unit: '' };
    }

    setSecondaryMetric(label, value) {
        if (label !== undefined) this.el.secondaryLabel.textContent = label;
        if (value !== undefined && value !== null) {
            const split = this._splitValueAndUnit(value);
            this.el.secondaryValue.textContent = split.val;
            if (this.el.secondaryUnit) {
                this.el.secondaryUnit.textContent = split.unit;
                this.el.secondaryUnit.style.display = split.unit ? 'inline-block' : 'none';
            }
        }
    }

    setTertiaryMetric(label, value) {
        if (label !== undefined) this.el.tertiaryLabel.textContent = label;
        if (value !== undefined && value !== null) {
            const split = this._splitValueAndUnit(value);
            this.el.tertiaryValue.textContent = split.val;
            if (this.el.tertiaryUnit) {
                this.el.tertiaryUnit.textContent = split.unit;
                this.el.tertiaryUnit.style.display = split.unit ? 'inline-block' : 'none';
            }
        }
    }

    setZone(text, zoneNum) {
        if (this.el.zoneValue) {
            this.el.zoneValue.textContent = text || 'Z1';
            for (let i = 1; i <= 6; i++) this.el.zoneValue.classList.remove(`zone-z${i}`);
            if (zoneNum !== undefined && zoneNum >= 1 && zoneNum <= 6) {
                this.el.zoneValue.classList.add(`zone-z${zoneNum}`);
            }
        }
    }

    showLeaderboard(html) {
        this.el.leaderboard.innerHTML = html || '';
        this.el.leaderboard.style.display = 'block';
    }

    hideLeaderboard() {
        this.el.leaderboard.style.display = 'none';
    }

    setTarget(value) {
        if (this.el.target) this.el.target.textContent = value !== null && value !== undefined ? value : '--';
    }

    updateTelemetry(data, riderWeight) {
        if (!data) return;
        const power = data.power || 0;
        const hr = data.heart_rate || '--';
        const cadence = data.cadence || 0;
        const weight = riderWeight || data.rider_weight || data.riderWeight || (window.ui ? window.ui.riderWeight : 75);
        const wkgVal = weight > 0 ? (power / weight).toFixed(1) : '0.0';
        const speed = data.speed ? data.speed.toFixed(1) : '0.0';
        const dist = (data.total_dist / 1000).toFixed(2);

        if (this.el.hr) this.el.hr.textContent = hr;
        if (this.el.rpm) this.el.rpm.textContent = cadence;
        if (this.el.wkg) this.el.wkg.textContent = wkgVal;
        if (this.el.speed) this.el.speed.textContent = speed;
        if (this.el.dist) this.el.dist.textContent = dist;
    }

    setElapsed(seconds) {
        if (!this.el.elapsed) return;
        const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
        const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
        const s = Math.floor(seconds % 60).toString().padStart(2, '0');
        this.el.elapsed.textContent = `${h}:${m}:${s}`;
    }

    setPowerZone(zone) {
        if (!this.el.hud) return;
        for (let i = 0; i <= 6; i++) this.el.hud.classList.remove(`zone-${i}`);
        if (zone >= 0 && zone <= 6) this.el.hud.classList.add(`zone-${zone}`);
    }

    setPowerColor(color) {
        if (this.el.primaryValue) this.el.primaryValue.style.color = color || '';
    }
}
