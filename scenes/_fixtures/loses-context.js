// Fixture: makes a WebGL2 context, then loses it on the 30th frame. The host must report a "context lost" error.
let gl, frames = 0;
export default { engine: 'none', variant: 'loses-context',
  async init(root) {
    const c = document.createElement('canvas'); c.width = 1280; c.height = 720; root.appendChild(c);
    gl = c.getContext('webgl2');
  },
  setCount() {},
  frame() { if (++frames === 30) gl.getExtension('WEBGL_lose_context').loseContext(); } };
