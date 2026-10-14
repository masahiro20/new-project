"""パックを zip にする。日本語のファイル名に UTF-8 フラグ（一般目的ビット11）が付くよう、Python の zipfile で作る。
使い方: python3 -I scripts/booth-pack/make-zip.py <親フォルダ> <ルートフォルダ名> <出力zip>"""
import os
import sys
import zipfile

parent, root, out = sys.argv[1:4]
base = os.path.join(parent, root)
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for dirpath, dirnames, filenames in os.walk(base):
        dirnames.sort()
        rel = os.path.relpath(dirpath, parent).replace(os.sep, "/")
        z.writestr(zipfile.ZipInfo(rel + "/", date_time=(2026, 10, 14, 0, 0, 0)), b"")
        for f in sorted(filenames):
            z.write(os.path.join(dirpath, f), rel + "/" + f)

# 点検：日本語（非ASCII）の名前には、すべて UTF-8 フラグが付いていること
with zipfile.ZipFile(out) as z:
    bad = [i.filename for i in z.infolist() if any(ord(c) > 127 for c in i.filename) and not i.flag_bits & 0x800]
    print(f"{len(z.infolist())} entries, UTF-8 flag missing: {len(bad)}")
    if bad:
        sys.exit(1)
