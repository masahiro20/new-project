// Copy the browser-side libraries into vendor/ so the demo runs from a plain
// static server without a bundler. Run after `npm install`.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = (p) => join(root, 'node_modules', p);
const out = (p) => join(root, 'vendor', p);
mkdirSync(out(''), { recursive: true });

// pitchy is already an ES module; fft.js is resolved through the import map.
copyFileSync(nm('pitchy/index.js'), out('pitchy.js'));
copyFileSync(nm('pitchy/LICENSE'), out('pitchy.LICENSE'));

// fft.js ships CommonJS only — wrap it as an ES module.
const fft = readFileSync(nm('fft.js/lib/fft.js'), 'utf8');
writeFileSync(out('fft.js'), `// fft.js ${JSON.parse(readFileSync(nm('fft.js/package.json'))).version} (MIT, Fedor Indutny), wrapped as ESM by scripts/vendor.mjs\nconst module = { exports: {} };\n${fft}\nexport default module.exports;\n`);
console.log('vendored pitchy + fft.js');
writeFileSync(out('fft.LICENSE'), `fft.js — https://github.com/indutny/fft.js
License: MIT (as declared in its package.json; the npm package ships no LICENSE file)

Copyright Fedor Indutny

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
`);
