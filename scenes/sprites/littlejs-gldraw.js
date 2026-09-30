// LittleJS sprites through glDraw: the fast path REFERENCE documents for a game drawing very many sprites itself
// (and the path the engine's own particles take since 1.21). The sheet is bound once a frame, each frame's uvs are
// worked out once, and each sprite's packed color is kept from frame to frame, since tints never change after spawn,
// the same knowledge the Pixi ParticleContainer scene uses for its static properties. Per sprite, per frame, only
// position and angle come from the sim. The counterpart of pixi-particle; the littlejs scene is the general drawTile path.
import { loadScript } from '../../harness/loadScript.js';
import { W, H, SPRITE_SIZE, FRAMES } from '../../harness/sim.js';

let sim, glTexture, uvs, rgba = new Int32Array(0), colored = 0;

function gameRender() {
  const { x, y, angle, frame, r, g, b, a } = sim, n = sim.count;
  if (colored > n) colored = n;
  if (rgba.length < n) { const grown = new Int32Array(Math.max(n, rgba.length * 2)); grown.set(rgba); rgba = grown; }
  if (colored < n) {
    const c = new Color;
    for (let i = colored; i < n; i++) rgba[i] = c.set(r[i], g[i], b[i], a[i]).rgbaInt();
    colored = n;
  }
  glSetTexture(glTexture);
  for (let i = 0; i < n; i++) {
    // sim is pixels y-down from the top left; LittleJS world is y-up, camera at the center, 1 unit = 1 pixel
    const k = frame[i] * 4;
    glDraw(x[i] - W / 2, H / 2 - y[i], SPRITE_SIZE, SPRITE_SIZE, angle[i], uvs[k], uvs[k + 1], uvs[k + 2], uvs[k + 3], rgba[i]);
  }
}

export default {
  engine: 'littlejs', variant: 'glDraw',
  async init(root, s) {
    sim = s;
    await loadScript('vendor/littlejs.release.js');
    setEngineManualStep(true);       // engineStep(1) = exactly one update + render
    setShowSplashScreen(false);
    setCanvasFixedSize(vec2(W, H));
    setCanvasPixelRatio(1);          // backing store 1280x720 whatever the devicePixelRatio
    glSetAntialias(false);           // must precede engineInit (creates the GL context)
    await engineInit(() => {}, () => {}, () => {}, gameRender, () => {}, ['assets/atlas.png'], root);
    setCameraScale(1);
    setCameraPos(vec2());
    // each frame's uv rect, the way REFERENCE gives it: tile pos and pos + size times textureInfo.sizeInverse
    uvs = new Float32Array(FRAMES * 4);
    for (let i = 0; i < FRAMES; i++) {
      const t = tile(i, 32, 0), inv = t.textureInfo.sizeInverse;
      uvs.set([t.pos.x * inv.x, t.pos.y * inv.y, (t.pos.x + t.size.x) * inv.x, (t.pos.y + t.size.y) * inv.y], i * 4);
      glTexture = t.textureInfo.glTexture;
    }
  },
  setCount(n) { if (colored > n) colored = n; },   // shrinking lowers the watermark so regrown sprites are colored again
  frame() { engineStep(1); },
};
