// The public Action folder must never carry the license issuance tool, signing code or private keys (0008, F-04).
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { EXPECTED, guardReleaseFolder, scanText } from "../scripts/release-guard.mjs";

const root = new URL("..", import.meta.url).pathname;

function cleanFolder(): string {
  const dir = mkdtempSync(join(tmpdir(), "kotomark-guard-"));
  for (const f of EXPECTED as string[]) {
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    writeFileSync(join(dir, f), f === "dist/kotomark.mjs" ? readFileSync(join(root, "action", "dist", "kotomark.mjs")) : `${f}\n`);
  }
  return dir;
}
const problems = (dir: string) => guardReleaseFolder(dir) as string[];

test("release guard: a clean folder with the real bundle passes", () => {
  const dir = cleanFolder();
  assert.deepEqual(problems(dir), []);
  rmSync(dir, { recursive: true });
});

test("release guard: scripts/license-issue.mjs fails the check, as an extra file or pasted into a shipped file", () => {
  const issuer = readFileSync(join(root, "scripts", "license-issue.mjs"), "utf8");
  let dir = cleanFolder();
  mkdirSync(join(dir, "scripts"));
  cpSync(join(root, "scripts", "license-issue.mjs"), join(dir, "scripts", "license-issue.mjs"));
  const p = problems(dir);
  assert.ok(p.some((x) => x.startsWith("unexpected file list")));
  assert.ok(p.some((x) => /scripts\/license-issue\.mjs: signing tool or key file/.test(x)));
  assert.ok(p.some((x) => /license issuance tool/.test(x)));
  rmSync(dir, { recursive: true });

  dir = cleanFolder();
  writeFileSync(join(dir, "dist", "kotomark.mjs"), `${readFileSync(join(dir, "dist", "kotomark.mjs"), "utf8")}\n${issuer}`);
  const q = problems(dir);
  assert.ok(q.some((x) => /^dist\/kotomark\.mjs: key-pair generation or signing-key handling code/.test(x)), q.join("\n"));
  assert.ok(q.some((x) => /an ed25519 signing call/.test(x)));
  rmSync(dir, { recursive: true });
});

test("release guard: private keys fail the check in every encoding (PEM, bare PKCS#8 base64 / hex, JWK)", () => {
  const { privateKey } = generateKeyPairSync("ed25519");
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const der = privateKey.export({ type: "pkcs8", format: "der" });
  const jwk = JSON.stringify(privateKey.export({ format: "jwk" }));
  for (const [what, text] of [["PEM", pem], ["base64", der.toString("base64")], ["hex", der.toString("hex")], ["JWK", jwk]] as const) {
    assert.ok((scanText("README.md", `notes\n${text}\n`) as string[]).length > 0, what);
  }
  const dir = cleanFolder();
  writeFileSync(join(dir, "dist", "signing-key.pem"), pem);
  assert.ok(problems(dir).some((x) => /dist\/signing-key\.pem: signing tool or key file/.test(x)));
  rmSync(dir, { recursive: true });
});
