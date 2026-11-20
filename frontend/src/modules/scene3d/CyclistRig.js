// Argus Cyclist - Virtual Cycling Environment for interactive bicycling experiments.
// Copyright (C) 2026  Paulo Sérgio
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Procedural cyclist: bike + rider built from primitives, no external assets.
//  - crank angle integrates cadence; legs follow the pedals with 2-bone IK
//  - wheels spin with speed
//  - the whole rig leans into curves (lean = atan(v² · curvature / g))
// The same rig, with alpha < 1, is used for ghosts.
//
// Local space: +z forward, +y up, +x right; the root sits on the road surface.

import {
    TransformNode, StandardMaterial, Color3, Vector3, Quaternion,
    CreateTorus, CreateTube, CreateCapsule, CreateSphere, CreateCylinder, CreateBox
} from './babylon.js';

const WHEEL_R = 0.34;
const WHEELBASE = 1.0;
const THIGH = 0.44;
const SHIN = 0.43;
const CRANK = 0.17;
const G = 9.81;
const MAX_LEAN = 0.4;  // rad (~23°)

const UP = Vector3.Up();

export class CyclistRig {
    /**
     * @param {Scene} scene
     * @param {object} opts {name, jersey, frame, alpha}
     */
    constructor(scene, { name = 'rider', jersey = '#ff3b30', frame = '#d0d4dc', alpha = 1 } = {}) {
        this.scene = scene;
        this.name = name;
        this.root = new TransformNode(name, scene);
        this.root.rotationQuaternion = new Quaternion();
        // Lean pivots around the tire contact line, so a separate node holds the body.
        this.body = new TransformNode(`${name}-body`, scene);
        this.body.parent = this.root;
        this.body.rotationQuaternion = new Quaternion();

        this.crank = 0;
        this.lean = 0;
        this._meshes = [];
        this._tmp = { a: new Vector3(), b: new Vector3(), dir: new Vector3() };

        const mat = (hex, key) => {
            const m = new StandardMaterial(`${name}-${key}`, scene);
            m.diffuseColor = Color3.FromHexString(hex);
            m.specularColor = new Color3(0.15, 0.15, 0.15);
            if (alpha < 1) {
                m.alpha = alpha;
                m.emissiveColor = Color3.FromHexString(hex).scale(0.7);
            }
            return m;
        };
        this.mats = {
            frame: mat(frame, 'frame'), tire: mat('#151515', 'tire'), metal: mat('#9aa0a8', 'metal'),
            jersey: mat(jersey, 'jersey'), shorts: mat('#1d1d24', 'shorts'), skin: mat('#e0b48c', 'skin')
        };
        this._build();
    }

    _own(mesh, parent, material) {
        mesh.parent = parent;
        mesh.material = material;
        mesh.isPickable = false;
        this._meshes.push(mesh);
        return mesh;
    }

    _tube(from, to, radius, material, parent = this.body) {
        return this._own(CreateTube(`${this.name}-tube`, { path: [from, to], radius, tessellation: 6, cap: 2 }, this.scene), parent, material);
    }

