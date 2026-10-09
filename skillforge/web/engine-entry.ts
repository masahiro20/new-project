// Browser entry for the demo page: the same engine as the CLI/MCP server, bundled as a global.
import { z } from "zod";

// The site build's CSP has no 'unsafe-eval'. Without this, zod probes `new Function("")` on the first object parse;
// the throw is caught, but the browser still reports a securitypolicyviolation. Jitless parsing gives the same results.
z.config({ jitless: true });

export { parseTable, detectFormat, loadInputs, parseGlossary, parseGlossaryWithNotes, runChecks, renderMarkdown, findingsToLabelCsv, EMPTY_GLOSSARY } from "../src/core/index.js";
