"""Python AST layer for the Atlas scanner -- stdlib only, PARSE ONLY.

Uses `ast.parse` and `tokenize` on file text. Nothing is compiled to bytecode,
imported or executed.

analyse(text) -> {"ok": bool, "spans": [(start, end, kind, role)], "hits": [finding...]}
  spans: char offsets into `text`; kind in {"string", "comment"};
         role in {"desc", "catalog", "pattern", "patternlist", "test", "plain"}
         catalog (v1.1): a description value inside a threat/rule record, i.e. a dict that
         also has a severity/taxonomy-style key ({"severity": ..., "description": ...}).
  hits:  semantic detections for code rules (CE-001, CE-002, OB-003, CR-001, NW-001)
"""
import ast
import io
import re
import tokenize

DESC_KW = {"description", "desc", "instructions", "prompt", "system_prompt", "title", "summary"}
PATTERN_FUNCS = {"compile", "match", "search", "fullmatch", "findall", "finditer", "sub", "subn", "split",
                 "startswith", "endswith", "find", "index", "count", "replace"}
PATTERN_NAME = re.compile(r"pattern|regex|signature|rules?$|keywords?|indicators?|blocklist|denylist|blacklist"
                          r"|suspicious|dangerous|attack|payload|injection", re.I)
DECODERS = {"b64decode", "standard_b64decode", "urlsafe_b64decode", "b32decode", "b85decode", "a85decode",
            "decompress", "fromhex", "unhexlify", "loads"}
SHELL_FUNCS = {("os", "system"), ("os", "popen"), ("asyncio", "create_subprocess_shell"),
               ("commands", "getoutput"), ("subprocess", "getoutput"), ("subprocess", "getstatusoutput")}
# v1.1: keys that mark a dict as a threat / detection-rule catalog entry rather than a tool
# definition. Generic keys (name, category, type) are deliberately not in this set.
CATALOG_KEYS = {"severity", "risk", "risk_level", "threat", "threat_type", "threat_name", "taxonomy", "cwe", "cve",
                "mitre", "mitre_attack", "attack_id", "technique", "remediation", "mitigation", "owasp",
                "aitech", "aisubtech", "scanner_category"}
SEND_SINKS = {"post", "put", "send", "sendall", "write", "print", "info", "debug", "warning", "error",
              "log", "request", "urlopen", "dumps", "dump"}


def _dotted(node):
    parts = []
    while isinstance(node, ast.Attribute):
        parts.append(node.attr)
        node = node.value
    if isinstance(node, ast.Name):
        parts.append(node.id)
    return ".".join(reversed(parts))


def _is_environ(node):
    if _dotted(node) == "os.environ":
        return True
    # dict(os.environ) / os.environ.copy()
    if isinstance(node, ast.Call):
        if _dotted(node.func) == "dict" and node.args and _dotted(node.args[0]) == "os.environ":
            return True
        if _dotted(node.func) == "os.environ.copy":
            return True
    return False


class _Offsets:
    def __init__(self, text):
        self.text = text
        self.starts = [0]
        for i, ch in enumerate(text):
            if ch == "\n":
                self.starts.append(i + 1)
        self.lines = text.split("\n")

    def char(self, lineno, col_bytes):
        line = self.lines[lineno - 1] if 0 < lineno <= len(self.lines) else ""
        col = len(line.encode("utf-8")[:col_bytes].decode("utf-8", "ignore"))
        return self.starts[lineno - 1] + col if 0 < lineno <= len(self.starts) else 0


