import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname } from "node:path";

/**
 * Daily row usage on disk (leader decision for the single Fly.io machine, see docs/decisions.md): the per-minute
 * request limit stays in memory, but the rows counted against each user's daily quota survive a restart, a deploy
 * and Fly.io's auto-stop. One small JSON file in KOTOMARK_DATA_DIR, written atomically (temp file + fsync + rename)
 * at most `debounceMs` after a change and on shutdown (SIGTERM / SIGINT). Only today's (UTC) entries are kept.
 *
 * One machine only: two instances would each keep their own file. More than one instance needs a shared store.
 */
export interface DailyRows {
  day: string;
  used: number;
}

interface UsageFileFormat {
  v: 1;
  rows: Record<string, DailyRows>;
}

export const utcDay = (t: number) => new Date(t).toISOString().slice(0, 10);

export class UsageFile {
  private timer: NodeJS.Timeout | undefined;
  private pending: (() => Map<string, DailyRows>) | undefined;

  /** debounceMs: the longest a change waits before it is written (≤ 5 s by design). */
  constructor(readonly file: string, private debounceMs = 2_000, private now: () => number = Date.now) {}

  /** Today's entries; an unreadable file is logged (without its content) and treated as empty. */
  load(): Map<string, DailyRows> {
    const out = new Map<string, DailyRows>();
    if (!existsSync(this.file)) return out;
    try {
      const data = JSON.parse(readFileSync(this.file, "utf8")) as UsageFileFormat;
      const today = utcDay(this.now());
      for (const [user, r] of Object.entries(data?.rows ?? {})) {
        if (r && r.day === today && Number.isFinite(r.used) && r.used >= 0) out.set(user, { day: r.day, used: r.used });
      }
    } catch (e) {
      console.error(`usage: cannot read the usage file (${(e as Error).name}); daily row counts start from zero`);
    }
    return out;
  }

  /** Write soon: at most debounceMs after the first change since the last write (later changes ride along). */
  schedule(snapshot: () => Map<string, DailyRows>): void {
    this.pending = snapshot;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.flushPending();
    }, this.debounceMs);
    this.timer.unref();
  }

  /** Write now if anything is pending (shutdown). */
  flushPending(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    const snap = this.pending;
    this.pending = undefined;
    if (snap) this.write(snap());
  }

  /** Atomic write of today's entries (older days are pruned). */
  write(rows: Map<string, DailyRows>): void {
    const today = utcDay(this.now());
    const data: UsageFileFormat = { v: 1, rows: {} };
    for (const [user, r] of rows) if (r.day === today && r.used > 0) data.rows[user] = r;
    const tmp = `${this.file}.${randomBytes(4).toString("hex")}.tmp`;
    try {
      mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
      const fd = openSync(tmp, "w", 0o600);
      try {
        writeSync(fd, JSON.stringify(data));
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      renameSync(tmp, this.file);
    } catch (e) {
      rmSync(tmp, { force: true });
      console.error(`usage: cannot write the usage file (${(e as { code?: string }).code ?? (e as Error).name})`);
    }
  }
}
