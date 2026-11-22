// Argus Cyclist - Virtual Cycling Environment for interactive bicycling experiments.
// Copyright (C) 2026  Paulo Sérgio
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Procedural cyclist and bicycle, generated in code (no external assets).
//
// Rider: anatomical proportions for a ~1.78 m adult, limbs as tapered tubes with
// rounded joints, flattened torso, helmet, glasses, gloves, shoes and bib shorts.
// Skeleton: the limb "bones" are placed every frame from joint positions:
//   legs  2-bone IK from the hip to the ankle, the foot clipped to the pedal, whose
//         angle integrates the cadence (front → bottom → back → top);
//   arms  2-bone IK from the shoulder to the hands on the bars (or forearms on the
//         aero pads), elbows bending outwards;
//   hips  rock slightly with the pedal stroke.
// Bikes:
//   'road' GLB model (BikeModel.js, generated in Blender by tools/blender/argus_bike):
//          the rider is fitted to its sockets (saddle, hoods, pedals); the procedural
//          road bike below is only used if the model fails to load;
//   'tt'   time-trial frame with aero tubes, disc rear wheel, deep front rim, aero
//          extensions with arm pads, aero helmet, nearly flat back.
// The whole rig leans into curves (lean = atan(v² · curvature / g)); with alpha < 1
// it is used for ghosts.
//
// Local space: +z forward, +y up, +x right; the root sits on the road surface.

import {
    TransformNode, StandardMaterial, PBRMaterial, Color3, Vector3, Quaternion, Mesh,
    CreateTorus, CreateTube, CreateSphere, CreateCylinder, CreateBox
} from './babylon.js';
import { BikeModel } from './BikeModel.js';
import { RiderModel } from './RiderModel.js';

const WHEEL_R = 0.34;
const WHEELBASE = 1.0;
const THIGH = 0.44;
const SHIN = 0.43;
const UPPER_ARM = 0.3;
const FOREARM = 0.29;
const CRANK = 0.172;
const G = 9.81;
const MAX_LEAN = 0.4;  // rad (~23°)
const MAX_STEER = 0.35; // rad
const UP = Vector3.Up();
const ARM_REACH = 0.92; // shoulder→hand distance as a fraction of the straight arm

/**
 * Riding geometry from the bike model's contact points: hip above/behind the saddle
 * socket, hands on the hoods, torso angle solved so the elbows keep a natural bend.
 */
function fitGeometry(fit) {
    const hip = fit.saddle.add(new Vector3(0, 0.035, 0.03));
    const torsoLength = 0.56;
    const hand = fit.hands[1];
    const want = ARM_REACH * (UPPER_ARM + FOREARM);
    let best = 0.68, err = Infinity;
    for (let a = 0.3; a <= 1.1; a += 0.005) {
        const sh = new Vector3(0.19, hip.y + Math.sin(a) * torsoLength - 0.02, hip.z + Math.cos(a) * torsoLength);
        const e = Math.abs(Vector3.Distance(sh, hand) - want);
        if (e < err) { err = e; best = a; }
    }
    return {
        hip, torsoAngle: best, torsoLength, hands: fit.hands, elbowsOnPads: false,
        headOffset: new Vector3(0, 0.15, 0.1), headPitch: -0.25
    };
}

// Riding geometry per bike type (bike coordinates, meters).
const GEOMETRY = {
    road: {
        hip: new Vector3(0, 0.97, -0.22),
        torsoAngle: 0.68,          // rad above horizontal (~39°)
        torsoLength: 0.56,
        hands: [new Vector3(-0.2, 0.935, 0.5), new Vector3(0.2, 0.935, 0.5)],
        elbowsOnPads: false,
        headOffset: new Vector3(0, 0.15, 0.1),
        headPitch: -0.25
    },
    tt: {
        // Upper arms close to vertical on the pads, forearms along the extensions:
        // distances shoulder→elbow (0.29 m) and elbow→hands (0.28 m) match the bones.
        hip: new Vector3(0, 0.98, -0.15),
        torsoAngle: 0.41,          // ~23°
        torsoLength: 0.56,
        elbows: [new Vector3(-0.1, 0.92, 0.43), new Vector3(0.1, 0.92, 0.43)],
        hands: [new Vector3(-0.055, 0.975, 0.7), new Vector3(0.055, 0.975, 0.7)],
        elbowsOnPads: true,
        headOffset: new Vector3(0, 0.1, 0.14),
        headPitch: -0.55
    }
};

