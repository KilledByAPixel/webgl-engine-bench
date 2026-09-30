// Babylon.js 9.28.0, cubes, thin instances: one box mesh, a per-instance world-matrix buffer and a
// per-instance color buffer (thinInstanceSetBuffer), one instanced draw. Docs:
// doc.babylonjs.com/features/featuresDeepDive/mesh/copies/thinInstances ("Faster thin instances").
import { loadScript } from '../../harness/loadScript.js';
import { CUBE_TILE } from '../../harness/sim.js';

let BABYLON, engine, scene, box, sim;
let capacity = 0, count = 0, colored = 0, matrices = null, colors = null;
let q, m, one, pos;                               // scratch math objects, reused every frame

// Shared look (same in babylon-instances.js): ambient/directional ratio from a least-abs-error fit
// against verify/cubes-three-instanced.png, scaled so the mean brightness of lit pixels matches it
// (103.1/255). StandardMaterial lights in gamma space, so contrast differs slightly from the reference.
const DIR_INTENSITY = 1.16, AMBIENT = 0.33;

async function setup(root) {
  await loadScript('vendor/babylon.js');
  BABYLON = window.BABYLON;
  const canvas = document.createElement('canvas');
  canvas.width = 1280; canvas.height = 720;
  root.appendChild(canvas);
  // WebGL2 engine, no MSAA, adaptToDeviceRatio false (4th arg) so the backing store is 1280x720.
  // doNotHandleContextLost: the optimize-your-scene doc says it drops the resource tracking kept
  // for context-restore; the harness treats a lost context as a failure anyway.
  engine = new BABYLON.Engine(canvas, false, { doNotHandleContextLost: true, stencil: false }, false);
  engine.setHardwareScalingLevel(1);
  engine.setSize(1280, 720);
  scene = new BABYLON.Scene(engine);
  scene.useRightHandedSystem = true;              // camera at +z looking down -z, like the reference
  scene.clearColor = new BABYLON.Color4(0, 0, 0, 1);
  scene.ambientColor = new BABYLON.Color3(AMBIENT, AMBIENT, AMBIENT);
  scene.skipPointerMovePicking = true;            // optimize_your_scene: we never pick
  // autoClear stays ON: the doc allows turning it off only when opaque geometry covers the
  // whole viewport, which is not true here (black background shows between cubes).

  const camera = new BABYLON.FreeCamera('cam', new BABYLON.Vector3(0, 0, 40), scene);
  camera.setTarget(BABYLON.Vector3.Zero());
  camera.fov = Math.PI / 3;                       // Babylon fov is vertical (FOVMODE_VERTICAL_FIXED default)
  camera.minZ = 0.1; camera.maxZ = 1000;

  // DirectionalLight.direction is the direction light travels: the negation of "toward the light".
  const light = new BABYLON.DirectionalLight('sun', new BABYLON.Vector3(0.3, -1, -0.5), scene);
  light.intensity = DIR_INTENSITY;
  light.specular = BABYLON.Color3.Black();

  const mat = new BABYLON.StandardMaterial('cube', scene);
  mat.specularColor = BABYLON.Color3.Black();     // Lambert look, no specular
  mat.ambientColor = BABYLON.Color3.White();      // scene.ambientColor * material.ambientColor = grey ambient
  // Atlas cell 63 only. noMipmap + half-texel inset: with mipmaps, lower levels blend neighbouring
  // cells, and bilinear taps at the cell border would too. invertY (default true) puts v=0 at the
  // image bottom, so the bottom-row cell 63 (col 7, row 7 from the top) is v in [0, 1/8].
  const tex = new BABYLON.Texture('assets/atlas.png', scene, { noMipmap: true, samplingMode: BABYLON.Texture.BILINEAR_SAMPLINGMODE });
  await new Promise((ok, fail) => { tex.onLoadObservable.addOnce(ok); if (tex.isReady()) ok(); setTimeout(() => fail(new Error('atlas load timeout')), 10000); });
  tex.wrapU = tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
  const col = CUBE_TILE % 8, rowFromBottom = 7 - Math.floor(CUBE_TILE / 8), half = 0.5 / 256;
  tex.uScale = tex.vScale = 1 / 8 - 2 * half;
  tex.uOffset = col / 8 + half; tex.vOffset = rowFromBottom / 8 + half;
  mat.diffuseTexture = tex;
  // optimize_your_scene "Reducing Shaders Overhead": static material. freeze() also sets
  // checkReadyOnlyOnce and stops re-binding light/ambient uniforms each frame -- fine, lighting is static.
  mat.freeze();

  box = BABYLON.MeshBuilder.CreateBox('box', { size: 1 }, scene);
  box.material = mat;
  box.isPickable = false;
  // Nothing here is culled and nothing uses bounding info (no picking, no collisions), so
  // thinInstanceRefreshBoundingInfo is skipped by design: alwaysSelectAsActiveMesh skips the cull
  // test (the brief lets every engine turn culling off -- same choice as the other engines' scenes),
  // and doNotSyncBoundingInfo skips the recompute over all instances that thinInstanceSetBuffer
  // would otherwise do -- thinInstances doc "Creating thin instances", optimize_your_scene
  // "Not updating the bounding info".
  box.alwaysSelectAsActiveMesh = true;
  box.doNotSyncBoundingInfo = true;

  q = new BABYLON.Quaternion(); m = new BABYLON.Matrix(); one = BABYLON.Vector3.One(); pos = new BABYLON.Vector3();
  grow(1024);
  // Compile the thin-instance shader before timing starts. This warm draw is what makes the frozen
  // material's checkReadyOnlyOnce safe: the one readiness check happens here, not in a timed frame.
  box.thinInstanceCount = 1;
  await scene.whenReadyAsync();
  scene.render();
  box.thinInstanceCount = 0;
}

