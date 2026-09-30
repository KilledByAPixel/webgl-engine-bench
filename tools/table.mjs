// Plain-text results for the terminal: an aligned summary table and one progress line per finished scene.
import { summarize } from '../harness/runner.js';

const num = n => n.toLocaleString('en-US');
const firstLine = s => String(s).split('\n')[0];

export function formatRun(r) {
  const id = `${r.test}/${r.scene}`.padEnd(26);
  if (r.error) return `${id} ERROR ${firstLine(r.error)}`;
  return `${id} max N ${num(r.maxN)}${r.capped ? '+' : ''}   render CPU ${r.ref.cpuMs.toFixed(2)} ms, sim ${r.ref.simMs.toFixed(2)} ms @ ref N`;
}

export function formatTable(runs, { quick = false } = {}) {
  const head = ['test', 'scene', 'max N @60fps', 'range', 'vs best', 'ms/frame', 'render CPU ms', 'sim ms'];
  const rows = summarize(runs).map(r => r.errors.length && !r.maxN.length
    ? [r.test, r.scene, `error: ${firstLine(r.errors[0])}`]
    : [r.test, r.scene + (r.errors.length ? ` (${r.errors.length}/${r.errors.length + r.maxN.length} failed)` : ''),
       num(r.maxNMedian) + (r.capped ? '+' : ''), `${num(r.maxNMin)}–${num(r.maxNMax)}`,
       `${(r.ratio * 100).toFixed(0)}%`, r.refMsMedian.toFixed(2), r.refCpuMedian.toFixed(2), r.refSimMedian.toFixed(2)]);
  const full = r => r.length === head.length;
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map(r => full(r) || i < 2 ? r[i].length : 0)));
  // text columns align left, numbers right; an error row keeps its message in one piece after the scene
  const line = r => full(r)
    ? r.map((c, i) => i < 2 ? c.padEnd(widths[i]) : c.padStart(widths[i])).join('  ')
    : [r[0].padEnd(widths[0]), r[1].padEnd(widths[1]), r[2]].join('  ');
  const rule = widths.map(w => '-'.repeat(w)).join('  ');
  return [
    ...(quick ? ['Quick mode: rough numbers (coarser search, fewer frames). Use a full run for anything you publish.', ''] : []),
    line(head), rule, ...rows.map(line), '',
    'ms/frame, render CPU ms and sim ms are medians at the reference N (sprites 20,000, cubes 5,000).',
  ].join('\n');
}