export const BIKE_TYPES = ['road', 'tt'];

export class CyclistRig {
    /**
     * @param {Scene} scene
     * @param {object} opts {name, jersey, frame, alpha, pbr, bike: 'road'|'tt'}
     */
    constructor(scene, { name = 'rider', jersey = '#ff3b30', frame = '#d0d4dc', alpha = 1, pbr = false, bike = 'road', model = true } = {}) {
        this.scene = scene;
        this.name = name;
        this.bike = GEOMETRY[bike] ? bike : 'road';
        this.geo = GEOMETRY[this.bike];
        this.bikeModel = null;
        this.ready = false;
        this._readyCbs = [];
        this.root = new TransformNode(name, scene);
        this.root.rotationQuaternion = new Quaternion();
        // Lean pivots around the tire contact line, so a separate node holds the body.
        this.body = new TransformNode(`${name}-body`, scene);
        this.body.parent = this.root;
        this.body.rotationQuaternion = new Quaternion();

        this.crank = 0;
        this.lean = 0;
        this.steer = 0;
        this.wheelAngle = 0;
        this.wheelR = WHEEL_R;
        this._meshes = [];
        this._tmp = { a: new Vector3(), b: new Vector3(), c: new Vector3(), dir: new Vector3() };

        // pbr: physically based materials for the realistic theme (sun in PBR units).
        const ROUGH = { frame: 0.32, carbon: 0.4, metal: 0.3, tire: 0.85, jersey: 0.72, shorts: 0.55, skin: 0.62, helmet: 0.35, glove: 0.8, shoe: 0.45, lens: 0.1, saddle: 0.6 };
        const METAL = { frame: 0.55, metal: 0.85, carbon: 0.2, lens: 0.6 };
        const mat = (hex, key) => {
            if (pbr) {
                const m = new PBRMaterial(`${name}-${key}`, scene);
                m.albedoColor = Color3.FromHexString(hex);
                m.roughness = ROUGH[key] ?? 0.6;
                m.metallic = METAL[key] ?? 0;
                if (alpha < 1) {
                    m.alpha = alpha;
                    m.emissiveColor = Color3.FromHexString(hex).scale(0.35);
                }
                return m;
            }
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
            frame: mat(frame, 'frame'), carbon: mat('#1b1d22', 'carbon'), tire: mat('#141414', 'tire'),
            metal: mat('#a3a8b0', 'metal'), jersey: mat(jersey, 'jersey'), shorts: mat('#17181d', 'shorts'),
            skin: mat('#d9a882', 'skin'), helmet: mat(this.bike === 'tt' ? jersey : '#f2f2f2', 'helmet'),
            glove: mat('#202226', 'glove'), shoe: mat('#f5f5f5', 'shoe'), lens: mat('#20252e', 'lens'),
            saddle: mat('#18191c', 'saddle')
        };
        if (model && this.bike === 'road') {
            // Models: bike first (the rider is fitted to its sockets), then the rigged rider.
            this.root.setEnabled(false);
            this._loadModels(scene, name, alpha);
        } else {
            this._buildBike();
            this._finishBuild();
        }
    }

    async _loadModels(scene, name, alpha) {
        let bike = null, rider = null;
        try {
            [bike, rider] = await Promise.all([
                BikeModel.create(scene, this.body, { name, alpha }),
                RiderModel.create(scene, this.body, { name, alpha }).catch((e) => {
                    console.error('[scene3d] rider model failed to load; using the procedural rider', e);
                    return null;
                })
            ]);
        } catch (e) {
            if (this._disposed) return;
            console.error('[scene3d] bike model failed to load; using the procedural bike', e);
            this._buildBike();
            this._finishBuild();
            return;
        }
        if (this._disposed) {
            bike.dispose();
            if (rider) rider.dispose();
            return;
        }
        this.bikeModel = bike;
        this.bb = bike.fit.bb;
        this.wheelR = bike.fit.wheelRadius;
        if (rider) {
            this.riderModel = rider;
            rider.setFit(bike.fit);
        } else {
            this.geo = fitGeometry(bike.fit);
        }
        this._finishBuild();
    }

