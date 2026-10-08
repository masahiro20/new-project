import { ImageResponse } from "next/og";
import { config } from "./config";

// Uses ImageResponse's bundled Latin font, so og.title/subtitle are validated as
// Latin-only in lib/config.ts. For Japanese text, load a subsetted .ttf/.otf/.woff
// (≤500KB total bundle) via the `fonts` option — see README.
export const ogSize = { width: 1200, height: 630 };

export function renderOgImage(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          background: config.brand.color,
          color: config.brand.ink,
        }}
      >
        <div style={{ fontSize: 88, fontWeight: 800, lineHeight: 1.1 }}>{config.og.title}</div>
        <div style={{ fontSize: 40, marginTop: 24, opacity: 0.9 }}>{config.og.subtitle}</div>
      </div>
    ),
    ogSize,
  );
}
