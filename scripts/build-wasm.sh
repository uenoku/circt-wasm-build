#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CIRCT_SRC="${CIRCT_SRC:-$ROOT_DIR/circt}"
HOST_BUILD_DIR="${CIRCT_WASM_HOST_BUILD_DIR:-$ROOT_DIR/build/host}"
WASM_BUILD_DIR="${CIRCT_WASM_BUILD_DIR:-$ROOT_DIR/build/wasm}"
BUILD_TYPE="${CMAKE_BUILD_TYPE:-Release}"
ASSERTIONS="${LLVM_ENABLE_ASSERTIONS:-ON}"
DEFAULT_TARGETS="circt-opt firtool circt-synth circt-verilog arcilator"
TARGETS="${CIRCT_WASM_TARGETS:-$DEFAULT_TARGETS}"
CADICAL_ENABLED="${CIRCT_CADICAL_ENABLED:-ON}"
SLANG_FRONTEND_ENABLED="${CIRCT_SLANG_FRONTEND_ENABLED:-ON}"
MOCKTURTLE_ENABLED="${CIRCT_MOCKTURTLE_ENABLED:-OFF}"
MOCKTURTLE_PLUGIN_SRC="${CIRCT_MOCKTURTLE_PLUGIN_SRC:-$ROOT_DIR/circt-mockturtle-plugin}"

if ! command -v cmake >/dev/null 2>&1; then
  echo "error: cmake is required" >&2
  exit 1
fi

if ! command -v ninja >/dev/null 2>&1; then
  echo "error: ninja is required" >&2
  exit 1
fi

if ! command -v emcmake >/dev/null 2>&1; then
  echo "error: emcmake is required; activate the Emscripten SDK first" >&2
  exit 1
fi

