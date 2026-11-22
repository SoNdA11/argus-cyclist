// Argus Cyclist - Virtual Cycling Environment for interactive bicycling experiments.
// Copyright (C) 2026  Paulo Sérgio
// SPDX-License-Identifier: GPL-3.0-or-later
//
// One parsed AssetContainer per (scene, model URL); every rider instantiates from it.
// Containers are released with their scene.

import { LoadAssetContainerAsync } from './babylon.js';

const cache = new WeakMap(); // scene → Map(url → Promise<AssetContainer>)

export function loadContainer(scene, url) {
    let perScene = cache.get(scene);
    if (!perScene) {
        perScene = new Map();
        cache.set(scene, perScene);
        scene.onDisposeObservable.addOnce(() => {
            for (const p of perScene.values()) p.then((c) => c.dispose()).catch(() => {});
        });
    }
    let p = perScene.get(url);
    if (!p) {
        p = LoadAssetContainerAsync(url, scene, { pluginExtension: '.glb' });
        perScene.set(url, p);
    }
    return p;
}

/** Instantiates a model under `parent`; `prefix` keeps node names unique per rider. */
export async function instantiate(scene, url, prefix, cloneMaterials) {
    const container = await loadContainer(scene, url);
    if (scene.isDisposed) throw new Error('scene disposed while loading a model');
    return container.instantiateModelsToScene((n) => `${prefix}:${n}`, cloneMaterials, { doNotInstantiate: true });
}
