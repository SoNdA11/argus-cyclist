# Argus Cyclist - Virtual Cycling Environment for interactive bicycling experiments.
# Copyright (C) 2026  Paulo Sérgio
# SPDX-License-Identifier: GPL-3.0-or-later
#
# Mesh helpers for the procedural bike: swept profiles along smooth paths
# (rotation-minimizing frames, per-loop UVs), lathes, gears, plates, modifiers
# applied through the depsgraph (no operator context needed).

import math

import bpy
import bmesh
from mathutils import Vector, Matrix

TAU = math.tau


def V(x, y, z):
    return Vector((x, y, z))


# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

def catmull(points, samples=8, closed=False):
    """Centripetal-ish Catmull-Rom through `points` (uniform), `samples` per segment."""
    pts = [Vector(p) for p in points]
    n = len(pts)
    if n < 3:
        return [pts[0].lerp(pts[-1], i / samples) for i in range(samples + 1)] if n == 2 else pts
    out = []
    segs = n if closed else n - 1
    for i in range(segs):
        p0 = pts[(i - 1) % n] if closed or i > 0 else pts[0] * 2 - pts[1]
        p1 = pts[i % n]
        p2 = pts[(i + 1) % n]
        p3 = pts[(i + 2) % n] if closed or i + 2 < n else pts[-1] * 2 - pts[-2]
        for s in range(samples):
            t = s / samples
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    if not closed:
        out.append(pts[-1].copy())
    return out


def line(a, b, samples=2):
    a, b = Vector(a), Vector(b)
    return [a.lerp(b, i / (samples - 1)) for i in range(samples)]


def arc(center, radius, a0, a1, samples, axis='X'):
    """Arc in the plane normal to `axis` (angles in radians, from +Y toward +Z for axis X)."""
    c = Vector(center)
    out = []
    for i in range(samples):
        a = a0 + (a1 - a0) * i / (samples - 1)
        if axis == 'X':
            out.append(c + V(0, math.cos(a) * radius, math.sin(a) * radius))
        elif axis == 'Y':
            out.append(c + V(math.cos(a) * radius, 0, math.sin(a) * radius))
        else:
            out.append(c + V(math.cos(a) * radius, math.sin(a) * radius, 0))
    return out


def path_length(path):
    return sum((path[i + 1] - path[i]).length for i in range(len(path) - 1))


def frames(path, up_hint, closed=False):
    """Rotation-minimizing frames (tangent, side, up) along a polyline."""
    n = len(path)
    tangents = []
    for i in range(n):
        if closed:
            t = path[(i + 1) % n] - path[(i - 1) % n]
        elif i == 0:
            t = path[1] - path[0]
        elif i == n - 1:
            t = path[-1] - path[-2]
        else:
            t = path[i + 1] - path[i - 1]
        tangents.append(t.normalized())
    up = Vector(up_hint)
    up = (up - tangents[0] * up.dot(tangents[0])).normalized()
    out = []
    for i in range(n):
        t = tangents[i]
        if i > 0:
            # Double reflection (Wang et al.) for a stable parallel transport.
            v1 = path[i] - path[i - 1]
            c1 = v1.dot(v1)
            if c1 > 1e-12:
                up_l = up - (2 / c1) * v1.dot(up) * v1
                t_l = tangents[i - 1] - (2 / c1) * v1.dot(tangents[i - 1]) * v1
                v2 = t - t_l
                c2 = v2.dot(v2)
                up = up_l - (2 / c2) * v2.dot(up_l) * v2 if c2 > 1e-12 else up_l
            up = (up - t * up.dot(t)).normalized()
        side = t.cross(up).normalized()
        out.append((t, side, up))
    return out


# ---------------------------------------------------------------------------
# Profiles (closed 2D loops, counter-clockwise, in (side, up) coordinates)
# ---------------------------------------------------------------------------

