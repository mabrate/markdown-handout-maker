const source = document.querySelector("#source");
const preview = document.querySelector("#preview");
const statusText = document.querySelector("#status");
const pageCount = document.querySelector("#page-count");
const layoutSelect = document.querySelector("#layout-select");
const previewPanel = document.querySelector(".preview-panel");
const workspace = document.querySelector(".workspace");
const assetMap = new Map();
const videoObjectUrls = new Set();
const videoAssetMap = new Map();
function clearAssets() { for (const url of videoObjectUrls) URL.revokeObjectURL(url); videoObjectUrls.clear(); videoAssetMap.clear(); assetMap.clear(); }
function videoAssetUrl(src) { let decoded; try { decoded = decodeURIComponent(src); } catch { return null; } return videoAssetMap.get(src) || videoAssetMap.get(decoded) || null; }
let renderTimer;
let liveSourceVersion = null;
let liveAssetMode = false;
let liveAssetVersion = "";
let showAnswers = false;
let questionCounter = 1;
let activeHandoutTitle = "handout";
let totalPoints = 0;

let currentDocumentPath = null;
let lastDocumentMode;
const slideStudio = window.SlideStudio.mount({ source, preview, previewPanel, pageCount,
  edit: replaceEditorSelection, pptx: exportSlidesPowerPoint, pdf: exportHandout, video: videoAssetUrl, refresh: render,
  guide: () => document.dispatchEvent(new Event('slides:guide'))
});
const handoutInspector = window.HandoutSettings.mount({source, preview, previewPanel, edit: replaceEditorSelection, isSlides: isSlideDocument});
function isSlideDocument() { return window.HandoutSlides.metadata(source.value).enabled; }
function pdfLayout() { return isSlideDocument() ? (window.HandoutSlides.parse(source.value).settings.aspect === '4:3' ? 'slides-standard' : 'slides-wide') : layoutSelect.value; }
function slideImageUrl(src) {
  if (/^data:image\/(png|jpeg|gif|webp);base64,/i.test(src)) return src;
  let decoded; try { decoded = decodeURIComponent(src); } catch { decoded = src; }
  return assetMap.get(src) || assetMap.get(decoded) || '';
}
async function exportSlidesPowerPoint() {
  if (!isSlideDocument()) { statusText.textContent = 'Open a slide deck to export PowerPoint.'; return; }
  render(); const content = source.value, documentPath = currentDocumentPath;
  return slideStudio.withAllSlides(async () => {
    try {
      const saved = await window.handoutDesktop.exportPowerPoint(content, documentPath);
      if (saved) statusText.textContent = `PowerPoint saved to ${saved}`;
    } catch (error) { statusText.textContent = `Could not export PowerPoint: ${error.message}`; }
  });
}

