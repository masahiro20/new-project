import { randomBytes } from "node:crypto";
import { UserFacingError } from "../core/errors.js";

export { UserFacingError };

/**
 * What a client may see of an error (security review B-10). Only a UserFacingError carries a message meant for the
 * client (cut to MAX_ERROR_CHARS). Anything else — fs/crypto errors with server paths, library messages, bugs —
 * becomes a generic message with a correlation id; the server log gets the id, the error class, its code and the
 * stack frames, but never the message (it may quote script or glossary text).
 */
export const MAX_ERROR_CHARS = 1_000;

/** A user-facing error with an HTTP status (and Retry-After), for failures before or around the MCP layer. */
export class HttpError extends UserFacingError {
  override name = "HttpError";
  constructor(message: string, readonly status: number, readonly retryAfterSec?: number) {
    super(message);
  }
}

export const newCorrelationId = () => randomBytes(6).toString("hex");

/** One log line about an internal error, without its message. */
export function logInternalError(id: string, where: string, e: unknown): void {
  const err = e as { name?: unknown; code?: unknown; stack?: unknown; constructor?: { name?: unknown } } | undefined;
  const ctor = err?.constructor?.name;
  const name = typeof ctor === "string" && ctor !== "Object" ? ctor : typeof err?.name === "string" ? err.name : typeof e;
  const code = typeof err?.code === "string" || typeof err?.code === "number" ? ` code=${err.code}` : "";
  // Only the "    at …" frames: the first stack line repeats the message.
  const frames = typeof err?.stack === "string" ? err.stack.split("\n").filter((l) => /^\s+at /.test(l)).slice(0, 8).map((l) => l.trim()) : [];
  console.error(`internal error id=${id} in=${where} type=${name}${code}${frames.length ? ` | ${frames.join(" | ")}` : ""}`);
}

/** The text to send to the client for `e`, plus the correlation id when it was internal. */
export function publicError(e: unknown, where: string): { message: string; id?: string } {
  if (e instanceof UserFacingError) {
    const msg = e.message;
    return { message: msg.length > MAX_ERROR_CHARS ? `${msg.slice(0, MAX_ERROR_CHARS)}… (truncated)` : msg };
  }
  const id = newCorrelationId();
  logInternalError(id, where, e);
  return { message: `Internal error (id ${id}). Please try again later; quote this id if you report the problem.`, id };
}
