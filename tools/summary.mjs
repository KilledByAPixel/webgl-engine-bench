// Markdown summaries of benchmark result files: the machine, then one table per test.
//   node tools/summary.mjs results/<file>.json [...]   print a summary to paste into a results submission
//   node tools/summary.mjs --write                     rebuild RESULTS.md from every complete full run in results/
// The machine is named by its hardware, browser and OS, never by its hostname.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { summarize } from '../harness/runner.js';

const num = n => Math.round(n).toLocaleString('en-US');
const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length & 1 ? s[m] : (s[m - 1] + s[m]) / 2; };

// "ANGLE (NVIDIA, NVIDIA GeForce RTX 2070 SUPER (0x00001E84) Direct3D11 ...)" -> "NVIDIA GeForce RTX 2070 SUPER"
export function gpuName(s = '') {
  const m = /^ANGLE \([^,]+, (.+?)(?: \(0x[0-9A-Fa-f]+\)| Direct3D|, |\)$)/.exec(s);
  return (m ? m[1] : s).trim();
}

export const isFullRun = j => j.complete === true && !j.quick && j.runs?.length > 0 && j.runs.every(r => !r.test?.startsWith('_'));

function machine(j) {
  const env = j.runs.find(r => r.env)?.env || {}, h = j.host || {};
  const ljs = env.versions?.littlejs;
  const hz = env.refreshMs ? Math.round(1000 / env.refreshMs) : null;
  const browser = j.browser ? `${j.channel === 'chromium' ? 'Chromium' : 'Chrome'} ${j.browser}` : env.userAgent;
  return [
    `- **CPU:** ${h.cpu ?? 'not recorded (browser run)'}${h.cores ? `, ${h.cores} threads` : ''}${h.ramGB ? `, ${h.ramGB} GB RAM` : ''}`,
    `- **GPU:** ${gpuName(env.gpu)}${env.webgpu?.vendor ? ` (WebGPU adapter: ${env.webgpu.vendor} ${env.webgpu.architecture}${env.webgpu.fallback ? ', FALLBACK' : ''})` : ''}`,
    `- **OS / browser:** ${h.os ?? 'not recorded'} / ${browser}${hz ? `, ${hz} Hz display` : ''}`,
    `- **Run:** ${(j.startedAt || j.date || '').slice(0, 10)}, ${j.quick ? 'quick mode (rough)' : 'full run'}, ${j.repeats ?? '?'} repeat(s)`
      + `${j.extended ? ', extended' : ''}${ljs ? `, LittleJS ${ljs.version} @ ${ljs.commit}` : ''}`,
  ].join('\n');
}

// render CPU per object at the largest level each repeat passed, median over repeats
function cpuPerObject(runs) {
  const per = runs.filter(r => !r.error && r.levels?.length).map(r => {
    const top = r.levels.filter(l => l.pass).reduce((a, b) => (b.n > a.n ? b : a), { n: 0 });
    return top.n ? top.cpuMs / top.n * 1e6 : null;
  }).filter(v => v !== null);
  return per.length ? `${num(median(per))} ns` : "–";
}

export function summarizeFile(j) {
  const rows = summarize(j.runs);
  const tests = [...new Set(rows.map(r => r.test))];
  const tables = tests.map(t => {
    const lines = rows.filter(r => r.test === t).sort((a, b) => (b.maxNMedian ?? -1) - (a.maxNMedian ?? -1)).map(r =>
      r.maxN.length
        ? `| ${r.scene} | ${num(r.maxNMedian)}${r.capped ? '+' : ''} | ${num(r.maxNMin)}–${num(r.maxNMax)} | ${Math.round(r.ratio * 100)}% | `
          + `${cpuPerObject(j.runs.filter(x => x.test === t && x.scene === r.scene))} |${r.errors.length ? ` ${r.errors.length} repeat(s) failed |` : ''}`
        : `| ${r.scene} | error | | | |`);
    const unit = t === 'cubes' ? 'cube' : 'sprite';
    return `**${t}**\n\n| scene | max N @60fps (median) | range | vs best | render CPU per ${unit} at max N |\n|---|---|---|---|---|\n${lines.join('\n')}`;
  });
  return `${machine(j)}\n\n${tables.join('\n\n')}\n`;
}

function writeResults(dir = 'results') {
  const files = readdirSync(dir).filter(f => f.endsWith('.json')).sort();
  const full = files.map(f => ({ f, j: JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) })).filter(({ j }) => isFullRun(j));
  const body = full.map(({ f, j }, i) => `## Machine ${i + 1}\n\n${summarizeFile(j)}\nRaw data: [\`${dir}/${f}\`](${dir}/${f})\n`).join('\n');
  writeFileSync('RESULTS.md', `# Results\n\n`
    + `Full runs (3 repeats) only, one section per submission. Each is valid for that machine and browser; results on other `
    + `hardware can differ, which is why more machines are welcome (see "Submit your results" in the README).\n\n`
    + `**How to read these tables:**\n`
    + `- **Max N** is the most objects at which the median frame still holds 60 fps.\n`
    + `- **Render CPU** is the time spent in the engine's own render call per object.\n`
    + `- Everything is CPU-bound unless noted.\n\n`
    + `Machine-specific effects, such as the cache wall near 64k cubes, are explained in the `
    + `[fairness notes](README.md#how-it-is-kept-fair).\n\n${body}`);
  console.log(`RESULTS.md: ${full.length} full run(s)`);
}

if (process.argv[1]?.endsWith('summary.mjs')) {
  const args = process.argv.slice(2);
  if (args.includes('--write')) writeResults();
  else if (!args.length) console.error('usage: node tools/summary.mjs results/<file>.json [...] | --write');
  else for (const f of args) console.log(summarizeFile(JSON.parse(readFileSync(f, 'utf8'))));
}
