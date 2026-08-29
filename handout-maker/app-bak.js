const source = document.querySelector("#source");
const preview = document.querySelector("#preview");
const statusText = document.querySelector("#status");
const pageCount = document.querySelector("#page-count");
const layoutSelect = document.querySelector("#layout-select");
const previewPanel = document.querySelector(".preview-panel");
const assetMap = new Map();
let renderTimer;
let liveSourceVersion = null;
let liveAssetMode = false;
let liveAssetVersion = "";

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

source.value = example;

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function inlineMarkdown(text) {
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
    .replace(/\{\{space:(\d+)(?::(blank|box|dots))?\}\}/g, (_, count, style) => drawingSpaceMarkup(count, style));
  return `<div class="paragraph">${html}</div>`;
}

function parseBlocks(markdown) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let i = 0;
  const add = (html, forcedBreak = false) => blocks.push({ html: `<div class="handout-block">${html}</div>`, forcedBreak });

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (/^:::pagebreak\s*$/.test(line.trim())) { blocks.push({ forcedBreak: true, html: "" }); i++; continue; }

    if (/^:::wrap\s*$/.test(line.trim())) {
      i++;
      const wrapped = [];
      while (i < lines.length && lines[i].trim() !== ":::") wrapped.push(lines[i++]);
      if (i < lines.length) i++;
      const wrappedHtml = parseBlocks(wrapped.join("\n")).map(block => block.html).join("");
      add(`<section class="text-wrap">${wrappedHtml}</section>`);
      continue;
    }

    const gridStart = line.trim().match(/^:::grid(?:\s+columns=(\d+))?(?:\s+(cards))?\s*$/);
    if (gridStart) {
      const columns = Math.max(1, Math.min(4, Number(gridStart[1]) || 2));
      const cardClass = gridStart[2] ? " cards" : "";
      i++;
      const cells = [];
      let current = [];
      while (i < lines.length && lines[i].trim() !== ":::") {
        if (lines[i].trim() === ":::cell") {
          if (current.length) cells.push(current.join("\n"));
          current = [];
        } else current.push(lines[i]);
        i++;
      }
      if (current.length) cells.push(current.join("\n"));
      if (i < lines.length) i++;
      const cellHtml = cells.map(cell => `<div class="grid-cell">${parseBlocks(cell).map(block => block.html).join("")}</div>`).join("");
      add(`<div class="grid${cardClass}" style="--columns:${columns}">${cellHtml}</div>`);
      continue;
    }

    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      const language = fence[1]; const body = []; i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) body.push(lines[i++]);
      if (i < lines.length) i++;
      add(`<pre><code${language ? ` data-language="${escapeHtml(language)}"` : ""}>${escapeHtml(body.join("\n"))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) { const level = heading[1].length; add(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`); i++; continue; }
    if (/^---+\s*$/.test(line)) { add("<hr>"); i++; continue; }

    if (/^\s*([-*+])\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      const ordered = /^\s*\d/.test(line); const items = [];
      const matcher = ordered ? /^\s*\d+[.)]\s+(.+)$/ : /^\s*[-*+]\s+(.+)$/;
      while (i < lines.length) {
        const match = lines[i].match(matcher);
        if (!match) break;
        items.push(`<li>${inlineMarkdown(match[1])}</li>`); i++;
      }
      add(`<${ordered ? "ol" : "ul"}>${items.join("")}</${ordered ? "ol" : "ul"}>`);
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^>\s?/, ""));
      add(`<blockquote>${renderTextBlock(quote.join("\n"))}</blockquote>`);
      continue;
    }

    const paragraph = [line]; i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,6})\s|^```|^:::|^\s*([-*+])\s+|^\s*\d+[.)]\s+|^>\s?/.test(lines[i])) paragraph.push(lines[i++]);
    add(renderTextBlock(paragraph.join("\n")));
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
  applyLayout();
  paginate(parseBlocks(source.value));
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
  source.value = await markdownFile.text();
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
document.querySelector("#print-button").addEventListener("click", () => window.print());
document.querySelector("#export-button").addEventListener("click", async () => {
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
      source.value = handout.content;
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
