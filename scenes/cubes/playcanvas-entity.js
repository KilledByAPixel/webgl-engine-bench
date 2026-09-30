// PlayCanvas 2.22.6, cubes, 'entity' variant: the normal scene-graph path. One Entity with a render
// component (type 'box') per cube, all sharing ONE StandardMaterial; the per-cube tint is a per-mesh-instance
// override of the material's diffuse uniform (MeshInstance.setParameter('material_diffuse', ...)), which the
// API docs describe as taking precedence over the material's parameter of the same name. One shared material
// keeps one shader and lets the renderer skip material state changes between draws; a material per entity
// would mean n materials, n uniform-buffer updates and n material switches.
// Per-entity materials were considered and rejected in favour of per-mesh-instance setParameter on one shared material (cheaper, documented).
import {
  AppBase, AppOptions, CameraComponentSystem, LightComponentSystem, RenderComponentSystem, createGraphicsDevice,
  Entity, Color, Vec3, Vec2, Quat, StandardMaterial, Texture,
  FILLMODE_NONE, RESOLUTION_FIXED, GAMMA_SRGB, TONEMAP_LINEAR, SORTMODE_NONE, LAYERID_WORLD,
  PIXELFORMAT_SRGBA8, ADDRESS_CLAMP_TO_EDGE,
} from 'playcanvas';
import { W, H } from '../../harness/sim.js';

// Tuned for the lowest per-pixel error against the reference screenshot (see report). Bright faces clip about
// as often as in the reference (2.5% of lit pixels vs 2.4%). The remaining saturation gap (0.28 vs 0.31) comes from
// the engine's output encode: GAMMA_SRGB is pow(1/2.2), not the piecewise sRGB curve, which darkens mid-tones
// less. It does not change with the light/ambient ratio. The tone mappers either shift brightness a lot
// (ACES, FILMIC) or oversaturate (NEUTRAL), so TONEMAP_LINEAR stays.
const LIGHT_INTENSITY = 1.3, AMBIENT = 0.28;
const TILE_UV = 32 / 256, INSET = 1 / 256;    // atlas cell 63 = column 7, row 7 (bottom row of the image)

let app, sim, material, entities = [], count = 0, tinted = 0;