    _build() {
        const { name, scene, mats, body } = this;

        // --- Wheels (hub node spins around x; torus tire + 4 spokes) ---
        const mkWheel = (z) => {
            const hub = new TransformNode(`${name}-hub`, scene);
            hub.parent = body;
            hub.position.set(0, WHEEL_R, z);
            const tire = this._own(CreateTorus(`${name}-tire`, { diameter: WHEEL_R * 2 - 0.03, thickness: 0.04, tessellation: 28 }, scene), hub, mats.tire);
            tire.rotation.z = Math.PI / 2;
            for (let k = 0; k < 4; k++) {
                const spoke = this._own(CreateBox(`${name}-spoke`, { width: 0.012, height: WHEEL_R * 2 - 0.08, depth: 0.012 }, scene), hub, mats.metal);
                spoke.rotation.x = (k * Math.PI) / 4;
            }
            return hub;
        };
        this.wheels = [mkWheel(-WHEELBASE / 2), mkWheel(WHEELBASE / 2)];

        // --- Frame ---
        const rearAxle = new Vector3(0, WHEEL_R, -WHEELBASE / 2);
        const frontAxle = new Vector3(0, WHEEL_R, WHEELBASE / 2);
        this.bb = new Vector3(0, 0.3, -0.04);
        const seatTop = new Vector3(0, 0.88, -0.2);
        const headTop = new Vector3(0, 0.9, 0.38);
        const headLow = new Vector3(0, 0.76, 0.41);
        this._tube(rearAxle, this.bb, 0.016, mats.frame);
        this._tube(rearAxle, seatTop, 0.014, mats.frame);
        this._tube(this.bb, seatTop, 0.02, mats.frame);
        this._tube(seatTop, headTop, 0.02, mats.frame);
        this._tube(this.bb, headLow, 0.024, mats.frame);
        this._tube(headTop, frontAxle, 0.018, mats.frame);
        // Saddle and handlebar.
        const saddle = this._own(CreateBox(`${name}-saddle`, { width: 0.12, height: 0.04, depth: 0.26 }, scene), body, mats.tire);
        saddle.position.set(0, 0.96, -0.24);
        this._tube(seatTop, new Vector3(0, 0.94, -0.23), 0.012, mats.metal);
        this._tube(headTop, new Vector3(0, 0.98, 0.46), 0.014, mats.metal);
        this.barL = new Vector3(-0.2, 0.98, 0.5);
        this.barR = new Vector3(0.2, 0.98, 0.5);
        this._tube(this.barL, this.barR, 0.014, mats.tire);

        // --- Crankset: arms + pedals rotate with the crank node ---
        this.crankNode = new TransformNode(`${name}-crank`, scene);
        this.crankNode.parent = body;
        this.crankNode.position.copyFrom(this.bb);
        const ring = this._own(CreateCylinder(`${name}-ring`, { diameter: 0.2, height: 0.01, tessellation: 18 }, scene), this.crankNode, mats.metal);
        ring.rotation.z = Math.PI / 2;
        ring.position.x = 0.07;
        for (const side of [-1, 1]) {
            const arm = this._own(CreateBox(`${name}-crank-arm`, { width: 0.02, height: CRANK, depth: 0.03 }, scene), this.crankNode, mats.metal);
            // Right arm points along +z at crank = 0 (matches the pedal formula below).
            arm.position.set(side * 0.09, 0, side * (CRANK / 2));
            arm.rotation.x = Math.PI / 2;
        }

        // --- Rider ---
        const hip = new Vector3(0, 1.0, -0.2);
        const shoulder = new Vector3(0, 1.3, 0.25);
        this.hip = hip;
        const torso = this._own(CreateCapsule(`${name}-torso`, { radius: 0.14, height: 0.66, tessellation: 10 }, scene), body, mats.jersey);
        this._placeBone(torso, hip, shoulder);
        const pelvis = this._own(CreateSphere(`${name}-pelvis`, { diameter: 0.3, segments: 8 }, scene), body, mats.shorts);
        pelvis.position.copyFrom(hip);
        const head = this._own(CreateSphere(`${name}-head`, { diameter: 0.21, segments: 10 }, scene), body, mats.skin);
        head.position.set(0, 1.47, 0.38);
        const helmet = this._own(CreateSphere(`${name}-helmet`, { diameter: 0.25, segments: 10, slice: 0.55 }, scene), body, mats.jersey);
        helmet.position.set(0, 1.5, 0.37);
        helmet.rotation.x = -0.35;

        for (const side of [-1, 1]) {
            const sh = new Vector3(side * 0.17, shoulder.y, shoulder.z);
            const hand = side < 0 ? this.barL : this.barR;
            const elbow = new Vector3(side * 0.2, 1.12, 0.42);
            this._tube(sh, elbow, 0.045, mats.jersey);
            this._tube(elbow, hand, 0.038, mats.skin);
        }

        // Legs: thigh + shin per side, placed every frame by IK.
        this.legs = [-1, 1].map((side) => ({
            side,
            thigh: this._own(CreateCylinder(`${name}-thigh`, { height: THIGH, diameterTop: 0.15, diameterBottom: 0.11, tessellation: 8 }, scene), body, mats.shorts),
            shin: this._own(CreateCylinder(`${name}-shin`, { height: SHIN, diameterTop: 0.1, diameterBottom: 0.07, tessellation: 8 }, scene), body, mats.skin)
        }));
        this._updateLegs();
    }

