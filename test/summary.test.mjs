import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeFile, isFullRun, gpuName } from '../tools/summary.mjs';

const level = (n, pass, cpuMs) => ({ n, pass, medianMs: 16.7, p95Ms: 17, cpuMs, simMs: 1 });
const run = (scene, repeat, maxN, cpuAtMax) => ({ test: 'sprites', scene, repeat, engine: scene.split('-')[0], maxN,
  capped: false, ref: { n: 20000, medianMs: 16.7, cpuMs: 1, simMs: 0.3 },
  levels: [level(1000, true, 0.1), level(maxN, true, cpuAtMax), level(maxN * 2, false, cpuAtMax * 2)] });
const file = {
  mode: 'vsync', quick: false, channel: 'chrome', browser: '154.0.1', startedAt: '2026-09-30T18:12:04.506Z', repeats: 2,
  host: { name: 'SECRET-HOSTNAME', cpu: 'Intel(R) Core(TM) i7-3770 CPU @ 3.40GHz', cores: 8, ramGB: 15.9, os: 'Windows 10 Pro' },
  complete: true,
  runs: [run('littlejs', 0, 400000, 14), run('littlejs', 1, 500000, 16), run('pixi-sprite', 0, 100000, 40), run('pixi-sprite', 1, 100000, 44)]
    .map(r => ({ ...r, env: { gpu: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 2070 SUPER (0x00001E84) Direct3D11 vs_5_0 ps_5_0, D3D11)',
      refreshMs: 16.7, versions: { littlejs: { version: '1.21.0', commit: 'd1ca1c95' }, pixi: '8.21.0' } } })),
};

test('gpu name is pulled out of the ANGLE renderer string', () => {
  assert.equal(gpuName(file.runs[0].env.gpu), 'NVIDIA GeForce RTX 2070 SUPER');
  assert.equal(gpuName('Apple M2'), 'Apple M2');
});

test('summary names the machine but never the hostname', () => {
  const md = summarizeFile(file);
  assert.match(md, /i7-3770/);
  assert.match(md, /RTX 2070 SUPER/);
  assert.match(md, /Chrome 154\.0\.1/);
  assert.match(md, /60 Hz/);
  assert.match(md, /LittleJS 1\.21\.0 @ d1ca1c95/);
  assert.doesNotMatch(md, /SECRET-HOSTNAME/);
});

test('table rows: median of repeats, range, % of best, CPU per object at max N', () => {
  const md = summarizeFile(file);
  // littlejs: maxN median 450,000 (400k, 500k), cpu/obj at max = median(14/400k, 16/500k) = median(35, 32) = 33.5 ns
  assert.match(md, /\| littlejs \| 450,000 \| 400,000–500,000 \| 100% \| 34 ns \|/);
  // pixi-sprite: 100,000 both repeats, 22% of best, cpu median(400, 440) = 420 ns
  assert.match(md, /\| pixi-sprite \| 100,000 \| 100,000–100,000 \| 22% \| 420 ns \|/);
});

test('only complete full runs of real scenes count as results', () => {
  assert.equal(isFullRun(file), true);
  assert.equal(isFullRun({ ...file, quick: true }), false);
  assert.equal(isFullRun({ ...file, complete: false }), false);
  assert.equal(isFullRun({ ...file, runs: [{ ...file.runs[0], test: '_fixtures' }] }), false);
});
