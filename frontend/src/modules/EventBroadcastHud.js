// Argus Cyclist - Virtual Cycling Environment for interactive bicycling experiments.
// Copyright (C) 2026  Paulo Sérgio
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Live graphics of the event mode challenges (components/eventLiveHud.html): mode tag,
// race clock, live classification tower, athlete strip and the mode's own block (sprint
// progress bar, climb profile, zone score). Pure view: ChallengeController feeds it.

/** Power zones of the Zone Challenge (% of FTP upper bounds), as scored by ChallengeController. */
export const EVENT_ZONES = [
    { id: 1, name: 'RECUPERAÇÃO', max: 55, mult: 1.0 },
    { id: 2, name: 'RESISTÊNCIA', max: 75, mult: 1.0 },
    { id: 3, name: 'RITMO', max: 90, mult: 1.5 },
    { id: 4, name: 'LIMIAR', max: 105, mult: 2.2 },
    { id: 5, name: 'VO2MÁX', max: 121, mult: 3.5 },
    { id: 6, name: 'ANAERÓBICO', max: Infinity, mult: 5.0 }
];

/** Metric strip per mode: [key, label, unit, highlighted]. */
const METRICS = {
    sprint200: [['power', 'POTÊNCIA', 'W'], ['cadence', 'CADÊNCIA', 'rpm'], ['speed', 'VELOCIDADE', 'km/h'], ['wkg', 'W/KG', '']],
    climb400: [['wkg', 'W/KG', '', true], ['power', 'POTÊNCIA', 'W'], ['cadence', 'CADÊNCIA', 'rpm'], ['speed', 'VELOCIDADE', 'km/h']],
    timeTrial: [['power', 'POTÊNCIA', 'W'], ['pct', '% DO FTP', '%'], ['cadence', 'CADÊNCIA', 'rpm']]
};

// Profile drawing area inside the 440x64 SVG.
const PROFILE = { x0: 6, x1: 434, yTop: 8, yBase: 58, floor: 60 };

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

/** Formats seconds as "18.42" or "1:02.31" (no unit, broadcast style). */
export function formatClock(seconds) {
    const t = Math.max(0, seconds || 0);
    if (t < 60) return t.toFixed(2);
    const m = Math.floor(t / 60);
    return `${m}:${(t - m * 60).toFixed(2).padStart(5, '0')}`;
}

export function zoneForPct(pct) {
    return EVENT_ZONES.find((z) => pct < z.max) || EVENT_ZONES[EVENT_ZONES.length - 1];
}

export class EventBroadcastHud {
    constructor(root = document.getElementById('eventLiveHud')) {
        this.root = root;
        this.mode = null;
        this.distance = 0;
        this.profile = null;
        this.metricEls = {};
        this.roles = {};
        root?.querySelectorAll('[data-role]').forEach((el) => { this.roles[el.dataset.role] = el; });
    }

    el(role) {
        return this.roles[role] || null;
    }

    /** Writes text only when it changed (called every frame). */
    text(role, value) {
        const el = typeof role === 'string' ? this.el(role) : role;
        const v = String(value ?? '');
        if (el && el.textContent !== v) el.textContent = v;
    }

    /**
     * Shows the graphics for a challenge.
     * opts: { title, rider, riderInfo, record: {name, score}|null, distance, profile: [{d, h}], ftp }
     */
    open(mode, opts = {}) {
        if (!this.root) return;
        this.mode = mode;
        this.distance = opts.distance || 0;
        this.root.dataset.mode = mode;
        this.text('mode', opts.title || '');
        this.text('rider', (opts.rider || '').toUpperCase());
        this.text('riderInfo', opts.riderInfo || '');
        this.el('riderInfo')?.classList.toggle('hidden', !opts.riderInfo);

        const isPoints = mode === 'timeTrial';
        this.setClock(isPoints ? '1:00' : formatClock(0), isPoints ? 'FALTAM' : 'TEMPO');
        this.renderMetrics(mode);
        this.setTower([], isPoints ? 'AO VIVO' : 'PROJEÇÃO');
        this.hideCountdown();
        this.hideFinish();

        const rec = opts.record;
        const recText = rec ? `${rec.name.toUpperCase()} ${formatClock(rec.score)}` : 'SEM RECORDE';
        this.text('gapRecord', recText);
        this.text('ghostLegendText', rec ? `Ghost · ${rec.name} ${formatClock(rec.score)} s` : 'Sem ghost: você abre o ranking');
        this.el('trackGhost')?.classList.toggle('hidden', !rec);
        this.el('profileGhost')?.classList.toggle('hidden', !rec);
        this.setGap(null);

        if (mode === 'sprint200') this.setTrack(0, 0);
        if (mode === 'climb400') this.buildProfile(opts.profile);
        if (isPoints) {
            const ftp = Math.round(opts.ftp || 200);
            this.text('ftpLabel', opts.weight
                ? `ZONAS PARA ${Math.round(opts.weight)} KG · REFERÊNCIA ${ftp} W`
                : `ZONAS DE POTÊNCIA · REFERÊNCIA ${ftp} W`);
            this.setScore(0, 1, null, 'Fique na Z4 ou acima para pontuar mais rápido.');
            this.setZone(null, 0);
        }

        this.root.classList.remove('hidden');
    }

