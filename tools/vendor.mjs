// Copies pinned engine builds into vendor/ and records exact versions.
// LittleJS comes from a local checkout (LITTLEJS_DIR, default C:/dev/GitHub/LittleJS) so unreleased fixes are
// benchmarked; its commit is recorded. Published runs should point LITTLEJS_DIR at an npm release instead.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const vendor = join(root, 'vendor');
const ljs = process.env.LITTLEJS_DIR || 'C:/dev/GitHub/LittleJS';
mkdirSync(vendor, { recursive: true });

const copy = (from, to) => {
  if (!existsSync(from)) throw new Error('missing ' + from);
  copyFileSync(from, join(vendor, to));
};
const nm = p => join(root, 'node_modules', p);
const pkgVersion = p => JSON.parse(readFileSync(nm(p + '/package.json'))).version;

copy(nm('pixi.js/dist/pixi.min.mjs'), 'pixi.min.mjs');
copy(nm('three/build/three.module.js'), 'three.module.js'); // 0.186 ships no minified build
copy(nm('three/build/three.core.js'), 'three.core.js');     // three.module imports it since r171
// extended check (--extended): WebGPU Three, Phaser, PlayCanvas (ES modules) and Babylon (global script)
copy(nm('three/build/three.webgpu.js'), 'three.webgpu.js'); // imports ./three.core.js too
copy(nm('phaser/dist/phaser.esm.min.js'), 'phaser.esm.min.js');
copy(nm('playcanvas/build/playcanvas.min.mjs'), 'playcanvas.min.mjs');
copy(nm('babylonjs/babylon.js'), 'babylon.js');
// each engine's licence travels with its build (see vendor/LICENSES/README.md)
mkdirSync(join(vendor, 'LICENSES'), { recursive: true });
for (const [from, to] of [['pixi.js/LICENSE', 'pixi.js.txt'], ['three/LICENSE', 'three.txt'], ['phaser/LICENSE.md', 'phaser.txt'],
  ['playcanvas/LICENSE', 'playcanvas.txt'], ['babylonjs/license.md', 'babylonjs.txt']]) copy(nm(from), join('LICENSES', to));
// the committed build, byte for byte: the working tree copy can carry CRLF from core.autocrlf
writeFileSync(join(vendor, 'littlejs.release.js'), execSync(`git -C "${ljs}" show HEAD:dist/littlejs.release.js`, { maxBuffer: 1 << 28 }));
writeFileSync(join(vendor, 'LICENSES', 'littlejs.txt'), execSync(`git -C "${ljs}" show HEAD:LICENSE`));

const git = cmd => execSync(`git -C "${ljs}" ${cmd}`).toString().trim();
const dirty = git('status --porcelain dist');
if (dirty) console.warn('WARNING: LittleJS dist/ has uncommitted changes:\n' + dirty);

writeFileSync(join(vendor, 'versions.json'), JSON.stringify({
  littlejs: { version: JSON.parse(readFileSync(join(ljs, 'package.json'))).version,
              commit: git('rev-parse --short HEAD'), distDirty: !!dirty },
  pixi: pkgVersion('pixi.js'),
  three: pkgVersion('three'),
  phaser: pkgVersion('phaser'),
  playcanvas: pkgVersion('playcanvas'),
  babylon: pkgVersion('babylonjs'),
}, null, 2));
console.log(readFileSync(join(vendor, 'versions.json'), 'utf8'));
