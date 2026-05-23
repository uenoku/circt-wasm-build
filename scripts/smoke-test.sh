#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WASM_BUILD_DIR="${CIRCT_WASM_BUILD_DIR:-$ROOT_DIR/build/wasm}"
TARGETS="${CIRCT_WASM_TARGETS:-circt-opt firtool}"

if ! command -v node >/dev/null 2>&1; then
  echo "error: node is required to run Emscripten outputs" >&2
  exit 1
fi

for target in $TARGETS; do
  launcher="$WASM_BUILD_DIR/bin/$target.js"
  wasm="$WASM_BUILD_DIR/bin/$target.wasm"

  if [[ ! -f "$launcher" ]]; then
    echo "error: missing launcher $launcher" >&2
    exit 1
  fi

  if [[ ! -f "$wasm" ]]; then
    echo "error: missing wasm payload $wasm" >&2
    exit 1
  fi

  echo "Smoke testing $target"
  node "$launcher" --version >/dev/null
done

echo "Smoke tests passed"
