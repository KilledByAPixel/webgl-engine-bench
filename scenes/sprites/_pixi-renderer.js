// Shared by the Pixi sprites scenes (not a scene itself): renderer selection and a runtime check of it.
// Pixi v8 docs (Application / Renderers guides, autoDetectRenderer typings in 8.21.0):
// - `preference: 'webgpu'` tries WebGPU first, but on failure Pixi silently falls back to WebGL (then Canvas).
//   The benchmark must not report a WebGL run as WebGPU, so assertRenderer() checks renderer.type after init.
// - The WebGL and WebGPU variants differ only in `preference`; every other Application option is shared.
import { RendererType } from 'pixi.js';

export function rendererOptions(preference) {
  return { preference };
}

export function assertRenderer(app, preference) {
  const want = { webgl: RendererType.WEBGL, webgpu: RendererType.WEBGPU }[preference];
  if (app.renderer.type !== want) {
    throw new Error(`Pixi was asked for a '${preference}' renderer but created '${app.renderer.name}' `
      + `(fallback); refusing to run this scene under the wrong label`);
  }
}
