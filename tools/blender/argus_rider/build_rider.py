# Argus Cyclist - Virtual Cycling Environment for interactive bicycling experiments.
# Copyright (C) 2026  Paulo Sérgio
# SPDX-License-Identifier: GPL-3.0-or-later
#
# Rigged cyclist for the Argus Cyclist 3D scene.
#
#   BLENDER_USER_RESOURCES=<dir with MPFB + MakeHuman system assets> \
#   blender -b -P tools/blender/argus_rider/build_rider.py -- \
#       --out frontend/src/assets/scene3d/models/argus_rider.glb [--render DIR] [--hdr FILE]
#
# Requires the MPFB extension (MakeHuman for Blender, GPL) and the MakeHuman system
# asset pack (CC0) in MPFB's user data (see tools/blender/README.md). Everything
# exported is CC0 (MakeHuman output and assets) or generated here.
#
# Body: MakeHuman base mesh (athletic adult male, ~1.78 m), "game_engine" skeleton
# (53 bones, Unreal-style names: pelvis, spine_01..03, upperarm_l, calf_r, ...).
# Kit: the body faces are split into materials by skinning region (the kit is skin-tight,
# so it shares the body surface): jersey (tintable main + accent panels + trims),
# bib shorts with leg grippers, socks, fingerless gloves. Separate skinned meshes:
# cycling shoes fitted to the feet, helmet with vents, wrap-around glasses.
# The fingers are baked in a grip pose; the riding pose itself is computed at runtime
# (RiderModel.js: inverse kinematics to the bike's saddle, hoods and pedals).
#
# Orientation: MakeHuman faces -Y in Blender, i.e. +z in Babylon with the right side on
# +x (the CyclistRig convention), so no extra root rotation is needed.

import argparse
import math
import os
import sys

import bpy
import bmesh
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'argus_bike'))
import geom as G  # noqa: E402
sys.path.insert(0, HERE)
import kit_texture  # noqa: E402

from bl_ext.user_default.mpfb.services.humanservice import HumanService  # noqa: E402
from bl_ext.user_default.mpfb.services.locationservice import LocationService  # noqa: E402
from bl_ext.user_default.mpfb.services.rigservice import RigService  # noqa: E402

V = G.V

MACRO = {
    "gender": 1.0, "age": 0.5, "muscle": 0.72, "weight": 0.40, "proportions": 0.8, "height": 0.52,
    "cupsize": 0.5, "firmness": 0.5, "race": {"asian": 0.1, "caucasian": 0.7, "african": 0.2},
}


