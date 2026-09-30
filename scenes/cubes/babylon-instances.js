// Babylon.js 9.28.0, cubes, per-object path: one InstancedMesh per cube (mesh.createInstance),
// per-instance tint via registerInstancedBuffer("color", 4). Babylon batches all instances of a
// mesh into one hardware-instanced draw, but each cube is its own scene object with its own
// position/rotation and world matrix. Docs: doc.babylonjs.com/features/featuresDeepDive/mesh/copies/instances
//
// Active-mesh freeze (this variant only): after each setCount the scene calls
// scene.freezeActiveMeshes(false, onSuccess, onError, /*freezeMeshes*/ false) -- optimize_your_scene
// "Freezing the active meshes". It skips ONLY the per-frame active-mesh evaluation (isReady/isEnabled,
// LOD selection, _preActivate/_activate and instance registration, the frustum test). Every frame
// the frozen path still calls computeWorldMatrix() on each instance, and the root mesh still
// refills and uploads the instance buffers (world matrix + "color") from the instances. The default
// freezeMeshes=true would instead freeze each mesh's instance data and stop that refill (only
// valid for static instances or a manual matrix buffer), so it is not used.
// - alwaysSelectAsActiveMesh on every instance is essential: the frozen active list is decided once
//   per count, so it must not depend on where the cubes are at that moment (every cube is always
//   in view, and the other engines' scenes likewise turn culling off).
// - scene.incrementRenderId() before each re-freeze: the root mesh appends visible instances to a
//   per-renderId list that is only reset when the renderId changes. Re-freezing on the last
//   render's id appended to it (measured: 2n instances drawn, or a stale disposed one). Babylon's
//   own Scene._checkIsReady retry does the same (setTimeout -> incrementRenderId(); _checkIsReady()).
// - The freeze is observable: onSuccess records it, and frame() throws if it has not taken by the
//   5th frame after a setCount (or onError fired), so the harness records an error instead of this
//   scene silently running unfrozen.
// Not applied to babylon-thin.js: that variant is a single mesh, so there is nothing to evaluate.
import { loadScript } from '../../harness/loadScript.js';
import { CUBE_TILE } from '../../harness/sim.js';

let BABYLON, engine, scene, box, sim, instances = [], colored = 0, refreeze = false;
let countGen = 0, frozenGen = -1, framesSinceCount = 0, freezeError = null;   // freeze bookkeeping
const FREEZE_DEADLINE = 5;                        // frames after setCount by which the freeze must hold

// Shared look (same in babylon-thin.js): ambient/directional ratio from a least-abs-error fit
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
  // optimize_your_scene: no pointer-move picking (we never pick)
  scene.skipPointerMovePicking = true;
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
  box.isVisible = false;                          // instances doc: hide the root so only instances show
  box.isPickable = false;
  box.registerInstancedBuffer('color', 4);        // instances doc "Custom Buffers"
  box.instancedBuffers.color = new BABYLON.Color4(1, 1, 1, 1);
  // Compile the shader for the instanced path before timing starts. This warm draw is what makes the
  // frozen material's checkReadyOnlyOnce safe: the one readiness check happens here, not in a timed frame.
  const warm = box.createInstance('warm');
  warm.instancedBuffers.color = new BABYLON.Color4(1, 1, 1, 1);
  await scene.whenReadyAsync();
  scene.render();
  warm.dispose();
}

export default {
  engine: 'babylon', variant: 'instances',
  async init(root, s) { sim = s; await setup(root); },
  setCount(n) {
    // optimize_your_scene "Freezing the active meshes": the set of cubes only changes here, so the
    // active-mesh list is re-frozen after each count change (in frame()).
    scene.unfreezeActiveMeshes();
    if (n < instances.length) {
      // optimize_your_scene "Scene with large number of meshes": block the per-dispose
      // active-mesh/rendering-group reset while disposing a batch.
      scene.blockfreeActiveMeshesAndRenderingGroups = true;
      for (let i = instances.length - 1; i >= n; i--) instances[i].dispose();
      scene.blockfreeActiveMeshesAndRenderingGroups = false;
      instances.length = n;
      colored = Math.min(colored, n);
    }
    for (let i = instances.length; i < n; i++) {
      const inst = box.createInstance('c' + i);
      // Every cube is always in view: skip frustum clipping for it (alwaysSelectAsActiveMesh), and
      // with that, skip bounding-info sync in computeWorldMatrix (doNotSyncBoundingInfo) --
      // optimize_your_scene "Freezing the active meshes" / "Not updating the bounding info".
      inst.alwaysSelectAsActiveMesh = true;
      inst.doNotSyncBoundingInfo = true;
      inst.isPickable = false;
      inst.instancedBuffers.color = new BABYLON.Color4(1, 1, 1, 1);
      instances.push(inst);
    }
    refreeze = true;
    countGen++; framesSinceCount = 0;
  },
  frame() {
    const { x, y, z, rx, ry, rz, r, g, b } = sim;
    const n = instances.length;
    if (freezeError) throw new Error('babylon-instances: freezeActiveMeshes failed: ' + freezeError);
    if (++framesSinceCount >= FREEZE_DEADLINE && frozenGen !== countGen)
      throw new Error(`babylon-instances: freezeActiveMeshes had not taken ${framesSinceCount} frames after setCount(${n})`);
    // tints are fixed after spawn; the sim fills new indices after setCount, so set them here once
    for (let i = colored; i < n; i++) instances[i].instancedBuffers.color.set(r[i], g[i], b[i], 1);
    colored = n;
    for (let i = 0; i < n; i++) {
      const inst = instances[i];
      inst.position.set(x[i], y[i], z[i]);
      // Babylon's Euler rotation is applied as RotationYawPitchRoll(y, x, z) = 'YXZ'
      inst.rotation.set(rx[i], ry[i], rz[i]);
    }
    if (refreeze) {
      refreeze = false;
      // See the header: freezeMeshes=false keeps per-frame world matrices and instance-buffer uploads;
      // a fresh renderId keeps the root mesh's visible-instance list from doubling up.
      scene.incrementRenderId();
      const gen = countGen;
      scene.freezeActiveMeshes(false, () => { if (gen === countGen) frozenGen = gen; },
        msg => { freezeError = String(msg); }, false);
    }
    scene.render();
  },
};
