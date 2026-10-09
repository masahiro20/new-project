// 創設サポーターキーの「テスト用の鍵の生成・発行」と「公開してよい値の確認」（Node 20 以降）。
//
// 本番のキーを発行する道具はこのリポジトリに置きません（Atlas REPORT §5-8、docs/decisions.md）。
// 本番の秘密鍵はオーナーの端末で作り、オーナーの端末の外に出しません（docs/supporter-ops.md）。
// このスクリプトは本番の秘密鍵を読みません（PRIVATE KEY の PEM は読まずに拒否します）。
//
//   node scripts/supporter-key.mjs test-init --out <scratch のフォルダ> [--kid 240〜254]
//       テスト用の鍵ペアを作る：<out>/test-seed.json（0600）と <out>/test-pubkey.js（SUPPORTER_PUBKEY 用）。
//       git の作業ツリーの中には書きません。kid はテスト用の範囲（240〜254）だけ。
//   node scripts/supporter-key.mjs test-issue --seed <test-seed.json> --pubkey <test-pubkey.js> [--lid <32桁の16進>] [--plan 1] [--iat YYYY-MM-DD]
//       テスト用のキーを1つ発行して標準出力に書く。テスト用の kid の鍵でなければ、または本番の一覧
//       （demo/supporter-pubkey.js）にある公開鍵なら拒否します。
//   node scripts/supporter-key.mjs test-revoke --lid <32桁の16進> --pubkey <test-pubkey.js>
//       テスト用の公開鍵ファイルの REVOKED_LIDS に足す（demo/supporter-pubkey.js は書き換えません）。
//   node scripts/supporter-key.mjs verify <キー> [--pubkey <公開鍵ファイル>]
//       キーを検証する（既定は本番の一覧）。OK なら kid・lid・plan・iat・短い表示を出す（問い合わせの確認用）。
//   node scripts/supporter-key.mjs pubkey-hex <公開鍵の PEM>
//       オーナーから受け取った公開鍵（-----BEGIN PUBLIC KEY-----）を、SUPPORTER_KEYS に書く16進にする。
//   node scripts/supporter-key.mjs fingerprint [--pubkey <公開鍵ファイル>]
//       公開鍵の一覧の指紋（SHA-256）。オーナーが手元で計算した値と照合する。
import { readFile, writeFile, stat, mkdir, open } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { generateKeyPairSync, createPublicKey } from 'node:crypto';
import { verifyKey, validateKeyList, keysFingerprint, isTestKid, TEST_KID_MIN, TEST_KID_MAX, REASON_TEXT } from '../demo/supporter.js';
import { signKey, pubHex } from './supporter-sign.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROD_PUBKEY = `${root}/demo/supporter-pubkey.js`;

const argv = process.argv.slice(2);
const cmd = argv.shift();
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const positional = () => argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
const die = (msg, code = 1) => { console.error(`supporter-key: ${msg}`); process.exit(code); };

/** path がどこかの git 作業ツリーの中か。 */
function insideGitRepo(path) {
  const rel = relative(root, path);
  if (!rel.startsWith('..') && !isAbsolute(rel)) return root;
  let dir = dirname(path);
  while (!existsSync(dir) && dirname(dir) !== dir) dir = dirname(dir);
  try {
    return execFileSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null;
  } catch { return null; }
}

async function loadKeyModule(path) {
  const p = resolve(path);
  await stat(p).catch(() => die(`public key file not found: ${p}`));
  const mod = await import(`${pathToFileURL(p).href}?t=${Date.now()}`);
  return { path: p, keys: mod.SUPPORTER_KEYS ?? [], retired: mod.RETIRED_KIDS ?? [], revoked: mod.REVOKED_LIDS ?? [] };
}

