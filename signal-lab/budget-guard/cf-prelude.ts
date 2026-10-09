// First import of cf-worker.ts: runs before the OpenNext bundles are evaluated.
//
// cf-worker.ts imports the Next.js server (.open-next/server-functions/default/handler.mjs) at
// isolate startup, so its cost lands in the startup budget instead of the first request. Loading
// that module already prepares the server, which loads the instrumentation hook
// (instrumentation.ts) through Turbopack's runtime — and that runtime evaluates
// `path.resolve(__filename, …)`. OpenNext defines `globalThis.__filename` / `__dirname` only in
// its per-request init (cloudflare/init.js, on the first fetch), i.e. too late for a startup
// import: the hook failed with "__filename is not defined" and the startup checks never ran.
// Define them here the same way OpenNext does (empty strings; nothing reads files on workerd).
const g = globalThis as { __filename?: string; __dirname?: string };
g.__filename ??= "";
g.__dirname ??= "";

// R1-11: a deployed Worker is production. Nothing sets NODE_ENV at runtime (OpenNext only replaces
// the literal `process.env.NODE_ENV` at build time), and checks such as demoTokensAllowed() or the
// fail-closed key / secret fallbacks read it through a variable. Read via a variable here too, so
// no bundler define rewrites this line. Set before the Next.js server is evaluated.
const runtimeEnv: Record<string, string | undefined> = process.env;
runtimeEnv.NODE_ENV ||= "production";

export {};