def srgb(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((x / 12.92) if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


KIT = {
    'jersey_main': ('#1aa3e0', 0.78),     # Argus cyan-blue (tinted at runtime if wanted)
    'jersey_panel': ('#101b2b', 0.75),    # navy side panels / shoulders
    'jersey_trim': ('#f2f5f8', 0.7),      # collar, sleeve cuffs
    'bib': ('#0c0d10', 0.62),
    'bib_gripper': ('#38bdf8', 0.6),
    'sock': ('#eef1f4', 0.85),
    'glove': ('#15181c', 0.7),
    'shoe': ('#f3f5f7', 0.32),
    'sole': ('#111214', 0.5),
    'helmet': ('#f4f6f8', 0.22),
    'helmet_inner': ('#141518', 0.85),
    'accent': ('#38bdf8', 0.3),
    'frame_black': ('#0d0e10', 0.25),
}


def make_mat(name, hex_or_rgb, roughness, metallic=0.0, coat=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    b = mat.node_tree.nodes['Principled BSDF']
    rgb = srgb(hex_or_rgb) if isinstance(hex_or_rgb, str) else hex_or_rgb
    b.inputs['Base Color'].default_value = (*rgb, 1.0)
    b.inputs['Roughness'].default_value = roughness
    b.inputs['Metallic'].default_value = metallic
    if coat:
        b.inputs['Coat Weight'].default_value = coat
        b.inputs['Coat Roughness'].default_value = 0.05
    mat.use_backface_culling = True
    return mat


def textured_mat(name, image_path, roughness=0.6, alpha_clip=False, max_size=1024):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    b = nt.nodes['Principled BSDF']
    b.inputs['Roughness'].default_value = roughness
    img = bpy.data.images.load(image_path)
    if max(img.size) > max_size:
        img.scale(max_size, max_size)
    img.pack()
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    nt.links.new(tex.outputs['Color'], b.inputs['Base Color'])
    if alpha_clip:
        gt = nt.nodes.new('ShaderNodeMath')
        gt.operation = 'GREATER_THAN'
        gt.inputs[1].default_value = 0.5
        nt.links.new(tex.outputs['Alpha'], gt.inputs[0])
        nt.links.new(gt.outputs[0], b.inputs['Alpha'])
        mat.use_backface_culling = False
    else:
        mat.use_backface_culling = True
    return mat


def data_path(*parts):
    return os.path.join(LocationService.get_user_data(), *parts)


# ---------------------------------------------------------------------------
# Human
# ---------------------------------------------------------------------------

def clear_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)


def create_human():
    human = HumanService.create_human(macro_detail_dict=MACRO, scale=0.1)
    rig = HumanService.add_builtin_rig(human, 'game_engine')
    HumanService.set_character_skin(data_path('skins', 'young_caucasian_male', 'young_caucasian_male.mhmat'), human, skin_type='GAMEENGINE')
    assets = {}
    for kind, rel in (('Eyes', ('eyes', 'low-poly', 'low-poly.mhclo')), ('Eyebrows', ('eyebrows', 'eyebrow001', 'eyebrow001.mhclo')),
                      ('Hair', ('hair', 'short02', 'short02.mhclo'))):
        before = set(bpy.data.objects)
        HumanService.add_mhclo_asset(data_path(*rel), human, asset_type=kind, subdiv_levels=0, material_type='MAKESKIN')
        new = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
        assets[kind] = new[0] if new else None
    return human, rig, assets


def grip_fingers(rig):
    """Curls the fingers around the brake hoods and bakes it into the rest pose."""
    curls = {'index': (0.55, 0.75, 0.45), 'middle': (0.62, 0.8, 0.45), 'ring': (0.7, 0.85, 0.45), 'pinky': (0.75, 0.85, 0.45)}
    for side in ('l', 'r'):
        for finger, angles in curls.items():
            for k, a in enumerate(angles, 1):
                pb = rig.pose.bones.get(f'{finger}_0{k}_{side}')
                if pb:
                    pb.rotation_mode = 'XYZ'
                    pb.rotation_euler = (a, 0, 0)
        for k, a in ((1, 0.25), (2, 0.35), (3, 0.3)):
            pb = rig.pose.bones.get(f'thumb_0{k}_{side}')
            if pb:
                pb.rotation_mode = 'XYZ'
                pb.rotation_euler = (a, 0, 0)
    bpy.context.view_layer.update()
    RigService.apply_pose_as_rest_pose(rig)


def remove_helpers(human):
    """Applies the MPFB helper mask: keeps only the 'body' vertex group."""
    gi = human.vertex_groups['body'].index
    bm = bmesh.new()
    bm.from_mesh(human.data)
    deform = bm.verts.layers.deform.active
    kill = [v for v in bm.verts if gi not in v[deform]]
    bmesh.ops.delete(bm, geom=kill, context='VERTS')
    bm.to_mesh(human.data)
    bm.free()
    for m in list(human.modifiers):
        if m.type == 'MASK':
            human.modifiers.remove(m)


# ---------------------------------------------------------------------------
# Kit regions
# ---------------------------------------------------------------------------

def bone_axis(rig, name):
    b = rig.data.bones[name]
    mw = rig.matrix_world
    return mw @ b.head_local, mw @ b.tail_local


def along(p, axis):
    h, t = axis
    d = t - h
    return (p - h).dot(d) / d.length_squared


def hide_feet(human, rig):
    """Removes the foot faces below the ankle (the shoes replace them)."""
    me = human.data
    names = {g.index: g.name for g in human.vertex_groups if g.name in rig.data.bones}
    mw = human.matrix_world
    co = [mw @ v.co for v in me.vertices]
    vweights = [{names[g.group]: g.weight for g in v.groups if g.weight > 0.01 and g.group in names} for v in me.vertices]
    ankles = {s: bone_axis(rig, f'foot_{s}')[0] for s in ('l', 'r')}
    hidden = set()
    for poly in me.polygons:
        acc = {}
        for vi in poly.vertices:
            for g, w in vweights[vi].items():
                acc[g] = acc.get(g, 0.0) + w
        if not acc:
            continue
        bone = max(acc, key=acc.get)
        if bone.startswith(('foot_', 'ball_')):
            c = sum((co[vi] for vi in poly.vertices), Vector()) / len(poly.vertices)
            if c.z < ankles[bone[-1]].z + 0.015:
                hidden.add(poly.index)
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index in hidden], context='FACES_ONLY')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(me)
    bm.free()
    me.update()


