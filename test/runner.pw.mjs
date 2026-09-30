// The runner continues past a failing scene and reports it. Run: node test/runner.pw.mjs
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { startServer } from '../tools/serve.mjs';

const server = await startServer(8123);
const browser = await chromium.launch({ headless: false }); // vsync on: current Chrome ignores the uncap flags
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
try {
  await page.goto('http://localhost:8123/index.html?fixtures=1');
  const out = await page.evaluate(() => window.runSuite({ tests: ['_fixtures'], repeats: 1 }));
  assert.equal(out.runs.length, 2);
  assert.ok(out.runs.find(r => r.scene === 'throws').error);
  assert.ok(out.runs.find(r => r.scene === 'null').maxN >= 100000); // the null scene is limited by the shared sim, not by a cap
  assert.match(await page.textContent('#results'), /throws[\s\S]*error/i);
  assert.match(await page.textContent('#results'), /init failed on purpose/);
  // quick mode: coarser doubling search, flagged as quick everywhere, rough-numbers caption shown
  const q = await page.evaluate(() => window.runSuite({ tests: ['_fixtures'], repeats: 1, quick: true }));
  assert.equal(q.quick, true);
  const qn = q.runs.find(r => r.scene === 'null');
  assert.equal(qn.quick, true);
  assert.deepEqual(qn.levels.slice(0, 3).map(l => l.n), [1000, 2000, 4000]);
  assert.ok(qn.maxN >= 100000, 'quick null maxN ' + qn.maxN);
  assert.match(await page.textContent('#results'), /Quick mode: rough numbers/);
  assert.equal(out.quick, false);
  // watchdog: a scene that never reports resolves with a timeout error
  const wd = await page.evaluate(async () => {
    const { runScene } = await import('./harness/runner.js');
    return runScene('_fixtures', 'hangs', document.getElementById('frames'), 'mode=ramp', 3000);
  });
  assert.match(wd.error, /timeout/);
  console.log('runner.pw: all passed');
} finally { await browser.close(); server.close(); }
