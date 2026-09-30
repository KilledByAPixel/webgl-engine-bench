// LittleJS 3D cubes via InstancedMesh3D: one persistent instance buffer, updated each frame.
// InstancedMesh3D is an EngineObject3D, but only as the render fast path: the direct counterpart of
// Three's InstancedMesh, so the two engines' instancing paths are compared like for like. (The benchmark uses no game
// objects; this is not one with behaviour, it is the engine's only handle to a persistent instance buffer.)
// The engine renders it in the opaque pass on its own; it needs no update logic.
import { loadScript } from '../../harness/loadScript.js';
import { W, H, CUBE_TILE } from '../../harness/sim.js';

let sim, mesh, tileInfo, set, color;
let colored = 0; // instances [0, colored) already have their tint; tints never change after spawn

function ensure(n) {
  if (set && set.maxCount >= n) { set.count = n; colored = Math.min(colored, n); return; } // regrown indices get recolored
  set?.destroy();
  colored = 0; // new instance buffer: nothing colored yet
  set = new InstancedMesh3D(mesh, Math.max(n, 64, (set?.maxCount || 0) * 2), tileInfo);
  set.count = n;
}

export default {
  engine: 'littlejs', variant: 'InstancedMesh3D',
  async init(root, s) {
    sim = s;
    await loadScript('vendor/littlejs.release.js');
    setEngineManualStep(true);
    setShowSplashScreen(false);
    setCanvasFixedSize(vec2(W, H));
    setCanvasPixelRatio(1);
    glSetAntialias(false);
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
      mesh = buildBox(1);
      tileInfo = tile(CUBE_TILE, 32, 0);
      color = new Color;
    }, () => {
      // gameUpdate runs once per engineStep, before render. setTransforms (LittleJS 1.21+) places every instance
      // straight from the sim's arrays in one loop with one dirty range, the documented fastest way to move many.
      if (!set) return;
      const { x, y, z, rx, ry, rz, r, g, b } = sim;
      set.setTransforms(0, sim.count, x, y, z, rx, ry, rz);
      // tints never change after spawn: color only the newly live instances (watermark), not every frame
      if (colored > sim.count) colored = sim.count;
      for (let i = colored; i < sim.count; i++) set.setColorAt(i, color.set(r[i], g[i], b[i], 1));
      colored = sim.count;
    }, () => {}, () => {}, () => {}, ['assets/atlas.png'], root);
  },
  setCount(n) { ensure(n); },
  frame() { engineStep(1); },
};
