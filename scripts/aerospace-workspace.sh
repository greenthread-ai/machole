#!/usr/bin/env bash

set -euo pipefail

if ! command -v aerospace >/dev/null 2>&1; then
  exit 1
fi

TARGET_WORKSPACE="${1:-}"
if [ -z "$TARGET_WORKSPACE" ]; then
  echo "usage: $0 <workspace>" >&2
  exit 1
fi

APP_BUNDLE_ID="${MACHOLE_AEROSPACE_APP_BUNDLE_ID:-}"

if [ -n "$APP_BUNDLE_ID" ]; then
  WINDOW_IDS="$(aerospace list-windows --all --app-bundle-id "$APP_BUNDLE_ID" --format '%{window-id}' 2>/dev/null || true)"
else
  WINDOW_IDS="$(aerospace list-windows --all --format '%{window-id}\t%{app-name}\t%{app-bundle-id}' 2>/dev/null | awk -F '\t' '
    BEGIN { IGNORECASE = 1 }
    /machole/ { print $1 }
  ' || true)"
fi

while IFS= read -r WINDOW_ID; do
  if [ -z "$WINDOW_ID" ]; then
    continue
  fi

  aerospace move-node-to-workspace --window-id "$WINDOW_ID" "$TARGET_WORKSPACE" >/dev/null 2>&1 || true
  aerospace layout floating --window-id "$WINDOW_ID" >/dev/null 2>&1 || true
done <<< "$WINDOW_IDS"

aerospace workspace "$TARGET_WORKSPACE"
