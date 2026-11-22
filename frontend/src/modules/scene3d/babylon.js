// Argus Cyclist - Virtual Cycling Environment for interactive bicycling experiments.
// Copyright (C) 2026  Paulo Sérgio
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Single entry point for the Babylon.js modules used by the 3D scene.
// Importing per module (instead of '@babylonjs/core') keeps the bundle small:
// the root index pulls the whole engine (~7 MB) because of its side effects.

export { Engine } from '@babylonjs/core/Engines/engine.js';
export { Scene } from '@babylonjs/core/scene.js';
export { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
export { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
export { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
export { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
export { Mesh } from '@babylonjs/core/Meshes/mesh.js';
export { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
export { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
export { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
export { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js';
export { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder.js';
export { CreateTube } from '@babylonjs/core/Meshes/Builders/tubeBuilder.js';
export { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';
export { CreateCapsule } from '@babylonjs/core/Meshes/Builders/capsuleBuilder.js';
export { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder.js';
export { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
export { Vector3, Matrix, Quaternion } from '@babylonjs/core/Maths/math.vector.js';
export { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
export { GlowLayer } from '@babylonjs/core/Layers/glowLayer.js';
export { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation.js';
export { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
export { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
export { HDRCubeTexture } from '@babylonjs/core/Materials/Textures/hdrCubeTexture.js';
export { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';
export { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js';
export { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration.js';
export { CreateIcoSphere } from '@babylonjs/core/Meshes/Builders/icoSphereBuilder.js';
export { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader.js';

// Side-effect registrations required by the features above.
import '@babylonjs/core/Layers/effectLayerSceneComponent.js';
import '@babylonjs/core/Meshes/thinInstanceMesh.js';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js';
import '@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent.js';
// glTF 2.0 loader (bike/rider models) with only the extensions the bundled models use;
// extras become node.metadata.gltf.extras.
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/KHR_materials_clearcoat.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/ExtrasAsMetadata.js';
