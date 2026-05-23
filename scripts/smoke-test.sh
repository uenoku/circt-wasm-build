#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WASM_BUILD_DIR="${CIRCT_WASM_BUILD_DIR:-$ROOT_DIR/build/wasm}"
TARGETS="${CIRCT_WASM_TARGETS:-circt-opt firtool circt-synth circt-verilog arcilator}"

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

if [[ " $TARGETS " == *" firtool "* ]]; then
  echo "Smoke testing firtool FIRRTL lowering"
  firtool_output="$(
    node "$WASM_BUILD_DIR/bin/firtool.js" \
      --disable-all-randomization \
      --strip-debug-info \
      -format=fir - <<'FIR'
FIRRTL version 4.0.0
circuit FIRFilter:
  public module FIRFilter:
    input clock: Clock
    input in: UInt<8>
    output out: UInt<11>

    reg x1: UInt<8>, clock
    reg x2: UInt<8>, clock

    connect x1, in
    connect x2, x1

    node tap0 = pad(in, 11)
    node tap1 = mul(pad(x1, 11), UInt<2>(2))
    node tap2 = mul(pad(x2, 11), UInt<2>(3))
    node sum01 = add(tap0, tap1)
    node sum = add(sum01, tap2)
    connect out, bits(sum, 10, 0)
FIR
  )"
  if [[ "$firtool_output" != *"module FIRFilter"* ]]; then
    echo "error: firtool sample did not emit FIRFilter Verilog" >&2
    exit 1
  fi
fi

echo "Smoke tests passed"
