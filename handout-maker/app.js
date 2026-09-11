const source = document.querySelector("#source");
const preview = document.querySelector("#preview");
const statusText = document.querySelector("#status");
const pageCount = document.querySelector("#page-count");
const layoutSelect = document.querySelector("#layout-select");
const previewPanel = document.querySelector(".preview-panel");
const workspace = document.querySelector(".workspace");
const assetMap = new Map();
let renderTimer;
let liveSourceVersion = null;
let liveAssetMode = false;
let liveAssetVersion = "";
let showAnswers = false;
let questionCounter = 1;
let activeHandoutTitle = "handout";
let totalPoints = 0;

const snippets = {
  heading: "## New section\n\n",
  checklist: "▢ First checklist item  \n▢ Second checklist item  \n▢ Third checklist item  \n\n",
  question: ":::question type=short lines=3\nWhat is the answer?\n:::answer\nTeacher answer\n:::\n\n",
  "multiple-choice": ":::question type=mc\nWhich answer is correct?\n- First choice\n- Correct choice *\n- Third choice\n:::\n\n",
  lines: "{{lines:3}}\n\n",
  "inline-lines": "Answer here: {{lines:2:inline}}\n\n",
  space: "{{space:6}}\n\n",
  box: "{{space:6:box}}\n\n",
  dots: "{{space:6:dots}}\n\n",
  wrap: ":::wrap\n![Alt text](image.png){.float-right width=2in}\n\nText that wraps beside the image.\n:::\n\n",
  grid: ":::grid columns=2\n:::cell\nColumn one\n:::cell\nColumn two\n:::\n\n",
  cards: ":::grid columns=2 cards\n:::cell\n### Box one\nContent\n:::cell\n### Box two\nContent\n:::\n\n",
  pagebreak: ":::pagebreak\n\n",
  style: "<style>\n/* Custom styles for this handout */\n.handout-page h1 { color: #215b75; }\n</style>\n\n"
};

function makeColumns(format, widths, cards = false) {
  const values = widths.split(",");
  if (format === "html") {
    const template = values.map(value => `${Number(value.split("/")[0])}fr`).join(" ");
    const cardStyle = cards ? " border: 1px solid #666; padding: .14in;" : "";
    const cells = values.map((_, index) => `  <div style="${cardStyle}">Column ${index + 1}</div>`).join("\n");
    return `<div class="worksheet-columns" style="--grid-template: ${template}">\n${cells}\n</div>\n\n`;
  }
  return `:::grid widths=${widths}${cards ? " cards" : ""}\n${values.map((_, index) => `:::cell\nColumn ${index + 1}`).join("\n")}\n:::\n\n`;
}

function insertSnippet(text) {
  const start = source.selectionStart;
  const end = source.selectionEnd;
  source.setRangeText(text, start, end, "end");
  source.dispatchEvent(new Event("input", { bubbles: true }));
  source.focus();
}

function makeTable(format, rows, columns) {
  if (format === "html") {
    const width = (100 / columns).toFixed(2);
    const cols = Array.from({ length: columns }, () => `    <col style="width: ${width}%">`).join("\n");
    const header = Array.from({ length: columns }, (_, index) => `      <th>Header ${index + 1}</th>`).join("\n");
    const body = Array.from({ length: rows }, (_, row) => `    <tr>\n${Array.from({ length: columns }, (_, column) => `      <td>Row ${row + 1}, column ${column + 1}</td>`).join("\n")}\n    </tr>`).join("\n");
    return `<table class="worksheet-table">\n  <colgroup>\n${cols}\n  </colgroup>\n  <thead>\n    <tr>\n${header}\n    </tr>\n  </thead>\n  <tbody>\n${body}\n  </tbody>\n</table>\n\n`;
  }
  const header = `| ${Array.from({ length: columns }, (_, index) => `Header ${index + 1}`).join(" | ")} |`;
  const separator = `| ${Array.from({ length: columns }, () => "---").join(" | ")} |`;
  const body = Array.from({ length: rows }, (_, row) => `| ${Array.from({ length: columns }, (_, column) => `Row ${row + 1}, column ${column + 1}`).join(" | ")} |`).join("\n");
  return `${header}\n${separator}\n${body}\n\n`;
}

function makeQuestion(type, prompt, points, lines, choices, correct, answer) {
  const pointAttr = points ? ` points=${Math.max(0, Number(points) || 0)}` : "";
  const safePrompt = prompt.trim() || "Write your response here.";
  if (type === "mc") {
    const options = choices.split("\n").map(item => item.trim()).filter(Boolean);
    const marked = options.map((item, index) => `- ${item}${index === Number(correct) ? " *" : ""}`).join("\n");
    return `:::question type=mc${pointAttr}\n${safePrompt}\n${marked || "- Choice 1\n- Choice 2 *\n- Choice 3"}\n:::\n\n`;
  }
  if (type === "true-false") {
    const answerText = ["1", "false"].includes(correct) ? "False" : "True";
    return `:::question type=true-false${pointAttr}\n${safePrompt}\n- True${answerText === "True" ? " *" : ""}\n- False${answerText === "False" ? " *" : ""}\n:::\n\n`;
  }
  return `:::question type=short lines=${Math.max(1, Number(lines) || 3)}${pointAttr}\n${safePrompt}${answer.trim() ? `\n:::answer\n${answer.trim()}\n:::` : ""}\n:::\n\n`;
}

function makeRubric(title, criteria) {
  const rows = criteria.split("\n").map(row => row.trim()).filter(Boolean).map(row => {
    const cells = row.split("|").map(cell => cell.trim());
    return `| ${[cells[0] || "Criterion", cells[1] || "Exceeds", cells[2] || "Meets", cells[3] || "Beginning"].join(" | ")} |`;
  });
  return `## ${title.trim() || "Rubric"}\n\n| Criterion | Exceeds | Meets | Beginning |\n| --- | --- | --- | --- |\n${rows.length ? rows.join("\n") : "| Criterion 1 |  |  |  |"}\n\n`;
}

function addSnippetForm(className, html, target = ".snippet-picker") {
  const form = document.createElement("div");
  form.className = `snippet-picker ${className}`;
  form.innerHTML = html;
  document.querySelector(target)?.append(form);
  return form;
}

function setupSnippetPalette() {
  document.querySelectorAll('[data-snippet="question"], [data-snippet="multiple-choice"]').forEach(button => { button.hidden = true; });
  const snippetGrid = document.querySelector(".snippet-grid");
  if (snippetGrid && !snippetGrid.querySelector('[data-snippet="checklist"]')) {
    const checklist = document.createElement("button");
    checklist.type = "button";
    checklist.className = "snippet-button";
    checklist.dataset.snippet = "checklist";
    checklist.textContent = "Checklist";
    snippetGrid.insertBefore(checklist, snippetGrid.firstChild?.nextSibling || null);
  }
  if (!document.querySelector("#insert-columns")) {
    const picker = document.createElement("div");
    picker.className = "snippet-picker";
    picker.innerHTML = '<label>Columns <select id="column-format"><option value="markdown">Markdown</option><option value="html">HTML</option></select></label><label>Widths <select id="column-layout"><option value="1/2,1/2">1/2 + 1/2</option><option value="1/3,2/3">1/3 + 2/3</option><option value="2/3,1/3">2/3 + 1/3</option><option value="1/4,3/4">1/4 + 3/4</option><option value="3/4,1/4">3/4 + 1/4</option><option value="1/4,1/4,1/2">1/4 + 1/4 + 1/2</option><option value="1/4,1/4,1/4,1/4">Four equal</option></select></label><label class="check-control"><input id="column-cards" type="checkbox"> Boxes</label><button type="button" class="snippet-button" id="insert-columns">Insert columns</button>';
    document.querySelector(".snippet-picker")?.after(picker);
  }
  document.querySelectorAll(".snippet-button[data-snippet]").forEach(button => {
    button.addEventListener("click", () => insertSnippet(snippets[button.dataset.snippet]));
  });
  const tableButton = document.querySelector("#insert-table");
  if (tableButton) tableButton.addEventListener("click", () => {
    const format = document.querySelector("#table-format").value;
    const rows = Number(document.querySelector("#table-rows").value);
    const columns = Number(document.querySelector("#table-columns").value);
    insertSnippet(makeTable(format, rows, columns));
  });
  const columnsButton = document.querySelector("#insert-columns");
  if (columnsButton) columnsButton.addEventListener("click", () => {
    insertSnippet(makeColumns(document.querySelector("#column-format").value, document.querySelector("#column-layout").value, document.querySelector("#column-cards").checked));
  });
  const questionForm = addSnippetForm("question-picker", '<label>Question type <select id="question-type"><option value="short">Short answer</option><option value="mc">Multiple choice</option><option value="true-false">True / false</option></select></label><label>Points <input id="question-points" type="number" min="0" placeholder="optional"></label><label>Lines <input id="question-lines" type="number" min="1" max="30" value="3"></label><label class="wide-field">Prompt <input id="question-prompt" type="text" value="Write your response here."></label><label class="wide-field">Choices / answer <textarea id="question-content" rows="2" placeholder="One choice per line"></textarea></label><label id="question-correct-label">Correct choice <select id="question-correct"><option value="0">First choice</option><option value="1">Second choice</option><option value="2">Third choice</option><option value="3">Fourth choice</option></select></label><button type="button" class="snippet-button" id="insert-question">Insert question</button>', ".question-tools");
  const rubricForm = addSnippetForm("rubric-picker", '<label>Rubric title <input id="rubric-title" type="text" value="Assessment Rubric"></label><label class="wide-field">Criteria <textarea id="rubric-criteria" rows="3" placeholder="Criterion | Exceeds description | Meets description | Beginning description"></textarea></label><button type="button" class="snippet-button" id="insert-rubric">Insert rubric</button>', ".question-tools");
  const scoreForm = addSnippetForm("score-picker", '<button type="button" class="snippet-button" id="insert-total-points">Insert total points</button><button type="button" class="snippet-button" id="insert-grade-box">Insert grade box</button><small>Syntax: {{total-points}} and {{grade}}</small>', ".score-tools");
  const typeSelect = questionForm.querySelector("#question-type");
  const correctLabel = questionForm.querySelector("#question-correct-label");
  const contentLabel = questionForm.querySelector("#question-content").closest("label");
  typeSelect.addEventListener("change", () => {
    const choiceType = ["mc", "true-false"].includes(typeSelect.value);
    correctLabel.hidden = !choiceType;
    contentLabel.hidden = typeSelect.value === "true-false";
    questionForm.querySelector("#question-correct").innerHTML = typeSelect.value === "true-false" ? '<option value="0">True</option><option value="1">False</option>' : '<option value="0">First choice</option><option value="1">Second choice</option><option value="2">Third choice</option><option value="3">Fourth choice</option>';
  });
  typeSelect.dispatchEvent(new Event("change"));
  questionForm.querySelector("#insert-question").addEventListener("click", () => insertSnippet(makeQuestion(typeSelect.value, questionForm.querySelector("#question-prompt").value, questionForm.querySelector("#question-points").value, questionForm.querySelector("#question-lines").value, questionForm.querySelector("#question-content").value, questionForm.querySelector("#question-correct").value, questionForm.querySelector("#question-content").value)));
  rubricForm.querySelector("#insert-rubric").addEventListener("click", () => insertSnippet(makeRubric(rubricForm.querySelector("#rubric-title").value, rubricForm.querySelector("#rubric-criteria").value)));
  scoreForm.querySelector("#insert-total-points").addEventListener("click", () => insertSnippet("{{total-points}}"));
  scoreForm.querySelector("#insert-grade-box").addEventListener("click", () => insertSnippet("{{grade}}"));
}

