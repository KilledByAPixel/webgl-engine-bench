// Phaser 4.2.1, fast path: one SpriteGPULayer holding every sprite as a member, drawn with a
// single instanced draw call (Phaser.GameObjects.SpriteGPULayer, new in v4; the changelog calls it
// "optimized for rendering very large numbers of quads", up to 100x faster than individual sprites).
//
// Why this path. Phaser 4's high-count options, checked against the workload
// (per-sprite CPU-driven position + rotation every frame, per-sprite frame, tint, alpha):
//  - Blitter/Bob: batched and fast, but Bobs have no rotation or scale (sprites-and-images guide).
//    Cannot do the workload.
//  - Particles: an emitter's particles are simulated by the emitter and drawn through the same
//    quad batch as Images, so they are not a faster path for externally driven sprites.
//  - SpriteGPULayer: per-member x, y, rotation, scaleX/Y, alpha, frame, 4-corner tint, origin.
//    It can do everything the workload needs, so it is used here.
//
// The gap, stated plainly: SpriteGPULayer is designed for members that are written once and then
// animated on the GPU by its built-in tweens (linear, ease, gravity...). The sim's motion (bouncing
// off the screen edges) is not one of those tweens, so the positions have to come from the CPU
// every frame. Phaser documents direct buffer edits for this ("getDataByteSize: the byte stride per
// member for direct buffer manipulation") plus setAllSegmentsNeedUpdate ("if you're updating a large
// number of segments ... update the whole buffer at once"). So each frame writes x, y, rotation
// into the layer's CPU-side instance buffer (layer.submitterNode.instanceBufferLayout.buffer.viewF32,
// all documented public members) and flags the whole buffer; Phaser then re-uploads the whole
// interleaved buffer (168 bytes/member, STATIC_DRAW usage set by Phaser) in one bufferSubData
// before its one instanced draw. No raw WebGL calls are made by this scene.
// Frame, tint and alpha never change after spawn, so they are written once with addMember.
//
// Upload overhead is inherent, not a choice made here: only x, y, rotation change (12 bytes per
// member), but SpriteGPULayer interleaves every member attribute in one 168-byte record and its
// render node hard-codes that buffer's layout and STATIC_DRAW usage. So a per-frame update moves
// about 14x more bytes than the changing data. No documented option splits the dynamic
// attributes into their own buffer.
//
// Why direct writes rather than the per-member API: Phaser 4.2.1's documented per-member edit
// methods are slower for this. There is no `updateMember`; the methods are `editMember` and
// `patchMember`. editMember(index, member) goes through addMember, so it marshals a member object
// and re-encodes every animation slot of every field. patchMember copies a whole raw record, or
// loops over a per-element mask, and flags a segment per call. Writing the three base values
// straight into the buffer view (the documented getDataByteSize stride) avoids both costs.
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

const SCALE = 24 / 32;          // 32 px atlas cell -> 24 px sprite
const NAMES = Array.from({ length: 64 }, (_, k) => String(k));   // spritesheet frame names
const member = {                 // reused for every addMember call, as the docs recommend
  x: 0, y: 0, rotation: 0, scaleX: SCALE, scaleY: SCALE, alpha: 1, frame: '0',
  originX: 0.5, originY: 0.5,
  tintTopLeft: 0xffffff, tintTopRight: 0xffffff, tintBottomLeft: 0xffffff, tintBottomRight: 0xffffff,
};

let game, layer, sim, stride;    // stride in 32-bit floats (42)

export default {
  engine: 'phaser',
  variant: 'gpulayer',

  async init(root, s) {
    sim = s;
    let scene;
    ({ game, scene } = await createGame(root));
    layer = scene.add.spriteGPULayer('atlas', 1024);
    stride = layer.getDataByteSize() / 4;
  },

  setCount(n) {
    // Keep the buffer exactly n members long: a full-buffer update uploads `size` members,
    // and resize() truncates memberCount on shrink, so exactly n instances are drawn.
    if (n !== layer.size) layer.resize(n);
  },

  frame() {
    const { x, y, angle, frame, r, g, b, a } = sim;
    const n = layer.size;
    // New members (sim data for them only exists after sim.setCount): frame, tint, alpha once.
    for (let i = layer.memberCount; i < n; i++) {
      const tint = ((r[i] * 255 + 0.5) | 0) << 16 | ((g[i] * 255 + 0.5) | 0) << 8 | ((b[i] * 255 + 0.5) | 0);
      member.x = x[i]; member.y = y[i]; member.rotation = angle[i];
      member.frame = NAMES[frame[i]];
      member.alpha = a[i];
      member.tintTopLeft = member.tintTopRight = member.tintBottomLeft = member.tintBottomRight = tint;
      layer.addMember(member);
    }
    // Per-frame motion: base values of the x (float 0), y (4) and rotation (8) animation slots.
    const f32 = layer.submitterNode.instanceBufferLayout.buffer.viewF32;   // re-read: resize swaps it
    for (let i = 0, o = 0; i < n; i++, o += stride) {
      f32[o] = x[i]; f32[o + 4] = y[i];
      f32[o + 8] = angle[i];                            // radians, clockwise on screen (y-down)
    }
    layer.setAllSegmentsNeedUpdate();
    game.loop.tick();   // one Phaser step: scene update + exactly one render
  },
};