    _finishBuild() {
        if (this.riderModel) {
            this._meshes = [...this.bikeModel.meshes, ...this.riderModel.meshes];
            this.riderModel.update((side, out) => this.bikeModel.pedalContact(side, out), 0);
            this.root.setEnabled(true);
            this.ready = true;
            for (const cb of this._readyCbs.splice(0)) cb(this);
            return;
        }
        this._buildRider();
        this._updateLegs();
        this._mergeStatic();
        this.root.setEnabled(true);
        this.ready = true;
        for (const cb of this._readyCbs.splice(0)) cb(this);
    }

    /** Runs `cb(rig)` once every mesh exists (immediately if already built). */
    whenReady(cb) {
        if (this.ready) cb(this);
        else this._readyCbs.push(cb);
    }

    /**
     * Fewer draw calls: meshes that never move relative to their node are merged per
     * material (frame, cockpit, torso, arms, head… on the body; tire/rim/spokes per
     * wheel; chainring and arms on the crank). Legs and pelvis stay separate (animated).
     */
    _mergeStatic() {
        const dynamic = new Set([this.pelvis]);
        for (const leg of this.legs) for (const m of [leg.thigh, leg.knee, leg.knee2, leg.shin, leg.shoe]) dynamic.add(m);
        const merged = [];
        const mergeChildren = (parent) => {
            const groups = new Map();
            for (const m of this._meshes) {
                if (m.parent !== parent || dynamic.has(m)) continue;
                if (!groups.has(m.material)) groups.set(m.material, []);
                groups.get(m.material).push(m);
            }
            for (const [material, list] of groups) {
                if (list.length === 1) { merged.push(list[0]); continue; }
                for (const m of list) { m.parent = null; } // bake transforms relative to the node
                const one = Mesh.MergeMeshes(list, true, true);
                one.name = `${this.name}-merged`;
                one.parent = parent;
                one.material = material;
                one.isPickable = false;
                merged.push(one);
            }
        };
        mergeChildren(this.body);
        if (!this.bikeModel) {
            for (const w of this.wheels) mergeChildren(w);
            mergeChildren(this.crankNode);
        }
        this._meshes = [...merged, ...dynamic, ...(this.bikeModel ? this.bikeModel.meshes : [])];
    }

    /** All meshes of the rig (shadow casting). */
    get meshes() {
        return this._meshes;
    }

    _own(mesh, parent, material) {
        mesh.parent = parent;
        mesh.material = material;
        mesh.isPickable = false;
        this._meshes.push(mesh);
        return mesh;
    }

    _tube(from, to, radius, material, parent = this.body, flatten = null) {
        const t = CreateTube(`${this.name}-tube`, { path: [from, to], radius, tessellation: 10, cap: 2 }, this.scene);
        if (flatten) {
            // Aero profile: squash across the travel direction around the tube axis.
            const mid = from.add(to).scale(0.5);
            t.setPivotPoint(mid);
            t.scaling.set(flatten, 1, 1);
            t.bakeCurrentTransformIntoVertices();
        }
        return this._own(t, parent, material);
    }

    /** Tapered tube along +y from 0 to `length` (radius = f(t), t ∈ [0, 1]); pivot at its base. */
    _bone(name, length, radiusAt, material, steps = 8, squash = null) {
        const path = [];
        for (let i = 0; i <= steps; i++) path.push(new Vector3(0, (i / steps) * length, 0));
        const mesh = CreateTube(`${this.name}-${name}`, {
            path, radiusFunction: (i) => radiusAt(i / steps), tessellation: 14, cap: 2
        }, this.scene);
        if (squash) { mesh.scaling.set(squash[0], 1, squash[1]); mesh.bakeCurrentTransformIntoVertices(); }
        mesh.rotationQuaternion = new Quaternion();
        return this._own(mesh, this.body, material);
    }

    _ball(name, diameter, material, scale = null, parent = this.body) {
        const s = CreateSphere(`${this.name}-${name}`, { diameter, segments: 12 }, this.scene);
        if (scale) { s.scaling.set(...scale); s.bakeCurrentTransformIntoVertices(); }
        return this._own(s, parent, material);
    }

    // ------------------------------------------------------------------
    // Bike
    // ------------------------------------------------------------------

