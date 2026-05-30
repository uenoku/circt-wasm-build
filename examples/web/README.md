# Browser Example

Build the tools with browser support:

```sh
CMAKE_BUILD_PARALLEL_LEVEL=8 ./scripts/build-wasm.sh
```

Serve the repository root, then open `examples/web/`:

```sh
python3 -m http.server 8000
```

The page expects launchers and wasm payloads to exist under `build/wasm/bin`.
The default build provides `circt-verilog`, `firtool`, `circt-opt`,
`circt-synth`, and `arcilator`. If `CIRCT_MOCKTURTLE_ENABLED=ON` was used, the
runner can also launch `circt-mockturtle-opt`. Tools are loaded by the worker
when a run starts, so larger payloads are fetched only when the corresponding
tool is used.

On GitHub Pages, the page reads `wasm/manifest.json` and switches the tool path
to the selected version, for example `wasm/current/bin/` or a CIRCT release
label published by the workflow. If the manifest is not present, the version
selector is disabled and the local `build/wasm/bin` path is used.

Use the `Share URL` or input-pane `Copy Link` button to embed the selected tool,
arguments, and input text in the URL hash. Opening that URL restores the editor
state without sending the input to a server.
