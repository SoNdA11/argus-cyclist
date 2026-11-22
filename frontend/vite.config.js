import { defineConfig } from 'vite'
import { readFileSync } from 'fs'

// The 3D scene is loaded with a dynamic import, so the dev server only discovers its
// Babylon.js modules on first open and then reloads the whole page to re-bundle them.
// Pre-bundling them at startup avoids that reload. The list is read from the module
// that centralizes the Babylon imports, so it never goes out of sync.
const babylonModules = [...readFileSync(new URL('./src/modules/scene3d/babylon.js', import.meta.url), 'utf8')
  .matchAll(/'(@babylonjs\/(?:core|loaders)\/[^']+)'/g)].map(m => m[1])

export default defineConfig({
  build: {
    target: 'esnext'
  },
  esbuild: {
    target: 'esnext'
  },
  optimizeDeps: {
    include: babylonModules,
    esbuildOptions: {
      target: 'esnext'
    }
  }
})