    // Cylinder (axis +y) spanning a → b. Reuses the mesh quaternion.
    _placeBone(mesh, a, b) {
        mesh.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
        const dir = this._tmp.dir.copyFrom(b).subtractInPlace(a).normalize();
        if (!mesh.rotationQuaternion) mesh.rotationQuaternion = new Quaternion();
        Quaternion.FromUnitVectorsToRef(UP, dir, mesh.rotationQuaternion);
    }

    _updateLegs() {
        const { bb, hip } = this;
        for (const leg of this.legs) {
            // Right pedal at crank angle, left pedal opposite. Front → bottom → back → top,
            // the same sense as the wheels and as crankNode.rotation.x (+z maps to (-sin, cos)).
            const a = this.crank + (leg.side > 0 ? 0 : Math.PI);
            const x = leg.side * 0.11;
            const pedal = this._tmp.a.set(x, bb.y - Math.sin(a) * CRANK, bb.z + Math.cos(a) * CRANK);
            const h = this._tmp.b.set(x, hip.y, hip.z);
            const dy = pedal.y - h.y, dz = pedal.z - h.z;
            const d = Math.min(THIGH + SHIN - 1e-3, Math.sqrt(dy * dy + dz * dz));
            // Law of cosines: angle at the hip between hip→pedal and the thigh.
            const cosA = (THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d);
            const ang = Math.acos(Math.max(-1, Math.min(1, cosA)));
            // Sagittal plane (y, z); the knee bends forward (+z).
            const base = Math.atan2(dz, -dy);
            const kAng = base + ang;
            const knee = new Vector3(x, h.y - Math.cos(kAng) * THIGH, h.z + Math.sin(kAng) * THIGH);
            this._placeBone(leg.thigh, h, knee);
            this._placeBone(leg.shin, knee, pedal);
        }
    }

    /**
     * Places and animates the rig.
     * @param {number} dt seconds since last frame
     * @param {{x,y,z,heading,grade,curvature}} pose route sample at the rider position
     * @param {number} lateral meters to the right of the road center
     * @param {number} speed m/s
     * @param {number} cadence rpm
     */
    update(dt, pose, lateral, speed, cadence) {
        const nx = Math.cos(pose.heading), nz = -Math.sin(pose.heading);
        this.root.position.set(pose.x + nx * lateral, pose.y + 0.02, pose.z + nz * lateral);
        const pitch = -Math.atan((pose.grade || 0) / 100);
        Quaternion.RotationYawPitchRollToRef(pose.heading, pitch, 0, this.root.rotationQuaternion);

        // Lean into the curve; negative roll leans to the right in Babylon's left-handed frame.
        const target = Math.max(-MAX_LEAN, Math.min(MAX_LEAN, Math.atan((speed * speed * (pose.curvature || 0)) / G)));
        this.lean += (target - this.lean) * (1 - Math.exp(-3 * dt));
        Quaternion.RotationYawPitchRollToRef(0, 0, -this.lean, this.body.rotationQuaternion);

        this.crank += (cadence / 60) * 2 * Math.PI * dt;
        this.crankNode.rotation.x = this.crank;
        const spin = (speed / WHEEL_R) * dt;
        for (const w of this.wheels) w.rotation.x += spin;
        this._updateLegs();
    }

    dispose() {
        this.root.dispose(false, true);
    }
}