    close() {
        this.root?.classList.add('hidden');
        this.hideCountdown();
        this.hideFinish();
        this.mode = null;
    }

    isOpen() {
        return this.mode !== null;
    }

    renderMetrics(mode) {
        const box = this.el('metrics');
        if (!box) return;
        const list = METRICS[mode] || METRICS.sprint200;
        box.style.setProperty('--ev-metric-cols', list.length);
        box.innerHTML = list.map(([key, label, unit, hl]) => `
            <div class="ev-live-metric${hl ? ' is-key' : ''}">
                <span class="ev-live-metric-lbl">${label}</span>
                <span class="ev-live-metric-val"><span data-metric="${key}">0</span>${unit ? `<small> ${unit}</small>` : ''}</span>
            </div>`).join('');
        this.metricEls = {};
        box.querySelectorAll('[data-metric]').forEach((el) => { this.metricEls[el.dataset.metric] = el; });
    }

    /** values: { power, cadence, speed, wkg, pct } already formatted. */
    setMetrics(values) {
        for (const [key, v] of Object.entries(values)) {
            if (this.metricEls[key]) this.text(this.metricEls[key], v);
        }
    }

    setClock(value, label) {
        this.text('clock', value);
        if (label !== undefined) this.text('clockLabel', label);
    }

    // ----- Sprint: progress bar -----

    setTrack(d, ghostD) {
        const D = this.distance || 1;
        const pct = (x) => `${(Math.max(0, Math.min(D, x)) / D * 100).toFixed(2)}%`;
        this.text('distLabel', `${Math.round(Math.min(D, d))} / ${Math.round(D)} m`);
        const fill = this.el('trackFill'), rider = this.el('trackRider'), ghost = this.el('trackGhost');
        if (fill) fill.style.width = pct(d);
        if (rider) rider.style.left = pct(d);
        if (ghost && ghostD !== null) ghost.style.left = pct(ghostD);
    }

    // ----- Climb: elevation profile -----

    /** profile: [{d, h}] from the loaded course (distance m, elevation m), start to finish. */
    buildProfile(profile) {
        const D = this.distance || 1;
        let pts = (profile || []).filter((p) => p.d <= D + 1e-6);
        if (pts.length < 2) pts = [{ d: 0, h: 0 }, { d: D, h: 0 }];
        const h0 = pts[0].h;
        const top = Math.max(1, ...pts.map((p) => p.h - h0));
        this.profile = { pts, h0, top };
        const line = pts.map((p) => `${this.profileX(p.d)},${this.profileY(p.h)}`).join(' ');
        this.el('profileLine')?.setAttribute('points', line);
        this.el('profileArea')?.setAttribute('points', `${PROFILE.x0},${PROFILE.floor} ${line} ${PROFILE.x1},${PROFILE.floor}`);
        this.text('climbLabel', `PERFIL · +${Math.round(pts[pts.length - 1].h - h0)} M`);
        this.setClimb(0, 0, pts[0].grade ?? 0);
    }

    profileX(d) {
        return (PROFILE.x0 + Math.max(0, Math.min(1, d / (this.distance || 1))) * (PROFILE.x1 - PROFILE.x0)).toFixed(1);
    }

    profileY(h) {
        const p = this.profile;
        return (PROFILE.yBase - ((h - p.h0) / p.top) * (PROFILE.yBase - PROFILE.yTop)).toFixed(1);
    }

    /** Elevation at distance d by linear interpolation over the profile points. */
    heightAt(d) {
        const pts = this.profile?.pts;
        if (!pts) return 0;
        if (d <= pts[0].d) return pts[0].h;
        for (let i = 1; i < pts.length; i++) {
            if (pts[i].d >= d) {
                const a = pts[i - 1], b = pts[i];
                return a.h + (b.h - a.h) * ((d - a.d) / Math.max(1e-6, b.d - a.d));
            }
        }
        return pts[pts.length - 1].h;
    }