# ---------------------------------------------------------------------------
# Accessories (skinned to a single bone)
# ---------------------------------------------------------------------------

def bind(obj, rig, bone):
    obj.parent = rig
    obj.matrix_parent_inverse = rig.matrix_world.inverted()
    vg = obj.vertex_groups.new(name=bone)
    vg.add(list(range(len(obj.data.vertices))), 1.0, 'REPLACE')
    mod = obj.modifiers.new('Armature', 'ARMATURE')
    mod.object = rig
    return obj


def sweep_sections(name, sections):
    """sections: list of lists of Vector rings (same count). Closed ends with fans."""
    n, m = len(sections), len(sections[0])
    verts = [p for ring in sections for p in ring]
    faces = []
    for i in range(n - 1):
        for j in range(m):
            j2 = (j + 1) % m
            faces.append((i * m + j, i * m + j2, (i + 1) * m + j2, (i + 1) * m + j))
    for ring, rev in ((0, True), (n - 1, False)):
        c = sum(sections[ring], Vector()) / m
        ci = len(verts)
        verts.append(c)
        for j in range(m):
            j2 = (j + 1) % m
            a, b = ring * m + j, ring * m + j2
            faces.append((ci, b, a) if rev else (ci, a, b))
    obj = G.make_object(name, verts, faces)
    G.fix_normals(obj)
    return obj


def build_shoe(human, rig, side, mats):
    """Cycling shoe lofted around the (removed) foot: slice-fitted, smooth upper,
    flat stiff sole, cyan dial."""
    names = {g.index: g.name for g in human.vertex_groups if g.name in rig.data.bones}
    mw = human.matrix_world
    heel_axis = bone_axis(rig, f'foot_{side}')
    ball = bone_axis(rig, f'ball_{side}')
    ankle = heel_axis[0]
    fwd = (ball[1] - ankle)
    fwd.z = 0
    fwd.normalize()
    lat = fwd.cross(Vector((0, 0, 1))).normalized()
    pts = []
    for v in human.data.vertices:
        w = {names[g.group]: g.weight for g in v.groups if g.group in names}
        if not w:
            continue
        bone = max(w, key=w.get)
        if bone in (f'foot_{side}', f'ball_{side}', f'calf_{side}'):
            p = mw @ v.co
            if bone.startswith('calf') and p.z > ankle.z + 0.03:
                continue
            pts.append(p)
    # Foot frame: u along the foot, s lateral, h up (world z).
    loc = [((p - ankle).dot(fwd), (p - ankle).dot(lat), p.z) for p in pts]
    umin = min(l[0] for l in loc) - 0.006
    umax = max(l[0] for l in loc) + 0.008
    floor = min(l[2] for l in loc)
    bins = 14
    sections = []
    m = 20
    for i in range(bins + 1):
        u = umin + (umax - umin) * i / bins
        sl = [l for l in loc if abs(l[0] - u) < (umax - umin) / bins]
        if not sl:
            sl = loc
        smin, smax = min(l[1] for l in sl), max(l[1] for l in sl)
        top = max(l[2] for l in sl)
        t = i / bins
        top = min(top, ankle.z + 0.012) + 0.004
        if t > 0.55:
            top = min(top, floor + 0.055 - 0.03 * (t - 0.55) / 0.45)  # sleek toe box
        w = (smax - smin) / 2 + 0.006
        cs = (smin + smax) / 2
        bottom = floor - 0.004
        # End caps taper.
        taper = min(1.0, 0.35 + 0.65 * math.sin(math.pi * min(1.0, t / 0.12, (1 - t) / 0.18) / 2)) if 0 < t < 1 else 0.35
        hgt = (top - bottom)
        ring = []
        for k in range(m):
            a = G.TAU * k / m
            ca, sa = math.cos(a), math.sin(a)
            x = math.copysign(abs(ca) ** (2 / 3.2), ca) * w * taper
            y = math.copysign(abs(sa) ** (2 / (2.2 if sa > 0 else 6.0)), sa) * hgt / 2 * (taper if sa > 0 else 1.0)
            ring.append(ankle + fwd * u + lat * (cs + x) + Vector((0, 0, bottom + hgt / 2 + y - ankle.z)))
        sections.append(ring)
    shoe = sweep_sections(f'shoe_{side}', sections)
    sub = shoe.modifiers.new('sub', 'SUBSURF')
    sub.levels = 1
    G.apply_modifiers(shoe)
    shoe.data.shade_smooth()
    shoe.data.materials.append(mats['shoe'])
    shoe.data.materials.append(mats['sole'])
    for poly in shoe.data.polygons:
        if poly.center.z < floor + 0.006:
            poly.material_index = 1
    # Dial on the upper.
    dial_c = ankle + fwd * (umin + (umax - umin) * 0.5) + Vector((0, 0, 0))
    dial_c.z = floor + 0.075 if False else min(ankle.z + 0.01, floor + 0.07)
    dial = G.lathe(f'dial_{side}', [(0.0, 0.0), (0.012, 0.0), (0.013, 0.004), (0.011, 0.008), (0.0, 0.009)], 16, 'Z', dial_c - Vector((0, 0, 0.002)))
    dial.data.materials.append(mats['accent'])
    shoe = G.join([shoe, dial], f'shoe_{side}')
    return bind(shoe, rig, f'foot_{side}')