setupSnippetPalette();

function setupPanelControls() {
  const actions = document.querySelector(".actions");
  const restores = {};
  for (const panel of ["file", "editor"]) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button panel-restore";
    button.textContent = panel === "file" ? "Show files" : "Show editor";
    button.hidden = true;
    button.addEventListener("click", () => {
      workspace.classList.remove(`${panel}-collapsed`);
      button.hidden = true;
      document.querySelector(`.panel-toggle[data-panel="${panel}"]`).textContent = "Hide";
    });
    actions?.append(button);
    restores[panel] = button;
  }
  for (const toggle of document.querySelectorAll(".panel-toggle")) {
    if (!toggle.dataset.panel) continue;
    toggle.addEventListener("click", () => {
      const panel = toggle.dataset.panel;
      const collapsedClass = `${panel}-collapsed`;
      const collapsed = workspace.classList.toggle(collapsedClass);
      toggle.textContent = collapsed ? "Show" : "Hide";
      toggle.setAttribute("aria-label", `${collapsed ? "Expand" : "Collapse"} ${panel === "file" ? "handout files" : "Markdown editor"}`);
      restores[panel].hidden = !collapsed;
    });
  }

  for (const divider of document.querySelectorAll(".panel-divider")) {
    divider.addEventListener("pointerdown", event => {
      if (window.matchMedia("(max-width: 900px)").matches) return;
      const panel = divider.dataset.divider;
      const startX = event.clientX;
      const startWidth = document.querySelector(`.${panel}-panel`).getBoundingClientRect().width;
      const minimum = panel === "file" ? 150 : 280;
      divider.setPointerCapture(event.pointerId);
      const resize = moveEvent => {
        const width = Math.max(minimum, startWidth + moveEvent.clientX - startX);
        workspace.style.setProperty(`--${panel}-width`, `${width}px`);
        workspace.classList.remove(`${panel}-collapsed`);
      };
      const stop = () => {
        divider.removeEventListener("pointermove", resize);
        divider.removeEventListener("pointerup", stop);
      };
      divider.addEventListener("pointermove", resize);
      divider.addEventListener("pointerup", stop);
    });
  }
}

setupPanelControls();

const layouts = {
  letter: { width: "8.5in", height: "11in", page: "letter portrait", label: "Letter" },
  "letter-landscape": { width: "11in", height: "8.5in", page: "letter landscape", label: "Letter landscape" },
  a4: { width: "210mm", height: "297mm", page: "A4 portrait", label: "A4" },
  "half-portrait": { width: "5.5in", height: "8.5in", page: "5.5in 8.5in", label: "Half letter portrait" },
  "half-landscape": { width: "8.5in", height: "5.5in", page: "8.5in 5.5in", label: "Half letter landscape" },
  "half-duplicate-portrait": { width: "5.5in", height: "8.5in", page: "letter landscape", label: "Two portrait half-sheet copies", impose: "portrait-handout" },
  "half-duplicate-landscape": { width: "8.5in", height: "5.5in", page: "letter portrait", label: "Two landscape half-sheet copies", impose: "landscape-handout" },
  booklet: { width: "8.5in", height: "11in", page: "17in 11in", label: "11×17 booklet" }
};
const requestedLayout = new URLSearchParams(window.location.search).get("layout");
if (requestedLayout && layouts[requestedLayout]) layoutSelect.value = requestedLayout;

function setSourceContent(content) {
  source.value = content;
  source.dispatchEvent(new Event("input", { bubbles: true }));
  const frontMatter = content.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  const layoutSetting = frontMatter && frontMatter[1].match(/^layout\s*:\s*([\w-]+)\s*$/m);
  if (layoutSetting && layouts[layoutSetting[1]]) layoutSelect.value = layoutSetting[1];
}

function withoutDocumentSettings(markdown) {
  return markdown.replace(/^---\s*\n[\s\S]*?\n---\s*(?:\n|$)/, "");
}

