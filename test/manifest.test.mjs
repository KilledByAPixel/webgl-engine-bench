import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TESTS, EXTENDED, suiteScenes } from '../harness/manifest.js';

test('the main suite is unchanged unless extended is asked for', () => {
  assert.deepEqual(suiteScenes(), TESTS);
  assert.deepEqual(suiteScenes(false), TESTS);
});

test('extended appends the other engines after the main scenes of each test', () => {
  const all = suiteScenes(true);
  for (const t of Object.keys(TESTS)) {
    assert.deepEqual(all[t].slice(0, TESTS[t].length), TESTS[t]);
    assert.deepEqual(all[t].slice(TESTS[t].length), EXTENDED[t]);
  }
});

test('no extended scene name collides with a main scene in the same test', () => {
  for (const t of Object.keys(EXTENDED)) for (const s of EXTENDED[t]) assert.ok(!TESTS[t].includes(s), `${t}/${s}`);
});
