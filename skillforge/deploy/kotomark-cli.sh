#!/bin/sh
# `kotomark` inside the container (e.g. `kotomark token create alice --plan solo`).
# Always runs as the `node` user so tokens.json stays readable by the server (it is written 0600).
if [ "$(id -u)" = "0" ]; then
  exec setpriv --reuid=1000 --regid=1000 --clear-groups -- node /app/dist/kotomark.mjs "$@"
fi
exec node /app/dist/kotomark.mjs "$@"