def head_frame(human, rig):
    names = {g.index: g.name for g in human.vertex_groups if g.name in rig.data.bones}
    mw = human.matrix_world
    hz = bone_axis(rig, 'head')[0].z
    pts = []
    for v in human.data.vertices:
        w = {names[g.group]: g.weight for g in v.groups if g.group in names}
        if w and max(w, key=w.get) == 'head':
            p = mw @ v.co
            if p.z > hz - 0.02:
                pts.append(p)
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return (lo + hi) / 2, (hi - lo) / 2, lo, hi


def build_helmet(human, rig, mats, eye_z):
    """Road helmet: elongated shell (tail at the back), edge rising over the temples and
    dropping to the occiput, vents cut through the shell, black foam inside, straps."""
    c, ext, lo, hi = head_frame(human, rig)
    center = Vector((c.x, c.y + 0.006, eye_z + 0.036))
    rx, ry, rz = ext.x + 0.024, ext.y + 0.024, (hi.z - center.z) + 0.026

    def shape(u, v, w):
        """Unit-sphere point → helmet surface (u lateral, v back, w up)."""
        tail = 1.0 + 0.24 * max(0.0, v) ** 2
        flat = 0.93 + 0.07 * (1 - abs(v))
        return center + Vector((u * rx * (1 - 0.06 * max(0.0, v)), v * ry * tail, w * rz * flat))

    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=64, v_segments=32, radius=1.0)
    kill = []
    for vtx in bm.verts:
        u, v, w = vtx.co
        ang = math.atan2(u, -v)                 # 0 = front
        back = (1 - math.cos(ang)) / 2
        cut = -0.12 * math.sin(ang) ** 2 * (1 - back) - 0.42 * back ** 1.6
        if w < cut:
            kill.append(vtx)
    bmesh.ops.delete(bm, geom=kill, context='VERTS')
    for vtx in bm.verts:
        vtx.co = shape(*vtx.co)
    me = bpy.data.meshes.new('helmet')
    bm.to_mesh(me)
    bm.free()
    helmet = bpy.data.objects.new('helmet', me)
    bpy.context.scene.collection.objects.link(helmet)
    for m in ('helmet', 'helmet_inner', 'accent'):
        helmet.data.materials.append(mats[m])
    G.fix_normals(helmet)
    sol = helmet.modifiers.new('solid', 'SOLIDIFY')
    sol.thickness = 0.026
    sol.offset = -1.0
    sol.material_offset = 1
    sol.material_offset_rim = 1
    sol.use_even_offset = True
    G.apply_modifiers(helmet)

    # Vents: slots following the shell's mid-surface, wider than the shell is thick.
    cutters = []

    def surf(u, v):
        w = math.sqrt(max(0.0, 1 - u * u - v * v))
        p = shape(u, v, w)
        n = Vector((u / rx, v / ry, w / rz)).normalized()
        return p - n * 0.013

    for u in (-0.62, -0.3, 0.3, 0.62):
        for v0, v1 in ((-0.78, -0.3), (-0.12, 0.42)):
            if abs(u) > 0.5 and v0 > -0.2:
                v0, v1 = -0.05, 0.3
            path = [surf(u * (1 - 0.15 * abs(v0 + (v1 - v0) * k / 6)), v0 + (v1 - v0) * k / 6) for k in range(7)]
            cutters.append(G.tube('vent', path, 0.0165, m=12))
    cut = G.join(cutters, 'vent_cutters')
    bo = helmet.modifiers.new('vents', 'BOOLEAN')
    bo.operation = 'DIFFERENCE'
    bo.object = cut
    bo.solver = 'EXACT'
    cut.hide_viewport = True
    G.apply_modifiers(helmet)
    bpy.data.objects.remove(cut)
    helmet.data.shade_smooth()
    helmet.data.set_sharp_from_angle(angle=math.radians(38))
    # Cyan centre stripe on the outer shell.
    for poly in helmet.data.polygons:
        if poly.material_index == 0 and abs(poly.center.x - center.x) < 0.012 and poly.normal.z > 0.25:
            poly.material_index = 2
    # Straps: front and rear of the ear joining below it, then to the chin.
    straps = []
    chin = Vector((c.x, lo.y + 0.035, lo.z + 0.004))
    for sgn in (-1, 1):
        ear = Vector((c.x + sgn * (ext.x + 0.002), c.y - 0.006, eye_z - 0.04))
        front = Vector((c.x + sgn * (ext.x + 0.006), c.y - ext.y * 0.3, eye_z + 0.012))
        rear = Vector((c.x + sgn * (ext.x - 0.004), c.y + ext.y * 0.5, eye_z - 0.002))
        for a in (front, rear):
            straps.append(G.tube('strap', [a, ear], 0.0021, m=6))
        straps.append(G.tube('strap', G.catmull([ear, ear + Vector((-sgn * 0.012, -0.014, -0.045)), chin + Vector((sgn * 0.012, 0, 0))], 4), 0.0021, m=6))
    strap = G.join(straps, 'straps')
    strap.data.materials.append(mats['helmet_inner'])
    helmet = G.join([helmet, strap], 'helmet')
    return bind(helmet, rig, 'head')


