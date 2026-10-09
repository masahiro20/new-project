#!/usr/bin/env node
// Atlas JS/TS AST helper. PARSE ONLY: uses the TypeScript compiler's parser
// (ts.createSourceFile) on file text. Scanned code is never executed,
// imported, transpiled or type-checked.
//
// stdin : JSON array of absolute file paths
// stdout: one JSON object per line:
//   {"file", "ok", "spans": [[start, end, kind, role], ...], "hits": [{rule, sev, line, snippet, title}]}
// Offsets are UTF-16 code-unit offsets, which equal Python str indices for
// BMP text (the scanner maps them back to lines itself).
"use strict";
const fs = require("fs");
const path = require("path");
// ATLAS_TS_PATH (set by the packaged CLI) points at the typescript package directory.
const ts = require(process.env.ATLAS_TS_PATH || "typescript");

const MAX_BYTES = 1_000_000;
const DESC_KEYS = new Set(["description", "desc", "instructions", "prompt", "systemPrompt", "system_prompt", "title", "summary"]);
const PATTERN_METHODS = new Set(["match", "matchAll", "test", "search", "replace", "replaceAll", "includes", "startsWith", "endsWith", "indexOf", "split", "exec"]);
const PATTERN_NAME = /pattern|regex|regexp|signature|rules?$|keywords?|indicators?|blocklist|denylist|blacklist|suspicious|dangerous|attack|payload|injection/i;
const SEND_SINKS = /^(fetch|post|put|send|write|log|info|debug|warn|error|request|axios|got)$/;

function scriptKind(file) {
  const ext = path.extname(file).toLowerCase();
  return { ".ts": ts.ScriptKind.TS, ".mts": ts.ScriptKind.TS, ".cts": ts.ScriptKind.TS, ".tsx": ts.ScriptKind.TSX,
           ".jsx": ts.ScriptKind.JSX }[ext] || ts.ScriptKind.JS;
}

function calleeName(expr) {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
  return "";
}
function calleeText(expr, sf) {
  try { return expr.getText(sf); } catch { return ""; }
}
function isProcessEnv(n) {
  return n && ts.isPropertyAccessExpression(n) && n.name.text === "env" &&
    ts.isIdentifier(n.expression) && n.expression.text === "process";
}
function containsDecode(n, sf) {
  let found = false;
  const visit = (x) => {
    if (found) return;
    if (ts.isCallExpression(x)) {
      const t = calleeText(x.expression, sf);
      if (/(^|\.)atob$/.test(t) || /(^|\.)(inflateSync|gunzipSync|brotliDecompressSync)$/.test(t)) found = true;
      if (/Buffer\.from$/.test(t) && x.arguments.length > 1 && ts.isStringLiteralLike(x.arguments[1]) &&
          /^(base64|hex|base64url)$/.test(x.arguments[1].text)) found = true;
    }
    ts.forEachChild(x, visit);
  };
  visit(n);
  return found;
}

