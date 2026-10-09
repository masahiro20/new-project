import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { envUserId, legacyEnvUserId, type Limiter } from "./auth.js";
import type { GlossaryStore } from "./store.js";

/**
 * Startup data migrations, recorded in <KOTOMARK_DATA_DIR>/migrations.json so each runs once.
 *
 * env-user-ids-v1 (security review B-06): KOTOMARK_API_TOKENS users were "env-<position>"; they are now derived from
 * a hash of the token (envUserId). Glossaries and today's row usage stored under env-<n> move to the id of the token
 * that is n-th in KOTOMARK_API_TOKENS at the first start of this version — the order the old ids were based on, so
 * the operator must not reorder the variable in the same deploy. After the run is recorded, data left under an old
 * id (conflicts, unreadable files, positions with no token) is never handed to a later token. The log names the old
 * id, the new id and counts only: no token, no glossary content.
 */
export const ENV_USER_IDS_MIGRATION = "env-user-ids-v1";

export interface EnvIdMigrationSummary {
  skipped: boolean;
  users: number;
  glossaries: number;
  usage: number;
  conflicts: number;
  failed: number;
}

type Marker = Record<string, { at: string } & Partial<EnvIdMigrationSummary>>;

function readMarker(file: string): Marker {
  if (!existsSync(file)) return {};
  return JSON.parse(readFileSync(file, "utf8")) as Marker;
}

function writeMarker(file: string, marker: Marker) {
  mkdirSync(join(file, ".."), { recursive: true, mode: 0o700 });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(marker, null, 2), { mode: 0o600 });
  renameSync(tmp, file);
}

export async function migrateEnvUserIds(opts: {
  dataDir: string;
  envTokens: string[];
  store: GlossaryStore;
  limiter: Limiter;
  log?: (msg: string) => void;
}): Promise<EnvIdMigrationSummary> {
  const log = opts.log ?? ((m: string) => console.log(m));
  const markerFile = join(opts.dataDir, "migrations.json");
  const marker = readMarker(markerFile);
  const sum: EnvIdMigrationSummary = { skipped: false, users: 0, glossaries: 0, usage: 0, conflicts: 0, failed: 0 };
  if (marker[ENV_USER_IDS_MIGRATION]) return { ...sum, skipped: true };

  for (const [i, token] of opts.envTokens.entries()) {
    const from = legacyEnvUserId(i);
    const to = envUserId(token);
    const g = await opts.store.moveOwner(from, to);
    const usage = opts.limiter.renameUser(from, to);
    if (g.moved || g.alreadyThere || g.conflicts || g.failed || usage) {
      sum.users++;
      log(
        `migration ${ENV_USER_IDS_MIGRATION}: ${from} -> ${to}: ${g.moved} glossaries moved` +
          `${g.alreadyThere ? `, ${g.alreadyThere} already there` : ""}${g.conflicts ? `, ${g.conflicts} conflicts left in place` : ""}` +
          `${g.failed ? `, ${g.failed} unreadable left in place` : ""}${usage ? ", today's usage moved" : ""}`,
      );
    }
    sum.glossaries += g.moved + g.alreadyThere;
    sum.usage += usage ? 1 : 0;
    sum.conflicts += g.conflicts;
    sum.failed += g.failed;
  }
  opts.limiter.flush();
  marker[ENV_USER_IDS_MIGRATION] = { at: new Date().toISOString(), users: sum.users, glossaries: sum.glossaries, usage: sum.usage, conflicts: sum.conflicts, failed: sum.failed };
  writeMarker(markerFile, marker);
  log(`migration ${ENV_USER_IDS_MIGRATION}: done (${sum.users} users, ${sum.glossaries} glossaries${sum.conflicts + sum.failed ? `, ${sum.conflicts + sum.failed} left in place` : ""})`);
  return sum;
}
