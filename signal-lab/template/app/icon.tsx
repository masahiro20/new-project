import { ImageResponse } from "next/og";
import { config } from "@/lib/config";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 7,
          background: config.brand.color,
          color: config.brand.ink,
          fontSize: 22,
          fontWeight: 800,
        }}
      >
        {config.og.title.charAt(0).toUpperCase()}
      </div>
    ),
    size,
  );
}