def superellipse(w, h, n=2.0, m=24):
    pts = []
    for i in range(m):
        a = TAU * i / m
        c, s = math.cos(a), math.sin(a)
        x = math.copysign(abs(c) ** (2 / n), c) * w / 2
        y = math.copysign(abs(s) ** (2 / n), s) * h / 2
        pts.append((x, y))
    return pts


def circle(r, m=16):
    return superellipse(2 * r, 2 * r, 2.0, m)


def teardrop(w, h, m=24, tail=0.55):
    """Aero profile: round leading edge (+up = forward side), tapered tail."""
    pts = []
    for i in range(m):
        a = TAU * i / m
        c, s = math.cos(a), math.sin(a)
        y = s * h / 2
        x = c * w / 2 * (1 - tail * max(0.0, -s) ** 1.5)
        pts.append((x, y))
    return pts


# ---------------------------------------------------------------------------
# Mesh building
# ---------------------------------------------------------------------------

def make_object(name, verts, faces, uvs=None, smooth=True, sharp_angle=None, collection=None):
    """`uvs`: optional list (one per face) of per-corner (u, v) tuples."""
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([tuple(v) for v in verts], [], faces)
    if uvs is not None:
        layer = mesh.uv_layers.new(name='UVMap')
        k = 0
        for fi, poly in enumerate(mesh.polygons):
            for corner, li in enumerate(poly.loop_indices):
                layer.data[li].uv = uvs[fi][corner]
            k += 1
    mesh.validate(clean_customdata=False)
    if smooth:
        mesh.shade_smooth()
        if sharp_angle is not None:
            mesh.set_sharp_from_angle(angle=sharp_angle)
    obj = bpy.data.objects.new(name, mesh)
    (collection or bpy.context.scene.collection).objects.link(obj)
    return obj


def sweep(name, path, profile, up=(0, 0, 1), closed=False, cap=True, scale=None, uv_scale=1.0,
          twist=None, sharp_angle=None):
    """Sweeps a closed 2D profile along `path`.

    profile: list of (x, y) or callable t∈[0,1] → list (same length for every t).
    scale:   optional callable t → (sx, sy) applied to the profile.
    twist:   optional callable t → radians around the tangent.
    UVs: u = arc length · uv_scale, v = position around the profile (0..1).
    """
    path = [Vector(p) for p in path]
    fr = frames(path, up, closed)
    n = len(path)
    lengths = [0.0]
    for i in range(1, n):
        lengths.append(lengths[-1] + (path[i] - path[i - 1]).length)
    total = lengths[-1] or 1.0
    verts, faces, uvs = [], [], []
    m = None
    for i in range(n):
        t = lengths[i] / total
        prof = profile(t) if callable(profile) else profile
        m = len(prof)
        sx, sy = scale(t) if scale else (1.0, 1.0)
        tw = twist(t) if twist else 0.0
        ct, st = math.cos(tw), math.sin(tw)
        tan, side, upv = fr[i]
        for (x, y) in prof:
            x, y = x * sx, y * sy
            x, y = x * ct - y * st, x * st + y * ct
            verts.append(path[i] + side * x + upv * y)
    rings = n if closed else n - 1
    for i in range(rings):
        i2 = (i + 1) % n
        u0 = lengths[i] * uv_scale
        u1 = (lengths[i2] if i2 > i else total + (path[0] - path[-1]).length) * uv_scale
        for j in range(m):
            j2 = (j + 1) % m
            faces.append((i * m + j, i * m + j2, i2 * m + j2, i2 * m + j))
            v0, v1 = j / m, (j + 1) / m
            uvs.append(((u0, v0), (u0, v1), (u1, v1), (u1, v0)))
    if cap and not closed:
        for ring, rev in ((0, True), (n - 1, False)):
            c = sum((verts[ring * m + j] for j in range(m)), Vector()) / m
            ci = len(verts)
            verts.append(c)
            for j in range(m):
                j2 = (j + 1) % m
                a, b = ring * m + j, ring * m + j2
                faces.append((ci, b, a) if rev else (ci, a, b))
                uvs.append(((0.5, 0.5), (0.5, 0.5), (0.5, 0.5)))
    obj = make_object(name, verts, faces, uvs, sharp_angle=sharp_angle)
    if cap or closed:
        fix_normals(obj)
    return obj