    _buildBike() {
        const { name, scene, mats, body } = this;
        const tt = this.bike === 'tt';

        const mkWheel = (z, kind) => {
            const hub = new TransformNode(`${name}-hub`, scene);
            hub.parent = body;
            hub.position.set(0, WHEEL_R, z);
            const tire = this._own(CreateTorus(`${name}-tire`, { diameter: WHEEL_R * 2 - 0.025, thickness: 0.026, tessellation: 40 }, scene), hub, mats.tire);
            tire.rotation.z = Math.PI / 2;
            const rimDepth = kind === 'deep' ? 0.06 : 0.025;
            if (kind === 'disc') {
                const disc = this._own(CreateCylinder(`${name}-disc`, { diameter: WHEEL_R * 2 - 0.04, height: 0.022, tessellation: 40 }, scene), hub, mats.carbon);
                disc.rotation.z = Math.PI / 2;
                // A logo stripe so the spin is visible on a solid disc.
                const stripe = this._own(CreateBox(`${name}-disc-mark`, { width: 0.026, height: 0.08, depth: 0.25 }, scene), hub, mats.metal);
                stripe.position.z = 0.17;
            } else {
                // Rim: a torus with the rim depth, flattened toward the sides.
                const ring = this._own(CreateTorus(`${name}-rim`, { diameter: WHEEL_R * 2 - 0.04 - rimDepth, thickness: rimDepth, tessellation: 40 }, scene), hub, mats.carbon);
                ring.rotation.z = Math.PI / 2;
                ring.scaling.set(1, 0.35, 1); // flat toward the sides
                const spokes = kind === 'deep' ? 12 : 18;
                for (let k = 0; k < spokes; k++) {
                    const spoke = this._own(CreateCylinder(`${name}-spoke`, { diameter: 0.004, height: WHEEL_R * 2 - 0.1, tessellation: 4 }, scene), hub, mats.metal);
                    spoke.rotation.x = (k * Math.PI) / spokes;
                }
            }
            const hubBody = this._own(CreateCylinder(`${name}-hubbody`, { diameter: 0.04, height: 0.1, tessellation: 12 }, scene), hub, mats.metal);
            hubBody.rotation.z = Math.PI / 2;
            return hub;
        };
        this.wheels = [mkWheel(-WHEELBASE / 2, tt ? 'disc' : 'spoked'), mkWheel(WHEELBASE / 2, tt ? 'deep' : 'spoked')];

        // Frame (aero tubes on the TT bike are flattened across the travel direction).
        const aero = tt ? 0.55 : null;
        const rearAxle = new Vector3(0, WHEEL_R, -WHEELBASE / 2);
        const frontAxle = new Vector3(0, WHEEL_R, WHEELBASE / 2);
        this.bb = new Vector3(0, 0.29, -0.05);
        const seatTop = new Vector3(0, 0.84, tt ? -0.17 : -0.22);
        const headTop = new Vector3(0, tt ? 0.8 : 0.86, 0.38);
        const headLow = new Vector3(0, 0.7, 0.42);
        this._tube(this.bb, seatTop, 0.021, mats.frame, body, aero);
        this._tube(seatTop, headTop, 0.019, mats.frame, body, aero);
        this._tube(this.bb, headLow, 0.026, mats.frame, body, aero);
        this._tube(headLow, headTop, 0.024, mats.frame);
        for (const side of [-1, 1]) {
            const axle = rearAxle.add(new Vector3(side * 0.06, 0, 0));
            this._tube(this.bb.add(new Vector3(side * 0.03, 0, 0)), axle, 0.011, mats.frame);
            this._tube(seatTop.add(new Vector3(side * 0.02, -0.04, 0)), axle, 0.009, mats.frame);
            // Fork blades with a little rake.
            const crown = headLow.add(new Vector3(side * 0.035, -0.02, 0));
            const rake = new Vector3(side * 0.05, WHEEL_R + 0.18, WHEELBASE / 2 + 0.035);
            this._tube(crown, rake, 0.014, mats.frame, body, aero);
            this._tube(rake, frontAxle.add(new Vector3(side * 0.05, 0, 0)), 0.011, mats.frame, body, aero);
        }

        // Seatpost and saddle.
        const saddleAt = new Vector3(0, 0.955, seatTop.z - 0.03);
        this._tube(seatTop, saddleAt.add(new Vector3(0, -0.02, 0)), 0.013, mats.carbon);
        const saddle = this._ball('saddle', 0.12, mats.saddle, [1, 0.32, 2.3]);
        saddle.position.copyFrom(saddleAt);
        const nose = this._ball('saddle-nose', 0.07, mats.saddle, [1, 0.45, 2.2]);
        nose.position.set(0, saddleAt.y - 0.005, saddleAt.z + 0.12);

        // Cockpit.
        if (tt) {
            const base = new Vector3(0, 0.885, 0.46);
            this._tube(headTop, base, 0.016, mats.carbon);
            this._tube(new Vector3(-0.2, 0.875, 0.48), new Vector3(0.2, 0.875, 0.48), 0.014, mats.carbon, body, 0.6);
            for (const side of [-1, 1]) {
                // Aero extensions with arm pads.
                this._tube(new Vector3(side * 0.06, 0.92, 0.46), new Vector3(side * 0.055, 0.95, 0.78), 0.011, mats.carbon);
                this._tube(base.add(new Vector3(side * 0.06, 0, 0)), new Vector3(side * 0.06, 0.92, 0.46), 0.012, mats.carbon);
                const pad = this._ball('pad', 0.1, mats.saddle, [0.9, 0.3, 1.3]);
                pad.position.set(side * 0.1, 0.9, 0.44);
                this._tube(new Vector3(side * 0.1, 0.88, 0.44), new Vector3(side * 0.06, 0.86, 0.46), 0.01, mats.carbon);
            }
        } else {
            const stemEnd = new Vector3(0, 0.915, 0.49);
            this._tube(headTop, stemEnd, 0.015, mats.metal);
            // Drop bar: tops, hoods, then the drops curling forward and down.
            this._tube(new Vector3(-0.2, 0.915, 0.49), new Vector3(0.2, 0.915, 0.49), 0.013, mats.carbon);
            for (const side of [-1, 1]) {
                const x = side * 0.2;
                const path = [
                    new Vector3(x, 0.915, 0.49), new Vector3(x, 0.92, 0.56), new Vector3(x, 0.89, 0.6),
                    new Vector3(x, 0.83, 0.59), new Vector3(x, 0.79, 0.55), new Vector3(x, 0.785, 0.48)
                ];
                const drop = CreateTube(`${name}-drop`, { path, radius: 0.012, tessellation: 8, cap: 2 }, scene);
                this._own(drop, body, mats.carbon);
                const hood = this._ball('hood', 0.05, mats.carbon, [0.6, 1.1, 1.3]);
                hood.position.set(x, 0.935, 0.53);
            }
        }

        // Crankset: chainring + arms + pedals rotate with the crank node.
        this.crankNode = new TransformNode(`${name}-crank`, scene);
        this.crankNode.parent = body;
        this.crankNode.position.copyFrom(this.bb);
        const ring = this._own(CreateCylinder(`${name}-ring`, { diameter: 0.21, height: 0.006, tessellation: 28 }, scene), this.crankNode, mats.metal);
        ring.rotation.z = Math.PI / 2;
        ring.position.x = 0.065;
        for (const side of [-1, 1]) {
            const arm = this._own(CreateBox(`${name}-crank-arm`, { width: 0.016, height: CRANK, depth: 0.032 }, scene), this.crankNode, mats.carbon);
            // Right arm points along +z at crank = 0 (matches the pedal formula below).
            arm.position.set(side * 0.085, 0, side * (CRANK / 2));
            arm.rotation.x = Math.PI / 2;
        }
    }

