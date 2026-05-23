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
const sourceHighlight = document.querySelector("#source-highlight");
const output = document.querySelector("#output");
const status = document.querySelector("#status");
const runButton = document.querySelector("#run");
const resetButton = document.querySelector("#reset");
const argsInput = document.querySelector("#args");
const toolBaseInput = document.querySelector("#tool-base");
const inputTitle = document.querySelector("#input-title");
const toolButtons = [...document.querySelectorAll("[data-tool]")];

toolBaseInput.value = new URL("../../build/wasm/bin/", window.location.href).href;

const keywordSets = {
  firrtl: new Set([
    "FIRRTL",
    "version",
    "circuit",
    "module",
    "public",
    "input",
    "output",
    "reg",
    "wire",
    "node",
    "connect",
    "when",
    "else",
    "skip",
    "stop",
    "printf",
    "UInt",
    "SInt",
    "Clock",
    "AsyncReset",
    "Reset",
  ]),
  mlir: new Set([
    "module",
    "func",
    "hw.module",
    "hw.output",
    "hw.constant",
    "comb.add",
    "comb.mul",
    "comb.xor",
    "seq.compreg",
    "in",
    "out",
    "true",
    "false",
  ]),
  sv: new Set([
    "module",
    "endmodule",
    "input",
    "output",
    "wire",
    "logic",
    "assign",
    "always_comb",
    "always_ff",
    "begin",
    "end",
    "if",
    "else",
    "case",
    "endcase",
    "parameter",
    "localparam",
  ]),
};

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function span(className, value) {
  return `<span class="${className}">${escapeHtml(value)}</span>`;
}

function highlightToken(token, language) {
  const keywords = keywordSets[language] || keywordSets.mlir;

  if (/^".*"$/.test(token) || /^'.*'$/.test(token))
    return span("tok-string", token);
  if (/^(%|@|#)[A-Za-z_.$-][\w.$-]*$/.test(token))
    return span("tok-symbol", token);
  if (/^!?[A-Za-z_][\w.$-]*\.[A-Za-z_][\w.$-]*$/.test(token))
    return span("tok-dialect", token);
  if (/^!?[is]?u?int<\d+>$|^!?seq\.clock$|^i\d+$|^UInt<\d+>$|^SInt<\d+>$/.test(token))
    return span("tok-type", token);
  if (/^(?:\d+|'[01xz]+|[A-Za-z_][\w$]*'\([^)]+\))$/.test(token))
    return span("tok-number", token);
  if (keywords.has(token))
    return span("tok-keyword", token);
  return escapeHtml(token);
}

function highlightLine(line, language) {
  const commentStart = language === "firrtl" ? line.indexOf(";") : line.indexOf("//");
  const code = commentStart >= 0 ? line.slice(0, commentStart) : line;
  const comment = commentStart >= 0 ? line.slice(commentStart) : "";
  const tokenPattern = /"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*'|[%@#]?[A-Za-z_.$][\w.$-]*(?:\.[A-Za-z_][\w.$-]*)?|!?[A-Za-z_][\w.$-]*<\d+>|!?seq\.clock|i\d+|\d+|[^\s]/g;
  let html = "";
  let index = 0;
  let match;

  while ((match = tokenPattern.exec(code)) !== null) {
    html += escapeHtml(code.slice(index, match.index));
    html += highlightToken(match[0], language);
    index = match.index + match[0].length;
  }

  html += escapeHtml(code.slice(index));
  if (comment)
    html += span("tok-comment", comment);
  return html;
}

function updateHighlight() {
  const language = examples[state.tool].language;
  const highlighted = source.value
    .split("\n")
    .map((line) => highlightLine(line, language))
    .join("\n");
  sourceHighlight.innerHTML = `${highlighted}\n`;
}

function syncHighlightScroll() {
  sourceHighlight.scrollTop = source.scrollTop;
  sourceHighlight.scrollLeft = source.scrollLeft;
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

function setTool(tool) {
  state.tool = tool;
  const example = examples[tool];
  toolButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tool === tool);
  });
  inputTitle.textContent = example.title;
  argsInput.value = example.args;
  source.value = example.source;
  updateHighlight();
  syncHighlightScroll();
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

source.addEventListener("input", updateHighlight);
source.addEventListener("scroll", syncHighlightScroll);
runButton.addEventListener("click", runTool);
resetButton.addEventListener("click", () => setTool(state.tool));

setTool(state.tool);
