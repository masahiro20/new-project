#!/usr/bin/env python3
"""Atlas Allowlist Builder - local web UI (prototype, stdlib http.server).

    python3 -I web.py [--port 8765] [--index ../data/index.json] [--fetch]

Binds 127.0.0.1 only. Single inline page (no CDN). API:
    POST /api/evaluate  {"config": "<json text>", "name": "optional display name"} -> report
    POST /api/build     {"report": {...}, "approve": ["name", ...], "by": "who", "allow_deny": false}
                        -> {"files": {"managed-mcp.json": "...", ...}}
--fetch is off by default (network access to npm/PyPI/git hosts).
"""
import argparse
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.normpath(os.path.join(HERE, "..", "scanner")))
sys.path.insert(0, HERE)

import allowlist_core as core  # noqa: E402

MAX_BODY = 2_000_000
CFG = {"index": core.DEFAULT_INDEX, "fetch": False, "port": 8765}

PAGE = r"""<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Atlas Allowlist Builder</title>
<style>
:root{--bg:#f7f7f5;--fg:#1d1d1b;--muted:#66655f;--card:#fff;--line:#dcdbd5;--ok:#1e7a46;--warn:#9a6a00;--bad:#b3261e;--accent:#2f5bd3}
@media (prefers-color-scheme: dark){:root{--bg:#171716;--fg:#ecebe6;--muted:#a3a29b;--card:#22221f;--line:#3a3934;--ok:#5cc58a;--warn:#e0b44c;--bad:#f2786f;--accent:#8aa8ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif}
main{max-width:1000px;margin:0 auto;padding:16px}
h1{font-size:20px;margin:8px 0}p.sub{color:var(--muted);margin:0 0 12px}
textarea{width:100%;min-height:180px;font:12px/1.4 ui-monospace,Menlo,monospace;padding:8px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--fg)}
button{font:inherit;padding:6px 14px;border-radius:6px;border:1px solid var(--accent);background:var(--accent);color:#fff;cursor:pointer;margin:8px 8px 0 0}
button.sec{background:transparent;color:var(--accent)}
.card{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px;margin:12px 0}
.head{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.grade{font-weight:700;font-size:18px;width:34px;height:34px;border-radius:6px;display:flex;align-items:center;justify-content:center;border:2px solid currentColor}
.approve{color:var(--ok)}.review{color:var(--warn)}.deny{color:var(--bad)}
.name{font-weight:600;font-size:15px}.muted{color:var(--muted)}
ul{margin:6px 0;padding-left:18px}code,.ev{font:12px ui-monospace,Menlo,monospace;word-break:break-all}
.ev{color:var(--muted)}label.pick{margin-left:auto;display:flex;gap:6px;align-items:center}
#err{color:var(--bad);white-space:pre-wrap}#files a{display:inline-block;margin:4px 12px 4px 0}
</style></head><body><main>
<h1>Atlas Allowlist Builder <span class="muted">/ 許可リスト作成</span></h1>
<p class="sub">MCP 設定（.mcp.json / managed-mcp.json / Claude Desktop / VS Code mcp.json）またはスキル一覧 JSON を貼り付けてください。
Paste an MCP config or a skill list. Nothing is installed or executed; verdicts report detected patterns (パターンを検出), not intent.</p>
<textarea id="cfg" spellcheck="false" placeholder='{"mcpServers": {"filesystem": {"command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem@2025.8.21", "/srv"]}}}'></textarea>
<div><button id="go">Evaluate / 評価</button><span id="mode" class="muted"></span></div>
<div id="err"></div>
<div id="out"></div>
<div id="buildbox" style="display:none" class="card">
  <div>Approver / 承認者: <input id="by" style="font:inherit;padding:3px 6px"></div>
  <button id="build">Generate allowlists / 許可リスト生成</button>
  <button class="sec" id="dlreport">Download report.json</button>
  <div id="files"></div>
</div>
</main>
<script>
"use strict";
let REPORT=null;
const $=id=>document.getElementById(id);
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;}
async function post(path,body){
  const r=await fetch(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const j=await r.json();if(!r.ok)throw new Error(j.error||r.statusText);return j;}
function dl(name,text){const a=el("a",null,name);a.href=URL.createObjectURL(new Blob([text],{type:"application/octet-stream"}));a.download=name;return a;}
function render(rep){
  const out=$("out");out.textContent="";
  out.appendChild(el("p","muted","Index: "+(rep.index?rep.index.path+" ("+rep.index.entries+" entries)":"none")+" | fetch: "+(rep.fetch?"on":"off")+" | formats checked "+rep.docs_checked));
  rep.items.forEach((it,idx)=>{
    const c=el("div","card");const h=el("div","head");
    h.appendChild(el("div","grade "+it.recommendation,it.grade));
    const t=el("div");t.appendChild(el("div","name",it.name+"  ("+it.kind+")"));t.appendChild(el("div",it.recommendation,it.verdict));h.appendChild(t);
    const lab=el("label","pick");const cb=document.createElement("input");cb.type="checkbox";cb.dataset.name=it.name;cb.dataset.rec=it.recommendation;
    cb.checked=it.recommendation==="approve";lab.appendChild(cb);lab.appendChild(document.createTextNode(it.recommendation==="deny"?"approve (override) / 上書き承認":"approve / 承認"));h.appendChild(lab);
    c.appendChild(h);
    c.appendChild(el("div","muted",it.scan_label));
    const ul=el("ul");it.reasons.forEach(r=>ul.appendChild(el("li",null,r)));c.appendChild(ul);
    if(it.evidence.length){c.appendChild(el("div",null,"Evidence / 根拠:"));const ev=el("ul");it.evidence.forEach(e=>ev.appendChild(el("li","ev",e)));c.appendChild(ev);}
    out.appendChild(c);});
  $("buildbox").style.display="block";$("files").textContent="";}
$("go").onclick=async()=>{$("err").textContent="";$("out").textContent="evaluating...";
  try{REPORT=await post("/api/evaluate",{config:$("cfg").value});render(REPORT);}catch(e){$("out").textContent="";$("err").textContent=String(e.message||e);}};
$("dlreport").onclick=()=>{if(REPORT){const a=dl("report.json",JSON.stringify(REPORT,null,1));a.click();}};
$("build").onclick=async()=>{$("err").textContent="";
  const picks=[...document.querySelectorAll("input[type=checkbox][data-name]")].filter(x=>x.checked);
  const deny=picks.filter(x=>x.dataset.rec==="deny").map(x=>x.dataset.name);
  if(deny.length&&!confirm("Approve items Atlas recommends to deny? / 拒否推奨の項目を承認しますか？\n"+deny.join(", ")))return;
  try{const r=await post("/api/build",{report:REPORT,approve:picks.map(x=>x.dataset.name),by:$("by").value,allow_deny:deny.length>0});
    const f=$("files");f.textContent="";Object.entries(r.files).forEach(([n,t])=>f.appendChild(dl(n,t)));}
  catch(e){$("err").textContent=String(e.message||e);}};
</script></body></html>
"""


