#!/usr/bin/env bash

set -euo pipefail

npm run package

mkdir -p "$HOME/.local/bin"

APP_PATH="$PWD/out/machole-darwin-arm64/machole.app"

codesign --force --deep --sign - "$APP_PATH"

cat > "$HOME/.local/bin/machole" <<EOF
#!/usr/bin/env bash
APP="$APP_PATH"
if [ ! -d "\$APP" ]; then
  echo "machole app bundle not found at \$APP" >&2
  exit 1
fi
exec open -a "\$APP"
EOF

chmod +x "$HOME/.local/bin/machole"

echo "Installed machole launcher at $HOME/.local/bin/machole"
