import { config } from "@/lib/config";
import { ogSize, renderOgImage } from "@/lib/og";

// No `runtime = "edge"` (deprecated); statically generated at build time.
export const alt = config.og.title;
export const size = ogSize;
export const contentType = "image/png";

export default function Image() {
  return renderOgImage();
}
