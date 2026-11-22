# Argus Cyclist - Virtual Cycling Environment for interactive bicycling experiments.
# Copyright (C) 2026  Paulo Sérgio
# SPDX-License-Identifier: GPL-3.0-or-later
#
# Procedural textures for the bike (generated with numpy, packed into the GLB):
#   carbon weave (2x2 twill) base color + normal map, disc-rotor mask, bar-tape normal.

import math

import bpy
import numpy as np


def _image(name, arr, non_color=False):
    """arr: float32 HxWx4 in [0, 1] (row 0 = bottom, Blender convention)."""
    h, w = arr.shape[:2]
    img = bpy.data.images.get(name) or bpy.data.images.new(name, w, h, alpha=True, float_buffer=False)
    if img.size[0] != w or img.size[1] != h:
        img.scale(w, h)
    img.pixels.foreach_set(np.ascontiguousarray(arr, dtype=np.float32).ravel())
    img.file_format = 'PNG'
    if non_color:
        img.colorspace_settings.name = 'Non-Color'
    img.pack()
    return img


def _normal_from_height(hgt, strength):
    gy, gx = np.gradient(hgt)
    nx, ny = -gx * strength, -gy * strength
    nz = np.ones_like(hgt)
    l = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.stack([nx / l * 0.5 + 0.5, ny / l * 0.5 + 0.5, nz / l * 0.5 + 0.5, np.ones_like(hgt)], axis=-1)


def carbon_weave(size=256, tows=8):
    """2x2 twill: tows alternate over/under in a diagonal step pattern."""
    y, x = np.mgrid[0:size, 0:size].astype(np.float32) / size
    cell = 1.0 / tows
    ix, iy = np.floor(x / cell).astype(int), np.floor(y / cell).astype(int)
    fx, fy = (x / cell) % 1.0, (y / cell) % 1.0
    # Twill: warp on top where (ix + iy) mod 4 < 2.
    warp_top = ((ix + iy) % 4) < 2
    # Each tow is a rounded bump across its width; fibers run along the tow.
    bump_warp = np.sin(np.pi * fx) ** 0.6   # warp runs along y
    bump_weft = np.sin(np.pi * fy) ** 0.6   # weft runs along x
    hgt = np.where(warp_top, bump_warp, bump_weft)
    # Lengthwise dip where a tow dives under the crossing one.
    dive = np.where(warp_top, np.sin(np.pi * fy) ** 0.25, np.sin(np.pi * fx) ** 0.25)
    hgt = hgt * (0.55 + 0.45 * dive)
    rng = np.random.default_rng(7)
    fibers = rng.normal(0, 1, (size, size)).astype(np.float32)
    # Streak the noise along the tow direction (fiber sheen).
    k = 9
    fw = np.cumsum(fibers, axis=0)
    fw = (np.roll(fw, -k, axis=0) - fw) / k
    fh = np.cumsum(fibers, axis=1)
    fh = (np.roll(fh, -k, axis=1) - fh) / k
    streak = np.where(warp_top, fw, fh)
    # Base color: near-black; warp/weft differ in sheen (anisotropy fake).
    base = 0.028 + 0.022 * np.where(warp_top, 1.0, 0.45) * hgt + 0.006 * streak
    base = np.clip(base, 0.0, 1.0)
    col = np.stack([base, base * 1.02, base * 1.08, np.ones_like(base)], axis=-1)
    nrm = _normal_from_height(hgt + 0.08 * streak, strength=size / tows * 0.18)
    return _image('carbon_weave_diff', col), _image('carbon_weave_nor', nrm, non_color=True)


def rotor_texture(size=512, r_out=0.080, r_ring=0.064, r_hub=0.024, arms=6):
    """Disc rotor mapped on a square (planar UV over [-r_out, r_out]²): braking ring with
    drilled holes, curved spider arms, center ring; alpha = 0 elsewhere."""
    lin = (np.arange(size, dtype=np.float32) + 0.5) / size * 2 - 1
    x, y = np.meshgrid(lin * r_out, lin * r_out)
    r = np.sqrt(x * x + y * y)
    a = np.arctan2(y, x)
    ring = (r <= r_out) & (r >= r_ring)
    # Drilled holes: two staggered rows.
    holes = np.zeros_like(r, dtype=bool)
    for row, (rr, n, off) in enumerate(((0.0685, 24, 0.0), (0.0755, 24, 0.5))):
        ang = (a / (2 * np.pi) * n + off) % 1.0
        da = (np.minimum(ang, 1 - ang)) * (2 * np.pi * rr / n)
        holes |= (np.sqrt(da * da + (r - rr) ** 2) < 0.0022)
    # Wavy outer edge (modern rotors).
    edge = r_out - 0.0015 * (0.5 + 0.5 * np.cos(a * 30))
    ring &= r <= edge
    ring &= ~holes
    # Curved spider arms.
    t = np.clip((r - r_hub) / (r_ring - r_hub), 0, 1)
    arm_phase = (a * arms / (2 * np.pi) - 0.35 * t) % 1.0
    arm_w = 0.17 - 0.06 * t
    spider = (r >= r_hub - 0.004) & (r <= r_ring + 0.002) & ((arm_phase < arm_w) | (arm_phase > 1 - arm_w))
    hub = (r >= 0.011) & (r <= r_hub + 0.002)
    alpha = (ring | spider | hub).astype(np.float32)
    # Brushed steel ring (concentric streaks), black anodized spider.
    rng = np.random.default_rng(3)
    streak = rng.normal(0, 1, 4096).astype(np.float32)
    bri = 0.62 + 0.06 * streak[(r / r_out * 4095).astype(int).clip(0, 4095)]
    col = np.where(ring, bri, 0.035)
    col = np.where(hub & ~ring, 0.05, col)
    rgba = np.stack([col, col, col * 1.01, alpha], axis=-1)
    return _image('rotor_diff', rgba)


def tape_normal(size=128):
    """Bar tape: diagonal overlapping wraps (u along the bar, v around it)."""
    y, x = np.mgrid[0:size, 0:size].astype(np.float32) / size
    phase = (x * 6 + y) % 1.0
    hgt = np.where(phase < 0.85, phase / 0.85, (1 - phase) / 0.15) * 0.6
    rng = np.random.default_rng(5)
    hgt += rng.normal(0, 0.03, (size, size)).astype(np.float32)
    return _image('bar_tape_nor', _normal_from_height(hgt, strength=size * 0.05), non_color=True)


def save_all(directory):
    """Optional: write the packed images next to the GLB for inspection."""
    import os
    for img in bpy.data.images:
        if img.packed_file:
            img.filepath_raw = os.path.join(directory, img.name + '.png')
            img.save()
