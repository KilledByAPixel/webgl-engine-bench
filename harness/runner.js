import { TESTS, suiteScenes } from './manifest.js';

// run one scene in a fresh, visible iframe; resolves with its result, removes the iframe after
export const SCENE_TIMEOUT_MS = 15 * 60 * 1000;
export function runScene(test, scene, frameHost, query = 'mode=ramp', timeoutMs = SCENE_TIMEOUT_MS) {
  return new Promise(resolve => {
    const f = document.createElement('iframe');
    f.width = 1280; f.height = 720; f.style.border = '0';
    const done = result => { clearTimeout(timer); removeEventListener('message', onMsg); f.remove(); resolve(result); };
    const onMsg = e => {
      if (e.source !== f.contentWindow || e.data?.type !== 'bench-result') return;
      done(e.data.result);
    };
    const timer = setTimeout(() => done({ test, scene, error: 'timeout: scene never reported' }), timeoutMs);
    addEventListener('message', onMsg);
    f.src = `host.html?test=${test}&scene=${scene}&${query}`;
    frameHost.appendChild(f);
  });
}

// scene order rotates each repeat so warm-up and heat don't always land on the same engine
export async function runSuite({ tests, repeats = 3, fixtures = false, quick = false, extended = false } = {}, frameHost, onResult) {
  const all = { ...suiteScenes(extended), ...(fixtures ? { _fixtures: ['null', 'throws'] } : {}) };
  const runs = [];
  for (let r = 0; r < repeats; r++)
    for (const test of tests || Object.keys(TESTS)) {
      const scenes = all[test], k = r % scenes.length;
      for (const scene of [...scenes.slice(k), ...scenes.slice(0, k)]) {
        const res = { repeat: r, ...(await runScene(test, scene, frameHost, quick ? 'mode=ramp&quick=1' : 'mode=ramp')) };
        runs.push(res); onResult?.(runs);
      }
    }
  return { env: runs.find(x => x.env)?.env, date: new Date().toISOString(), quick, extended, runs };
}

// median of repeats per scene, and ratio to the best scene in the test
export function summarize(runs) {
  const med = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length & 1 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const rows = {};
  for (const r of runs) {
    const row = rows[`${r.test}/${r.scene}`] ??= { test: r.test, scene: r.scene, maxN: [], refMs: [], refCpu: [], refSim: [], errors: [], capped: false };
    if (r.error) { row.errors.push(r.error); continue; }
    row.maxN.push(r.maxN); row.refMs.push(r.ref.medianMs); row.refCpu.push(r.ref.cpuMs); row.refSim.push(r.ref.simMs); row.capped ||= r.capped;
  }
  const out = Object.values(rows).map(r => ({ ...r,
    maxNMedian: r.maxN.length ? med(r.maxN) : null, maxNMin: Math.min(...r.maxN), maxNMax: Math.max(...r.maxN),
    refMsMedian: r.refMs.length ? med(r.refMs) : null, refCpuMedian: r.refCpu.length ? med(r.refCpu) : null, refSimMedian: r.refSim.length ? med(r.refSim) : null }));
  for (const r of out) {
    const best = Math.max(...out.filter(o => o.test === r.test && o.maxNMedian).map(o => o.maxNMedian));
    r.ratio = r.maxNMedian ? r.maxNMedian / best : null;
  }
  return out;
}
