// PlayCanvas 2.22.6, cubes, 'instanced' variant: hardware instancing, the manual's path for many copies of one
// mesh ("Hardware Instancing" page). One box Entity whose mesh instance gets setInstancing(vertexBuffer): a
// dynamic (BUFFER_DYNAMIC) per-instance vertex buffer rewritten and uploaded with setData() every frame, as the
// manual's "Dynamic Updates" section shows. All cubes draw in one instanced draw call.
//
// Per-instance layout (19 floats): the default instancing format's four matrix columns (ATTR11, ATTR12,
// ATTR14, ATTR15, which the engine's built-in transformInstancingVS reads as instance_line1..4) plus an RGB
// tint in the free ATTR13 slot. The tint is exposed to the shader with material.setAttribute() and consumed by
// user shader chunks, the same mechanism as the engine's instancing-custom example. The docs have no
// per-instance colour example, and StandardMaterial's diffuseVertexColor only switches on when the MESH's own
// vertex format has a COLOR stream (MeshInstance SHADERDEF_VCOLOR), so the chunks are the supported route.
import {
  AppBase, AppOptions, CameraComponentSystem, LightComponentSystem, RenderComponentSystem, createGraphicsDevice,
  Entity, Color, Vec3, Vec2, Quat, StandardMaterial, Texture, VertexBuffer, VertexFormat,
  FILLMODE_NONE, RESOLUTION_FIXED, GAMMA_SRGB, TONEMAP_LINEAR, SORTMODE_NONE, LAYERID_WORLD,
  PIXELFORMAT_SRGBA8, ADDRESS_CLAMP_TO_EDGE, BUFFER_DYNAMIC, TYPE_FLOAT32, SHADERLANGUAGE_GLSL,
  SEMANTIC_ATTR11, SEMANTIC_ATTR12, SEMANTIC_ATTR13, SEMANTIC_ATTR14, SEMANTIC_ATTR15,
} from 'playcanvas';
import { W, H } from '../../harness/sim.js';

// Tuned for the lowest per-pixel error against the reference screenshot (see report). Bright faces clip about
// as often as in the reference (2.5% of lit pixels vs 2.4%). The remaining saturation gap (0.28 vs 0.31) comes from
// the engine's output encode: GAMMA_SRGB is pow(1/2.2), not the piecewise sRGB curve, which darkens mid-tones
// less. It does not change with the light/ambient ratio. The tone mappers either shift brightness a lot
// (ACES, FILMIC) or oversaturate (NEUTRAL), so TONEMAP_LINEAR stays.
const LIGHT_INTENSITY = 1.3, AMBIENT = 0.28;
const TILE_UV = 32 / 256, INSET = 1 / 256;    // atlas cell 63 = column 7, row 7 (bottom row of the image)
const STRIDE = 19;                            // floats per instance: 16 matrix + 3 tint

// GLSL user chunks (this scene is WebGL2 only, so no WGSL versions are needed)
const DECL_VS = `
attribute vec3 aInstColor;
varying vec3 vInstColor;
`;
const MAIN_END_VS = `
vInstColor = aInstColor;
`;
const DECL_PS = `
varying vec3 vInstColor;
`;
// the engine's diffusePS chunk with one added line: multiply the albedo by the per-instance tint
const DIFFUSE_PS = `
uniform vec3 material_diffuse;
void getAlbedo() {
	dAlbedo = material_diffuse.rgb * vInstColor;
	#ifdef STD_DIFFUSE_TEXTURE
		dAlbedo *= {STD_DIFFUSE_TEXTURE_DECODE}(texture2DBias({STD_DIFFUSE_TEXTURE_NAME}, {STD_DIFFUSE_TEXTURE_UV}, textureBias)).{STD_DIFFUSE_TEXTURE_CHANNEL};
	#endif
}
`;

let app, device, sim, meshInst, format, vb = null, data = new Float32Array(0), count = 0, tinted = 0;

