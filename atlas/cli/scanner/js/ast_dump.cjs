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
// v1.1: keys that mark an object literal as a threat / detection-rule catalog entry
// ({severity, description}) rather than a tool definition. Kept in sync with ast_py.CATALOG_KEYS.
const CATALOG_KEYS = new Set(["severity", "risk", "risk_level", "riskLevel", "threat", "threat_type", "threatType", "threat_name",
  "taxonomy", "cwe", "cve", "mitre", "mitre_attack", "attack_id", "technique", "remediation", "mitigation", "owasp",
  "aitech", "aisubtech", "scanner_category"].map((k) => k.toLowerCase()));
// v1.2: expected-outcome keys of an evaluation record, and words that mark a collection as
// detection rules / a test corpus. Kept in sync with ast_py.EVAL_KEYS / CORPUS_WORDS.
const EVAL_KEYS = new Set(["groundtruth", "ismalicious", "malicious", "shouldblock", "shouldflag", "shoulddetect", "verdict",
  "attacktype", "attackcategory", "isattack", "isinjection"]);
const CORPUS_WORDS = new Set(["pattern", "patterns", "regex", "regexes", "regexp", "regexps", "signature", "signatures", "rule",
  "rules", "ruleset", "rulesets", "vector", "vectors", "corpus", "corpora", "sample", "samples", "payload", "payloads", "expected",
  "fixture", "fixtures", "blocklist", "denylist", "blacklist", "testcase", "testcases"]);
const isEvalKey = (k) => { const n = String(k).replace(/[_\-\s]/g, "").toLowerCase(); return n.startsWith("expected") || EVAL_KEYS.has(n); };
const corpusName = (name) => (String(name).match(/[A-Z]?[a-z]+|[A-Z]+(?![a-z])/g) || []).some((w) => CORPUS_WORDS.has(w.toLowerCase()));
const propName = (p) => (p && p.name && (p.name.text !== undefined ? p.name.text : "")) || "";
// v1.3: prompt construction (kept in sync with ast_py.PROMPT_KEYS / LLM_CALL / PROMPT_NAME / FUNC_PROMPT)
const PROMPT_KEYS = new Set(["messages", "system", "prompt", "prompts", "instructions", "content", "systemprompt", "systemmessage",
  "userprompt", "developerprompt", "systeminstruction", "systeminstructions"]);
const normKey = (k) => String(k).replace(/[_\-\s]/g, "").toLowerCase();
const LLM_CALL = /^(a?create|a?chat|a?generate\w*|generateContent\w*|generate_content\w*|a?complete|a?completions?|create_?message|createMessage|a?invoke|streamText|streamObject|chat_?completions?|text_?generation)$/i;
const PROMPT_NAME = /(prompt|instructions?|system_?message)s?(_?(text|template|tmpl|str|string|msg|base|body|prefix|suffix|header|footer|parts?|lines?|v?\d+))?$/i;
const FUNC_PROMPT = /prompts?_?(text|template|tmpl|str|string)?$/i;
const EXAMPLE_WORDS = new Set(["example", "examples", "fewshot", "few", "shot", "shots", "demo", "demos", "demonstration",
  "demonstrations", "exemplar", "exemplars"]);
