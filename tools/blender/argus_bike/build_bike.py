# Argus Cyclist - Virtual Cycling Environment for interactive bicycling experiments.
# Copyright (C) 2026  Paulo Sérgio
# SPDX-License-Identifier: GPL-3.0-or-later
#
# Procedural road bike for the Argus Cyclist 3D scene ("Argus Aero", original design).
#
#   blender -b --factory-startup -P tools/blender/argus_bike/build_bike.py -- \
#       --out frontend/src/assets/scene3d/models/argus_bike.glb [--render DIR] [--hdr FILE]
#
# Geometry follows a real size-56 race bike: 73° head angle, 73.5° seat angle,
# stack 565 / reach 385 mm, 410 mm chainstays, 72 mm BB drop, 45 mm fork offset,
# 700x28 tyres on 45 mm carbon rims, 50/34 crankset (172.5 mm), 11-30 cassette,
# 160 mm rotors, 420 mm drop bar on a 100 mm stem.
#
# Modelling frame: +Y forward, +Z up, +X right (drive side), meters. The exported root is
# turned 180° about Z so that, after Babylon's glTF handedness conversion, the bike faces
# +z with the drive side on +x (the convention of CyclistRig).
#
# Node hierarchy (glTF):
#   argus_bike (root, extras.argus_bike = JSON: wheel radius, steer axis, chain path…)
#   ├─ frame          frame, seatpost, saddle, derailleurs, rear caliper, bottle, chain links
#   │  ├─ wheel_rear  rotates about local X (rim, tyre, spokes, hub, rotor, cassette)
#   │  ├─ crank       rotates about local X at the bottom bracket
#   │  │  ├─ pedal_R / pedal_L   counter-rotate to stay level (socket_pedal_*)
#   │  ├─ pulley_upper / pulley_lower   rear-derailleur jockey wheels
#   │  ├─ chain_outer / chain_inner     link templates (thin instances along chainPath)
#   │  └─ socket_saddle
#   └─ steer          rotates about extras.steerAxis (fork, stem, bar, levers, front caliper)
#      ├─ wheel_front
#      └─ socket_hood_L/R, socket_drop_L/R, socket_top_L/R

import argparse
import json
import math
import os
import sys

import bpy
from mathutils import Vector, Matrix, Euler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import geom as G  # noqa: E402
import textures as TX  # noqa: E402
from geom import V  # noqa: E402

# ---------------------------------------------------------------------------
# Geometry
# ---------------------------------------------------------------------------

R_BEAD = 0.311                  # 622 mm bead seat diameter
TYRE_H = 0.0255                 # 28 mm tyre height above the bead
R_WHEEL = R_BEAD + TYRE_H       # 0.3365
BB_DROP = 0.072
BB = V(0, 0, R_WHEEL - BB_DROP)
CHAINSTAY = 0.410
REAR_AXLE = V(0, -math.sqrt(CHAINSTAY ** 2 - BB_DROP ** 2), R_WHEEL)
HTA = math.radians(73.0)
STA = math.radians(73.5)
STACK, REACH = 0.565, 0.385
HT_LEN = 0.155
FORK_OFFSET = 0.045
ST_LEN = 0.52
SADDLE_H = 0.745                # BB centre → saddle top along the seat tube
CRANK = 0.1725
CHAINLINE = 0.0425

D_STEER = V(0, math.cos(HTA), -math.sin(HTA))          # down the steering axis
PERP = V(0, math.sin(HTA), math.cos(HTA))               # forward, normal to the axis
HT_TOP = BB + V(0, REACH, STACK)
HT_BOT = HT_TOP + D_STEER * HT_LEN
# Front axle: offset point on the steering axis at wheel-radius height.
_s = (HT_TOP.z - (R_WHEEL - FORK_OFFSET * PERP.z)) / -D_STEER.z
FRONT_AXLE = HT_TOP + D_STEER * _s + PERP * FORK_OFFSET
FRONT_AXLE.z = R_WHEEL
ST_DIR = V(0, -math.cos(STA), math.sin(STA))
ST_TOP = BB + ST_DIR * ST_LEN
Y_MID = (REAR_AXLE.y + FRONT_AXLE.y) / 2

