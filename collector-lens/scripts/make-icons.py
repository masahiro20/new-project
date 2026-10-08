# Draws simple placeholder icons (a lens ring) without external libraries.
import struct, zlib, math, sys, os
def png(size, path):
    rows = []
    c = (size - 1) / 2
    for y in range(size):
        row = b"\x00"
        for x in range(size):
            d = math.hypot(x - c, y - c) / (size / 2)
            if 0.55 <= d <= 0.9:
                px = (31, 58, 147, 255)
            elif d < 0.55:
                px = (230, 236, 250, 255)
            else:
                px = (0, 0, 0, 0)
            row += bytes(px)
        rows.append(row)
    raw = b"".join(rows)
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    open(path, "wb").write(data)
out = sys.argv[1]
for s in (16, 48, 128):
    png(s, os.path.join(out, f"icon{s}.png"))
