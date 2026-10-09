import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Glossary } from "../core/types.js";
import { envVar } from "./env.js";

/**
 * Hosted glossaries. Scripts are never stored; glossaries are, because sharing one glossary across a
 * team is the point of the paid plan. Everything at rest is AES-256-GCM encrypted, including the
 * glossary name. Owners and names appear on disk only as SHA-256 hashes.
 *
 * The store is an interface so the local file backend can later be swapped for a database or object
 * storage without touching the MCP tools.
 */
export interface StoredGlossaryMeta {
  name: string;
  terms: number;
  characters: number;
  updatedAt: string;
}

export interface GlossaryStore {
  put(owner: string, name: string, glossary: Glossary): Promise<StoredGlossaryMeta>;
  get(owner: string, name: string): Promise<Glossary | undefined>;
  list(owner: string): Promise<StoredGlossaryMeta[]>;
  delete(owner: string, name: string): Promise<boolean>;
  /** Remove every glossary of an owner (account deletion). Returns how many were removed. */
  deleteAll(owner: string): Promise<number>;
}

export const STORE_LIMITS = { maxNameLength: 64, maxBytes: 2_000_000 };

export function validateName(name: string): string {
  const n = name.trim();
  if (!n || n.length > STORE_LIMITS.maxNameLength || /[\u0000-\u001f]/.test(n)) {
    throw new Error(`Glossary name must be 1–${STORE_LIMITS.maxNameLength} printable characters`);
  }
  return n;
}

const meta = (name: string, g: Glossary, updatedAt: string): StoredGlossaryMeta => ({
  name, terms: g.terms.length, characters: g.characters.length, updatedAt,
});

/** In-memory backend for tests and throwaway dev runs. */
export class MemoryGlossaryStore implements GlossaryStore {
  private data = new Map<string, Map<string, { g: Glossary; updatedAt: string }>>();
  async put(owner: string, name: string, g: Glossary) {
    const n = validateName(name);
    const updatedAt = new Date().toISOString();
    const m = this.data.get(owner) ?? new Map();
    m.set(n, { g: structuredClone(g), updatedAt });
    this.data.set(owner, m);
    return meta(n, g, updatedAt);
  }
  async get(owner: string, name: string) {
    const e = this.data.get(owner)?.get(name.trim());
    return e ? structuredClone(e.g) : undefined;
  }
  async list(owner: string) {
    return [...(this.data.get(owner) ?? new Map<string, { g: Glossary; updatedAt: string }>())].map(([n, e]) => meta(n, e.g, e.updatedAt));
  }
  async delete(owner: string, name: string) {
    return this.data.get(owner)?.delete(name.trim()) ?? false;
  }
  async deleteAll(owner: string) {
    const n = this.data.get(owner)?.size ?? 0;
    this.data.delete(owner);
    return n;
  }
}

const MAGIC = Buffer.from("YG1");
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** Local-disk backend: <dir>/<sha(owner)>/<sha(name)>.yg, each file encrypted separately. */
export class FileGlossaryStore implements GlossaryStore {
  constructor(private dir: string, private key: Buffer) {
    if (key.length !== 32) throw new Error("Encryption key must be 32 bytes");
  }

  private paths(owner: string, name: string) {
    const o = sha(`owner:${owner}`);
    const n = sha(`name:${name}`);
    return { ownerDir: join(this.dir, o), file: join(this.dir, o, `${n}.yg`), aad: Buffer.from(`${o}/${n}`) };
  }

  private encrypt(plain: Buffer, aad: Buffer): Buffer {
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", this.key, iv);
    c.setAAD(aad);
    const body = Buffer.concat([c.update(plain), c.final()]);
    return Buffer.concat([MAGIC, iv, c.getAuthTag(), body]);
  }

  private decrypt(blob: Buffer, aad: Buffer): Buffer {
    if (!blob.subarray(0, 3).equals(MAGIC)) throw new Error("Unknown glossary file format");
    const d = createDecipheriv("aes-256-gcm", this.key, blob.subarray(3, 15));
    d.setAAD(aad);
    d.setAuthTag(blob.subarray(15, 31));
    return Buffer.concat([d.update(blob.subarray(31)), d.final()]);
  }