apply_patches() {
  local source_dir="$1"
  local patch_dir="$2"
  local label="$3"

  [[ -d "$patch_dir" ]] || return 0

  for patch in "$patch_dir"/*.patch; do
    [[ -e "$patch" ]] || continue
    if git -C "$source_dir" apply --check "$patch" 2>/dev/null; then
      echo "Applying $label patch: $(basename "$patch")"
      git -C "$source_dir" apply "$patch"
    elif git -C "$source_dir" apply --reverse --check "$patch" 2>/dev/null; then
      echo "$label patch already applied: $(basename "$patch")"
    else
      echo "error: $label patch does not apply cleanly: $patch" >&2
      git -C "$source_dir" apply --check "$patch"
      exit 1
    fi
  done
}

if [[ ! -d "$CIRCT_SRC" ]]; then
  echo "Initializing CIRCT submodule"
  git -C "$ROOT_DIR" submodule update --init circt
fi

if [[ ! -d "$CIRCT_SRC/llvm/llvm" ]]; then
  echo "Initializing CIRCT submodules"
  git -C "$CIRCT_SRC" submodule update --init --recursive
fi

if [[ ! -d "$CIRCT_SRC/llvm/llvm" ]]; then
  echo "error: expected LLVM sources at $CIRCT_SRC/llvm/llvm" >&2
  exit 1
fi

EXTERNAL_PROJECTS="circt"
EXTERNAL_CMAKE_ARGS=(
  -DLLVM_EXTERNAL_PROJECTS="$EXTERNAL_PROJECTS"
  -DLLVM_EXTERNAL_CIRCT_SOURCE_DIR="$CIRCT_SRC"
)

if [[ "$MOCKTURTLE_ENABLED" == "ON" ]]; then
  if [[ ! -d "$MOCKTURTLE_PLUGIN_SRC" ]]; then
    echo "Initializing circt-mockturtle-plugin submodule"
    git -C "$ROOT_DIR" submodule update --init circt-mockturtle-plugin
  fi

  if [[ ! -f "$MOCKTURTLE_PLUGIN_SRC/CMakeLists.txt" ]]; then
    echo "error: expected circt-mockturtle-plugin sources at $MOCKTURTLE_PLUGIN_SRC" >&2
    exit 1
  fi

  EXTERNAL_PROJECTS="circt;circt-mockturtle-plugin"
  EXTERNAL_CMAKE_ARGS=(
    -DLLVM_EXTERNAL_PROJECTS="$EXTERNAL_PROJECTS"
    -DLLVM_EXTERNAL_CIRCT_SOURCE_DIR="$CIRCT_SRC"
    -DLLVM_EXTERNAL_CIRCT_MOCKTURTLE_PLUGIN_SOURCE_DIR="$MOCKTURTLE_PLUGIN_SRC"
    -DCIRCT_MOCKTURTLE_INCLUDE_TESTS=OFF
  )

  if [[ -z "${CIRCT_WASM_TARGETS:-}" ]]; then
    TARGETS="$TARGETS circt-mockturtle-opt"
  fi
fi

PATCH_DIR="${CIRCT_WASM_PATCH_DIR:-$ROOT_DIR/patches}"
apply_patches "$CIRCT_SRC" "$PATCH_DIR" "CIRCT"

if [[ -n "${CMAKE_BUILD_PARALLEL_LEVEL:-}" ]]; then
  PARALLEL_ARGS=(--parallel "$CMAKE_BUILD_PARALLEL_LEVEL")
else
  PARALLEL_ARGS=(--parallel)
fi

COMMON_CMAKE_ARGS=(
  -G Ninja
  -S "$CIRCT_SRC/llvm/llvm"
  -DCMAKE_BUILD_TYPE="$BUILD_TYPE"
  -DLLVM_ENABLE_ASSERTIONS="$ASSERTIONS"
  -DLLVM_ENABLE_PROJECTS=mlir
  "${EXTERNAL_CMAKE_ARGS[@]}"
  -DLLVM_INCLUDE_BENCHMARKS=OFF
  -DLLVM_INCLUDE_DOCS=OFF
  -DLLVM_INCLUDE_EXAMPLES=OFF
  -DLLVM_INCLUDE_TESTS=OFF
  -DLLVM_INSTALL_TOOLCHAIN_ONLY=ON
  -DMLIR_INCLUDE_DOCS=OFF
  -DMLIR_INCLUDE_TESTS=OFF
  -DCIRCT_INCLUDE_DOCS=OFF
  -DCIRCT_INCLUDE_TESTS=OFF
  -DCIRCT_BINDINGS_PYTHON_ENABLED=OFF
  -DCIRCT_BINDINGS_TCL_ENABLED=OFF
  -DCIRCT_SLANG_FRONTEND_ENABLED="$SLANG_FRONTEND_ENABLED"
)

echo "Configuring native tablegen build: $HOST_BUILD_DIR"
cmake "${COMMON_CMAKE_ARGS[@]}" \
  -B "$HOST_BUILD_DIR" \
  -DLLVM_TARGETS_TO_BUILD=host

echo "Building native tablegen tools"
cmake --build "$HOST_BUILD_DIR" \
  --target llvm-tblgen mlir-tblgen circt-tblgen \
  "${PARALLEL_ARGS[@]}"

# LLVM's cross-build tablegen lookup is suffix-sensitive. In an Emscripten
# configure, some target executable suffixes are ".js", so provide native host
# aliases with that suffix and let LLVM/CIRCT resolve them through
# LLVM_NATIVE_TOOL_DIR.
for tool in llvm-tblgen mlir-tblgen circt-tblgen; do
  cmake -E copy_if_different "$HOST_BUILD_DIR/bin/$tool" "$HOST_BUILD_DIR/bin/$tool.js"
done

seed_wasm_tablegen_tools() {
  cmake -E make_directory "$WASM_BUILD_DIR/bin" "$WASM_BUILD_DIR/NATIVE/bin"
  for tool in llvm-tblgen mlir-tblgen circt-tblgen; do
    cmake -E copy_if_different "$HOST_BUILD_DIR/bin/$tool" "$WASM_BUILD_DIR/bin/$tool.js"
    cmake -E copy_if_different "$HOST_BUILD_DIR/bin/$tool" "$WASM_BUILD_DIR/NATIVE/bin/$tool.js"
    chmod +x "$WASM_BUILD_DIR/bin/$tool.js" "$WASM_BUILD_DIR/NATIVE/bin/$tool.js"
  done
}

patch_wasm_tablegen_link_rules() {
  local ninja_file="$WASM_BUILD_DIR/build.ninja"
  local cmake_bin
  [[ -f "$ninja_file" ]] || return 0
  cmake_bin="$(command -v cmake)"

  for tool in llvm-tblgen mlir-tblgen circt-tblgen; do
    sed -i "/^build bin\\/${tool}\\.js:/,/^$/ s|^  POST_BUILD = .*|  POST_BUILD = ${cmake_bin} -E copy_if_different ${HOST_BUILD_DIR}/bin/${tool} ${WASM_BUILD_DIR}/bin/${tool}.js \\&\\& chmod +x ${WASM_BUILD_DIR}/bin/${tool}.js|" "$ninja_file"
  done
}

patch_wasm_native_configure_rules() {
  local ninja_file="$WASM_BUILD_DIR/build.ninja"
  [[ -f "$ninja_file" ]] || return 0
  [[ "$MOCKTURTLE_ENABLED" == "ON" ]] || return 0

  sed -i "/^  COMMAND = cd .*\\/NATIVE && .*\\/cmake / s|-DCMAKE_BUILD_TYPE=|-DLLVM_INSTALL_TOOLCHAIN_ONLY=ON -DCIRCT_MOCKTURTLE_INCLUDE_TESTS=OFF -DCMAKE_BUILD_TYPE=|" "$ninja_file"
}

WASM_LINK_FLAGS="${CIRCT_WASM_LINK_FLAGS:--sALLOW_MEMORY_GROWTH=1 -sEXIT_RUNTIME=1 -sENVIRONMENT=web,worker,node}"
WASM_CXX_FLAGS="${CIRCT_WASM_CXX_FLAGS:-${CMAKE_CXX_FLAGS:-} -Wno-c++11-narrowing}"
export EM_CACHE="${EM_CACHE:-$ROOT_DIR/.cache/emscripten}"
cmake -E make_directory "$EM_CACHE"

echo "Configuring Emscripten build: $WASM_BUILD_DIR"
emcmake cmake \
  -U LLVM_TABLEGEN \
  -U MLIR_TABLEGEN \
  -U CIRCT_TABLEGEN \
  -U LLVM_TABLEGEN_EXE \
  -U MLIR_TABLEGEN_EXE \
  -U CIRCT_TABLEGEN_EXE \
  -U LLVM_TABLEGEN_TARGET \
  -U MLIR_TABLEGEN_TARGET \
  -U CIRCT_TABLEGEN_TARGET \
  "${COMMON_CMAKE_ARGS[@]}" \
  -B "$WASM_BUILD_DIR" \
  -DCMAKE_EXECUTABLE_SUFFIX=.js \
  -DCMAKE_EXE_LINKER_FLAGS="$WASM_LINK_FLAGS" \
  -DCMAKE_CXX_FLAGS="$WASM_CXX_FLAGS" \
  -DLLVM_TABLEGEN="$HOST_BUILD_DIR/bin/llvm-tblgen" \
  -DLLVM_NATIVE_TOOL_DIR="$HOST_BUILD_DIR/bin" \
  -DMLIR_TABLEGEN="$HOST_BUILD_DIR/bin/mlir-tblgen" \
  -DCIRCT_TABLEGEN="$HOST_BUILD_DIR/bin/circt-tblgen" \
  -DLLVM_TARGETS_TO_BUILD=WebAssembly \
  -DLLVM_ENABLE_BINDINGS=OFF \
  -DLLVM_ENABLE_FFI=OFF \
  -DLLVM_ENABLE_LIBEDIT=OFF \
  -DLLVM_ENABLE_LIBXML2=OFF \
  -DLLVM_ENABLE_TERMINFO=OFF \
  -DLLVM_ENABLE_THREADS=OFF \
  -DLLVM_ENABLE_ZLIB=OFF \
  -DLLVM_ENABLE_ZSTD=OFF \
  -DMLIR_ENABLE_BINDINGS_PYTHON=OFF \
  -DMLIR_ENABLE_EXECUTION_ENGINE=OFF \
  -DCIRCT_CADICAL_ENABLED="$CADICAL_ENABLED"

# CIRCT's unified build resets MLIR_TABLEGEN_EXE to the target mlir-tblgen.
# Seed those target paths with native binaries so tablegen custom commands can
# execute directly under Ninja, matching the workaround used by MLIR Emscripten
# builds.
seed_wasm_tablegen_tools
patch_wasm_tablegen_link_rules
patch_wasm_native_configure_rules

echo "Building native MLIR helper tools for cross build"
cmake --build "$WASM_BUILD_DIR" \
  --target CONFIGURE_LLVM_NATIVE \
  "${PARALLEL_ARGS[@]}"
seed_wasm_tablegen_tools
patch_wasm_tablegen_link_rules
patch_wasm_native_configure_rules
cmake --build "$WASM_BUILD_DIR/NATIVE" \
  --target mlir-linalg-ods-yaml-gen \
  "${PARALLEL_ARGS[@]}"

seed_wasm_tablegen_tools
patch_wasm_tablegen_link_rules
patch_wasm_native_configure_rules

cmake -E copy_if_different \
  "$WASM_BUILD_DIR/NATIVE/bin/mlir-linalg-ods-yaml-gen" \
  "$WASM_BUILD_DIR/NATIVE/bin/mlir-linalg-ods-yaml-gen.js"
chmod +x "$WASM_BUILD_DIR/NATIVE/bin/mlir-linalg-ods-yaml-gen.js"

echo "Building WASM targets: $TARGETS"
# shellcheck disable=SC2086
cmake --build "$WASM_BUILD_DIR" --target $TARGETS "${PARALLEL_ARGS[@]}"

echo "WASM build completed under $WASM_BUILD_DIR/bin"