function currentAIContext(markdown) {
  const frontMatter = markdown.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  if (!frontMatter) return "";
  const lines = frontMatter[1].split(/\r?\n/);
  const start = lines.findIndex(line => /^ai_context\s*:/i.test(line));
  if (start === -1) return "";
  const value = lines[start].replace(/^ai_context\s*:\s*/i, "").trim();
  if (value && !/^[|>]\-?\+?$/.test(value)) return value.replace(/^['"]|['"]$/g, "");
  const contextLines = [];
  for (const line of lines.slice(start + 1)) {
    if (line && !/^\s+/.test(line)) break;
    contextLines.push(line.replace(/^\s{2}/, "").trimEnd());
  }
  return contextLines.join("\n").trim();
}

const example = `# Ecosystems Review

**Name:** ______________________________  **Date:** _______________

:::wrap
![A pond ecosystem](examples/pond-example.svg){.float-right width=2in}

An ecosystem includes living things and their physical environment.

Plants, animals, water, sunlight, and soil interact within this pond. Changes
to one part of the system can affect the other parts.
:::

## 1. Observing an ecosystem

Name two living and two nonliving parts of the pond shown here.

{{lines:3}}

Why does an ecosystem need a source of energy? {{lines:2:inline}}

## 2. Compare

:::grid columns=2 cards
:::cell
### Producers
- Make their own food
- Usually use sunlight
:::cell
### Consumers
- Get energy by eating
- Depend on other organisms
:::

:::pagebreak

# Exit Ticket

Draw one food chain and label the producer and consumers.

{{space:8:dots}}
`;

if (!window.handoutDesktop) source.value = example;

function escapeHtml(value) {
  return value.replace(/[&<>\"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function inlineMarkdown(text) {
  // strip HTML comments inside inline fragments
  text = text.replace(/<!--([\s\S]*?)-->/g, "");
  // preserve runs of multiple spaces by converting them to non-breaking spaces (U+00A0)
  text = text.replace(/ {2,}/g, m => '\u00A0'.repeat(m.length));
  let safe = escapeHtml(text);
  const code = [];
  const strong = [];
  safe = safe.replace(/`([^`]+)`/g, (_, value) => `@@CODE${code.push(`<code>${value}</code>`) - 1}@@`);
  safe = safe.replace(/&lt;br\s*\/?&gt;/gi, "<br>");
  safe = safe.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)(?:\{([^}]*)\})?/g, (_, alt, path, title, attrs = "") => {
    const classes = attrs.includes(".float-left") ? "float-left" : attrs.includes(".float-right") ? "float-right" : "";
    const width = attrs.match(/width=([0-9.]+(?:in|cm|mm|px|%))/);
    const localAsset = assetMap.get(decodeURIComponent(path)) || assetMap.get(path);
    const servedAsset = liveAssetMode
      ? `/handout-assets/${path.split("/").map(part => encodeURIComponent(decodeURIComponent(part))).join("/")}?v=${encodeURIComponent(liveAssetVersion)}`
      : path;
    const src = localAsset || servedAsset;
    return `<img src="${escapeHtml(src)}" alt="${alt}"${title ? ` title="${title}"` : ""} class="${classes}"${width ? ` style="width:${width[1]}"` : ""}>`;
  });
  safe = safe.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
  safe = safe.replace(/\*\*([^*]+)\*\*/g, (_, value) => `@@STRONG${strong.push(`<strong>${value}</strong>`) - 1}@@`);
  safe = safe.replace(/(?<!_)__([^_\n]+)__(?!_)/g, (_, value) => `@@STRONG${strong.push(`<strong>${value}</strong>`) - 1}@@`);
  safe = safe.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>");
  safe = safe.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  safe = safe.replace(/ {2}\n/g, "<br>");
  safe = safe.replace(/@@STRONG(\d+)@@/g, (_, index) => strong[Number(index)]);
  safe = safe.replace(/@@CODE(\d+)@@/g, (_, index) => code[Number(index)]);
  return safe;
}

function answerMarkup(count, mode) {
  const total = Math.max(1, Math.min(30, Number(count) || 1));
  if (mode === "inline") {
    const rest = Array.from({ length: total - 1 }, () => '<div class="answer-line"></div>').join("");
    return `<span class="inline-answer"></span>${rest ? `<div class="answer-lines inline-followups">${rest}</div>` : ""}`;
  }
  return `<div class="answer-lines">${Array.from({ length: total }, () => '<div class="answer-line"></div>').join("")}</div>`;
}

function inlineAnswerGroup(question, count) {
  const total = Math.max(1, Math.min(30, Number(count) || 1));
  const rest = Array.from({ length: total - 1 }, () => '<div class="answer-line"></div>').join("");
  return `<div class="inline-answer-group"><div class="inline-answer-row"><span class="inline-question">${inlineMarkdown(question.trim())}</span><span class="inline-answer"></span></div>${rest ? `<div class="answer-lines inline-followups">${rest}</div>` : ""}</div>`;
}

function drawingSpaceMarkup(count, style = "blank") {
  const total = Math.max(1, Math.min(30, Number(count) || 1));
  const variant = ["blank", "box", "dots"].includes(style) ? style : "blank";
  const label = variant === "dots" ? "Dot-grid drawing space" : variant === "box" ? "Outlined drawing space" : "Blank drawing space";
  return `<div class="drawing-space ${variant}" style="--space-lines:${total}" role="img" aria-label="${label}"></div>`;
}

function renderTextBlock(text) {
  const answerOnly = text.trim().match(/^\{\{lines:(\d+)(?::(inline|new))?\}\}$/);
  if (answerOnly) return answerMarkup(answerOnly[1], answerOnly[2]);
  const inlineAnswer = text.trim().match(/^([\s\S]*?)\s*\{\{lines:(\d+):inline\}\}$/);
  if (inlineAnswer && inlineAnswer[1].trim()) return inlineAnswerGroup(inlineAnswer[1], inlineAnswer[2]);
  const spaceOnly = text.trim().match(/^\{\{space:(\d+)(?::(blank|box|dots))?\}\}$/);
  if (spaceOnly) return drawingSpaceMarkup(spaceOnly[1], spaceOnly[2]);
  const html = inlineMarkdown(text)
    .replace(/\{\{lines:(\d+)(?::(inline|new))?\}\}/g, (_, count, mode) => answerMarkup(count, mode))
    .replace(/\{\{space:(\d+)(?::(blank|box|dots))?\}\}/g, (_, count, style) => drawingSpaceMarkup(count, style))
    .replace(/\{\{total-points\}\}/g, String(totalPoints))
    .replace(/\{\{grade\}\}/g, `<span class="grade-box">____ / ${totalPoints}</span>`);
  return `<div class="paragraph">${html}</div>`;
}

function preprocessLegacyMarkdown(markdown) {
  let text = markdown;
  const brTokens = [];
  text = text.replace(/<br\s*\/?>/gi, match => `@@LEGACY_BR_${brTokens.push(match) - 1}@@`);
  text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)(?:\{([^}]*)\})?/g, (_, alt, path, title, attrs = "") => {
    const classes = attrs.includes(".float-left") ? "float-left" : attrs.includes(".float-right") ? "float-right" : "";
    const width = attrs.match(/width=([0-9.]+(?:in|cm|mm|px|%))/);
    const localAsset = assetMap.get(decodeURIComponent(path)) || assetMap.get(path);
    const servedAsset = liveAssetMode
      ? `/handout-assets/${path.split("/").map(part => encodeURIComponent(decodeURIComponent(part))).join("/")}?v=${encodeURIComponent(liveAssetVersion)}`
      : path;
    const src = localAsset || servedAsset;
    return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"${title ? ` title="${escapeHtml(title)}"` : ""} class="${classes}"${width ? ` style="width:${width[1]}"` : ""}>`;
  });
  return text.replace(/@@LEGACY_BR_(\d+)@@/g, (_, index) => brTokens[Number(index)]);
}

function restoreLegacyInlineHtml(html) {
  return html
    .replace(/&lt;br\s*\/?>/gi, "<br>")
    .replace(/&lt;img\s+([^&]*?)&gt;/gi, (_, attributes) => {
      const srcMatch = attributes.match(/src=["']([^"']+)["']/i);
      const altMatch = attributes.match(/alt=["']([^"']*)["']/i);
      const classMatch = attributes.match(/class=["']([^"']*)["']/i);
      const styleMatch = attributes.match(/style=["']([^"']*)["']/i);
      const src = srcMatch ? srcMatch[1] : "";
      const alt = altMatch ? altMatch[1] : "";
      const classAttr = classMatch ? ` class="${classMatch[1]}"` : "";
      const styleAttr = styleMatch ? ` style="${styleMatch[1]}"` : "";
      return `<img src="${src}" alt="${alt}"${classAttr}${styleAttr}>`;
    });
}

function parseBlocks(markdown, numbering = { questionNumber: 1 }) {
  const cleaned = markdown.replace(/<!--([\s\S]*?)-->/g, "");
  const lines = cleaned.replace(/\r\n?/g, "\n").split("\n");
  const placeholders = [];
  const outLines = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { outLines.push(""); i++; continue; }
    if (/^ {0,3}#{1,2}(?:\s|$)/.test(line)) outLines.push("<!--HANDOUT_QUESTION_RESET-->");

    if (/^:::pagebreak\s*$/.test(line.trim())) {
      const token = `@@BLOCK${placeholders.length}@@`;
      placeholders.push({ type: "pagebreak" });
      outLines.push(token);
      i++;
      continue;
    }

    if (/^:::wrap\s*$/.test(line.trim())) {
      const start = i + 1; i++;
      while (i < lines.length && lines[i].trim() !== ":::") i++;
      const content = lines.slice(start, i).join("\n");
      const token = `@@BLOCK${placeholders.length}@@`;
      placeholders.push({ type: "wrap", content });
      outLines.push(token);
      if (i < lines.length) i++;
      continue;
    }

    if (/^:::question(?:\s+(.*))?\s*$/.test(line.trim())) {
      const match = line.trim().match(/^:::question(?:\s+(.*))?\s*$/);
      const attrStr = match && match[1] ? match[1] : "";
      const start = i + 1; i++;
      let answerMarker = -1;
      while (i < lines.length && lines[i].trim() !== ":::") {
        if (lines[i].trim() === ":::answer") answerMarker = i;
        i++;
      }
      const content = lines.slice(start, i).join("\n");
      const token = `@@BLOCK${placeholders.length}@@`;
      placeholders.push({ type: "question", attrStr, content });
      outLines.push(token);
      if (i < lines.length) {
        i++;
        if (answerMarker !== -1 && i < lines.length && lines[i].trim() === ":::") i++;
      }
      continue;
    }

    if (/^:::grid(?:\s+.*)?\s*$/.test(line.trim())) {
      const attrText = line.trim().replace(/^:::grid\s*/, "");
      const attr = { columns: undefined, widths: undefined, cards: false };
      attrText.split(/\s+/).forEach(token => {
        if (token === "cards") attr.cards = true;
        else if (token.startsWith("columns=")) attr.columns = token.slice(8);
        else if (token.startsWith("widths=")) attr.widths = token.slice(7);
      });
      const cells = [];
      let cell = [];
      let depth = 0;
      i++;
      while (i < lines.length) {
        const nested = lines[i].trim();
        if (depth === 0 && /^:::cell\s*$/.test(nested)) {
          if (cell.length) cells.push(cell.join("\n"));
          cell = [];
          i++;
          continue;
        }
        if (/^:::(question|wrap|grid)(?:\s+.*)?$/.test(nested)) depth++;
        else if (nested === ":::") {
          if (depth > 0) depth--;
          else break;
        }
        cell.push(lines[i]);
        i++;
      }
      if (cell.length) cells.push(cell.join("\n"));
      const token = `@@BLOCK${placeholders.length}@@`;
      placeholders.push({ type: "grid", attr, cells });
      outLines.push(token);
      if (i < lines.length) i++;
      continue;
    }

    const tableSep = /^\s*\|?(?:\s*:?-+:?\s*\|)+\s*$/;
    if (line.includes("|") && i + 1 < lines.length && tableSep.test(lines[i + 1])) {
      const headerLine = line;
      const sepLine = lines[i + 1];
      let j = i + 2;
      const bodyRows = [];
      while (j < lines.length && lines[j].trim() && lines[j].includes("|")) {
        bodyRows.push(lines[j++]);
      }
      function splitRow(str) {
        const parts = str.split("|").map(part => part.trim());
        if (parts.length && parts[0] === "") parts.shift();
        if (parts.length && parts[parts.length - 1] === "") parts.pop();
        return parts;
      }
      const headers = splitRow(headerLine);
      const aligns = splitRow(sepLine).map(s => {
        if (s.startsWith(":") && s.endsWith(":")) return "center";
        if (s.startsWith(":")) return "left";
        if (s.endsWith(":")) return "right";
        return "";
      });
      const body = bodyRows.map(row => splitRow(row));
      let tableHtml = '<table class="md-table"><thead><tr>';
      headers.forEach((header, idx) => {
        const align = aligns[idx] || "";
        tableHtml += `<th${align ? ` style="text-align:${align}"` : ""}>${inlineMarkdown(header)}</th>`;
      });
      tableHtml += '</tr></thead><tbody>';
      for (const row of body) {
        tableHtml += '<tr>';
        row.forEach((cell, idx) => {
          const align = aligns[idx] || "";
          tableHtml += `<td${align ? ` style="text-align:${align}"` : ""}>${inlineMarkdown(cell)}</td>`;
        });
        tableHtml += '</tr>';
      }
      tableHtml += '</tbody></table>';
      const token = `@@BLOCK${placeholders.length}@@`;
      placeholders.push({ type: "table", html: tableHtml });
      outLines.push(token);
      i = j;
      continue;
    }

    outLines.push(line);
    i++;
  }

  const mdSource = outLines.join("\n");
  const custommdSource = mdSource.split("\n").map(line => {
    const trimmed = line.trim();
    const inlineMatch = trimmed.match(/^(.+?)\s*\{\{lines:(\d+):inline\}\}\s*$/);
    if (inlineMatch && inlineMatch[1].trim()) {
      return inlineAnswerGroup(inlineMatch[1].trim(), Number(inlineMatch[2]));
    }
    if (/^\{\{lines:(\d+)(?::(inline|new))?\}\}$/.test(trimmed)) {
      const match = trimmed.match(/^\{\{lines:(\d+)(?::(inline|new))?\}\}$/);
      return answerMarkup(Number(match[1]), match[2] || undefined);
    }
    if (/^\{\{space:(\d+)(?::(blank|box|dots))?\}\}$/.test(trimmed)) {
      const match = trimmed.match(/^\{\{space:(\d+)(?::(blank|box|dots))?\}\}$/);
      return drawingSpaceMarkup(Number(match[1]), match[2] || "blank");
    }
    return line
      .replace(/\{\{total-points\}\}/g, String(totalPoints))
      .replace(/\{\{grade\}\}/g, `<span class="grade-box">____ / ${totalPoints}</span>`);
  }).join("\n");
  const md = window.markdownit ? window.markdownit({ html: true }) : null;
  const rendered = md ? md.render(preprocessLegacyMarkdown(custommdSource)) : preprocessLegacyMarkdown(custommdSource);

  const renderedWithBlocks = rendered
    .replace(/<!--HANDOUT_QUESTION_RESET-->/g, () => { numbering.questionNumber = 1; return ""; })
    .replace(/@@LEGACY_BR_(\d+)@@/g, (_, index) => '<br>')
    .replace(/@@BLOCK(\d+)@@/g, (_, indexText) => {
    const index = Number(indexText);
    const block = placeholders[index];
    if (!block) return "";

    if (block.type === "pagebreak") {
      return '<div class="handout-pagebreak" aria-hidden="true"></div>';
    }

    if (block.type === "wrap") {
      const innerBlocks = parseBlocks(block.content, numbering);
      const wrappedHtml = innerBlocks.map(blockItem => blockItem.html).join("");
      return `<section class="text-wrap">${wrappedHtml}</section>`;
    }

    if (block.type === "grid") {
      const parts = block.cells.map(part => part.trim()).filter(Boolean);
      const cellHtml = parts.map(part => `<div class="grid-cell">${parseBlocks(part, numbering).map(blockItem => blockItem.html).join("")}</div>`).join("");
      const columns = Math.max(1, Math.min(4, Number(block.attr.columns) || parts.length || 2));
      const cardClass = block.attr.cards ? " cards" : "";
      const widths = block.attr.widths ? block.attr.widths.split(",").map(value => { const [numerator, denominator] = value.split("/").map(Number); return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0 ? `${numerator}fr` : "1fr"; }).join(" ") : `repeat(${columns}, minmax(0, 1fr))`;
      return `<div class="grid${cardClass}" style="--grid-template:${widths}">${cellHtml}</div>`;
    }

    if (block.type === "table") {
      return block.html;
    }

    if (block.type === "question") {
      const attrs = {};
      if (block.attrStr) {
        block.attrStr.split(/\s+/).forEach(token => {
          const match = token.match(/^([^=]+)=(.*)$/);
          if (match) attrs[match[1]] = match[2];
        });
      }
      const qtype = attrs.type || "mc";
      const qid = attrs.id || `q${questionCounter++}`;
      const qLines = block.content.split("\n");
      let answerLines = [];
      const answerIndex = qLines.findIndex(line => line.trim() === ":::answer");
      if (answerIndex !== -1) {
        let k = answerIndex + 1;
        while (k < qLines.length && qLines[k].trim() !== ":::") answerLines.push(qLines[k++]);
        qLines.splice(answerIndex, (k < qLines.length && qLines[k].trim() === ":::") ? (k - answerIndex + 1) : (k - answerIndex));
      }

      const choiceStart = qLines.findIndex(line => /^\s*[-*+]\s+/.test(line));
      let prompt = "";
      const choices = [];

      if (choiceStart === -1) {
        prompt = qLines.join("\n");
      } else {
        prompt = qLines.slice(0, choiceStart).join("\n");
        let j = choiceStart;
        while (j < qLines.length) {
          const match = qLines[j].match(/^\s*[-*+]\s+(.+)$/);
          if (match) {
            let content = match[1].trim();
            let isCorrect = false;
            if (/\s\*$/.test(content)) { isCorrect = true; content = content.replace(/\s*\*$/, ""); }
            else if (/\*$/.test(content)) { isCorrect = true; content = content.replace(/\*$/, ""); }
            choices.push({ content, isCorrect });
            j++;
          } else if (choices.length) {
            choices[choices.length - 1].content += "\n" + qLines[j];
            j++;
          } else {
            j++;
          }
        }
      }

      let qHtml = `<div class="question" data-qid="${escapeHtml(qid)}" data-qtype="${escapeHtml(qtype)}">`;
      if (prompt.trim()) {
        const number = numbering.questionNumber++;
        const promptHtml = renderTextBlock(prompt);
        qHtml += `<div class="question-prompt"><span class="question-num">${number}.</span>${promptHtml}</div>`;
      }

      if (choices.length) {
        qHtml += '<ul class="mc-choices">';
        choices.forEach((choice, choiceIndex) => {
          const choiceHtml = inlineMarkdown(choice.content);
          const correctClass = (choice.isCorrect && showAnswers) ? " correct-answer" : "";
          qHtml += `<li class="mc-choice${correctClass}" data-correct="${choice.isCorrect ? "true" : "false"}><span class="choice-letter">${String.fromCharCode(65 + choiceIndex)}.</span>${choiceHtml}</li>`;
        });
        qHtml += '</ul>';
      } else {
        const linesCount = Number(attrs.lines) || 3;
        if (showAnswers && answerLines.length) {
          const answerHtml = parseBlocks(answerLines.join("\n"), numbering).map(blockItem => blockItem.html).join("");
          qHtml += `<div class="short-answer-key handwritten">${answerHtml}</div>`;
        } else {
          qHtml += answerMarkup(linesCount);
        }
      }
      qHtml += '</div>';
      return qHtml;
    }

    return "";
  });

  const temp = document.createElement("div");
  temp.innerHTML = restoreLegacyInlineHtml(renderedWithBlocks);
  const blocks = [];
  for (const node of Array.from(temp.childNodes)) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.classList && node.classList.contains("handout-pagebreak")) {
        blocks.push({ forcedBreak: true, html: "" });
        continue;
      }
      blocks.push({ html: `<div class="handout-block">${node.outerHTML}</div>` });
      continue;
    }
    if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
      blocks.push({ html: `<div class="handout-block">${renderTextBlock(node.textContent)}</div>` });
    }
  }

  return blocks;
}


