#!/usr/bin/env bash

set -euo pipefail

npm run package

INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/bin}"

mkdir -p "$INSTALL_DIR"

APP_PATH="$PWD/out/machole-darwin-arm64/machole.app"

codesign --force --deep --sign - "$APP_PATH"

cat > "$INSTALL_DIR/machole" <<EOF
#!/usr/bin/env bash
APP="$APP_PATH"
if [ ! -d "\$APP" ]; then
  echo "machole app bundle not found at \$APP" >&2
  exit 1
fi
exec open -a "\$APP"
EOF

chmod +x "$INSTALL_DIR/machole"

echo "Installed machole launcher at $INSTALL_DIR/machole"
