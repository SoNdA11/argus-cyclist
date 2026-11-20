// Argus Cyclist - Virtual Cycling Environment for interactive bicycling experiments.
// Copyright (C) 2026  Paulo Sérgio
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Chase camera that follows the rider along the route (not in a straight line behind
// it), so curves read naturally. Position and target are smoothed exponentially and the
// camera never goes below the road it is looking over.

import { FreeCamera, Vector3 } from './babylon.js';

export class ChaseCamera {
    constructor(scene, model, { back = 6.5, height = 2.3, ahead = 6, lookHeight = 1.0, side = 0, stiffness = 5 } = {}) {
        this.model = model;
        // side: extra lateral offset of the camera only (side views, replays).
        this.opts = { back, height, ahead, lookHeight, side, stiffness };
        this.camera = new FreeCamera('chase-cam', new Vector3(0, height, -back), scene);
        this.camera.minZ = 0.1;
        this.camera.maxZ = 2600;
        this.camera.fov = 0.9;
        this.camera.inputs.clear();
        this._pos = new Vector3();
        this._look = new Vector3();
        this._tPos = new Vector3();
        this._tLook = new Vector3();
        this._s = {};
        this._initialized = false;
    }

    _targets(distance, lateral) {
        const { back, height, ahead, lookHeight, side } = this.opts;
        // Work on the wrapped rider position so "behind" at 0 m does not jump to the route end.
        distance = this.model.wrap(distance);
        const behind = this.model.sampleOpen(distance - back, this._s);
        let nx = Math.cos(behind.heading), nz = -Math.sin(behind.heading);
        const camLat = lateral + side;
        this._tPos.set(behind.x + nx * camLat, behind.y + height, behind.z + nz * camLat);
        const front = this.model.sampleOpen(distance + ahead, this._s);
        nx = Math.cos(front.heading); nz = -Math.sin(front.heading);
        this._tLook.set(front.x + nx * lateral, front.y + lookHeight, front.z + nz * lateral);
    }

    /** Snap to the rider (no smoothing), e.g. after a route change. */
    reset(distance, lateral) {
        this._targets(distance, lateral);
        this._pos.copyFrom(this._tPos);
        this._look.copyFrom(this._tLook);
        this._initialized = true;
        this._apply();
    }

    update(dt, distance, lateral) {
        if (!this._initialized) { this.reset(distance, lateral); return; }
        this._targets(distance, lateral);
        // Route wrap (end → start) or a jump: snap instead of flying across the map.
        if (Vector3.DistanceSquared(this._pos, this._tPos) > 60 * 60) { this.reset(distance, lateral); return; }
        const k = 1 - Math.exp(-this.opts.stiffness * dt);
        Vector3.LerpToRef(this._pos, this._tPos, k, this._pos);
        Vector3.LerpToRef(this._look, this._tLook, Math.min(1, k * 1.6), this._look);
        // Keep at least 1.2 m above the road under the camera (e.g. over crests).
        const under = this.model.sampleOpen(this.model.wrap(distance) - this.opts.back, this._s);
        if (this._pos.y < under.y + 1.2) this._pos.y = under.y + 1.2;
        this._apply();
    }

    _apply() {
        this.camera.position.copyFrom(this._pos);
        this.camera.setTarget(this._look);
    }
}
