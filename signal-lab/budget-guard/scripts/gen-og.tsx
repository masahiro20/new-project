// `npm run og`: writes the OG / Twitter / favicon PNGs from product.config.ts.
// Static files instead of opengraph-image.tsx routes keep next/og (@vercel/og wasm +
// font) out of the deployed server bundle — that matters on Cloudflare Workers.
import { writeFile } from "node:fs/promises";
import { config } from "@/lib/config";
import { renderIcon, renderOgImage } from "@/lib/og";

async function save(path: string, res: Response) {
  await writeFile(path, Buffer.from(await res.arrayBuffer()));
  console.log("wrote", path);
}

await save("app/opengraph-image.png", renderOgImage());
await save("app/twitter-image.png", renderOgImage());
await save("app/icon.png", renderIcon());
await writeFile("app/opengraph-image.alt.txt", config.og.title);
await writeFile("app/twitter-image.alt.txt", config.og.title);
console.log("wrote app/*-image.alt.txt");
