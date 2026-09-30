import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ramp, RAMP, judgeLevel, median, percentile } from '../harness/ramp.js';

// drive a ramp against a scene whose true limit is `limit` objects
function runTo(limit) {
  const r = new Ramp(), seen = [];
  for (let n = r.next(); n !== null; n = r.next()) { seen.push(n); r.report(n <= limit); }
  return { ...r.result, seen };
}

test('median and percentile', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95), 10);
});

test('ramp grows by 1.5x from 1000, then bisects 4 times', () => {
  const { maxN, capped, seen } = runTo(10000);
  assert.deepEqual(seen.slice(0, 7), [1000, 1500, 2250, 3375, 5063, 7595, 11393]);
  assert.equal(seen.length, 7 + RAMP.BISECT_STEPS);
  assert.equal(capped, false);
  assert.ok(maxN <= 10000 && maxN >= 10000 - (11393 - 7595) / 16, 'maxN ' + maxN);
});

test('first level failing bisects down from 1000', () => {
  const { maxN } = runTo(300);
  assert.ok(maxN <= 300 && maxN >= 300 - 1000 / 16, 'maxN ' + maxN);
});

test('a scene that never fails stops at MAX_N and is marked capped', () => {
  const { maxN, capped } = runTo(Infinity);
  assert.equal(maxN, RAMP.MAX_N);
  assert.equal(capped, true);
});

test('60 Hz frames pass, one dropped frame in three fails', () => {
  assert.equal(judgeLevel(Array(120).fill(16.67), [1]).pass, true);
  assert.equal(judgeLevel(Array(120).fill(33.3), [1]).pass, false);
});

test('144 Hz quantized intervals: 13.9 ms still passes, 20.8 ms fails', () => {
  assert.equal(judgeLevel(Array(120).fill(6.94 * 2), [1]).pass, true);
  assert.equal(judgeLevel(Array(120).fill(6.94 * 3), [1]).pass, false);
});

test('throttled level is invalid', () => {
  const iv = Array(120).fill(16.67); iv[40] = 1000;
  const j = judgeLevel(iv, [1]);
  assert.equal(j.invalid, true);
});

test('cpu is the median of the per-frame cpu times', () => {
  assert.equal(judgeLevel(Array(120).fill(16), [1, 9, 2]).cpuMs, 2);
});

test('budgetMs override: 16.7 passes and 33.3 fails at budget 25', () => {
  assert.equal(judgeLevel(Array(120).fill(16.7), [1], 25).pass, true);
  assert.equal(judgeLevel(Array(120).fill(33.3), [1], 25).pass, false);
});

test('quick profile doubles from 1000, then bisects 3 times', async () => {
  const { PROFILES } = await import('../harness/ramp.js');
  const r = new Ramp(PROFILES.quick), seen = [];
  for (let n = r.next(); n !== null; n = r.next()) { seen.push(n); r.report(n <= 10000); }
  assert.deepEqual(seen.slice(0, 5), [1000, 2000, 4000, 8000, 16000]);
  assert.equal(seen.length, 5 + PROFILES.quick.BISECT_STEPS);
  assert.ok(r.result.maxN <= 10000 && r.result.maxN >= 10000 - (16000 - 8000) / 8, 'maxN ' + r.result.maxN);
});

test('quick profile measures fewer frames than full', async () => {
  const { PROFILES } = await import('../harness/ramp.js');
  assert.ok(PROFILES.quick.WARM_FRAMES < PROFILES.full.WARM_FRAMES);
  assert.ok(PROFILES.quick.MEASURE_FRAMES < PROFILES.full.MEASURE_FRAMES);
  assert.equal(PROFILES.full.GROWTH, RAMP.GROWTH); // RAMP stays the full profile
});
