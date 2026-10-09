import { UserFacingError } from "./errors.js";
import type { Glossary, Table } from "./types.js";

/**
 * Hard limits on one check run (security review B-02). The checks are linear in rows and glossary size since the
 * Aho-Corasick prefilters (matcher.ts), but one synchronous run still blocks its process, so the hosted MCP server
 * bounds the input and the wall time; the CLI keeps far larger bounds (a local run only blocks its own user).
 */
export interface EngineLimits {
  /** Glossary terms. */
  maxTerms: number;
  /** Glossary characters. */
  maxCharacters: number;
  /** Rows (strings) across all tables. */
  maxRows: number;
  /** Characters of source + target text across all rows. */
  maxChars: number;
  /** (terms + characters) × rows: a backstop for any check that still scales with both. */
  maxGlossaryRowProduct: number;
  /** Characters in one glossary string that is matched against the script (term, rendering, variant, name, alias). */
  maxTermLength: number;
  /** Characters in one row's source or target text (a single huge line must not dominate a run). */
  maxRowChars: number;
  /** Wall-clock budget for the checks, in ms. The run stops with a LimitError once it is exceeded. */
  timeBudgetMs?: number;
}

/** Hosted MCP server: one request must not hold the event loop of a shared machine for long. */
export const SERVER_LIMITS: EngineLimits = {
  maxTerms: 5_000,
  maxCharacters: 1_000,
  maxRows: 100_000,
  maxChars: 10_000_000,
  maxGlossaryRowProduct: 250_000_000,
  maxTermLength: 200,
  maxRowChars: 100_000,
  timeBudgetMs: 20_000,
};

/** CLI / GitHub Action: generous, but bounded so a malformed input fails with a message instead of running for hours. */
export const CLI_LIMITS: EngineLimits = {
  maxTerms: 100_000,
  maxCharacters: 20_000,
  maxRows: 2_000_000,
  maxChars: 500_000_000,
  maxGlossaryRowProduct: 20_000_000_000,
  maxTermLength: 1_000,
  maxRowChars: 10_000_000,
};

/** An input or run outside the limits. The message is meant for the user (no internals). */
export class LimitError extends UserFacingError {
  override name = "LimitError";
}

const fmt = (n: number) => n.toLocaleString("en-US");

/** Throws a LimitError when the tables or the glossary exceed `limits`. */
export function enforceLimits(tables: Table[], glossary: Glossary | undefined, limits: EngineLimits): void {
  const terms = glossary?.terms.length ?? 0;
  const characters = glossary?.characters.length ?? 0;
  if (terms > limits.maxTerms) throw new LimitError(`Too many glossary terms (${fmt(terms)} > ${fmt(limits.maxTerms)}). Split the glossary or drop unused terms.`);
  if (characters > limits.maxCharacters) throw new LimitError(`Too many glossary characters (${fmt(characters)} > ${fmt(limits.maxCharacters)}).`);
  // Matched glossary strings: nested terms (あ, ああ, …) make the term-in-term pass quadratic in their length.
  const tooLong = (s: string | undefined, what: string) => {
    if (s && s.length > limits.maxTermLength) throw new LimitError(`Glossary ${what} too long (${fmt(s.length)} characters > ${fmt(limits.maxTermLength)}): "${s.slice(0, 40)}…".`);
  };
  for (const t of glossary?.terms ?? []) {
    tooLong(t.source, "term");
    tooLong(t.target, "rendering");
    for (const v of [...(t.allowed ?? []), ...(t.forbidden ?? [])]) tooLong(v, "variant");
  }
  for (const c of glossary?.characters ?? []) {
    for (const v of [c.ja, c.en, c.reading, ...(c.aliases?.ja ?? []), ...(c.aliases?.en ?? []), ...(c.forbidden?.ja ?? []), ...(c.forbidden?.en ?? [])]) tooLong(v, "character name");
    for (const v of [...(c.voice?.ja?.firstPerson ?? []), ...(c.voice?.en?.avoid ?? [])]) tooLong(v, "voice word");
  }
  let rows = 0;
  let chars = 0;
  for (const t of tables) {
    rows += t.rows.length;
    for (const r of t.rows) {
      chars += r.source.length + r.target.length;
      if (r.source.length > limits.maxRowChars || r.target.length > limits.maxRowChars) {
        throw new LimitError(`${r.file}:${r.line}: line too long (${fmt(Math.max(r.source.length, r.target.length))} characters > ${fmt(limits.maxRowChars)}). Split the line or check it separately.`);
      }
    }
  }
  if (rows > limits.maxRows) throw new LimitError(`Too many rows (${fmt(rows)} > ${fmt(limits.maxRows)}). Check the script in parts.`);
  if (chars > limits.maxChars) throw new LimitError(`Too much text (${fmt(chars)} characters > ${fmt(limits.maxChars)}). Check the script in parts.`);
  const product = (terms + characters) * rows;
  if (product > limits.maxGlossaryRowProduct) {
    throw new LimitError(
      `Glossary × script too large ((${fmt(terms)} terms + ${fmt(characters)} characters) × ${fmt(rows)} rows > ${fmt(limits.maxGlossaryRowProduct)}). Check the script in parts or use a smaller glossary.`,
    );
  }
}

// The checks are synchronous, so one module-level deadline is safe: no other run can interleave with this one.
let deadline = Number.POSITIVE_INFINITY;
let budget = 0;
let ticks = 0;

/** Called from the checks' row loops. Cheap: looks at the clock every 256 calls, and only inside withTimeBudget. */
export function checkBudget(): void {
  if (deadline === Number.POSITIVE_INFINITY || (++ticks & 255) !== 0) return;
  if (Date.now() > deadline) throw new LimitError(`The check took longer than its time budget (${budget / 1000} s) and was stopped. Check the script in parts or use a smaller glossary.`);
}

/** Like checkBudget, but looks at the clock on every call (for loops whose steps are themselves long). */
export function checkBudgetNow(): void {
  if (deadline !== Number.POSITIVE_INFINITY && Date.now() > deadline) {
    throw new LimitError(`The check took longer than its time budget (${budget / 1000} s) and was stopped. Check the script in parts or use a smaller glossary.`);
  }
}

/** Runs `fn` with a wall-clock budget (no budget when `ms` is undefined or 0). */
export function withTimeBudget<T>(ms: number | undefined, fn: () => T): T {
  if (!ms) return fn();
  const prev = { deadline, budget };
  deadline = Math.min(deadline, Date.now() + ms);
  budget = ms;
  ticks = 0;
  try {
    return fn();
  } finally {
    ({ deadline, budget } = prev);
  }
}
