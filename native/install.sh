#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELAY_PY="$SCRIPT_DIR/proxy_relay.py"
HOST_NAME="com.qerakl.proxy_relay"

chmod +x "$RELAY_PY"

echo "=== Proxy Plugin: установка SOCKS5 relay ==="
echo ""
echo "1. Открой chrome://extensions/"
echo "2. Включи «Режим разработчика»"
echo "3. Скопируй ID расширения Proxy Plugin"
echo ""
read -rp "ID расширения: " EXT_ID

if [[ -z "$EXT_ID" ]]; then
  echo "ID не указан, выход."
  exit 1
fi

MANIFEST=$(cat <<EOF
{
  "name": "$HOST_NAME",
  "description": "Proxy Plugin SOCKS5 relay for Chrome",
  "path": "$RELAY_PY",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://${EXT_ID}/"
  ]
}
EOF
)

CHROME_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
CHROMIUM_DIR="$HOME/.config/chromium/NativeMessagingHosts"

mkdir -p "$CHROME_DIR" "$CHROMIUM_DIR"
echo "$MANIFEST" > "$CHROME_DIR/$HOST_NAME.json"
echo "$MANIFEST" > "$CHROMIUM_DIR/$HOST_NAME.json"

echo ""
echo "Готово! Native host установлен:"
echo "  $CHROME_DIR/$HOST_NAME.json"
echo ""
echo "Перезагрузи расширение в Chrome и попробуй снова."
