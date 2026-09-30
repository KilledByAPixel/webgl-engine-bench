// Ramp search for the most objects a scene can draw at 60 fps, and per-level judgement.
export const RAMP = { START_N: 1000, GROWTH: 1.5, BISECT_STEPS: 4, MAX_N: 2_000_000, BUDGET_MS: 17.5,
  THROTTLE_MS: 250, WARM_FRAMES: 60, MEASURE_FRAMES: 120 };

// search profiles: full is the published measurement; quick is a ~5 minute rough check (coarser steps, fewer frames)
export const PROFILES = {
  full: RAMP,
  quick: { ...RAMP, GROWTH: 2, BISECT_STEPS: 3, WARM_FRAMES: 20, MEASURE_FRAMES: 60 },
};

export function percentile(arr, p) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(p / 100 * s.length) - 1)];
}
export function median(arr) {
  const s = [...arr].sort((a, b) => a - b), m = s.length >> 1;
  return s.length & 1 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// a level passes when the median frame interval fits the 60 fps budget; any huge interval means the tab was
// throttled or hidden, so the level says nothing and is invalid
export function judgeLevel(intervalsMs, cpuMs, budgetMs = RAMP.BUDGET_MS) {
  const medianMs = median(intervalsMs);
  return { medianMs, p95Ms: percentile(intervalsMs, 95), cpuMs: median(cpuMs),
    pass: medianMs <= budgetMs, invalid: intervalsMs.some(t => t > RAMP.THROTTLE_MS) };
}

export class Ramp {
  constructor(profile = RAMP) { this.p = profile; this.lo = 0; this.hi = 0; this.n = profile.START_N; this.steps = 0; this.done = false; this.capped = false; }
  next() { return this.done ? null : this.n; }
  report(pass) {
    if (!this.hi) {                                  // growing
      if (!pass) { this.hi = this.n; return this.bisect(); }
      this.lo = this.n;
      if (this.n >= this.p.MAX_N) { this.done = this.capped = true; return; }
      this.n = Math.min(Math.round(this.n * this.p.GROWTH), this.p.MAX_N);
      return;
    }
    pass ? this.lo = this.n : this.hi = this.n;       // bisecting
    this.bisect();
  }
  bisect() {
    if (this.steps++ >= this.p.BISECT_STEPS) { this.done = true; return; }
    this.n = Math.round((this.lo + this.hi) / 2);
  }
  get result() { return { maxN: this.lo, capped: this.capped }; }
}