function makePage() {
  const page = document.createElement("article");
  page.className = "handout-page";
  page.innerHTML = '<div class="page-content"></div>';
  preview.append(page);
  return page.querySelector(".page-content");
}

function clonePage(page) {
  const clone = page.cloneNode(true);
  clone.classList.remove("oversize-warning");
  return clone;
}

function makeSlot(page, label = "") {
  const slot = document.createElement("div");
  slot.className = `sheet-slot${page ? "" : " blank"}`;
  if (page) slot.append(clonePage(page));
  if (label) {
    const marker = document.createElement("span");
    marker.className = "sheet-label";
    marker.textContent = label;
    slot.append(marker);
  }
  return slot;
}

function appendFittedSheet(sheet) {
  const frame = document.createElement("div");
  frame.className = "sheet-preview-frame";
  frame.append(sheet);
  preview.append(frame);
}

function fitSheetPreviews() {
  const previewStyle = getComputedStyle(preview);
  const horizontalPadding = parseFloat(previewStyle.paddingLeft) + parseFloat(previewStyle.paddingRight);
  const availableWidth = Math.max(240, preview.clientWidth - horizontalPadding);
  document.querySelectorAll(".sheet-preview-frame").forEach(frame => {
    const sheet = frame.querySelector(".print-sheet");
    const naturalWidth = sheet.offsetWidth;
    const naturalHeight = sheet.offsetHeight;
    const scale = Math.min(1, availableWidth / naturalWidth);
    frame.style.width = `${naturalWidth * scale}px`;
    frame.style.height = `${naturalHeight * scale}px`;
    frame.style.setProperty("--sheet-preview-scale", scale);
  });
}

function imposePages(logicalPages, layout) {
  if (layout.startsWith("half-duplicate-")) {
    preview.innerHTML = "";
    logicalPages.forEach((page, index) => {
      const sheet = document.createElement("article");
      sheet.className = `print-sheet half-duplicate ${layouts[layout].impose}`;
      sheet.append(makeSlot(page, `Copy 1 · page ${index + 1}`), makeSlot(page, `Copy 2 · page ${index + 1}`));
      appendFittedSheet(sheet);
    });
    requestAnimationFrame(fitSheetPreviews);
    pageCount.textContent = `${logicalPages.length} letter sheet${logicalPages.length === 1 ? "" : "s"} · two copies each`;
    return;
  }

  if (layout === "booklet") {
    const sourcePages = [...logicalPages];
    while (sourcePages.length % 4) sourcePages.push(null);
    const total = sourcePages.length;
    const sides = [];
    for (let sheetIndex = 0; sheetIndex < total / 4; sheetIndex++) {
      sides.push({
        name: `Sheet ${sheetIndex + 1} front`,
        pages: [sourcePages[total - 1 - (sheetIndex * 2)], sourcePages[sheetIndex * 2]]
      });
      sides.push({
        name: `Sheet ${sheetIndex + 1} back`,
        pages: [sourcePages[(sheetIndex * 2) + 1], sourcePages[total - 2 - (sheetIndex * 2)]]
      });
    }
    preview.innerHTML = "";
    sides.forEach(side => {
      const sheet = document.createElement("article");
      sheet.className = "print-sheet booklet";
      sheet.append(makeSlot(side.pages[0], side.name), makeSlot(side.pages[1], side.name));
      appendFittedSheet(sheet);
    });
    requestAnimationFrame(fitSheetPreviews);
    pageCount.textContent = `${sides.length / 2} booklet sheet${sides.length === 2 ? "" : "s"} · ${sides.length} printed sides`;
  }
}

function applyLayout() {
  const layout = layouts[layoutSelect.value];
  document.documentElement.style.setProperty("--page-width", layout.width);
  document.documentElement.style.setProperty("--page-height", layout.height);
  let printStyle = document.querySelector("#dynamic-page-size");
  if (!printStyle) {
    printStyle = document.createElement("style");
    printStyle.id = "dynamic-page-size";
    document.head.append(printStyle);
  }
  printStyle.textContent = `@page { size: ${layout.page}; margin: 0; }`;
}

function paginate(blocks) {
  preview.innerHTML = "";
  let content = makePage();
  for (const block of blocks) {
    if (block.forcedBreak) {
      if (content.children.length) content = makePage();
      continue;
    }
    const wrapper = document.createElement("div");
    wrapper.innerHTML = block.html;
    const node = wrapper.firstElementChild;
    content.append(node);
    if (content.scrollHeight > content.clientHeight + 1 && content.children.length > 1) {
      node.remove();
      content = makePage();
      content.append(node);
    }
    if (content.scrollHeight > content.clientHeight + 1) node.classList.add("oversize-warning");
  }
  const logicalPages = [...preview.children];
  const count = logicalPages.length;
  if (layoutSelect.value.startsWith("half-duplicate-") || layoutSelect.value === "booklet") {
    imposePages(logicalPages, layoutSelect.value);
  } else {
    pageCount.textContent = `${count} ${layouts[layoutSelect.value].label} page${count === 1 ? "" : "s"}`;
  }
}

