#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="${1:-$(grep -m1 '"version"' "$ROOT/chrome/manifest.json" | sed 's/.*"\([0-9.]*\)".*/\1/')}"
OUT="${2:-$ROOT/dist}"

mkdir -p "$OUT"
rm -f "$OUT/G-Proxy-chrome-v${VERSION}.zip" "$OUT/G-Proxy-firefox-v${VERSION}.zip"

(cd "$ROOT/chrome" && zip -qr "$OUT/G-Proxy-chrome-v${VERSION}.zip" .)
(cd "$ROOT/firefox" && zip -qr "$OUT/G-Proxy-firefox-v${VERSION}.zip" .)

echo "OK: $OUT/G-Proxy-chrome-v${VERSION}.zip"
echo "OK: $OUT/G-Proxy-firefox-v${VERSION}.zip"
