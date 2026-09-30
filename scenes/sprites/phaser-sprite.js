// Phaser 4.2.1, normal path: one Image game object per sprite.
// Image, not Sprite: the Phaser 4 sprites-and-images guide says to use Image for anything that
// does not need frame animation (Sprite adds an AnimationState and a per-frame preUpdate).
// Rendering, texture, tint, alpha and transforms are otherwise identical between the two.
import * as Phaser from 'phaser';

// Game config: WebGL, 1280x720 at zoom 1, black clear, no MSAA (render.antialiasGL: false).
// render.antialias (texture filtering) keeps Phaser's default (LINEAR), per the brief's
// "texture filtering at the engine's default". Input, audio, banner and auto-focus are off;
// no physics is configured. Once the scene is created, Phaser's own TimeStep is stopped and
// frame() advances it with TimeStep#tick ("Manually advances the TimeStep by one step"),
// so exactly one Game#step (update + render) runs per harness frame.
function createGame(root) {
  return new Promise((resolve, reject) => {
    const game = new Phaser.Game({
      type: Phaser.WEBGL,
      parent: root,
      width: 1280, height: 720, zoom: 1,
      scale: { mode: Phaser.Scale.NONE },
      backgroundColor: '#000000',
      banner: false,
      autoFocus: false,
      input: { keyboard: false, mouse: false, touch: false, gamepad: false, windowEvents: false },
      audio: { noAudio: true },
      render: { antialiasGL: false },
      callbacks: { postBoot: g => { if (!g.renderer?.gl) reject(new Error('Phaser did not create a WebGL renderer')); } },
      scene: {
        preload() {
          this.load.spritesheet('atlas', 'assets/atlas.png', { frameWidth: 32, frameHeight: 32 });
          this.load.once('loaderror', f => reject(new Error('failed to load ' + f.src)));
        },
        create() {
          this.game.loop.stop();   // the harness owns requestAnimationFrame from here on
          resolve({ game: this.game, scene: this });
        },
      },
    });
  });
}

let game, scene, sim;
const objs = [];        // pool of Images; objs[0..active) are on the display list, in order
let active = 0;         // Images currently on the display list (== n after setCount)
let styled = 0;         // objs[0..styled) have frame/tint/alpha from the sim applied

export default {
  engine: 'phaser',
  variant: 'sprite',

  async init(root, s) {
    sim = s;
    ({ game, scene } = await createGame(root));
  },

  setCount(n) {
    if (n < active) {
      // Shrink: take the tail off the display list in one splice (List#removeBetween).
      // They stay in the pool for a later regrow.
      scene.children.removeBetween(n, active);
      styled = Math.min(styled, n);
    } else if (n > active) {
      // Regrow from the pool first, then create new Images the documented way (this.add.image).
      const reuse = Math.min(n, objs.length);
      if (reuse > active) scene.children.add(objs.slice(active, reuse));
      for (let i = objs.length; i < n; i++) {
        objs.push(scene.add.image(0, 0, 'atlas', 0));   // origin defaults to 0.5 (center)
      }
    }
    active = n;
  },

  frame() {
    const n = active, { x, y, angle, frame, r, g, b, a } = sim;
    // Sim data for new indices only exists after sim.setCount, so style new objects here.
    for (let i = styled; i < n; i++) {
      const o = objs[i];
      o.setFrame(frame[i]);
      o.setScale(0.75);                                  // 32 px cell -> 24 px
      o.setTint(((r[i] * 255 + 0.5) | 0) << 16 | ((g[i] * 255 + 0.5) | 0) << 8 | ((b[i] * 255 + 0.5) | 0));
      o.setAlpha(a[i]);
    }
    styled = n;
    for (let i = 0; i < n; i++) {
      const o = objs[i];
      o.x = x[i]; o.y = y[i];
      o.rotation = angle[i];                             // radians, clockwise on screen (y-down)
    }
    game.loop.tick();   // one Phaser step: scene update + exactly one render
  },
};
