# Argus Cyclist - Virtual Cycling Environment for interactive bicycling experiments.
# Copyright (C) 2026  Paulo Sérgio
# SPDX-License-Identifier: GPL-3.0-or-later
#
# Preview renders of the generated bike (Cycles, HDRI lighting) for visual review.
# The chain is realized from the link templates along the exported path.

import math
import os

import bpy
from mathutils import Vector, Matrix


def realize_chain(links):
    """Places the link templates along the chain path (pre-rotation world space)."""
    outer = bpy.data.objects['chain_outer_mesh']
    inner = bpy.data.objects['chain_inner_mesh']
    node = bpy.data.objects['chain_outer']
    parts = []
    n = len(links)
    for i in range(n):
        a, b = links[i], links[(i + 1) % n]
        mid = (a + b) / 2
        d = (b - a).normalized()
        # Template runs along +Y with X lateral; keep X fixed (the path lies in a YZ plane).
        y = d
        x = Vector((1, 0, 0))
        z = x.cross(y)
        rot = Matrix((x, y, z)).transposed().to_4x4()
        src = outer if i % 2 == 0 else inner
        me = src.data.copy()
        me.transform(node.matrix_world @ Matrix.Translation(mid) @ rot)
        o = bpy.data.objects.new('chain_preview', me)
        bpy.context.scene.collection.objects.link(o)
        parts.append(o)
    outer.hide_render = True
    inner.hide_render = True
    return parts


def look_at(cam, target):
    d = (Vector(target) - cam.location).normalized()
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()


def render(out_dir, hdr, links, pitch, root, samples=48, res=(1280, 720)):
    os.makedirs(out_dir, exist_ok=True)
    scene = bpy.context.scene
    realize_chain(links)

    world = bpy.data.worlds.new('preview')
    world.use_nodes = True
    nt = world.node_tree
    bg = nt.nodes['Background']
    if hdr and os.path.exists(hdr):
        env = nt.nodes.new('ShaderNodeTexEnvironment')
        env.image = bpy.data.images.load(hdr)
        nt.links.new(env.outputs['Color'], bg.inputs['Color'])
        bg.inputs['Strength'].default_value = 1.0
    else:
        bg.inputs['Color'].default_value = (0.6, 0.7, 0.85, 1)
    scene.world = world

    sun = bpy.data.lights.new('sun', 'SUN')
    sun.energy = 3.0
    sun.angle = math.radians(2.5)
    so = bpy.data.objects.new('sun', sun)
    so.rotation_euler = (math.radians(40), math.radians(10), math.radians(-35))
    scene.collection.objects.link(so)

    # Ground: soft grey asphalt-ish plane that catches the shadow.
    bpy.ops.mesh.primitive_plane_add(size=30)
    ground = bpy.context.active_object
    gm = bpy.data.materials.new('ground')
    gm.use_nodes = True
    b = gm.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (0.09, 0.09, 0.095, 1)
    b.inputs['Roughness'].default_value = 0.9
    ground.data.materials.append(gm)

    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'

    cam_data = bpy.data.cameras.new('cam')
    cam = bpy.data.objects.new('cam', cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam

    # The bike faces -Y in Blender after the root rotation; drive side is -X.
    shots = {
        'side_drive': ((-2.6, 0.0, 0.62), (0.0, 0.0, 0.55), 40),
        'three_quarter_front': ((-1.7, -2.0, 1.05), (0.0, -0.05, 0.5), 40),
        'three_quarter_rear_nds': ((1.6, 1.9, 1.1), (0.0, 0.0, 0.5), 40),
        'drivetrain': ((-0.75, 0.25, 0.42), (0.0, 0.32, 0.3), 45),
        'cockpit': ((-0.55, -0.95, 1.25), (0.0, -0.55, 0.92), 40),
        'chase': ((0.0, 3.4, 1.55), (0.0, 0.0, 0.7), 35),
    }
    for name, (loc, tgt, lens) in shots.items():
        cam.location = loc
        look_at(cam, tgt)
        cam_data.lens = lens
        scene.render.filepath = os.path.join(out_dir, f'{name}.png')
        bpy.ops.render.render(write_still=True)
        print(f'[argus_bike] rendered {scene.render.filepath}')
