# Blender model pipeline (3D scene)

Reproducible scripts that generate the GLB models used by the Babylon.js scene
(`frontend/src/assets/scene3d/models/`). They run headless in Blender 4.5 LTS.

| Script | Output | Runtime module |
|---|---|---|
| `argus_bike/build_bike.py` | `argus_bike.glb` (~95k triangles, 13 materials) | `frontend/src/modules/scene3d/BikeModel.js` |
| `argus_rider/build_rider.py` | `argus_rider.glb` (~40k triangles, 53 bones) | `frontend/src/modules/scene3d/RiderModel.js` |

Both are used by `CyclistRig.js` (road bike). If a model fails to load, the procedural
rig is used and the error is logged. The time-trial bike is still procedural.

## Bike

```sh
blender -b --factory-startup -P tools/blender/argus_bike/build_bike.py -- \
    --out frontend/src/assets/scene3d/models/argus_bike.glb \
    [--render /tmp/bike_renders --hdr frontend/src/assets/scene3d/sky_kloofendal_48d_partly_cloudy_puresky_1k.hdr]
```

No dependencies. Geometry follows a real size-56 race bike (see the script header). The frame
and fork are swept tube profiles welded by a voxel remesh, rounded and decimated; the paint
(graphite with cyan fades) is per-vertex colour under a clear-coat. Node hierarchy and metadata:

- `wheel_rear`, `wheel_front`, `crank`, `pedal_L/R`, `pulley_upper/lower`: rotate about local X;
- `steer`: rotates about `extras.argus_bike.steerAxis` (head-tube axis);
- `chain_outer`, `chain_inner`: one link each, drawn as thin instances along `chainPath`;
- `socket_*`: saddle, hoods, drops, tops and pedal contact points for the rider.

`BikeModel.js` calibrates the rotation senses against the model at load time.

## Rider

Needs the MPFB extension and the MakeHuman CC0 system assets, installed in an isolated
Blender user directory:

```sh
export BLENDER_USER_RESOURCES=$HOME/.cache/argus-blender      # any empty directory
blender -b --command extension install-file -r user_default -e add-on-mpfb-v2.0.18.zip
# from https://extensions.blender.org/add-ons/mpfb/
unzip makehuman_system_assets_cc0.zip \
    -d $BLENDER_USER_RESOURCES/extensions/.user/user_default/mpfb/data
# from https://files.makehumancommunity.org/asset_packs/makehuman_system_assets/
blender -b -P tools/blender/argus_rider/build_rider.py -- \
    --out frontend/src/assets/scene3d/models/argus_rider.glb [--render DIR --hdr FILE]
```

(no `--factory-startup` here: it would disable the extension.)

The kit is baked into the body texture by `kit_texture.py`: every texel gets its rest-pose
position, the body part is the nearest bone segment and the design is a function of that
position (smooth edges, wordmarks). The fingers are baked in a grip pose; the riding pose is
computed at runtime by `RiderModel.js` (torso solved per bike fit, 2-bone IK for legs and arms,
ankling with the crank, head looking up the road).

## Licensing

Bike: original, GPL-3.0-or-later. Rider: MakeHuman output and assets are CC0; MPFB (GPL) is only
the tool. Credits in `frontend/src/assets/scene3d/CREDITS.md`.
