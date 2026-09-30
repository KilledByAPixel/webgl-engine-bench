// LittleJS 3D cubes: immediate mode, one render3D.drawMesh per cube per frame from the opaque-stage callback.
// The engine batches repeated draws of one mesh into instanced draw calls by itself (render3D.instancing is on by
// default). drawMesh copies the matrix and tint into its batch buffer, so reusing scratch objects is safe.
// Euler note: LittleJS builds R = Ry * Rx * Rz (YXZ order) from vec3(pitch, yaw, roll).
import { loadScript } from '../../harness/loadScript.js';
import { W, H, CUBE_TILE } from '../../harness/sim.js';

let sim, mesh, tileInfo, pos, rot, matrix, color;

export default {
  engine: 'littlejs', variant: 'drawMesh',
  async init(root, s) {
    sim = s;
    await loadScript('vendor/littlejs.release.js');
    setEngineManualStep(true);       // engineStep(1) = exactly one update + render
    setShowSplashScreen(false);
    setCanvasFixedSize(vec2(W, H));
    setCanvasPixelRatio(1);          // backing store 1280x720 whatever the devicePixelRatio
    glSetAntialias(false);           // must precede engineInit (creates the GL context)
    await engineInit(() => {
      new Render3DPlugin;
      const cam = render3D.camera;
      cam.pos = vec3(0, 0, 40); cam.rotation = vec3(); cam.fov = PI / 3; cam.near = .1; cam.far = 1000;
      render3D.sunDirection = vec3(-.3, 1, .5);
      render3D.sunColor = WHITE.copy();
      render3D.ambientColor = hsl(0, 0, .3);
      // Every cube is in view by construction, so skip culling: the same knowledge the Three scenes use
      // (frustumCulled = false).
      render3D.frustumCulling = false;
      render3D.instancing = true;  // drawMesh batching relies on this (already the default)
      mesh = buildBox(1);
      tileInfo = tile(CUBE_TILE, 32, 0);
      pos = vec3(); rot = vec3(); matrix = new Matrix4; color = new Color;
      render3D.onRenderOpaque = () => {
        const { x, y, z, rx, ry, rz, r, g, b } = sim;
        for (let i = 0; i < sim.count; i++) {
          buildMatrix(pos.set(x[i], y[i], z[i]), rot.set(rx[i], ry[i], rz[i]), undefined, matrix);
          render3D.drawMesh(mesh, matrix, tileInfo, color.set(r[i], g[i], b[i], 1));
        }
      };
    }, () => {}, () => {}, () => {}, () => {}, ['assets/atlas.png'], root);
  },
  setCount() {},            // immediate mode: it draws whatever sim.count is
  frame() { engineStep(1); },
};
