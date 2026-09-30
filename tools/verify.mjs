// Pre-benchmark checks: every scene draws the same thing, draws every object, renders 1280x720 backing pixels at any
// devicePixelRatio, and runs at the refresh cap with one object. Run: node tools/verify.mjs
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { startServer } from './serve.mjs';
import { suiteScenes } from '../harness/manifest.js';
const TESTS = suiteScenes(process.argv.includes('--extended')); // --extended: verify the other engines too

const TRIS = { sprites: 2, cubes: 12 };
const server = await startServer(8125);
const browser = await chromium.launch({ headless: false }); // vsync on (current Chrome ignores the uncap flags)
const fails = [];
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); ok || fails.push(msg); };
const host = async (page, q) => {
  await page.goto('http://localhost:8125/host.html?' + q);
  await page.waitForFunction(() => window.benchResult || window.benchReady, null, { timeout: 300_000 });
  return page.evaluate(() => window.benchResult);
};
mkdirSync('verify', { recursive: true });
try {
  for (const dpr of [1, 1.5]) {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: dpr });
    for (const [test, scenes] of Object.entries(TESTS)) for (const scene of scenes) {
      const id = `${test}/${scene} dpr=${dpr}`;
      // 1. screenshot at a fixed frame, dpr 1 only
      await host(page, `test=${test}&scene=${scene}&mode=shot&n=2000&frames=120`);
      const err = await page.evaluate(() => window.benchResult?.error);
      check(!err, id + ' shot ran' + (err ? ': ' + err.split('\n')[0] : ''));
      // 2. backing size: some canvas in #stage is exactly 1280x720
      const sizes = await page.$$eval('#stage canvas', cs => cs.map(c => [c.width, c.height]));
      check(sizes.some(([w, h]) => w === 1280 && h === 720), `${id} canvas backing 1280x720 (got ${JSON.stringify(sizes)})`);
      if (dpr === 1) await page.locator('#stage').screenshot({ path: `verify/${test}-${scene}.png` });
      if (dpr !== 1) continue;
      // 3. draws every object, and fewer after lowering the count
      const c = (await host(page, `test=${test}&scene=${scene}&mode=count&n=10000&n2=5000`)).counts;
      check(c?.[0].triangles >= TRIS[test] * 10000, `${id} triangles@10000 = ${c?.[0].triangles}`);
      check(c?.[1].triangles >= TRIS[test] * 5000 && c?.[1].triangles < c?.[0].triangles,
        `${id} triangles@5000 = ${c?.[1].triangles} (drops after setCount down)`);
      // 4. one object is trivially fast
      const r1 = await host(page, `test=${test}&scene=${scene}&mode=fixed&n=1`), one = r1.ref;
      check(one?.medianMs <= 1.2 * r1.env.refreshMs, `${id} n=1 median ${one?.medianMs?.toFixed(2)} ms holds the ${r1.env.refreshMs?.toFixed(2)} ms refresh`);
    }
    await page.close();
  }
  const rows = Object.entries(TESTS).map(([t, ss]) => `<h2>${t}</h2><div style="display:flex;flex-wrap:wrap;gap:8px">`
    + ss.map(s => `<figure><img src="${t}-${s}.png" width=640><figcaption>${s}</figcaption></figure>`).join('') + '</div>');
  writeFileSync('verify/compare.html', `<body style="background:#222;color:#ddd;font:14px sans-serif">${rows.join('')}`);
} finally { await browser.close(); server.close(); }
console.log(fails.length ? `\n${fails.length} check(s) failed` : '\nall checks passed');
process.exit(fails.length ? 1 : 0);