    // ------------------------------------------------------------------
    // Rider
    // ------------------------------------------------------------------

    _buildRider() {
        const { mats, geo } = this;
        const tt = this.bike === 'tt';
        const hip = geo.hip;
        const shoulder = new Vector3(0, hip.y + Math.sin(geo.torsoAngle) * geo.torsoLength, hip.z + Math.cos(geo.torsoAngle) * geo.torsoLength);
        this.hip = hip;
        this.shoulder = shoulder;

        // Pelvis (bib shorts) and torso (jersey), flattened across the body.
        this.pelvis = this._ball('pelvis', 0.26, mats.shorts, [1.12, 0.72, 0.92]);
        this.pelvis.position.copyFrom(hip).addInPlaceFromFloats(0, -0.015, 0.03);
        this.torso = this._bone('torso', geo.torsoLength, (t) => 0.13 + 0.035 * Math.sin(Math.PI * Math.min(1, t * 1.15)), mats.jersey, 10, [1.3, 0.78]);
        this._placeBoneFrom(this.torso, hip, shoulder);

        // Neck, head, helmet, glasses.
        const neckTop = shoulder.add(geo.headOffset.scale(0.55));
        const neck = this._bone('neck', 0.1, () => 0.045, mats.skin);
        this._placeBoneFrom(neck, shoulder.add(new Vector3(0, 0.02, 0.02)), neckTop);
        const headCenter = shoulder.add(geo.headOffset);
        const head = this._ball('head', 0.2, mats.skin, [0.9, 1.05, 1.05]);
        head.position.copyFrom(headCenter);
        const helmet = this._ball('helmet', 0.235, mats.helmet, tt ? [0.95, 0.85, 1.55] : [1, 0.82, 1.18]);
        helmet.position.copyFrom(headCenter.add(new Vector3(0, 0.045, tt ? -0.05 : -0.005)));
        helmet.rotation.x = geo.headPitch * 0.5;
        if (!tt) {
            // Vents: a few dark grooves on top.
            for (const x of [-0.04, 0, 0.04]) {
                const vent = this._ball('vent', 0.05, mats.lens, [0.35, 0.3, 2.4]);
                vent.position.copyFrom(headCenter.add(new Vector3(x, 0.135, -0.01)));
            }
        }
        const glasses = this._ball('glasses', 0.19, mats.lens, [1.02, 0.28, 0.5]);
        glasses.position.copyFrom(headCenter.add(new Vector3(0, 0.01, 0.07)));

        // Shoulders, arms, gloves.
        this.arms = [-1, 1].map((side) => {
            const sh = shoulder.add(new Vector3(side * 0.19, -0.02, 0));
            const deltoid = this._ball('deltoid', 0.12, mats.jersey);
            deltoid.position.copyFrom(sh);
            // Short sleeve over the upper half, bare arm below it.
            const upper = this._bone('upper-arm', UPPER_ARM * 0.58, (t) => 0.053 - 0.006 * t, mats.jersey);
            const sleeveEnd = this._bone('arm-skin', UPPER_ARM * 0.48, (t) => 0.043 - 0.005 * t, mats.skin);
            const fore = this._bone('forearm', FOREARM, (t) => 0.042 - 0.012 * t, mats.skin);
            const elbow = this._ball('elbow', 0.075, mats.skin);
            const glove = this._ball('glove', 0.075, mats.glove, [0.8, 0.7, 1.25]);
            return { side, sh, upper, sleeveEnd, fore, elbow, glove };
        });
        this._updateArms();

        // Legs: thigh (shorts → skin), calf, sock-less shoe clipped to the pedal.
        this.legs = [-1, 1].map((side) => ({
            side,
            thigh: this._bone('thigh', THIGH, (t) => 0.085 - 0.03 * t, mats.shorts),
            knee: this._ball('knee', 0.095, mats.skin),
            knee2: this._bone('thigh-skin', THIGH * 0.28, (t) => 0.058 - 0.004 * t, mats.skin),
            shin: this._bone('shin', SHIN, (t) => (t < 0.35 ? 0.05 + 0.03 * Math.sin((t / 0.35) * Math.PI * 0.5) : 0.08 - 0.045 * ((t - 0.35) / 0.65)), mats.skin),
            shoe: this._ball('shoe', 0.11, mats.shoe, [0.85, 0.75, 2.4])
        }));
    }

