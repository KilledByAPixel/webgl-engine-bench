// Browser checks for host.html. Run: node test/host.pw.mjs
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { startServer } from '../tools/serve.mjs';

const server = await startServer(8122);
const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const run = async q => {
  await page.goto('http://localhost:8122/host.html?' + q);
  await page.waitForFunction(() => window.benchResult, null, { timeout: 600_000 });
  return page.evaluate(() => window.benchResult);
};
try {
  const nul = await run('test=_fixtures&scene=null&mode=ramp');
  assert.ok(nul.maxN >= 100000, 'null scene should reach a large N, got ' + nul.maxN);
  assert.ok(nul.env.refreshMs > 0, 'refreshMs recorded');
  assert.ok(nul.env.gpu && nul.env.versions.pixi, 'env recorded');
  assert.ok(nul.ref && nul.ref.n === 20000, 'fixed reference measured after the ramp');

  const bad = await run('test=_fixtures&scene=throws&mode=ramp');
  assert.match(bad.error, /init failed on purpose/);

  // the WebGPU draw counter sees a WebGPU scene's triangles, and follows the count down
  const gpu = await run('test=_fixtures&scene=webgpu-tris&mode=count&n=100&n2=40');
  assert.ok(!gpu.error, gpu.error);
  assert.deepEqual(gpu.counts.map(c => [c.n, c.calls, c.triangles]), [[100, 1, 100], [40, 1, 40]]);

  const fixed = await run('test=_fixtures&scene=null&mode=fixed&n=5');
  assert.equal(fixed.ref.n, 5);
  assert.ok(fixed.ref.medianMs > 0);
  const ctx = await run('test=_fixtures&scene=loses-context&mode=fixed&n=5');
  assert.match(ctx.error, /context lost/);

  console.log('host.pw: all passed');
} finally { await browser.close(); server.close(); }
