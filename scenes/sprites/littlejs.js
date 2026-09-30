// LittleJS sprites: immediate mode, one drawTile per sprite per frame, batched by the engine.
// Uses the release build (debug stripped). The engine is stepped manually so it renders once per harness frame
// and isn't held to its fixed 60 Hz update.
import { loadScript } from '../../harness/loadScript.js';
import { W, H, SPRITE_SIZE, FRAMES } from '../../harness/sim.js';

let sim, tiles, pos, size, color;

function gameRender() {
  const { x, y, angle, frame, r, g, b, a } = sim;
  for (let i = 0; i < sim.count; i++) {
    // sim is pixels y-down from the top left; LittleJS world is y-up, camera at the center, 1 unit = 1 pixel.
    // LittleJS angles are clockwise-positive, matching the sim.
    pos.set(x[i] - W / 2, H / 2 - y[i]);
    drawTile(pos, size, tiles[frame[i]], color.set(r[i], g[i], b[i], a[i]), angle[i]);
  }
}

export default {
  engine: 'littlejs', variant: 'drawTile',
  async init(root, s) {
    sim = s;
    await loadScript('vendor/littlejs.release.js');
    setEngineManualStep(true);       // engineStep(1) = exactly one update + render
    setShowSplashScreen(false);      // default is already false; explicit
    setCanvasFixedSize(vec2(W, H));
    setCanvasPixelRatio(1);          // backing store 1280x720 whatever the devicePixelRatio
    glSetAntialias(false);           // must precede engineInit (creates the GL context)
    await engineInit(() => {}, () => {}, () => {}, gameRender, () => {}, ['assets/atlas.png'], root);
    setCameraScale(1);
    setCameraPos(vec2());
    tiles = Array.from({ length: FRAMES }, (_, i) => tile(i, 32, 0)); // padding 0, bleed 0 by default
    pos = vec2(); size = vec2(SPRITE_SIZE); color = new Color;
  },
  setCount() {},            // immediate mode: it draws whatever sim.count is
  frame() { engineStep(1); },
};
