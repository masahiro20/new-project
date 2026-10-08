"""Inline engine.js + samples.json into the single-file demo.

dist/allowlist-builder-demo.html  standalone page (own <head> with a CSP that forbids any network access)
dist/artifact.html                body fragment for the Artifact publisher (it adds its own skeleton)
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CSP = ("default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; "
       "connect-src 'none'; form-action 'none'; base-uri 'none'")


def main():
    page = open(os.path.join(HERE, "page.html"), encoding="utf-8").read()
    engine = open(os.path.join(HERE, "engine.js"), encoding="utf-8").read()
    samples = json.load(open(os.path.join(HERE, "samples.json"), encoding="utf-8"))
    data = json.dumps(samples, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    if "</script" in engine.lower():
        sys.exit("engine.js must not contain </script")
    for ph in ("/*__ENGINE__*/", "/*__SAMPLES__*/"):
        if page.count(ph) != 1:
            sys.exit("placeholder missing or duplicated: " + ph)
    body = page.replace("/*__ENGINE__*/", engine).replace("/*__SAMPLES__*/", data)
    title_end = body.index("</title>") + len("</title>")
    standalone = ("<!doctype html>\n<html lang=\"ja\">\n<head>\n<meta charset=\"utf-8\">\n"
                  "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n"
                  f"<meta http-equiv=\"Content-Security-Policy\" content=\"{CSP}\">\n"
                  + body[:title_end] + "\n</head>\n<body>\n" + body[title_end:] + "\n</body>\n</html>\n")
    out = os.path.join(HERE, "dist")
    os.makedirs(out, exist_ok=True)
    open(os.path.join(out, "allowlist-builder-demo.html"), "w", encoding="utf-8").write(standalone)
    open(os.path.join(out, "artifact.html"), "w", encoding="utf-8").write(body)
    print("wrote", len(standalone.encode()), "bytes")


if __name__ == "__main__":
    main()
