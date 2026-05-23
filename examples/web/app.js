const examples = {
  "firtool": {
    title: "FIRRTL",
    file: "input.fir",
    args: "",
    source: `FIRRTL version 4.0.0
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
`,
  },
  "circt-opt": {
    title: "MLIR",
    file: "input.mlir",
    args: "",
    source: `module {
  hw.module @Top(out out: i1) {
    %true = hw.constant true
    hw.output %true : i1
  }
}
`,
  },
  "circt-synth": {
    title: "Synthesis MLIR",
    file: "input.mlir",
    args: "--top add16 --enable-sop-balancing --convert-to-comb --analysis-output=-",
    source: `hw.module @add16(in %arg0: i16, in %arg1: i16, out add: i16) {
  %0 = comb.add %arg0, %arg1 : i16
  hw.output %0 : i16
}
`,
  },
};

const state = {
  tool: "firtool",
};

const source = document.querySelector("#source");
const output = document.querySelector("#output");
const status = document.querySelector("#status");
const runButton = document.querySelector("#run");
const resetButton = document.querySelector("#reset");
const argsInput = document.querySelector("#args");
const toolBaseInput = document.querySelector("#tool-base");
const inputTitle = document.querySelector("#input-title");
const toolButtons = [...document.querySelectorAll("[data-tool]")];

toolBaseInput.value = new URL("../../build/wasm/bin/", window.location.href).href;

function parseArgs(value) {
  const matches = value.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
  return matches.map((arg) => {
    const quote = arg[0];
    if ((quote === '"' || quote === "'") && arg.at(-1) === quote)
      return arg.slice(1, -1);
    return arg;
  });
}

function setTool(tool) {
  state.tool = tool;
  const example = examples[tool];
  toolButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tool === tool);
  });
  inputTitle.textContent = example.title;
  argsInput.value = example.args;
  source.value = example.source;
  output.textContent = "";
  status.textContent = "Idle";
}

function setBusy(busy) {
  runButton.disabled = busy;
  resetButton.disabled = busy;
  toolButtons.forEach((button) => {
    button.disabled = busy;
  });
}

async function runTool() {
  const tool = state.tool;
  const example = examples[tool];
  const worker = new Worker(new URL("tool-worker.js", import.meta.url));

  setBusy(true);
  status.textContent = "Running";
  output.textContent = "";

  worker.postMessage({
    tool,
    toolBase: toolBaseInput.value,
    input: source.value,
    inputPath: example.file,
    args: [...parseArgs(argsInput.value), example.file],
  });

  worker.onmessage = (event) => {
    const message = event.data;
    if (message.type === "result") {
      const text = [message.stdout, message.stderr].filter(Boolean).join("\n");
      output.textContent = text || `(exit ${message.code})`;
      status.textContent = message.code === 0 ? "Done" : `Exit ${message.code}`;
      worker.terminate();
      setBusy(false);
    }
  };

  worker.onerror = (event) => {
    output.textContent = event.message;
    status.textContent = "Error";
    worker.terminate();
    setBusy(false);
  };
}

toolButtons.forEach((button) => {
  button.addEventListener("click", () => setTool(button.dataset.tool));
});

runButton.addEventListener("click", runTool);
resetButton.addEventListener("click", () => setTool(state.tool));

setTool(state.tool);
