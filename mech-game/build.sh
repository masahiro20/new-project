#!/usr/bin/env bash
# src/ から単一ファイルのゲームを作る（audio.js をゲームのスクリプトの前に埋め込む）。
# 出力:
#   index.html                 単体で開けるページ（Three.js は cdnjs から読む）
#   dist/artifact.html         アーティファクト公開用（外側の HTML 骨組みは公開時に付く）
#   dist/grandstride-crazygames.zip  CrazyGames 用（itch 版 + SDK v3 + src/crazygames.js。SDK 以外の外部通信なし）
#   dist/grandstride-itch.zip  itch.io 用。index.html がルートにあり、Three.js r128 とフォントを
#                              vendor/ から同梱。外部の CDN には通信しない
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
// CrazyGames build: same local Three.js/fonts as itch, plus the SDK v3 script and src/crazygames.js.
// The game body is wrapped in window.__gsStart so it starts after SDK init (the save lives in the SDK Data module).
const head0="(function(){\n\x27use strict\x27;\n\n/* ================= utilities";
const tail0="requestAnimationFrame(frame);\n})();\n</script>";
if(itch.split(head0).length!==2||itch.split(tail0).length!==2) throw new Error("game wrapper markers not found");
let cgBody=itch.replace(head0,"window.__gsStart=function(){\n\x27use strict\x27;\n\n/* ================= utilities").replace(tail0,"requestAnimationFrame(frame);\n};\n</script>\n<script>\n"+fs.readFileSync("src/crazygames.js","utf8")+"\n</script>");
const cgHead="<!doctype html>\n<html lang=\"ja\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\">\n<script src=\"https://sdk.crazygames.com/crazygames-sdk-v3.js\"></script>\n<style>body{-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none;-webkit-touch-callout:none}</style>\n</head>\n<body>\n";
fs.rmSync("dist/crazygames",{recursive:true,force:true});
fs.mkdirSync("dist/crazygames/fonts",{recursive:true});
fs.writeFileSync("dist/crazygames/index.html", cgHead+cgBody+"\n</body>\n</html>\n");
for(const f of ["three.r128.min.js","LICENSES.txt"]) fs.copyFileSync("dist/itch/"+f,"dist/crazygames/"+f);
for(const f of fs.readdirSync("dist/itch/fonts")) fs.copyFileSync("dist/itch/fonts/"+f,"dist/crazygames/fonts/"+f);
console.log("built index.html, dist/artifact.html, dist/itch/");
'
rm -f dist/grandstride-itch.zip
(cd dist/itch && zip -qrX ../grandstride-itch.zip .)
echo "built dist/grandstride-itch.zip ($(du -k dist/grandstride-itch.zip | cut -f1) KB)"
rm -f dist/grandstride-crazygames.zip
(cd dist/crazygames && zip -qrX ../grandstride-crazygames.zip .)
echo "built dist/grandstride-crazygames.zip ($(du -k dist/grandstride-crazygames.zip | cut -f1) KB)"
