"""Merge panels-a.json and panels-b.json into data.js for the reader page.
Usage: python3 build.py
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
panels = []
for part in ("a", "b"):
    path = os.path.join(HERE, f"panels-{part}.json")
    if not os.path.exists(path):
        print("missing", path)
        continue
    with open(path, encoding="utf-8") as f:
        for p in json.load(f)["panels"]:
            if os.path.exists(os.path.join(HERE, "panels", p["file"])):
                panels.append({"no": p["no"], "file": p["file"], "gap": int(p.get("gap_after", 60)), "note": p.get("note", "")})
            else:
                print("missing panel", p["file"])
panels.sort(key=lambda p: p["no"])
with open(os.path.join(HERE, "data.js"), "w", encoding="utf-8") as f:
    f.write("window.WT01 = " + json.dumps({"panels": panels}, ensure_ascii=False) + ";\n")
print(len(panels), "panels")
