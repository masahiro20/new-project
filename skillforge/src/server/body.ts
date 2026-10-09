import type { IncomingMessage } from "node:http";
import { HttpError } from "./errors.js";

/**
 * Request body limits (security review B-11).
 *
 * maxBytes = 8 MiB. Reading and parsing one JSON body costs about 7× its size at the peak (the chunks, the joined
 * Buffer, the decoded string and the parsed object: measured ≈ 115 MB for a 16 MiB body of mixed ja/en text), so
 * 8 MiB is ≈ 60 MB per request. 8 MiB of a typical bilingual script (about 1 Japanese character in 3, at 3 bytes in
 * UTF-8) is ≈ 5.6 million characters — more than half of SERVER_LIMITS.maxChars (10 M) in src/core/limits.ts and
 * ≈ 50,000 typical rows; anything larger is checked in parts, as the limit errors already say. LIMITS.maxTotalChars
 * in tools.ts is set to the same 8 million so the two limits agree.
 *
 * Large bodies (> 1 MiB) are also limited in number: at most 2 are read or processed at once on the machine; a third
 * gets 503 with Retry-After. With Fly.io's hard_limit of 25 requests this bounds request bodies to
 * ≈ 2 × 60 MB + 23 × 7 MB ≈ 280 MB worst case on the 512 MB VM, leaving room for the check run itself (B-02: ≈ 0.2 GB
 * at the largest inputs).
 */
export const BODY_LIMITS = {
  maxBytes: 8 * 1024 * 1024,
  largeBytes: 1024 * 1024,
  maxLargeInFlight: 2,
  retryAfterSec: 5,
};

/** Counting semaphore for large bodies. Never queues: a caller that cannot enter is told to retry. */
export class LargeBodyGate {
  private inFlight = 0;
  constructor(readonly max = BODY_LIMITS.maxLargeInFlight) {}

  get active(): number {
    return this.inFlight;
  }

  /** A release function (idempotent), or undefined when the gate is full. */
  tryAcquire(): (() => void) | undefined {
    if (this.inFlight >= this.max) return undefined;
    this.inFlight++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.inFlight--;
    };
  }
}

const busy = (limits: typeof BODY_LIMITS) =>
  new HttpError(`Server busy: too many large requests at once. Retry in ${limits.retryAfterSec} s.`, 503, limits.retryAfterSec);
const tooLarge = (limits: typeof BODY_LIMITS) =>
  new HttpError(`Request body too large (max ${limits.maxBytes / 1024 / 1024} MiB). Check the script in parts.`, 413);

/**
 * Read and parse a JSON request body within `limits`. A body over `largeBytes` (by Content-Length, or once that many
 * bytes have arrived) must enter `gate`; call `release` when the response is done (the parsed body lives until then).
 * Errors are HttpErrors with a client-safe message (the JSON parser's message, which quotes the body, is not used).
 */
export async function readJsonBody(req: IncomingMessage, gate: LargeBodyGate, limits = BODY_LIMITS): Promise<{ body: unknown; release: () => void }> {
  let release: (() => void) | undefined;
  const done = () => release?.();
  try {
    const declared = Number(req.headers["content-length"]);
    if (Number.isFinite(declared)) {
      if (declared > limits.maxBytes) throw tooLarge(limits);
      if (declared > limits.largeBytes && !(release = gate.tryAcquire())) throw busy(limits);
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const c of req) {
      size += (c as Buffer).length;
      if (size > limits.maxBytes) throw tooLarge(limits);
      if (size > limits.largeBytes && !release && !(release = gate.tryAcquire())) throw busy(limits);
      chunks.push(c as Buffer);
    }
    try {
      return { body: JSON.parse(Buffer.concat(chunks, size).toString("utf8")), release: done };
    } catch {
      throw new HttpError("Invalid JSON body", 400);
    }
  } catch (e) {
    done();
    throw e;
  }
}