def tube(name, path, radius, m=12, **kw):
    r = radius
    if callable(r):
        unit = circle(1.0, m)
        return sweep(name, path, unit, scale=lambda t: (r(t), r(t)), **kw)
    return sweep(name, path, circle(r, m), **kw)


def lathe(name, profile, segments=32, axis='X', center=(0, 0, 0), sharp_angle=math.radians(40), cap_ends=True):
    """Revolves (r, a) pairs around `axis` (a = coordinate along the axis)."""
    c = Vector(center)
    verts, faces, uvs = [], [], []
    np_ = len(profile)
    for s in range(segments):
        ang = TAU * s / segments
        ca, sa = math.cos(ang), math.sin(ang)
        for (r, a) in profile:
            if axis == 'X':
                verts.append(c + V(a, ca * r, sa * r))
            elif axis == 'Y':
                verts.append(c + V(ca * r, a, sa * r))
            else:
                verts.append(c + V(ca * r, sa * r, a))
    for s in range(segments):
        s2 = (s + 1) % segments
        for k in range(np_ - 1):
            a, b = s * np_ + k, s * np_ + k + 1
            c2, d = s2 * np_ + k + 1, s2 * np_ + k
            faces.append((a, d, c2, b))
            u0, u1 = s / segments, (s + 1) / segments
            v0, v1 = k / (np_ - 1), (k + 1) / (np_ - 1)
            uvs.append(((u0, v0), (u1, v0), (u1, v1), (u0, v1)))
    if cap_ends:
        for k, rev in ((0, False), (np_ - 1, True)):
            if profile[k][0] < 1e-6:
                continue
            ring = [s * np_ + k for s in range(segments)]
            faces.append(tuple(reversed(ring)) if rev else tuple(ring))
            uvs.append(tuple((0.5 + 0.5 * math.cos(TAU * i / segments), 0.5 + 0.5 * math.sin(TAU * i / segments)) for i in range(segments)))
    obj = make_object(name, verts, faces, uvs, sharp_angle=sharp_angle)
    fix_normals(obj)
    return obj


def extrude_outline(name, outline, thickness, axis='X', center=(0, 0, 0), bevel=0.0, sharp_angle=math.radians(35)):
    """Extrudes a closed 2D outline (in the plane normal to `axis`) symmetrically by `thickness`.

    Outline coordinates: (y, z) for axis X; (x, z) for axis Y; (x, y) for axis Z.
    """
    c = Vector(center)
    n = len(outline)

    def p3(u, v, a):
        if axis == 'X':
            return c + V(a, u, v)
        if axis == 'Y':
            return c + V(u, a, v)
        return c + V(u, v, a)

    verts, faces = [], []
    h = thickness / 2
    layers = [(-h, 0.0), (h, 0.0)] if bevel <= 0 else [(-h, bevel), (-h + bevel, 0.0), (h - bevel, 0.0), (h, bevel)]
    # Inset for the bevel: move points toward the outline centroid.
    cu = sum(p[0] for p in outline) / n
    cv = sum(p[1] for p in outline) / n
    for (a, inset) in layers:
        for (u, v) in outline:
            du, dv = u - cu, v - cv
            d = math.hypot(du, dv) or 1.0
            verts.append(p3(u - du / d * inset, v - dv / d * inset, a))
    L = len(layers)
    for l in range(L - 1):
        for i in range(n):
            i2 = (i + 1) % n
            faces.append((l * n + i, l * n + i2, (l + 1) * n + i2, (l + 1) * n + i))
    faces.append(tuple(reversed(range(n))))
    faces.append(tuple((L - 1) * n + i for i in range(n)))
    obj = make_object(name, verts, faces, None, sharp_angle=sharp_angle)
    fix_normals(obj)
    return obj


