# Results

Full runs (3 repeats) only, one section per submission. Each is valid for that machine and browser; results on other hardware can differ, which is why more machines are welcome (see "Submit your results" in the README).

**How to read these tables:**
- **Max N** is the most objects at which the median frame still holds 60 fps.
- **Render CPU** is the time spent in the engine's own render call per object.
- Everything is CPU-bound unless noted.

Machine-specific effects, such as the cache wall near 64k cubes, are explained in the [fairness notes](README.md#how-it-is-kept-fair).

## Machine 1

- **CPU:** Intel(R) Core(TM) i7-3770 CPU @ 3.40GHz, 8 threads, 15.9 GB RAM
- **GPU:** NVIDIA GeForce RTX 2070 SUPER (WebGPU adapter: nvidia turing)
- **OS / browser:** Windows_NT 10.0.19045 (Windows 10 Pro) / Chrome 154.0.8037.59, 60 Hz display
- **Run:** 2026-09-30, full run, 3 repeat(s), LittleJS 1.21.0 @ d1ca1c95

**sprites**

| scene | max N @60fps (median) | range | vs best | render CPU per sprite at max N |
|---|---|---|---|---|
| littlejs-gldraw | 451,696 | 451,696–479,072 | 100% | 35 ns |
| pixi-particle-webgpu | 401,508 | 401,508–410,633 | 89% | 41 ns |
| pixi-particle | 365,007 | 346,757–365,007 | 81% | 48 ns |
| littlejs | 206,837 | 200,754–206,837 | 46% | 99 ns |
| pixi-sprite | 46,866 | 45,664–49,269 | 10% | 512 ns |

**cubes**

| scene | max N @60fps (median) | range | vs best | render CPU per cube at max N |
|---|---|---|---|---|
| playcanvas-instanced | 70,298 | 66,693–72,100 | 100% | 230 ns |
| littlejs-instanced | 66,693 | 64,890–68,495 | 95% | 229 ns |
| three-instanced | 61,285 | 61,285–63,088 | 87% | 266 ns |
| littlejs | 56,479 | 34,448–57,680 | 80% | 366 ns |
| three-mesh | 5,380 | 5,222–5,538 | 8% | 4,405 ns |

Raw data: [`results/2026-09-30T13-12-04-i7-3770-rtx2070s.json`](results/2026-09-30T13-12-04-i7-3770-rtx2070s.json)
