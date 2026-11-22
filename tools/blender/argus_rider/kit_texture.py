# Argus Cyclist - Virtual Cycling Environment for interactive bicycling experiments.
# Copyright (C) 2026  Paulo Sérgio
# SPDX-License-Identifier: GPL-3.0-or-later
#
# Bakes the cycling kit into the body texture (MakeHuman UV layout).
#
# Every texel covered by a body triangle gets its rest-pose 3D position and normal
# (barycentric interpolation); the kit design is then a function of that position:
# body part = nearest bone segment (distance minus the limb's radius), cut lines are
# thresholds along the bone, panels are smooth curves on the torso. Skin texels keep
# the MakeHuman skin. Result: crisp, smooth kit edges, logos, one material.

import math

import bpy
import numpy as np
from mathutils import Vector


def _srgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)], dtype=np.float32)


COL = {
    'main': _srgb('#1597d6'),
    'panel': _srgb('#0f1a2a'),
    'trim': _srgb('#f1f4f7'),
    'accent': _srgb('#38bdf8'),
    'bib': _srgb('#0c0d10'),
    'sock': _srgb('#eef1f4'),
    'glove': _srgb('#15181c'),
}


def rasterize(uvs, attrs, size):
    """uvs: (T, 3, 2) in [0, 1]; attrs: (T, 3, K). Returns (pix_index, values (N, K))."""
    idx_all, val_all = [], []
    for t in range(uvs.shape[0]):
        p = uvs[t] * size - 0.5
        x0 = max(0, int(math.floor(p[:, 0].min())) - 1)
        x1 = min(size - 1, int(math.ceil(p[:, 0].max())) + 1)
        y0 = max(0, int(math.floor(p[:, 1].min())) - 1)
        y1 = min(size - 1, int(math.ceil(p[:, 1].max())) + 1)
        if x1 < x0 or y1 < y0:
            continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
        xs = xs.ravel().astype(np.float32)
        ys = ys.ravel().astype(np.float32)
        (ax, ay), (bx, by), (cx, cy) = p
        den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(den) < 1e-12:
            continue
        w0 = ((by - cy) * (xs - cx) + (cx - bx) * (ys - cy)) / den
        w1 = ((cy - ay) * (xs - cx) + (ax - cx) * (ys - cy)) / den
        w2 = 1 - w0 - w1
        eps = -0.6 / max(1.0, math.sqrt(abs(den)))     # ~half-texel dilation of the edges
        inside = (w0 >= eps) & (w1 >= eps) & (w2 >= eps)
        if not inside.any():
            continue
        w = np.stack([w0[inside], w1[inside], w2[inside]], axis=1)
        val = w @ attrs[t]
        idx_all.append((ys[inside].astype(np.int64) * size + xs[inside].astype(np.int64)))
        val_all.append(val)
    return np.concatenate(idx_all), np.concatenate(val_all)


def _seg_dist(P, a, b):
    d = b - a
    t = ((P - a) @ d) / max(1e-9, d @ d)
    tc = np.clip(t, 0, 1)
    q = a + tc[:, None] * d
    return np.linalg.norm(P - q, axis=1), t


def text_mask(text, width_px=512, height_px=128):
    """Rasterizes `text` (Blender font) into a [0,1] mask, row 0 = bottom."""
    curve = bpy.data.curves.new('kit_text', 'FONT')
    curve.body = text
    curve.size = 1.0
    curve.align_x = 'CENTER'
    curve.align_y = 'CENTER'
    curve.resolution_u = 4
    curve.space_character = 1.1
    obj = bpy.data.objects.new('kit_text', curve)
    bpy.context.scene.collection.objects.link(obj)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(dg))
    bpy.data.objects.remove(obj)
    me.calc_loop_triangles()
    co = np.array([v.co[:2] for v in me.vertices], dtype=np.float32)
    lo, hi = co.min(0), co.max(0)
    scale = min((width_px - 8) / (hi[0] - lo[0]), (height_px - 8) / (hi[1] - lo[1]))
    mid = (lo + hi) / 2
    tris = np.array([t.vertices[:] for t in me.loop_triangles])
    uv = (co[tris] - mid) * scale
    uv[..., 0] = (uv[..., 0] + width_px / 2) / width_px
    uv[..., 1] = (uv[..., 1] + height_px / 2) / height_px
    mask = np.zeros(width_px * height_px, dtype=np.float32)
    # Rasterize on a square canvas then crop (rasterize() expects a square size).
    S = max(width_px, height_px)
    uv2 = uv.copy()
    uv2[..., 0] *= width_px / S
    uv2[..., 1] *= height_px / S
    idx, _ = rasterize(uv2, np.ones((len(tris), 3, 1), dtype=np.float32), S)
    full = np.zeros(S * S, dtype=np.float32)
    full[idx] = 1.0
    full = full.reshape(S, S)[:height_px, :width_px]
    bpy.data.meshes.remove(me)
    return full