def gear_outline(teeth, r_root, r_tip, tooth_frac=0.42, steps=3):
    """Sprocket outline: rounded teeth between r_root and r_tip (steps=0: 4 points per tooth)."""
    pts = []
    if steps == 0:
        pitch = TAU / teeth
        for k in range(teeth):
            base = TAU * k / teeth
            for f, r in ((0.0, r_root), (0.5 - tooth_frac / 2, r_root + (r_tip - r_root) * 0.35),
                         (0.5 - 0.07, r_tip), (0.5 + 0.07, r_tip), (0.5 + tooth_frac / 2, r_root + (r_tip - r_root) * 0.35)):
                a = base + pitch * f
                pts.append((r * math.cos(a), r * math.sin(a)))
        return pts
    for k in range(teeth):
        base = TAU * k / teeth
        pitch = TAU / teeth
        # valley (arc), flank up, tip, flank down
        for s in range(steps):
            a = base + pitch * (0.5 - tooth_frac / 2) * s / steps
            pts.append((r_root * math.cos(a), r_root * math.sin(a)))
        a0 = base + pitch * (0.5 - tooth_frac / 2)
        a1 = base + pitch * (0.5 + tooth_frac / 2)
        pts.append((r_root * math.cos(a0), r_root * math.sin(a0)))
        am = (a0 + a1) / 2
        rm = r_root + (r_tip - r_root) * 0.75
        pts.append((rm * math.cos(a0 + pitch * 0.07), rm * math.sin(a0 + pitch * 0.07)))
        pts.append((r_tip * math.cos(am - pitch * 0.06), r_tip * math.sin(am - pitch * 0.06)))
        pts.append((r_tip * math.cos(am + pitch * 0.06), r_tip * math.sin(am + pitch * 0.06)))
        pts.append((rm * math.cos(a1 - pitch * 0.07), rm * math.sin(a1 - pitch * 0.07)))
        pts.append((r_root * math.cos(a1), r_root * math.sin(a1)))
        for s in range(1, steps):
            a = a1 + (base + pitch - a1) * s / steps
            pts.append((r_root * math.cos(a), r_root * math.sin(a)))
    return pts


def ring_with_hole(name, outline, r_hole, thickness, axis='X', center=(0, 0, 0), hole_segments=None):
    """Flat ring: outer outline (polar-sorted) with a concentric round hole, extruded."""
    c = Vector(center)
    n = len(outline)
    hs = hole_segments or n

    def p3(u, v, a):
        if axis == 'X':
            return c + V(a, u, v)
        if axis == 'Y':
            return c + V(u, a, v)
        return c + V(u, v, a)

    # Hole points matched by angle to outline points (same count → simple quad strips).
    hole = []
    for (u, v) in outline:
        ang = math.atan2(v, u)
        hole.append((r_hole * math.cos(ang), r_hole * math.sin(ang)))
    verts, faces = [], []
    h = thickness / 2
    for a in (-h, h):
        for (u, v) in outline:
            verts.append(p3(u, v, a))
        for (u, v) in hole:
            verts.append(p3(u, v, a))
    O0, H0, O1, H1 = 0, n, 2 * n, 3 * n
    for i in range(n):
        i2 = (i + 1) % n
        faces.append((O0 + i, H0 + i, H0 + i2, O0 + i2))       # back face
        faces.append((O1 + i, O1 + i2, H1 + i2, H1 + i))       # front face
        faces.append((O0 + i, O0 + i2, O1 + i2, O1 + i))       # outer rim
        faces.append((H0 + i, H1 + i, H1 + i2, H0 + i2))       # hole wall
    obj = make_object(name, verts, faces, None, sharp_angle=math.radians(30))
    fix_normals(obj)
    return obj


