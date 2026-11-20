// Argus Cyclist - Virtual Cycling Environment for interactive bicycling experiments.
// Copyright (C) 2026  Paulo Sérgio
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Corner minimap for the 3D view: the whole route (north up), colored by grade with the
// same scale as the road edges, plus start/finish markers and the rider's position and
// heading. The route is drawn once into an offscreen canvas; each update only blits it
// and draws the rider, so it costs well under a millisecond.

import { gradeColor } from './themes.js';

const SIZE = 210;        // CSS px (square)
const PAD = 14;          // CSS px around the route

export class MiniMap {
    /** @param {HTMLElement} parent element that hosts the minimap (positioned) */
    constructor(parent) {
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'scene3d-minimap';
        this.canvas.style.cssText =
            `position:absolute;top:12px;right:12px;width:${SIZE}px;height:${SIZE}px;border-radius:14px;` +
            'background:rgba(8,12,20,.62);border:1px solid rgba(255,255,255,.12);' +
            'box-shadow:0 4px 18px rgba(0,0,0,.35);pointer-events:none';
        parent.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');
        this.model = null;
        this._route = null;
        this._dpr = 0;
        this.visible = true;
    }

    setVisible(visible) {
        this.visible = !!visible;
        this.canvas.style.display = this.visible ? '' : 'none';
    }

    /** Pre-renders the route of a RouteModel. */
    setRoute(model) {
        this.model = model;
        this._route = null; // rebuilt lazily (also on DPR change)
    }

    _layout() {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const px = Math.round(SIZE * dpr);
        if (this.canvas.width !== px) { this.canvas.width = px; this.canvas.height = px; }
        this._dpr = dpr;
        const b = this.model.bounds;
        const w = Math.max(1, b.maxX - b.minX), h = Math.max(1, b.maxZ - b.minZ);
        const inner = (SIZE - 2 * PAD) * dpr;
        this._scale = inner / Math.max(w, h);
        // Center the route; north (+z) is up on screen.
        this._ox = px / 2 - ((b.minX + b.maxX) / 2) * this._scale;
        this._oz = px / 2 + ((b.minZ + b.maxZ) / 2) * this._scale;
    }

    _toScreen(x, z) {
        return [this._ox + x * this._scale, this._oz - z * this._scale];
    }

    _buildRoute() {
        this._layout();
        const m = this.model, dpr = this._dpr;
        const off = document.createElement('canvas');
        off.width = this.canvas.width; off.height = this.canvas.height;
        const g = off.getContext('2d');
        g.lineCap = 'round';
        g.lineJoin = 'round';

        // ~600 segments are plenty at this size; each takes the grade color of its start.
        const stride = Math.max(1, Math.floor(m.n / 600));
        const pts = [];
        for (let i = 0; i < m.n; i += stride) pts.push(i);
        if (pts[pts.length - 1] !== m.n - 1) pts.push(m.n - 1);

        // Dark casing first so the colored line reads on any background.
        g.strokeStyle = 'rgba(0,0,0,.65)';
        g.lineWidth = 6 * dpr;
        g.beginPath();
        pts.forEach((i, k) => { const [sx, sy] = this._toScreen(m.x[i], m.z[i]); k ? g.lineTo(sx, sy) : g.moveTo(sx, sy); });
        g.stroke();

        g.lineWidth = 3.2 * dpr;
        for (let k = 0; k < pts.length - 1; k++) {
            const a = pts[k], b = pts[k + 1];
            const c = gradeColor(m.grade[a]);
            g.strokeStyle = `rgb(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0})`;
            const [ax, ay] = this._toScreen(m.x[a], m.z[a]);
            const [bx, by] = this._toScreen(m.x[b], m.z[b]);
            g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
        }

        // Start (white ring) and finish (checkered-ish square) for open routes.
        const [sx, sy] = this._toScreen(m.x[0], m.z[0]);
        g.fillStyle = '#fff'; g.strokeStyle = '#111'; g.lineWidth = 1.5 * dpr;
        g.beginPath(); g.arc(sx, sy, 4.5 * dpr, 0, Math.PI * 2); g.fill(); g.stroke();
        if (!m.closed) {
            const [fx, fy] = this._toScreen(m.x[m.n - 1], m.z[m.n - 1]);
            const s = 4 * dpr;
            g.fillStyle = '#111'; g.fillRect(fx - s, fy - s, 2 * s, 2 * s);
            g.fillStyle = '#fff'; g.fillRect(fx - s, fy - s, s, s); g.fillRect(fx, fy, s, s);
        }

        // North marker.
        g.fillStyle = 'rgba(255,255,255,.7)';
        g.font = `${10 * dpr}px sans-serif`;
        g.textAlign = 'center';
        g.fillText('N', off.width - 12 * dpr, 14 * dpr);
        this._route = off;
    }

    /** Draws the rider at pose {x, z, heading}. */
    update(pose) {
        if (!this.visible || !this.model) return;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        if (!this._route || dpr !== this._dpr) this._buildRoute();
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.drawImage(this._route, 0, 0);

        const [x, y] = this._toScreen(pose.x, pose.z);
        // Heading: 0 = north (up), clockwise positive, as in the route model.
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(pose.heading);
        const s = this._dpr;
        ctx.fillStyle = 'rgba(56,189,248,.25)';
        ctx.beginPath(); ctx.arc(0, 0, 11 * s, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ff3b30';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.6 * s;
        ctx.beginPath();
        ctx.moveTo(0, -8 * s); ctx.lineTo(5.5 * s, 6 * s); ctx.lineTo(0, 3 * s); ctx.lineTo(-5.5 * s, 6 * s);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.restore();
    }

    dispose() {
        this.canvas.remove();
    }
}