export function keyModuleSource({ keys, retired = [], revoked = [] }, note = '') {
  return `// テスト用の創設サポーターの公開鍵（scripts/supporter-key.mjs test-init）。公開物には入れない。${note ? `\n// ${note}` : ''}
export const SUPPORTER_KEYS = ${JSON.stringify(keys)};
export const RETIRED_KIDS = ${JSON.stringify(retired)};
export const REVOKED_LIDS = ${JSON.stringify(revoked)};
`;
}

// ---------- commands ----------
async function testInit() {
  const out = opt('--out') && resolve(opt('--out'));
  if (!out) die('test-init needs --out <scratch folder outside the repository>');
  const repo = insideGitRepo(join(out, 'x'));
  if (repo) die(`refusing to write test keys inside a git repository (${repo}); use a scratch folder`);
  const kid = opt('--kid') === undefined ? TEST_KID_MIN : Number(opt('--kid'));
  if (!isTestKid(kid)) die(`test keys must use kid ${TEST_KID_MIN}…${TEST_KID_MAX}`);
  const seedPath = join(out, 'test-seed.json');
  const pubPath = join(out, 'test-pubkey.js');
  if (existsSync(seedPath)) die(`${seedPath} already exists; not overwriting`);
  const { privateKey } = generateKeyPairSync('ed25519');
  const jwk = privateKey.export({ format: 'jwk' });
  const seed = Buffer.from(jwk.d, 'base64url');
  const pub = Buffer.from(jwk.x, 'base64url').toString('hex');
  if (pub !== await pubHex(seed)) die('internal: public key mismatch');
  await mkdir(out, { recursive: true, mode: 0o700 });
  const fh = await open(seedPath, 'wx', 0o600);
  try { await fh.writeFile(`${JSON.stringify({ test: true, kid, seed: seed.toString('hex') })}\n`); } finally { await fh.close(); }
  const list = { keys: [{ kid, pub }], retired: [], revoked: [] };
  const errs = validateKeyList(list, { test: true });
  if (errs.length) die(errs.join('; '));
  await writeFile(pubPath, keyModuleSource(list));
  console.log(`test seed:   ${seedPath} (0600, TEST ONLY)`);
  console.log(`test pubkey: ${pubPath} (build with SUPPORTER_PUBKEY=${pubPath})`);
}

async function testIssue() {
  const seedFile = opt('--seed');
  const pubFile = opt('--pubkey');
  if (!seedFile || !pubFile) die('test-issue needs --seed <test-seed.json> --pubkey <test-pubkey.js>');
  const j = JSON.parse(await readFile(resolve(seedFile), 'utf8'));
  if (j.test !== true || !isTestKid(j.kid) || !/^[0-9a-f]{64}$/.test(j.seed ?? '')) die('not a test seed file (test-init makes them)');
  const seed = Buffer.from(j.seed, 'hex');
  const pub = await pubHex(seed);
  const prod = await loadKeyModule(PROD_PUBKEY);
  if (prod.keys.some((k) => k.pub === pub)) die('this key is in the production list; production keys are issued only on the owner\'s machine');
  const pk = await loadKeyModule(pubFile);
  if (resolve(pubFile) === PROD_PUBKEY) die('test-issue never uses demo/supporter-pubkey.js');
  const errs = validateKeyList(pk, { test: true });
  if (errs.length) die(`${pk.path}: ${errs.join('; ')}`);
  if (!pk.keys.some((k) => k.kid === j.kid && k.pub === pub)) die(`${pk.path} has no kid ${j.kid} with this public key`);
  const iat = opt('--iat') ?? new Date().toISOString().slice(0, 10);
  const plan = opt('--plan') === undefined ? 1 : Number(opt('--plan'));
  const fields = { kid: j.kid, plan, iat };
  if (opt('--lid')) fields.lid = opt('--lid');
  const key = await signKey(seed, fields);
  const check = await verifyKey(key, pk);
  if (!check.ok && !(check.reason === 'revoked' || check.reason === 'plan')) die(`self-check failed: ${check.reason}`);
  console.log(key);
  console.error(`supporter-key: TEST key kid=${j.kid} lid=${check.lid ?? fields.lid} plan=${plan} iat=${iat}`);
}

async function testRevoke() {
  const lid = opt('--lid');
  const pubFile = opt('--pubkey');
  if (!/^[0-9a-f]{32}$/.test(lid ?? '') || !pubFile) die('test-revoke needs --lid <32 hex> --pubkey <test-pubkey.js>');
  if (resolve(pubFile) === PROD_PUBKEY) die('test-revoke never edits demo/supporter-pubkey.js (edit it by hand with review)');
  const pk = await loadKeyModule(pubFile);
  if (validateKeyList(pk, { test: true }).length) die(`${pk.path} is not a test key list`);
  if (!pk.revoked.includes(lid)) pk.revoked.push(lid);
  await writeFile(pk.path, keyModuleSource(pk));
  console.log(`revoked lid ${lid} in ${pk.path}`);
}

async function verify() {
  const input = positional().join(' ');
  if (!input.trim()) die('verify needs a key');
  const pk = await loadKeyModule(opt('--pubkey') ?? PROD_PUBKEY);
  const r = await verifyKey(input, pk);
  if (r.ok) {
    console.log(`OK kid=${r.kid} lid=${r.lid} plan=${r.plan} iat=${r.iat} short=${r.short} path=${r.path}`);
  } else {
    console.log(`NG ${r.reason}${r.short ? ` short=${r.short}` : ''} — ${REASON_TEXT[r.reason] ?? ''}`);
    process.exit(2);
  }
}

async function pubkeyHex() {
  const file = positional()[0];
  if (!file) die('pubkey-hex needs <public key PEM>');
  const text = await readFile(resolve(file), 'utf8');
  if (/PRIVATE KEY/.test(text)) die('this is a PRIVATE key. Never send or copy it; give only the PUBLIC KEY file (see docs/supporter-ops.md)');
  if (!/-----BEGIN PUBLIC KEY-----/.test(text)) die('not a PUBLIC KEY PEM file');
  const key = createPublicKey(text);
  if (key.asymmetricKeyType !== 'ed25519') die(`not an Ed25519 key (${key.asymmetricKeyType})`);
  console.log(Buffer.from(key.export({ format: 'jwk' }).x, 'base64url').toString('hex'));
}

async function fingerprint() {
  const pk = await loadKeyModule(opt('--pubkey') ?? PROD_PUBKEY);
  const test = resolve(pk.path) !== PROD_PUBKEY && pk.keys.length > 0 && pk.keys.every((k) => isTestKid(k.kid));
  const errs = validateKeyList(pk, { test });
  if (errs.length) die(`${pk.path}: ${errs.join('; ')}`);
  console.log(`${await keysFingerprint(pk.keys)}  (${pk.keys.length} key(s): ${pk.keys.map((k) => k.kid).join(', ') || 'none'})`);
}

const cmds = { 'test-init': testInit, 'test-issue': testIssue, 'test-revoke': testRevoke, verify, 'pubkey-hex': pubkeyHex, fingerprint };
if (!cmds[cmd]) die('usage: supporter-key.mjs test-init|test-issue|test-revoke|verify|pubkey-hex|fingerprint … (see the header of this file)');
await cmds[cmd]();