export default {
  engine: 'playcanvas', variant: 'entity',
  async init(root, s) {
    sim = s;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    root.appendChild(canvas);
    const device = await createGraphicsDevice(canvas, { deviceTypes: ['webgl2'], antialias: false });
    device.maxPixelRatio = 1;
    const opts = new AppOptions();
    opts.graphicsDevice = device;
    opts.componentSystems = [RenderComponentSystem, CameraComponentSystem, LightComponentSystem];
    app = new AppBase(canvas);
    app.init(opts);
    app.setCanvasFillMode(FILLMODE_NONE, W, H);
    app.setCanvasResolution(RESOLUTION_FIXED, W, H);
    // setCanvasResolution sizes the backing store as floor(W * min(maxPixelRatio, window.devicePixelRatio)).
    // Chromium can report devicePixelRatio as 0.99999998 at "1x", which gives 1279x719. setResolution is the
    // device's setter that ignores maxPixelRatio (typings: "the value of maxPixelRatio is ignored"), so it pins
    // the backing store to exactly W x H. RESOLUTION_FIXED means nothing resizes it afterwards: render() only
    // resizes in RESOLUTION_AUTO, and update() only reads the client rect.
    device.setResolution(W, H);
    // app.start() is never called: it starts the engine's own loop, app.tick, which re-arms requestAnimationFrame
    // every frame, and the harness owns rAF. frame() instead runs tick's two halves itself, app.update(dt) then
    // app.render(), without tick's requestAnimationFrame. render() is marked internal (@ignore) in the typings,
    // but the only public on-demand option (autoRender = false + renderNextFrame) still needs tick's rAF loop,
    // so calling update + render directly is the only way to render exactly once per harness frame.

    // a single directional light is not clustered; the non-clustered forward path is the lighter shader
    app.scene.clusteredLightingEnabled = false;
    app.scene.ambientLight = new Color(AMBIENT, AMBIENT, AMBIENT);
    // everything is opaque and in view: skip the opaque sort (brief allows it)
    app.scene.layers.getLayerById(LAYERID_WORLD).opaqueSortMode = SORTMODE_NONE;

    const camera = new Entity('camera');
    camera.addComponent('camera', {
      clearColor: new Color(0, 0, 0, 1), fov: 60, nearClip: 0.1, farClip: 1000,   // fov is vertical by default
      gammaCorrection: GAMMA_SRGB, toneMapping: TONEMAP_LINEAR,
      frustumCulling: false,                    // every cube is always in view (brief allows it)
    });
    camera.setPosition(0, 0, 40);               // default orientation looks down -z
    app.root.addChild(camera);

    // a directional light shines down its entity's -Y axis, so rotate +Y onto the direction toward the light
    const toLight = new Vec3(-0.3, 1, 0.5).normalize();
    const axis = new Vec3().cross(Vec3.UP, toLight).normalize();
    const light = new Entity('light');
    light.addComponent('light', { type: 'directional', color: new Color(1, 1, 1), intensity: LIGHT_INTENSITY, castShadows: false });
    light.setRotation(new Quat().setFromAxisAngle(axis, Math.acos(Vec3.UP.dot(toLight)) * 180 / Math.PI));
    app.root.addChild(light);

    const img = new Image();
    img.src = 'assets/atlas.png';
    await img.decode();
    const atlas = new Texture(device, {
      name: 'atlas', width: img.width, height: img.height, format: PIXELFORMAT_SRGBA8, mipmaps: true,
      addressU: ADDRESS_CLAMP_TO_EDGE, addressV: ADDRESS_CLAMP_TO_EDGE,
    });
    atlas.setSource(img);

    // Lambert look: StandardMaterial's default specular is black and useMetalness is false, so no specular term
    material = new StandardMaterial();
    material.diffuseMap = atlas;
    // PlayCanvas's map transform is v' = v*tiling.y + (1 - tiling.y - offset.y), i.e. the offset is measured
    // from the image bottom; cell 63 is the bottom-right cell. Inset by one texel so neither bilinear filtering
    // nor the first mip level pulls in neighbouring cells.
    material.diffuseMapTiling = new Vec2(TILE_UV - 2 * INSET, TILE_UV - 2 * INSET);
    material.diffuseMapOffset = new Vec2(7 * TILE_UV + INSET, INSET);
    material.useSkybox = false;
    material.useFog = false;
    material.update();
  },
  setCount(n) {
    for (let i = entities.length; i < n; i++) {
      const e = new Entity();
      e.addComponent('render', { type: 'box', material, castShadows: false, receiveShadows: false });
      e.render.meshInstances[0].cull = false;   // no per-object frustum test (every cube is in view)
      e.tint = new Float32Array(3);
      app.root.addChild(e);
      entities.push(e);
    }
    for (let i = count; i < n; i++) entities[i].enabled = true;
    for (let i = n; i < count; i++) entities[i].enabled = false;
    count = n;
    if (tinted > n) tinted = n;                 // regrown cubes get their tint in frame(), once sim has spawned them
  },
  frame() {
    const { x, y, z, rx, ry, rz, r, g, b } = sim;
    for (; tinted < count; tinted++) {
      const t = entities[tinted].tint;
      // the material_diffuse uniform is linear: StandardMaterial converts its sRGB diffuse Color with
      // Color.linear() (pow 2.2), so do the same to the sRGB sim tint
      t[0] = r[tinted] ** 2.2; t[1] = g[tinted] ** 2.2; t[2] = b[tinted] ** 2.2;
      entities[tinted].render.meshInstances[0].setParameter('material_diffuse', t);
    }
    for (let i = 0; i < count; i++) {
      // quaternion for Euler (rx, ry, rz) applied in 'YXZ' order: q = qy * qx * qz
      const hx = rx[i] * 0.5, hy = ry[i] * 0.5, hz = rz[i] * 0.5;
      const c1 = Math.cos(hx), s1 = Math.sin(hx), c2 = Math.cos(hy), s2 = Math.sin(hy), c3 = Math.cos(hz), s3 = Math.sin(hz);
      const e = entities[i];
      e.setLocalPosition(x[i], y[i], z[i]);
      e.setLocalRotation(
        s1 * c2 * c3 + c1 * s2 * s3,
        c1 * s2 * c3 - s1 * c2 * s3,
        c1 * c2 * s3 - s1 * s2 * c3,
        c1 * c2 * c3 + s1 * s2 * s3);
    }
    app.update(1 / 60);                         // tick's update half: device, component-system events, stats
    app.render();                               // tick's render half
  },
};
