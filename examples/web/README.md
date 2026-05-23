# Browser Example

Build the tools with browser support:

```sh
CMAKE_BUILD_PARALLEL_LEVEL=8 ./scripts/build-wasm.sh
```

Serve the repository root, then open `examples/web/`:

```sh
python3 -m http.server 8000
```

The page expects `build/wasm/bin/firtool.js`, `firtool.wasm`,
`circt-opt.js`, and `circt-opt.wasm` to exist.