# Brand colours (linear RGB).
def srgb(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((x / 12.92) if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


GRAPHITE = srgb('#1b2129')
GRAPHITE_DEEP = srgb('#0e1217')
CYAN = srgb('#38bdf8')
TAN = srgb('#9c7148')
TREAD = srgb('#141414')


def smoothstep(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def mix(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------

class Materials:
    def __init__(self):
        self.carbon_diff, self.carbon_nor = TX.carbon_weave()
        self.rotor_img = TX.rotor_texture()
        self.tape_nor = TX.tape_normal()
        self.m = {}
        self.paint = self._pbr('bike_paint', (1, 1, 1), metallic=0.45, roughness=0.3, coat=1.0, vcol=True)
        self.carbon = self._pbr('bike_carbon', (1, 1, 1), roughness=0.32, coat=0.8, tex=self.carbon_diff, nor=self.carbon_nor, nor_strength=0.6)
        self.alu = self._pbr('bike_alu_black', (0.018, 0.019, 0.021), metallic=0.75, roughness=0.42)
        self.steel = self._pbr('bike_steel', (0.78, 0.78, 0.79), metallic=1.0, roughness=0.22)
        self.steel_dark = self._pbr('bike_steel_dark', (0.33, 0.33, 0.34), metallic=1.0, roughness=0.34)
        self.tyre = self._pbr('bike_tyre', (1, 1, 1), roughness=0.82, vcol=True)
        self.rubber = self._pbr('bike_rubber', (0.016, 0.016, 0.017), roughness=0.72)
        self.tape = self._pbr('bike_bar_tape', (0.016, 0.017, 0.019), roughness=0.66, nor=self.tape_nor, nor_strength=0.8)
        self.saddle = self._pbr('bike_saddle', (1, 1, 1), roughness=0.5, coat=0.25, vcol=True)
        self.decal = self._pbr('bike_decal_white', (0.86, 0.87, 0.88), roughness=0.28, coat=1.0)
        self.accent = self._pbr('bike_accent_cyan', CYAN, roughness=0.3, coat=1.0)
        self.bottle = self._pbr('bike_bottle', (0.80, 0.81, 0.82), roughness=0.42)
        self.rotor = self._pbr('bike_rotor', (1, 1, 1), metallic=1.0, roughness=0.3, tex=self.rotor_img, alpha_clip=True)

    def _pbr(self, name, color, metallic=0.0, roughness=0.5, coat=0.0, vcol=False, tex=None, nor=None,
             nor_strength=1.0, alpha_clip=False):
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        nt = mat.node_tree
        bsdf = nt.nodes['Principled BSDF']
        bsdf.inputs['Base Color'].default_value = (*color, 1.0)
        bsdf.inputs['Metallic'].default_value = metallic
        bsdf.inputs['Roughness'].default_value = roughness
        if coat > 0:
            bsdf.inputs['Coat Weight'].default_value = coat
            bsdf.inputs['Coat Roughness'].default_value = 0.05
        if vcol:
            ca = nt.nodes.new('ShaderNodeVertexColor')
            ca.layer_name = 'Col'
            nt.links.new(ca.outputs['Color'], bsdf.inputs['Base Color'])
        if tex is not None:
            it = nt.nodes.new('ShaderNodeTexImage')
            it.image = tex
            nt.links.new(it.outputs['Color'], bsdf.inputs['Base Color'])
            if alpha_clip:
                # glTF exporter: a "Greater Than"/"Round" math node → alphaMode MASK.
                gt = nt.nodes.new('ShaderNodeMath')
                gt.operation = 'GREATER_THAN'
                gt.inputs[1].default_value = 0.5
                nt.links.new(it.outputs['Alpha'], gt.inputs[0])
                nt.links.new(gt.outputs[0], bsdf.inputs['Alpha'])
                mat.use_backface_culling = False
        if nor is not None:
            it = nt.nodes.new('ShaderNodeTexImage')
            it.image = nor
            nm = nt.nodes.new('ShaderNodeNormalMap')
            nm.inputs['Strength'].default_value = nor_strength
            nt.links.new(it.outputs['Color'], nm.inputs['Color'])
            nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
        if not alpha_clip:
            mat.use_backface_culling = True   # glTF doubleSided = false
        self.m[name] = mat
        return mat


def scale_uv(obj, su, sv):
    layer = obj.data.uv_layers.active
    if not layer:
        return obj
    for d in layer.data:
        d.uv = (d.uv[0] * su, d.uv[1] * sv)
    return obj


def white_vcol(obj):
    return G.paint_vertices(obj, lambda co: (1.0, 1.0, 1.0))


# ---------------------------------------------------------------------------
# Frame
# ---------------------------------------------------------------------------

def frame_paint(co):
    """Graphite with cyan fades at the rear dropouts and a deep tone under the BB."""
    c = GRAPHITE
    rear = smoothstep(-0.27, -0.40, co.y) * (1.0 if abs(co.x) > 0.02 else 0.0)
    c = mix(c, CYAN, 0.92 * rear)
    under = smoothstep(BB.z + 0.02, BB.z - 0.02, co.z) * smoothstep(-0.12, 0.0, co.y) * smoothstep(0.12, 0.02, co.y)
    c = mix(c, GRAPHITE_DEEP, 0.7 * under)
    return c


def fork_paint(co):
    t = smoothstep(R_WHEEL + 0.17, R_WHEEL + 0.02, co.z)
    return mix(GRAPHITE, CYAN, 0.92 * t)


def build_frame(M):
    parts = []
    up = (0, 0, 1)

    # Head tube (tapered 1-1/8" → 1-1/2").
    ht_a = HT_TOP - D_STEER * 0.006
    ht_b = HT_BOT + D_STEER * 0.006
    parts.append(G.sweep('ht', G.line(ht_a, ht_b, 6), G.superellipse(1, 1, 2.0, 28),
                         up=(0, 1, 0), scale=lambda t: (0.044 + 0.014 * t, 0.046 + 0.016 * t)))

    # Top tube: slight slope, flattened, flares into the head tube.
    tt_a = BB + ST_DIR * (ST_LEN - 0.035)
    tt_b = HT_TOP + D_STEER * 0.03
    parts.append(G.sweep('tt', G.catmull([tt_a, tt_a.lerp(tt_b, 0.5) + V(0, 0, 0.004), tt_b], 8),
                         lambda t: G.superellipse(0.032 + 0.012 * t ** 3, 0.030 + 0.004 * t ** 3, 2.6, 24), up=up))

    # Down tube: large squared section.
    dt_a = BB + V(0, 0.01, 0.005)
    dt_b = HT_BOT - D_STEER * 0.035
    parts.append(G.sweep('dt', G.line(dt_a, dt_b, 10),
                         lambda t: G.superellipse(0.056 - 0.006 * t, 0.050 - 0.004 * t, 3.0, 28), up=(0, -0.5, 1)))

    # Seat tube: aero section, wider at the BB, hugging the rear tyre.
    st_a = BB + V(0, 0.0, 0.0)
    st_pts = [st_a, BB + ST_DIR * 0.12 + V(0, 0.008, 0), BB + ST_DIR * 0.3, ST_TOP]
    parts.append(G.sweep('st', G.catmull(st_pts, 6),
                         lambda t: G.teardrop(0.034 + 0.02 * (1 - t) ** 3, 0.044, 24, tail=0.35), up=(0, 1, 0.3)))

    # Bottom bracket shell (BB86) and junction mass.
    parts.append(G.lathe('bbshell', [(0.0, -0.0435), (0.026, -0.0435), (0.0275, -0.04), (0.0275, 0.04), (0.026, 0.0435), (0.0, 0.0435)], 28, 'X', BB))
    parts.append(G.rounded_box('bbmass', (0.07, 0.07, 0.05), BB + V(0, -0.008, 0.008), bevel=0.018, segments=3))

    for side in (-1, 1):
        # Chainstays: inboard of the chainrings near the BB, then out to the dropout.
        drop = REAR_AXLE + V(side * 0.0645, 0.004, 0.0)
        cs = [BB + V(side * 0.022, -0.03, -0.004), BB + V(side * 0.027, -0.12, 0.006),
              BB + V(side * 0.05, -0.25, 0.022), drop + V(0, 0.03, 0.0), drop]
        parts.append(G.sweep(f'cs{side}', G.catmull(cs, 8),
                             lambda t: G.superellipse(0.019 - 0.006 * t, 0.032 - 0.016 * t, 2.4, 18), up=up))
        # Dropped seatstays.
        ss_top = BB + ST_DIR * (ST_LEN - 0.12) + V(side * 0.010, -0.012, 0)
        ss = [ss_top, ss_top.lerp(drop, 0.35) + V(side * 0.03, 0, 0), ss_top.lerp(drop, 0.75) + V(side * 0.006, 0, 0), drop + V(0, 0.004, 0.012)]
        parts.append(G.sweep(f'ss{side}', G.catmull(ss, 8),
                             lambda t: G.superellipse(0.016 - 0.003 * t, 0.020 - 0.006 * t, 2.2, 16), up=(1, 0, 0)))
        # Dropout plate.
        outline = [(math.cos(a) * 0.017 + (0.006 if math.cos(a) > 0 else 0), math.sin(a) * 0.016) for a in [G.TAU * i / 20 for i in range(20)]]
        parts.append(G.extrude_outline(f'drop{side}', outline, 0.008, 'X', drop + V(0, 0.004, 0.003), bevel=0.0015))
    # Flat-mount rear brake boss (non-drive chainstay).
    parts.append(G.rounded_box('fm', (0.016, 0.05, 0.014), REAR_AXLE + V(-0.064, 0.07, -0.003), bevel=0.005))
    # Seat-tube top collar.
    parts.append(G.sweep('collar', G.line(ST_TOP - ST_DIR * 0.012, ST_TOP + ST_DIR * 0.004, 3),
                         G.teardrop(0.038, 0.048, 24, tail=0.35), up=(0, 1, 0.3)))

    frame = G.remesh_union(parts, 'frame_body', voxel=0.0022, smooth_iter=8, smooth_lambda=0.7, target_faces=24000)
    G.paint_vertices(frame, frame_paint)
    G.set_material(frame, M.paint)
    return frame


def build_fork(M):
    parts = []
    crown_c = HT_BOT + D_STEER * 0.022
    parts.append(G.sweep('crown_cup', G.line(HT_BOT - D_STEER * 0.004, HT_BOT + D_STEER * 0.012, 3), G.circle(0.0305, 28), up=(0, 1, 0)))
    rot = Matrix.Rotation(-(math.pi / 2 - HTA), 3, 'X')
    parts.append(G.rounded_box('crown', (0.098, 0.05, 0.026), crown_c, bevel=0.012, segments=3, rotation=rot))
    axle_s = (HT_TOP.z - FRONT_AXLE.z) / -D_STEER.z
    for side in (-1, 1):
        pts = []
        for k in range(9):
            u = k / 8
            s = (HT_LEN + 0.02) + (axle_s - HT_LEN - 0.02) * u
            p = HT_TOP + D_STEER * s + PERP * (FORK_OFFSET * u ** 1.6) + V(side * (0.034 + 0.021 * math.sin(u * math.pi / 2)), 0, 0)
            pts.append(p)
        pts[-1] = FRONT_AXLE + V(side * 0.055, 0, 0)
        parts.append(G.sweep(f'blade{side}', G.catmull(pts, 4), lambda t: G.teardrop(0.020 - 0.006 * t, 0.040 - 0.016 * t, 20, tail=0.6), up=tuple(PERP)))
        outline = [(math.cos(a) * 0.014, math.sin(a) * 0.014) for a in [G.TAU * i / 18 for i in range(18)]]
        parts.append(G.extrude_outline(f'fdrop{side}', outline, 0.008, 'X', FRONT_AXLE + V(side * 0.055, 0, 0), bevel=0.0015))
    # Front flat-mount boss on the back of the non-drive blade.
    parts.append(G.rounded_box('ffm', (0.014, 0.018, 0.05), FRONT_AXLE + V(-0.055, -0.03, 0.04), bevel=0.005))
    fork = G.remesh_union(parts, 'fork_body', voxel=0.0018, smooth_iter=6, smooth_lambda=0.6, target_faces=6500)
    G.paint_vertices(fork, fork_paint)
    G.set_material(fork, M.paint)
    return fork


def text_mesh(body, size, extrude=0.0003, bold=True):
    curve = bpy.data.curves.new(f'txt_{body}', 'FONT')
    curve.body = body
    curve.size = size
    curve.extrude = extrude
    curve.resolution_u = 1
    curve.align_x = 'CENTER'
    curve.align_y = 'CENTER'
    curve.space_character = 1.15
    obj = bpy.data.objects.new(f'txt_{body}', curve)
    bpy.context.scene.collection.objects.link(obj)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(dg))
    bpy.data.objects.remove(obj)
    o = bpy.data.objects.new(f'txtm_{body}', me)
    bpy.context.scene.collection.objects.link(o)
    return o


def wrap(obj, fn):
    for v in obj.data.vertices:
        v.co = fn(v.co)
    obj.data.update()
    return obj


def build_decals(M):
    """Down-tube wordmark wrapped on the tube sides, cyan underline, top-tube mark."""
    out = []
    dt_a = BB + V(0, 0.01, 0.005)
    dt_b = HT_BOT - D_STEER * 0.035
    axis = (dt_b - dt_a).normalized()
    length = (dt_b - dt_a).length
    up_t = (V(0, -0.5, 1) - axis * V(0, -0.5, 1).dot(axis)).normalized()
    up_t = (up_t - axis * up_t.dot(axis)).normalized()
    w0, h0, n = 0.052, 0.047, 3.0

    def surface_x(vv, w):
        q = min(0.999, abs(2 * vv / h0))
        return w / 2 * (1 - q ** n) ** (1 / n)

    for side in (1, -1):
        t = text_mesh('ARGUS', 0.026)
        mid = 0.52

        def f(co, side=side):
            u = co.x * side           # reading direction: BB → HT on the drive side
            s = mid + u / length
            w = (0.056 - 0.006 * s)
            vv = co.y
            centre = dt_a + axis * (s * length)
            lat = surface_x(vv, w) + 0.0004 + co.z
            return centre + up_t * vv + V(side * lat, 0, 0)

        wrap(t, f)
        G.set_material(t, M.decal)
        out.append(t)
        # Cyan underline.
        ul = G.sweep(f'ul{side}', [V(-0.09, -0.0165, 0), V(0.09, -0.0165, 0)], [(0, -0.0012), (0.0002, -0.0012), (0.0002, 0.0012), (0, 0.0012)], up=(0, 1, 0), cap=True)
        # Sweep built along X in the XY plane: remap with the same wrap (x = along, y = up).
        for v in ul.data.vertices:
            co = v.co.copy()
            v.co = f(V(co.x, co.y, co.z))
        ul.data.update()
        G.set_material(ul, M.accent)
        out.append(ul)
    # Small "A" chevron on the head tube front.
    chev = text_mesh('A', 0.03, extrude=0.0004)
    ht_mid = HT_TOP.lerp(HT_BOT, 0.45)

    def fh(co):
        r = 0.0255 + 0.004 * 0.45
        ang = co.x / r
        p = ht_mid - D_STEER * co.y
        return p + PERP * ((r + 0.0005 + co.z) * math.cos(ang)) + V((r + 0.0005) * math.sin(ang), 0, 0)

    wrap(chev, fh)
    G.set_material(chev, M.accent)
    out.append(chev)
    return out


# ---------------------------------------------------------------------------
# Wheels
# ---------------------------------------------------------------------------

def build_rim(name, M, center):
    # Closed rim section (r, x): hooks at the bead, deep U toward the hub.
    half = [(0.2665, 0.0), (0.2685, 0.0065), (0.276, 0.0118), (0.292, 0.0135), (0.304, 0.0128),
            (0.3105, 0.0118), (0.3135, 0.0112), (0.3135, 0.0098), (0.309, 0.0094), (0.3075, 0.0)]
    prof = half + [(r, -x) for (r, x) in reversed(half[1:-1])] + [half[0]]
    rim = G.lathe(name, prof, 72, 'X', center, sharp_angle=math.radians(50), cap_ends=False)
    G.fix_normals(rim)
    scale_uv(rim, 2 * math.pi * 0.29 / 0.02, 0.09 / 0.02)
    return G.set_material(rim, M.carbon)


def build_tyre(name, M, center):
    rc, hw, hh = R_BEAD + TYRE_H / 2 - 0.0005, 0.0143, TYRE_H / 2 + 0.0012
    prof = []
    for i in range(25):
        a = -math.pi * 0.8 + (math.pi * 1.6) * i / 24
        prof.append((rc + hh * math.cos(a), hw * math.sin(a)))
    tyre = G.lathe(name, prof, 72, 'X', center, sharp_angle=None, cap_ends=False)

    def col(co):
        rel = co - Vector(center)
        r = math.hypot(rel.y, rel.z)
        x = abs(rel.x)
        tread = smoothstep(0.0085, 0.0055, x) * smoothstep(R_WHEEL - 0.009, R_WHEEL - 0.004, r)
        return mix(TAN, TREAD, max(tread, smoothstep(R_BEAD + 0.004, R_BEAD + 0.001, r)))

    G.paint_vertices(tyre, col)
    return G.set_material(tyre, M.tyre)


def build_hub(name, M, center, rear):
    if rear:
        prof = [(0.0, -0.0715), (0.0095, -0.0715), (0.0095, -0.064), (0.0155, -0.06), (0.016, -0.04), (0.027, -0.036),
                (0.027, -0.032), (0.0165, -0.028), (0.0165, 0.012), (0.026, 0.016), (0.026, 0.02), (0.0172, 0.024),
                (0.0172, 0.0615), (0.0095, 0.064), (0.0095, 0.0715), (0.0, 0.0715)]
    else:
        prof = [(0.0, -0.0505), (0.0095, -0.0505), (0.0095, -0.045), (0.0155, -0.042), (0.016, -0.038), (0.025, -0.035),
                (0.025, -0.031), (0.0155, -0.027), (0.0145, 0.0), (0.0155, 0.027), (0.025, 0.031), (0.025, 0.035),
                (0.016, 0.038), (0.0095, 0.045), (0.0095, 0.0505), (0.0, 0.0505)]
    hub = G.lathe(name, prof, 28, 'X', center)
    return G.set_material(hub, M.alu)


def build_spokes(name, M, center, rear):
    c = Vector(center)
    n = 24
    objs = []
    flanges = {-1: (-0.034 if rear else -0.033, 0.0255), 1: (0.018 if rear else 0.033, 0.0245)}
    for k in range(n):
        side = 1 if k % 2 else -1
        rim_ang = math.tau * k / n
        lead = 1 if (k // 2) % 2 else -1
        hub_ang = rim_ang + lead * math.radians(60)
        fx, fr = flanges[side]
        a = c + V(fx, math.cos(hub_ang) * fr, math.sin(hub_ang) * fr)
        b = c + V(side * 0.0035, math.cos(rim_ang) * 0.268, math.sin(rim_ang) * 0.268)
        # Bladed spoke: flattened across its plane of rotation.
        sp = G.sweep(f'{name}{k}', [a, b], G.superellipse(0.0024, 0.0010, 2.0, 6), up=(1, 0, 0), cap=False)
        objs.append(sp)
        nip = G.lathe(f'{name}n{k}', [(0.0, 0.0), (0.0019, 0.0), (0.0019, 0.008), (0.0, 0.009)], 6, 'Z')
        d = (b - a).normalized()
        nip.data.transform(Matrix.Translation(b - d * 0.008) @ d.to_track_quat('Z', 'Y').to_matrix().to_4x4())
        objs.append(nip)
    sp = G.join(objs, name)
    return G.set_material(sp, M.alu)


def build_rotor(name, M, center, x):
    c = Vector(center) + V(x, 0, 0)
    r = 0.080
    seg = 40
    verts = [c.copy()] + [c + V(0, math.cos(G.TAU * i / seg) * r * 1.02, math.sin(G.TAU * i / seg) * r * 1.02) for i in range(seg)]
    faces = [(0, 1 + i, 1 + (i + 1) % seg) for i in range(seg)]
    uvs = []
    for (a, b, cc) in faces:
        tri = []
        for vi in (a, b, cc):
            p = verts[vi] - c
            tri.append((0.5 + p.y / (2 * r), 0.5 + p.z / (2 * r)))
        uvs.append(tuple(tri))
    rot = G.make_object(name, verts, faces, uvs, smooth=False)
    G.set_material(rot, M.rotor)
    lock = G.lathe(name + '_lock', [(0.0, -0.003), (0.019, -0.003), (0.019, 0.003), (0.0, 0.003)], 20, 'X', c)
    G.set_material(lock, M.alu)
    return [rot, lock]


def build_rim_decals(M, center):
    out = []
    c = Vector(center)
    for side in (-1, 1):
        for k in range(2):
            t = text_mesh('ARGUS AERO 45', 0.011, extrude=0.0002)
            base_ang = math.pi * k + math.pi / 2

            def f(co, side=side, base_ang=base_ang):
                r = 0.291 + co.y
                ang = base_ang - side * co.x / 0.291
                return c + V(side * (0.01355 + 0.0003 + co.z), math.cos(ang) * r, math.sin(ang) * r)

            wrap(t, f)
            G.set_material(t, M.decal)
            out.append(t)
    return out


def build_cassette(M, center):
    teeth = [11, 12, 13, 14, 15, 17, 19, 21, 24, 27, 30]
    cogs = []
    pitch = 0.0127
    for i, n in enumerate(teeth):
        r_p = pitch / (2 * math.sin(math.pi / n))
        x = 0.0605 - i * 0.00395
        r_hole = 0.0175 if n < 21 else r_p - 0.011
        cogs.append(G.ring_with_hole(f'cog{n}', G.gear_outline(n, r_p - 0.0035, r_p + 0.0035, steps=0), r_hole, 0.0018, 'X', Vector(center) + V(x, 0, 0)))
    steel = G.join(cogs, 'cassette')
    G.set_material(steel, M.steel)
    carrier = G.lathe('cassette_carrier', [(0.0175, 0.0195), (0.046, 0.021), (0.046, 0.0385), (0.0175, 0.04)], 32, 'X', center)
    G.set_material(carrier, M.alu)
    lockring = G.lathe('lockring', [(0.0, 0.0615), (0.0172, 0.0615), (0.0172, 0.0645), (0.0, 0.0645)], 24, 'X', center)
    G.set_material(lockring, M.steel_dark)
    return [steel, carrier, lockring]


def build_wheel(name, M, center, rear):
    objs = [build_rim(name + '_rim', M, center), build_tyre(name + '_tyre', M, center),
            build_hub(name + '_hub', M, center, rear), build_spokes(name + '_spokes', M, center, rear)]
    objs += build_rotor(name + '_rotor', M, center, -0.0585 if rear else -0.0515)
    objs += build_rim_decals(M, center)
    if rear:
        objs += build_cassette(M, center)
    return objs


# ---------------------------------------------------------------------------
# Drivetrain
# ---------------------------------------------------------------------------

def build_crankset(M):
    """Returns (crank_objs, pedal_R_objs, pedal_L_objs) in world space at crank angle 0
    (right arm forward)."""
    crank = []
    pitch = 0.0127
    rings = []
    for n, x in ((50, CHAINLINE + 0.0025), (34, CHAINLINE - 0.0045)):
        r_p = pitch / (2 * math.sin(math.pi / n))
        ring = G.ring_with_hole(f'ring{n}', G.gear_outline(n, r_p - 0.0036, r_p + 0.0036, steps=0),
                                r_p - (0.016 if n == 50 else 0.012), 0.0035 if n == 50 else 0.003, 'X', BB + V(x, 0, 0))
        rings.append(ring)
    rings = G.join(rings, 'chainrings')
    G.set_material(rings, M.steel_dark)
    crank.append(rings)
    # 4-arm spider (110 BCD) in black alu, under the chainrings.
    arms = []
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2 + 0.25
        tip = BB + V(0.046, math.cos(a) * 0.058, math.sin(a) * 0.058)
        base = BB + V(0.058, math.cos(a + 0.35) * 0.012, math.sin(a + 0.35) * 0.012)
        arms.append(G.sweep(f'spider{k}', G.catmull([base, base.lerp(tip, 0.5) + V(-0.004, 0, 0), tip], 4), G.superellipse(0.019, 0.0075, 2.6, 14), up=(1, 0, 0)))
        arms.append(G.lathe(f'bolt{k}', [(0.0, -0.004), (0.0052, -0.004), (0.0052, 0.004), (0.0, 0.004)], 12, 'X', tip + V(0.0, 0, 0)))
    for side in (1, -1):
        x = side * 0.0705
        end = BB + V(side * 0.074, side * CRANK, 0.0)
        arm = [G.sweep(f'crankarm{side}', G.catmull([BB + V(x, 0, 0), BB + V(side * 0.0725, side * CRANK * 0.5, 0.0), end], 6),
                       lambda t: G.superellipse(0.017 - 0.004 * t, 0.038 - 0.016 * t, 3.2, 20), up=(0, 0, 1)),
               G.lathe(f'bosspin{side}', [(0.0, -0.009), (0.0115, -0.009), (0.0115, 0.009), (0.0, 0.009)], 20, 'X', end),
               G.lathe(f'bossbb{side}', [(0.0, -0.01), (0.021, -0.01), (0.021, 0.01), (0.0, 0.01)], 24, 'X', BB + V(x, 0, 0))]
        if side > 0:
            arm += arms
        body = G.remesh_union(arm, f'crankarm_{side}', voxel=0.0011, smooth_iter=4, smooth_lambda=0.5, target_faces=2200 if side > 0 else 1200)
        G.set_material(body, M.alu)
        crank.append(body)
    spindle = G.lathe('spindle', [(0.0, -0.062), (0.012, -0.062), (0.012, 0.062), (0.0, 0.062)], 20, 'X', BB)
    G.set_material(spindle, M.steel_dark)
    crank.append(spindle)
    # Cyan crank-bolt cap (non-drive side).
    cap = G.lathe('crankcap', [(0.0, -0.0835), (0.0125, -0.0835), (0.0135, -0.08), (0.0135, -0.077), (0.0, -0.077)], 24, 'X', BB)
    G.set_material(cap, M.accent)
    crank.append(cap)

    pedals = {}
    for side in (1, -1):
        spindle_c = BB + V(side * 0.0805, side * CRANK, 0.0)
        objs = []
        ax = G.lathe(f'paxle{side}', [(0.0, 0.0), (0.0065, 0.0), (0.0065, 0.017), (0.0, 0.017)], 14, 'X', spindle_c + V(-0.0085 if side > 0 else -0.0085, 0, 0))
        if side < 0:
            ax.data.transform(Matrix.Translation(spindle_c) @ Matrix.Scale(-1, 4, V(1, 0, 0)) @ Matrix.Translation(-spindle_c))
            G.fix_normals(ax)
        G.set_material(ax, M.steel)
        objs.append(ax)
        body_c = spindle_c + V(side * 0.036, 0.0, 0.0)
        # Road pedal body: a wedge, wider at the back, with a raised front lip.
        outline = [(-0.046, -0.003), (-0.043, 0.0075), (0.0, 0.0105), (0.036, 0.0095), (0.046, 0.0045),
                   (0.047, -0.004), (0.03, -0.009), (-0.03, -0.009)]
        shell = G.extrude_outline(f'pbody{side}', outline, 0.064, 'X', body_c, bevel=0.0035)
        G.set_material(shell, M.carbon)
        scale_uv(shell, 1, 1)
        plate = G.rounded_box(f'pplate{side}', (0.044, 0.05, 0.0024), body_c + V(0, -0.004, 0.0108), bevel=0.0009, segments=2)
        G.set_material(plate, M.steel)
        objs += [shell, plate]
        pedals[side] = (spindle_c, objs)
    return crank, pedals


def chain_loop():
    """Closed chain path (drive-side plane, (y, z) at x = CHAINLINE) as a polyline, with
    pulley centres. Travel order: cog → top run → ring → bottom run → lower jockey →
    upper jockey → cog. Viewed from +X (front to the right) the ring, cog and lower
    jockey turn clockwise, the upper jockey anticlockwise."""
    pitch = 0.0127

    def rp(n):
        return pitch / (2 * math.sin(math.pi / n))

    ring = (Vector((BB.y, BB.z)), rp(50), -1)        # -1 = clockwise in (y, z)
    cog = (Vector((REAR_AXLE.y, REAR_AXLE.z)), rp(17), -1)
    up_c = Vector((REAR_AXLE.y - 0.010, REAR_AXLE.z - 0.068))
    lo_c = up_c + Vector((0.020, -0.072))
    upper = (up_c, rp(11), 1)
    lower = (lo_c, rp(11), -1)
    order = [cog, ring, lower, upper]

    def vel(c, p, s):
        d = p - c
        return Vector((-d.y, d.x)) * s   # s=+1 anticlockwise

    def tangent(A, B):
        (ca, ra, sa), (cb, rb, sb) = A, B
        best = None
        for k in range(4):
            # Normal n with (cb - ca)·n = r1 - r2 using signed radii, both sign choices.
            r1 = ra * (1 if k & 1 else -1)
            r2 = rb * (1 if k & 2 else -1)
            d = cb - ca
            L = d.length
            cosv = (r1 - r2) / L
            if abs(cosv) > 1:
                continue
            base = math.atan2(d.y, d.x)
            for sgn in (1, -1):
                ang = base + sgn * math.acos(cosv)
                n = Vector((math.cos(ang), math.sin(ang)))
                p1 = ca + n * r1
                p2 = cb + n * r2
                dirv = p2 - p1
                if dirv.length < 1e-6:
                    continue
                if vel(ca, p1, sa).dot(dirv) > 0 and vel(cb, p2, sb).dot(dirv) > 0 and abs((p1 - ca).length - ra) < 1e-6:
                    best = (p1, p2)
        return best

    segs = []
    for i in range(len(order)):
        segs.append(tangent(order[i], order[(i + 1) % len(order)]))
    pts = []
    for i in range(len(order)):
        c, r, s = order[i]
        enter = segs[i - 1][1]
        leave = segs[i][0]
        a0 = math.atan2(enter.y - c.y, enter.x - c.x)
        a1 = math.atan2(leave.y - c.y, leave.x - c.x)
        if s > 0:
            while a1 < a0:
                a1 += math.tau
        else:
            while a1 > a0:
                a1 -= math.tau
        steps = max(2, int(abs(a1 - a0) * r / 0.003))
        for k in range(steps + 1):
            a = a0 + (a1 - a0) * k / steps
            pts.append(c + Vector((math.cos(a), math.sin(a))) * r)
        # Straight run to the next circle.
        pts.append(segs[i][1].copy())
    # Dedupe consecutive points.
    clean = [pts[0]]
    for p in pts[1:]:
        if (p - clean[-1]).length > 1e-5:
            clean.append(p)
    if (clean[0] - clean[-1]).length < 1e-5:
        clean.pop()
    path3 = [V(CHAINLINE, p.x, p.y) for p in clean]
    return path3, V(CHAINLINE, up_c.x, up_c.y), V(CHAINLINE, lo_c.x, lo_c.y)


def resample_closed(path, step):
    n = len(path)
    segl = [(path[(i + 1) % n] - path[i]).length for i in range(n)]
    total = sum(segl)
    count = max(2, round(total / step))
    count += count % 2          # inner/outer links alternate
    step = total / count
    out = []
    i, acc = 0, 0.0
    for k in range(count):
        target = k * step
        while acc + segl[i] < target:
            acc += segl[i]
            i += 1
        t = (target - acc) / segl[i]
        out.append(path[i].lerp(path[(i + 1) % n], t))
    return out, step


def chain_link(name, M, outer):
    """One link (pitch 12.7 mm) along +Y, centred at the origin."""
    p = 0.0127
    objs = []
    x_plate = 0.0041 if outer else 0.0029
    outline = []
    m = 18
    for i in range(m):
        a = math.tau * i / m
        y = math.cos(a)
        z = math.sin(a)
        rr = 0.0042 if outer else 0.0040
        # Figure-eight: two lobes at the pins with a waist between them.
        yy = y * (p / 2 + rr)
        waist = 1 - 0.22 * math.exp(-(yy / (p * 0.25)) ** 2)
        outline.append((yy, z * rr * waist))
    for side in (-1, 1):
        objs.append(G.extrude_outline(f'{name}p{side}', outline, 0.001, 'X', V(side * x_plate, 0, 0), bevel=0.0003))
    for y in (-p / 2, p / 2):
        if outer:
            objs.append(G.lathe(f'{name}pin', [(0.0, -0.0052), (0.00185, -0.0052), (0.00185, 0.0052), (0.0, 0.0052)], 8, 'X', V(0, y, 0)))
        else:
            objs.append(G.lathe(f'{name}roll', [(0.0, -0.0024), (0.0038, -0.0024), (0.0038, 0.0024), (0.0, 0.0024)], 10, 'X', V(0, y, 0)))
    link = G.join(objs, name)
    G.set_material(link, M.steel if outer else M.steel_dark)
    return link


def build_rear_derailleur(M, up_c, lo_c):
    static = []
    hanger_c = REAR_AXLE + V(0.072, -0.004, -0.018)
    hanger = G.extrude_outline('hanger', [(0.0, 0.012), (0.012, 0.0), (0.004, -0.026), (-0.01, -0.03), (-0.012, -0.004)], 0.004, 'X', hanger_c, bevel=0.0008)
    G.set_material(hanger, M.alu)
    static.append(hanger)
    # B-knuckle → parallelogram → P-knuckle, outboard of the cassette.
    b_k = hanger_c + V(0.006, -0.012, -0.022)
    p_k = V(0.07, up_c.y - 0.004, up_c.z + 0.014)
    body = [G.lathe('rd_bknuckle', [(0.0, -0.009), (0.011, -0.009), (0.011, 0.009), (0.0, 0.009)], 16, 'X', b_k),
            G.sweep('rd_para', G.catmull([b_k, b_k.lerp(p_k, 0.5) + V(0.006, 0, 0), p_k], 6), G.superellipse(0.016, 0.024, 3.0, 16), up=(1, 0, 0)),
            G.lathe('rd_pknuckle', [(0.0, -0.008), (0.0105, -0.008), (0.0105, 0.008), (0.0, 0.008)], 16, 'X', p_k)]
    body = G.remesh_union(body, 'rd_body', voxel=0.0012, smooth_iter=4, smooth_lambda=0.5, target_faces=1800)
    G.set_material(body, M.alu)
    static.append(body)
    accent = G.rounded_box('rd_accent', (0.003, 0.03, 0.006), b_k.lerp(p_k, 0.55) + V(0.0145, 0, 0), bevel=0.001, segments=1,
                           rotation=Matrix.Rotation(math.atan2(p_k.z - b_k.z, p_k.y - b_k.y), 3, 'X'))
    G.set_material(accent, M.accent)
    static.append(accent)
    # Cage plates around the two jockey wheels.
    for side, x in ((1, CHAINLINE + 0.0075), (-1, CHAINLINE - 0.0075)):
        pts = []
        a_up = math.atan2(lo_c.z - up_c.z, lo_c.y - up_c.y)
        for i in range(14):
            a = a_up + math.pi / 2 + math.pi * i / 13
            pts.append((lo_c.y + math.cos(a) * 0.0165, lo_c.z + math.sin(a) * 0.0165))
        for i in range(14):
            a = a_up - math.pi / 2 + math.pi * i / 13
            pts.append((up_c.y + math.cos(a) * 0.0155, up_c.z + math.sin(a) * 0.0155))
        plate = G.extrude_outline(f'cage{side}', pts, 0.0022, 'X', V(x, 0, 0), bevel=0.0006)
        G.set_material(plate, M.alu if side > 0 else M.steel_dark)
        static.append(plate)
    pulleys = {}
    for key, c in (('upper', up_c), ('lower', lo_c)):
        r_p = 0.0127 / (2 * math.sin(math.pi / 11))
        ring = G.ring_with_hole(f'jockey_{key}', G.gear_outline(11, r_p - 0.003, r_p + 0.0028, steps=0), 0.006, 0.0028, 'X', c)
        G.set_material(ring, M.alu)
        hub = G.lathe(f'jockey_{key}_hub', [(0.0, -0.0062), (0.0058, -0.0062), (0.0058, 0.0062), (0.0, 0.0062)], 12, 'X', c)
        G.set_material(hub, M.steel)
        pulleys[key] = (c, [ring, hub])
    return static, pulleys


def build_front_derailleur(M):
    objs = []
    # Cage outer/inner plates follow the big ring behind/above it.
    r_in, r_out = 0.106, 0.118
    a0, a1 = math.radians(96), math.radians(128)
    for x, w in ((CHAINLINE + 0.012, 0.0022), (CHAINLINE - 0.006, 0.0018)):
        pts = []
        steps = 16
        for i in range(steps + 1):
            a = a0 + (a1 - a0) * i / steps
            pts.append((BB.y + math.cos(a) * r_out, BB.z + math.sin(a) * r_out))
        for i in range(steps + 1):
            a = a1 - (a1 - a0) * i / steps
            rr = r_in + 0.004 * math.sin(math.pi * i / steps)
            pts.append((BB.y + math.cos(a) * rr, BB.z + math.sin(a) * rr))
        plate = G.extrude_outline('fd_plate', pts, w, 'X', V(x, 0, 0), bevel=0.0005)
        G.set_material(plate, M.alu)
        objs.append(plate)
    mount = BB + ST_DIR * 0.165
    arm = G.sweep('fd_arm', G.catmull([mount + V(0.014, -0.012, 0), mount + V(0.03, 0.0, -0.01), V(CHAINLINE + 0.01, BB.y + math.cos(a1) * 0.118, BB.z + math.sin(a1) * 0.118)], 4),
                  G.superellipse(0.012, 0.018, 3, 14), up=(1, 0, 0))
    G.set_material(arm, M.alu)
    objs.append(arm)
    return objs


def build_brake_caliper(M, axle, x_rotor, angle_deg, name):
    a = math.radians(angle_deg)
    c = Vector(axle) + V(x_rotor, math.cos(a) * 0.072, math.sin(a) * 0.072)
    rot = Matrix.Rotation(a + math.pi / 2, 3, 'X')
    halves = []
    for side, w in ((1, 0.013), (-1, 0.013)):
        halves.append(G.rounded_box(f'{name}{side}', (w, 0.058, 0.028), c + V(side * 0.0085, 0, 0), bevel=0.006, segments=3, rotation=rot))
    body = G.join(halves, name)
    G.set_material(body, M.alu)
    return [body]


# ---------------------------------------------------------------------------
# Cockpit, seat, accessories
# ---------------------------------------------------------------------------

def bar_path():
    """Right half of a compact drop bar (relative to the stem clamp), mirrored for the left."""
    right = [V(0.0, 0, 0), V(0.06, 0, 0), V(0.14, 0.002, 0.0), V(0.185, 0.012, -0.002), V(0.208, 0.04, -0.008),
             V(0.214, 0.072, -0.022), V(0.217, 0.088, -0.052), V(0.219, 0.078, -0.098), V(0.222, 0.042, -0.122),
             V(0.226, -0.01, -0.128), V(0.229, -0.075, -0.13)]
    full = [V(-p.x, p.y, p.z) for p in reversed(right[1:])] + right
    return G.catmull(full, 5)


def bar_profiles(path, extra=0.0):
    """Aero-flat tops, round 31.8 mm clamp, 23.8 mm hooks/drops; `extra` for the tape."""
    out = []
    m = 16
    for p in path:
        x = abs(p.x)
        clamp = smoothstep(0.05, 0.03, x)
        aero = smoothstep(0.03, 0.06, x) * smoothstep(0.18, 0.13, x)
        r = 0.0119 + (0.0159 - 0.0119) * clamp
        w = 2 * (r + extra) * (1 + 0.55 * aero)
        h = 2 * (r + extra) * (1 - 0.2 * aero)
        out.append(G.superellipse(w, h, 2.0 + 0.8 * aero, m))
    return out


def sweep_profiles(name, path, profiles, up):
    """Sweep with one profile per path point."""
    path = [Vector(p) for p in path]
    fr = G.frames(path, up)
    verts, faces, uvs = [], [], []
    n, m = len(path), len(profiles[0])
    lengths = [0.0]
    for i in range(1, n):
        lengths.append(lengths[-1] + (path[i] - path[i - 1]).length)
    for i in range(n):
        tan, side, upv = fr[i]
        for (x, y) in profiles[i]:
            verts.append(path[i] + side * x + upv * y)
    for i in range(n - 1):
        for j in range(m):
            j2 = (j + 1) % m
            faces.append((i * m + j, i * m + j2, (i + 1) * m + j2, (i + 1) * m + j))
            uvs.append(((lengths[i], j / m), (lengths[i], (j + 1) / m), (lengths[i + 1], (j + 1) / m), (lengths[i + 1], j / m)))
    for ring, rev in ((0, True), (n - 1, False)):
        c = sum((verts[ring * m + j] for j in range(m)), Vector()) / m
        ci = len(verts)
        verts.append(c)
        for j in range(m):
            j2 = (j + 1) % m
            a, b = ring * m + j, ring * m + j2
            faces.append((ci, b, a) if rev else (ci, a, b))
            uvs.append(((0, 0.5), (0, 0.5), (0, 0.5)))
    return G.make_object(name, verts, faces, uvs)


def build_cockpit(M):
    """Steer-group parts (world space) + hand sockets."""
    objs = []
    # Headset cover + spacers along the steerer.
    up_axis = -D_STEER
    cover = G.sweep('hs_cover', G.line(HT_TOP - D_STEER * 0.002, HT_TOP + up_axis * 0.012, 3),
                    lambda t: G.circle(0.0235 - 0.005 * t, 28), up=(0, 1, 0))
    G.set_material(cover, M.paint)
    white_vcol(cover)
    G.paint_vertices(cover, lambda co: GRAPHITE)
    objs.append(cover)
    for k in range(2):
        a = HT_TOP + up_axis * (0.012 + 0.0052 * k)
        sp = G.sweep(f'spacer{k}', G.line(a, a + up_axis * 0.005, 2), G.circle(0.0185, 28), up=(0, 1, 0))
        G.set_material(sp, M.carbon)
        scale_uv(sp, 40, 3)
        objs.append(sp)
    steer_top = HT_TOP + up_axis * 0.0225
    clamp_c = steer_top + up_axis * 0.021
    stem_dir = (PERP * math.cos(math.radians(-12)) + up_axis * math.sin(math.radians(-12))).normalized()
    bar_c = clamp_c + stem_dir * 0.100
    stem_parts = [
        G.sweep('stem_clamp', G.line(clamp_c - up_axis * 0.021, clamp_c + up_axis * 0.021, 3), G.superellipse(0.042, 0.042, 2.2, 28), up=(0, 1, 0)),
        G.sweep('stem_body', G.line(clamp_c, bar_c, 6), lambda t: G.superellipse(0.03, 0.034 - 0.004 * t, 3.4, 20), up=tuple(up_axis)),
        G.lathe('stem_barclamp', [(0.0, -0.023), (0.0205, -0.023), (0.0205, 0.023), (0.0, 0.023)], 28, 'X', bar_c),
        G.rounded_box('stem_face', (0.044, 0.01, 0.036), bar_c + stem_dir * 0.017, bevel=0.0045, segments=2),
        G.sweep('stem_cap', G.line(clamp_c + up_axis * 0.021, clamp_c + up_axis * 0.025, 2), G.circle(0.019, 24), up=(0, 1, 0)),
    ]
    stem = G.remesh_union(stem_parts, 'stem', voxel=0.0011, smooth_iter=4, smooth_lambda=0.5, target_faces=2600)
    G.set_material(stem, M.alu)
    objs.append(stem)
    capring = G.sweep('stem_cap_ring', G.line(clamp_c + up_axis * 0.0245, clamp_c + up_axis * 0.0262, 2), G.circle(0.0128, 24), up=(0, 1, 0))
    G.set_material(capring, M.accent)
    objs.append(capring)

    path = [bar_c + p for p in bar_path()]
    bar = sweep_profiles('handlebar', path, bar_profiles([p - bar_c for p in path]), up=(0, 0, 1))
    scale_uv(bar, 50, 3)
    G.set_material(bar, M.carbon)
    objs.append(bar)
    # Bar tape from the tops (|x| > 0.075) to the drop ends.
    rel = [p - bar_c for p in path]
    for side in (-1, 1):
        idx = [i for i, p in enumerate(rel) if p.x * side > 0.075]
        sub = [path[i] for i in idx]
        if side < 0:
            sub = list(reversed(sub))
        profs = bar_profiles([s - bar_c for s in sub], extra=0.0018)
        tp = sweep_profiles(f'tape{side}', sub, profs, up=(0, 0, 1))
        scale_uv(tp, 1 / 0.028, 1)
        G.set_material(tp, M.tape)
        objs.append(tp)
        end = sub[-1]
        d = (sub[-1] - sub[-2]).normalized()
        plug = G.sweep(f'plug{side}', [end - d * 0.001, end + d * 0.003], G.circle(0.0142, 18), up=(1, 0, 0))
        G.set_material(plug, M.accent)
        objs.append(plug)

    sockets = {}
    for side in (-1, 1):
        s = 'R' if side > 0 else 'L'
        H = bar_c + V(side * 0.214, 0.07, -0.02)
        # Hood body: clamps on the bar bend, flat top for the hands, rises to the horn.
        hp = [H + V(0, -0.022, -0.004), H + V(0, 0.0, 0.004), H + V(0, 0.026, 0.007), H + V(0, 0.046, 0.013), H + V(0, 0.056, 0.02)]
        hood = G.sweep(f'hood{side}', G.catmull(hp, 5),
                       lambda t: G.superellipse(0.031 - 0.011 * t ** 2, 0.044 - 0.022 * t ** 1.5, 2.8, 22),
                       up=(0, 0, 1), scale=None)
        # Drop the profile centre a little below the path so the top stays flat.
        for v in hood.data.vertices:
            v.co.z -= 0.008
        hood.data.update()
        G.set_material(hood, M.rubber)
        objs.append(hood)
        lever_pts = [H + V(-side * 0.001, 0.046, -0.006), H + V(-side * 0.002, 0.044, -0.045), H + V(-side * 0.004, 0.03, -0.08), H + V(-side * 0.007, 0.004, -0.1)]
        lever = G.sweep(f'lever{side}', G.catmull(lever_pts, 5), lambda t: G.superellipse(0.013 - 0.003 * t, 0.008 - 0.002 * t, 3.0, 14), up=(0, 1, 0))
        G.set_material(lever, M.carbon)
        scale_uv(lever, 50, 2)
        objs.append(lever)
        paddle_pts = [H + V(-side * 0.004, 0.036, -0.03), H + V(-side * 0.006, 0.034, -0.06), H + V(-side * 0.009, 0.022, -0.082)]
        paddle = G.sweep(f'paddle{side}', G.catmull(paddle_pts, 4), lambda t: G.superellipse(0.01, 0.0045, 3.0, 12), up=(0, 1, 0))
        G.set_material(paddle, M.alu)
        objs.append(paddle)
        tip = G.rounded_box(f'levertip{side}', (0.011, 0.006, 0.012), lever_pts[-1] + V(0, -0.002, -0.004), bevel=0.0025, segments=2)
        G.set_material(tip, M.accent)
        objs.append(tip)
        sockets[f'socket_hood_{s}'] = H + V(0, 0.012, 0.016)
        sockets[f'socket_drop_{s}'] = bar_c + V(side * 0.224, 0.0, -0.127)
        sockets[f'socket_top_{s}'] = bar_c + V(side * 0.12, 0.0, 0.0)
    return objs, sockets


def build_seat(M):
    objs = []
    sp_a = BB + ST_DIR * (ST_LEN - 0.04)
    sp_b = BB + ST_DIR * (SADDLE_H - 0.055)
    post = G.sweep('seatpost', G.line(sp_a, sp_b, 4), G.teardrop(0.026, 0.036, 22, tail=0.35), up=(0, 1, 0.3))
    scale_uv(post, 50, 5)
    G.set_material(post, M.carbon)
    objs.append(post)
    head = G.rounded_box('post_head', (0.03, 0.05, 0.022), sp_b + V(0, 0.002, 0.012), bevel=0.006, segments=2)
    G.set_material(head, M.alu)
    objs.append(head)

    # Saddle: lofted shell (short-nose race shape) with a relief channel.
    top = BB + ST_DIR * SADDLE_H
    y0 = top.y + 0.015                 # saddle centre (nose forward)
    L = 0.255
    nu, nv = 22, 14

    def half_w(u):  # u: 0 rear … 1 nose
        rear = 0.071 * (1 - (1 - u / 0.18) ** 2 * 0.25) if u < 0.18 else 0.071
        body = 0.071 - 0.046 * smoothstep(0.25, 0.75, u)
        w = min(rear, body) if u >= 0.18 else rear
        return max(0.016, w * (1 - 0.35 * smoothstep(0.92, 1.0, u)))

    def z_top(u, s):  # s: -1..1 across
        kick = 0.012 * smoothstep(0.12, 0.0, u)
        crown = 0.010 * (1 - s * s) ** 0.6
        channel = -0.0035 * math.exp(-(s / 0.18) ** 2) * smoothstep(0.15, 0.3, u) * smoothstep(0.8, 0.6, u)
        droop = -0.006 * smoothstep(0.85, 1.0, u)
        return kick + crown + channel + droop

    verts, faces = [], []
    for i in range(nu):
        u = i / (nu - 1)
        y = y0 - L / 2 + L * u
        w = half_w(u)
        for j in range(nv):
            s = -1 + 2 * j / (nv - 1)
            ss = math.sin(s * math.pi / 2)
            x = ss * w
            verts.append(V(x, y, top.z + z_top(u, ss)))
    off = len(verts)
    for i in range(nu):
        u = i / (nu - 1)
        y = y0 - L / 2 + L * u
        w = half_w(u) * 0.93
        for j in range(nv):
            s = -1 + 2 * j / (nv - 1)
            ss = math.sin(s * math.pi / 2)
            verts.append(V(ss * w, y + (0.004 if u < 0.05 else 0), top.z - 0.014 + 0.004 * (1 - ss * ss) + z_top(u, ss) * 0.5))
    for i in range(nu - 1):
        for j in range(nv - 1):
            a = i * nv + j
            faces.append((a, a + 1, a + nv + 1, a + nv))
            b = off + a
            faces.append((b, b + nv, b + nv + 1, b + 1))
    for i in range(nu - 1):
        for j in (0, nv - 1):
            a, b = i * nv + j, (i + 1) * nv + j
            if j == 0:
                faces.append((a, b, off + b, off + a))
            else:
                faces.append((a, off + a, off + b, b))
    for j in range(nv - 1):
        a, b = j, j + 1
        faces.append((a, off + a, off + b, b))
        a, b = (nu - 1) * nv + j, (nu - 1) * nv + j + 1
        faces.append((a, b, off + b, off + a))
    saddle = G.make_object('saddle', verts, faces)
    G.fix_normals(saddle)
    sub = saddle.modifiers.new('sub', 'SUBSURF')
    sub.levels = 1
    G.apply_modifiers(saddle)
    saddle.data.shade_smooth()

    def scol(co):
        u = (co.y - (y0 - L / 2)) / L
        side = smoothstep(0.045, 0.062, abs(co.x)) * smoothstep(0.5, 0.25, u)
        c = mix(srgb('#121417'), srgb('#2a3039'), side)
        stripe = smoothstep(0.006, 0.003, abs(co.x)) * smoothstep(0.02, 0.05, u) * smoothstep(0.2, 0.12, u) * (1 if co.z > top.z else 0)
        return mix(c, CYAN, stripe)

    G.paint_vertices(saddle, scol)
    G.set_material(saddle, M.saddle)
    objs.append(saddle)
    rails = []
    for side in (-1, 1):
        rp = [V(side * 0.016, y0 + L / 2 - 0.035, top.z - 0.012), V(side * 0.021, y0 + 0.02, top.z - 0.034),
              V(side * 0.021, y0 - 0.06, top.z - 0.034), V(side * 0.035, y0 - L / 2 + 0.03, top.z - 0.014)]
        rails.append(G.tube(f'rail{side}', G.catmull(rp, 6), 0.0035, m=10))
    rails = G.join(rails, 'saddle_rails')
    G.set_material(rails, M.steel_dark)
    objs.append(rails)
    return objs, top + V(0, -0.02, 0.012)


def build_bottle(M):
    dt_a = BB + V(0, 0.01, 0.005)
    dt_b = HT_BOT - D_STEER * 0.035
    axis = (dt_b - dt_a).normalized()
    nrm = V(0, -axis.z, axis.y)           # up-perpendicular to the down tube (in YZ)
    base = dt_a.lerp(dt_b, 0.22) + nrm * 0.064
    prof = [(0.0, 0.0), (0.03, 0.0), (0.0355, 0.004), (0.037, 0.02), (0.036, 0.07), (0.033, 0.09), (0.0365, 0.11),
            (0.037, 0.165), (0.034, 0.19), (0.026, 0.203), (0.017, 0.207), (0.017, 0.215), (0.012, 0.222), (0.0058, 0.232), (0.0, 0.233)]
    bottle = G.lathe('bottle', prof, 32, 'Z', (0, 0, 0))
    G.set_material(bottle, M.bottle)
    band = G.lathe('bottle_band', [(0.0372, 0.118), (0.0376, 0.12), (0.0376, 0.15), (0.0372, 0.152)], 32, 'Z', (0, 0, 0), cap_ends=False)
    G.set_material(band, M.accent)
    cage = []
    for side in (-1, 1):
        cp = [V(side * 0.012, 0, 0.02), V(side * 0.038, 0, 0.06), V(side * 0.039, 0, 0.13), V(side * 0.03, 0, 0.17)]
        cage.append(G.tube(f'cage{side}', G.catmull(cp, 5), 0.0028, m=8))
    cage.append(G.tube('cage_back', [V(0, -0.038, 0.03), V(0, -0.04, 0.16)], 0.004, m=8))
    cage = G.join(cage, 'bottle_cage')
    G.set_material(cage, M.alu)
    # Orient: local Z along the down tube, local -Y toward the tube.
    rot = Matrix((nrm.cross(axis), nrm, axis)).transposed()
    mtx = Matrix.Translation(base) @ rot.to_4x4()
    for o in (bottle, band, cage):
        o.data.transform(mtx)
    return [bottle, band, cage]


def build_thru_axles(M):
    objs = []
    for c, half in ((REAR_AXLE, 0.0745), (FRONT_AXLE, 0.0575)):
        ax = G.lathe('axle', [(0.0, -half - 0.004), (0.011, -half - 0.004), (0.011, -half), (0.0065, -half + 0.002), (0.0065, half), (0.009, half + 0.003), (0.0, half + 0.003)], 18, 'X', c)
        G.set_material(ax, M.alu)
        objs.append(ax)
        lever = G.rounded_box('axle_lever', (0.006, 0.045, 0.012), c + V(-half - 0.007, 0.012, 0), bevel=0.003, segments=2)
        G.set_material(lever, M.accent)
        objs.append(lever)
    return objs


# ---------------------------------------------------------------------------
# Assembly
# ---------------------------------------------------------------------------

def empty(name, loc, parent=None):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.03
    bpy.context.scene.collection.objects.link(e)
    e.location = loc
    if parent is not None:
        bpy.context.view_layer.update()
        e.parent = parent
        e.matrix_parent_inverse = parent.matrix_world.inverted()
    bpy.context.view_layer.update()
    return e


def attach(objs, node, name):
    """Joins `objs` (world space) into one mesh per node, re-expressed in node space."""
    objs = [o for o in objs if o is not None]
    if not objs:
        return None
    # Make every part share the same attribute set before joining (vertex colors).
    for o in objs:
        if 'Col' not in o.data.color_attributes:
            white_vcol(o)
    obj = G.join(objs, name)
    bpy.context.view_layer.update()
    obj.data.transform(node.matrix_world.inverted())
    obj.parent = node
    obj.matrix_parent_inverse.identity()
    obj.matrix_basis.identity()
    return obj


def to_gltf(v):
    return [round(v.x, 5), round(v.z, 5), round(-v.y, 5)]


def build(args):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    M = Materials()

    root = empty('argus_bike', V(0, Y_MID, 0))
    frame = empty('frame', V(0, Y_MID, 0), root)
    steer = empty('steer', HT_BOT, root)
    wheel_r = empty('wheel_rear', REAR_AXLE, frame)
    wheel_f = empty('wheel_front', FRONT_AXLE, steer)
    crank = empty('crank', BB, frame)

    # Frame group.
    frame_objs = [build_frame(M)] + build_decals(M)
    seat_objs, saddle_socket = build_seat(M)
    frame_objs += seat_objs
    chain_path, up_c, lo_c = chain_loop()
    rd_static, pulleys = build_rear_derailleur(M, up_c, lo_c)
    frame_objs += rd_static + build_front_derailleur(M)
    frame_objs += build_brake_caliper(M, REAR_AXLE, -0.0585, 12, 'caliper_r')
    frame_objs += build_bottle(M) + build_thru_axles(M)
    attach(frame_objs, frame, 'frame_mesh')

    # Steering group.
    cockpit, hand_sockets = build_cockpit(M)
    steer_objs = [build_fork(M)] + cockpit + build_brake_caliper(M, FRONT_AXLE, -0.0515, 152, 'caliper_f')
    attach(steer_objs, steer, 'steer_mesh')

    attach(build_wheel('wheel_r', M, REAR_AXLE, True), wheel_r, 'wheel_rear_mesh')
    attach(build_wheel('wheel_f', M, FRONT_AXLE, False), wheel_f, 'wheel_front_mesh')

    crank_objs, pedal_parts = build_crankset(M)
    attach(crank_objs, crank, 'crank_mesh')
    for side, s in ((1, 'R'), (-1, 'L')):
        c, objs = pedal_parts[side]
        node = empty(f'pedal_{s}', c, crank)
        attach(objs, node, f'pedal_{s}_mesh')
        # Ball of the foot: on the pedal body top, centred on the body.
        empty(f'socket_pedal_{s}', c + V(side * 0.036, 0.0, 0.0125), node)

    for key in ('upper', 'lower'):
        c, objs = pulleys[key]
        node = empty(f'pulley_{key}', c, frame)
        attach(objs, node, f'pulley_{key}_mesh')

    for outer in (True, False):
        name = 'chain_outer' if outer else 'chain_inner'
        node = empty(name, V(0, 0, 0), frame)   # node space = pre-rotation world space
        link = chain_link(name + '_link', M, outer)
        attach([link], node, name + '_mesh')

    empty('socket_saddle', saddle_socket, frame)
    for k, p in hand_sockets.items():
        empty(k, p, steer)

    # Chain path in frame-local glTF coordinates (frame origin = root origin).
    links, pitch = resample_closed(chain_path, 0.0127)
    origin = V(0, Y_MID, 0)
    meta = {
        'version': 1,
        'wheelRadius': R_WHEEL,
        'crankLength': CRANK,
        'steerAxis': to_gltf(-D_STEER),
        'chainringTeeth': 50, 'cogTeeth': 17, 'pulleyTeeth': 11,
        'chainPitch': round(pitch, 6),
        'chainPath': [to_gltf(p) for p in chain_path],   # chain_outer/inner node space
        'wheelbase': round(FRONT_AXLE.y - REAR_AXLE.y, 4),
    }
    root['argus_bike'] = json.dumps(meta)

    # Face +z in Babylon (see header).
    root.location = (0, 0, 0)
    root.rotation_euler = (0, 0, math.pi)
    bpy.context.view_layer.update()

    tris = sum(G.tri_count(o) for o in scene.objects if o.type == 'MESH')
    print(f'[argus_bike] meshes: {sum(1 for o in scene.objects if o.type == "MESH")}, triangles: {tris}, chain links: {len(links)}')
    for o in sorted((o for o in scene.objects if o.type == 'MESH'), key=lambda o: -G.tri_count(o)):
        print(f'    {o.name:24s} {G.tri_count(o):7d} tris  materials: {", ".join(m.name for m in o.data.materials)}')

    if args.out:
        os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
        bpy.ops.export_scene.gltf(
            filepath=args.out, export_format='GLB', export_extras=True, export_yup=True,
            export_apply=True, export_texcoords=True, export_normals=True, export_tangents=False,
            export_vertex_color='MATERIAL', export_cameras=False, export_lights=False,
            export_animations=False, export_image_format='AUTO', export_materials='EXPORT')
        print(f'[argus_bike] wrote {args.out} ({os.path.getsize(args.out) / 1e6:.2f} MB)')

    if args.render:
        import render_preview
        render_preview.render(args.render, args.hdr, links, pitch, root)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument('--out', default=None)
    p.add_argument('--render', default=None, help='directory for preview renders')
    p.add_argument('--hdr', default=None, help='HDRI for the preview renders')
    build(p.parse_args(argv))


if __name__ == '__main__':
    main()