const snippets = {
  boilerplate: `---
layout: letter
---

**Name:** ______________________________  **Period:** ______  **Date:** __________

# [Handout Title]

:::wrap
[qr:https://example.com]{.float-right width=1.25in}

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.
:::

:::grid columns=2
:::cell
:::question id=Q1 type=mc points=1
Multiple-choice question one
- Choice A
- Choice B *
- Choice C
:::
:::cell
:::question id=Q2 type=mc points=1
Multiple-choice question two
- Choice A *
- Choice B
- Choice C
:::
:::

:::question id=Q3 type=short lines=4 points=2
Open-response question
:::answer
Teacher answer
:::
:::

`,
  heading: "## New section\n\n",
  checklist: ":::checklist\n- First checklist item\n- Second checklist item\n- Third checklist item\n:::\n\n",
  question: ":::question type=short lines=3\nWhat is the answer?\n:::answer\nTeacher answer\n:::\n\n",
  youtube: "[youtube:https://www.youtube.com/watch?v=M7lc1UVf-VE]\n\n",
  video: "[video:media/clip.mp4]\n\n",
  "multiple-choice": ":::question type=mc\nWhich answer is correct?\n- First choice\n- Correct choice *\n- Third choice\n:::\n\n",
  lines: "{{lines:3}}\n\n",
  "inline-lines": "Answer here: {{lines:2:inline}}\n\n",
  space: "{{space:6}}\n\n",
  box: "{{space:6:box}}\n\n",
  dots: "{{space:6:dots}}\n\n",
  wrap: ":::wrap\n![Alt text](image.png){.float-right width=2in}\n\nText that wraps beside the image.\n:::\n\n",
  qr: "[qr:https://example.com]\n\n",
  grid: ":::grid columns=2\n:::cell\nColumn one\n:::cell\nColumn two\n:::\n\n",
  cards: ":::grid columns=2 cards\n:::cell\n### Box one\nContent\n:::cell\n### Box two\nContent\n:::\n\n",
  pagebreak: ":::pagebreak\n\n",
  style: "<style>\n/* Custom styles for this handout */\n.handout-page h1 { color: #215b75; }\n</style>\n\n",
  "total-points": "{{total-points}}",
  "grade-box": "{{grade}}"
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

function replaceEditorSelection(text, caretOffset = text.length) {
  source.dispatchEvent(new Event('editor:before-edit'));
  const start = source.selectionStart;
  const end = source.selectionEnd;
  source.setRangeText(text, start, end, "end");
  const caret = start + Math.max(0, Math.min(text.length, caretOffset));
  source.setSelectionRange(caret, caret);
  source.dispatchEvent(new Event("input", { bubbles: true }));
  source.focus();
  // Textareas can finish scrolling the new caret after the input event.
  // Let Electron's editor overlays copy that final position on the next frame.
  requestAnimationFrame(() => source.dispatchEvent(new Event("editor:programmatic-edit-complete")));
}

function wrapEditorSelection(opening, closing) {
  const selected = source.value.slice(source.selectionStart, source.selectionEnd);
  const text = `${opening}${selected}${closing}`;
  replaceEditorSelection(text, selected ? text.length : opening.length);
}

function insertSnippet(text) {
  replaceEditorSelection(text);
}

function makeTable(format, rows, columns) {
  if (format === "html") {
    const width = (100 / columns).toFixed(2);
    const cols = Array.from({ length: columns }, () => `    <col style="width: ${width}%">`).join("\n");
    const header = Array.from({ length: columns }, (_, index) => `      <th>Header ${index + 1}</th>`).join("\n");
    const body = Array.from({ length: rows }, () => `    <tr>\n${Array.from({ length: columns }, () => "      <td></td>").join("\n")}\n    </tr>`).join("\n");
    return `<table class="worksheet-table">\n  <colgroup>\n${cols}\n  </colgroup>\n  <thead>\n    <tr>\n${header}\n    </tr>\n  </thead>\n  <tbody>\n${body}\n  </tbody>\n</table>\n\n`;
  }
  const header = `| ${Array.from({ length: columns }, (_, index) => `Header ${index + 1}`).join(" | ")} |`;
  const separator = `| ${Array.from({ length: columns }, () => "---").join(" | ")} |`;
  const body = Array.from({ length: rows }, () => `| ${Array.from({ length: columns }, () => "").join(" | ")} |`).join("\n");
  return `${header}\n${separator}\n${body}\n\n`;
}

function makeQuestion(type, prompt, points, lines, choices, correct, answer) {
  const pointAttr = points ? ` points=${Math.max(0, Number(points) || 0)}` : "";
  const safePrompt = prompt.trim() || "Write your response here.";
  if (type === "mc") {
    const options = choices.split("\n").map(item => item.trim()).filter(Boolean);
    const marked = options.map(item => `- ${item.replace(/^[-*+]\s+/, "")}`).join("\n");
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

function openSnippetDialog(kind) {
  const overlay = document.createElement("div");
  overlay.className = "app-dialog-overlay snippet-dialog-overlay";
  const close = () => { overlay.remove(); source.focus(); };
  const submit = event => {
    event.preventDefault();
    const form = event.currentTarget;
    if (kind === "question") insertSnippet(makeQuestion(form.elements.type.value, form.elements.prompt.value, form.elements.points.value, form.elements.lines?.value, form.elements.content?.value || "", form.elements.correct?.value || "0", form.elements.answer?.value || ""));
    else if (kind === "rubric") insertSnippet(makeRubric(form.elements.title.value, form.elements.criteria.value));
    else if (kind === "columns") insertSnippet(makeColumns(form.elements.format.value, form.elements.widths.value, form.elements.cards.checked));
    else if (kind === "table") insertSnippet(makeTable(form.elements.format.value, Number(form.elements.rows.value), Number(form.elements.columns.value)));
    close();
  };
  const shells = {
    question: `<h2 id="snippet-dialog-title">Insert a question</h2><p class="app-dialog-description" id="question-guidance">Choose a question type. The options below will adapt to match it.</p><div class="form-grid question-form-grid"><div class="form-wide question-control-row"><label class="question-type-field">Question type<select name="type"><option value="short">Short answer</option><option value="mc">Multiple choice</option><option value="true-false">True / false</option></select></label><label class="compact-field">Points <span class="field-hint">optional</span><input name="points" type="number" min="0" max="100" placeholder="0"></label><label class="compact-field" data-question-field="lines">Answer lines<input name="lines" type="number" min="1" max="30" value="3"></label></div><label class="form-wide">Question prompt<input name="prompt" value="Write your response here." required></label><label class="form-wide" data-question-field="answer">Teacher answer <span class="field-hint">shown only when answers are toggled on</span><textarea name="answer" rows="3" placeholder="Enter the expected answer (optional)"></textarea></label><label class="form-wide" data-question-field="choices" hidden>Answer choices <span class="field-hint">one choice per line; add an asterisk (*) after the correct answer</span><textarea name="content" rows="5" placeholder="Choice 1&#10;Correct choice *&#10;Choice 3"></textarea></label><fieldset class="form-wide true-false-answer" data-question-field="true-false" hidden><legend>Correct answer</legend><label><input name="correct" type="radio" value="0" checked> True</label><label><input name="correct" type="radio" value="1"> False</label></fieldset></div>`,
    rubric: `<h2 id="snippet-dialog-title">Insert a rubric</h2><p class="app-dialog-description">Add one criterion per line. Separate the four columns with vertical bars.</p><div class="form-grid"><label class="form-wide">Rubric title<input name="title" value="Assessment Rubric"></label><label class="form-wide">Criteria<textarea name="criteria" rows="6" placeholder="Scientific reasoning | Thorough explanation | Clear explanation | Needs support"></textarea></label></div>`,
    columns: `<h2 id="snippet-dialog-title">Insert columns</h2><p class="app-dialog-description">Choose a layout, then decide whether each column needs a visible box.</p><div class="form-grid"><label>Format<select name="format"><option value="markdown">Markdown</option><option value="html">HTML</option></select></label><label>Column widths<select name="widths"><option value="1/2,1/2">Two equal</option><option value="1/3,2/3">One third + two thirds</option><option value="2/3,1/3">Two thirds + one third</option><option value="1/4,1/4,1/2">Quarter + quarter + half</option><option value="1/4,1/4,1/4,1/4">Four equal</option></select></label><label class="checkbox-field form-wide"><input name="cards" type="checkbox"> Draw a box around each column</label></div>`,
    table: `<h2 id="snippet-dialog-title">Insert a table</h2><p class="app-dialog-description">Set the table size. HTML format allows custom column widths in the generated markup.</p><div class="form-grid"><label>Format<select name="format"><option value="markdown">Markdown</option><option value="html">HTML</option></select></label><label>Body rows<input name="rows" type="number" min="1" max="20" value="3"></label><label>Columns<input name="columns" type="number" min="2" max="10" value="3"></label></div>`
  };
  const actionLabels = { question: "Insert question", rubric: "Insert rubric", columns: "Insert columns", table: "Insert table" };
  overlay.innerHTML = `<form class="app-dialog snippet-dialog" role="dialog" aria-modal="true" aria-labelledby="snippet-dialog-title"><header>${shells[kind].match(/<h2[\s\S]*?<\/h2>/)?.[0] || ""}<button type="button" class="app-dialog-close" aria-label="Close">×</button></header>${shells[kind].replace(/<h2[\s\S]*?<\/h2>/, "")}<footer><button type="button" class="button secondary snippet-cancel">Cancel</button><button type="submit" class="button primary">${actionLabels[kind]}</button></footer></form>`;
  document.body.append(overlay);
  const form = overlay.querySelector("form");
  if (isSlideDocument() && kind === 'table') { form.elements.format.value = 'markdown'; form.elements.format.closest('label').hidden = true; }
  form.addEventListener("submit", submit);
  overlay.querySelector(".app-dialog-close").addEventListener("click", close);
  overlay.querySelector(".snippet-cancel").addEventListener("click", close);
  overlay.addEventListener("mousedown", event => { if (event.target === overlay) close(); });
  overlay.addEventListener("keydown", event => { if (event.key === "Escape") close(); });
  if (kind === "question") {
    const type = form.elements.type;
    const updateQuestionFields = () => {
      const isShort = type.value === "short";
      const isMultipleChoice = type.value === "mc";
      form.querySelector('[data-question-field="lines"]').hidden = !isShort;
      form.querySelector('[data-question-field="answer"]').hidden = !isShort;
      form.querySelector('[data-question-field="choices"]').hidden = !isMultipleChoice;
      form.querySelector('[data-question-field="true-false"]').hidden = type.value !== "true-false";
      overlay.querySelector("#question-guidance").textContent = isShort ? "Students receive writing lines. Add an optional teacher answer for the answer key." : isMultipleChoice ? "Enter one answer choice per line. Mark the correct answer with an asterisk (*)." : "Choose whether True or False is the correct answer.";
    };
    type.addEventListener("change", updateQuestionFields);
    updateQuestionFields();
  }
  form.querySelector("input, select, textarea")?.focus();
}

function setupPanelControls() {
  for (const toggle of document.querySelectorAll(".panel-toggle")) {
    if (!toggle.dataset.panel) continue;
    toggle.addEventListener("click", () => {
      const panel = toggle.dataset.panel;
      const collapsedClass = `${panel}-collapsed`;
      const collapsed = workspace.classList.toggle(collapsedClass);
      toggle.textContent = collapsed ? "Show" : "Hide";
      toggle.setAttribute("aria-label", `${collapsed ? "Expand" : "Collapse"} ${panel === "file" ? "handout files" : "Markdown editor"}`);
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
  "booklet-letter": { width: "5.5in", height: "8.5in", page: "letter landscape", label: "8.5×11 booklet", impose: "letter" },
  booklet: { width: "8.5in", height: "11in", page: "17in 11in", label: "11×17 booklet", impose: "tabloid" }
};
const requestedLayout = new URLSearchParams(window.location.search).get("layout");
if (requestedLayout && layouts[requestedLayout]) layoutSelect.value = requestedLayout;

function setSourceContent(content) {
  source.value = content;
  source.dispatchEvent(new Event("input", { bubbles: true }));
  source.dispatchEvent(new Event("editor:content-loaded"));
  const frontMatter = content.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  const layoutSetting = frontMatter && frontMatter[1].match(/^layout\s*:\s*([\w-]+)\s*$/m);
  if (layoutSetting && layouts[layoutSetting[1]]) layoutSelect.value = layoutSetting[1];
}

function withoutDocumentSettings(markdown) {
  return markdown.replace(/^---\s*\n[\s\S]*?\n---\s*(?:\n|$)/, "");
}

const example = `# Ecosystems Review

**Name:** ______________________________  **Date:** _______________

An ecosystem includes living things and their physical environment.

Plants, animals, water, sunlight, and soil interact within this pond. Changes
to one part of the system can affect the other parts.

## 1. Observing an ecosystem

Name two living and two nonliving parts of a pond ecosystem.

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

if (!window.handoutDesktop) { source.value = example; preview.addEventListener('click', event => window.HandoutVideo.activate(event)); }

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
    return `<img src="${escapeHtml(src)}" alt="${alt}"${title ? ` title="${title}"` : ""} class="${classes}" data-image-path="${escapeHtml(path)}"${width ? ` style="width:${width[1]}"` : ""}>`;
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
  text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+(?:"([^"\n]*)"|&quot;([^\n]*?)&quot;))?\)(?:\{([^}]*)\})?/g, (_, alt, path, quotedTitle, encodedTitle, attrs = "") => {
    const title = quotedTitle ?? encodedTitle;
    const classes = attrs.includes(".float-left") ? "float-left" : attrs.includes(".float-right") ? "float-right" : "";
    const width = attrs.match(/width=([0-9.]+(?:in|cm|mm|px|%))/);
    const localAsset = assetMap.get(decodeURIComponent(path)) || assetMap.get(path);
    const servedAsset = liveAssetMode
      ? `/handout-assets/${path.split("/").map(part => encodeURIComponent(decodeURIComponent(part))).join("/")}?v=${encodeURIComponent(liveAssetVersion)}`
      : path;
    const src = localAsset || servedAsset;
    return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"${title ? ` title="${escapeHtml(title)}"` : ""} class="${classes}" data-image-path="${escapeHtml(path)}"${width ? ` style="width:${width[1]}"` : ""}>`;
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

function parseBlocks(markdown, numbering = { questionNumber: 1 }, sourceOffset = 0) {
  const cleaned = markdown.replace(/<!--([\s\S]*?)-->/g, comment => comment.replace(/[^\n]/g, " "));
  const lines = cleaned.replace(/\r\n?/g, "\n").split("\n");
  const placeholders = [];
  const outLines = [];
  const sourceMap = [];
  let iterationStart = 0;
  const emit = (value, end = i + 1) => {
    outLines.push(value);
    const location = [sourceOffset + iterationStart, sourceOffset + Math.max(iterationStart + 1, end)];
    sourceMap.push(location);
    const placeholder = /^@@BLOCK(\d+)@@$/.exec(value);
    if (placeholder) placeholders[Number(placeholder[1])].sourceLocation = location;
  };
  let i = 0, codeFence = null;

  while (i < lines.length) {
    iterationStart = i;
    const line = lines[i];
    const fenceMarker = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if(fenceMarker){if(!codeFence)codeFence=fenceMarker[1];else if(codeFence[0]===fenceMarker[1][0]&&fenceMarker[1].length>=codeFence.length)codeFence=null;emit(line);i++;continue;}
    if(codeFence){emit(line);i++;continue;}
    if (!line.trim()) { emit(""); i++; continue; }
    if (/^ {0,3}#{1,2}(?:\s|$)/.test(line)) emit("<!--HANDOUT_QUESTION_RESET-->");

    const video = window.HandoutVideo.parse(line);
    if (video) {
      const token = `@@BLOCK${placeholders.length}@@`;
      placeholders.push({ type: 'video', video }); emit(token); i++; continue;
    }
    const qrMatch = line.match(/^\s*\[qr:([^\]]*)\](?:\{([^}]*)\})?\s*$/i);
    if (qrMatch) {
      const token = `@@BLOCK${placeholders.length}@@`;
      placeholders.push({ type: "qr", value: qrMatch[1], attributes: qrMatch[2] || '' });
      emit(token);
      i++;
      continue;
    }

    if (/^:::pagebreak\s*$/.test(line.trim())) {
      const token = `@@BLOCK${placeholders.length}@@`;
      placeholders.push({ type: "pagebreak" });
      emit(token);
      i++;
      continue;
    }

    if (/^:::wrap\s*$/.test(line.trim())) {
      const start = i + 1; i++;
      while (i < lines.length && lines[i].trim() !== ":::") i++;
      const content = lines.slice(start, i).join("\n");
      const token = `@@BLOCK${placeholders.length}@@`;
      placeholders.push({ type: "wrap", contentOffset: sourceOffset + start, content });
      emit(token);
      if (i < lines.length) i++;
      continue;
    }

    if (/^:::checklist\s*$/.test(line.trim())) {
      const start = i + 1; i++;
      while (i < lines.length && lines[i].trim() !== ":::") i++;
      const token = `@@BLOCK${placeholders.length}@@`;
      placeholders.push({ type: "checklist", contentOffset: sourceOffset + start, content: lines.slice(start, i).join("\n") });
      emit(token);
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
      placeholders.push({ type: "question", contentOffset: sourceOffset + start, attrStr, content });
      emit(token);
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
      let cellStart = i + 1;
      let depth = 0;
      i++;
      while (i < lines.length) {
        const nested = lines[i].trim();
        if (depth === 0 && /^:::cell\s*$/.test(nested)) {
          if (cell.length) cells.push({ content: cell.join("\n"), offset: sourceOffset + cellStart });
          cell = [];
          cellStart = i + 1;
          i++;
          continue;
        }
        if (/^:::(question|answer|wrap|grid|checklist)(?:\s+.*)?$/.test(nested)) depth++;
        else if (nested === ":::") {
          if (depth > 0) depth--;
          else break;
        }
        cell.push(lines[i]);
        i++;
      }
      if (cell.length) cells.push({ content: cell.join("\n"), offset: sourceOffset + cellStart });
      const token = `@@BLOCK${placeholders.length}@@`;
      placeholders.push({ type: "grid", attr, cells });
      emit(token);
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
      let tableHtml = `<table class="md-table"><thead><tr data-source-start="${sourceOffset + i}" data-source-end="${sourceOffset + i + 1}">`;
      headers.forEach((header, idx) => {
        const align = aligns[idx] || "";
        tableHtml += `<th${align ? ` style="text-align:${align}"` : ""}>${inlineMarkdown(header)}</th>`;
      });
      tableHtml += '</tr></thead><tbody>';
      for (const [rowIndex, row] of body.entries()) {
        tableHtml += `<tr data-source-start="${sourceOffset + i + 2 + rowIndex}" data-source-end="${sourceOffset + i + 3 + rowIndex}">`;
        row.forEach((cell, idx) => {
          const align = aligns[idx] || "";
          tableHtml += `<td${align ? ` style="text-align:${align}"` : ""}>${inlineMarkdown(cell)}</td>`;
        });
        tableHtml += '</tr>';
      }
      tableHtml += '</tbody></table>';
      const token = `@@BLOCK${placeholders.length}@@`;
      placeholders.push({ type: "table", html: tableHtml });
      emit(token, j);
      i = j;
      continue;
    }

    emit(line);
    i++;
  }

  const mdSource = outLines.join("\n");
  const customLines = mdSource.split("\n").map(line => {
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
  });
  const expandedMap = customLines.flatMap((line, index) => line.split('\n').map(() => sourceMap[index]));
  const custommdSource = customLines.join('\n');
  const md = window.markdownit ? window.markdownit({ html: true }) : null;
  let rendered = preprocessLegacyMarkdown(custommdSource);
  if (md) {
    const tokens = md.parse(rendered, {});
    const annotate = tokens => tokens.forEach(token => {
      if (token.map) {
        const start = expandedMap[token.map[0]];
        const end = expandedMap[Math.max(token.map[0], token.map[1] - 1)];
        if (start && end) {
          if (token.type === 'html_block') {
            token.content = token.content.replace(/<(div|section|table|tr|li|ul|ol|p|h[1-6]|blockquote|pre|img)(?=[\s>])([^>]*)>/gi, (tag, name, attributes, offset) => {
              const line = token.map[0] + (token.content.slice(0, offset).match(/\n/g) || []).length;
              const location = expandedMap[line] || start;
              return `<${name}${attributes} data-source-start="${location[0]}" data-source-end="${location[1]}">`;
            });
          }
          else if (token.nesting === 1 || token.type === 'fence' || token.type === 'code_block') {
            token.attrSet('data-source-start', String(start[0]));
            token.attrSet('data-source-end', String(end[1]));
          }
        }
      }
      if (token.children) annotate(token.children);
    });
    annotate(tokens);
    rendered = md.renderer.render(tokens, md.options, {});
  }

  const renderedWithBlocks = rendered
    .replace(/<!--HANDOUT_QUESTION_RESET-->/g, () => { numbering.questionNumber = 1; return ""; })
    .replace(/@@LEGACY_BR_(\d+)@@/g, (_, index) => '<br>')
    .replace(/@@BLOCK(\d+)@@/g, (_, indexText) => {
    const index = Number(indexText);
    const block = placeholders[index];
    if (!block) return "";
    const located = html => {
      const [start, end] = block.sourceLocation;
      return html.replace(/<([a-z][a-z0-9-]*)(?=[\s>])/i, `<$1 data-source-start="${start}" data-source-end="${end}"`);
    };

    if (block.type === "pagebreak") {
      return '<div class="handout-pagebreak" aria-hidden="true"></div>';
    }

    if (block.type === 'video') return located(window.HandoutVideo.markup(block.video, videoAssetUrl));

    if (block.type === "qr") {
      return located(window.HandoutQr.renderQrBlock(block.value, block.attributes));
    }

    if (block.type === "wrap") {
      const innerBlocks = parseBlocks(block.content, numbering, block.contentOffset);
      const wrappedHtml = innerBlocks.map(blockItem => blockItem.html).join("");
      return located(`<section class="text-wrap">${wrappedHtml}</section>`);
    }

    if (block.type === "checklist") {
      const checklistHtml = parseBlocks(block.content, numbering, block.contentOffset).map(item => item.html).join("");
      return located(window.HandoutChecklist.renderChecklistBlock(checklistHtml));
    }

    if (block.type === "grid") {
      const parts = block.cells.filter(part => part.content.trim());
      const cellHtml = parts.map(part => `<div class="grid-cell">${parseBlocks(part.content, numbering, part.offset).map(blockItem => blockItem.html).join("")}</div>`).join("");
      const columns = Math.max(1, Math.min(4, Number(block.attr.columns) || parts.length || 2));
      const cardClass = block.attr.cards ? " cards" : "";
      const widths = block.attr.widths ? block.attr.widths.split(",").map(value => { const [numerator, denominator] = value.split("/").map(Number); return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0 ? `${numerator / denominator}fr` : "1fr"; }).join(" ") : `repeat(${columns}, minmax(0, 1fr))`;
      return located(`<div class="grid${cardClass}" style="--grid-template:${widths}">${cellHtml}</div>`);
    }

    if (block.type === "table") {
      return located(block.html);
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
      const qLineOffsets = qLines.map((_, index) => block.contentOffset + index);
      let answerLines = [];
      const answerIndex = qLines.findIndex(line => line.trim() === ":::answer");
      if (answerIndex !== -1) {
        let k = answerIndex + 1;
        while (k < qLines.length && qLines[k].trim() !== ":::") answerLines.push(qLines[k++]);
        qLineOffsets.splice(answerIndex, (k < qLines.length && qLines[k].trim() === ":::") ? (k - answerIndex + 1) : (k - answerIndex));
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
            choices.push({ content, isCorrect, start: qLineOffsets[j], end: qLineOffsets[j] + 1 });
            j++;
          } else if (choices.length) {
            choices[choices.length - 1].content += "\n" + qLines[j];
            choices[choices.length - 1].end = qLineOffsets[j] + 1;
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
        qHtml += `<div class="question-prompt" data-source-start="${block.contentOffset}" data-source-end="${block.contentOffset + (choiceStart < 0 ? qLines.length : choiceStart)}"><span class="question-num">${number}.</span>${promptHtml}</div>`;
      }

      if (choices.length) {
        qHtml += '<ul class="mc-choices">';
        choices.forEach((choice, choiceIndex) => {
          const choiceHtml = inlineMarkdown(choice.content);
          const correctClass = (choice.isCorrect && showAnswers) ? " correct-answer" : "";
          qHtml += `<li data-source-start="${choice.start}" data-source-end="${choice.end}" class="mc-choice${correctClass}" data-correct="${choice.isCorrect ? "true" : "false"}><span class="choice-letter">${String.fromCharCode(65 + choiceIndex)}.</span>${choiceHtml}</li>`;
        });
        qHtml += '</ul>';
      } else {
        const linesCount = Number(attrs.lines) || 3;
        if (showAnswers && answerLines.length) {
          const answerHtml = parseBlocks(answerLines.join("\n"), numbering, block.contentOffset + answerIndex + 1).map(blockItem => blockItem.html).join("");
          qHtml += `<div class="short-answer-key handwritten">${answerHtml}</div>`;
        } else {
          qHtml += answerMarkup(linesCount);
        }
      }
      qHtml += '</div>';
      return located(qHtml);
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

  if (layouts[layout].impose === "letter" || layouts[layout].impose === "tabloid") {
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
      sheet.className = `print-sheet booklet ${layouts[layout].impose}`;
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
  preview.querySelectorAll('img[data-image-path]').forEach((image, index) => { image.dataset.imageIndex = index; });
  preview.querySelectorAll('.qr-code').forEach((qrCode, index) => { qrCode.dataset.qrIndex = index; });
  const logicalPages = [...preview.children];
  const count = logicalPages.length;
  if (layoutSelect.value.startsWith("half-duplicate-") || layouts[layoutSelect.value].impose === "letter" || layouts[layoutSelect.value].impose === "tabloid") {
    imposePages(logicalPages, layoutSelect.value);
  } else {
    pageCount.textContent = `${count} ${layouts[layoutSelect.value].label} page${count === 1 ? "" : "s"}`;
  }
}

function render() {
  // An immediate render supersedes any pending input render. Avoid replacing
  // the preview again while the user is selecting or dragging an element.
  clearTimeout(renderTimer);
  const mode = isSlideDocument() ? 'slides' : 'handout';
  const modeKey = mode + ':' + (document.body.dataset.handoutTheme || 'default');
  if (lastDocumentMode !== modeKey) { lastDocumentMode = modeKey; window.handoutDesktop?.setDocumentMode?.(mode, document.body.dataset.handoutTheme || 'default').catch(() => {}); }
  if (slideStudio.render(source.value, slideImageUrl)) { handoutInspector.hide(); statusText.textContent = 'Slide preview updated'; return; }
  window.HandoutVideo.stop(preview);
  document.querySelector('.media-resize-outline')?.remove();
  const previousScroll = previewPanel.scrollTop;
  totalPoints = [...source.value.matchAll(/:::question(?:\s+[^\n]*)?/g)].reduce((sum, match) => {
    const points = match[0].match(/(?:^|\s)points=(\d+(?:\.\d+)?)(?:\s|$)/);
    return sum + (points ? Number(points[1]) : 0);
  }, 0);
  questionCounter = 1;
  applyLayout();
  const visibleSource = withoutDocumentSettings(source.value);
  const prefixLength = source.value.length - visibleSource.length;
  const sourceOffset = (source.value.slice(0, prefixLength).match(/\n/g) || []).length;
  paginate(parseBlocks(visibleSource, { questionNumber: 1 }, sourceOffset));
  handoutInspector.refresh();
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
  clearAssets();
  let markdownFile;
  for (const file of files) {
    const relative = file.webkitRelativePath ? file.webkitRelativePath.split("/").slice(1).join("/") : file.name;
    if (/\.md(?:own)?$/i.test(file.name) && !markdownFile) markdownFile = file;
    if (window.HandoutVideo.extensions.test(file.name)) {
      const url = URL.createObjectURL(file); videoObjectUrls.add(url); videoAssetMap.set(relative,url); assetMap.set(relative, url); assetMap.set(file.name, url);
    }
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
async function printHandout() {
  render();
  const print = async () => {
    if (window.handoutDesktop) {
      const result = await window.handoutDesktop.print(activeHandoutTitle);
      statusText.textContent = result.success ? "Print job sent" : `Could not print: ${result.failureReason || "unknown error"}`;
    } else window.print();
  };
  return isSlideDocument() ? slideStudio.withAllSlides(print) : print();
}

async function exportHandout() {
  render();
  if (isSlideDocument()) return slideStudio.withAllSlides(async () => {
    if (window.handoutDesktop) {
      const savedPath = await window.handoutDesktop.exportPdf(pdfLayout(), activeHandoutTitle);
      if (savedPath) statusText.textContent = "PDF exported";
    } else window.print();
  });
  if (window.handoutDesktop) {
    const savedPath = await window.handoutDesktop.exportPdf(pdfLayout(), activeHandoutTitle);
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
}

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
// pagination and print CSS above remain the handout rendering path.
if (window.handoutDesktop) {
  const desktop = window.handoutDesktop;
  const tree = document.querySelector("#file-tree");
  const folderName = document.querySelector("#folder-name");
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
  const lineNumberContent = document.createElement('span');
  lineNumberContent.className = 'line-numbers-content';
  lineNumbers.append(lineNumberContent);
  const searchHighlight = document.createElement("pre");
  searchHighlight.className = "search-highlight";
  searchHighlight.setAttribute("aria-hidden", "true");
  const selectionHighlight = document.createElement('pre');
  selectionHighlight.className = 'source-selection-highlight';
  selectionHighlight.setAttribute('aria-hidden','true');
  const whitespaceHighlight = document.createElement("pre");
  whitespaceHighlight.className = "whitespace-highlight";
  whitespaceHighlight.setAttribute("aria-hidden", "true");
  const lineMeasure = document.createElement("div");
  lineMeasure.className = "line-measure";
  lineMeasure.setAttribute("aria-hidden", "true");
  editorSurface.append(lineNumbers, highlight, searchHighlight, selectionHighlight, whitespaceHighlight, lineMeasure, source);
  source.classList.add("highlighted-source");
  let selectedFile = null;
  let dirty = false;
  let folder = null;
  const untitledPath = '__untitled_new_handout__';
  const documents = new Map();
  let activePath = null;
  let loadingDocument = false;
  let restoringEditorHistory = false;
  let editorHistory = [];
  let editorRedoHistory = [];
  let wrapLines = false;
  let showWhitespace = false;
  source.disabled = true;

  function editorSnapshot() {
    return {
      value: source.value,
      selectionStart: source.selectionStart,
      selectionEnd: source.selectionEnd,
      scrollTop: source.scrollTop,
      scrollLeft: source.scrollLeft
    };
  }

  function resetEditorHistory() {
    editorHistory = [editorSnapshot()];
    editorRedoHistory = [];
  }

  function recordEditorHistory() {
    if (restoringEditorHistory) return;
    const snapshot = editorSnapshot();
    const previous = editorHistory.at(-1);
    if (!previous || previous.value !== snapshot.value) {
      editorHistory.push(snapshot);
      editorRedoHistory = [];
    }
  }

  function restoreEditorSnapshot(snapshot) {
    restoringEditorHistory = true;
    source.value = snapshot.value;
    source.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
    source.scrollTop = snapshot.scrollTop;
    source.scrollLeft = snapshot.scrollLeft;
    source.dispatchEvent(new Event("input", { bubbles: true }));
    restoringEditorHistory = false;
  }

  function undoEditorChange() {
    if (editorHistory.length < 2) return;
    editorRedoHistory.push(editorHistory.pop());
    restoreEditorSnapshot(editorHistory.at(-1));
  }

  function redoEditorChange() {
    const snapshot = editorRedoHistory.pop();
    if (!snapshot) return;
    editorHistory.push(snapshot);
    restoreEditorSnapshot(snapshot);
  }

  source.addEventListener("input", recordEditorHistory);
  source.addEventListener('editor:before-edit', () => {
    const previous = editorHistory.at(-1);
    if (previous?.value === source.value) Object.assign(previous, editorSnapshot());
  });
  source.addEventListener("editor:content-loaded", resetEditorHistory);
  source.addEventListener("editor:programmatic-edit-complete", () => requestAnimationFrame(syncHighlight));
  source.addEventListener("keydown", event => {
    const key = event.key.toLowerCase();
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    if (["z", "y"].includes(key)) {
      event.preventDefault();
      if (key === "y" || event.shiftKey) redoEditorChange();
      else undoEditorChange();
      return;
    }
    const wrappers = { b: ["**", "**"], i: ["*", "*"], u: ["<u>", "</u>"], "/": ["<!-- ", " -->"] };
    if (key === "k") {
      event.preventDefault();
      const url = source.value.slice(source.selectionStart, source.selectionEnd);
      replaceEditorSelection(`[${url}](${url})`, url ? url.length + 3 : 1);
      return;
    }
    if (!wrappers[key]) return;
    event.preventDefault();
    wrapEditorSelection(...wrappers[key]);
  });
  previewPanel.addEventListener('keydown',event=>{
    if(!isSlideDocument() || !(event.ctrlKey||event.metaKey) || event.altKey || !['z','y'].includes(event.key.toLowerCase()) || !event.target.closest('#preview,.slide-outline,.slide-navigation'))return;
    event.preventDefault();event.stopPropagation();
    if(event.key.toLowerCase()==='y'||event.shiftKey)redoEditorChange();else undoEditorChange();
    preview.focus({preventScroll:true});
  });
  resetEditorHistory();

  let previewNavigationId = 0;
  function jumpToPreviewSource(target) {
    const mapped = target.closest('[data-source-start][data-source-end]');
    if (!mapped || !preview.contains(mapped)) {
      statusText.textContent = 'This preview element has no source location.';
      return;
    }
    const lines = source.value.split('\n');
    const first = Number(mapped.dataset.sourceStart);
    const last = Math.min(lines.length, Number(mapped.dataset.sourceEnd));
    if (!Number.isInteger(first) || first < 0 || first >= lines.length || last <= first) return;
    let endLine = last;
    if (mapped.tagName === 'LI') {
      for (const nested of mapped.querySelectorAll('ul[data-source-start], ol[data-source-start]')) {
        endLine = Math.min(endLine, Number(nested.dataset.sourceStart));
      }
    }
    revealSourceLines(first,endLine,!isSlideDocument());
  }
  function revealSourceLines(first,endLine,focusEditor=false) {
    const lines=source.value.split('\n');
    if(!Number.isInteger(first)||!Number.isInteger(endLine)||first<0||first>=lines.length||endLine<=first)return;
    endLine=Math.min(endLine,lines.length);
    while (endLine > first + 1 && !lines[endLine - 1].trim()) endLine--;
    const start = lines.slice(0, first).reduce((sum, line) => sum + line.length + 1, 0);
    const end = start + lines.slice(first, endLine).join('\n').length;
    const navigationId = ++previewNavigationId;
    // Electron can restore an old caret when an unfocused textarea is selected.
    // Commit the range while focused, then return keyboard control to the slide.
    source.focus({preventScroll:true});
    source.setSelectionRange(start, end);
    syncNativeSelection();
    if(!focusEditor)preview.focus({preventScroll:true});
    // A mirror uses the textarea's actual width and font metrics, including wrapped
    // lines. Apply the measured scroll after focus/selection have settled.
    const reveal = () => {
      if (navigationId !== previewNavigationId) return;
      const style = getComputedStyle(source);
      const width = Math.max(1, source.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
      Object.assign(lineMeasure.style, {
        width: `${width}px`, font: style.font, letterSpacing: style.letterSpacing,
        whiteSpace: wrapLines ? 'pre-wrap' : 'pre', overflowWrap: style.overflowWrap,
        tabSize: style.tabSize
      });
      const prefix = document.createElement('span'); prefix.textContent = source.value.slice(0, start);
      const marker = document.createElement('span'); marker.textContent = '\u200b';
      lineMeasure.replaceChildren(prefix, marker);
      const top = marker.getBoundingClientRect().top - lineMeasure.getBoundingClientRect().top + parseFloat(style.paddingTop);
      source.scrollTop = Math.max(0, top - source.clientHeight / 3);
      source.scrollLeft = 0;
      syncHighlight();
    };
    requestAnimationFrame(() => { reveal(); requestAnimationFrame(reveal); });
    statusText.textContent = first + 1 === endLine ? `Editing line ${first + 1}` : `Editing lines ${first + 1}–${endLine}`;
  }
  source.addEventListener('editor:reveal-lines',event=>{const detail=event.detail||{};revealSourceLines(detail.startLine,detail.endLine,!!detail.focusEditor);});
  function selectResizableMedia(media) {
    document.querySelector('.media-resize-outline')?.remove();
    const isQrCode = media.classList.contains('qr-code');
    const mediaIndex = Number(isQrCode ? media.dataset.qrIndex : media.dataset.imageIndex);
    if (!Number.isInteger(mediaIndex)) return;
    const rect = media.getBoundingClientRect();
    const outline = document.createElement('div');
    const handle = document.createElement('button');
    const sizeLabel = document.createElement('span');
    const resizeFromLeft = media.classList.contains('float-right');
    outline.className = 'media-resize-outline';
    handle.className = `media-resize-handle${resizeFromLeft ? ' from-left' : ''}`;
    handle.type = 'button';
    handle.setAttribute('aria-label', `Resize ${isQrCode ? 'QR code' : 'image'} proportionally`);
    sizeLabel.className = 'media-resize-size';
    outline.append(handle, sizeLabel);
    document.body.append(outline);
    const placeOutline = (left = rect.left, top = rect.top, width = rect.width, height = rect.height) => {
      Object.assign(outline.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
      const scale = rect.width / Math.max(1, media.offsetWidth);
      sizeLabel.textContent = `${(width / scale / 96).toFixed(2)} in × ${(height / scale / 96).toFixed(2)} in`;
    };
    placeOutline();
    handle.addEventListener('pointerdown', pointerEvent => {
      pointerEvent.preventDefault();
      pointerEvent.stopPropagation();
      const contentRect = media.closest('.page-content').getBoundingClientRect();
      const scale = rect.width / Math.max(1, media.offsetWidth);
      const aspect = rect.width / Math.max(1, rect.height);
      const maximumWidthByPage = resizeFromLeft ? rect.right - contentRect.left : contentRect.right - rect.left;
      const maximumWidthByHeight = (contentRect.bottom - rect.top) * aspect;
      const minimumInches = isQrCode ? 0.75 : 0.5;
      const minimumPixels = minimumInches * 96 * scale;
      const maximumWidth = Math.max(minimumPixels, Math.min(maximumWidthByPage, maximumWidthByHeight));
      const minimumWidth = Math.min(maximumWidth, minimumPixels);
      const startX = pointerEvent.clientX;
      let displayedWidth = rect.width;
      handle.setPointerCapture(pointerEvent.pointerId);
      const resize = moveEvent => {
        const delta = (moveEvent.clientX - startX) * (resizeFromLeft ? -1 : 1);
        displayedWidth = Math.max(minimumWidth, Math.min(maximumWidth, rect.width + delta));
        const displayedHeight = displayedWidth / aspect;
        const left = resizeFromLeft ? rect.right - displayedWidth : rect.left;
        media.style.width = `${displayedWidth / scale}px`;
        placeOutline(left, rect.top, displayedWidth, displayedHeight);
      };
      const stop = stopEvent => {
        handle.removeEventListener('pointermove', resize);
        handle.removeEventListener('pointerup', stop);
        handle.removeEventListener('pointercancel', cancel);
        if (stopEvent.type !== 'pointerup') return;
        const widthInches = Math.max(minimumInches, displayedWidth / scale / 96).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
        const updated = isQrCode
          ? window.HandoutMediaSizing.updateQrWidth(source.value, mediaIndex, `${widthInches}in`)
          : window.HandoutMediaSizing.updateImageWidth(source.value, mediaIndex, `${widthInches}in`);
        if (updated !== source.value) {
          source.value = updated;
          source.dispatchEvent(new Event('input', { bubbles: true }));
          statusText.textContent = `${isQrCode ? 'QR code' : 'Image'} width set to ${widthInches} in`;
        }
      };
      const cancel = cancelEvent => { stop(cancelEvent); render(); };
      handle.addEventListener('pointermove', resize);
      handle.addEventListener('pointerup', stop);
      handle.addEventListener('pointercancel', cancel);
    });
  }
  previewPanel.addEventListener('scroll', () => document.querySelector('.media-resize-outline')?.remove());
  preview.addEventListener('mouseover', event => {
    const link = event.target.closest('a[href]');
    if (link && /^https?:/i.test(link.href)) link.title = 'Ctrl-click (⌘-click on Mac) to open in your browser';
  });
  preview.addEventListener("click", event => {
    const link = event.target.closest('a[href]');
    if (link) {
      event.preventDefault();
      if ((event.ctrlKey || event.metaKey) && /^https?:/i.test(link.href)) {
        desktop.openWebLink(link.href).catch(error => { statusText.textContent = `Could not open link: ${error.message}`; });
        return;
      }
    }
    if (event.target.closest('.video-player')) { window.HandoutVideo.activate(event); event.stopPropagation(); return; }
    const media = event.target.closest('img[data-image-index], .qr-code[data-qr-index]');
    if (media) {
      event.stopPropagation();
      jumpToPreviewSource(media);
      handoutInspector.show(media);
      if (!media.classList.contains('qr-code')) {
        const navigationId = previewNavigationId;
        // Let source reveal and preview scrolling settle before positioning the handle.
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (navigationId === previewNavigationId && media.isConnected) selectResizableMedia(media);
        }));
      }
      return;
    }
    document.querySelector('.media-resize-outline')?.remove();
    if (event.target.closest('[data-source-start][data-source-end]')) jumpToPreviewSource(event.target);
    handoutInspector.show(event.target);
  });

  function saveActiveState() {
    if (!selectedFile) return;
    const documentState = documents.get(selectedFile.path);
    if (documentState) { documentState.selectionStart = source.selectionStart; documentState.selectionEnd = source.selectionEnd; documentState.previewScrollTop = previewPanel.scrollTop; documentState.layout = layoutSelect.value; documentState.handoutTheme = document.body.dataset.handoutTheme || 'default'; documentState.content = source.value; documentState.dirty = dirty; documentState.scrollTop = source.scrollTop; documentState.scrollLeft = source.scrollLeft; }
  }
  function drawTabs() {
    tabBar.innerHTML = "";
    for (const documentState of documents.values()) {
      const tab = document.createElement("div");
      tab.className = `document-tab${documentState.file.path === activePath ? " active" : ""}`;
      tab.title = documentState.file.path;
      const label = document.createElement("button");
      label.className = "document-tab-label";
      const slideTab = window.HandoutSlides.metadata(documentState.content).enabled;
      tab.dataset.documentMode = slideTab ? 'slides' : 'handout';
      const icon = document.createElement('span'); icon.className = 'document-type-icon'; icon.textContent = slideTab ? '▣' : '▤'; icon.setAttribute('aria-hidden', 'true');
      label.append(icon, document.createTextNode(`${documentState.file.name}${documentState.dirty ? " *" : ""}`));
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
  function askUnsaved(name) {
    return new Promise(resolve => {
      const dialog = document.createElement('dialog'); dialog.className = 'unsaved-dialog';
      dialog.setAttribute('aria-label', 'Unsaved changes');
      const title = document.createElement('h3'); title.textContent = `Save changes to ${name}?`;
      const note = document.createElement('p'); note.textContent = 'Choose Save to keep your changes, Discard to continue without them, or Cancel to stay here.';
      dialog.append(title, note);
      for (const choice of ['Save', 'Discard', 'Cancel']) {
        const button = document.createElement('button'); button.textContent = choice; button.onclick = () => { dialog.returnValue = choice.toLowerCase(); dialog.close(); }; dialog.append(button);
      }
      dialog.addEventListener('close', () => { const choice = dialog.returnValue || 'cancel'; dialog.remove(); resolve(choice); }, { once: true });
      dialog.addEventListener('cancel', event => { event.preventDefault(); dialog.returnValue = 'cancel'; dialog.close(); });
      document.body.append(dialog); dialog.showModal(); dialog.querySelector('button:last-child').focus();
    });
  }
  async function resolveUnsaved() {
    if (!dirty || !selectedFile) return true;
    const choice = await askUnsaved(selectedFile.name);
    if (choice === 'cancel') return false;
    if (choice === 'save') return saveCurrent();
    try {
      const content = selectedFile.untitled ? '' : await desktop.readFile(selectedFile.path);
      const state = documents.get(selectedFile.path); if (state) { state.content = content; state.dirty = false; }
      loadingDocument = true; setSourceContent(content); loadingDocument = false; markDirty(false); drawTabs(); render();
      return true;
    } catch (error) { statusText.textContent = `Could not discard changes: ${error.message}`; return false; }
  }
  async function closeDocument(filePath) {
    const documentState = documents.get(filePath);
    if (!documentState) return;
    if (documentState.dirty) {
      const choice = await askUnsaved(documentState.file.name);
      if (choice === 'cancel') return;
      if (choice === 'save') {
        if (documentState.file.untitled) {
          if (activePath !== filePath) activateDocument(filePath);
          if (!await saveCurrent()) return;
          return closeDocument(selectedFile.path);
        }
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
      activePath = null; selectedFile = null; dirty = false; source.value = ""; source.disabled = true; setAssets([]); markDirty(false); statusText.textContent = "No file open"; drawTabs(); render();
    }
  }
  function activateDocument(filePath) {
    slideStudio.leaveDocument();
    saveActiveState();
    const documentState = documents.get(filePath);
    if (!documentState) return;
    activePath = filePath;
    selectedFile = documentState.file;
    dirty = documentState.dirty;
    source.disabled = false;
    layoutSelect.value = documentState.layout || 'letter';
    document.body.dataset.handoutTheme = documentState.handoutTheme || 'default';
    loadingDocument = true;
    setSourceContent(documentState.content);
    source.setSelectionRange(documentState.selectionStart || 0, documentState.selectionEnd || 0);
    source.scrollTop = documentState.scrollTop || 0;
    source.scrollLeft = documentState.scrollLeft || 0;
    loadingDocument = false;
    setAssets(documentState.assets || []);
    currentHandoutTitle();
    markDirty(dirty);
    drawTabs();
    syncTreeSelection(true);
    render();
    requestAnimationFrame(() => { syncHighlight(); previewPanel.scrollTop = documentState.previewScrollTop || 0; });
    source.focus();
  }
  function addDocument(file, content, assets) {
    const existing = documents.get(file.path);
    if (existing) { activateDocument(file.path); return; }
    documents.set(file.path, { file, content, assets, layout: 'letter', handoutTheme: 'default', dirty: false, scrollTop: 0, scrollLeft: 0 });
    activateDocument(file.path);
  }

  function makeUntitledSlides() {
    discardBlankUntitledHandout();
    const key = `__untitled_slides_${Date.now()}__`;
    addDocument({ type: 'file', name: 'new-slides.md', path: key, markdown: true, untitled: true }, window.HandoutSlides.starter, []);
    dirty = true; documents.get(key).dirty = true; markDirty(true); drawTabs();
  }
  function makeUntitledHandout() {
    const existing = documents.get(untitledPath);
    if (existing) { activateDocument(untitledPath); return; }
    addDocument({ type: 'file', name: 'new-handout.md', path: untitledPath, markdown: true, untitled: true }, window.HandoutStarter, []);
  }
  function discardBlankUntitledHandout() {
    const untitled = documents.get(untitledPath);
    if (!untitled || untitled.dirty || !['', window.HandoutStarter].includes(untitled.content)) return;
    const wasActive = activePath === untitledPath;
    documents.delete(untitledPath);
    if (wasActive) { activePath = null; selectedFile = null; dirty = false; }
  }
  async function saveUntitledHandout() {
    const untitledKey = selectedFile.path;
    const saved = await desktop.saveNewFile(source.value);
    if (!saved) return false;
    const documentState = documents.get(untitledKey);
    if (!documentState) return false;
    documents.delete(untitledKey);
    documentState.file = { type: 'file', name: saved.name, path: saved.path, markdown: true };
    documentState.assets = saved.assets || [];
    documentState.content = source.value;
    documentState.dirty = false;
    documents.set(saved.path, documentState);
    activePath = saved.path; selectedFile = documentState.file; dirty = false;
    setAssets(documentState.assets); markDirty(false); drawTabs();
    // Saving the first handout can establish (or change) the browsed folder.
    try {
      const refreshed = await desktop.refreshFolder();
      if (refreshed) {
        if (folder?.path !== refreshed.path) { saveFolderExpansion(); restoreFolderExpansion(refreshed.path); browserSelection = null; }
        folder = refreshed; folderName.textContent = refreshed.name; browserSearch.value = '';
        documentState.assets = refreshed.assets; setAssets(refreshed.assets); drawTree(); syncTreeSelection(true);
      }
    } catch { /* The file is saved even if a temporary directory-read error occurs. */ }
    statusText.textContent = saved.name + ' saved';
    return true;
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
  function whitespaceHtml(value) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/ /g, '<span class="whitespace-space"> </span>')
      .replace(/\t/g, '<span class="whitespace-tab">\t</span>')
      .replace(/\n/g, '<span class="whitespace-eol"></span>\n');
  }
  function syncLineNumbers() {
    const lines = source.value.split("\n");
    if (!wrapLines) {
      lineNumberContent.textContent = `${Array.from({ length: Math.max(1, lines.length) }, (_, index) => index + 1).join("\n")}\n`;
      return;
    }
    const sourceStyle = getComputedStyle(source);
    const contentWidth = Math.max(1, source.clientWidth - parseFloat(sourceStyle.paddingLeft) - parseFloat(sourceStyle.paddingRight));
    lineMeasure.style.width = `${contentWidth}px`;
    lineMeasure.replaceChildren(...lines.map(line => {
      const row = document.createElement("div");
      row.textContent = line || "\u200b";
      return row;
    }));
    lineNumberContent.replaceChildren(...[...lineMeasure.children].map((row, index) => {
      const number = document.createElement("span");
      number.className = "line-number-row";
      number.style.height = `${Math.max(parseFloat(sourceStyle.lineHeight) || 22, row.getBoundingClientRect().height)}px`;
      number.textContent = index + 1;
      return number;
    }));
  }
  function syncHighlight() {
    highlight.innerHTML = `${highlightMarkdown(source.value)}\n`;
    whitespaceHighlight.innerHTML = showWhitespace ? whitespaceHtml(source.value) : "";
    syncLineNumbers();
    selectionHighlight.scrollTop = source.scrollTop; selectionHighlight.scrollLeft = source.scrollLeft;
    highlight.scrollTop = source.scrollTop;
    highlight.scrollLeft = source.scrollLeft;
    searchHighlight.scrollTop = source.scrollTop;
    searchHighlight.scrollLeft = source.scrollLeft;
    whitespaceHighlight.scrollTop = source.scrollTop;
    whitespaceHighlight.scrollLeft = source.scrollLeft;
    lineNumberContent.style.transform = `translateY(${-source.scrollTop}px)`;
  }
  function setWrapLines(value) {
    wrapLines = Boolean(value);
    source.wrap = wrapLines ? "soft" : "off";
    editorSurface.classList.toggle("wrap-lines", wrapLines);
    source.scrollLeft = 0;
    requestAnimationFrame(syncHighlight);
  }
  function setShowWhitespace(value) {
    showWhitespace = Boolean(value);
    editorSurface.classList.toggle("show-whitespace", showWhitespace);
    syncHighlight();
  }
  function syncNativeSelection() {
    const hasSelection = source.selectionStart !== source.selectionEnd;
    source.classList.toggle('show-native-selection', hasSelection);
    editorSurface.classList.toggle('native-selection', hasSelection);
    selectionHighlight.hidden=!hasSelection;
    if(hasSelection){const start=source.selectionStart,end=source.selectionEnd;selectionHighlight.replaceChildren(document.createTextNode(source.value.slice(0,start)));const mark=document.createElement('mark');mark.textContent=source.value.slice(start,end);selectionHighlight.append(mark,document.createTextNode(source.value.slice(end)+'\n'));}
    else selectionHighlight.replaceChildren();
    selectionHighlight.scrollTop=source.scrollTop;selectionHighlight.scrollLeft=source.scrollLeft;
  }
  syncHighlight();
  source.addEventListener("input", syncHighlight);
  source.addEventListener('input', syncNativeSelection);
  source.addEventListener("scroll", syncHighlight);
  source.addEventListener('select', syncNativeSelection);
  source.addEventListener('keyup', syncNativeSelection);
  source.addEventListener('pointerup', syncNativeSelection);
  source.addEventListener('editor:content-loaded', syncNativeSelection);
  new ResizeObserver(() => requestAnimationFrame(syncHighlight)).observe(source);

  const findBar = document.createElement("div");
  findBar.className = "find-bar";
  findBar.innerHTML = '<div class="find-row"><button type="button" class="find-arrow find-previous" aria-label="Previous match">&#x25B2;</button><input type="search" class="find-input" placeholder="Find in document" aria-label="Find in document"><span class="find-count"></span><button type="button" class="find-arrow find-next" aria-label="Next match">&#x25BC;</button><button type="button" class="panel-toggle find-close">Close</button></div><div class="find-row replace-row"><input type="text" class="replace-input" placeholder="Replace with" aria-label="Replace with"><button type="button" class="panel-toggle replace-one">Replace</button><button type="button" class="panel-toggle replace-all">Replace All</button></div>';
  editorPanel.insertBefore(findBar, editorSurface);
  const findInput = findBar.querySelector(".find-input");
  const replaceInput = findBar.querySelector(".replace-input");
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
  function showFind() { findBar.classList.add("open"); editorSurface.classList.add("find-active"); findInput.focus(); findInput.select(); }
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
  findBar.querySelector(".replace-one").addEventListener("click", () => {
    const match = searchMatches[activeMatch];
    if (!match || source.disabled) return;
    const nextPosition = match.index + replaceInput.value.length;
    source.setRangeText(replaceInput.value, match.index, match.index + match[0].length, "end");
    source.dispatchEvent(new Event("input", { bubbles: true }));
    const nextIndex = searchMatches.findIndex(item => item.index >= nextPosition);
    activeMatch = nextIndex < 0 ? 0 : nextIndex;
    selectSearchMatch();
    replaceInput.focus();
  });
  findBar.querySelector(".replace-all").addEventListener("click", () => {
    if (!searchMatches.length || source.disabled) return;
    let cursor = 0;
    let updated = "";
    for (const match of searchMatches) {
      updated += source.value.slice(cursor, match.index) + replaceInput.value;
      cursor = match.index + match[0].length;
    }
    updated += source.value.slice(cursor);
    source.setRangeText(updated, 0, source.value.length, "end");
    source.dispatchEvent(new Event("input", { bubbles: true }));
    activeMatch = 0;
    renderSearchHighlights();
    replaceInput.focus();
  });
  findBar.querySelector(".find-close").addEventListener("click", () => {
    findInput.value = "";
    activeMatch = 0;
    renderSearchHighlights();
    findBar.classList.remove("open");
    editorSurface.classList.remove("find-active");
  });
  document.querySelector("#find-button")?.addEventListener("click", showFind);
  window.addEventListener("keydown", event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") { event.preventDefault(); showFind(); } });

  function currentHandoutTitle() {
    const heading = source.value.match(/^ {0,3}#(?!#)\s+(.+?)\s*#*\s*$/m);
    const headingText = heading && heading[1].trim();
    const fallback = selectedFile ? selectedFile.name.replace(/\.(md|markdown|mdown)$/i, "") : "handout";
    const title = headingText || fallback;
    activeHandoutTitle = title;
    currentDocumentPath = selectedFile && !selectedFile.untitled ? selectedFile.path : null;
    document.title = `${title} — The Markdown Handout Maker`;
    return title;
  }

  function markDirty(value) {
    currentDocumentPath = selectedFile && !selectedFile.untitled ? selectedFile.path : null;
    dirty = value;
    syncTreeSelection();
    if (selectedFile) statusText.textContent = `${selectedFile.name}${dirty ? " · unsaved" : ""}`;
  }

  function clearActive() { tree.querySelectorAll(".file-entry.active").forEach(node => node.classList.remove("active")); }
  function encodedMarkdownPath(relativePath) {
    return relativePath.split('/').map(part => part === '..' ? part : encodeURIComponent(part).replace(/[()]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)).join('/');
  }
  function imageAltText(name) {
    return name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/[\[\]\\]/g, '').trim() || 'image';
  }
  async function insertTreeImage(node) {
    if (!selectedFile) throw new Error('Open a Markdown handout before inserting an image.');
    const relative = await desktop.imageReference(selectedFile.path, node.path);
    replaceEditorSelection(`![${imageAltText(node.name)}](${encodedMarkdownPath(relative)})`);
    statusText.textContent = `Inserted ${node.name}`;
  }
  function showImagePreview(node) {
    const overlay = document.createElement('div');
    overlay.className = 'app-dialog-overlay image-preview-overlay';
    const close = () => overlay.remove();
    overlay.innerHTML = `<section class="image-preview-dialog" role="dialog" aria-modal="true" aria-label="Image preview"><header><strong>${escapeHtml(node.name)}</strong><button type="button" class="app-dialog-close" aria-label="Close">×</button></header><div class="image-preview-stage"><img src="${escapeHtml(node.url)}" alt="Preview of ${escapeHtml(node.name)}"></div><footer><button type="button" class="button secondary image-preview-rename">Rename…</button><button type="button" class="button primary image-preview-insert">Insert into Markdown</button></footer></section>`;
    document.body.append(overlay);
    overlay.querySelector('.app-dialog-close').addEventListener('click', close);
    overlay.addEventListener('mousedown', event => { if (event.target === overlay) close(); });
    overlay.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
    overlay.querySelector('.image-preview-insert').addEventListener('click', () => insertTreeImage(node).then(close).catch(error => { statusText.textContent = `Could not insert image: ${error.message}`; }));
    overlay.querySelector('.image-preview-rename').addEventListener('click', () => { close(); renameTreeImage(node); });
    overlay.querySelector('.app-dialog-close').focus();
  }
  let automaticRefreshPending = false;
  async function refreshFolderTreeAndAssets(automatic = false) {
    const expected = folder;
    if (!expected || (automatic && tree.querySelector('.browser-create'))) return;
    const refreshed = await desktop.refreshFolder();
    if (!refreshed || folder !== expected || (refreshed.path && refreshed.path !== expected.path)) return;
    if (automatic && tree.querySelector('.browser-create')) return;
    const assetsChanged = JSON.stringify(expected.assets) !== JSON.stringify(refreshed.assets);
    if (automatic && !assetsChanged && JSON.stringify(expected.tree) === JSON.stringify(refreshed.tree)) return;
    const panel = tree.closest('.file-panel');
    const scrollTop = panel.scrollTop;
    folder.tree = refreshed.tree;
    folder.assets = refreshed.assets;
    for (const documentState of documents.values()) documentState.assets = refreshed.assets;
    setAssets(refreshed.assets);
    drawTree();
    panel.scrollTop = scrollTop;
    if (automatic && assetsChanged) {
      const status = statusText.textContent;
      render();
      statusText.textContent = status;
    }
  }
  async function checkFolderChanges() {
    if (!folder || automaticRefreshPending || document.hidden) return;
    automaticRefreshPending = true;
    try { await refreshFolderTreeAndAssets(true); }
    catch { /* A folder may be temporarily unavailable or changing; retry next time. */ }
    finally { automaticRefreshPending = false; }
  }
  const folderRefreshTimer = window.setInterval(checkFolderChanges, 2000);
  window.addEventListener('focus', checkFolderChanges);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void checkFolderChanges(); });
  window.addEventListener('unload', () => window.clearInterval(folderRefreshTimer));
  function replaceCurrentImageReferences(oldReference, newReference) {
    const decodePath = value => { try { return decodeURIComponent(value); } catch { return value; } };
    const normalizePath = value => decodePath(value).replace(/\\/g, '/').replace(/^\.\/+/, '');
    const oldDecoded = normalizePath(oldReference);
    const replacement = encodedMarkdownPath(newReference);
    const updated = source.value.replace(/(!\[[^\]]*\]\()([^\s)]+)((?:\s+"[^"]*")?\)(?:\{[^}]*\})?)/g, (match, opening, imagePath, closing) => {
      return normalizePath(imagePath) === oldDecoded ? `${opening}${replacement}${closing}` : match;
    });
    if (updated !== source.value) {
      source.value = updated;
      source.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  function renameTreeImage(node) {
    const overlay = document.createElement('div');
    overlay.className = 'app-dialog-overlay image-rename-overlay';
    overlay.innerHTML = `<form class="image-rename-dialog" role="dialog" aria-modal="true" aria-labelledby="image-rename-title"><header><strong id="image-rename-title">Rename image</strong><button type="button" class="app-dialog-close" aria-label="Close">×</button></header><label>Filename<input name="filename" value="${escapeHtml(node.name)}" autocomplete="off" required></label><p class="image-rename-error" role="alert"></p><footer><button type="button" class="button secondary image-rename-cancel">Cancel</button><button type="submit" class="button primary">Rename</button></footer></form>`;
    document.body.append(overlay);
    const form = overlay.querySelector('form');
    const input = form.elements.filename;
    const errorMessage = overlay.querySelector('.image-rename-error');
    const close = () => overlay.remove();
    overlay.querySelector('.app-dialog-close').addEventListener('click', close);
    overlay.querySelector('.image-rename-cancel').addEventListener('click', close);
    overlay.addEventListener('mousedown', event => { if (event.target === overlay) close(); });
    overlay.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      errorMessage.textContent = '';
      try {
        const oldReference = selectedFile ? await desktop.imageReference(selectedFile.path, node.path) : '';
        const renamed = await desktop.renameImage(node.path, input.value);
        if (selectedFile && renamed.path !== node.path) {
          const newReference = await desktop.imageReference(selectedFile.path, renamed.path);
          replaceCurrentImageReferences(oldReference, newReference);
        }
        await refreshFolderTreeAndAssets();
        close();
        statusText.textContent = `Renamed image to ${renamed.name}`;
      } catch (error) {
        errorMessage.textContent = error.message || 'Could not rename image.';
        submit.disabled = false;
        input.focus();
      }
    });
    input.focus();
    input.select();
  }
  function renameTreeFile(node) {
    const overlay = document.createElement('div');
    overlay.className = 'app-dialog-overlay image-rename-overlay';
    overlay.innerHTML = `<form class="image-rename-dialog" role="dialog" aria-modal="true" aria-labelledby="file-rename-title"><header><strong id="file-rename-title">Rename handout</strong><button type="button" class="app-dialog-close" aria-label="Close">×</button></header><label>Filename<input name="filename" value="${escapeHtml(node.name)}" autocomplete="off" required></label><p class="image-rename-error" role="alert"></p><footer><button type="button" class="button secondary image-rename-cancel">Cancel</button><button type="submit" class="button primary">Rename</button></footer></form>`;
    document.body.append(overlay);
    const form = overlay.querySelector('form');
    const input = form.elements.filename;
    const errorMessage = overlay.querySelector('.image-rename-error');
    const close = () => overlay.remove();
    overlay.querySelector('.app-dialog-close').addEventListener('click', close);
    overlay.querySelector('.image-rename-cancel').addEventListener('click', close);
    overlay.addEventListener('mousedown', event => { if (event.target === overlay) close(); });
    overlay.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      errorMessage.textContent = '';
      try {
        const renamed = await desktop.renameFile(node.path, input.value);
        const documentState = documents.get(node.path);
        if (documentState && renamed.path !== node.path) {
          documents.delete(node.path);
          documentState.file = { ...documentState.file, path: renamed.path, name: renamed.name };
          documents.set(renamed.path, documentState);
          if (activePath === node.path) { activePath = renamed.path; selectedFile = documentState.file; }
        }
        await refreshFolderTreeAndAssets();
        drawTabs();
        if (browserSelection?.path === node.path) browserSelection = { ...node, ...renamed };
        if (selectedFile?.path === renamed.path) { currentHandoutTitle(); syncTreeSelection(true); }
        close();
        statusText.textContent = `Renamed handout to ${renamed.name}`;
      } catch (error) {
        errorMessage.textContent = error.message || 'Could not rename handout.';
        submit.disabled = false;
        input.focus();
      }
    });
    input.focus();
    input.select();
  }
  async function deleteTreeFile(node) {
    const documentState = documents.get(node.path);
    const warning = documentState?.dirty ? '\n\nUnsaved changes in this open handout will be lost.' : '';
    if (!window.confirm(`Delete “${node.name}”? This cannot be undone.${warning}`)) return;
    try {
      await desktop.deleteFile(node.path);
      const wasActive = activePath === node.path;
      documents.delete(node.path);
      if (wasActive) {
        const next = documents.values().next().value;
        if (next) activateDocument(next.file.path);
        else {
          activePath = null; selectedFile = null; dirty = false; source.value = ''; source.disabled = true;
          setAssets([]); markDirty(false); statusText.textContent = 'No file open'; drawTabs(); render();
        }
      } else drawTabs();
      await refreshFolderTreeAndAssets();
      statusText.textContent = `Deleted handout ${node.name}`;
    } catch (error) {
      statusText.textContent = `Could not delete handout: ${error.message}`;
    }
  }
  const revealLabel = desktop.platform === 'darwin' ? 'Show in Finder' : 'Show in file manager';
  async function browserAction(action, node) {
    try {
      if (action === 'reveal') await desktop.revealItem(node.path);
      else if (action === 'external') {
        await desktop.openExternalFile(node.path);
        statusText.textContent = `Opened ${node.name} in its default app`;
      } else if (action === 'extract') {
        statusText.textContent = `Extracting ${node.name}…`;
        const extracted = await desktop.extractZip(node.path);
        browserSearch.value = '';
        expandedFolders.set(extracted.path, true);
        browserSelection = { ...extracted, type: 'folder' };
        await refreshFolderTreeAndAssets();
        let parent = parentOf(extracted.path);
        while (parent && parent !== folder.path) { expandedFolders.set(parent, true); parent = parentOf(parent); }
        drawTree();
        statusText.textContent = `Extracted to ${extracted.name}`;
      }
    } catch (error) { statusText.textContent = `Could not ${action === 'extract' ? 'extract ZIP' : action === 'reveal' ? 'show item' : 'open item'}: ${error.message}`; }
  }
  desktop.onDragError?.(message => { statusText.textContent = `Could not drag file: ${message}`; });
  function installNativeDrag(element, node) {
    element.draggable = true;
    element.addEventListener('dragstart', event => {
      event.preventDefault();
      if (documents.get(node.path)?.dirty) statusText.textContent = 'Dragging the saved file; unsaved edits stay in the editor.';
      desktop.startFileDrag(node.path);
    });
  }
  async function showDocumentPreview(node) {
    const oldPreview=document.querySelector('.supporting-preview'); window.HandoutVideo.stop(oldPreview); oldPreview?.remove();
    const panel = document.createElement('aside'); panel.className = 'supporting-preview'; panel.setAttribute('aria-label', `Preview ${node.name}`);
    const heading = document.createElement('strong'); heading.textContent = node.name;
    const open = document.createElement('button'); open.textContent = 'Open in default app'; open.onclick = () => void browserAction('external', node);
    const dismiss=()=>{window.HandoutVideo.stop(panel);panel.remove();};
    const close = document.createElement('button'); close.textContent = 'Close preview'; close.onclick = dismiss;
    const body = document.createElement('div'); body.className = 'supporting-preview-body'; body.textContent = 'Loading preview…';
    panel.append(heading, open, close, body); document.body.append(panel);
    panel.addEventListener('keydown', event => { if (event.key === 'Escape') { dismiss(); } }); close.focus();
    try {
      const preview = await desktop.previewDocument(node.path); if (!panel.isConnected) return;
      body.replaceChildren();
      if (preview.note) { const note = document.createElement('p'); note.textContent = preview.note; body.append(note); }
      if (preview.kind === 'pdf') { const frame = document.createElement('iframe'); frame.src = preview.url; frame.title = node.name; body.append(frame); }
      if (preview.kind === 'video') {
        const video=document.createElement('video');video.src=preview.url;video.controls=true;video.preload='metadata';video.style.width='100%';body.append(video);
        const insert=document.createElement('button');insert.textContent='Insert video';insert.onclick=async()=>{try{if(!selectedFile||selectedFile.untitled)throw Error('Open a saved handout or slide deck first.');const relative=await desktop.imageReference(selectedFile.path,node.path);replaceEditorSelection(`\n[video:${encodedMarkdownPath(relative)}]\n\n`);dismiss();}catch(error){statusText.textContent=error.message;}};panel.insertBefore(insert,body);
      }
      if (preview.kind === 'text') { const pre = document.createElement('pre'); pre.textContent = preview.text; body.append(pre); }
      for (const sheet of preview.sheets || []) {
        const title = document.createElement('h3'); title.textContent = sheet.name; body.append(title);
        const table = document.createElement('table');
        for (const row of sheet.rows) { const tr = document.createElement('tr'); for (const value of row) { const td = document.createElement('td'); td.textContent = value; tr.append(td); } table.append(tr); }
        body.append(table);
      }
    } catch (error) { body.textContent = `Could not preview: ${error.message}`; }
  }
  function externalActions(node) {
    return [...(node.type !== 'folder' && !node.markdown ? [['Move to…', () => chooseMoveFolder(node)]] : []), ...(node.type !== 'folder' && !node.markdown && !node.image ? [['Preview', () => void showDocumentPreview(node)]] : []), [revealLabel, () => void browserAction('reveal', node)],
      [node.type === 'folder' ? (desktop.platform === 'darwin' ? 'Open in Finder' : 'Open in file manager') : 'Open in default app', () => void browserAction('external', node)],
      ...(/\.zip$/i.test(node.name || '') && node.type !== 'folder' ? [['Extract ZIP', () => void browserAction('extract', node)]] : [])];
  }
  function showFileContextMenu(node, event) {
    showBrowserMenu([
      ['New handout', () => createInline(parentOf(node.path), 'file')],
      ['New folder', () => createInline(parentOf(node.path), 'folder')],
      ['Move to…', () => chooseMoveFolder(node)],
      ['Rename…', () => renameTreeFile(node)],
      ['Delete…', () => void deleteTreeFile(node)],
      ...externalActions(node)
    ], event);
  }
  function showImageContextMenu(node, event) {
    showBrowserMenu([
      ['Insert into Markdown', () => insertTreeImage(node).catch(error => { statusText.textContent = error.message; })],
      ['Preview', () => showImagePreview(node)],
      ['Rename…', () => renameTreeImage(node)],
      ...externalActions(node)
    ], event);
  }
  let browserSelection = null;
  const expandedFolders = new Map();
  const expansionStorageKey = root => `handout-folder-expansion-v1:${root}`;
  function saveFolderExpansion() {
    if (!folder || browserSearch.value) return;
    for (const details of tree.querySelectorAll('details[data-folder-path]')) expandedFolders.set(details.dataset.folderPath, details.open);
    try { localStorage.setItem(expansionStorageKey(folder.path), JSON.stringify([...expandedFolders].filter(([, open]) => open).map(([path]) => path))); }
    catch { /* File browsing remains usable if local storage is unavailable. */ }
  }
  function restoreFolderExpansion(root) {
    expandedFolders.clear();
    try {
      const paths = JSON.parse(localStorage.getItem(expansionStorageKey(root)) || '[]');
      if (Array.isArray(paths)) for (const path of paths) if (typeof path === 'string') expandedFolders.set(path, true);
    } catch { /* New folders start collapsed, including when saved data is invalid. */ }
  }
  window.addEventListener('beforeunload', saveFolderExpansion);
  const browserTools = document.createElement('div');
  browserTools.className = 'file-browser-tools';
  browserTools.innerHTML = '<input type="search" aria-label="Search filenames" placeholder="Search filenames…"><button type="button" aria-label="Create file or folder" title="Create in selected folder">+</button>';
  tree.before(browserTools);
  const browserSearch = browserTools.querySelector('input');
  browserSearch.addEventListener('input', drawTree);
  browserTools.querySelector('button').addEventListener('click', event => {
    if (!folder) { statusText.textContent = 'Open a folder first.'; return; }
    const rect = event.currentTarget.getBoundingClientRect();
    showCreateMenu(browserSelection?.type === 'folder' ? browserSelection : { path: parentOf(browserSelection?.path) || folder.path }, { clientX: rect.left, clientY: rect.bottom });
  });
  function parentOf(value) { return value?.slice(0, Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\'))); }
  function syncTreeSelection(reveal = false) {
    tree.querySelectorAll('[data-file-path]').forEach(row => {
      const active = row.dataset.filePath === activePath;
      row.classList.toggle('active', active);
      row.classList.toggle('unsaved', !!documents.get(row.dataset.filePath)?.dirty);
      if (active) row.setAttribute('aria-current', 'true'); else row.removeAttribute('aria-current');
      if (active && reveal) {
        let ancestor = row.parentElement;
        while (ancestor && ancestor !== tree) { if (ancestor.tagName === 'DETAILS') ancestor.open = true; ancestor = ancestor.parentElement; }
        row.scrollIntoView?.({ block: 'nearest' });
      }
    });
  }
  function showCreateMenu(node, event) {
    showBrowserMenu([['New handout', () => createInline(node.path, 'file')], ['New folder', () => createInline(node.path, 'folder')], ...externalActions({ ...node, type: 'folder' })], event);
  }
  function showBrowserMenu(actions, event) {
    document.querySelector('.image-context-menu')?.remove();
    const menu = document.createElement('div'); menu.className = 'image-context-menu'; menu.setAttribute('role', 'menu');
    const close = () => { menu.remove(); window.removeEventListener('pointerdown', outside); window.removeEventListener('keydown', escape); };
    const outside = e => { if (!menu.contains(e.target)) close(); };
    const escape = e => { if (e.key === 'Escape') close(); };
    for (const [label, action] of actions) { const button = document.createElement('button'); button.textContent = label; button.type = 'button'; button.addEventListener('click', () => { close(); action(); }); menu.append(button); }
    document.body.append(menu); menu.style.left = `${Math.max(0, Math.min(event.clientX, innerWidth - menu.offsetWidth - 8))}px`; menu.style.top = `${Math.max(0, Math.min(event.clientY, innerHeight - menu.offsetHeight - 8))}px`;
    window.addEventListener('pointerdown', outside); window.addEventListener('keydown', escape); menu.firstChild.focus();
  }
  function createInline(parent, type) {
    browserSearch.value = ''; expandedFolders.set(parent, true); drawTree();
    const host = [...tree.querySelectorAll('details')].find(el => el.dataset.folderPath === parent) || tree;
    host.open = true;
    const form = document.createElement('form'); form.className = 'browser-create';
    const input = document.createElement('input'); input.setAttribute('aria-label', type === 'file' ? 'New handout name' : 'New folder name'); input.placeholder = type === 'file' ? 'new-handout.md' : 'New folder'; input.required = true;
    const error = document.createElement('span'); error.setAttribute('role', 'alert');
    const submit = document.createElement('button'); submit.textContent = 'Create';
    form.append(input, submit, error); host.append(form);
    input.addEventListener('keydown', e => { if (e.key === 'Escape') form.remove(); });
    form.addEventListener('submit', async e => {
      e.preventDefault(); submit.disabled = true;
      try { const node = await desktop.createEntry(parent, input.value, type); browserSelection = node; await refreshFolderTreeAndAssets(); if (type === 'file') addDocument(node, node.content ?? window.HandoutStarter, folder.assets); statusText.textContent = `Created ${node.name}`; }
      catch (failure) { error.textContent = failure.message; submit.disabled = false; }
    }); input.focus();
  }
  async function moveTreeFile(node, parent) {
    saveActiveState();
    try {
      const state = documents.get(node.path);
      const moved = await desktop.moveHandout(node.path, parent, state?.content);
      if (state) {
        documents.delete(node.path); state.file = { ...state.file, path: moved.path, name: moved.name }; state.content = moved.content; documents.set(moved.path, state);
        if (activePath === node.path) { activePath = moved.path; selectedFile = state.file; dirty = state.dirty; loadingDocument = true; setSourceContent(moved.content); loadingDocument = false; markDirty(dirty); }
      }
      browserSelection = { ...node, path: moved.path }; expandedFolders.set(parent, true);
      await refreshFolderTreeAndAssets(); drawTabs(); syncTreeSelection(true); render(); statusText.textContent = `Moved ${moved.name}`;
    } catch (error) { statusText.textContent = `Could not move file: ${error.message}`; }
  }
  function chooseMoveFolder(node) {
    const overlay = document.createElement('div'); overlay.className = 'app-dialog-overlay';
    const panel = document.createElement('form'); panel.className = 'image-rename-dialog'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', `Move ${node.name}`);
    const heading = document.createElement('strong'); heading.textContent = `Move ${node.name} to…`;
    const select = document.createElement('select'); select.setAttribute('aria-label', 'Destination folder');
    function addOption(path, label) { const option = document.createElement('option'); option.value = path; option.textContent = label; select.append(option); }
    addOption(folder.path, folder.name);
    function walk(nodes, prefix) { for (const n of nodes) if (n.type === 'folder') { addOption(n.path, prefix + n.name); walk(n.children, prefix + n.name + '/'); } } walk(folder.tree, '');
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel'; cancel.onclick = () => overlay.remove();
    const submit = document.createElement('button'); submit.textContent = 'Move';
    const note = document.createElement('p'); note.textContent = node.markdown ? 'Moving updates relative image and link paths. Unsaved edits stay unsaved.' : 'Move this file into the selected folder.';
    panel.append(heading, note, select, cancel, submit); overlay.append(panel); document.body.append(overlay);
    overlay.addEventListener('keydown', e => { if (e.key === 'Escape') overlay.remove(); });
    panel.onsubmit = e => { e.preventDefault(); overlay.remove(); void moveTreeFile(node, select.value); }; select.focus();
  }
  function installFolderDrop(element, destination) {
    const isFileDrag = event => [...(event.dataTransfer?.types || [])].some(type => type === 'Files' || type === 'application/x-handout-path');
    element.addEventListener('dragover', event => {
      if (!isFileDrag(event)) return;
      event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'move'; element.classList.add('drop-target');
    });
    element.addEventListener('dragleave', () => element.classList.remove('drop-target'));
    element.addEventListener('drop', async event => {
      if (!isFileDrag(event)) return;
      event.preventDefault(); event.stopPropagation(); element.classList.remove('drop-target');
      const paths = [...(event.dataTransfer.files || [])].map(file => desktop.droppedFilePath(file));
      const legacyPath = event.dataTransfer.getData('application/x-handout-path'); if (legacyPath) paths.push(legacyPath);
      const find = (nodes, path) => { for (const node of nodes) { if (node.type === 'file' && node.path === path) return node; if (node.children) { const match = find(node.children, path); if (match) return match; } } };
      for (const path of new Set(paths)) {
        const node = find(folder.tree, path);
        if (node) await moveTreeFile(node, destination());
        else statusText.textContent = 'Only files in the open folder can be moved here.';
      }
    });
  }
  installFolderDrop(folderName, () => folder?.path);
  installFolderDrop(tree, () => folder?.path);
  folderName.title = 'Right-click for folder actions';
  folderName.addEventListener('contextmenu', event => { if (folder) { event.preventDefault(); showCreateMenu(folder, event); } });
  tree.addEventListener('contextmenu', event => { if (event.target === tree || event.target.classList.contains('empty-tree')) { event.preventDefault(); if (folder) showCreateMenu(folder, event); } });
  function addTree(nodes, parent) {
    const list = document.createElement('ul');
    const query = browserSearch.value.trim().toLowerCase();
    const matches = node => node.type === 'folder' ? node.children.some(matches) : node.name.toLowerCase().includes(query);
    for (const node of nodes) {
      if (query && !matches(node)) continue;
      const item = document.createElement('li');
      if (node.type === 'folder') {
        const details = document.createElement('details'); details.dataset.folderPath = node.path; details.open = query ? true : expandedFolders.get(node.path) ?? false;
        details.addEventListener('toggle', () => { if (details.isConnected && !browserSearch.value) { expandedFolders.set(node.path, details.open); saveFolderExpansion(); } });
        const summary = document.createElement('summary'); summary.textContent = node.name; summary.title = node.path; details.append(summary);
        summary.addEventListener('click', () => { browserSelection = node; });
        summary.addEventListener('contextmenu', event => { event.preventDefault(); event.stopPropagation(); browserSelection = node; showCreateMenu(node, event); });
        installFolderDrop(summary, () => node.path);
        addTree(node.children, details); item.append(details);
      } else if (node.markdown) {
        const button = document.createElement('button'); button.className = 'file-entry'; button.textContent = node.name; button.title = node.path; button.dataset.filePath = node.path;
        installNativeDrag(button, node);
        button.addEventListener('click', () => { browserSelection = node; void openFile(node); }); item.append(button);
        button.addEventListener('contextmenu', event => { event.preventDefault(); event.stopPropagation(); browserSelection = node; showFileContextMenu(node, event); });
      } else if (node.image) {
        const asset = document.createElement('span'); asset.className = 'file-entry image-entry'; asset.textContent = node.name; asset.title = node.path; asset.tabIndex = 0;
        installNativeDrag(asset, node);
        asset.addEventListener('click', () => { browserSelection = node; });
        asset.addEventListener('contextmenu', event => { event.preventDefault(); showImageContextMenu(node, event); });
        asset.addEventListener('dblclick', () => showImagePreview(node)); asset.addEventListener('keydown', event => { if (event.key === 'Enter') showImagePreview(node); }); item.append(asset);
      } else {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'file-entry external-entry'; button.textContent = node.name; button.title = `${node.path} · Click to preview; drag to another app`;
        installNativeDrag(button, node);
        button.addEventListener('click', () => { browserSelection = node; void showDocumentPreview(node); });
        button.addEventListener('dblclick', () => void browserAction('external', node));
        button.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); void browserAction('external', node); } });
        button.addEventListener('contextmenu', event => { event.preventDefault(); event.stopPropagation(); browserSelection = node; showBrowserMenu(externalActions(node), event); });
        item.append(button);
      }
      if (item.childNodes.length) list.append(item);
    }
    if (list.childNodes.length) parent.append(list);
  }
  function drawTree() {
    tree.innerHTML = ''; if (folder) addTree(folder.tree, tree);
    if (!tree.childNodes.length) { const empty = document.createElement('p'); empty.className = 'empty-tree'; empty.textContent = browserSearch.value ? 'No matching files.' : 'No files in this folder.'; tree.append(empty); }
    syncTreeSelection();
  }
  async function openFile(node, button) {
    if (selectedFile && node.path === selectedFile.path) return;
    discardBlankUntitledHandout();
    if (!await resolveUnsaved()) return;
    try {
      const content = await desktop.readFile(node.path); addDocument(node, content, folder ? folder.assets : []); clearActive(); syncTreeSelection(true);
    } catch (error) { statusText.textContent = `Could not open file: ${error.message}`; }
  }
  async function loadStandalone(file) {
    if (!file) return;
    discardBlankUntitledHandout();
    if (!await resolveUnsaved()) return;
    const documentFile = { type: "file", name: file.name, path: file.path, markdown: true };
    addDocument(documentFile, file.content, file.assets || []);
    const refreshed = await desktop.refreshFolder();
    if (refreshed) { if (folder?.path !== refreshed.path) { saveFolderExpansion(); restoreFolderExpansion(refreshed.path); browserSelection = null; } folder = refreshed; folderName.textContent = refreshed.name; browserSearch.value = ''; drawTree(); syncTreeSelection(true); }
  }
  async function chooseFile() {
    try { if (await resolveUnsaved()) await loadStandalone(await desktop.openFile()); }
    catch (error) { statusText.textContent = `Could not open file: ${error.message}`; }
  }
  async function openRecentPath(filePath) { try { if (await resolveUnsaved()) await loadStandalone(await desktop.openRecent(filePath)); } catch (error) { statusText.textContent = `Could not open recent file: ${error.message}`; } }
  async function saveCurrent() {
    if (!selectedFile) return false;
    if (selectedFile.untitled) return saveUntitledHandout();
    try { await desktop.saveFile(selectedFile.path, source.value); dirty = false; const documentState = documents.get(selectedFile.path); if (documentState) { documentState.content = source.value; documentState.dirty = false; } markDirty(false); drawTabs(); return true; }
    catch (error) { statusText.textContent = `Could not save: ${error.message}`; return false; }
  }
  function setAssets(assets) {
    clearAssets();
    assets.forEach(asset => {
      assetMap.set(asset.relative, asset.url);
      if(window.HandoutVideo.extensions.test(asset.relative))videoAssetMap.set(asset.relative,asset.url);
      assetMap.set(asset.relative.split('/').pop(), asset.url);
    });
    // Resolve against the handout location so nested documents and moved handouts
    // still select the correct image when several folders use the same filename.
    if (selectedFile && !selectedFile.untitled) {
      videoAssetMap.clear();
      const documentUrl = new URL('file://' + selectedFile.path.split('/').map(encodeURIComponent).join('/'));
      assets.forEach(asset => {
        const target = new URL(asset.url);
        const from = documentUrl.pathname.split('/').slice(0, -1);
        const to = target.pathname.split('/');
        while (from.length && to.length && from[0] === to[0]) { from.shift(); to.shift(); }
        const relative = [...from.map(() => '..'), ...to].join('/');
        if(window.HandoutVideo.extensions.test(asset.relative)){videoAssetMap.set(relative,asset.url);videoAssetMap.set(decodeURIComponent(relative),asset.url);}
        assetMap.set(decodeURIComponent(relative), asset.url);
        assetMap.set(relative, asset.url);
      });
    }
  }
  function addImageToFolderTree(imported) {
    if (!folder || !imported.path) return;
    const separatorIndex = Math.max(imported.path.lastIndexOf('/'), imported.path.lastIndexOf('\\'));
    const parentPath = imported.path.slice(0, separatorIndex);
    const imageNode = { type: 'file', name: imported.path.slice(separatorIndex + 1), path: imported.path, url: imported.url, image: true, markdown: false };
    const addTo = nodes => {
      for (const node of nodes) {
        if (node.type !== 'folder') continue;
        if (node.path === parentPath) { node.children.push(imageNode); node.children.sort((a, b) => a.name.localeCompare(b.name)); return true; }
        if (addTo(node.children)) return true;
      }
      return false;
    };
    if (parentPath === folder.path) { folder.tree.push(imageNode); folder.tree.sort((a, b) => a.name.localeCompare(b.name)); }
    else addTo(folder.tree);
    drawTree();
  }
  async function importEditorImage(file, selectionStart, selectionEnd, action = 'Pasted', trailingText = '') {
    if (!selectedFile) throw new Error('Open a saved Markdown handout before importing an image.');
    if (selectedFile.untitled) throw new Error('Save this document before importing an image.');
    const imported = await desktop.importImage(selectedFile.path, new Uint8Array(await file.arrayBuffer()));
    const documentState = documents.get(selectedFile.path);
    if (documentState) documentState.assets = [...(documentState.assets || []), imported];
    assetMap.set(imported.relative, imported.url);
    assetMap.set(imported.relative.split('/').pop(), imported.url);
    addImageToFolderTree(imported);
    source.setSelectionRange(selectionStart, selectionEnd);
    replaceEditorSelection(`![${imageAltText(file.name || 'image')}](${encodedMarkdownPath(imported.relative)})${trailingText}`);
    statusText.textContent = `${action} image as ${imported.relative}`;
    return imported;
  }
  let pasteAsPlainText = false;
  source.addEventListener('keydown', event => { pasteAsPlainText = (event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'v'; });
  source.addEventListener('blur', () => { pasteAsPlainText = false; });
  source.addEventListener('paste', event => {
    if (pasteAsPlainText) { pasteAsPlainText = false; return; }
    const imageItem = [...(event.clipboardData?.items || [])].find(item => item.kind === 'file' && item.type.startsWith('image/'));
    const html = event.clipboardData?.getData('text/html');
    const text = event.clipboardData?.getData('text/plain') || '';
    if (html || (!imageItem && text.includes('\t'))) {
      const converted = html ? window.HandoutClipboard.htmlToMarkdown(html) : window.HandoutClipboard.table(window.HandoutClipboard.delimited(text));
      if (converted) { event.preventDefault(); replaceEditorSelection(converted); statusText.textContent = 'Pasted as editable Markdown'; return; }
    }
    if (!imageItem) return;
    event.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) { statusText.textContent = 'Could not read the clipboard image.'; return; }
    const selectionStart = source.selectionStart;
    const selectionEnd = source.selectionEnd;
    importEditorImage(file, selectionStart, selectionEnd).catch(error => {
      statusText.textContent = `Could not paste image: ${error.message}`;
    });
  });
  function editorOffsetFromPoint(clientX, clientY) {
    const rect = source.getBoundingClientRect();
    const style = getComputedStyle(source);
    const lineHeight = parseFloat(style.lineHeight) || 22;
    const canvas = editorOffsetFromPoint.canvas || (editorOffsetFromPoint.canvas = document.createElement('canvas'));
    const context = canvas.getContext('2d');
    context.font = style.font;
    const characterWidth = context.measureText('0').width || 8;
    const lines = source.value.split('\n');
    const lineIndex = Math.max(0, Math.min(lines.length - 1, Math.floor((clientY - rect.top - parseFloat(style.paddingTop) + source.scrollTop) / lineHeight)));
    const column = Math.max(0, Math.min(lines[lineIndex].length, Math.round((clientX - rect.left - parseFloat(style.paddingLeft) + source.scrollLeft) / characterWidth)));
    return lines.slice(0, lineIndex).reduce((total, line) => total + line.length + 1, 0) + column;
  }
  const draggedImageFiles = event => [...(event.dataTransfer?.files || [])].filter(file => file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name));
  const hasDraggedImage = event => draggedImageFiles(event).length || [...(event.dataTransfer?.items || [])].some(item => item.kind === 'file' && item.type.startsWith('image/'));
  source.addEventListener('dragover', event => {
    if (!hasDraggedImage(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    source.classList.add('image-drag-target');
  });
  source.addEventListener('dragleave', event => {
    if (!source.contains(event.relatedTarget)) source.classList.remove('image-drag-target');
  });
  source.addEventListener('drop', async event => {
    const files = draggedImageFiles(event);
    if (!files.length) return;
    event.preventDefault();
    source.classList.remove('image-drag-target');
    let insertionPoint = editorOffsetFromPoint(event.clientX, event.clientY);
    try {
      for (let index = 0; index < files.length; index++) {
        await importEditorImage(files[index], insertionPoint, insertionPoint, 'Dropped', index < files.length - 1 ? '\n' : '');
        insertionPoint = source.selectionStart;
      }
    } catch (error) {
      statusText.textContent = `Could not drop image: ${error.message}`;
    }
  });
  window.addEventListener('dragend', () => source.classList.remove('image-drag-target'));
  async function chooseFolder(recentPath) {
    saveActiveState();
    for (const state of [...documents.values()]) {
      if (!state.dirty) continue;
      if (activePath !== state.file.path) activateDocument(state.file.path);
      if (!await resolveUnsaved()) return false;
    }
    let next;
    try { next = recentPath ? await desktop.openRecentFolder(recentPath) : await desktop.openFolder(); }
    catch (error) { statusText.textContent = `Could not open folder: ${error.message}`; return false; }
    if (!next) return false;
    saveFolderExpansion();
    browserSelection = null; browserSearch.value = ''; restoreFolderExpansion(next.path);
    saveActiveState(); folder = next; selectedFile = null; activePath = null; documents.clear(); source.value = ""; source.disabled = true; folderName.textContent = next.name; setAssets(next.assets); drawTabs(); drawTree(); markDirty(false); statusText.textContent = "No file open"; render();
    makeUntitledHandout();
    return true;
  }
  async function makeNewHandout() {
    makeUntitledHandout();
  }
  source.addEventListener("input", () => { if (loadingDocument) return; currentHandoutTitle(); dirty = true; if (selectedFile) { const documentState = documents.get(selectedFile.path); if (documentState) { documentState.content = source.value; documentState.dirty = true; } } markDirty(true); drawTabs(); });
  makeUntitledHandout();
  function toggleAnswers() { showAnswers = !showAnswers; render(); }
  function googleDialog(title) {
    const overlay = document.createElement('div');
    overlay.className = 'app-dialog-overlay';
    const panel = document.createElement('section');
    panel.className = 'app-dialog google-dialog';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    const header = document.createElement('header');
    const heading = document.createElement('h2');
    heading.textContent = title;
    const closeButton = document.createElement('button');
    closeButton.className = 'app-dialog-close';
    closeButton.type = 'button';
    closeButton.textContent = '×';
    closeButton.setAttribute('aria-label', 'Close');
    header.append(heading, closeButton);
    const body = document.createElement('div');
    const message = document.createElement('p');
    message.className = 'google-message';
    message.setAttribute('role', 'status');
    panel.append(header, body, message);
    overlay.append(panel);
    document.body.append(overlay);
    const close = () => overlay.remove();
    closeButton.addEventListener('click', close);
    overlay.addEventListener('mousedown', event => { if (event.target === overlay) close(); });
    overlay.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
    closeButton.focus();
    return { overlay, panel, body, message, close };
  }
  function googleButton(label, action, parent) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button secondary';
    button.textContent = label;
    button.addEventListener('click', async () => {
      button.disabled = true;
      try { await action(); } catch (error) { parent.textContent = error.message || 'Google Drive request failed.'; }
      finally { button.disabled = false; }
    });
    return button;
  }
  async function showGoogleSettings() {
    const dialog = googleDialog('Google Drive settings');
    const info = document.createElement('p');
    info.textContent = 'Enter the OAuth Desktop client ID. If Google reports that client_secret is missing, also enter the secret from the same Desktop client in Google Cloud. Sign in opens your system browser.';
    const label = document.createElement('label');
    label.textContent = 'OAuth Desktop client ID';
    const input = document.createElement('input');
    input.type = 'text';
    input.autocomplete = 'off';
    label.append(input);
    const secretLabel = document.createElement('label');
    secretLabel.textContent = 'OAuth client secret (if Google requires it)';
    const secretInput = document.createElement('input');
    secretInput.type = 'password';
    secretInput.autocomplete = 'new-password';
    secretInput.placeholder = 'Leave blank to keep the saved secret';
    secretLabel.append(secretInput);
    const actions = document.createElement('div');
    actions.className = 'google-actions';
    actions.append(
      googleButton('Save credentials', async () => { const result = await desktop.saveGoogleClientId(input.value, secretInput.value); secretInput.value = ''; dialog.message.textContent = result.secureStorage ? 'Credentials saved using encrypted system storage.' : 'Credentials saved for this run. Click Sign in now. Secure storage is unavailable, so the secret and Google sign-in will need to be entered again after restarting.'; }, dialog.message),
      googleButton('Sign in', async () => { const result = await desktop.googleSignIn(); dialog.message.textContent = result.persistentSignIn ? 'Signed in. Your session is encrypted on this computer.' : 'Signed in for this app session.'; }, dialog.message),
      googleButton('Sign out', async () => { await desktop.googleSignOut(); dialog.message.textContent = 'Signed out.'; }, dialog.message)
    );
    dialog.body.append(info, label, secretLabel, actions);
    const settings = await desktop.googleSettings();
    input.value = settings.clientId;
    if (settings.hasClientSecret) secretInput.placeholder = 'Secret saved securely; leave blank to keep it';
    dialog.message.textContent = settings.signedIn ? 'Signed in.' : 'Not signed in.';
  }
  function requireGoogleHandout() {
    if (!selectedFile) throw new Error('Open a saved Markdown handout first.');
    return selectedFile.path;
  }
  async function showGoogleLink(link, title = 'Google Doc link and QR', description = 'Internet needed. Your phone must have access to this file in Google Drive.') {
    if (!link) throw new Error('No Google Drive link is available.');
    const dialog = googleDialog(title);
    const qr = document.createElement('div');
    qr.className = 'google-link-qr';
    qr.innerHTML = window.HandoutQr.renderQrBlock(link.url);
    const anchor = document.createElement('a');
    anchor.href = link.url;
    anchor.textContent = link.url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    const note = document.createElement('p');
    note.textContent = description;
    dialog.body.append(qr, anchor, note);
  }
  async function googleCommand(command) {
    try {
      if (command === 'google-settings') return await showGoogleSettings();
      const filePath = requireGoogleHandout();
      if (command === 'google-link') return await showGoogleLink(await desktop.googleDocLink(filePath));
      if (command === 'google-export-pdf') {
        render();
        const exportPdf = () => desktop.googleExportPdf(pdfLayout(), currentHandoutTitle());
        const result = isSlideDocument() ? await slideStudio.withAllSlides(exportPdf) : await exportPdf();
        if (!result) return;
        statusText.textContent = `Exported ${result.name} to Google Drive`;
        return showGoogleLink(result, 'Drive PDF link and QR', 'Internet needed. Your phone must have access to this PDF in Google Drive.');
      }
      if (command === 'google-sync') {
        if (dirty && !await saveCurrent()) return;
        const result = await desktop.googleSync(filePath, currentHandoutTitle());
        statusText.textContent = 'Google Doc created and linked';
        return showGoogleLink(result);
      }
      if (command === 'google-push') {
        if (dirty && !await saveCurrent()) return;
        await desktop.googlePush(filePath);
        statusText.textContent = 'Pushed to Google Doc';
        return;
      }
      if (command === 'google-pull') {
        if (dirty) throw new Error('Save or discard unsaved changes before pulling.');
        if (!window.confirm(`Replace the local handout “${selectedFile.name}” with the linked Google Doc?`)) return;
        const result = await desktop.googlePull(filePath);
        loadingDocument = true;
        setSourceContent(result.content);
        loadingDocument = false;
        const state = documents.get(filePath);
        if (state) { state.content = result.content; state.dirty = false; }
        markDirty(false);
        drawTabs();
        render();
        syncHighlight();
        statusText.textContent = result.backupPath ? `Pulled from Google Doc; saved local backup at ${result.backupPath}` : 'Pulled from Google Doc';
        if (result.backupPath) await refreshFolderTreeAndAssets();
      }
    } catch (error) { statusText.textContent = `Google Drive: ${error.message}`; }
  }
  async function showSyntaxGuide(guideName) {
      try {
        const name = guideName.split(/[\\/]/).pop();
        const text = await desktop.readGuide(name);
        document.querySelector('.supporting-preview')?.remove();
        const panel = document.createElement('aside'); panel.className = 'supporting-preview'; panel.setAttribute('aria-label', 'Syntax guide');
        const title = document.createElement('strong'); title.textContent = name === 'SLIDES_GUIDE.md' ? 'Slide Syntax Guide' : name === 'AI_HANDOUT_GUIDE.md' ? 'AI Handout Syntax Guide' : 'Handout Markdown Guide';
        const copy = document.createElement('button'); copy.textContent = 'Copy entire guide';
        const save = document.createElement('button'); save.textContent = 'Save as…';
        save.onclick = async () => {
          save.disabled = true;
          try { const savedPath = await desktop.saveGuide(name); if (savedPath) statusText.textContent = `Guide saved to ${savedPath}`; }
          catch (error) { statusText.textContent = `Could not save guide: ${error.message}`; }
          finally { save.disabled = false; }
        };
        const close = document.createElement('button'); close.textContent = 'Close guide'; close.onclick = () => panel.remove();
        const area = document.createElement('textarea'); area.className = 'supporting-preview-body'; area.readOnly = true; area.value = text; area.setAttribute('aria-label', 'Guide text');
        copy.onclick = async () => { try { await navigator.clipboard.writeText(text); copy.textContent = 'Copied'; } catch { area.focus(); area.select(); statusText.textContent = 'Press Ctrl/Cmd+C to copy the guide.'; } };
        panel.append(title, copy, save, close, area); document.body.append(panel); close.focus();
        panel.addEventListener('keydown', event => { if (event.key === 'Escape') panel.remove(); });
      } catch (error) { statusText.textContent = `Could not open guide: ${error.message}`; }

  }
  document.addEventListener('slides:guide', () => void showSyntaxGuide('SLIDES_GUIDE.md'));
  desktop.onMenuCommand(async ({ command, payload }) => {
    if (command === 'new-handout') return makeNewHandout();
    if (command === 'new-slides') return makeUntitledSlides();
    if (command === 'export-pptx') return exportSlidesPowerPoint();
    if (command === 'present-slides') return slideStudio.present();
    if (command === 'exit-presentation') return slideStudio.stopPresentation();
    if (command === 'open-file') return chooseFile();
    if (command === 'open-folder') return chooseFolder();
    if (command === 'open-recent') return openRecentPath(payload);
    if (command === 'open-recent-folder') return chooseFolder(payload);
    if (command === 'save') return saveCurrent();
    if (command === 'print') return printHandout();
    if (command === 'export-pdf') return exportHandout();
    if (command.startsWith('google-')) return googleCommand(command);
    if (command === 'toggle-answers' && !isSlideDocument()) return toggleAnswers();
    if (command === 'toggle-panel') return document.querySelector(`.panel-toggle[data-panel="${payload}"]`)?.click();
    if (command === 'wrap-lines') return setWrapLines(payload);
    if (command === 'show-whitespace') return setShowWhitespace(payload);
    if (command === 'set-layout' && !isSlideDocument() && layouts[payload]) { layoutSelect.value = payload; return render(); }
    if (command === 'set-theme' && !isSlideDocument() && ['default', 'classic', 'modern', 'spacious'].includes(payload)) {
      document.body.dataset.handoutTheme = payload;
      return render();
    }
    if (command === 'find') return showFind();
    if (command === 'slide-snippet' && isSlideDocument()) { slideStudio.insertSnippet(payload);if(payload==='table')return openSnippetDialog('table');return; }
    if (command === 'insert-snippet' && !isSlideDocument() && snippets[payload]) return insertSnippet(snippets[payload]);
    if (command === 'open-snippet-dialog' && !isSlideDocument() && ['question', 'rubric', 'columns', 'table'].includes(payload)) return openSnippetDialog(payload);
    if (command === 'open-handout-guide') return showSyntaxGuide(payload);
  });
  window.addEventListener("keydown", event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); saveCurrent(); } });
  window.addEventListener("beforeunload", event => { if (dirty) { event.preventDefault(); event.returnValue = ""; } });
}