const EXAMPLE_IN_KEYS = new Set(["input", "inputs", "query", "question", "prompt", "user", "text"]);
const EXAMPLE_OUT_KEYS = new Set(["output", "outputs", "answer", "response", "completion", "assistant", "label", "result", "ideal"]);
const exampleName = (name) => {
  const w = (String(name).match(/[A-Z]?[a-z]+|[A-Z]+(?![a-z])/g) || []).map((x) => x.toLowerCase());
  return w.some((x) => EXAMPLE_WORDS.has(x)) && !(w.length === 1 && (w[0] === "few" || w[0] === "shot"));
};
const isExampleRecord = (keys) => { const ks = keys.map(normKey); return ks.some((k) => EXAMPLE_IN_KEYS.has(k)) && ks.some((k) => EXAMPLE_OUT_KEYS.has(k)); };
const TOOL_DESC_KEYS = new Set(["description", "desc", "title", "summary"]);
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
  const groups = [];
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

  // v1.2: identifiers whose value ends up in a tool description ({description: X},
  // server.tool(name, X, ...), const FOO_DESCRIPTION = X). Bound collections are never "pattern"/"corpus".
  const descSinks = new Set();
  const collectIds = (n) => { const v = (x) => { if (ts.isIdentifier(x)) descSinks.add(x.text); ts.forEachChild(x, v); }; v(n); };
  (function findSinks(n) {
    if (ts.isPropertyAssignment(n) && DESC_KEYS.has(propName(n))) collectIds(n.initializer);
    if (ts.isShorthandPropertyAssignment(n) && DESC_KEYS.has(n.name.text)) descSinks.add(n.name.text);
    if (ts.isCallExpression(n) && /^(tool|registerTool|prompt|registerPrompt|resource)$/.test(calleeName(n.expression)) && n.arguments[1]) {
      collectIds(n.arguments[1]);
    }
    if (ts.isVariableDeclaration(n) && n.initializer && ts.isIdentifier(n.name) && /desc|description|prompt|instruction/i.test(n.name.text)) {
      collectIds(n.initializer);
    }
    ts.forEachChild(n, findSinks);
  })(sf);

  // v1.3: identifiers whose value reaches a tool / server description proper (not a model prompt)
  const toolDescSinks = new Set();
  const collectTool = (n) => { const v = (x) => { if (ts.isIdentifier(x)) toolDescSinks.add(x.text); ts.forEachChild(x, v); }; v(n); };
  (function findToolSinks(n) {
    if (ts.isPropertyAssignment(n) && TOOL_DESC_KEYS.has(propName(n))) collectTool(n.initializer);
    if (ts.isShorthandPropertyAssignment(n) && TOOL_DESC_KEYS.has(n.name.text)) toolDescSinks.add(n.name.text);
    if (ts.isCallExpression(n) && /^(tool|registerTool|resource)$/.test(calleeName(n.expression)) && n.arguments[1]) collectTool(n.arguments[1]);
    if (ts.isVariableDeclaration(n) && n.initializer && ts.isIdentifier(n.name) && /desc|description/i.test(n.name.text)) collectTool(n.initializer);
    ts.forEachChild(n, findToolSinks);
  })(sf);

  const isLlmCall = (c) => c && (ts.isCallExpression(c) || ts.isNewExpression(c)) && LLM_CALL.test(calleeName(c.expression));
  const isStmt = (p) => (p.kind >= ts.SyntaxKind.FirstStatement && p.kind <= ts.SyntaxKind.LastStatement) || ts.isBlock(p) ||
    ts.isSourceFile(p) || ts.isClassLike(p) || ts.isJsxElement(p) || ts.isJsxSelfClosingElement(p) || ts.isJsxFragment(p) ||
    ts.isJsxAttribute(p) || ts.isJsxExpression(p);
  function fnName(fn) {
    if (!fn) return "";
    if ((ts.isFunctionDeclaration(fn) || ts.isMethodDeclaration(fn) || ts.isFunctionExpression(fn)) && fn.name) return fn.name.text || "";
    let q = fn.parent;
    if (q && ts.isVariableDeclaration(q) && ts.isIdentifier(q.name)) return q.name.text;
    if (q && ts.isPropertyAssignment(q)) return propName(q);
    return "";
  }
  const promptSinks = new Set();
  function promptStep(cur, p) {
    if (ts.isPropertyAssignment(p)) return p.initializer === cur && PROMPT_KEYS.has(normKey(propName(p))) ? "prompt" : null;
    if (ts.isShorthandPropertyAssignment(p)) return PROMPT_KEYS.has(normKey(p.name.text)) ? "prompt" : null;
    if (ts.isObjectLiteralExpression(p)) {
      return p.properties.some((q) => ts.isPropertyAssignment(q) && propName(q) === "role" && ts.isStringLiteralLike(q.initializer) &&
        /^(system|developer)$/.test(q.initializer.text)) ? "prompt" : null;
    }
    if (ts.isCallExpression(p) || ts.isNewExpression(p)) return cur !== p.expression && isLlmCall(p) ? "prompt" : null;
    if (ts.isVariableDeclaration(p)) {
      if (p.initializer !== cur || !ts.isIdentifier(p.name)) return "stop";
      const nm = p.name.text;
      return (PROMPT_NAME.test(nm) && !toolDescSinks.has(nm)) || promptSinks.has(nm) ? "prompt" : "stop";
    }
    if (ts.isBinaryExpression(p) && p.operatorToken.kind !== ts.SyntaxKind.PlusToken) {
      const k = p.operatorToken.kind;
      if (k === ts.SyntaxKind.EqualsToken || k === ts.SyntaxKind.PlusEqualsToken) {
        if (p.right !== cur) return "stop";
        const nm = calleeText(p.left, sf).split(".").pop();
        return (PROMPT_NAME.test(nm) && !toolDescSinks.has(nm)) || promptSinks.has(nm) ? "prompt" : "stop";
      }
      return null;
    }
    if (ts.isPropertyDeclaration(p)) {
      const nm = propName(p);
      return p.initializer === cur && ((PROMPT_NAME.test(nm) && !toolDescSinks.has(nm)) || promptSinks.has(nm)) ? "prompt" : "stop";
    }
    if (ts.isReturnStatement(p)) {
      let fn = p.parent;
      while (fn && !ts.isFunctionLike(fn) && !ts.isSourceFile(fn)) fn = fn.parent;
      return FUNC_PROMPT.test(fnName(fn)) ? "prompt" : "stop";
    }
    if (ts.isArrowFunction(p)) return p.body === cur && FUNC_PROMPT.test(fnName(p)) ? "prompt" : "stop";
    if (ts.isFunctionLike(p) || isStmt(p)) return "stop";
    return null;
  }
  for (let pass = 0; pass < 2; pass++) {
    (function findPromptSinks(n) {
      if (ts.isIdentifier(n) && n.parent && !(ts.isVariableDeclaration(n.parent) && n.parent.name === n) &&
          !(ts.isPropertyAccessExpression(n.parent) && n.parent.name === n) && !(ts.isPropertyAssignment(n.parent) && n.parent.name === n)) {
        let cur = n;
        for (let d = 0; d < 30 && cur.parent; d++) {
          const r = promptStep(cur, cur.parent);
          if (r === "prompt") { if (!toolDescSinks.has(n.text)) promptSinks.add(n.text); break; }
          if (r === "stop") break;
          cur = cur.parent;
        }
      }
      ts.forEachChild(n, findPromptSinks);
    })(sf);
  }
  function promptCtx(node) {
    let cur = node, example = false;
    for (let d = 0; d < 40 && cur.parent; d++) {
      const p = cur.parent;
      if (ts.isObjectLiteralExpression(p) && isExampleRecord(p.properties.map(propName))) example = true;
      if (ts.isPropertyAssignment(p) && p.initializer === cur && exampleName(propName(p))) example = true;
      if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name) && exampleName(p.name.text)) example = true;
      const r = promptStep(cur, p);
      if (r === "prompt") return [true, example];
      if (r === "stop") return [false, false];
      cur = p;
    }
    return [false, false];
  }
  function reachesToolDesc(node) {
    let cur = node;
    for (let d = 0; d < 40 && cur.parent; d++) {
      const p = cur.parent;
      if (ts.isPropertyAssignment(p) && p.initializer === cur && DESC_KEYS.has(propName(p))) {
        const k = propName(p);
        if (TOOL_DESC_KEYS.has(k)) return true;
        if (k === "instructions") {
          let c = p.parent && p.parent.parent;
          return !isLlmCall(c);
        }
        return false;
      }
      if ((ts.isCallExpression(p) || ts.isNewExpression(p)) && cur !== p.expression) {
        return /^(tool|registerTool|resource)$/.test(calleeName(p.expression)) && (p.arguments || []).indexOf(cur) === 1;
      }
      if (ts.isVariableDeclaration(p)) return ts.isIdentifier(p.name) && (/desc|description/i.test(p.name.text) || toolDescSinks.has(p.name.text));
      if (ts.isBinaryExpression(p) && p.operatorToken.kind !== ts.SyntaxKind.PlusToken) {
        const nm = calleeText(p.left, sf);
        return /desc|description/i.test(nm) || toolDescSinks.has(nm.split(".").pop());
      }
      if (ts.isFunctionLike(p) || isStmt(p)) return false;
      cur = p;
    }
    return false;
  }

  const isContainer = (n) => n && (ts.isArrayLiteralExpression(n) || ts.isObjectLiteralExpression(n));
  const isWrapper = (n) => n && (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isTypeAssertionExpression(n) ||
    (ts.isSatisfiesExpression && ts.isSatisfiesExpression(n)) || (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken) ||
    ts.isTemplateSpan(n) || ts.isTemplateExpression(n) || ts.isPropertyAssignment(n) || ts.isSpreadElement(n));
  function bindingOf(outer) {
    let q = outer.parent;
    while (q && (ts.isParenthesizedExpression(q) || ts.isAsExpression(q) || (ts.isSatisfiesExpression && ts.isSatisfiesExpression(q)))) q = q.parent;
    if (!q) return [[], false];
    if (ts.isVariableDeclaration(q) && ts.isIdentifier(q.name)) return [[q.name.text], descSinks.has(q.name.text)];
    if (ts.isPropertyAssignment(q)) return [[propName(q)], DESC_KEYS.has(propName(q))];
    if (ts.isPropertyDeclaration(q) || ts.isBinaryExpression(q)) {
      const nm = ts.isPropertyDeclaration(q) ? propName(q) : calleeText(q.left, sf);
      return [[nm], descSinks.has(nm)];
    }
    if (ts.isCallExpression(q) || ts.isNewExpression(q)) return [[calleeName(q.expression)], false];
    return [[], false];
  }
  function corpusCtx(node) {
    const names = [];
    let cur = node, evalRec = false, outer = null;
    for (;;) {
      const p = cur.parent;
      if (!p) break;
      if (ts.isPropertyAssignment(p)) { if (p.initializer === cur) names.push(propName(p)); cur = p; continue; }
      if (isContainer(p)) {
        if (ts.isObjectLiteralExpression(p) && outer === null && p.properties.some((q) => isEvalKey(propName(q)))) evalRec = true;
        outer = p; cur = p; continue;
      }
      if (isWrapper(p) && !ts.isPropertyAssignment(p)) { cur = p; continue; }
      break;
    }
    if (!outer) return [false, null];
    const [bnames, toDesc] = bindingOf(outer);
    if (toDesc) return [false, outer];
    return [evalRec || names.concat(bnames).some(corpusName), outer];
  }

  function roleOf(node) {
    const p = node.parent;
    if (!p) return "plain";
    if (ts.isPropertyAssignment(p) && p.initializer === node) {
      const k = p.name && (p.name.text || "");
      if (DESC_KEYS.has(k)) {
        const obj = p.parent;
        const sib = obj && ts.isObjectLiteralExpression(obj) && obj.properties.some((q) => q.name &&
          (CATALOG_KEYS.has(String(q.name.text || "").toLowerCase()) || isEvalKey(q.name.text || "")));
        return sib ? "catalog" : "desc";
      }
      if (PATTERN_NAME.test(k)) return "pattern";
    }
    if (ts.isVariableDeclaration(p) && p.initializer === node && ts.isIdentifier(p.name)) {
      // v1.2: `const rules = "..."; server.tool(name, rules)` is a description, not a pattern
      if (PATTERN_NAME.test(p.name.text)) return descSinks.has(p.name.text) ? "desc" : "pattern";
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
      let role = roleOf(n);
      if (role === "plain" || role === "patternlist" || role === "pattern") {
        const [inCorpus, outer] = corpusCtx(n);
        if (role === "plain" && inCorpus) role = "corpus";
        else if (role !== "plain" && outer && bindingOf(outer)[1]) role = "desc";  // collection passed on as a description
      }
      // v1.3: any string bound to a name later used as a tool description is that description
      if (["plain", "corpus", "pattern", "patternlist"].includes(role) && reachesToolDesc(n)) role = "desc";
      // v1.3: prompt construction (a prompt-named "description", or a string placed into a prompt)
      if (["desc", "plain", "corpus", "patternlist", "pattern"].includes(role) && !(role === "desc" && reachesToolDesc(n))) {
        const [inPrompt, inExample] = promptCtx(n);
        if (inPrompt) role = inExample ? "example" : "prompt";
        else if (role === "desc") role = "plain";  // prompt-like name, but neither a tool description nor sent to a model
      }
      spans.push([n.getStart(sf), n.getEnd(), "string", role]);
    } else if (n.kind === ts.SyntaxKind.RegularExpressionLiteral) {
      spans.push([n.getStart(sf), n.getEnd(), "regex", "pattern"]);
    } else if (ts.isJsxText(n)) {
      spans.push([n.getStart(sf), n.getEnd(), "string", "plain"]);
    }

    if (isContainer(n)) {
      let q = n.parent;
      while (q && (isWrapper(q) && !ts.isPropertyAssignment(q))) q = q.parent;
      if (!(q && (isContainer(q) || ts.isPropertyAssignment(q) && isContainer(q.parent)))) groups.push([n.getStart(sf), n.getEnd()]);
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
  return { spans, hits, groups };
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
