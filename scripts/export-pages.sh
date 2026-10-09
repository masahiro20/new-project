#!/usr/bin/env bash
# Builds the site as static files into out/ for GitHub Pages.
# API routes are set aside during the build (the static site has no server) and restored afterwards.
#
# The one switch for the paid version (docs/paid-launch.md):
#   NEXT_PUBLIC_PAID_API_URL=https://gensan-zero-api.<sub>.workers.dev  → purchase and AI generation on,
#     calling that Worker. NEXT_PUBLIC_PAYMENTS_MODE=stripe for real billing (default demo).
#   Unset → free mode (no purchase flow). LAUNCH_MODE= (empty) shows the in-browser demo purchase only.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -n "${NEXT_PUBLIC_PAID_API_URL:-}" ]; then
  default_launch=""
else
  default_launch="free"
fi
# 特定商取引法の表記 is published only with live billing; otherwise its placeholders stay private.
live_billing=""
if [ -n "${NEXT_PUBLIC_PAID_API_URL:-}" ] && [ "${NEXT_PUBLIC_PAYMENTS_MODE:-demo}" = "stripe" ]; then
  live_billing=1
fi

stash=$(mktemp -d)
restore() {
  [ -d "$stash/api" ] && mv "$stash/api" app/api
  [ -d "$stash/legal" ] && mv "$stash/legal" app/legal
  rmdir "$stash" 2>/dev/null || true
}
trap restore EXIT
mv app/api "$stash/api"
[ -n "$live_billing" ] || mv app/legal "$stash/legal"

STATIC_EXPORT=1 LAUNCH_MODE="${LAUNCH_MODE-$default_launch}" \
  NEXT_PUBLIC_SITE_URL="${NEXT_PUBLIC_SITE_URL:-https://masahiro20.github.io/new-project}" \
  npx next build

touch out/.nojekyll
[ -f out/404.html ] || cp out/index.html out/404.html
echo "static site ready in out/ (paid API: ${NEXT_PUBLIC_PAID_API_URL:-none}, payments: ${NEXT_PUBLIC_PAYMENTS_MODE:-demo})"