// thinInstances doc: "allocate a bigger buffer than what you really need at the start and use the
// thinInstanceCount property to adjust the number of instances to display". Grows by doubling.
function grow(cap) {
  const nm = new Float32Array(cap * 16), nc = new Float32Array(cap * 4);
  if (matrices) { nm.set(matrices); nc.set(colors); }
  matrices = nm; colors = nc; capacity = cap;
  // matrix buffer: updatable (static=false), rewritten every frame then thinInstanceBufferUpdated.
  box.thinInstanceSetBuffer('matrix', matrices, 16, false);
  // color buffer: static (default), tints never change; re-set only when new cubes get their tint.
  box.thinInstanceSetBuffer('color', colors, 4, true);
}

export default {
  engine: 'babylon', variant: 'thin-instances',
  async init(root, s) { sim = s; await setup(root); },
  setCount(n) {
    if (n > capacity) grow(Math.max(n, capacity * 2));
    count = n;
    colored = Math.min(colored, n);
    box.thinInstanceCount = n;
  },
  frame() {
    const { x, y, z, rx, ry, rz, r, g, b } = sim;
    const n = count;
    if (colored < n) {                            // tints are fixed after spawn; fill new ones once
      for (let i = colored; i < n; i++) { const o = i * 4; colors[o] = r[i]; colors[o + 1] = g[i]; colors[o + 2] = b[i]; colors[o + 3] = 1; }
      colored = n;
      box.thinInstanceSetBuffer('color', colors, 4, true);   // resets thinInstanceCount to capacity
      box.thinInstanceCount = n;
    }
    for (let i = 0; i < n; i++) {
      // Babylon's RotationYawPitchRoll(yaw=y, pitch=x, roll=z) is the 'YXZ' Euler order
      BABYLON.Quaternion.RotationYawPitchRollToRef(ry[i], rx[i], rz[i], q);
      pos.set(x[i], y[i], z[i]);
      BABYLON.Matrix.ComposeToRef(one, q, pos, m);
      m.copyToArray(matrices, i * 16);
    }
    // thinInstances doc: after changing a buffer passed to thinInstanceSetBuffer, call
    // thinInstanceBufferUpdated. It uploads only thinInstanceCount matrices (updateDirectly).
    box.thinInstanceBufferUpdated('matrix');
    scene.render();
  },
};
