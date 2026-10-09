// 創設サポーターキーの鍵ペアの作成・キーの発行・検証・取り消し（Node 20 以降、依存なし）。
//
//   node scripts/supporter-key.mjs init --key <秘密鍵の保存先> [--pubkey-out <公開鍵ファイル>] [--force]
//       鍵ペア（ECDSA P-256）を作る。秘密鍵は PKCS#8 PEM で、リポジトリの外の指定パスに 0600 で保存。
//       公開鍵は demo/supporter-pubkey.js（既定）に書く。リポジトリの中の保存先は拒否します。
//   node scripts/supporter-key.mjs issue --key <秘密鍵> --serial N [--date YYYY-MM-DD] [--flags N] [--pubkey <公開鍵ファイル>]
//       キーを1つ発行して標準出力に書く。公開鍵ファイルの鍵と秘密鍵が対でなければ拒否。
//   node scripts/supporter-key.mjs verify <キー> [--pubkey <公開鍵ファイル>]
//   node scripts/supporter-key.mjs revoke --serial N [--pubkey <公開鍵ファイル>]
//       取り消しリスト（REVOKED_SERIALS）に通し番号を足す。ページを再ビルドすると効きます。
//
// 運用の手順：docs/supporter-ops.md。秘密鍵は絶対にリポジトリに入れない（.gitignore にも *.pem）。
import { readFile, writeFile, stat, mkdir, open } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { webcrypto } from 'node:crypto';
import { signKey, verifyKey, isConfiguredKey, ECDSA, REASON_TEXT, localDay } from '../demo/supporter.js';

const subtle = webcrypto.subtle;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_PUBKEY = `${root}/demo/supporter-pubkey.js`;

const argv = process.argv.slice(2);
const cmd = argv.shift();
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const flag = (name) => argv.includes(name);
const die = (msg, code = 1) => { console.error(`supporter-key: ${msg}`); process.exit(code); };

// ---------- PEM ----------
const toPem = (der, label) => `-----BEGIN ${label}-----\n${Buffer.from(der).toString('base64').match(/.{1,64}/g).join('\n')}\n-----END ${label}-----\n`;
function fromPem(pem, label) {
  const m = new RegExp(`-----BEGIN ${label}-----([\\s\\S]+?)-----END ${label}-----`).exec(pem);
  if (!m) die(`not a ${label} PEM file`);
  return Buffer.from(m[1].replace(/\s+/g, ''), 'base64');
}

/** path がどこかの git 作業ツリーの中か（このリポジトリ以外も含めて拒否する）。 */
function insideGitRepo(path) {
  const rel = relative(root, path);
  if (!rel.startsWith('..') && !isAbsolute(rel)) return root;
  let dir = dirname(path);
  while (!existsSync(dir) && dirname(dir) !== dir) dir = dirname(dir); // まだない親フォルダは、ある所までさかのぼる
  try {
    return execFileSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null;
  } catch { return null; }
}

async function loadPrivate(path) {
  const st = await stat(path).catch(() => die(`private key not found: ${path}`));
  if (st.mode & 0o077) console.error(`supporter-key: WARNING ${path} is readable by others (mode ${(st.mode & 0o777).toString(8)}); run chmod 600`);
  const der = fromPem(await readFile(path, 'utf8'), 'PRIVATE KEY');
  const priv = await subtle.importKey('pkcs8', der, ECDSA, true, ['sign']);
  const jwk = await subtle.exportKey('jwk', priv);
  return { priv, pub: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y } };
}

async function loadPubkeyModule(path) {
  const p = resolve(path);
  await stat(p).catch(() => die(`public key file not found: ${p}`));
  const mod = await import(`${pathToFileURL(p).href}?t=${Date.now()}`);
  return { path: p, publicKey: mod.SUPPORTER_PUBLIC_KEY ?? null, revoked: mod.REVOKED_SERIALS ?? [] };
}

