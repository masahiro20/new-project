// Test-only preload (node --import): installs license trust overrides from $KOTOMARK_TEST_HOOKS_JSON on globalThis,
// the way test/license.test.ts does in-process. Source runs (tsx) honour it; the production bundle must not, because
// scripts/build-cli.mjs compiles the hook out. Never shipped (test/ is not part of any release).
const raw = process.env.KOTOMARK_TEST_HOOKS_JSON;
if (raw) {
  const h = JSON.parse(raw);
  globalThis.__KOTOMARK_TEST_HOOKS__ = { ...h, disabledKids: new Set(h.disabledKids ?? []), revokedLids: new Set(h.revokedLids ?? []) };
}
