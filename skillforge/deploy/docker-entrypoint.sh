#!/bin/sh
# Container entrypoint: make the data volume writable for the `node` user, then drop root.
set -eu
DATA="${KOTOMARK_DATA_DIR:-/data}"
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA"
  chown -R 1000:1000 "$DATA"
  chmod 0700 "$DATA"
  exec setpriv --reuid=1000 --regid=1000 --clear-groups -- "$@"
fi
exec "$@"
