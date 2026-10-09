import { isExplicitDemo } from "./payments/mode";

// R1-13: the example files publish dummy secrets (.dev.vars.example). A deployment that copied
// them would seal provider tokens with a public key / accept forged access cookies. They are
// accepted only in development / test and in an explicit demo deployment (PAYMENTS_MODE=demo,
// which `npm run preview` uses), with a warning; anywhere else they are a startup error.

type Env = Record<string, string | undefined>;
const DEV_ENVS = new Set(["development", "test"]);

/** Published example values of ACCESS_SECRET (.dev.vars.example). */
const DUMMY_ACCESS_SECRETS = new Set(["local-dummy-access-secret-change-me-0123456789"]);

/** A 32-byte key made of one repeated byte (the example's all-zero "AAAA…=" and the like). */
export const isTrivialKey = (key: Buffer) => key.length > 0 && key.every((b) => b === key[0]);
export const isDummyAccessSecret = (secret: string) => DUMMY_ACCESS_SECRETS.has(secret);

const warned = new Set<string>();
/** Throws outside development / test / explicit demo; warns once inside a demo deployment. */
export function refuseDummySecret(name: string, env: Env): void {
  if (DEV_ENVS.has(env.NODE_ENV ?? "")) return;
  if (isExplicitDemo(env)) {
    if (!warned.has(name)) {
      warned.add(name);
      console.warn(`[budget-guard] ${name} is the published example value. Fine for a local preview; generate a real one (openssl rand -base64 32) before anyone else uses this deployment.`);
    }
    return;
  }
  throw new Error(`${name} is the published example value: generate a real one (openssl rand -base64 32)`);
}