def build_glasses(human, rig, mats, eyes_obj):
    c, ext, lo, hi = head_frame(human, rig)
    if eyes_obj is not None:
        ev = [eyes_obj.matrix_world @ v.co for v in eyes_obj.data.vertices]
        eye_c = sum(ev, Vector()) / len(ev)
        eye_front = min(p.y for p in ev)
    else:
        eye_c = Vector((c.x, c.y - ext.y * 0.6, c.z - 0.02))
        eye_front = c.y - ext.y * 0.9
    # Lens band on a vertical cylinder around the head axis.
    R = (c.y - eye_front) + 0.017
    pivot = Vector((c.x, c.y, eye_c.z - 0.002))
    nu, nv = 36, 6
    amax = math.radians(68)
    verts, faces = [], []
    for i in range(nu):
        a = -amax + 2 * amax * i / (nu - 1)
        top = 0.019 - 0.005 * (a / amax) ** 2
        bot = -0.02 + 0.007 * (a / amax) ** 2
        if abs(a) < math.radians(9):
            bot += 0.012 * (1 - abs(a) / math.radians(9))     # nose bridge
        for j in range(nv):
            z = bot + (top - bot) * j / (nv - 1)
            r = R + 0.004 * (1 - (2 * j / (nv - 1) - 1) ** 2)
            verts.append(pivot + Vector((math.sin(a) * r, -math.cos(a) * r, z)))
    for i in range(nu - 1):
        for j in range(nv - 1):
            a = i * nv + j
            faces.append((a, a + nv, a + nv + 1, a + 1))
    lens = G.make_object('lens', verts, faces)
    sol = lens.modifiers.new('s', 'SOLIDIFY')
    sol.thickness = 0.0022
    G.apply_modifiers(lens)
    lens.data.materials.append(mats['lens'])
    # Frame: top bar and temples.
    top_pts = []
    for i in range(nu):
        a = -amax + 2 * amax * i / (nu - 1)
        top = 0.019 - 0.005 * (a / amax) ** 2
        top_pts.append(pivot + Vector((math.sin(a) * (R + 0.001), -math.cos(a) * (R + 0.001), top + 0.002)))
    parts = [G.tube('frame_top', top_pts, 0.0032, m=8)]
    for s in (-1, 1):
        a = s * amax
        start = pivot + Vector((math.sin(a) * R, -math.cos(a) * R, 0.013))
        ear = Vector((c.x + s * (ext.x * 1.02), c.y + ext.y * 0.15, eye_c.z + 0.002))
        parts.append(G.tube('temple', G.catmull([start, start.lerp(ear, 0.5) + Vector((s * 0.006, 0, 0)), ear], 5), 0.0026, m=8))
    frame = G.join(parts, 'glasses_frame')
    frame.data.materials.append(mats['frame_black'])
    glasses = G.join([lens, frame], 'glasses')
    return bind(glasses, rig, 'head')


