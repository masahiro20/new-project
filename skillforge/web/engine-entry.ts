// Browser entry for the demo page: the same engine as the CLI/MCP server, bundled as a global.
import "./zod-jitless.js";

export { parseTable, detectFormat, loadInputs, parseGlossary, parseGlossaryWithNotes, runChecks, renderMarkdown, findingsToLabelCsv, EMPTY_GLOSSARY } from "../src/core/index.js";