class Handler(BaseHTTPRequestHandler):
    server_version = "atlas-allowlist/0.1"

    def log_message(self, fmt, *args):
        sys.stderr.write("[web] " + (fmt % args) + "\n")

    def _host_ok(self):
        host = (self.headers.get("Host") or "").lower()
        port = CFG["port"]
        return host in (f"127.0.0.1:{port}", f"localhost:{port}")  # DNS-rebinding guard

    def _send(self, code, body, ctype="application/json; charset=utf-8"):
        data = body.encode("utf-8") if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Security-Policy",
                         "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; "
                         "connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'")
        self.end_headers()
        self.wfile.write(data)

    def _json(self, code, obj):
        self._send(code, json.dumps(obj, ensure_ascii=False))

    def do_GET(self):
        if not self._host_ok():
            return self._json(403, {"error": "bad Host header"})
        if self.path in ("/", "/index.html"):
            return self._send(200, PAGE, "text/html; charset=utf-8")
        return self._json(404, {"error": "not found"})

    def do_POST(self):
        if not self._host_ok():
            return self._json(403, {"error": "bad Host header"})
        if not (self.headers.get("Content-Type") or "").startswith("application/json"):
            return self._json(415, {"error": "Content-Type must be application/json"})
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            n = 0
        if n <= 0 or n > MAX_BODY:
            return self._json(413, {"error": "body missing or too large"})
        try:
            body = json.loads(self.rfile.read(n).decode("utf-8"))
        except ValueError:
            return self._json(400, {"error": "invalid JSON body"})
        try:
            if self.path == "/api/evaluate":
                text = body.get("config")
                if not isinstance(text, str) or not text.strip():
                    return self._json(400, {"error": "'config' (JSON text) is required"})
                rep = core.evaluate(text, index_path=CFG["index"], fetch=CFG["fetch"],
                                    display=str(body.get("name") or "pasted-config")[:80])
                return self._json(200, rep)
            if self.path == "/api/build":
                rep = body.get("report")
                if not isinstance(rep, dict) or not isinstance(rep.get("items"), list):
                    return self._json(400, {"error": "'report' from /api/evaluate is required"})
                approve = body.get("approve") or []
                if not isinstance(approve, list):
                    return self._json(400, {"error": "'approve' must be a list of names"})
                files = core.build_outputs(rep, approve=[str(x) for x in approve],
                                           by=str(body.get("by") or "web-ui")[:80],
                                           allow_deny=bool(body.get("allow_deny")))
                return self._json(200, {"files": files})
        except (ValueError, KeyError, TypeError) as e:
            return self._json(400, {"error": f"{type(e).__name__}: {e}"})
        return self._json(404, {"error": "not found"})


def main(argv=None):
    ap = argparse.ArgumentParser(prog="web.py")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--index", default=core.DEFAULT_INDEX)
    ap.add_argument("--fetch", action="store_true", help="allow network fetch+clone (off by default)")
    a = ap.parse_args(argv)
    CFG.update(index=a.index, fetch=a.fetch, port=a.port)
    srv = ThreadingHTTPServer(("127.0.0.1", a.port), Handler)  # loopback only, by design
    print(f"Atlas Allowlist Builder on http://127.0.0.1:{a.port}/ (fetch={'on' if a.fetch else 'off'})", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()


if __name__ == "__main__":
    main()
