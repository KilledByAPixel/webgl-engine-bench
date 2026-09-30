// PixiJS v8 sprites scene, Sprite variant: one Sprite per sim object inside a plain Container.
// Written from the Pixi v8 docs (pixijs.com/8.x guides + the vendored 8.21.0 typings).
// - One atlas TextureSource, 64 frame Textures that view it (Textures guide: many Textures share one source),
//   so every sprite batches together (Performance tips: spritesheets, up to 16 textures per batch).
// - Frame, tint and alpha are set once when an index becomes live; per frame only position and rotation change,
//   and nothing is allocated per frame.
// - The harness owns the loop: autoStart:false, and frame() calls renderer.render(stage) exactly once.
// - makeScene(preference) builds the scene for one renderer; the default export is the WebGL scene and
//   pixi-sprite-webgpu.js runs the same code with preference 'webgpu' (see _pixi-renderer.js).
import { Application, Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { W, H, SPRITE_SIZE, FRAMES } from '../../harness/sim.js';
import { rendererOptions, assertRenderer } from './_pixi-renderer.js';

const CELL = 32, COLS = 8, SCALE = SPRITE_SIZE / CELL;
const rgb = (r, g, b) => (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);

export function makeScene(preference) {
  let app, layer, sim, frames;
  const pool = [];   // pool[i] is the sprite for sim index i; the first `layer.children.length` are in the scene
  let ready = 0;     // indices [0, ready) have frame/tint/alpha applied from the sim

  return {
    engine: 'pixi', variant: preference === 'webgl' ? 'sprite' : `sprite-${preference}`,

    async init(root, simulation) {
      sim = simulation;
      app = new Application();
      await app.init({
        width: W, height: H, resolution: 1, antialias: false, autoStart: false,
        background: 0x000000, ...rendererOptions(preference),
      });
      assertRenderer(app, preference);
      root.appendChild(app.canvas);

      const atlas = await Assets.load('assets/atlas.png');
      frames = [];
      for (let i = 0; i < FRAMES; i++) {
        const frame = new Rectangle((i % COLS) * CELL, Math.floor(i / COLS) * CELL, CELL, CELL);
        frames.push(new Texture({ source: atlas.source, frame }));
      }

      layer = new Container();
      // Performance tips / Events: nothing here is interactive, so keep the event system out of the tree
      app.stage.eventMode = 'none';
      app.stage.interactiveChildren = false;
      layer.eventMode = 'none';
      layer.interactiveChildren = false;
      app.stage.addChild(layer);
    },

    setCount(n) {
      while (pool.length < n) {
        const s = new Sprite(frames[0]);
        s.anchor.set(0.5);
        s.scale.set(SCALE);
        pool.push(s);
      }
      const live = layer.children.length;
      if (n < live) layer.removeChildren(n, live);
      else for (let i = live; i < n; i++) layer.addChild(pool[i]);
      // sim.setCount runs after this and (re)spawns indices >= old count, so their static data is read in frame()
      if (ready > n) ready = n;
    },

    frame() {
      const { x, y, angle, frame, r, g, b, a } = sim, n = sim.count;
      for (let i = ready; i < n; i++) {
        const s = pool[i];
        s.texture = frames[frame[i]];
        s.tint = rgb(r[i], g[i], b[i]);
        s.alpha = a[i];
      }
      ready = n;
      for (let i = 0; i < n; i++) {
        const s = pool[i];
        s.position.set(x[i], y[i]);
        s.rotation = angle[i];
      }
      app.renderer.render(app.stage);
    },
  };
}

export default makeScene('webgl');