def rounded_box(name, size, center=(0, 0, 0), bevel=0.003, segments=3, rotation=None):
    sx, sy, sz = size
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * sx, v.co.y * sy, v.co.z * sz))
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges) + list(bm.verts), offset=bevel, segments=segments, affect='EDGES', profile=0.5)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.shade_smooth()
    mesh.set_sharp_from_angle(angle=math.radians(40))
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    m = Matrix.Translation(Vector(center))
    if rotation is not None:
        m = m @ rotation.to_4x4()
    obj.data.transform(m)
    return obj


def fix_normals(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()


def transform(obj, matrix):
    obj.data.transform(matrix)
    return obj


def mirror_x(obj, name=None):
    """Copy of `obj` mirrored across the X=0 plane (normals fixed)."""
    me = obj.data.copy()
    me.transform(Matrix.Scale(-1, 4, Vector((1, 0, 0))))
    me.flip_normals()
    o = bpy.data.objects.new(name or obj.name + '_mx', me)
    bpy.context.scene.collection.objects.link(o)
    return o


def duplicate(obj, name=None, matrix=None):
    me = obj.data.copy()
    if matrix is not None:
        me.transform(matrix)
    o = bpy.data.objects.new(name or obj.name + '_dup', me)
    bpy.context.scene.collection.objects.link(o)
    return o


# ---------------------------------------------------------------------------
# Modifiers / merging
# ---------------------------------------------------------------------------

def apply_modifiers(obj):
    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()
    ev = obj.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
    old = obj.data
    obj.modifiers.clear()
    obj.data = me
    bpy.data.meshes.remove(old)
    return obj


def join(objs, name):
    objs = [o for o in objs if o is not None]
    if len(objs) == 1:
        objs[0].name = name
        return objs[0]
    target = objs[0]
    with bpy.context.temp_override(active_object=target, object=target, selected_objects=objs, selected_editable_objects=objs):
        bpy.ops.object.join()
    target.name = name
    target.data.name = name
    return target


def remesh_union(objs, name, voxel=0.0025, smooth_iter=6, smooth_lambda=0.6, ratio=None, target_faces=None):
    """Welds overlapping parts into one seamless surface (voxel remesh), rounds the
    junctions (volume-preserving Laplacian smooth) and decimates."""
    obj = join(objs, name)
    rm = obj.modifiers.new('remesh', 'REMESH')
    rm.mode = 'VOXEL'
    rm.voxel_size = voxel
    rm.adaptivity = 0.0
    rm.use_smooth_shade = True
    apply_modifiers(obj)
    if smooth_iter:
        sm = obj.modifiers.new('smooth', 'LAPLACIANSMOOTH')
        sm.iterations = smooth_iter
        sm.lambda_factor = smooth_lambda
        sm.use_volume_preserve = True
        sm.use_normalized = True
        apply_modifiers(obj)
    tris = tri_count(obj)
    if target_faces and tris > target_faces:
        ratio = target_faces / tris      # target in triangles
    if ratio and ratio < 1:
        dc = obj.modifiers.new('decimate', 'DECIMATE')
        dc.ratio = ratio
        apply_modifiers(obj)
    obj.data.shade_smooth()
    return obj


def set_material(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return obj


def paint_vertices(obj, color_fn, name='Col'):
    """Per-vertex color (RGBA linear) from color_fn(co: Vector) → (r, g, b)."""
    me = obj.data
    attr = me.color_attributes.get(name) or me.color_attributes.new(name, 'FLOAT_COLOR', 'POINT')
    vals = []
    for v in me.vertices:
        r, g, b = color_fn(v.co)
        vals.extend((r, g, b, 1.0))
    attr.data.foreach_set('color', vals)
    me.color_attributes.active_color = attr
    me.color_attributes.render_color_index = me.color_attributes.find(name)
    return obj


def tri_count(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)
