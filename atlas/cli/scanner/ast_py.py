"""Python AST layer for the Atlas scanner -- stdlib only, PARSE ONLY.

Uses `ast.parse` and `tokenize` on file text. Nothing is compiled to bytecode,
imported or executed.

analyse(text) -> {"ok": bool, "spans": [(start, end, kind, role)], "hits": [finding...]}
  spans: char offsets into `text`; kind in {"string", "comment"};
         role in {"desc", "catalog", "pattern", "patternlist", "test", "corpus", "plain"}
         catalog (v1.1): a description value inside a threat/rule record, i.e. a dict that
         also has a severity/taxonomy-style key ({"severity": ..., "description": ...}).
         v1.2: also a dict with an expected-outcome key ({"description": ..., "expected": "block"}).
         corpus (v1.2): a non-description string inside a collection literal whose variable / key
         names say it is detection data (rules, vectors, corpus, samples, payloads, expected ...),
         or inside a record with an expected-outcome key. Never assigned to a name that is also
         used as a tool description.
         prompt (v1.3): a string that is part of a prompt sent to a model -- the value of a
         messages / system / prompt / instructions / content key or keyword, an argument of an
         LLM call (.create( / .chat( / generate( / invoke( ...), a member of a {"role": "system"}
         object, a value assigned to system_prompt / SYSTEM_PROMPT / *_PROMPT (or a name later used
         in such a place), or the return value of a function named *prompt*.
         example (v1.3): a string inside a few-shot example of a prompt (a container named
         examples / few_shot / shots / demos, or an input/output pair record).
  groups (v1.2): [(start, end)] of outermost list/tuple/set/dict literals; the scanner counts
         how many strings in one literal match attack rules.
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
# v1.2: keys of an evaluation / test-case record ({"input": ..., "expected": "block"}).
# Compared after lower-casing and dropping "_" / "-"; any key starting with "expected" counts.
EVAL_KEYS = {"groundtruth", "ismalicious", "malicious", "shouldblock", "shouldflag", "shoulddetect", "verdict",
             "attacktype", "attackcategory", "isattack", "isinjection"}
# v1.2: words in a variable / key name that mark a collection as detection rules or a test corpus
CORPUS_WORDS = {"pattern", "patterns", "regex", "regexes", "regexp", "regexps", "signature", "signatures", "rule", "rules",
                "ruleset", "rulesets", "vector", "vectors", "corpus", "corpora", "sample", "samples", "payload", "payloads",
                "expected", "fixture", "fixtures", "blocklist", "denylist", "blacklist", "testcase", "testcases"}


def norm_key(k):
    return re.sub(r"[_\-\s]", "", str(k)).lower()


def is_eval_key(k):
    n = norm_key(k)
    return n.startswith("expected") or n in EVAL_KEYS


def corpus_name(name):
    """True if an identifier / key (snake, camel, SCREAMING, dotted) contains a corpus word."""
    words = re.findall(r"[A-Z]?[a-z]+|[A-Z]+(?![a-z])", str(name))
    return any(w.lower() in CORPUS_WORDS for w in words)


# v1.3: prompt construction. Keys / keyword arguments whose value is sent to a model, LLM call
# names, and variable / function names that hold a prompt.
PROMPT_KEYS = {"messages", "system", "prompt", "prompts", "instructions", "content", "systemprompt", "systemmessage",
               "userprompt", "developerprompt", "systeminstruction", "systeminstructions"}
LLM_CALL = re.compile(r"^(a?create|a?chat|a?generate\w*|generate_content\w*|a?complete|a?completions?|create_message"
                      r"|a?invoke|chat_completions?|text_generation)$", re.I)
# a variable that holds a prompt: SYSTEM_PROMPT, system_prompt, userPrompt, PROMPT_TEMPLATE, instructions,
# system_message -- the prompt word ends the name (optionally + _TEXT / _TEMPLATE / _V2 ...), so
# PROMPT_INJECTION_SAMPLE or prompt_count are not prompts
PROMPT_NAME = re.compile(r"(prompt|instructions?|system_?message)s?(_?(text|template|tmpl|str|string|msg|base|body|prefix|suffix"
                         r"|header|footer|parts?|lines?|v?\d+))?$", re.I)
# a function whose return value is a prompt: build_prompt, get_system_prompt, renderPromptTemplate
# (not prompt_user / promptForPassword, where "prompt" is a verb)
FUNC_PROMPT = re.compile(r"prompts?_?(text|template|tmpl|str|string)?$", re.I)
EXAMPLE_WORDS = {"example", "examples", "fewshot", "few", "shot", "shots", "demo", "demos", "demonstration", "demonstrations",
                 "exemplar", "exemplars"}
# a record that is one few-shot example: an input-like key next to an output-like key
EXAMPLE_IN_KEYS = {"input", "inputs", "query", "question", "prompt", "user", "text"}
EXAMPLE_OUT_KEYS = {"output", "outputs", "answer", "response", "completion", "assistant", "label", "result", "ideal"}


def example_name(name):
    """True if an identifier / key names few-shot examples (EXAMPLES, few_shot, fewShotExamples, demos)."""
    words = [w.lower() for w in re.findall(r"[A-Z]?[a-z]+|[A-Z]+(?![a-z])", str(name))]
    return any(w in EXAMPLE_WORDS for w in words) and not (words == ["few"] or words == ["shot"])


def is_example_record(keys):
    ks = {norm_key(k) for k in keys}
    return bool(ks & EXAMPLE_IN_KEYS) and bool(ks & EXAMPLE_OUT_KEYS)


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
        return {"ok": False, "spans": [], "hits": [], "groups": []}
    off = _Offsets(text)
    lines = off.lines
    spans = []
    hits = []
    groups = []

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

    # v1.2: names whose value ends up in a tool description (description=X, {"description": X},
    # FOO_DESC = X, f.__doc__ = X). A collection bound to such a name is never "pattern"/"corpus".
    desc_sinks = set()
    for node in ast.walk(tree):
        vals = []
        if isinstance(node, ast.keyword) and node.arg in DESC_KW:
            vals.append(node.value)
        elif isinstance(node, ast.Dict):
            vals += [v for k, v in zip(node.keys, node.values)
                     if isinstance(k, ast.Constant) and isinstance(k.value, str) and k.value in DESC_KW]
        elif isinstance(node, (ast.Assign, ast.AnnAssign)) and node.value is not None:
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            if re.search(r"desc|description|prompt|instruction|__doc__", " ".join(_dotted(t) for t in targets), re.I):
                vals.append(node.value)
        for v in vals:
            desc_sinks.update(x.id for x in ast.walk(v) if isinstance(x, ast.Name))

    def enclosing_func(node):
        p = parents.get(node)
        while p is not None and not isinstance(p, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda, ast.Module)):
            p = parents.get(p)
        return p

    # v1.3: names whose value reaches a tool description proper (not a prompt). A description that
    # is built through a variable keeps the strict tool-description treatment (v1.2 data flow).
    tool_desc_sinks = set()
    for node in ast.walk(tree):
        vals = []
        if isinstance(node, ast.keyword) and node.arg in DESC_KW and node.arg not in ("prompt", "system_prompt"):
            vals.append(node.value)
        elif isinstance(node, ast.Dict):
            vals += [v for k, v in zip(node.keys, node.values)
                     if isinstance(k, ast.Constant) and isinstance(k.value, str) and k.value in DESC_KW
                     and k.value not in ("prompt", "system_prompt")]
        elif isinstance(node, (ast.Assign, ast.AnnAssign)) and node.value is not None:
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            if re.search(r"desc|description|__doc__", " ".join(_dotted(t) for t in targets), re.I):
                vals.append(node.value)
        elif isinstance(node, ast.Call) and len(node.args) >= 2 and \
                _dotted(node.func).rsplit(".", 1)[-1] in ("tool", "add_tool", "Tool", "register_tool"):
            vals.append(node.args[1])
        for v in vals:
            tool_desc_sinks.update(x.id for x in ast.walk(v) if isinstance(x, ast.Name))

    def prompt_step(cur, p):
        """'prompt' if the edge cur -> p puts the value into a prompt, 'stop' at a boundary, else None."""
        if isinstance(p, ast.keyword):
            if p.arg and norm_key(p.arg) in PROMPT_KEYS:
                return "prompt"
            return None
        if isinstance(p, ast.Dict):
            for k, v in zip(p.keys, p.values):
                if v is cur and isinstance(k, ast.Constant) and isinstance(k.value, str) and norm_key(k.value) in PROMPT_KEYS:
                    return "prompt"
            for k, v in zip(p.keys, p.values):
                if isinstance(k, ast.Constant) and k.value == "role" and isinstance(v, ast.Constant) \
                        and v.value in ("system", "developer"):
                    return "prompt"
            return None
        if isinstance(p, ast.Call):
            if cur is not p.func and LLM_CALL.match(_dotted(p.func).rsplit(".", 1)[-1] or ""):
                return "prompt"
            return None
        if isinstance(p, (ast.Assign, ast.AnnAssign, ast.AugAssign)):
            targets = p.targets if isinstance(p, ast.Assign) else [p.target]
            for t in targets:
                nm = _dotted(t).rsplit(".", 1)[-1] if _dotted(t) else ""
                if (nm and PROMPT_NAME.search(nm) and not (nm in tool_desc_sinks)) or nm in prompt_sinks:
                    return "prompt"
            return "stop"
        if isinstance(p, ast.Return):
            fn = enclosing_func(p)
            if isinstance(fn, (ast.FunctionDef, ast.AsyncFunctionDef)) and FUNC_PROMPT.search(fn.name):
                return "prompt"
            return "stop"
        if isinstance(p, (ast.stmt, ast.Lambda, ast.comprehension)):
            return "stop"
        return None

    # names used inside a prompt construction (messages=[{"content": guard}], SYSTEM_PROMPT = A + B)
    prompt_sinks = set()
    for _ in range(2):  # one level of indirection through another prompt-named variable is enough
        for node in ast.walk(tree):
            if not isinstance(node, ast.Name) or not isinstance(node.ctx, ast.Load):
                continue
            cur = node
            for _d in range(30):
                p = parents.get(cur)
                if p is None:
                    break
                r = prompt_step(cur, p)
                if r == "prompt":
                    if node.id not in tool_desc_sinks:
                        prompt_sinks.add(node.id)
                    break
                if r == "stop":
                    break
                cur = p

    TOOL_DESC_KEYS = DESC_KW - {"prompt", "system_prompt", "instructions"}

    def reaches_tool_desc(node):
        """True if a 'desc' string is a tool / server description proper (docstring, description=,
        {"description": ...}, FOO_DESCRIPTION = ..., server instructions=) rather than a model prompt."""
        if node in docstrings:
            return True
        cur = node
        for _d in range(40):
            p = parents.get(cur)
            if p is None:
                return False
            if isinstance(p, ast.keyword):
                if p.arg in TOOL_DESC_KEYS:
                    return True
                if p.arg == "instructions":
                    call = parents.get(p)
                    return not (isinstance(call, ast.Call) and LLM_CALL.match(_dotted(call.func).rsplit(".", 1)[-1] or ""))
                if p.arg in ("prompt", "system_prompt"):
                    return False
            elif isinstance(p, ast.Dict):
                for k, v in zip(p.keys, p.values):
                    if v is cur and isinstance(k, ast.Constant) and isinstance(k.value, str) and k.value in DESC_KW:
                        return k.value in TOOL_DESC_KEYS
            elif isinstance(p, ast.Call) and cur is not p.func and len(p.args) >= 2 and cur is p.args[1] \
                    and _dotted(p.func).rsplit(".", 1)[-1] in ("tool", "add_tool", "Tool", "register_tool"):
                return True
            elif isinstance(p, (ast.Assign, ast.AnnAssign, ast.AugAssign)):
                targets = p.targets if isinstance(p, ast.Assign) else [p.target]
                return any(re.search(r"desc|description|__doc__", _dotted(t), re.I) or
                           (isinstance(t, ast.Name) and t.id in tool_desc_sinks) for t in targets)
            elif isinstance(p, ast.stmt):
                return False
            cur = p
        return False

    def prompt_ctx(node):
        """(in_prompt, in_example) for a string node (v1.3)."""
        cur, example = node, False
        for _d in range(40):
            p = parents.get(cur)
            if p is None:
                return False, False
            if isinstance(p, ast.Dict):
                keys = [k.value for k in p.keys if isinstance(k, ast.Constant) and isinstance(k.value, str)]
                if is_example_record(keys):
                    example = True
                for k, v in zip(p.keys, p.values):
                    if v is cur and isinstance(k, ast.Constant) and isinstance(k.value, str) and example_name(k.value):
                        example = True
            if isinstance(p, ast.keyword) and p.arg and example_name(p.arg):
                example = True
            if isinstance(p, (ast.Assign, ast.AnnAssign)):
                targets = p.targets if isinstance(p, ast.Assign) else [p.target]
                if any(example_name(_dotted(t).rsplit(".", 1)[-1]) for t in targets if _dotted(t)):
                    example = True
            r = prompt_step(cur, p)
            if r == "prompt":
                return True, example
            if r == "stop":
                return False, False
            cur = p
        return False, False

    CONTAINERS = (ast.List, ast.Tuple, ast.Set, ast.Dict)

    def binding_names(node):
        """Names the value `node` is bound to: assignment targets, keyword arg, called function."""
        p = parents.get(node)
        if isinstance(p, (ast.Assign, ast.AnnAssign)):
            targets = p.targets if isinstance(p, ast.Assign) else [p.target]
            return [_dotted(t) for t in targets], any(isinstance(t, ast.Name) and t.id in desc_sinks for t in targets)
        if isinstance(p, ast.keyword):
            return [p.arg or ""], p.arg in DESC_KW
        if isinstance(p, ast.Call):
            return [_dotted(p.func)], False
        return [], False

    def corpus_ctx(node):
        """(in_corpus, outermost_container) for a string node (v1.2)."""
        names, cur, eval_rec, outer = [], node, False, None
        while True:
            p = parents.get(cur)
            if isinstance(p, (ast.BinOp, ast.JoinedStr)):
                cur = p
                continue
            if not isinstance(p, CONTAINERS):
                break
            if isinstance(p, ast.Dict):
                keys = [k.value for k in p.keys if isinstance(k, ast.Constant) and isinstance(k.value, str)]
                for k, v in zip(p.keys, p.values):
                    if v is cur and isinstance(k, ast.Constant) and isinstance(k.value, str):
                        names.append(k.value)
                if outer is None and any(is_eval_key(k) for k in keys):
                    eval_rec = True  # innermost record has an expected-outcome key
            outer = p
            cur = p
        if outer is None:
            return False, None
        bnames, to_desc = binding_names(outer)
        if to_desc:
            return False, outer
        return eval_rec or any(corpus_name(x) for x in names + bnames), outer

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
                        return "catalog" if (sib & CATALOG_KEYS or any(is_eval_key(x) for x in sib)) else "desc"
                    if PATTERN_NAME.search(k.value):
                        return "pattern"
            return "plain"
        if isinstance(p, (ast.Assign, ast.AnnAssign)):
            targets = p.targets if isinstance(p, ast.Assign) else [p.target]
            names = " ".join(_dotted(t) for t in targets)
            flows_to_desc = any(isinstance(t, ast.Name) and t.id in desc_sinks for t in targets)
            if PATTERN_NAME.search(names):
                # v1.2: `rules = "..."` that is later passed as a description is a description
                return "desc" if flows_to_desc else "pattern"
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
            role = role_of(node)
            if role in ("plain", "patternlist", "pattern"):
                in_corpus, outer = corpus_ctx(node)
                if role == "plain" and in_corpus:
                    role = "corpus"
                elif role in ("patternlist", "pattern") and outer is not None and binding_names(outer)[1]:
                    role = "desc"  # v1.2: a list/dict that is passed on as a tool description
            if role in ("plain", "corpus", "pattern", "patternlist") and node not in docstrings and reaches_tool_desc(node):
                # v1.3: any string bound to a name that is later used as a tool description
                # (NOTE = "..."; add_tool(..., description=NOTE)) is that description
                role = "desc"
            if role != "desc" or not reaches_tool_desc(node):
                # v1.3: prompt construction (a description-like name that is really a model prompt,
                # or a plain / corpus / pattern string that is placed into a prompt)
                if role in ("desc", "plain", "corpus", "patternlist", "pattern") and node not in docstrings:
                    in_prompt, in_example = prompt_ctx(node)
                    if in_prompt:
                        role = "example" if in_example else "prompt"
                    elif role == "desc":
                        role = "plain"  # prompt-like name, but neither a tool description nor sent to a model
            spans.append((s, e, "string", role))
            continue
        if isinstance(node, CONTAINERS) and not isinstance(parents.get(node), CONTAINERS) \
                and getattr(node, "end_lineno", None) is not None:
            groups.append((off.char(node.lineno, node.col_offset), off.char(node.end_lineno, node.end_col_offset)))
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
    return {"ok": True, "spans": spans, "hits": hits, "groups": groups}