function render() {
  const previousScroll = previewPanel.scrollTop;
  totalPoints = [...source.value.matchAll(/:::question(?:\s+[^\n]*)?/g)].reduce((sum, match) => {
    const points = match[0].match(/(?:^|\s)points=(\d+(?:\.\d+)?)(?:\s|$)/);
    return sum + (points ? Number(points[1]) : 0);
  }, 0);
  questionCounter = 1;
  applyLayout();
  paginate(parseBlocks(withoutDocumentSettings(source.value)));
  statusText.textContent = "Preview updated";
  requestAnimationFrame(() => {
    previewPanel.scrollTop = previousScroll;
  });
}

function scheduleRender() {
  statusText.textContent = "Updating…";
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, 180);
}

async function loadFiles(files) {
  liveAssetMode = false;
  liveSourceVersion = null;
  assetMap.clear();
  let markdownFile;
  for (const file of files) {
    const relative = file.webkitRelativePath ? file.webkitRelativePath.split("/").slice(1).join("/") : file.name;
    if (/\.md(?:own)?$/i.test(file.name) && !markdownFile) markdownFile = file;
    if (file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name)) {
      const url = await fileToDataUrl(file);
      assetMap.set(relative, url);
      assetMap.set(file.name, url);
    }
  }
  if (!markdownFile) { statusText.textContent = "No Markdown file found"; return; }
  setSourceContent(await markdownFile.text());
  statusText.textContent = markdownFile.name;
  render();
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

document.querySelector("#file-input").addEventListener("change", event => loadFiles([...event.target.files]));
document.querySelector("#folder-input").addEventListener("change", event => loadFiles([...event.target.files]));
source.addEventListener("input", scheduleRender);
layoutSelect.addEventListener("change", render);
let toggleAnswersBtn = document.querySelector('#toggle-answers');
if (!toggleAnswersBtn && window.handoutDesktop) {
  toggleAnswersBtn = document.createElement("button");
  toggleAnswersBtn.id = "toggle-answers";
  toggleAnswersBtn.className = "button";
  toggleAnswersBtn.textContent = "Show answers";
  document.querySelector(".actions").insertBefore(toggleAnswersBtn, document.querySelector("#print-button"));
}
if (toggleAnswersBtn) toggleAnswersBtn.addEventListener('click', () => { showAnswers = !showAnswers; toggleAnswersBtn.classList.toggle('active', showAnswers); toggleAnswersBtn.textContent = showAnswers ? 'Hide answers' : 'Show answers'; render(); });
document.querySelector("#print-button").addEventListener("click", async () => {
  if (window.handoutDesktop) {
    const result = await window.handoutDesktop.print(activeHandoutTitle);
    statusText.textContent = result.success ? "Print job sent" : `Could not print: ${result.failureReason || "unknown error"}`;
    return;
  }
  window.print();
});
document.querySelector("#export-button").addEventListener("click", async () => {
  if (window.handoutDesktop) {
    const savedPath = await window.handoutDesktop.exportPdf(layoutSelect.value, activeHandoutTitle);
    if (savedPath) statusText.textContent = "PDF exported";
    return;
  }
  let css = "";
  for (const sheet of [...document.styleSheets]) {
    try {
      css += [...sheet.cssRules].map(rule => rule.cssText).join("\n");
    } catch {
      // A browser may hide rules from a cross-origin sheet; this app's sheet is local.
    }
  }
  const pages = preview.innerHTML;
  const documentText = `<!doctype html><html><head><meta charset="utf-8"><title>Handout</title><style>${css}</style></head><body><main id="preview">${pages}</main></body></html>`;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([documentText], { type: "text/html" }));
  link.download = "handout.html";
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});

async function checkLiveSource(initial = false) {
  try {
    const response = await fetch("/api/source", { cache: "no-store" });
    if (!response.ok) return;
    const handout = await response.json();
    liveAssetMode = true;
    if (handout.version !== liveSourceVersion) {
      liveSourceVersion = handout.version;
      liveAssetVersion = handout.version;
      setSourceContent(handout.content);
      render();
      statusText.textContent = initial ? `${handout.name} · live preview` : `${handout.name} · saved changes loaded`;
    }
  } catch {
    if (liveSourceVersion !== null) statusText.textContent = "Preview server disconnected";
  }
}

function startLivePreview() {
  if (!/^https?:$/.test(window.location.protocol)) {
    render();
    return;
  }
  render();
  checkLiveSource(true);
  window.setInterval(() => checkLiveSource(false), 750);
}

window.addEventListener("load", startLivePreview);
window.addEventListener("resize", fitSheetPreviews);

