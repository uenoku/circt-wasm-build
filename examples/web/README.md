# Browser Example

Build the tools with browser support:

```sh
CMAKE_BUILD_PARALLEL_LEVEL=8 ./scripts/build-wasm.sh
```

Serve the repository root, then open `examples/web/`:

```sh
python3 -m http.server 8000
```

The page expects `firtool`, `circt-opt`, `circt-synth`, `circt-verilog`, and
`arcilator` launchers and wasm payloads to exist under `build/wasm/bin`. Tools
are loaded by the worker when a run starts, so larger payloads are fetched only
when the corresponding tool is used.

On GitHub Pages, the page reads `wasm/manifest.json` and switches the tool path
to the selected version, for example `wasm/current/bin/` or a CIRCT release
label published by the workflow. If the manifest is not present, the version
selector is disabled and the local `build/wasm/bin` path is used.
