/**
 * Errors whose message is written for the person who sent the input (security review B-10). The hosted MCP server
 * returns the message of a UserFacingError to the client; any other error becomes a generic message with a
 * correlation id (src/server/errors.ts), so internal details (paths, stack traces, library messages) never leave it.
 * The CLI prints every message as before (the classes keep the name "Error", so printed errors do not change).
 */
export class UserFacingError extends Error {}

/** The input (a script file, a glossary) is malformed or not understood. */
export class InputError extends UserFacingError {}

/**
 * Re-throw a parser failure with the file name in front. A UserFacingError, or a SyntaxError from parsing the user's
 * text (JSON.parse), becomes an InputError; anything else is a bug and is re-thrown unchanged (it stays internal).
 */
export function inputErrorWithFile(e: unknown, file: string): Error {
  if (!(e instanceof UserFacingError) && !(e instanceof SyntaxError)) return e instanceof Error ? e : new Error(String(e));
  const msg = e.message;
  return new InputError(msg.startsWith(file) ? msg : `${file}: ${msg}`);
}
