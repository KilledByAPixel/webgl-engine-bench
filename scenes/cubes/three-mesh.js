// Three.js cubes, Mesh variant: one THREE.Mesh per cube, all sharing one BoxGeometry and one texture.
// Written from the three.js docs and manual (r186, WebGLRenderer).
//
// Tint: a material's color multiplies its map, but a Material is shared state, so per-cube tint needs
// either one material per mesh or vertex colors. Vertex colors live in the geometry, which would mean one
// BoxGeometry per cube; the documented per-object way is Material.color on a per-mesh material. So every
// cube gets its own MeshLambertMaterial with the same map. Materials with identical settings share one
// compiled shader program (three caches programs by their parameters), so the per-cube cost is uniforms
// only. The tint is written once, when a cube first appears; it never changes after spawn.
import * as THREE from 'three';

// Lighting. The shared reference model is color = tex * tint * (0.3 + max(0, N.L)) on display (sRGB)
// values. Three keeps its documented linear workflow (sRGB texture and tint in, lighting in linear, sRGB out),
// and its Lambert BRDF is albedo / PI, so both intensities carry a PI. Ambient is the 0.3 grey read as an
// sRGB color; the sun intensity is least-squares fitted (1.28 PI) so the display-space output matches the
// reference model over visible cube faces (mean brightness equal, RMS about 10 of 255).
const AMBIENT_COLOR = new THREE.Color().setRGB(0.3, 0.3, 0.3, THREE.SRGBColorSpace), AMBIENT_INTENSITY = Math.PI;
const SUN_INTENSITY = 1.28 * Math.PI;

let renderer, scene, camera, geometry, texture, sim;
const meshes = [];                                 // pool; meshes[0..count) are visible
let count = 0, tinted = 0;
const euler = new THREE.Euler(0, 0, 0, 'YXZ');     // the shared rotation convention (LittleJS builds Ry*Rx*Rz)

export default {
  engine: 'three', variant: 'mesh',

  async init(root, simulation) {
    sim = simulation;
    renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setPixelRatio(1);
    renderer.setSize(1280, 720);
    renderer.setClearColor(0x000000, 1);
    renderer.sortObjects = false;                  // opaque only; sorting exists for transparency
    root.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    // the scene itself never moves (manual "How to update things": static objects can skip auto update).
    // Left on, scene.updateMatrix() would flag its world matrix dirty every frame and force a world-matrix
    // recompute on every child, hidden pool meshes included; off, only children flagged dirty are recomputed.
    scene.matrixAutoUpdate = false;
    camera = new THREE.PerspectiveCamera(60, 1280 / 720, 0.1, 1000);
    camera.position.set(0, 0, 40);                 // default orientation looks down -z

    scene.add(new THREE.AmbientLight(AMBIENT_COLOR, AMBIENT_INTENSITY));
    const sun = new THREE.DirectionalLight(0xffffff, SUN_INTENSITY);
    sun.position.set(-0.3, 1, 0.5);                // target stays at the origin: light comes from this direction
    scene.add(sun);

    texture = await new THREE.TextureLoader().loadAsync('assets/atlas.png');
    texture.colorSpace = THREE.SRGBColorSpace;     // color texture (manual: Color management)
    // cell 63 = column 7, row 7 counted from the image top. flipY (default true) puts v = 0 at the image
    // bottom, so that cell spans u 7/8..1, v 0..1/8. Inset by half a texel so bilinear filtering at the two
    // interior cell edges never reaches the neighbouring cells (the outer edges clamp to the image border).
    const h = 0.5 / 256;
    texture.repeat.set(1 / 8 - 2 * h, 1 / 8 - 2 * h);
    texture.offset.set(7 / 8 + h, h);
    texture.updateMatrix();                        // compute the uv transform once...
    texture.matrixAutoUpdate = false;              // ...it never changes, so don't rebuild it per material

    geometry = new THREE.BoxGeometry(1, 1, 1);
  },

  setCount(n) {
    // the sim fills new indices after this call, so transforms and tints are written in frame()
    while (meshes.length < n) {
      const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ map: texture }));
      // manual "Matrix Transformations": the matrix is written directly each frame, so three must not
      // recompose it from position/quaternion/scale
      mesh.matrixAutoUpdate = false;
      // every cube stays inside the view volume, so per-object culling tests can never skip anything
      mesh.frustumCulled = false;
      mesh.visible = false;
      meshes.push(mesh);
      scene.add(mesh);
    }
    // shrinking hides the surplus instead of removing it (Object3D.remove is a linear search per child)
    for (let i = count; i < n; i++) meshes[i].visible = true;
    for (let i = n; i < count; i++) meshes[i].visible = false;
    count = n;
    tinted = Math.min(tinted, n);
  },

  frame() {
    const { x, y, z, rx, ry, rz, r, g, b } = sim;
    for (let i = tinted; i < count; i++) meshes[i].material.color.setRGB(r[i], g[i], b[i], THREE.SRGBColorSpace);
    tinted = count;

    for (let i = 0; i < count; i++) {
      const mesh = meshes[i];
      euler.set(rx[i], ry[i], rz[i]);
      mesh.matrix.makeRotationFromEuler(euler).setPosition(x[i], y[i], z[i]);
      mesh.matrixWorldNeedsUpdate = true;          // render() then derives matrixWorld from the new matrix
    }
    renderer.render(scene, camera);
  },
};
