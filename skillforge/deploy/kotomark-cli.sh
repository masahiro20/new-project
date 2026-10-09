#!/bin/sh
# `kotomark` inside the container. `kotomark token …` (operator commands: create / list / revoke API tokens) runs the
# server's admin entry, which is not part of the public CLI bundle; everything else runs the CLI.
# Always runs as the `node` user so tokens.json stays readable by the server (it is written 0600).
entry=/app/dist/kotomark.mjs
[ "$1" = "token" ] && entry=/app/dist/server/admin.js
if [ "$(id -u)" = "0" ]; then
  exec setpriv --reuid=1000 --regid=1000 --clear-groups -- node "$entry" "$@"
fi
exec node "$entry" "$@"
