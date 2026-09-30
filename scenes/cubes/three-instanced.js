// Three.js cubes, InstancedMesh variant: every cube is one instance of a single InstancedMesh, so the whole
// scene is one draw call. Written from the three.js docs and manual (r186, WebGLRenderer).
import * as THREE from 'three';

// Lighting. The shared reference model is color = tex * tint * (0.3 + max(0, N.L)) on display (sRGB)
// values. Three keeps its documented linear workflow (sRGB texture and tint in, lighting in linear, sRGB out),
// and its Lambert BRDF is albedo / PI, so both intensities carry a PI. Ambient is the 0.3 grey read as an
// sRGB color; the sun intensity is least-squares fitted (1.28 PI) so the display-space output matches the
// reference model over visible cube faces (mean brightness equal, RMS about 10 of 255).
const AMBIENT_COLOR = new THREE.Color().setRGB(0.3, 0.3, 0.3, THREE.SRGBColorSpace), AMBIENT_INTENSITY = Math.PI;
const SUN_INTENSITY = 1.28 * Math.PI;

let renderer, scene, camera, geometry, material, mesh, sim;
let capacity = 0, colored = 0;
const euler = new THREE.Euler(0, 0, 0, 'YXZ');   // the shared rotation convention (LittleJS builds Ry*Rx*Rz)
const matrix = new THREE.Matrix4(), color = new THREE.Color();

// one InstancedMesh with room for `cap` instances; recreated when the count outgrows it
function makeMesh(cap) {
  if (mesh) { scene.remove(mesh); mesh.dispose(); }
  mesh = new THREE.InstancedMesh(geometry, material, cap);
  // manual "How to update things" / webgl_instancing_dynamic: matrices change every frame
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // create instanceColor up front so the program is built with instance colors from the first frame
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
  // the bounding sphere would have to be recomputed every frame after setMatrixAt (manual, InstancedMesh
  // section); every cube stays inside the view volume, so culling can never skip anything here
  mesh.frustumCulled = false;
  mesh.count = 0;
  scene.add(mesh);
  capacity = cap; colored = 0;
}

export default {
  engine: 'three', variant: 'instanced',

  async init(root, simulation) {
    sim = simulation;
    renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setPixelRatio(1);
    renderer.setSize(1280, 720);
    renderer.setClearColor(0x000000, 1);
    renderer.sortObjects = false;                  // opaque only; sorting exists for transparency
    root.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(60, 1280 / 720, 0.1, 1000);
    camera.position.set(0, 0, 40);                 // default orientation looks down -z

    scene.add(new THREE.AmbientLight(AMBIENT_COLOR, AMBIENT_INTENSITY));
    const sun = new THREE.DirectionalLight(0xffffff, SUN_INTENSITY);
    sun.position.set(-0.3, 1, 0.5);                // target stays at the origin: light comes from this direction
    scene.add(sun);

    const texture = await new THREE.TextureLoader().loadAsync('assets/atlas.png');
    texture.colorSpace = THREE.SRGBColorSpace;     // color texture (manual: Color management)
    // cell 63 = column 7, row 7 counted from the image top. flipY (default true) puts v = 0 at the image
    // bottom, so that cell spans u 7/8..1, v 0..1/8. Inset by half a texel so bilinear filtering at the two
    // interior cell edges never reaches the neighbouring cells (the outer edges clamp to the image border).
    const h = 0.5 / 256;
    texture.repeat.set(1 / 8 - 2 * h, 1 / 8 - 2 * h);
    texture.offset.set(7 / 8 + h, h);
    texture.updateMatrix();                        // compute the uv transform once...
    texture.matrixAutoUpdate = false;              // ...it never changes, so don't rebuild it every frame

    geometry = new THREE.BoxGeometry(1, 1, 1);
    material = new THREE.MeshLambertMaterial({ map: texture });
    makeMesh(1024);
  },

  setCount(n) {
    // the sim fills new indices after this call, so matrices and colors are written in frame()
    if (n > capacity) makeMesh(n);
    mesh.count = n;
    colored = Math.min(colored, n);
  },

  frame() {
    const { x, y, z, rx, ry, rz, r, g, b } = sim, n = mesh.count;
    for (let i = 0; i < n; i++) {
      euler.set(rx[i], ry[i], rz[i]);
      matrix.makeRotationFromEuler(euler).setPosition(x[i], y[i], z[i]);
      mesh.setMatrixAt(i, matrix);
    }
    const im = mesh.instanceMatrix;
    if (n < capacity) im.addUpdateRange(0, n * 16);  // upload only the live instances
    im.needsUpdate = true;

    // tints never change after spawn: write each instance's color once, when it first appears
    if (colored < n) {
      for (let i = colored; i < n; i++) mesh.setColorAt(i, color.setRGB(r[i], g[i], b[i], THREE.SRGBColorSpace));
      mesh.instanceColor.needsUpdate = true;         // only on frames where the count grew
      colored = n;
    }

    renderer.render(scene, camera);
  },
};
