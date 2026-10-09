#!/usr/bin/env bash
# Builds the free-mode site as static files into out/ for GitHub Pages.
# API routes and /legal (sales only) are set aside during the build and restored afterwards.
set -euo pipefail
cd "$(dirname "$0")/.."

stash=$(mktemp -d)
restore() {
  [ -d "$stash/api" ] && mv "$stash/api" app/api
  [ -d "$stash/legal" ] && mv "$stash/legal" app/legal
  rmdir "$stash" 2>/dev/null || true
}
trap restore EXIT
mv app/api "$stash/api"
mv app/legal "$stash/legal"

STATIC_EXPORT=1 LAUNCH_MODE=free \
  NEXT_PUBLIC_SITE_URL="${NEXT_PUBLIC_SITE_URL:-https://masahiro20.github.io/new-project}" \
  npx next build

touch out/.nojekyll
[ -f out/404.html ] || cp out/index.html out/404.html
echo "static site ready in out/"
