import { Sim2D, Sim3D } from './sim.js';
import { Ramp, RAMP, PROFILES, judgeLevel, median } from './ramp.js';
import { getEnv } from './env.js';
import { glCount, installGlCounter, installGpuCounter } from './glCounter.js';

export const REF_N = { sprites: 20000, cubes: 5000, _fixtures: 20000 };
const SIMS = { sprites: Sim2D, cubes: Sim3D, _fixtures: Sim2D };
const nextFrame = () => new Promise(r => requestAnimationFrame(r));

// median blank rAF interval: the display's refresh period, so the budget adapts to slower displays
async function measureRefresh() {
  for (let i = 0; i < 10; i++) await nextFrame();
  let last = await nextFrame(); const iv = [];
  for (let i = 0; i < 120; i++) { const t = await nextFrame(); iv.push(t - last); last = t; }
  return median(iv);
}

export async function runHost(params, root) {
  const test = params.get('test'), sceneName = params.get('scene'), mode = params.get('mode') || 'ramp';
  const quick = params.has('quick'), profile = quick ? PROFILES.quick : PROFILES.full;
  const result = { test, scene: sceneName, mode, quick, env: await getEnv() };
  try { result.env.refreshMs = await measureRefresh(); } catch (e) { result.env.refreshMs = 0; }
  const budgetMs = Math.max(RAMP.BUDGET_MS, 1.5 * result.env.refreshMs);
  try {
    if (mode === 'count') { installGlCounter(); installGpuCounter(); }   // before the scene makes its context
    const scene = (await import(`../scenes/${test}/${sceneName}.js`)).default;
    Object.assign(result, { engine: scene.engine, variant: scene.variant });
    const sim = new SIMS[test](1);
    // webglcontextlost does not bubble from the canvas, so listen in the capture phase
    let lost = false;
    root.addEventListener('webglcontextlost', () => { lost = true; }, true);
    await scene.init(root, sim);

    const setCount = n => { scene.setCount(n); sim.setCount(n); };
    // one frame: advance the shared sim, then render; cpu time is the scene's render call only
    const step = async () => {
      const t = await nextFrame();
      if (lost) throw new Error('WebGL context lost');
      const s0 = performance.now(); sim.update(); const simMs = performance.now() - s0;
      const t0 = performance.now(); scene.frame(); const cpu = performance.now() - t0;
      return { t, cpu, simMs };
    };
    const measure = async n => {
      for (let tries = 0; tries < 3; tries++) {
        setCount(n);
        for (let i = 0; i < profile.WARM_FRAMES; i++) await step();
        let last = (await step()).t; const intervals = [], cpus = [], sims = [];
        for (let i = 0; i < profile.MEASURE_FRAMES; i++) {
          const { t, cpu, simMs } = await step(); intervals.push(t - last); cpus.push(cpu); sims.push(simMs); last = t;
        }
        const j = judgeLevel(intervals, cpus, budgetMs);
        if (!j.invalid) return { n, ...j, simMs: median(sims) };
      }
      throw new Error(`level n=${n} was throttled 3 times; keep the tab visible`);
    };

    if (mode === 'ramp') {
      const ramp = new Ramp(profile); result.levels = [];
      for (let n = ramp.next(); n !== null; n = ramp.next()) {
        const lvl = await measure(n); delete lvl.invalid; result.levels.push(lvl); ramp.report(lvl.pass);
      }
      Object.assign(result, ramp.result);
      const { pass, invalid, ...ref } = await measure(REF_N[test]); result.ref = ref;
    } else if (mode === 'fixed') {
      const { pass, invalid, ...ref } = await measure(+params.get('n')); result.ref = ref;
    } else if (mode === 'shot') {
      setCount(+params.get('n'));
      const frames = +(params.get('frames') || 120);
      for (let i = 0; i < frames; i++) await step();
      window.benchReady = true;                     // stop: the canvas keeps the last frame for a screenshot
    } else if (mode === 'count') {
      result.counts = [];
      for (const n of [+params.get('n'), +params.get('n2')].filter(Boolean)) {
        setCount(n);
        for (let i = 0; i < 5; i++) await step();
        glCount.calls = glCount.triangles = 0; await step();
        result.counts.push({ n, calls: glCount.calls, triangles: glCount.triangles });   // WebGL and WebGPU draws
      }
    }
  } catch (e) { result.error = String(e?.stack || e); }
  window.benchResult = result;
  parent?.postMessage({ type: 'bench-result', result }, '*');
  return result;
}
