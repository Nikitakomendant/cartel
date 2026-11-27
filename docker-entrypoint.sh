#!/bin/sh
# Persistent disks (Render, Fly, Docker volumes) are mounted root-owned.
# Fix ownership of the data dirs, then drop privileges to the unprivileged "node" user.
set -e
DATA="${DATA_DIR:-/app/data}"
UPLOADS="${UPLOAD_DIR:-/app/uploads}"
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA" "$UPLOADS"
  chown -R node:node "$DATA" "$UPLOADS"
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi
exec "$@"
