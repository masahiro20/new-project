// Copy the onnxruntime-web files needed for the plain-wasm (CPU) backend into vendor/ort/.
// Usage: npm install && node scripts/vendor-ort.mjs
//
// Browser usage from a static server:
//   import * as ort from '../vendor/ort/ort.wasm.min.mjs';
//   ort.env.wasm.wasmPaths = new URL('../vendor/ort/', import.meta.url).href;
//   // multi-threading needs cross-origin isolation (COOP/COEP); otherwise set numThreads = 1
//   if (!self.crossOriginIsolated) ort.env.wasm.numThreads = 1;
//
// ort.wasm.min.mjs loads ort-wasm-simd-threaded.mjs, which loads ort-wasm-simd-threaded.wasm.
// (The default ort.min.mjs entry would instead pull the ~28 MB JSEP/WebGPU wasm.)
import { copyFileSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'package.json'));
// package.json is not in the package's "exports"; resolve an exported dist file instead.
const dist = dirname(require.resolve('onnxruntime-web/ort-wasm-simd-threaded.wasm'));
const { version } = JSON.parse(readFileSync(join(dist, '..', 'package.json'), 'utf8'));
const out = join(root, 'vendor', 'ort');

const FILES = ['ort.wasm.min.mjs', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm'];

mkdirSync(out, { recursive: true });
let total = 0;
for (const f of FILES) {
  copyFileSync(join(dist, f), join(out, f));
  const size = statSync(join(out, f)).size;
  total += size;
  console.log(`${f.padEnd(32)} ${(size / 1e6).toFixed(2)} MB`);
}
console.log(`onnxruntime-web@${version} -> vendor/ort/ (${(total / 1e6).toFixed(2)} MB total)`);
console.log('License: vendor/ort/LICENSE (MIT, microsoft/onnxruntime).');