export function pubkeyModuleSource(publicKey, revoked = [], note = '') {
  return `// 創設サポーターキーの公開鍵と、取り消したキーの通し番号。
//
// scripts/supporter-key.mjs の \`init\` がこのファイルを書き、\`revoke\` が取り消しリストを更新します。
// 秘密鍵はリポジトリの外にだけ置きます（docs/supporter-ops.md）。${note ? `\n// ${note}` : ''}
// 公開鍵を null にすると「未設定」：キーは何も解除しません（fail closed）。

/** ECDSA P-256 の公開鍵（JWK: { kty: 'EC', crv: 'P-256', x, y }）。null = 未設定。 */
export const SUPPORTER_PUBLIC_KEY = ${publicKey ? JSON.stringify(publicKey) : 'null'};

/** 取り消したキーの通し番号（返金・不正な共有など）。 */
export const REVOKED_SERIALS = ${JSON.stringify(revoked)};
`;
}

// ---------- commands ----------
async function init() {
  const keyPath = opt('--key') && resolve(opt('--key'));
  if (!keyPath) die('init needs --key <path outside the repository>');
  const repo = insideGitRepo(keyPath);
  if (repo) die(`refusing to write the private key inside a git repository (${repo}). Choose a path outside it, e.g. ~/.config/p3pitch/supporter-key.pem`);
  const pubOut = resolve(opt('--pubkey-out') ?? DEFAULT_PUBKEY);
  if (await stat(keyPath).catch(() => null)) die(`${keyPath} already exists; not overwriting`);
  const existing = await stat(pubOut).then(() => loadPubkeyModule(pubOut)).catch(() => null);
  if (existing && isConfiguredKey(existing.publicKey) && !flag('--force')) {
    die(`${pubOut} already has a public key. Replacing it makes every issued key stop working; pass --force only if that is intended`);
  }
  const pair = await subtle.generateKey(ECDSA, true, ['sign', 'verify']);
  const der = new Uint8Array(await subtle.exportKey('pkcs8', pair.privateKey));
  const jwk = await subtle.exportKey('jwk', pair.publicKey);
  const publicKey = { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y };
  await mkdir(dirname(keyPath), { recursive: true, mode: 0o700 });
  const fh = await open(keyPath, 'wx', 0o600); // 既存のファイルは上書きしない
  try { await fh.writeFile(toPem(der, 'PRIVATE KEY')); } finally { await fh.close(); }
  await writeFile(pubOut, pubkeyModuleSource(publicKey, [], `作成：${localDay()}`));
  console.log(`private key: ${keyPath} (0600) — keep it outside the repository and back it up`);
  console.log(`public key:  ${pubOut}`);
}

async function issue() {
  const keyPath = opt('--key');
  const serial = Number(opt('--serial'));
  if (!keyPath || !Number.isInteger(serial) || serial < 1) die('issue needs --key <private key> --serial <N ≥ 1>');
  const date = opt('--date') ?? new Date().toISOString().slice(0, 10);
  const flags = opt('--flags') === undefined ? 1 : Number(opt('--flags'));
  const { priv, pub } = await loadPrivate(resolve(keyPath));
  const pk = await loadPubkeyModule(opt('--pubkey') ?? DEFAULT_PUBKEY);
  if (!isConfiguredKey(pk.publicKey)) die(`${pk.path} has no public key yet (run init first)`);
  if (pk.publicKey.x !== pub.x || pk.publicKey.y !== pub.y) die(`the private key does not match the public key in ${pk.path}`);
  if (pk.revoked.map(Number).includes(serial)) die(`serial ${serial} is in REVOKED_SERIALS; use a new serial`);
  const key = await signKey(priv, { serial, issued: date, flags }, subtle);
  const check = await verifyKey(key, { publicKey: pk.publicKey, revoked: pk.revoked, subtle });
  if (!check.ok) die(`self-check failed: ${check.reason}`);
  console.log(key);
  console.error(`supporter-key: issued serial ${serial}, date ${date}, flags ${flags}`);
}

async function verify() {
  const input = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1] === '--pubkey')).join(' ');
  if (!input.trim()) die('verify needs a key');
  const pk = await loadPubkeyModule(opt('--pubkey') ?? DEFAULT_PUBKEY);
  const r = await verifyKey(input, { publicKey: pk.publicKey, revoked: pk.revoked, subtle });
  if (r.ok) {
    console.log(`OK serial=${r.serial} issued=${r.issued} flags=${r.flags} version=${r.version}`);
  } else {
    console.log(`NG ${r.reason}${r.serial ? ` serial=${r.serial}` : ''} — ${REASON_TEXT[r.reason] ?? ''}`);
    process.exit(2);
  }
}

async function revoke() {
  const serial = Number(opt('--serial'));
  if (!Number.isInteger(serial) || serial < 1) die('revoke needs --serial <N ≥ 1>');
  const pk = await loadPubkeyModule(opt('--pubkey') ?? DEFAULT_PUBKEY);
  const src = await readFile(pk.path, 'utf8');
  if (pk.revoked.map(Number).includes(serial)) { console.log(`serial ${serial} is already revoked`); return; }
  const list = [...pk.revoked.map(Number), serial].sort((a, b) => a - b);
  const next = src.replace(/export const REVOKED_SERIALS = \[[^\]]*\];/, `export const REVOKED_SERIALS = ${JSON.stringify(list)};`);
  if (next === src) die(`could not find REVOKED_SERIALS in ${pk.path}`);
  await writeFile(pk.path, next);
  console.log(`revoked serial ${serial} in ${pk.path} — rebuild and publish the page (npm run build:demo && npm run build:pwa)`);
}

const cmds = { init, issue, verify, revoke };
if (!cmds[cmd]) die('usage: supporter-key.mjs init|issue|verify|revoke … (see the header of this file)');
await cmds[cmd]();
