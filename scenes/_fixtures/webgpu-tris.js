// WebGPU fixture: draws n tiny triangles a frame with one non-indexed draw, so the harness's WebGPU draw counter
// can be checked (count mode should report n triangles in 1 call).
let device, context, pipeline, n = 0;
export default {
  engine: 'none', variant: 'webgpu-tris',
  async init(root) {
    const adapter = await navigator.gpu.requestAdapter();
    device = await adapter.requestDevice();
    const canvas = root.appendChild(document.createElement('canvas'));
    canvas.width = 1280; canvas.height = 720;
    context = canvas.getContext('webgpu');
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format });
    const module = device.createShaderModule({ code: `
      @vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
        let c = f32(i / 3u) * 0.0001; let k = i % 3u;
        return vec4f(select(select(-0.9, 0.9, k == 1u), 0.0, k == 2u) + c, select(-0.9, 0.9, k == 2u), 0.0, 1.0); }
      @fragment fn fs() -> @location(0) vec4f { return vec4f(1.0, 1.0, 1.0, 1.0); }` });
    pipeline = device.createRenderPipeline({ layout: 'auto', vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format }] }, primitive: { topology: 'triangle-list' } });
  },
  setCount(count) { n = count; },
  frame() {
    const enc = device.createCommandEncoder();
    const pass = enc.beginRenderPass({ colorAttachments: [{ view: context.getCurrentTexture().createView(),
      loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
    pass.setPipeline(pipeline); pass.draw(3 * n); pass.end();
    device.queue.submit([enc.finish()]);
  },
};
