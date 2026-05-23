self.onmessage = (event) => {
  const { tool, toolBase, input, inputPath, args } = event.data;
  const base = toolBase.endsWith("/") ? toolBase : `${toolBase}/`;
  const stdout = [];
  const stderr = [];
  let finished = false;
  const timeout = setTimeout(() => {
    stderr.push("Tool did not exit after 120 seconds.");
    finish(1);
  }, 120000);

  function finish(code) {
    if (finished) return;
    finished = true;
    clearTimeout(timeout);
    self.postMessage({
      type: "result",
      code,
      stdout: stdout.join("\n"),
      stderr: stderr.join("\n"),
    });
  }

  self.Module = {
    arguments: args,
    locateFile(path) {
      if (path.endsWith(".wasm")) return `${base}${tool}.wasm`;
      return `${base}${path}`;
    },
    print(text) {
      stdout.push(String(text));
    },
    printErr(text) {
      stderr.push(String(text));
    },
    preRun: [
      () => {
        FS.writeFile(inputPath, input);
      },
    ],
    onAbort(reason) {
      stderr.push(String(reason));
      finish(1);
    },
    onExit(code) {
      finish(code);
    },
  };

  try {
    importScripts(`${base}${tool}.js`);
  } catch (error) {
    const code = typeof error.status === "number" ? error.status : 1;
    if (!finished) stderr.push(error && error.message ? error.message : String(error));
    finish(code);
  }
};
