// Imported first by engine-entry.ts, so it runs before any zod schema is defined.
// The site build's CSP has no 'unsafe-eval'. zod otherwise probes `new Function("")` when an object schema is defined;
// the throw is caught, but the browser still reports a securitypolicyviolation. Jitless parsing gives the same results.
import { z } from "zod";

z.config({ jitless: true });
