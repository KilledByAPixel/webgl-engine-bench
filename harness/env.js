export async function getEnv() {
  const gl = document.createElement('canvas').getContext('webgl2');
  const ext = gl?.getExtension('WEBGL_debug_renderer_info');
  const gpu = gl ? gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) : 'no webgl2';
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
  const versions = await fetch('vendor/versions.json').then(r => r.json()).catch(() => ({}));
  return { userAgent: navigator.userAgent, gpu, webgpu: await webgpuAdapter(), dpr: devicePixelRatio, versions };
}

// the adapter WebGPU scenes get, so a software (fallback) adapter shows up in the results instead of passing as GPU
async function webgpuAdapter() {
  try {
    const a = await navigator.gpu?.requestAdapter();
    if (!a) return navigator.gpu ? 'no adapter' : 'no webgpu';
    const { vendor, architecture, description } = a.info || {};
    return { vendor, architecture, description, fallback: !!(a.info?.isFallbackAdapter ?? a.isFallbackAdapter) };
  } catch (e) { return 'error: ' + e.message; }
}