function analyse(file, text) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind(file));
  const spans = [];
  const hits = [];
  let importsChildProcess = /child_process/.test(text);
  const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
  const snippet = (n) => text.slice(n.getStart(sf), n.getEnd()).split("\n")[0].slice(0, 160);
  const hit = (rule, sev, n, title) => hits.push({ rule, sev, line: lineOf(n.getStart(sf)), snippet: snippet(n), title });

  // comments: scan the token stream (covers all comments, incl. JSX-adjacent ones)
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, sf.languageVariant, text);
  try {
    let tok;
    while ((tok = scanner.scan()) !== ts.SyntaxKind.EndOfFileToken) {
      if (tok === ts.SyntaxKind.SingleLineCommentTrivia || tok === ts.SyntaxKind.MultiLineCommentTrivia) {
        spans.push([scanner.getTokenPos(), scanner.getTextPos(), "comment", "plain"]);
      }
    }
  } catch { /* scanner is best-effort; AST spans below still apply */ }

  function roleOf(node) {
    const p = node.parent;
    if (!p) return "plain";
    if (ts.isPropertyAssignment(p) && p.initializer === node) {
      const k = p.name && (p.name.text || "");
      if (DESC_KEYS.has(k)) return "desc";
      if (PATTERN_NAME.test(k)) return "pattern";
    }
    if (ts.isVariableDeclaration(p) && p.initializer === node && ts.isIdentifier(p.name)) {
      if (PATTERN_NAME.test(p.name.text)) return "pattern";
      if (/desc|description|prompt|instruction/i.test(p.name.text)) return "desc";
    }
    if (ts.isCallExpression(p) || ts.isNewExpression(p)) {
      const name = calleeName(p.expression);
      if (name === "RegExp") return "pattern";
      if (PATTERN_METHODS.has(name)) return "pattern";
      // server.tool("name", "description", schema, handler) / registerTool / prompt / resource
      if (/^(tool|registerTool|prompt|registerPrompt|resource)$/.test(name) && p.arguments.indexOf(node) === 1) return "desc";
      if (/^(expect|assert|toContain|toMatch|toBe|toEqual|it|test|describe)$/.test(name)) return "test";
    }
    if (ts.isArrayLiteralExpression(p)) {
      const strs = p.elements.filter((e) => ts.isStringLiteralLike(e) || ts.isTemplateExpression(e)).length;
      if (strs >= 3) return "patternlist";
      return roleOf(p);
    }
    if (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.PlusToken) return roleOf(p);
    if (ts.isParenthesizedExpression(p) || ts.isAsExpression(p)) return roleOf(p);
    return "plain";
  }

  function visit(n) {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n)) {
      spans.push([n.getStart(sf), n.getEnd(), "string", roleOf(n)]);
    } else if (n.kind === ts.SyntaxKind.RegularExpressionLiteral) {
      spans.push([n.getStart(sf), n.getEnd(), "regex", "pattern"]);
    } else if (ts.isJsxText(n)) {
      spans.push([n.getStart(sf), n.getEnd(), "string", "plain"]);
    }

    if (ts.isCallExpression(n) || ts.isNewExpression(n)) {
      const name = calleeName(n.expression);
      const full = calleeText(n.expression, sf);
      const args = n.arguments || [];
      // ATL-OB-003 decode-then-execute
      if ((name === "eval" || name === "Function" || /runIn(New|This)Context$|^vm\.Script$/.test(full)) && args.some((a) => containsDecode(a, sf))) {
        hit("ATL-OB-003", "high", n, "Decode-then-execute (AST)");
      }
      // ATL-CE-002 dynamic code
      if ((ts.isCallExpression(n) && ts.isIdentifier(n.expression) && name === "eval") ||
          (ts.isNewExpression(n) && name === "Function") ||
          /^vm\.(runIn(New|This)Context|compileFunction)$|^new vm\.Script/.test(full)) {
        const constArg = args.length > 0 && args.every((a) => ts.isStringLiteralLike(a));
        hit("ATL-CE-002", constArg ? "low" : "medium", n, "Dynamic code evaluation (AST: eval / new Function / vm)");
      }
      // ATL-CE-001 shell execution
      // bare exec()/execSync() imported from child_process, or cp.exec(); never regex.exec()
      const cpExec = /^(exec|execSync)$/.test(name) && (ts.isIdentifier(n.expression) ||
        /^(child_process|childProcess|cp|child|proc|require\(\s*['"](node:)?child_process['"]\s*\))\.(exec|execSync)$/.test(full));
      if (importsChildProcess && cpExec) {
        hit("ATL-CE-001", "medium", n, "Shell command execution (AST: child_process.exec)");
      } else if (/^(spawn|spawnSync|execFile|execFileSync|execa|execaSync|fork)$/.test(name)) {
        const opts = args.find((a) => ts.isObjectLiteralExpression(a));
        if (opts && opts.properties.some((p) => ts.isPropertyAssignment(p) && p.name && p.name.text === "shell" &&
            p.initializer.kind !== ts.SyntaxKind.FalseKeyword)) {
          hit("ATL-CE-001", "medium", n, "Shell command execution (AST: spawn with shell option)");
        }
      }
      // ATL-CR-001 bulk env dump into a sink
      if (args.some(isProcessEnv)) {
        if (/^JSON\.stringify$/.test(full) || SEND_SINKS.test(name)) {
          hit("ATL-CR-001", "high", n, "Bulk environment dump into serializer/sink (AST)");
        }
      }
      // ATL-NW-001 bind 0.0.0.0
      if (/^(listen|bind|serve|createServer|run)$/.test(name) && args.some((a) => ts.isStringLiteralLike(a) && /^0\.0\.0\.0(:\d+)?$/.test(a.text))) {
        hit("ATL-NW-001", "medium", n, "Server binds to all interfaces (AST)");
      }
    }
    if (ts.isPropertyAssignment(n) && n.name && /^(host|hostname|bind|address|addr)$/i.test(n.name.text || "") &&
        ts.isStringLiteralLike(n.initializer) && /^0\.0\.0\.0(:\d+)?$/.test(n.initializer.text)) {
      hit("ATL-NW-001", "medium", n, "Server binds to all interfaces (AST)");
    }
    if ((ts.isVariableDeclaration(n) || ts.isParameter(n)) && n.name && ts.isIdentifier(n.name) && /host|bind|addr/i.test(n.name.text) &&
        n.initializer && ts.isStringLiteralLike(n.initializer) && /^0\.0\.0\.0(:\d+)?$/.test(n.initializer.text)) {
      hit("ATL-NW-001", "medium", n, "Server binds to all interfaces (AST)");
    }
    ts.forEachChild(n, visit);
  }
  visit(sf);
  return { spans, hits };
}

function main() {
  const files = JSON.parse(fs.readFileSync(0, "utf8"));
  for (const file of files) {
    let out;
    try {
      const st = fs.lstatSync(file);
      if (!st.isFile() || st.size > MAX_BYTES) { out = { file, ok: false, error: "skipped" }; }
      else {
        const text = fs.readFileSync(file, "utf8");
        out = Object.assign({ file, ok: true }, analyse(file, text));
      }
    } catch (e) {
      out = { file, ok: false, error: String(e && e.message || e).slice(0, 200) };
    }
    process.stdout.write(JSON.stringify(out) + "\n");
  }
}
main();
