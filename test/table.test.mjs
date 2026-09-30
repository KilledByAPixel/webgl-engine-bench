import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTable, formatRun } from '../tools/table.mjs';

const run = (scene, maxN, extra = {}) => ({ test: 'sprites', scene, maxN, capped: false,
  ref: { medianMs: 16.7, cpuMs: 2.2, simMs: 0.4 }, ...extra });

test('table has a header, aligned columns and one line per scene', () => {
  const lines = formatTable([run('littlejs', 208000), run('pixi-sprite', 52000)]).split('\n');
  assert.match(lines[0], /test\s+scene\s+max N/);
  const body = lines.filter(l => /littlejs|pixi-sprite/.test(l));
  assert.equal(body.length, 2);
  assert.match(body[0], /sprites\s+littlejs\s+208,000\s+/);
  assert.match(body[0], /100%/);
  assert.match(body[1], /25%/);
  // columns line up: the max N column ends at the same offset on every row
  const col = l => { const s = l.includes('littlejs') ? '208,000' : '52,000'; return l.indexOf(s) + s.length; }; // numbers right-align
  assert.equal(col(body[0]), col(body[1]));
});

test('quick runs get the rough-numbers caption; errors show as an error row', () => {
  const t = formatTable([run('littlejs', 1000), { test: 'sprites', scene: 'broken', error: 'Error: boom\n at x' }], { quick: true });
  assert.match(t, /Quick mode: rough numbers/);
  assert.match(t, /broken\s+error: Error: boom/);
  assert.doesNotMatch(t, /at x/);
});

test('progress line names the scene and its result', () => {
  assert.match(formatRun(run('littlejs', 208000)), /sprites\/littlejs\s+max N 208,000/);
  assert.match(formatRun({ test: 'cubes', scene: 'x', error: 'Error: nope\nstack' }), /cubes\/x\s+ERROR Error: nope$/);
});
