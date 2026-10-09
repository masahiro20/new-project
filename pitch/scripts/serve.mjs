// Minimal static server for local testing (microphone access needs localhost or https).
// Sends COOP/COEP so ONNX Runtime Web can use threads.
// Usage: node scripts/serve.mjs [port] [--root dir]   (dir relative to pitch/, e.g. --root site)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const ri = argv.indexOf('--root');
const sub = ri >= 0 ? argv.splice(ri, 2)[1] : '.';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', sub);
const port = Number(argv[0] ?? 5173);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm',
  '.onnx': 'application/octet-stream', '.svg': 'image/svg+xml', '.wav': 'audio/wav',
  '.png': 'image/png', '.webmanifest': 'application/manifest+json',
};

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  if (path === '' || path.endsWith('/')) path += 'index.html';
  const file = join(root, path);
  if (!file.startsWith(root) || /(^|[/\\])(node_modules|\.)/.test(path)) { res.writeHead(404).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cache-Control': 'no-cache', // always revalidate, so a rebuilt sw.js is picked up
    });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(port, () => console.log(`P3 Pitch (${sub}): http://localhost:${port}/`));