export default {
  engine: 'playcanvas', variant: 'instanced',
  async init(root, s) {
    sim = s;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    root.appendChild(canvas);
    device = await createGraphicsDevice(canvas, { deviceTypes: ['webgl2'], antialias: false });
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

    app.scene.clusteredLightingEnabled = false;  // one directional light: the plain forward path is lighter
    app.scene.ambientLight = new Color(AMBIENT, AMBIENT, AMBIENT);
    app.scene.layers.getLayerById(LAYERID_WORLD).opaqueSortMode = SORTMODE_NONE;   // one draw, nothing to sort

    const camera = new Entity('camera');
    camera.addComponent('camera', {
      clearColor: new Color(0, 0, 0, 1), fov: 60, nearClip: 0.1, farClip: 1000,   // fov is vertical by default
      gammaCorrection: GAMMA_SRGB, toneMapping: TONEMAP_LINEAR,
      frustumCulling: false,
    });
    camera.setPosition(0, 0, 40);
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

    const material = new StandardMaterial();
    material.diffuseMap = atlas;
    // map transform is v' = v*tiling.y + (1 - tiling.y - offset.y): offset measured from the image bottom;
    // one-texel inset keeps filtering and the first mip off the neighbouring cells
    material.diffuseMapTiling = new Vec2(TILE_UV - 2 * INSET, TILE_UV - 2 * INSET);
    material.diffuseMapOffset = new Vec2(7 * TILE_UV + INSET, INSET);
    material.useSkybox = false;
    material.useFog = false;
    material.setAttribute('aInstColor', SEMANTIC_ATTR13);
    material.shaderChunksVersion = '2.8';     // latest chunk API version in this build
    const chunks = material.getShaderChunks(SHADERLANGUAGE_GLSL);
    chunks.set('litUserDeclarationVS', DECL_VS);
    chunks.set('litUserMainEndVS', MAIN_END_VS);
    chunks.set('litUserDeclarationPS', DECL_PS);
    chunks.set('diffusePS', DIFFUSE_PS);
    material.update();

    const box = new Entity('cubes');
    box.addComponent('render', { type: 'box', material, castShadows: false, receiveShadows: false });
    app.root.addChild(box);
    meshInst = box.render.meshInstances[0];
    meshInst.visible = false;                   // until setCount gives it instances

    format = new VertexFormat(device, [
      { semantic: SEMANTIC_ATTR11, components: 4, type: TYPE_FLOAT32 },   // matrix column 0
      { semantic: SEMANTIC_ATTR12, components: 4, type: TYPE_FLOAT32 },   // matrix column 1
      { semantic: SEMANTIC_ATTR14, components: 4, type: TYPE_FLOAT32 },   // matrix column 2
      { semantic: SEMANTIC_ATTR15, components: 4, type: TYPE_FLOAT32 },   // matrix column 3 (translation)
      { semantic: SEMANTIC_ATTR13, components: 3, type: TYPE_FLOAT32 },   // tint
    ]);
  },
  setCount(n) {
    // VertexBuffer.setData uploads the whole buffer, so size it to exactly n instances; setCount is rare,
    // the per-frame upload is then exactly the live data
    if (n !== count) {
      const next = new Float32Array(n * STRIDE);
      next.set(data.subarray(0, Math.min(n, count) * STRIDE));   // keep the tints already written
      data = next;
      if (vb) vb.destroy();
      vb = n > 0 ? new VertexBuffer(device, format, n, { usage: BUFFER_DYNAMIC }) : null;
      meshInst.setInstancing(vb);               // instancing mesh instances are not frustum culled (cull=false)
      meshInst.visible = n > 0;
    }
    count = n;
    if (tinted > n) tinted = n;                 // new cubes get their tint in frame(), once sim has spawned them
  },
  frame() {
    const { x, y, z, rx, ry, rz, r, g, b } = sim;
    const d = data;
    for (; tinted < count; tinted++) {
      const o = tinted * STRIDE + 16;
      // sRGB tint -> linear with Color.linear()'s pow 2.2, as StandardMaterial does for its diffuse colour
      d[o] = r[tinted] ** 2.2; d[o + 1] = g[tinted] ** 2.2; d[o + 2] = b[tinted] ** 2.2;
    }
    for (let i = 0, o = 0; i < count; i++, o += STRIDE) {
      // column-major rotation matrix for Euler (rx, ry, rz) in 'YXZ' order (R = Ry * Rx * Rz), then translation
      const a = Math.cos(rx[i]), bb = Math.sin(rx[i]), c = Math.cos(ry[i]), dd = Math.sin(ry[i]);
      const e = Math.cos(rz[i]), f = Math.sin(rz[i]);
      const ce = c * e, cf = c * f, de = dd * e, df = dd * f;
      d[o] = ce + df * bb; d[o + 1] = a * f; d[o + 2] = cf * bb - de; d[o + 3] = 0;
      d[o + 4] = de * bb - cf; d[o + 5] = a * e; d[o + 6] = df + ce * bb; d[o + 7] = 0;
      d[o + 8] = a * dd; d[o + 9] = -bb; d[o + 10] = a * c; d[o + 11] = 0;
      d[o + 12] = x[i]; d[o + 13] = y[i]; d[o + 14] = z[i]; d[o + 15] = 1;
    }
    if (vb) vb.setData(d);
    app.update(1 / 60);                         // tick's update half: device, component-system events, stats
    app.render();                               // tick's render half
  },
};
