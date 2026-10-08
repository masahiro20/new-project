import { config } from "@/lib/config";
import { ogSize, renderOgImage } from "@/lib/og";

export const alt = config.og.title;
export const size = ogSize;
export const contentType = "image/png";

export default function Image() {
  return renderOgImage();
}
