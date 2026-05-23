# CIRCT WASM Build

This repository builds selected [CIRCT](https://github.com/llvm/circt) tools to
WebAssembly with Emscripten. CIRCT is tracked as a submodule so the build is
repeatable against a pinned upstream revision.

## Quick Start

Install the host dependencies:

- CMake
- Ninja
- Python 3
- a C++17 host compiler
- Emscripten SDK with `emcmake` and `node` on `PATH`

Then run:

```sh
git submodule update --init --recursive
./scripts/build-wasm.sh
./scripts/smoke-test.sh
```

By default this builds `circt-opt`, `firtool`, `circt-synth`, and
`circt-verilog` into `build/wasm/bin`. The Emscripten build enables CIRCT's
CaDiCaL integration by default, which gives synthesis passes an in-process SAT
solver. It also enables the slang-backed Verilog frontend by default.

## Configuration

The scripts are configured through environment variables:

| Variable | Default | Description |
| --- | --- | --- |
| `CIRCT_WASM_TARGETS` | `circt-opt firtool circt-synth circt-verilog` | CMake targets to build. |
| `CIRCT_CADICAL_ENABLED` | `ON` | Enable CIRCT's CaDiCaL SAT solver in the Emscripten build. |
| `CIRCT_SLANG_FRONTEND_ENABLED` | `ON` | Enable CIRCT's slang-backed Verilog frontend in the Emscripten build. |
| `CIRCT_WASM_BUILD_DIR` | `build/wasm` | Emscripten build directory. |
| `CIRCT_WASM_HOST_BUILD_DIR` | `build/host` | Native build directory for tablegen tools. |
| `CIRCT_WASM_PATCH_DIR` | `patches` | Patch directory applied to the CIRCT submodule before build. |
| `CIRCT_WASM_CXX_FLAGS` | `-Wno-c++11-narrowing` | Extra C++ flags for the Emscripten build. |
| `EM_CACHE` | `.cache/emscripten` | Emscripten cache location. |
| `CMAKE_BUILD_TYPE` | `Release` | Build type used for both stages. |
| `LLVM_ENABLE_ASSERTIONS` | `ON` | Assertion setting used for both stages. |
| `CMAKE_BUILD_PARALLEL_LEVEL` | host CPU count | Parallel build jobs. |

Example:

```sh
CIRCT_WASM_TARGETS="circt-opt firtool circt-synth circt-verilog circt-translate" ./scripts/build-wasm.sh
```

The generated tools are Node-compatible Emscripten launchers, for example:

```sh
node build/wasm/bin/circt-opt.js --version
```

The generated launchers are also browser-compatible. A small in-browser runner
is available under `examples/web`; serve the repository root over HTTP and open
that directory after building.

## Local CIRCT Patches

The build applies patch files from `patches/` to the CIRCT submodule before
configuring. The current patch carries wasm32 portability fixes found while
building `circt-opt` and `firtool`; it is applied idempotently, so rerunning the
script in an already patched checkout is fine.

## CI

`.github/workflows/wasm.yml` runs the same build on pull requests, pushes to
`main`, and manual dispatches. The workflow checks out submodules, installs the
Emscripten SDK, builds the configured tools, runs the smoke test, and uploads the
`.js` and `.wasm` outputs as an artifact.