  async put(owner: string, name: string, g: Glossary) {
    const n = validateName(name);
    const updatedAt = new Date().toISOString();
    const plain = Buffer.from(JSON.stringify({ name: n, updatedAt, glossary: g }));
    if (plain.length > STORE_LIMITS.maxBytes) throw new Error(`Glossary too large (max ${STORE_LIMITS.maxBytes} bytes)`);
    const { ownerDir, file, aad } = this.paths(owner, n);
    await mkdir(ownerDir, { recursive: true, mode: 0o700 });
    const tmp = `${file}.${randomBytes(4).toString("hex")}.tmp`;
    await writeFile(tmp, this.encrypt(plain, aad), { mode: 0o600 });
    await rename(tmp, file);
    return meta(n, g, updatedAt);
  }

  private async readEntry(owner: string, name: string): Promise<{ name: string; updatedAt: string; glossary: Glossary } | undefined> {
    const { file, aad } = this.paths(owner, name);
    let blob: Buffer;
    try {
      blob = await readFile(file);
    } catch {
      return undefined;
    }
    return JSON.parse(this.decrypt(blob, aad).toString("utf8"));
  }

  async get(owner: string, name: string) {
    return (await this.readEntry(owner, name.trim()))?.glossary;
  }

  async list(owner: string) {
    const { ownerDir } = this.paths(owner, "");
    let files: string[];
    try {
      files = (await readdir(ownerDir)).filter((f) => f.endsWith(".yg"));
    } catch {
      return [];
    }
    const out: StoredGlossaryMeta[] = [];
    for (const f of files) {
      try {
        const blob = await readFile(join(ownerDir, f));
        const aad = Buffer.from(`${sha(`owner:${owner}`)}/${f.slice(0, -3)}`);
        const e = JSON.parse(this.decrypt(blob, aad).toString("utf8")) as { name: string; updatedAt: string; glossary: Glossary };
        out.push(meta(e.name, e.glossary, e.updatedAt));
      } catch (err) {
        // B-15: one unreadable file (wrong key, corruption) must not break listing or account deletion. It still counts
        // towards the plan's glossary limit.
        console.error(`glossary store: cannot read ${f.slice(0, 12)}… (${(err as Error).message})`);
        out.push({ name: `(unreadable ${f.slice(0, 8)})`, terms: 0, characters: 0, updatedAt: "" });
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  async delete(owner: string, name: string) {
    const { file } = this.paths(owner, name.trim());
    if (!existsSync(file)) return false;
    await rm(file);
    return true;
  }

  async deleteAll(owner: string) {
    const { ownerDir } = this.paths(owner, "");
    let n = 0;
    try {
      n = (await readdir(ownerDir)).filter((f) => f.endsWith(".yg")).length;
    } catch {
      return 0;
    }
    await rm(ownerDir, { recursive: true, force: true }); // B-15: delete first; never depends on decrypting
    return n;
  }
}

/**
 * Pick the backend from the environment:
 *  - KOTOMARK_ENCRYPTION_KEY (base64, 32 bytes) → file store in KOTOMARK_DATA_DIR (default ./.kotomark-data)
 *  - no key, development → file store with a generated key saved next to the data (never in production)
 *  - no key, production → refuse to start
 */
export function storeFromEnv(env = process.env): GlossaryStore {
  const dir = join(envVar("DATA_DIR", env) ?? ".kotomark-data", "glossaries");
  const keyB64 = envVar("ENCRYPTION_KEY", env);
  let key = keyB64 ? Buffer.from(keyB64, "base64") : undefined;
  if (!key) {
    if (env.NODE_ENV === "production") throw new Error("KOTOMARK_ENCRYPTION_KEY must be set in production");
    const keyFile = join(envVar("DATA_DIR", env) ?? ".kotomark-data", "dev.key");
    mkdirSync(join(keyFile, ".."), { recursive: true, mode: 0o700 });
    if (!existsSync(keyFile)) writeFileSync(keyFile, randomBytes(32).toString("base64"), { mode: 0o600 });
    key = Buffer.from(readFileSync(keyFile, "utf8").trim(), "base64");
  }
  return new FileGlossaryStore(dir, key);
}
