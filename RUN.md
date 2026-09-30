# Running the WebGL Engine Benchmark

This document describes how to run the benchmark on an idle machine.

## What it does and how long

The benchmark runs 10 scenes (LittleJS against Pixi, including Pixi ParticleContainer on WebGPU, and against Three and PlayCanvas instancing) in a headed Chrome window, measuring how many objects each engine can draw while keeping 60 fps. It ramps the object count from 1,000 upward by 1.5× per level, then bisects 4 times around the threshold to narrow down the maximum count. Each scene runs 3 repeats (configurable). **Expect about 35–40 minutes for a full run.** A quick rough check takes about 5 minutes (see Run).

Output: `results/<YYYY-MM-DDTHH-MM-SS>[-<label>].json` (local start time, so a rerun never overwrites an earlier file; full measurement data, the reliable output) plus, in the terminal, one line per scene as it finishes and an aligned summary table at the end. The file is rewritten after every scene with `"complete": false`, so a crash, Ctrl+C or disconnect keeps everything measured so far; the last write sets `"complete": true`. Check that field before trusting a file as a full run.

## One-time setup

```bash
npm install
```

Install Playwright's Chromium **even if Chrome is installed**. `npm run verify` and the `*.pw.mjs` tests always use it; only `npm run bench` prefers installed Chrome and falls back to Chromium if Chrome is missing:

```bash
npx playwright install chromium
```

The JSON output records which browser was used in the `channel` field. Node 21 or newer is required.

## Optional: benchmark the latest LittleJS

Currently vendored: LittleJS 1.20.0 @ 614e1243 (see `vendor/versions.json`).

To update from a local checkout, ensure `dist/littlejs.release.js` is rebuilt and committed, then set `LITTLEJS_DIR`:

PowerShell:
```powershell
$env:LITTLEJS_DIR = "C:/path/to/LittleJS"; npm run vendor
```

Bash:
```bash
LITTLEJS_DIR=/c/path/to/LittleJS npm run vendor
```

If `LITTLEJS_DIR` is not set, the LittleJS build already in `vendor/` is kept and only the other engines are refreshed.

Verify the vendored files:

```bash
npm test
npm run verify
```

The `verify` command must print "all checks passed". Commit the updated vendor files before benchmarking.

## Before you run: idle-machine checklist

- Close other heavy applications, games, video streams, browsers with busy tabs, and any background jobs doing GPU or CPU work (e.g., video renders, builds)
- Plug in your machine and set power plan to high performance
- Set your monitor to its native refresh rate
- **Do not move, cover, or minimize the Chrome window** while the benchmark runs (a hidden window stops rendering)
- **Keep the display awake for the whole run.** Display-off, sleep, the screen saver and the lock screen all stall `requestAnimationFrame`, so every remaining scene would hit the watchdog and record an error. Note your current settings first (or read them with `powercfg /query SCHEME_CURRENT SUB_VIDEO VIDEOIDLE` for the display timeout and `powercfg /query SCHEME_CURRENT SUB_SLEEP STANDBYIDLE` for sleep; the "Current AC Power Setting Index" is in seconds), then turn the timeouts off (0 means never), each in its own PowerShell block:

  ```powershell
  powercfg /change monitor-timeout-ac 0
  ```

  ```powershell
  powercfg /change standby-timeout-ac 0
  ```

  Also turn off the screen saver and any auto-lock (Settings > Personalization > Lock screen > Screen saver settings; untick "On resume, display logon screen"). **After the run, restore your usual values** (for example `powercfg /change monitor-timeout-ac 10` and `powercfg /change standby-timeout-ac 30`, in minutes) and re-enable the screen saver.
- Pause Windows Update (Settings > Windows Update > Pause updates) and avoid starting a Defender full scan during the run
- Optional: in the NVIDIA Control Panel, set "Power management mode" to "Prefer maximum performance" for Chrome (Manage 3D settings > Program Settings), so the GPU clock doesn't ramp mid-run

