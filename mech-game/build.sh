#!/usr/bin/env bash
# Builds the single-file game from src/: inlines audio.js before the game script.
# Outputs:
#   index.html          standalone page (open directly in a browser)
#   dist/artifact.html  body-only page for the Artifact publisher (it adds its own skeleton)
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p dist
node -e '
const fs=require("fs");
const game=fs.readFileSync("src/game.html","utf8");
const audio=fs.readFileSync("src/audio.js","utf8");
const marker="<script src=\"https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js\"></script>";
if(!game.includes(marker)) throw new Error("three.js r128 script tag not found in src/game.html");
const body=game.replace(marker, marker+"\n<script>\n"+audio+"\n</script>");
fs.writeFileSync("dist/artifact.html", body);
fs.writeFileSync("index.html","<!doctype html>\n<html lang=\"ja\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\">\n</head>\n<body>\n"+body+"\n</body>\n</html>\n");
console.log("built index.html and dist/artifact.html");
'
