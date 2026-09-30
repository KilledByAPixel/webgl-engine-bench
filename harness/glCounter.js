// Counts draw calls and triangles on every WebGL context, to prove each engine draws every object.
// Only installed in count mode, since wrapping the calls costs time.
export const glCount = { calls: 0, triangles: 0 };
export function installGlCounter() {
  const tris = (mode, count, gl) => mode === gl.TRIANGLES ? count / 3 :
    mode === gl.TRIANGLE_STRIP || mode === gl.TRIANGLE_FAN ? Math.max(0, count - 2) : 0;
  for (const Proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
    const wrap = (name, fn) => { const orig = Proto[name]; if (orig) Proto[name] = function (...a) {
      glCount.calls++; glCount.triangles += fn(this, a); return orig.apply(this, a); }; };
    wrap('drawArrays', (gl, [m, , c]) => tris(m, c, gl));
    wrap('drawElements', (gl, [m, c]) => tris(m, c, gl));
    wrap('drawArraysInstanced', (gl, [m, , c, n]) => tris(m, c, gl) * n);
    wrap('drawElementsInstanced', (gl, [m, c, , , n]) => tris(m, c, gl) * n);
  }
  // WebGL1 instancing goes through the ANGLE_instanced_arrays extension object, so wrap it as it is handed out
  const getExtension = WebGLRenderingContext.prototype.getExtension;
  WebGLRenderingContext.prototype.getExtension = function (name) {
    const ext = getExtension.call(this, name), gl = this;
    if (ext && name === 'ANGLE_instanced_arrays' && !ext.__counted) {
      const a = ext.drawArraysInstancedANGLE, e = ext.drawElementsInstancedANGLE;
      ext.drawArraysInstancedANGLE = function (m, first, c, n) { glCount.calls++; glCount.triangles += tris(m, c, gl) * n; return a.call(this, m, first, c, n); };
      ext.drawElementsInstancedANGLE = function (m, c, t, o, n) { glCount.calls++; glCount.triangles += tris(m, c, gl) * n; return e.call(this, m, c, t, o, n); };
      ext.__counted = true;
    }
    return ext;
  };
}

// The same count for WebGPU: pipelines remember their primitive topology, a pass remembers its current pipeline,
// and each draw adds its triangles. Indirect draws can't be read on the CPU and count as calls only.
export function installGpuCounter() {
  if (typeof GPUDevice === 'undefined') return;
  const topo = new WeakMap(), current = new WeakMap();
  const tris = (t, count) => t === 'triangle-strip' ? Math.max(0, count - 2) : t === 'triangle-list' || t === undefined ? count / 3 : 0;
  const remember = p => (d, ...a) => { const r = p.call(d, ...a); const t = a[0]?.primitive?.topology ?? 'triangle-list';
    r instanceof Promise ? r.then(x => topo.set(x, t)) : topo.set(r, t); return r; };
  for (const name of ['createRenderPipeline', 'createRenderPipelineAsync']) {
    const orig = GPUDevice.prototype[name];
    if (orig) GPUDevice.prototype[name] = function (...a) { return remember(orig)(this, ...a); };
  }
  // a render bundle's draws are recorded once and replayed by executeBundles every frame: they count into the
  // bundle when recorded, and the bundle's totals count each time a pass executes it
  const tally = new WeakMap(), bundleTotals = new WeakMap();
  const into = enc => tally.get(enc) ?? glCount;   // a bundle encoder has its own tally, a pass counts directly
  for (const Enc of [globalThis.GPURenderPassEncoder, globalThis.GPURenderBundleEncoder].filter(Boolean)) {
    const P = Enc.prototype, setPipeline = P.setPipeline, draw = P.draw, drawIndexed = P.drawIndexed;
    P.setPipeline = function (p) { current.set(this, topo.get(p)); return setPipeline.call(this, p); };
    P.draw = function (count, instances = 1, ...a) {
      const t = into(this); t.calls++; t.triangles += tris(current.get(this), count) * instances; return draw.call(this, count, instances, ...a); };
    P.drawIndexed = function (count, instances = 1, ...a) {
      const t = into(this); t.calls++; t.triangles += tris(current.get(this), count) * instances; return drawIndexed.call(this, count, instances, ...a); };
    for (const name of ['drawIndirect', 'drawIndexedIndirect']) {
      const orig = P[name]; if (orig) P[name] = function (...a) { into(this).calls++; return orig.apply(this, a); };
    }
  }
  const createBundleEncoder = GPUDevice.prototype.createRenderBundleEncoder;
  if (createBundleEncoder) GPUDevice.prototype.createRenderBundleEncoder = function (...a) {
    const enc = createBundleEncoder.apply(this, a); tally.set(enc, { calls: 0, triangles: 0 }); return enc; };
  const BP = globalThis.GPURenderBundleEncoder?.prototype, finish = BP?.finish;
  if (finish) BP.finish = function (...a) { const b = finish.apply(this, a); bundleTotals.set(b, tally.get(this)); return b; };
  const PP = globalThis.GPURenderPassEncoder?.prototype, execute = PP?.executeBundles;
  if (execute) PP.executeBundles = function (bundles) {
    for (const b of bundles) { const t = bundleTotals.get(b); if (t) { glCount.calls += t.calls; glCount.triangles += t.triangles; } }
    return execute.call(this, bundles);
  };
}
