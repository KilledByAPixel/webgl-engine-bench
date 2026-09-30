// PixiJS v8 sprites scene, ParticleContainer variant: one Particle per sim object in a v8 ParticleContainer.
// Written from the Pixi v8 docs (pixijs.com/8.x ParticleContainer guide + the vendored 8.21.0 typings).
// Limitations: none for this workload. Particle supports per-particle texture frame (uvs), tint + alpha (color),
// rotation (radians, positive = clockwise) and anchor/scale (vertex), and all particles share one texture source.
// - dynamicProperties: only position and rotation change every frame, so only they are dynamic. vertex (anchor,
//   scale, frame size), uvs (atlas frame) and color (tint + alpha) never change after spawn, so they are static and
//   are re-uploaded only when update() is called (the guide: "Static properties are uploaded only when update()
//   is called"), which happens only on frames where the particle list changed.
// - The harness owns the loop: autoStart:false, and frame() calls renderer.render(stage) exactly once.
// - makeScene(preference) builds the scene for one renderer; the default export is the WebGL scene and
//   pixi-particle-webgpu.js runs the same code with preference 'webgpu' (see _pixi-renderer.js).
import { Application, Assets, Particle, ParticleContainer, Rectangle, Texture } from 'pixi.js';
import { W, H, SPRITE_SIZE, FRAMES } from '../../harness/sim.js';
import { rendererOptions, assertRenderer } from './_pixi-renderer.js';

const CELL = 32, COLS = 8, SCALE = SPRITE_SIZE / CELL;
const rgb = (r, g, b) => (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);

export function makeScene(preference) {
  let app, container, sim, frames;
  const pool = [];   // pool[i] is the particle for sim index i; the first particleChildren.length are in the container
  let ready = 0;     // indices [0, ready) have frame/tint/alpha applied from the sim

  return {
    engine: 'pixi', variant: preference === 'webgl' ? 'particle' : `particle-${preference}`,

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

      container = new ParticleContainer({
        texture: frames[0],   // all particles share this texture's source
        dynamicProperties: { position: true, rotation: true, vertex: false, uvs: false, color: false },
        boundsArea: new Rectangle(0, 0, W, H),   // bounds are not computed for ParticleContainer; set them
      });
      app.stage.eventMode = 'none';
      app.stage.interactiveChildren = false;
      container.eventMode = 'none';
      app.stage.addChild(container);
    },

    setCount(n) {
      while (pool.length < n) {
        pool.push(new Particle({ texture: frames[0], anchorX: 0.5, anchorY: 0.5, scaleX: SCALE, scaleY: SCALE }));
      }
      const list = container.particleChildren, live = list.length;
      if (n < live) list.length = n;
      else for (let i = live; i < n; i++) list.push(pool[i]);
      if (n !== live) container.update();   // required after editing particleChildren directly
      // sim.setCount runs after this and (re)spawns indices >= old count, so their static data is read in frame()
      if (ready > n) ready = n;
    },

    frame() {
      const { x, y, angle, frame, r, g, b, a } = sim, n = sim.count, list = container.particleChildren;
      if (ready < n) {
        for (let i = ready; i < n; i++) {
          const p = list[i];
          p.texture = frames[frame[i]];
          p.tint = rgb(r[i], g[i], b[i]);
          p.alpha = a[i];
        }
        ready = n;
        container.update();   // static properties (uvs, color) changed: re-upload them this frame
      }
      for (let i = 0; i < n; i++) {
        const p = list[i];
        p.x = x[i];
        p.y = y[i];
        p.rotation = angle[i];
      }
      app.renderer.render(app.stage);
    },
  };
}

export default makeScene('webgl');
