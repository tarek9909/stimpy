#!/usr/bin/env bash
# Renders src/*.svg to out/preview (750x1000) and out/print (3543x4724, 300 dpi at 30x40 cm) with headless Chrome.
# Usage: render.sh [name ...]   e.g. render.sh 01-matchbox   (no args renders everything)
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
CHROME="${CHROME:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
mkdir -p "$DIR/out/preview" "$DIR/out/print"
winpath() { cygpath -w "$1" 2>/dev/null || echo "$1"; }

names=("$@")
if [ ${#names[@]} -eq 0 ]; then
  for f in "$DIR"/src/*.svg; do names+=("$(basename "$f" .svg)"); done
fi

PROFILE="$(mktemp -d)"   # one profile per run so parallel renders don't collide
trap 'rm -rf "$PROFILE"' EXIT

shot() { # $1 svg, $2 png, $3 scale
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --no-first-run --no-default-browser-check \
    --user-data-dir="$(winpath "$PROFILE")" \
    --window-size=3000,4000 --force-device-scale-factor="$3" --virtual-time-budget=8000 \
    --screenshot="$(winpath "$2")" "file:///$(winpath "$1" | sed 's|\\|/|g')" >/dev/null 2>&1
}

for n in "${names[@]}"; do
  svg="$DIR/src/$n.svg"
  [ -f "$svg" ] || { echo "missing $svg"; continue; }
  shot "$svg" "$DIR/out/preview/$n.png" 0.25
  [ "${PREVIEW_ONLY:-0}" = 1 ] || shot "$svg" "$DIR/out/print/$n.png" 1.181
  echo "rendered $n"
done