    // Tube built along +y from its base: base at a, pointing to b.
    _placeBoneFrom(mesh, a, b) {
        mesh.position.copyFrom(a);
        const dir = this._tmp.dir.copyFrom(b).subtractInPlace(a).normalize();
        if (!mesh.rotationQuaternion) mesh.rotationQuaternion = new Quaternion();
        Quaternion.FromUnitVectorsToRef(UP, dir, mesh.rotationQuaternion);
    }

    /**
     * 2-bone IK in the plane containing root→target and the `bend` hint: returns the
     * middle joint for segment lengths l1, l2.
     */
    _ik(root, target, l1, l2, bend) {
        const d = target.subtract(root);
        const dist = Math.min(l1 + l2 - 1e-4, Math.max(Math.abs(l1 - l2) + 1e-4, d.length()));
        const dirN = d.normalize();
        const cosA = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist);
        const a = Math.acos(Math.max(-1, Math.min(1, cosA)));
        // Perpendicular toward the bend hint.
        const perp = bend.subtract(dirN.scale(Vector3.Dot(bend, dirN))).normalize();
        return root.add(dirN.scale(Math.cos(a) * l1)).add(perp.scale(Math.sin(a) * l1));
    }

    _updateArms() {
        const geo = this.geo;
        for (const arm of this.arms) {
            const i = arm.side < 0 ? 0 : 1;
            const hand = geo.hands[i];
            let elbow;
            if (geo.elbowsOnPads) {
                elbow = geo.elbows[i];
            } else {
                // Elbows bend outwards and down, like a relaxed grip on the hoods.
                elbow = this._ik(arm.sh, hand, UPPER_ARM, FOREARM, new Vector3(arm.side * 0.8, -1, -0.2));
            }
            this._placeBoneFrom(arm.upper, arm.sh, elbow);
            const sleeveStart = Vector3.Lerp(arm.sh, elbow, 0.52);
            this._placeBoneFrom(arm.sleeveEnd, sleeveStart, elbow);
            arm.elbow.position.copyFrom(elbow);
            this._placeBoneFrom(arm.fore, elbow, hand);
            arm.glove.position.copyFrom(hand);
            arm.glove.rotationQuaternion = arm.fore.rotationQuaternion.clone();
        }
    }

    _updateLegs() {
        const { bb } = this;
        // Hips rock a little with the pedal stroke.
        const rock = Math.sin(this.crank) * 0.012;
        for (const leg of this.legs) {
            // Right pedal at crank angle, left pedal opposite. Front → bottom → back → top,
            // the same sense as the wheels and as crankNode.rotation.x (+z maps to (-sin, cos)).
            const a = this.crank + (leg.side > 0 ? 0 : Math.PI);
            let x, pedal;
            if (this.bikeModel) {
                // Ball of the foot on the model's pedal body (it already follows the crank).
                pedal = this.bikeModel.pedalContact(leg.side, this._tmp.a);
                pedal.y -= 0.006;
                x = pedal.x - leg.side * 0.004;
                pedal.x = x;
            } else {
                x = leg.side * 0.11;
                pedal = this._tmp.a.set(x, bb.y - Math.sin(a) * CRANK, bb.z + Math.cos(a) * CRANK);
            }
            // Ankle above and behind the pedal spindle (ball of the foot on the pedal).
            const ankle = this._tmp.c.set(x, pedal.y + 0.075, pedal.z - 0.07);
            const hip = this._tmp.b.set(leg.side * 0.095, this.hip.y + rock * leg.side, this.hip.z);
            // Knees track forward and very slightly outward.
            const knee = this._ik(hip, ankle, THIGH, SHIN, new Vector3(leg.side * 0.08, 0.15, 1));
            this._placeBoneFrom(leg.thigh, hip, knee);
            this._placeBoneFrom(leg.knee2, Vector3.Lerp(hip, knee, 0.72), knee);
            leg.knee.position.copyFrom(knee);
            this._placeBoneFrom(leg.shin, knee, ankle);
            leg.shoe.position.set(x, (ankle.y + pedal.y) / 2 + 0.005, (ankle.z + pedal.z) / 2 + 0.03);
            leg.shoe.rotation.x = 0.25 + Math.sin(a) * 0.18; // ankling through the stroke
        }
        this.pelvis.rotation.z = rock * 2;
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
        this.wheelAngle = (this.wheelAngle + (speed / this.wheelR) * dt) % (2 * Math.PI);
        if (!this.ready) return;
        if (this.bikeModel) {
            // Kinematic steering for the curve (+ = right), smoothed like the lean.
            const wb = this.bikeModel.fit.wheelbase;
            const steer = Math.max(-MAX_STEER, Math.min(MAX_STEER, Math.atan(wb * (pose.curvature || 0))));
            this.steer += (steer - this.steer) * (1 - Math.exp(-4 * dt));
            this.bikeModel.setPose(this.crank % (2 * Math.PI), this.wheelAngle, this.steer);
            if (this.riderModel) {
                this.riderModel.update((side, out) => this.bikeModel.pedalContact(side, out), this.crank % (2 * Math.PI));
                return;
            }
        } else {
            this.crankNode.rotation.x = this.crank;
            for (const w of this.wheels) w.rotation.x = this.wheelAngle;
        }
        this._updateLegs();
    }

    dispose() {
        this._disposed = true;
        if (this.bikeModel) this.bikeModel.dispose();
        if (this.riderModel) this.riderModel.dispose();
        this.root.dispose(false, true);
    }
}