# ---------------------------------------------------------------------------
# Assembly
# ---------------------------------------------------------------------------

def simplify_asset_material(obj, name, alpha=False, roughness=0.6):
    """Replaces MakeSkin node groups with a plain Principled + diffuse texture."""
    if obj is None:
        return
    img_path = None
    for mat in obj.data.materials:
        if mat and mat.use_nodes:
            for node in mat.node_tree.nodes:
                if node.type == 'TEX_IMAGE' and node.image and 'normal' not in node.image.name.lower():
                    img_path = bpy.path.abspath(node.image.filepath)
                    break
                if node.type == 'GROUP' and node.node_tree:
                    for sub in node.node_tree.nodes:
                        if sub.type == 'TEX_IMAGE' and sub.image and 'normal' not in sub.image.name.lower():
                            img_path = bpy.path.abspath(sub.image.filepath)
                            break
    obj.data.materials.clear()
    if img_path and os.path.exists(img_path):
        obj.data.materials.append(textured_mat(name, img_path, roughness, alpha_clip=alpha, max_size=512))
    else:
        obj.data.materials.append(make_mat(name, '#222222', roughness))


def simplify_skin(human):
    img = None
    for mat in human.data.materials:
        if mat and mat.use_nodes:
            for node in mat.node_tree.nodes:
                if node.type == 'TEX_IMAGE' and node.image:
                    img = bpy.path.abspath(node.image.filepath)
                    break
    path = img if img and os.path.exists(img) else data_path('skins', 'young_caucasian_male', 'young_lightskinned_male_diffuse.png')
    skin = textured_mat('skin', path, roughness=0.55, max_size=2048)
    human.data.materials.clear()
    human.data.materials.append(skin)


