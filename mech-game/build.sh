#!/usr/bin/env bash
# Builds the single-file game from src/: inlines audio.js before the game script.
# Outputs:
#   index.html                 standalone page (open directly in a browser; Three.js from cdnjs)
#   dist/artifact.html         body-only page for the Artifact publisher (it adds its own skeleton)
#   dist/grandstride-itch.zip  itch.io HTML5 upload: index.html at the root, Three.js r128 and
#                              fonts bundled from vendor/, no external CDN requests
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p dist
node -e '
const fs=require("fs");
const game=fs.readFileSync("src/game.html","utf8");
const audio=fs.readFileSync("src/audio.js","utf8");
const three="<script src=\"https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js\"></script>";
const fonts=/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/[^"]*">/;
if(!game.includes(three)) throw new Error("three.js r128 script tag not found in src/game.html");
if(!fonts.test(game)) throw new Error("Google Fonts link not found in src/game.html");
const wrap=b=>"<!doctype html>\n<html lang=\"ja\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\">\n</head>\n<body>\n"+b+"\n</body>\n</html>\n";
const body=game.replace(three, three+"\n<script>\n"+audio+"\n</script>");
fs.writeFileSync("dist/artifact.html", body);
fs.writeFileSync("index.html", wrap(body));
// itch.io build: local Three.js and fonts only
const face=(fam,w,file)=>"@font-face{font-family:\x27"+fam+"\x27;font-style:normal;font-weight:"+w+";font-display:swap;src:url(fonts/"+file+") format(\x27woff2\x27)}";
const fontCss="<style>"+[face("Chakra Petch",400,"ChakraPetch-400.woff2"),face("Chakra Petch",600,"ChakraPetch-600.woff2"),face("Chakra Petch",700,"ChakraPetch-700.woff2"),face("Share Tech Mono",400,"ShareTechMono-400.woff2")].join("")+"</style>";
const itch=body.replace(three,"<script src=\"three.r128.min.js\"></script>").replace(fonts,fontCss);
if(/https:\/\/(cdnjs|fonts\.g)/.test(itch)) throw new Error("itch build still references an external CDN");
fs.rmSync("dist/itch",{recursive:true,force:true});
fs.mkdirSync("dist/itch/fonts",{recursive:true});
fs.writeFileSync("dist/itch/index.html", wrap(itch));
fs.copyFileSync("vendor/three.r128.min.js","dist/itch/three.r128.min.js");
for(const f of fs.readdirSync("vendor/fonts")) fs.copyFileSync("vendor/fonts/"+f,"dist/itch/fonts/"+f);
fs.writeFileSync("dist/itch/LICENSES.txt","Three.js r128 (MIT)\n\n"+fs.readFileSync("vendor/three.LICENSE.txt","utf8")+"\n\nFonts in fonts/ are licensed under the SIL Open Font License 1.1; see fonts/OFL-*.txt.\n");
console.log("built index.html, dist/artifact.html, dist/itch/");
'
rm -f dist/grandstride-itch.zip
(cd dist/itch && zip -qrX ../grandstride-itch.zip .)
echo "built dist/grandstride-itch.zip ($(du -k dist/grandstride-itch.zip | cut -f1) KB)"
