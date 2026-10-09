#!/usr/bin/env node
/**
 * Operator-only commands for the hosted MCP server (security review A-04): API token management. Kept out of the
 * public CLI / GitHub Action bundle (dist/kotomark.mjs); compiled with the server (dist/server/admin.js) and run in the
 * container as `kotomark token …` (deploy/kotomark-cli.sh), or from a checkout as `npm run admin -- token …`.
 *
 *   token create <user> [--plan solo|studio] [--label text]   prints the token once
 *   token list
 *   token revoke <user|token-prefix>
 */
import { parseArgs } from "node:util";
import { PLANS, tokenStoreFromEnv, type Plan } from "./auth.js";

const USAGE = `Usage (operators of the hosted server):
  token create <user> [--plan solo|studio] [--label text]   prints the token once
  token list
  token revoke <user|token-prefix>`;

export function admin(argv: string[]): number {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { plan: { type: "string" }, label: { type: "string" }, help: { type: "boolean", short: "h" } } });
  const [cmd, sub, target] = positionals;
  if (cmd !== "token" || values.help) {
    console.error(USAGE);
    return values.help ? 0 : 2;
  }
  const store = tokenStoreFromEnv();
  if (sub === "create" && target) {
    const plan = (values.plan ?? "solo") as Plan;
    if (!(plan in PLANS) || plan === "dev") {
      console.error(`Unknown plan "${plan}" (solo | studio)`);
      return 2;
    }
    const { token, record } = store.create(target, plan, values.label);
    console.log(token);
    console.error(`Created token ${record.prefix}… for ${record.user} (${record.plan}). It is shown only once.`);
    return 0;
  }
  if (sub === "list") {
    for (const r of store.list()) console.log(`${r.prefix}…  ${r.user}  ${r.plan}  ${r.createdAt}${r.revokedAt ? `  REVOKED ${r.revokedAt}` : ""}${r.label ? `  ${r.label}` : ""}`);
    return 0;
  }
  if (sub === "revoke" && target) {
    console.log(`Revoked ${store.revoke(target)} token(s).`);
    return 0;
  }
  console.error(USAGE);
  return 2;
}

if (process.argv[1] && /admin\.(ts|js)$/.test(process.argv[1])) {
  try {
    process.exitCode = admin(process.argv.slice(2));
  } catch (e) {
    console.error(`kotomark admin: ${(e as Error).message}`);
    process.exitCode = 2;
  }
}