def _stamp(mask, P2, rect):
    """Samples `mask` at 2D points P2 inside rect (x0, y0, x1, y1); 0 outside."""
    x0, y0, x1, y1 = rect
    u = (P2[:, 0] - x0) / (x1 - x0)
    v = (P2[:, 1] - y0) / (y1 - y0)
    ok = (u >= 0) & (u < 1) & (v >= 0) & (v < 1)
    out = np.zeros(len(P2), dtype=np.float32)
    h, w = mask.shape
    out[ok] = mask[(v[ok] * h).astype(int).clip(0, h - 1), (u[ok] * w).astype(int).clip(0, w - 1)]
    return out


def bake(human, rig, skin_image, size=2048):
    me = human.data
    me.calc_loop_triangles()
    uvl = me.uv_layers.active.data
    mw = human.matrix_world
    nmat = mw.to_3x3().inverted().transposed()
    co = np.array([(mw @ v.co)[:] for v in me.vertices], dtype=np.float32)
    nrm = np.array([(nmat @ v.normal).normalized()[:] for v in me.vertices], dtype=np.float32)
    tris = me.loop_triangles
    T = len(tris)
    uvs = np.zeros((T, 3, 2), dtype=np.float32)
    attrs = np.zeros((T, 3, 6), dtype=np.float32)
    for i, t in enumerate(tris):
        for k in range(3):
            uvs[i, k] = uvl[t.loops[k]].uv[:]
            vi = t.vertices[k]
            attrs[i, k, :3] = co[vi]
            attrs[i, k, 3:] = nrm[vi]
    idx, val = rasterize(uvs, attrs, size)
    P, N = val[:, :3], val[:, 3:]
    N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-9

    rw = rig.matrix_world

    def B(name):
        b = rig.data.bones[name]
        return np.array((rw @ b.head_local)[:], dtype=np.float32), np.array((rw @ b.tail_local)[:], dtype=np.float32)

    parts = []   # (label, a, b, radius)
    neck_a, _ = B('neck_01')
    pel_a, _ = B('pelvis')
    head_a, head_b = B('head')
    parts.append(('torso', pel_a, neck_a, 0.12))
    parts.append(('neck', neck_a, head_a, 0.05))
    parts.append(('head', head_a, head_b, 0.085))
    for s in ('l', 'r'):
        for name, r in (('upperarm', 0.045), ('lowerarm', 0.036), ('hand', 0.03), ('thigh', 0.075), ('calf', 0.05), ('foot', 0.04)):
            a, b = B(f'{name}_{s}')
            if name == 'hand':
                b = B(f'middle_01_{s}')[0]     # wrist → knuckle (the hand bone is short)
            parts.append((name, a, b, r))
    scores, ts = [], []
    for (_, a, b, r) in parts:
        d, t = _seg_dist(P, a, b)
        scores.append(d - r)
        ts.append(t)
    scores = np.stack(scores, 1)
    ts = np.stack(ts, 1)
    labels = [p[0] for p in parts]
    # The torso stops at the base of the neck; forearms stop at the wrist.
    scores[P[:, 2] > neck_a[2] + 0.004, labels.index('torso')] = np.inf
    for k, lab in enumerate(labels):
        if lab == 'lowerarm':
            scores[ts[:, k] > 0.97, k] = np.inf
    best = scores.argmin(1)
    tbest = ts[np.arange(len(P)), best]
    label = np.array([p[0] for p in parts])[best]

    # Skin texture as the base.
    sw, sh = skin_image.size
    skin = np.array(skin_image.pixels[:], dtype=np.float32).reshape(sh, sw, 4)[..., :3]
    if sw != size:
        yy = (np.arange(size) * sh / size).astype(int)
        xx = (np.arange(size) * sw / size).astype(int)
        skin = skin[yy][:, xx]
    out = skin.reshape(-1, 3).copy()
    covered_kit = np.zeros(size * size, dtype=bool)

    col = np.zeros((len(P), 3), dtype=np.float32)
    kit = np.zeros(len(P), dtype=bool)
    z, x, y = P[:, 2], P[:, 0], P[:, 1]
    hem = pel_a[2] + 0.035
    shoulder_z = neck_a[2] - 0.045

    torso = label == 'torso'
    # Jersey on the torso above the hem, bib below.
    jer = torso & (z >= hem)
    bib = torso & (z < hem)
    # Side panels: a smooth band on the flanks (by the normal's lateral component),
    # widening toward the armpits; navy yoke over the shoulders.
    side = np.abs(N[:, 0]) - 0.8 + 0.22 * np.clip((z - hem) / max(1e-3, shoulder_z - hem), 0, 1) ** 2
    yoke = (z > shoulder_z - 0.02 + 0.06 * np.abs(N[:, 1])) & (np.abs(x) > 0.05)
    panel = jer & ((side > 0) | yoke)
    hemband = jer & (z < hem + 0.018)
    col[jer] = COL['main']
    col[panel] = COL['panel']
    col[hemband] = COL['panel']
    col[bib] = COL['bib']
    kit |= jer | bib
    # Collar.
    neck = label == 'neck'
    collar = neck & (tbest < 0.3)
    col[collar] = COL['trim']
    kit |= collar
    # Sleeves with white cuffs.
    ua = label == 'upperarm'
    sleeve = ua & (tbest < 0.47)
    cuff = ua & (tbest >= 0.47) & (tbest < 0.54)
    col[sleeve] = COL['main']
    col[sleeve & (N[:, 1] > 0.55) & (tbest < 0.25)] = COL['panel']
    col[cuff] = COL['trim']
    kit |= sleeve | cuff
    # Fingerless gloves.
    hand = label == 'hand'
    glove = hand & (tbest < 1.22)
    col[glove] = COL['glove']
    kit |= glove
    # Bib legs with cyan grippers.
    th = label == 'thigh'
    leg = th & (tbest < 0.69)
    grip = th & (tbest >= 0.69) & (tbest < 0.76)
    col[leg] = COL['bib']
    col[grip] = COL['accent']
    kit |= leg | grip
    # Socks.
    calf = label == 'calf'
    sock = calf & (tbest >= 0.72)
    band = calf & (tbest >= 0.72) & (tbest < 0.755)
    foot = label == 'foot'
    col[sock | foot] = COL['sock']
    col[band] = COL['accent']
    kit |= sock | foot

    # Wordmarks: back (large), left chest (small), thighs (vertical along the leg).
    mask = text_mask('ARGUS')
    back = jer & (N[:, 1] > 0.45) & ~panel
    P2 = np.stack([-x, z], 1)            # seen from behind: +x of the image = rider's left
    mid_back = pel_a[2] + 0.30
    stamp = _stamp(mask, P2, (-0.11, mid_back - 0.027, 0.11, mid_back + 0.027)) * back
    col[stamp > 0.5] = COL['trim']
    chest = jer & (N[:, 1] < -0.5) & ~panel
    P2c = np.stack([x, z], 1)
    chest_z = neck_a[2] - 0.11
    stamp = _stamp(mask, P2c, (0.025, chest_z - 0.011, 0.105, chest_z + 0.011)) * chest
    col[stamp > 0.5] = COL['trim']
    # Soft knit shading on the fabric (very subtle, breaks the flat colour).
    knit = 0.97 + 0.03 * np.sin(P[:, 2] * 900.0) * np.sin(P[:, 0] * 900.0 + P[:, 1] * 900.0)
    col *= knit[:, None]

    out[idx[kit]] = col[kit]
    covered_kit[idx[kit]] = True
    img = out.reshape(size, size, 3)

    # Dilate the kit across UV seams (a few texels) so mip-maps do not bleed skin.
    km = covered_kit.reshape(size, size)
    for _ in range(4):
        grow = np.zeros_like(km)
        acc = np.zeros_like(img)
        cnt = np.zeros((size, size, 1), dtype=np.float32)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            sh_m = np.roll(np.roll(km, dy, 0), dx, 1)
            sh_i = np.roll(np.roll(img, dy, 0), dx, 1)
            add = sh_m & ~km
            acc[add] += sh_i[add]
            cnt[add] += 1
            grow |= add
        img[grow] = acc[grow] / cnt[grow]
        km |= grow

    rgba = np.concatenate([img, np.ones((size, size, 1), dtype=np.float32)], axis=2)
    out_img = bpy.data.images.new('rider_kit', size, size, alpha=False)
    out_img.pixels.foreach_set(rgba.ravel())
    out_img.file_format = 'JPEG'
    out_img.pack()
    return out_img
