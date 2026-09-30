// Benchmark run in headed Chrome, vsync on (current Chrome ignores --disable-gpu-vsync and --disable-frame-rate-limit).
// Writes results/<YYYY-MM-DDTHH-MM-SS>[-<label>].json (local time), rewritten after every scene with complete:false,
// and finally with complete:true, so a crash or Ctrl+C keeps everything measured so far.
// Usage: node tools/run.mjs [--quick] [--extended] [--repeats 3] [--tests sprites,cubes] [--fixtures]
//   --extended: also run the other engines (Phaser, Babylon, PlayCanvas) and Pixi/Three on WebGPU
//   --quick: ~5 minute rough check (coarser search, fewer frames, 1 repeat unless --repeats is given)
//   --label <name>: a short machine label for the file name, e.g. --label m2-air (the hostname is never recorded)
//   --fixtures: smoke-test the pipeline on the null/throws fixture scenes (no engine is benchmarked)
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { cpus, totalmem, type, release, version } from 'node:os';
import { startServer } from './serve.mjs';
import { formatTable, formatRun } from './table.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const fixtures = process.argv.includes('--fixtures'), quick = process.argv.includes('--quick'), extended = process.argv.includes('--extended');
const repeats = +arg('repeats', quick ? 1 : 3), tests = fixtures ? ['_fixtures'] : arg('tests')?.split(',');
const server = await startServer(8124);
const args = [];
// prefer installed Chrome (what users run); fall back to Playwright's Chromium
let channel = 'chrome';
const browser = await chromium.launch({ headless: false, channel, args })
  .catch(e => { channel = 'chromium'; console.warn('installed Chrome unavailable, falling back to Playwright Chromium: ' + e.message.split('\n')[0]); return chromium.launch({ headless: false, args }); });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
page.setDefaultTimeout(0);

const now = new Date(), p = n => String(n).padStart(2, '0');
const stamp = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}T${p(now.getHours())}-${p(now.getMinutes())}-${p(now.getSeconds())}`;
mkdirSync('results', { recursive: true });
const label = arg('label')?.replace(/[^\w.-]/g, '_');   // results are shared publicly: never the hostname
const file = `results/${stamp}${label ? '-' + label : ''}${quick ? '-quick' : ''}${extended ? '-ext' : ''}${fixtures ? '-fixtures' : ''}.json`;
const header = {
  mode: 'vsync', quick, extended, channel, browser: browser.version(), startedAt: now.toISOString(), repeats, tests: tests ?? 'all',
  host: { cpu: cpus()[0]?.model, cores: cpus().length, ramGB: +(totalmem() / 2 ** 30).toFixed(1),
    os: `${type()} ${release()} (${version()})`, node: process.version },
};
const save = body => writeFileSync(file, JSON.stringify({ ...header, ...body }, null, 2));
await page.exposeFunction('benchProgress', runs => {
  save({ complete: false, runs });
  console.log(formatRun(runs[runs.length - 1]));   // one line as each scene finishes
});
console.log('results file: ' + file);

try {
  await page.goto('http://localhost:8124/index.html' + (fixtures ? '?fixtures=1' : ''));
  const out = await page.evaluate(o => window.runSuite(o), { tests, repeats, quick, extended });
  save({ ...out, complete: true });
  console.log('wrote ' + file);
  console.log();
  console.log(formatTable(out.runs, { quick }));
  if (!quick && !fixtures) console.log(`\nTo share these results: npm run summary -- ${file}\n`
    + 'then paste the output into a "Submit results" issue and attach the file (see README).');
} finally { await browser.close(); server.close(); }