def analyse(text):
    try:
        tree = ast.parse(text)
    except (SyntaxError, ValueError, RecursionError, MemoryError):
        return {"ok": False, "spans": [], "hits": []}
    off = _Offsets(text)
    lines = off.lines
    spans = []
    hits = []

    # comments via tokenize (strings come from the AST so we know their role)
    try:
        for tok in tokenize.generate_tokens(io.StringIO(text).readline):
            if tok.type == tokenize.COMMENT:
                s = off.starts[tok.start[0] - 1] + tok.start[1]
                spans.append((s, s + len(tok.string), "comment", "plain"))
    except (tokenize.TokenError, IndentationError, SyntaxError):
        pass

    parents = {}
    for node in ast.walk(tree):
        for child in ast.iter_child_nodes(node):
            parents[child] = node

    docstrings = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and node.body:
            first = node.body[0]
            if isinstance(first, ast.Expr) and isinstance(first.value, ast.Constant) and isinstance(first.value.value, str):
                docstrings.add(first.value)

    def role_of(node):
        if node in docstrings:
            return "desc"
        p = parents.get(node)
        if p is None:
            return "plain"
        if isinstance(p, ast.keyword):
            if p.arg in DESC_KW:
                return "desc"
            if p.arg and PATTERN_NAME.search(p.arg):
                return "pattern"
            return "plain"
        if isinstance(p, ast.Dict):
            for k, v in zip(p.keys, p.values):
                if v is node and isinstance(k, ast.Constant) and isinstance(k.value, str):
                    if k.value in DESC_KW:
                        sib = {kk.value.lower() for kk in p.keys
                               if isinstance(kk, ast.Constant) and isinstance(kk.value, str)}
                        return "catalog" if sib & CATALOG_KEYS else "desc"
                    if PATTERN_NAME.search(k.value):
                        return "pattern"
            return "plain"
        if isinstance(p, (ast.Assign, ast.AnnAssign)):
            targets = p.targets if isinstance(p, ast.Assign) else [p.target]
            names = " ".join(_dotted(t) for t in targets)
            if PATTERN_NAME.search(names):
                return "pattern"
            if re.search(r"desc|description|prompt|instruction|__doc__", names, re.I):
                return "desc"
            return "plain"
        if isinstance(p, ast.Call):
            fname = _dotted(p.func).rsplit(".", 1)[-1]
            if fname in PATTERN_FUNCS:
                return "pattern"
            if fname.startswith(("assert", "expect")):
                return "test"
            return "plain"
        if isinstance(p, ast.Compare):
            return "pattern"  # `"x" in s` / `s == "x"`: matching, not instructing
        if isinstance(p, (ast.List, ast.Tuple, ast.Set)):
            n_str = sum(isinstance(e, (ast.Constant, ast.JoinedStr)) for e in p.elts)
            return "patternlist" if n_str >= 3 else role_of(p)
        if isinstance(p, (ast.BinOp, ast.JoinedStr)):
            return role_of(p)
        return "plain"

    def snippet(node):
        ln = getattr(node, "lineno", 1)
        return lines[ln - 1].strip()[:160] if 0 < ln <= len(lines) else ""

    def hit(rule, sev, node, title):
        hits.append({"rule": rule, "sev": sev, "line": node.lineno, "snippet": snippet(node), "title": title})

    for node in ast.walk(tree):
        if isinstance(node, ast.JoinedStr) or (isinstance(node, ast.Constant) and isinstance(node.value, str)):
            if isinstance(parents.get(node), ast.JoinedStr):
                continue  # covered by the enclosing f-string span
            if getattr(node, "end_lineno", None) is None:
                continue
            s = off.char(node.lineno, node.col_offset)
            e = off.char(node.end_lineno, node.end_col_offset)
            spans.append((s, e, "string", role_of(node)))
            continue
        if not isinstance(node, ast.Call):
            continue
        name = _dotted(node.func)
        short = name.rsplit(".", 1)[-1]
        kw = {k.arg: k.value for k in node.keywords if k.arg}
        # ATL-OB-003 decode-then-execute
        if name in ("exec", "eval") and node.args:
            decoded = any(isinstance(x, ast.Call) and _dotted(x.func).rsplit(".", 1)[-1] in DECODERS
                          for x in ast.walk(node.args[0]))
            if decoded:
                hit("ATL-OB-003", "high", node, "Decode-then-execute (AST)")
            const = isinstance(node.args[0], ast.Constant)
            hit("ATL-CE-002", "low" if const else "medium", node, "Dynamic code evaluation (AST: builtin eval/exec)")
        # ATL-CE-001 shell execution
        parts = tuple(name.split(".")[-2:]) if "." in name else ()
        if parts in SHELL_FUNCS:
            hit("ATL-CE-001", "medium", node, f"Shell command execution (AST: {name})")
        elif name.startswith("subprocess.") or short in ("Popen", "run", "call", "check_call", "check_output"):
            sh = kw.get("shell")
            if sh is not None and not (isinstance(sh, ast.Constant) and not sh.value):
                hit("ATL-CE-001", "medium", node, "Shell command execution (AST: subprocess shell=True)")
        # ATL-CR-001 bulk environment dump into a serializer / sink
        if short in SEND_SINKS or name in ("str", "repr", "json.dumps"):
            if any(_is_environ(a) for a in node.args) or any(_is_environ(v) for k, v in kw.items() if k in ("json", "data")):
                hit("ATL-CR-001", "high", node, "Bulk environment dump into serializer/sink (AST)")
        # ATL-NW-001 bind 0.0.0.0
        vals = list(node.args) + [v for k, v in kw.items() if k in ("host", "bind", "address", "addr", "hostname")]
        if any(isinstance(v, ast.Constant) and isinstance(v.value, str) and re.fullmatch(r"0\.0\.0\.0(:\d+)?", v.value)
               for v in vals) and (short in ("run", "bind", "listen", "serve", "create_server", "start_server", "Server", "Config", "uvicorn")
                                   or "host" in kw or "bind" in kw):
            hit("ATL-NW-001", "medium", node, "Server binds to all interfaces (AST)")
    # default args / assignments: host = "0.0.0.0"
    for node in ast.walk(tree):
        if isinstance(node, (ast.Assign, ast.AnnAssign)):
            val = node.value
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            names = " ".join(_dotted(t) for t in targets)
            if isinstance(val, ast.Constant) and isinstance(val.value, str) and re.fullmatch(r"0\.0\.0\.0(:\d+)?", val.value) \
                    and re.search(r"host|bind|addr", names, re.I):
                hit("ATL-NW-001", "medium", node, "Server binds to all interfaces (AST)")
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            a = node.args
            pos = a.posonlyargs + a.args
            pairs = list(zip(pos[len(pos) - len(a.defaults):], a.defaults)) + \
                [(k, d) for k, d in zip(a.kwonlyargs, a.kw_defaults) if d is not None]
            for arg, d in pairs:
                if isinstance(d, ast.Constant) and isinstance(d.value, str) and re.fullmatch(r"0\.0\.0\.0(:\d+)?", d.value) \
                        and re.search(r"host|bind|addr", arg.arg, re.I):
                    hit("ATL-NW-001", "medium", d, "Server binds to all interfaces (AST)")
    return {"ok": True, "spans": spans, "hits": hits}