def build(args):
    clear_scene()
    human, rig, assets = create_human()
    grip_fingers(rig)
    remove_helpers(human)
    simplify_skin(human)
    mats = {k: make_mat(k, hexc, r, coat=(1.0 if k in ('helmet', 'shoe', 'accent', 'frame_black') else 0.0)) for k, (hexc, r) in KIT.items()}
    mats['lens'] = make_mat('lens', '#123a52', 0.05, metallic=0.9, coat=1.0)
    eyes = assets.get('Eyes')
    eye_z = (sum((eyes.matrix_world @ v.co).z for v in eyes.data.vertices) / len(eyes.data.vertices)) if eyes else bone_axis(rig, 'head')[0].z + 0.07
    shoes = [build_shoe(human, rig, s, mats) for s in ('l', 'r')]
    helmet = build_helmet(human, rig, mats, eye_z)
    glasses = build_glasses(human, rig, mats, eyes)
    # Kit baked into the body texture (computed before removing the feet: needs all UVs).
    skin_img = human.data.materials[0].node_tree.nodes['Image Texture'].image
    kit_img = kit_texture.bake(human, rig, skin_img, size=2048)
    hide_feet(human, rig)
    body_mat = bpy.data.materials.new('rider_body')
    body_mat.use_nodes = True
    bsdf = body_mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = 0.62
    tex = body_mat.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image = kit_img
    body_mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    body_mat.use_backface_culling = True
    human.data.materials.clear()
    human.data.materials.append(body_mat)
    simplify_asset_material(assets.get('Eyes'), 'eyes', roughness=0.2)
    simplify_asset_material(assets.get('Eyebrows'), 'eyebrows', alpha=True)
    simplify_asset_material(assets.get('Hair'), 'hair', alpha=True, roughness=0.7)
    human.name = 'rider_body'
    rig.name = 'rider_rig'

    tris = 0
    for o in bpy.context.scene.objects:
        if o.type == 'MESH':
            t = G.tri_count(o)
            tris += t
            print(f'    {o.name:20s} {t:7d} tris  {", ".join(m.name for m in o.data.materials if m)}')
    h = max((rig.matrix_world @ b.tail_local).z for b in rig.data.bones)
    print(f'[argus_rider] triangles: {tris}, bones: {len(rig.data.bones)}, top bone z: {h:.3f} m')

    if args.out:
        os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
        bpy.ops.object.select_all(action='DESELECT')
        bpy.ops.export_scene.gltf(
            filepath=args.out, export_format='GLB', export_yup=True, export_apply=False,
            export_skins=True, export_animations=False, export_morph=False, export_def_bones=False,
            export_rest_position_armature=True, export_texcoords=True, export_normals=True,
            export_vertex_color='NONE', export_cameras=False, export_lights=False, export_extras=False,
            export_image_format='AUTO', export_materials='EXPORT')
        print(f'[argus_rider] wrote {args.out} ({os.path.getsize(args.out) / 1e6:.2f} MB)')

    if args.render:
        render_preview(args.render, args.hdr, rig)


def render_preview(out_dir, hdr, rig):
    os.makedirs(out_dir, exist_ok=True)
    scene = bpy.context.scene
    world = bpy.data.worlds.new('preview')
    world.use_nodes = True
    nt = world.node_tree
    if hdr and os.path.exists(hdr):
        env = nt.nodes.new('ShaderNodeTexEnvironment')
        env.image = bpy.data.images.load(hdr)
        nt.links.new(env.outputs['Color'], nt.nodes['Background'].inputs['Color'])
    scene.world = world
    sun = bpy.data.lights.new('sun', 'SUN')
    sun.energy = 3.0
    so = bpy.data.objects.new('sun', sun)
    so.rotation_euler = (math.radians(40), 0, math.radians(-30))
    scene.collection.objects.link(so)
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 32
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1000, 1000
    scene.view_settings.view_transform = 'AgX'
    cam_data = bpy.data.cameras.new('cam')
    cam = bpy.data.objects.new('cam', cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    shots = {'front': ((0.0, -3.2, 1.1), (0, 0, 0.95), 50), 'back': ((0.6, 3.0, 1.3), (0, 0, 0.95), 50),
             'head': ((-0.35, -0.75, 1.7), (0, 0, 1.62), 70), 'hand': ((-0.55, -0.45, 1.0), (-0.75, 0, 0.95), 85),
             'feet': ((-0.5, -0.9, 0.35), (-0.1, 0, 0.08), 60)}
    hand = rig.matrix_world @ rig.data.bones['hand_r'].tail_local
    shots['hand'] = (tuple(hand + Vector((-0.18, -0.25, 0.08))), tuple(hand), 70)
    for name, (loc, tgt, lens) in shots.items():
        cam.location = loc
        d = (Vector(tgt) - cam.location).normalized()
        cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        cam_data.lens = lens
        scene.render.filepath = os.path.join(out_dir, f'rider_{name}.png')
        bpy.ops.render.render(write_still=True)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument('--out', default=None)
    p.add_argument('--render', default=None)
    p.add_argument('--hdr', default=None)
    build(p.parse_args(argv))


if __name__ == '__main__':
    main()
