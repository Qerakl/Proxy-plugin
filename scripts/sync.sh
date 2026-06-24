#!/usr/bin/env bash
# Копирует общие файлы (lib, popup, icons) в chrome/ и firefox/
# Запускать после правок в корневых lib/, popup/ или icons/
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SHARED=(lib popup icons)

for target in chrome firefox; do
  dir="$ROOT/$target"
  mkdir -p "$dir"
  for name in "${SHARED[@]}"; do
    rm -rf "$dir/$name"
    cp -R "$ROOT/$name" "$dir/$name"
  done
  echo "✓ $target"
done

echo "Готово. Chrome: $ROOT/chrome  |  Firefox: $ROOT/firefox"