    setClimb(d, ghostD, grade) {
        if (!this.profile) return;
        const D = this.distance || 1;
        const dd = Math.max(0, Math.min(D, d));
        this.text('climbDist', `${Math.round(dd)} / ${Math.round(D)} m`);
        this.text('grade', (Number(grade) || 0).toFixed(1));
        const done = this.profile.pts.filter((p) => p.d <= dd).map((p) => `${this.profileX(p.d)},${this.profileY(p.h)}`);
        done.push(`${this.profileX(dd)},${this.profileY(this.heightAt(dd))}`);
        this.el('profileDone')?.setAttribute('points', `${PROFILE.x0},${PROFILE.floor} ${done.join(' ')} ${this.profileX(dd)},${PROFILE.floor}`);
        const rider = this.el('profileRider');
        rider?.setAttribute('cx', this.profileX(dd));
        rider?.setAttribute('cy', this.profileY(this.heightAt(dd)));
        if (ghostD !== null) {
            const g = Math.max(0, Math.min(D, ghostD));
            const ghost = this.el('profileGhost');
            ghost?.setAttribute('cx', this.profileX(g));
            ghost?.setAttribute('cy', this.profileY(this.heightAt(g)));
        }
    }

    // ----- Races: gap to the record -----

    /** gap in s (negative = ahead of the record), or null before the first comparison. */
    setGap(gap) {
        const box = this.el('gapBox');
        if (gap === null || gap === undefined) {
            this.text('gap', '0.00');
            this.text('gapWord', this.el('trackGhost')?.classList.contains('hidden') ? 'SEM GHOST' : 'NA LARGADA');
            if (box) box.dataset.tone = 'even';
            return;
        }
        const ahead = gap < 0;
        this.text('gap', `${ahead ? '−' : '+'}${Math.abs(gap).toFixed(2)}`);
        this.text('gapWord', ahead ? 'À FRENTE' : 'ATRÁS');
        if (box) box.dataset.tone = ahead ? 'ahead' : 'behind';
    }

    // ----- Classification tower -----

    /** rows: [{ name, value, live }] in rank order (already cut to fit). */
    setTower(rows, hint) {
        if (hint !== undefined) this.text('towerHint', hint);
        const box = this.el('towerRows');
        if (!box) return;
        const html = rows.length ? rows.map((r, i) => `
            <div class="ev-tower-row${r.live ? ' is-live' : ''}">
                <span class="ev-tower-pos">${r.pos ?? i + 1}</span>
                <span class="ev-tower-name">${escapeHtml(r.name)}</span>
                <span class="ev-tower-val">${escapeHtml(r.value)}</span>
            </div>`).join('')
            : '<div class="ev-tower-empty">Sem tempos ainda: você abre o ranking.</div>';
        if (box.innerHTML !== html) box.innerHTML = html;
    }

    // ----- Zone Challenge -----

    /** zone: EVENT_ZONES entry or null (not pedalling yet). */
    setScore(score, mult, zone, hint) {
        this.text('score', String(Math.floor(score || 0)));
        this.text('mult', (mult || 1).toFixed(1));
        const box = this.el('multBox');
        if (box) box.dataset.zone = zone ? zone.id : 0;
        if (hint !== undefined) this.text('scoreHint', hint);
    }

    setZone(zone, pct) {
        const id = zone ? zone.id : 0;
        this.el('zones')?.querySelectorAll('[data-zone]').forEach((z) => {
            z.classList.toggle('is-on', Number(z.dataset.zone) === id);
        });
        const box = this.el('zoneBox');
        if (box) box.dataset.zone = id;
        this.text('zoneId', zone ? `Z${zone.id}` : '—');
        this.text('zoneName', zone ? zone.name : '');
        this.text('pctLabel', zone ? `${Math.round(pct)}% DO FTP` : '');
    }

    // ----- Countdown and finish banner -----

    showCountdown(value, sub) {
        const el = this.el('countdown');
        if (!el) return;
        this.text('count', value);
        if (sub !== undefined) this.text('countSub', sub);
        el.classList.toggle('is-go', value === 'VAI!');
        el.classList.remove('hidden');
    }

    hideCountdown() {
        this.el('countdown')?.classList.add('hidden');
    }

    /** tone: 'record' (green badge), 'behind' (red outline) or 'even' (yellow outline). */
    showFinish({ label = 'CHEGADA', value = '', note = '', tone = 'even' } = {}) {
        this.text('finishLabel', label);
        this.text('finishValue', value);
        this.text('finishNote', note);
        const n = this.el('finishNote');
        if (n) {
            n.dataset.tone = tone;
            n.classList.toggle('hidden', !note);
        }
        this.el('finish')?.classList.remove('hidden');
    }

    hideFinish() {
        this.el('finish')?.classList.add('hidden');
    }
}
