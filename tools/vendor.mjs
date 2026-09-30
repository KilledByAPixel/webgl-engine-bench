// Copies pinned engine builds (and their licences) into vendor/ and records exact versions.
// Pixi, Three, Phaser, PlayCanvas and Babylon come from node_modules (versions pinned in package.json).
// LittleJS comes from a LittleJS git checkout named by LITTLEJS_DIR, so a specific commit can be benchmarked; its commit
// is recorded. Without LITTLEJS_DIR the LittleJS build already in vendor/ is kept as it is.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const vendor = join(root, 'vendor');
const ljs = process.env.LITTLEJS_DIR;
mkdirSync(join(vendor, 'LICENSES'), { recursive: true });

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

// each engine's licence travels with its build (see vendor/LICENSES/README.md); Apache-2.0 also requires Babylon's NOTICE
for (const [from, to] of [['pixi.js/LICENSE', 'pixi.js.txt'], ['three/LICENSE', 'three.txt'], ['phaser/LICENSE.md', 'phaser.txt'],
  ['playcanvas/LICENSE', 'playcanvas.txt'], ['babylonjs/license.md', 'babylonjs.txt'], ['babylonjs/NOTICE.md', 'babylonjs-NOTICE.txt']])
  copy(nm(from), join('LICENSES', to));

const versionsFile = join(vendor, 'versions.json');
let littlejs = existsSync(versionsFile) ? JSON.parse(readFileSync(versionsFile, 'utf8')).littlejs : undefined;
if (ljs) {
  // the committed build, byte for byte: the working tree copy can carry CRLF from core.autocrlf
  const git = cmd => execSync(`git -C "${ljs}" ${cmd}`, { maxBuffer: 1 << 28 });
  writeFileSync(join(vendor, 'littlejs.release.js'), git('show HEAD:dist/littlejs.release.js'));
  writeFileSync(join(vendor, 'LICENSES', 'littlejs.txt'), git('show HEAD:LICENSE'));
  const dirty = git('status --porcelain dist').toString().trim();
  if (dirty) console.warn('WARNING: LittleJS dist/ has uncommitted changes (the committed build was used):\n' + dirty);
  littlejs = { version: JSON.parse(readFileSync(join(ljs, 'package.json'))).version,
               commit: git('rev-parse --short HEAD').toString().trim(), distDirty: !!dirty };
} else console.log('LITTLEJS_DIR not set: keeping the vendored LittleJS build'
  + (littlejs ? ` (${littlejs.version} @ ${littlejs.commit})` : ''));

writeFileSync(versionsFile, JSON.stringify({
  littlejs,
  pixi: pkgVersion('pixi.js'),
  three: pkgVersion('three'),
  phaser: pkgVersion('phaser'),
  playcanvas: pkgVersion('playcanvas'),
  babylon: pkgVersion('babylonjs'),
}, null, 2));
console.log(readFileSync(versionsFile, 'utf8'));