// Electron adds local-file editing around the existing renderer. The parsing,
// pagination, preview and print CSS above remain the single rendering path.
if (window.handoutDesktop) {
  const desktop = window.handoutDesktop;
  const tree = document.querySelector("#file-tree");
  const folderName = document.querySelector("#folder-name");
  const openFolderButton = document.querySelector("#open-folder-button");
  const newHandoutButton = document.querySelector("#new-handout-button");
  const saveButton = document.querySelector("#save-button");
  const openFileButton = document.querySelector("#open-file-button");
  const recentButton = document.querySelector("#recent-button");
  const editorPanel = document.querySelector(".editor-panel");
  const tabBar = document.createElement("div");
  tabBar.className = "document-tabs";
  editorPanel.insertBefore(tabBar, editorPanel.firstChild);
  const editorSurface = document.createElement("div");
  editorSurface.className = "editor-surface";
  editorPanel.insertBefore(editorSurface, source);
  const highlight = document.createElement("pre");
  highlight.id = "source-highlight";
  highlight.className = "source-highlight";
  highlight.setAttribute("aria-hidden", "true");
  const lineNumbers = document.createElement("pre");
  lineNumbers.className = "line-numbers";
  lineNumbers.setAttribute("aria-hidden", "true");
  const searchHighlight = document.createElement("pre");
  searchHighlight.className = "search-highlight";
  searchHighlight.setAttribute("aria-hidden", "true");
  editorSurface.append(lineNumbers, highlight, searchHighlight, source);
  source.classList.add("highlighted-source");
  let selectedFile = null;
  let dirty = false;
  let folder = null;
  const documents = new Map();
  let activePath = null;
  let loadingDocument = false;

  function makeToolbarMenu(label, controls) {
    const menu = document.createElement("div");
    menu.className = "toolbar-menu";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button menu-button";
    button.textContent = label;
    const panel = document.createElement("div");
    panel.className = "toolbar-menu-panel";
    controls.forEach(control => control && panel.append(control));
    menu.append(button, panel);
    button.addEventListener("click", event => { event.stopPropagation(); panel.classList.toggle("open"); });
    document.addEventListener("click", event => { if (!menu.contains(event.target)) panel.classList.remove("open"); });
    document.querySelector(".actions").insertBefore(menu, document.querySelector(".layout-control"));
    return { menu, panel };
  }
  makeToolbarMenu("File", [openFolderButton, openFileButton, recentButton, newHandoutButton, saveButton]);
  makeToolbarMenu("View", [toggleAnswersBtn, ...document.querySelectorAll(".panel-restore")]);

  function makeActionButton(label, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button";
    button.textContent = label;
    button.addEventListener("click", handler);
    return button;
  }

  function escapeAIHtml(value) {
    return escapeHtml(String(value));
  }

  function setupAIActivity(overlay, status) {
    const context = overlay.querySelector('.ai-context');
    const activity = overlay.querySelector('.ai-activity');
    const output = overlay.querySelector('.ai-output');
    const messages = [];
    return progress => {
      if (!progress || typeof progress !== 'object') return;
      if (progress.message) status.textContent = progress.message;
      if (progress.prompt) context.textContent = `Inference backend: ${progress.inferenceBackend || 'Unknown'}\nSelected handout text: ${progress.selectedCharacters} characters\nContext window: ${progress.contextSize} tokens\nOutput limit: ${progress.maxTokens} tokens\n\nExact prompt sent to the model:\n${progress.prompt}`;
      if (Object.hasOwn(progress, 'generatedText')) {
        output.textContent = progress.generatedText || 'Waiting for generated text…';
        output.scrollTop = output.scrollHeight;
      }
      if (progress.message) {
        messages.push(`${new Date().toLocaleTimeString()} — ${progress.message}`);
        activity.textContent = messages.slice(-40).join('\n');
        activity.scrollTop = activity.scrollHeight;
      }
    };
  }

  function createAIRequestId() {
    return globalThis.crypto?.randomUUID?.() || `ai-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function shuffleChoices(correctAnswer, distractors) {
    const choices = [correctAnswer, ...distractors].map((text, index) => ({ text, correct: index === 0 }));
    for (let index = choices.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [choices[index], choices[swapIndex]] = [choices[swapIndex], choices[index]];
    }
    return choices;
  }

  function makeAIOutput(actionId, result) {
    if (actionId === "quiz") {
      const points = Math.max(0, Number(result.defaultPoints) || 1);
      return result.previewQuestions.map(question => `:::question type=mc points=${points}\n${question.question}\n${question.choices.map(choice => `- ${choice.text}${choice.correct ? " *" : ""}`).join("\n")}\n:::\n`).join("\n");
    }
    if (actionId === "vocabulary" || actionId === "vocabularyExamples") {
      const withExamples = actionId === "vocabularyExamples";
      const columns = withExamples ? '<col style="width: 22%">\n  <col style="width: 38%">\n  <col style="width: 40%">' : '<col style="width: 25%">\n  <col style="width: 75%">';
      const headers = withExamples ? '<th>Term</th><th>Definition</th><th>Example</th>' : '<th>Term</th><th>Definition</th>';
      const rows = result.rows.map(row => withExamples ? `<tr><td>${escapeHtml(row.term)}</td><td>${escapeHtml(row.definition)}</td><td>${escapeHtml(row.example)}</td></tr>` : `<tr><td>${escapeHtml(row.term)}</td><td>${escapeHtml(row.definition)}</td></tr>`);
      return `<table class="worksheet-table vocabulary-table">\n  <colgroup>\n  ${columns}\n  </colgroup>\n  <thead>\n    <tr>${headers}</tr>\n  </thead>\n  <tbody>\n    ${rows.join("\n    ")}\n  </tbody>\n</table>\n\n`;
    }
    const choices = result.previewChoices || shuffleChoices(result.correctAnswer, result.distractors);
    return `:::question type=mc\n${result.question}\n${choices.map(choice => `- ${choice.text}${choice.correct ? " *" : ""}`).join("\n")}\n:::\n\n`;
  }

  function showAIPreview(actionId, result) {
    if (actionId === "quiz") {
      return result.previewQuestions.map((question, index) => `<div class="ai-question-preview"><strong>${index + 1}. ${escapeAIHtml(question.question)}</strong><ol type="A">${question.choices.map(choice => `<li>${escapeAIHtml(choice.text)}</li>`).join("")}</ol></div>`).join("");
    }
    if (actionId === "vocabulary" || actionId === "vocabularyExamples") {
      const withExamples = actionId === "vocabularyExamples";
      return `<table class="ai-preview-table"><colgroup>${withExamples ? '<col style="width:22%"><col style="width:38%"><col style="width:40%">' : '<col style="width:25%"><col style="width:75%">'}</colgroup><thead><tr><th>Term</th><th>Definition</th>${withExamples ? "<th>Example</th>" : ""}</tr></thead><tbody>${result.rows.map(row => `<tr><td>${escapeAIHtml(row.term)}</td><td>${escapeAIHtml(row.definition)}</td>${withExamples ? `<td>${escapeAIHtml(row.example)}</td>` : ""}</tr>`).join("")}</tbody></table>`;
    }
    const choices = result.previewChoices || shuffleChoices(result.correctAnswer, result.distractors);
    return `<div class="ai-question-preview"><strong>${escapeAIHtml(result.question)}</strong><ol type="A">${choices.map(choice => `<li>${escapeAIHtml(choice.text)}</li>`).join("")}</ol></div>`;
  }

  function openAIAction(action) {
    const start = source.selectionStart;
    const end = source.selectionEnd;
    const selectedText = source.value.slice(start, end).trim();
    if (action.requiresSelection && !selectedText) { statusText.textContent = "Select text in the Markdown editor first"; source.focus(); return; }
    const overlay = document.createElement("div");
    overlay.className = "ai-dialog-overlay";
    overlay.innerHTML = `<section class="ai-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-dialog-title"><header><h2 id="ai-dialog-title">${escapeAIHtml(action.label)}</h2><button type="button" class="ai-dialog-close" aria-label="Close">×</button></header><p class="ai-dialog-description">${escapeAIHtml(action.description)}</p><div class="ai-dialog-source"><strong>Selected text</strong><pre>${escapeAIHtml(selectedText)}</pre></div><label class="ai-prompt-label">Prompt to send <textarea class="ai-prompt" rows="10" spellcheck="true" aria-label="Prompt to send to AI"></textarea></label><details class="ai-debug"><summary>Model context & activity</summary><pre class="ai-context">Waiting for the request to be prepared…</pre><strong class="ai-output-label">Live model output (not yet parsed)</strong><pre class="ai-output" aria-live="polite">Waiting for generated text…</pre><pre class="ai-activity" aria-live="polite"></pre></details><div class="ai-status" role="status"></div><div class="ai-result"></div><footer><button type="button" class="button secondary ai-reset-prompt">Reset prompt</button><button type="button" class="button primary ai-regenerate">Send to AI</button><button type="button" class="button secondary ai-stop" disabled>Stop AI</button><button type="button" class="button primary ai-approve" disabled>Insert/Replace</button><button type="button" class="button secondary ai-cancel">Cancel</button></footer></section>`;
    document.body.append(overlay);
    overlay.querySelector('.ai-debug').open = true;
    const status = overlay.querySelector(".ai-status");
    const resultArea = overlay.querySelector(".ai-result");
    const generateButton = overlay.querySelector(".ai-regenerate");
    const promptInput = overlay.querySelector(".ai-prompt");
    const stopButton = overlay.querySelector(".ai-stop");
    const approveButton = overlay.querySelector(".ai-approve");
    const updateActivity = setupAIActivity(overlay, status);
    let result = null;
    let busy = false;
    let activeRequestId = null;
    const preparePrompt = async () => { promptInput.value = await desktop.prepareAI(action.id, selectedText, { aiContext: currentAIContext(source.value) }); status.textContent = "Edit the prompt if needed, then choose Send to AI."; };
    const close = () => { if (activeRequestId) void desktop.stopAI(activeRequestId); overlay.remove(); };
    overlay.querySelector(".ai-dialog-close").addEventListener("click", close);
    overlay.querySelector(".ai-cancel").addEventListener("click", close);
    async function generate() {
      if (busy) return;
      busy = true; generateButton.disabled = true; stopButton.disabled = false; approveButton.disabled = true; status.textContent = "Preparing local AI request…"; resultArea.innerHTML = "";
      const requestId = createAIRequestId();
      activeRequestId = requestId;
      const stopProgress = desktop.onAIProgress((progressRequestId, progress) => { if (progressRequestId === requestId) updateActivity(progress); });
      try {
        result = await desktop.generateAI(action.id, selectedText, { aiContext: currentAIContext(source.value), prompt: promptInput.value, requestId });
        if (action.id === "distractors") result.previewChoices = shuffleChoices(result.correctAnswer, result.distractors);
        resultArea.innerHTML = showAIPreview(action.id, result);
        status.textContent = "Review the proposed result before inserting it.";
        approveButton.disabled = false;
      } catch (error) {
        result = null;
        status.textContent = error.message || "AI generation failed.";
      } finally { stopProgress(); busy = false; activeRequestId = null; generateButton.disabled = false; stopButton.disabled = true; }
    }
    generateButton.addEventListener("click", generate);
    overlay.querySelector(".ai-reset-prompt").addEventListener("click", () => preparePrompt().catch(error => { status.textContent = error.message || "Could not prepare the prompt."; }));
    stopButton.addEventListener("click", async () => { if (activeRequestId) { stopButton.disabled = true; status.textContent = "Stopping AI generation…"; await desktop.stopAI(activeRequestId); } });
    approveButton.addEventListener("click", () => { if (!result) return; source.focus(); source.setSelectionRange(start, end); source.setRangeText(makeAIOutput(action.id, result), start, end, "end"); source.dispatchEvent(new Event("input", { bubbles: true })); close(); });
    preparePrompt().catch(error => { status.textContent = error.message || "Could not prepare the prompt."; });
  }

  function openQuizAction(action) {
    const start = source.selectionStart;
    const end = source.selectionEnd;
    const overlay = document.createElement("div");
    overlay.className = "ai-dialog-overlay";
    overlay.innerHTML = `<section class="ai-dialog" role="dialog" aria-modal="true" aria-labelledby="quiz-dialog-title"><header><h2 id="quiz-dialog-title">${escapeAIHtml(action.label)}</h2><button type="button" class="ai-dialog-close" aria-label="Close">×</button></header><p class="ai-dialog-description">Create multiple-choice questions that match this handout.</p><div class="quiz-options"><label>Number of questions <input class="quiz-count" type="number" min="1" max="20" value="5"></label><label>Default points <input class="quiz-points" type="number" min="0" max="100" value="1"></label><label class="quiz-context-label">Additional context <textarea class="quiz-context" rows="4" placeholder="Topics, standards, reading level, or directions for the quiz"></textarea></label></div><label class="ai-prompt-label">Prompt to send <textarea class="ai-prompt" rows="10" spellcheck="true" aria-label="Prompt to send to AI"></textarea></label><details class="ai-debug"><summary>Model context & activity</summary><pre class="ai-context">Waiting for the request to be prepared…</pre><strong class="ai-output-label">Live model output (not yet parsed)</strong><pre class="ai-output" aria-live="polite">Waiting for generated text…</pre><pre class="ai-activity" aria-live="polite"></pre></details><div class="ai-status" role="status"></div><div class="ai-result"></div><footer><button type="button" class="button secondary ai-reset-prompt">Reset prompt</button><button type="button" class="button primary ai-regenerate">Send to AI</button><button type="button" class="button secondary ai-stop" disabled>Stop AI</button><button type="button" class="button primary ai-approve" disabled>Insert Quiz</button><button type="button" class="button secondary ai-cancel">Cancel</button></footer></section>`;
    document.body.append(overlay);
    overlay.querySelector('.ai-debug').open = true;
    const status = overlay.querySelector(".ai-status");
    const resultArea = overlay.querySelector(".ai-result");
    const generateButton = overlay.querySelector(".ai-regenerate");
    const promptInput = overlay.querySelector(".ai-prompt");
    const stopButton = overlay.querySelector(".ai-stop");
    const approveButton = overlay.querySelector(".ai-approve");
    const updateActivity = setupAIActivity(overlay, status);
    let result = null;
    let busy = false;
    let activeRequestId = null;
    const preparePrompt = async () => { promptInput.value = await desktop.prepareAI(action.id, source.value, { questionCount: Number(overlay.querySelector(".quiz-count").value) || 5, defaultPoints: Number(overlay.querySelector(".quiz-points").value) || 1, additionalContext: overlay.querySelector(".quiz-context").value, aiContext: currentAIContext(source.value) }); status.textContent = "Edit the prompt if needed, then choose Send to AI."; };
    const close = () => { if (activeRequestId) void desktop.stopAI(activeRequestId); overlay.remove(); };
    overlay.querySelector(".ai-dialog-close").addEventListener("click", close);
    overlay.querySelector(".ai-cancel").addEventListener("click", close);
    async function generate() {
      if (busy) return;
      const questionCount = Number(overlay.querySelector(".quiz-count").value) || 5;
      const defaultPoints = Number(overlay.querySelector(".quiz-points").value) || 1;
      const additionalContext = overlay.querySelector(".quiz-context").value;
      busy = true; generateButton.disabled = true; stopButton.disabled = false; approveButton.disabled = true; status.textContent = "Preparing local AI request…"; resultArea.innerHTML = "";
      const requestId = createAIRequestId();
      activeRequestId = requestId;
      const stopProgress = desktop.onAIProgress((progressRequestId, progress) => { if (progressRequestId === requestId) updateActivity(progress); });
      try {
        result = await desktop.generateAI(action.id, source.value, { questionCount, defaultPoints, additionalContext, aiContext: currentAIContext(source.value), prompt: promptInput.value, requestId });
        result.defaultPoints = defaultPoints;
        result.previewQuestions = result.questions.map(question => ({ question: question.question, choices: shuffleChoices(question.correctAnswer, question.distractors) }));
        resultArea.innerHTML = showAIPreview(action.id, result);
        status.textContent = "Review the proposed quiz before inserting it.";
        approveButton.disabled = false;
      } catch (error) { result = null; status.textContent = error.message || "AI generation failed."; }
      finally { stopProgress(); busy = false; activeRequestId = null; generateButton.disabled = false; stopButton.disabled = true; }
    }
    generateButton.addEventListener("click", generate);
    overlay.querySelector(".ai-reset-prompt").addEventListener("click", () => preparePrompt().catch(error => { status.textContent = error.message || "Could not prepare the prompt."; }));
    stopButton.addEventListener("click", async () => { if (activeRequestId) { stopButton.disabled = true; status.textContent = "Stopping AI generation…"; await desktop.stopAI(activeRequestId); } });
    approveButton.addEventListener("click", () => { if (!result) return; source.focus(); source.setSelectionRange(start, end); source.setRangeText(makeAIOutput(action.id, result), start, end, "end"); source.dispatchEvent(new Event("input", { bubbles: true })); close(); });
    preparePrompt().catch(error => { status.textContent = error.message || "Could not prepare the prompt."; });
  }

  async function showAISettings() {
    const overlay = document.createElement("div");
    overlay.className = "ai-dialog-overlay";
    overlay.innerHTML = '<section class="ai-dialog" role="dialog" aria-modal="true"><header><h2>AI Settings</h2><button type="button" class="ai-dialog-close" aria-label="Close">×</button></header><div class="ai-settings-status"></div><footer><button type="button" class="button primary ai-select-model">Select GGUF model</button><button type="button" class="button secondary ai-cancel">Close</button></footer></section>';
    document.body.append(overlay);
    const status = overlay.querySelector(".ai-settings-status");
    const renderStatus = model => { const stateLabels = { installed: "Installed", "not-installed": "Not Installed", loading: "Loading", error: "Error" }; status.innerHTML = `<p><strong>Local AI:</strong> ${escapeAIHtml(stateLabels[model.state] || model.state)}</p><p><strong>Model:</strong> ${escapeAIHtml(model.modelName || "None selected")}</p><p class="ai-model-path">${escapeAIHtml(model.modelPath || "Choose a compatible .gguf file to enable AI tools.")}</p>${model.message ? `<p class="ai-error">${escapeAIHtml(model.message)}</p>` : ""}`; };
    renderStatus(await desktop.aiStatus());
    const close = () => overlay.remove();
    overlay.querySelector(".ai-dialog-close").addEventListener("click", close);
    overlay.querySelector(".ai-cancel").addEventListener("click", close);
    overlay.querySelector(".ai-select-model").addEventListener("click", async event => { event.currentTarget.disabled = true; try { const model = await desktop.selectAIModel(); if (model) renderStatus(model); } catch (error) { status.innerHTML += `<p class="ai-error">${escapeAIHtml(error.message)}</p>`; } finally { event.currentTarget.disabled = false; } });
  }

  const aiMenu = makeToolbarMenu("AI Tools", [makeActionButton("AI Settings", showAISettings)]);
  desktop.aiActions().then(actions => actions.reverse().forEach(action => aiMenu.panel.insertBefore(makeActionButton(action.label, () => action.id === "quiz" ? openQuizAction(action) : openAIAction(action)), aiMenu.panel.firstChild))).catch(error => { console.error("[local-ai] Could not load actions", error); });

  function jumpToPreviewSource(block, target) {
    const normalizePreviewText = text => text.replace(/^\s*\d+\.\s*/, "").replace(/\s+/g, " ").trim();
    const clickedSpecial = target.closest(".answer-lines, .inline-answer, .drawing-space");
    if (clickedSpecial) {
      const sourcePattern = clickedSpecial.closest(".drawing-space") ? /\{\{space:\d+(?::(?:blank|box|dots))?\}\}/ : /\{\{lines:\d+(?::(?:inline|new))?\}\}/;
      const sourceLines = source.value.split("\n");
      const nearbyBlock = clickedSpecial.closest(".handout-block");
      const previousBlock = nearbyBlock && nearbyBlock.previousElementSibling;
      const anchorText = [nearbyBlock, previousBlock]
        .filter(Boolean)
        .flatMap(candidate => [...candidate.querySelectorAll("h1,h2,h3,h4,p,li")].map(node => node.textContent.trim()))
        .filter(text => text.length >= 4)
        .sort((a, b) => b.length - a.length)[0];
      const anchorLine = anchorText ? sourceLines.findIndex(line => line.toLowerCase().includes(anchorText.toLowerCase().slice(0, 80))) : -1;
      let specialLine = -1;
      for (let index = Math.max(0, anchorLine); index < sourceLines.length; index++) {
        if (sourcePattern.test(sourceLines[index])) { specialLine = index; break; }
        if (anchorLine !== -1 && index > anchorLine + 20) break;
      }
      if (specialLine !== -1) {
        const start = sourceLines.slice(0, specialLine).join("\n").length + (specialLine ? 1 : 0);
        source.focus();
        source.setSelectionRange(start, start + sourceLines[specialLine].length);
        const lineHeight = parseFloat(getComputedStyle(source).lineHeight) || 22;
        source.scrollTop = Math.max(0, specialLine * lineHeight - source.clientHeight / 3);
        syncHighlight();
        statusText.textContent = `Editing line ${specialLine + 1}`;
        return;
      }
    }
    const prompt = target.closest(".question-prompt");
    const candidates = [prompt, ...block.querySelectorAll("h1,h2,h3,h4,p,li,th,td")]
      .filter(Boolean)
      .map(node => normalizePreviewText(node.textContent))
      .filter(text => text.length >= 4)
      .sort((a, b) => b.length - a.length);
    const lines = source.value.split("\n");
    const candidate = candidates.find(text => lines.some(line => line.toLowerCase().includes(text.toLowerCase().slice(0, 80))));
    if (!candidate) { statusText.textContent = "Could not locate this preview block in the Markdown"; return; }
    const matchIndex = lines.findIndex(line => line.toLowerCase().includes(candidate.toLowerCase().slice(0, 80)));
    const start = lines.slice(0, matchIndex).join("\n").length + (matchIndex ? 1 : 0);
    source.focus();
    source.setSelectionRange(start, start + lines[matchIndex].length);
    const lineHeight = parseFloat(getComputedStyle(source).lineHeight) || 22;
    source.scrollTop = Math.max(0, matchIndex * lineHeight - source.clientHeight / 3);
    syncHighlight();
    statusText.textContent = `Editing line ${matchIndex + 1}`;
  }
  preview.addEventListener("click", event => {
    const block = event.target.closest(".handout-block");
    if (block) jumpToPreviewSource(block, event.target);
  });

  function saveActiveState() {
    if (!selectedFile) return;
    const documentState = documents.get(selectedFile.path);
    if (documentState) { documentState.content = source.value; documentState.dirty = dirty; }
  }
  function drawTabs() {
    tabBar.innerHTML = "";
    for (const documentState of documents.values()) {
      const tab = document.createElement("div");
      tab.className = `document-tab${documentState.file.path === activePath ? " active" : ""}`;
      tab.title = documentState.file.path;
      const label = document.createElement("button");
      label.className = "document-tab-label";
      label.textContent = `${documentState.file.name}${documentState.dirty ? " *" : ""}`;
      label.title = documentState.file.path;
      label.addEventListener("click", () => activateDocument(documentState.file.path));
      const close = document.createElement("button");
      close.className = "document-tab-close";
      close.type = "button";
      close.textContent = "x";
      close.title = `Close ${documentState.file.name}`;
      close.setAttribute("aria-label", `Close ${documentState.file.name}`);
      close.addEventListener("click", event => { event.stopPropagation(); closeDocument(documentState.file.path); });
      tab.append(label, close);
      tabBar.append(tab);
    }
  }
  async function closeDocument(filePath) {
    const documentState = documents.get(filePath);
    if (!documentState) return;
    if (documentState.dirty) {
      const choice = window.confirm(`Save changes to ${documentState.file.name} before closing?`);
      if (choice) {
        try { await desktop.saveFile(filePath, documentState.content); }
        catch (error) { statusText.textContent = `Could not save: ${error.message}`; return; }
      }
    }
    const wasActive = activePath === filePath;
    documents.delete(filePath);
    if (!wasActive) { drawTabs(); return; }
    const next = documents.values().next().value;
    if (next) activateDocument(next.file.path);
    else {
      activePath = null; selectedFile = null; dirty = false; source.value = ""; setAssets([]); markDirty(false); drawTabs(); render();
    }
  }
  function activateDocument(filePath) {
    saveActiveState();
    const documentState = documents.get(filePath);
    if (!documentState) return;
    activePath = filePath;
    selectedFile = documentState.file;
    dirty = documentState.dirty;
    loadingDocument = true;
    setSourceContent(documentState.content);
    loadingDocument = false;
    setAssets(documentState.assets || []);
    currentHandoutTitle();
    markDirty(dirty);
    drawTabs();
    render();
    source.focus();
  }
  function addDocument(file, content, assets) {
    const existing = documents.get(file.path);
    if (existing) { activateDocument(file.path); return; }
    documents.set(file.path, { file, content, assets, dirty: false });
    activateDocument(file.path);
  }

  function highlightMarkdown(value) {
    return value.split("\n").map(line => {
      const escaped = line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const lineClass = escaped.includes("|") ? " md-table-line" : "";
      return escaped.replace(/^(#{1,6})(.*)$|^(:::[^\n]*)$|(\{\{[^}]+\}\})|(`[^`]+`)|(\*\*[^*]+\*\*)|(!?\[[^\]]*\]\([^)]*\))/g, (match, hashes, heading, directive, token, code, strong, link) => {
        if (hashes) return `<span class="md-heading">${match}</span>`;
        if (directive) return `<span class="md-directive">${match}</span>`;
        if (token) return `<span class="md-token">${match}</span>`;
        if (code) return `<span class="md-code">${match}</span>`;
        if (strong) return `<span class="md-strong">${match}</span>`;
        if (link) return `<span class="md-link">${match}</span>`;
        return match;
      }) + `<span class="${lineClass.trim()}"></span>`;
    }).join("\n");
  }
  function syncHighlight() {
    highlight.innerHTML = `${highlightMarkdown(source.value)}\n`;
    lineNumbers.textContent = Array.from({ length: Math.max(1, source.value.split("\n").length) }, (_, index) => index + 1).join("\n");
    highlight.scrollTop = source.scrollTop;
    highlight.scrollLeft = source.scrollLeft;
    searchHighlight.scrollTop = source.scrollTop;
    searchHighlight.scrollLeft = source.scrollLeft;
    lineNumbers.scrollTop = source.scrollTop;
  }
  syncHighlight();
  source.addEventListener("input", syncHighlight);
  source.addEventListener("scroll", syncHighlight);

  const findBar = document.createElement("div");
  findBar.className = "find-bar";
  findBar.innerHTML = '<button type="button" class="find-arrow find-previous" aria-label="Previous match">&#x25B2;</button><input type="search" placeholder="Find in document" aria-label="Find in document"><span class="find-count"></span><button type="button" class="find-arrow find-next" aria-label="Next match">&#x25BC;</button><button type="button" class="panel-toggle find-close">Close</button>';
  editorPanel.insertBefore(findBar, editorSurface);
  const findInput = findBar.querySelector("input");
  const findCount = findBar.querySelector(".find-count");
  let searchMatches = [];
  let activeMatch = 0;
  function renderSearchHighlights() {
    const query = findInput.value;
    if (!query) { searchHighlight.innerHTML = ""; searchMatches = []; findCount.textContent = ""; return; }
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    searchMatches = [...source.value.matchAll(new RegExp(escapedQuery, "gi"))];
    if (!searchMatches.length) { searchHighlight.innerHTML = source.value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); findCount.textContent = "0 matches"; return; }
    activeMatch = Math.min(activeMatch, searchMatches.length - 1);
    let cursor = 0;
    let html = "";
    searchMatches.forEach((match, index) => {
      html += source.value.slice(cursor, match.index).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const text = match[0].replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      html += `<mark class="${index === activeMatch ? "active" : ""}">${text}</mark>`;
      cursor = match.index + match[0].length;
    });
    searchHighlight.innerHTML = `${html}${source.value.slice(cursor).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}\n`;
    findCount.textContent = `${activeMatch + 1} of ${searchMatches.length}`;
  }
  function selectSearchMatch() {
    const match = searchMatches[activeMatch];
    if (!match) return;
    source.setSelectionRange(match.index, match.index + match[0].length);
    const lineNumber = source.value.slice(0, match.index).split("\n").length - 1;
    const lineHeight = parseFloat(getComputedStyle(source).lineHeight) || 22;
    source.scrollTop = Math.max(0, lineNumber * lineHeight - (source.clientHeight / 2) + lineHeight);
    syncHighlight();
    renderSearchHighlights();
  }
  function findText() {
    activeMatch = 0;
    renderSearchHighlights();
    selectSearchMatch();
  }
  function showFind() { findBar.classList.add("open"); findInput.focus(); findInput.select(); }
  findInput.addEventListener("input", findText);
  findInput.addEventListener("keydown", event => {
    if (event.key !== "Enter" || !searchMatches.length) return;
    event.preventDefault();
    activeMatch = (activeMatch + 1) % searchMatches.length;
    selectSearchMatch();
  });
  source.addEventListener("input", renderSearchHighlights);
  findBar.querySelector(".find-previous").addEventListener("click", () => { if (!searchMatches.length) return; activeMatch = (activeMatch - 1 + searchMatches.length) % searchMatches.length; selectSearchMatch(); findInput.focus(); });
  findBar.querySelector(".find-next").addEventListener("click", () => { if (!searchMatches.length) return; activeMatch = (activeMatch + 1) % searchMatches.length; selectSearchMatch(); findInput.focus(); });
  findBar.querySelector(".find-close").addEventListener("click", () => {
    findInput.value = "";
    activeMatch = 0;
    renderSearchHighlights();
    findBar.classList.remove("open");
  });
  document.querySelector("#find-button")?.addEventListener("click", showFind);
  window.addEventListener("keydown", event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") { event.preventDefault(); showFind(); } });

  function currentHandoutTitle() {
    const heading = source.value.match(/^ {0,3}#(?!#)\s+(.+?)\s*#*\s*$/m);
    const headingText = heading && heading[1].trim();
    const fallback = selectedFile ? selectedFile.name.replace(/\.(md|markdown|mdown)$/i, "") : "handout";
    const title = headingText || fallback;
    activeHandoutTitle = title;
    document.title = title;
    return title;
  }

  function markDirty(value) {
    dirty = value;
    saveButton.classList.toggle("dirty", dirty);
    if (selectedFile) statusText.textContent = `${selectedFile.name}${dirty ? " · unsaved" : ""}`;
  }

  function clearActive() { tree.querySelectorAll(".file-entry.active").forEach(node => node.classList.remove("active")); }
  function addTree(nodes, parent) {
    const list = document.createElement("ul");
    for (const node of nodes) {
      const item = document.createElement("li");
      if (node.type === "folder") {
        const details = document.createElement("details"); details.open = true;
        const summary = document.createElement("summary"); summary.textContent = node.name; details.append(summary);
        addTree(node.children, details); item.append(details);
      } else if (node.markdown) {
        const button = document.createElement("button"); button.className = "file-entry"; button.textContent = node.name; button.title = node.path;
        button.addEventListener("click", () => openFile(node, button)); item.append(button);
      }
      if (item.childNodes.length) list.append(item);
    }
    parent.append(list);
  }
  function drawTree() { tree.innerHTML = ""; if (folder) addTree(folder.tree, tree); if (!tree.childNodes.length) tree.innerHTML = '<p class="empty-tree">No Markdown files in this folder.</p>'; }
  async function openFile(node, button) {
    if (selectedFile && node.path === selectedFile.path) return;
    if (dirty && !window.confirm("Save changes to the current handout before opening another file?")) return;
    if (dirty) await saveCurrent();
    try {
      const content = await desktop.readFile(node.path); addDocument(node, content, folder ? folder.assets : []); clearActive(); if (button) button.classList.add("active");
    } catch (error) { statusText.textContent = `Could not open file: ${error.message}`; }
  }
  async function loadStandalone(file) {
    if (!file) return;
    if (dirty && !window.confirm("Save changes to the current handout before opening another file?")) return;
    if (dirty && !await saveCurrent()) return;
    const documentFile = { type: "file", name: file.name, path: file.path, markdown: true };
    addDocument(documentFile, file.content, file.assets || []);
    folderName.textContent = file.name; folder = null; clearActive();
  }
  async function chooseFile() {
    try { await loadStandalone(await desktop.openFile()); }
    catch (error) { statusText.textContent = `Could not open file: ${error.message}`; }
  }
  async function chooseRecent() {
    const recent = await desktop.recentFiles();
    if (!recent.length) { statusText.textContent = "No recent Markdown files"; return; }
    const menu = document.createElement("div");
    menu.className = "recent-menu";
    recent.forEach(file => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "recent-item";
      item.textContent = file.name;
      item.title = file.path;
      item.addEventListener("click", async () => {
        menu.remove();
        try { await loadStandalone(await desktop.openRecent(file.path)); }
        catch (error) { statusText.textContent = `Could not open recent file: ${error.message}`; }
      });
      menu.append(item);
    });
    document.body.append(menu);
    const buttonRect = recentButton.getBoundingClientRect();
    menu.style.top = `${buttonRect.bottom + 6}px`;
    menu.style.left = `${Math.max(8, buttonRect.right - menu.offsetWidth)}px`;
    window.setTimeout(() => document.addEventListener("pointerdown", event => { if (!menu.contains(event.target) && event.target !== recentButton) menu.remove(); }, { once: true }), 0);
  }
  async function saveCurrent() {
    if (!selectedFile) return false;
    try { await desktop.saveFile(selectedFile.path, source.value); dirty = false; const documentState = documents.get(selectedFile.path); if (documentState) { documentState.content = source.value; documentState.dirty = false; } markDirty(false); drawTabs(); return true; }
    catch (error) { statusText.textContent = `Could not save: ${error.message}`; return false; }
  }
  function setAssets(assets) { assetMap.clear(); assets.forEach(asset => { assetMap.set(asset.relative, asset.url); assetMap.set(asset.relative.split("/").pop(), asset.url); }); }
  async function chooseFolder() {
    if (dirty && !window.confirm("Save changes to the current handout before changing folders?")) return;
    if (dirty && !await saveCurrent()) return;
    const next = await desktop.openFolder();
    if (!next) return;
    saveActiveState(); folder = next; selectedFile = null; activePath = null; documents.clear(); source.value = ""; folderName.textContent = next.name; setAssets(next.assets); drawTabs(); drawTree(); markDirty(false); render();
  }
  async function makeNewHandout() {
    if (!folder) return chooseFolder();
    const filePath = await desktop.newFile(); if (!filePath) return;
    const node = { type: "file", name: filePath.split(/[\\/]/).pop(), path: filePath, markdown: true };
    folder.tree.push(node); folder.tree.sort((a,b) => a.name.localeCompare(b.name)); drawTree(); await openFile(node, [...tree.querySelectorAll(".file-entry")].find(button => button.title === filePath));
  }
  source.addEventListener("input", () => { if (loadingDocument) return; currentHandoutTitle(); dirty = true; if (selectedFile) { const documentState = documents.get(selectedFile.path); if (documentState) { documentState.content = source.value; documentState.dirty = true; } } markDirty(true); drawTabs(); });
  openFolderButton.addEventListener("click", chooseFolder);
  openFileButton.addEventListener("click", chooseFile);
  recentButton.addEventListener("click", chooseRecent);
  newHandoutButton.addEventListener("click", makeNewHandout);
  saveButton.addEventListener("click", saveCurrent);
  window.addEventListener("keydown", event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); saveCurrent(); } });
  window.addEventListener("beforeunload", event => { if (dirty) { event.preventDefault(); event.returnValue = ""; } });
}
