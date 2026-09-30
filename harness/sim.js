// Shared, seeded simulation. Every scene of a test reads this state, so the only per-engine work is rendering.
// The step is a fixed 1/60 s per frame, so frame K looks the same in every engine.
export const W = 1280, H = 720, SPRITE_SIZE = 24, FRAMES = 64, CUBE_TILE = 63, DT = 1 / 60;
export const BOX = { x: 28, y: 15, zMin: -20, zMax: 8 };

// mulberry32; object i is seeded by (seed, i) so its start never depends on setCount history
function rng(seed) {
  return () => {
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const lerp = (a, b, t) => a + (b - a) * t;

class Sim {
  constructor(seed, fields) {
    this.seed = seed; this.fields = fields; this.count = 0; this.capacity = 0;
    this.grow(1024);
  }
  grow(capacity) {
    for (const [name, Type] of this.fields) {
      const next = new Type(capacity);
      if (this[name]) next.set(this[name]);
      this[name] = next;
    }
    this.capacity = capacity;
  }
  setCount(n) {
    if (n > this.capacity) this.grow(Math.max(n, this.capacity * 2));
    for (let i = this.count; i < n; i++) this.spawn(i, rng(this.seed * 1000003 + i));
    this.count = n;
  }
}

export class Sim2D extends Sim {
  constructor(seed = 1) {
    super(seed, [['x', Float32Array], ['y', Float32Array], ['vx', Float32Array], ['vy', Float32Array],
      ['angle', Float32Array], ['spin', Float32Array], ['frame', Uint8Array],
      ['r', Float32Array], ['g', Float32Array], ['b', Float32Array], ['a', Float32Array]]);
  }
  spawn(i, rand) {
    const h = SPRITE_SIZE / 2, dir = rand() * Math.PI * 2, speed = lerp(60, 240, rand());
    this.x[i] = lerp(h, W - h, rand()); this.y[i] = lerp(h, H - h, rand());
    this.vx[i] = Math.cos(dir) * speed; this.vy[i] = Math.sin(dir) * speed;
    this.angle[i] = rand() * Math.PI * 2; this.spin[i] = lerp(-3, 3, rand());
    this.frame[i] = Math.floor(rand() * FRAMES);
    this.r[i] = lerp(.5, 1, rand()); this.g[i] = lerp(.5, 1, rand()); this.b[i] = lerp(.5, 1, rand());
    this.a[i] = lerp(.5, 1, rand());
  }
  update() {
    const h = SPRITE_SIZE / 2, { x, y, vx, vy, angle, spin } = this;
    for (let i = 0; i < this.count; i++) {
      x[i] += vx[i] * DT; y[i] += vy[i] * DT; angle[i] += spin[i] * DT;
      if (x[i] < h) { x[i] = h; vx[i] = -vx[i]; } else if (x[i] > W - h) { x[i] = W - h; vx[i] = -vx[i]; }
      if (y[i] < h) { y[i] = h; vy[i] = -vy[i]; } else if (y[i] > H - h) { y[i] = H - h; vy[i] = -vy[i]; }
    }
  }
}

export class Sim3D extends Sim {
  constructor(seed = 1) {
    super(seed, [['x', Float32Array], ['y', Float32Array], ['z', Float32Array],
      ['vx', Float32Array], ['vy', Float32Array], ['vz', Float32Array],
      ['rx', Float32Array], ['ry', Float32Array], ['rz', Float32Array],
      ['sx', Float32Array], ['sy', Float32Array], ['sz', Float32Array],
      ['r', Float32Array], ['g', Float32Array], ['b', Float32Array]]);
  }
  spawn(i, rand) {
    this.x[i] = lerp(-BOX.x, BOX.x, rand()); this.y[i] = lerp(-BOX.y, BOX.y, rand());
    this.z[i] = lerp(BOX.zMin, BOX.zMax, rand());
    this.vx[i] = lerp(-4, 4, rand()); this.vy[i] = lerp(-4, 4, rand()); this.vz[i] = lerp(-4, 4, rand());
    this.rx[i] = rand() * 6.3; this.ry[i] = rand() * 6.3; this.rz[i] = rand() * 6.3;
    this.sx[i] = lerp(-2, 2, rand()); this.sy[i] = lerp(-2, 2, rand()); this.sz[i] = lerp(-2, 2, rand());
    this.r[i] = lerp(.5, 1, rand()); this.g[i] = lerp(.5, 1, rand()); this.b[i] = lerp(.5, 1, rand());
  }
  update() {
    const { x, y, z, vx, vy, vz, rx, ry, rz, sx, sy, sz } = this;
    for (let i = 0; i < this.count; i++) {
      x[i] += vx[i] * DT; y[i] += vy[i] * DT; z[i] += vz[i] * DT;
      rx[i] += sx[i] * DT; ry[i] += sy[i] * DT; rz[i] += sz[i] * DT;
      if (x[i] < -BOX.x) { x[i] = -BOX.x; vx[i] = -vx[i]; } else if (x[i] > BOX.x) { x[i] = BOX.x; vx[i] = -vx[i]; }
      if (y[i] < -BOX.y) { y[i] = -BOX.y; vy[i] = -vy[i]; } else if (y[i] > BOX.y) { y[i] = BOX.y; vy[i] = -vy[i]; }
      if (z[i] < BOX.zMin) { z[i] = BOX.zMin; vz[i] = -vz[i]; } else if (z[i] > BOX.zMax) { z[i] = BOX.zMax; vz[i] = -vz[i]; }
    }
  }
}