If any frame interval exceeds 250 ms (indicating throttle or hidden window), that level is retried up to 3 times. After 3 failed attempts or 15 minutes without a result, the scene records an error and the run continues.

## Run

### Quick rough check first (about 5–6 minutes)

Same 10 scenes and the same pass rule, but a coarser search (the object count doubles each level, then 3 bisection steps), 20 warm-up and 60 measured frames per level instead of 60 and 120, and 1 repeat. Max N lands within roughly ±10% instead of about ±3%, and one repeat gives no range. That is enough to see whether LittleJS is on par or clearly behind, not to publish. The same idle-machine checklist applies.

```bash
npm run bench:quick
```

The file is named `results/<timestamp>[-<label>]-quick.json` and has `"quick": true`, and the table is captioned "Quick mode: rough numbers". By hand: tick **quick rough check** on the page (it sets repeats to 1).

### Extended check: other engines and WebGPU

Adds the scenes that did not make the main suite: Pixi Sprite on WebGPU, Phaser 4 (its normal Image path and its fastest documented path, SpriteGPULayer), Babylon.js (cubes: `createInstance` and thin instances), PlayCanvas one entity per cube, and Three on its WebGPU renderer (both cube scenes). The main suite already includes the two strongest challengers from the first extended run: Pixi ParticleContainer on WebGPU and PlayCanvas hardware instancing. Quick mode with everything in takes about 8–10 minutes:

```bash
npm run bench:quick -- --extended
```

The file gets an `-ext` suffix. By hand: tick **extended** on the page. `node tools/verify.mjs --extended` checks the extra scenes the same way as the main ones.

### Full run

Start the benchmark:

```bash
npm run bench
```

To run just one test, for example 1 repeat of sprites only:

```bash
node tools/run.mjs --repeats 1 --tests sprites
```

Smoke test of the whole pipeline (browser launch, runner, results file with partial saves) without benchmarking any engine; it runs only the trivial `null` and `throws` fixture scenes and writes a `*-fixtures.json` file:

```bash
node tools/run.mjs --fixtures --repeats 1
```

## By hand (any browser)

If you prefer to run it manually in any browser:

```bash
npm run serve
```

Open http://localhost:8121 in a browser. Keep the tab visible, click **Run**, and click **Download JSON** when done.

## Understanding the results

A level passes when the median frame interval stays ≤ max(17.5 ms, 1.5 × the display's refresh period). With vsync, intervals snap to refresh multiples, so the budget is the larger of 17.5 ms and 1.5 × the refresh period. On a 60 Hz display it is 25 ms: the median passes if at least half the frames make every refresh (16.7 ms steps). On 120 Hz, 17.5 ms means a 60 fps median (steps of 8.3 and 16.7 ms). On 144 Hz, 17.5 ms means at least 72 fps (steps of 13.9 ms). Variable-refresh (VRR) displays behave closer to the raw 17.5 ms threshold. The bisection over 4 steps makes max N approximate, not exact. Counts at or above 2,000,000 are capped (shown with a "+").

The summary table shows:

- **max N @60fps (median)** — most objects at which the median frame still holds the display rate; median of repeats, with min–max range
- **vs best** — percentage of the best scene in that test
- **ms/frame @ ref N** — median frame interval at reference count (20,000 sprites or 5,000 cubes), quantized to vsync
- **render CPU ms @ ref N** — CPU time for the synchronous `scene.frame()` call on the main thread; measures CPU-bound cost but not GPU-side time (which shows up only in max N and ms/frame)
- **shared sim ms @ ref N** — simulation cost identical across all engines

Note: current Chrome enforces vsync on all measurements.

## After the run

Check that the file says `"complete": true`. Then share it: print a summary to paste into a **Submit results** issue, and attach the file there:

```bash
npm run summary -- results/<your-file>.json
```

Or open a pull request that adds the file to `results/` and regenerates `RESULTS.md`:

```bash
npm run results
```

Add `--label <name>` to `npm run bench` to put a machine label in the file name. The hostname is never recorded.
