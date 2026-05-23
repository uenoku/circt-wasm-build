const examples = {
  "firtool": {
    title: "FIRRTL",
    language: "firrtl",
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
    language: "mlir",
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
    language: "mlir",
    file: "input.mlir",
    args: "--top add16 --enable-sop-balancing --convert-to-comb --analysis-output=-",
    source: `hw.module @add16(in %arg0: i16, in %arg1: i16, out add: i16) {
  %0 = comb.add %arg0, %arg1 : i16
  hw.output %0 : i16
}
`,
  },
  "circt-verilog": {
    title: "SystemVerilog",
    language: "sv",
    file: "input.sv",
    args: "--format=sv --ir-hw",
    source: `module add4(
  input  logic [3:0] a,
  input  logic [3:0] b,
  output logic [4:0] y
);
  assign y = a + b;
endmodule
`,
  },
  "arcilator": {
    title: "HW MLIR",
    language: "mlir",
    file: "input.mlir",
    args: "--emit-llvm",
    source: `hw.module @Top(in %clock : !seq.clock, in %i0 : i4, in %i1 : i4, out out : i4) {
  %0 = comb.add %i0, %i1 : i4
  %1 = comb.xor %0, %i0 : i4
  %2 = comb.xor %0, %i1 : i4
  %foo = seq.compreg %1, %clock : i4
  %bar = seq.compreg %2, %clock : i4
  %3 = comb.mul %foo, %bar : i4
  hw.output %3 : i4
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
const copyOutputButtons = [...document.querySelectorAll("[data-copy-output]")];

toolBaseInput.value = new URL("../../build/wasm/bin/", window.location.href).href;

function defineEditorModes() {
  const codeMirror = window.CodeMirror;
  if (!codeMirror?.defineSimpleMode)
    return;

  codeMirror.defineSimpleMode("circt-firrtl", {
    start: [
      { regex: /;.*/, token: "comment" },
      { regex: /"(?:[^\\"]|\\.)*"/, token: "string" },
      {
        regex: /\b(?:FIRRTL|version|circuit|public|module|input|output|reg|wire|node|connect|when|else|skip|stop|printf)\b/,
        token: "keyword",
      },
      { regex: /\b(?:UInt|SInt|Clock|AsyncReset|Reset)(?:<\d+>)?/, token: "type" },
      { regex: /\b\d+\b/, token: "number" },
      { regex: /@[A-Za-z_.$][\w.$-]*/, token: "variable-2" },
      { regex: /[A-Za-z_.$][\w.$-]*/, token: "variable" },
    ],
  });

  codeMirror.defineSimpleMode("circt-mlir", {
    start: [
      { regex: /\/\/.*/, token: "comment" },
      { regex: /"(?:[^\\"]|\\.)*"/, token: "string" },
      { regex: /[%@#][A-Za-z_.$-][\w.$-]*/, token: "variable-2" },
      { regex: /!?[A-Za-z_][\w.$-]*\.[A-Za-z_][\w.$-]*/, token: "atom" },
      { regex: /\b(?:module|func|in|out|true|false)\b/, token: "keyword" },
      { regex: /!?[A-Za-z_][\w.$-]*<\d+>|!?seq\.clock|\bi\d+\b/, token: "type" },
      { regex: /\b\d+\b/, token: "number" },
      { regex: /[A-Za-z_.$-][\w.$-]*/, token: "variable" },
    ],
  });

  codeMirror.defineSimpleMode("circt-systemverilog", {
    start: [
      { regex: /\/\/.*/, token: "comment" },
      { regex: /\/\*/, token: "comment", next: "comment" },
      { regex: /"(?:[^\\"]|\\.)*"/, token: "string" },
      {
        regex: /\b(?:module|endmodule|input|output|wire|logic|assign|always_comb|always_ff|begin|end|if|else|case|endcase|parameter|localparam)\b/,
        token: "keyword",
      },
      { regex: /\b(?:bit|byte|shortint|int|longint|reg|signed|unsigned)\b/, token: "type" },
      { regex: /\b\d+'[bdho][0-9a-fA-F_xzXZ]+\b|\b\d+\b/, token: "number" },
      { regex: /[A-Za-z_$][\w$]*/, token: "variable" },
    ],
    comment: [
      { regex: /.*?\*\//, token: "comment", next: "start" },
      { regex: /.*/, token: "comment" },
    ],
  });
}

defineEditorModes();

const editorModes = {
  firrtl: "circt-firrtl",
  mlir: "circt-mlir",
  sv: "circt-systemverilog",
};

const editor = window.CodeMirror
  ? window.CodeMirror.fromTextArea(source, {
      mode: editorModes[examples[state.tool].language],
      theme: "circt",
      lineNumbers: true,
      indentUnit: 2,
      tabSize: 2,
      lineWrapping: false,
      viewportMargin: 20,
    })
  : null;

function sourceText() {
  return editor ? editor.getValue() : source.value;
}

function setSourceText(value) {
  if (editor) {
    editor.setValue(value);
    requestAnimationFrame(() => editor.refresh());
  } else {
    source.value = value;
  }
}

function setEditorLanguage(language) {
  if (editor)
    editor.setOption("mode", editorModes[language] || editorModes.mlir);
}

function parseArgs(value) {
  const matches = value.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
  return matches.map((arg) => {
    const quote = arg[0];
    if ((quote === '"' || quote === "'") && arg.at(-1) === quote)
      return arg.slice(1, -1);
    return arg;
  });
}

function setTool(tool, sourceOverride = null) {
  state.tool = tool;
  const example = examples[tool];
  toolButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tool === tool);
  });
  inputTitle.textContent = example.title;
  argsInput.value = example.args;
  setEditorLanguage(example.language);
  setSourceText(sourceOverride ?? example.source);
  output.textContent = "";
  status.textContent = sourceOverride === null ? "Idle" : "Copied";
  setCopyOutputEnabled(false);
}

function setCopyOutputEnabled(enabled) {
  copyOutputButtons.forEach((button) => {
    button.disabled = !enabled;
  });
}

function setBusy(busy) {
  runButton.disabled = busy;
  resetButton.disabled = busy;
  toolButtons.forEach((button) => {
    button.disabled = busy;
  });
  copyOutputButtons.forEach((button) => {
    button.disabled = busy || output.textContent.length === 0;
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
    input: sourceText(),
    inputPath: example.file,
    args: [...parseArgs(argsInput.value), example.file],
  });

  worker.onmessage = (event) => {
    const message = event.data;
    if (message.type === "result") {
      const text = [message.stdout, message.stderr].filter(Boolean).join("\n");
      output.textContent = text || `(exit ${message.code})`;
      status.textContent = message.code === 0 ? "Done" : `Exit ${message.code}`;
      setCopyOutputEnabled(output.textContent.length > 0);
      worker.terminate();
      setBusy(false);
    }
  };

  worker.onerror = (event) => {
    output.textContent = event.message;
    status.textContent = "Error";
    setCopyOutputEnabled(output.textContent.length > 0);
    worker.terminate();
    setBusy(false);
  };
}

function copyOutputToTool(tool) {
  const text = output.textContent;
  if (!text)
    return;
  setTool(tool, text);
}

toolButtons.forEach((button) => {
  button.addEventListener("click", () => setTool(button.dataset.tool));
});

copyOutputButtons.forEach((button) => {
  button.addEventListener("click", () => copyOutputToTool(button.dataset.copyOutput));
});

runButton.addEventListener("click", runTool);
resetButton.addEventListener("click", () => setTool(state.tool));

setTool(state.tool);
