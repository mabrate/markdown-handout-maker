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
let showAnswers = false;
let questionCounter = 1;
let activeHandoutTitle = "handout";

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
    .replace(/\{\{space:(\d+)(?::(blank|box|dots))?\}\}/g, (_, count, style) => drawingSpaceMarkup(count, style));
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

function parseBlocks(markdown) {
  const cleaned = markdown.replace(/<!--([\s\S]*?)-->/g, "");
  const lines = cleaned.replace(/\r\n?/g, "\n").split("\n");
  const placeholders = [];
  const outLines = [];
  let questionNumber = 1;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { outLines.push(""); i++; continue; }

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
      while (i < lines.length && lines[i].trim() !== ":::") i++;
      const content = lines.slice(start, i).join("\n");
      const token = `@@BLOCK${placeholders.length}@@`;
      placeholders.push({ type: "question", attrStr, content });
      outLines.push(token);
      if (i < lines.length) i++;
      continue;
    }

    if (/^:::grid(?:\s+columns=(\d+))?(?:\s+(cards))?\s*$/.test(line.trim())) {
      const match = line.trim().match(/^:::grid(?:\s+columns=(\d+))?(?:\s+(cards))?\s*$/);
      const attr = { columns: match && match[1] ? match[1] : undefined, cards: !!(match && match[2]) };
      const start = i + 1; i++;
      while (i < lines.length && lines[i].trim() !== ":::") i++;
      const content = lines.slice(start, i).join("\n");
      const token = `@@BLOCK${placeholders.length}@@`;
      placeholders.push({ type: "grid", attr, content });
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
    return line;
  }).join("\n");
  const md = window.markdownit ? window.markdownit({ html: true }) : null;
  const rendered = md ? md.render(preprocessLegacyMarkdown(custommdSource)) : preprocessLegacyMarkdown(custommdSource);

  const renderedWithBlocks = rendered
    .replace(/@@LEGACY_BR_(\d+)@@/g, (_, index) => '<br>')
    .replace(/@@BLOCK(\d+)@@/g, (_, indexText) => {
    const index = Number(indexText);
    const block = placeholders[index];
    if (!block) return "";

    if (block.type === "pagebreak") {
      return '<div class="handout-pagebreak" aria-hidden="true"></div>';
    }

    if (block.type === "wrap") {
      const innerBlocks = parseBlocks(block.content);
      const wrappedHtml = innerBlocks.map(blockItem => blockItem.html).join("");
      return `<section class="text-wrap">${wrappedHtml}</section>`;
    }

    if (block.type === "grid") {
      const parts = block.content.split(/^:::cell\s*$/m).map(part => part.trim()).filter(Boolean);
      const cellHtml = parts.map(part => `<div class="grid-cell">${parseBlocks(part).map(blockItem => blockItem.html).join("")}</div>`).join("");
      const columns = Math.max(1, Math.min(4, Number(block.attr.columns) || 2));
      const cardClass = block.attr.cards ? " cards" : "";
      return `<div class="grid${cardClass}" style="--columns:${columns}">${cellHtml}</div>`;
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
        const number = questionNumber++;
        const promptHtml = renderTextBlock(prompt);
        qHtml += `<div class="question-prompt"><span class="question-num">${number}.</span>${promptHtml}</div>`;
      }

      if (choices.length) {
        qHtml += '<ul class="mc-choices">';
        for (const choice of choices) {
          const choiceHtml = inlineMarkdown(choice.content);
          const correctClass = (choice.isCorrect && showAnswers) ? " correct-answer" : "";
          qHtml += `<li class="mc-choice${correctClass}" data-correct="${choice.isCorrect ? "true" : "false"}">${choiceHtml}</li>`;
        }
        qHtml += '</ul>';
      } else {
        const linesCount = Number(attrs.lines) || 3;
        if (showAnswers && answerLines.length) {
          const answerHtml = parseBlocks(answerLines.join("\n")).map(blockItem => blockItem.html).join("");
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
const toggleAnswersBtn = document.querySelector('#toggle-answers');
if (toggleAnswersBtn) toggleAnswersBtn.addEventListener('click', () => { showAnswers = !showAnswers; toggleAnswersBtn.classList.toggle('active', showAnswers); toggleAnswersBtn.textContent = showAnswers ? 'Hide answers' : 'Show answers'; render(); });
document.querySelector("#print-button").addEventListener("click", () => {
  if (window.handoutDesktop) return window.handoutDesktop.print(activeHandoutTitle);
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

// Electron adds local-file editing around the existing renderer. The parsing,
// pagination, preview and print CSS above remain the single rendering path.
if (window.handoutDesktop) {
  const desktop = window.handoutDesktop;
  const tree = document.querySelector("#file-tree");
  const folderName = document.querySelector("#folder-name");
  const openFolderButton = document.querySelector("#open-folder-button");
  const newHandoutButton = document.querySelector("#new-handout-button");
  const saveButton = document.querySelector("#save-button");
  let selectedFile = null;
  let dirty = false;
  let folder = null;

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
      source.value = await desktop.readFile(node.path); selectedFile = node; currentHandoutTitle(); clearActive(); if (button) button.classList.add("active"); markDirty(false); render(); source.focus();
    } catch (error) { statusText.textContent = `Could not open file: ${error.message}`; }
  }
  async function saveCurrent() {
    if (!selectedFile) return false;
    try { await desktop.saveFile(selectedFile.path, source.value); markDirty(false); return true; }
    catch (error) { statusText.textContent = `Could not save: ${error.message}`; return false; }
  }
  function setAssets(assets) { assetMap.clear(); assets.forEach(asset => { assetMap.set(asset.relative, asset.url); assetMap.set(asset.relative.split("/").pop(), asset.url); }); }
  async function chooseFolder() {
    if (dirty && !window.confirm("Save changes to the current handout before changing folders?")) return;
    if (dirty && !await saveCurrent()) return;
    const next = await desktop.openFolder();
    if (!next) return;
    folder = next; selectedFile = null; source.value = ""; folderName.textContent = next.name; setAssets(next.assets); drawTree(); markDirty(false); render();
  }
  async function makeNewHandout() {
    if (!folder) return chooseFolder();
    const filePath = await desktop.newFile(); if (!filePath) return;
    const node = { type: "file", name: filePath.split(/[\\/]/).pop(), path: filePath, markdown: true };
    folder.tree.push(node); folder.tree.sort((a,b) => a.name.localeCompare(b.name)); drawTree(); await openFile(node, [...tree.querySelectorAll(".file-entry")].find(button => button.title === filePath));
  }
  source.addEventListener("input", () => { currentHandoutTitle(); markDirty(true); });
  openFolderButton.addEventListener("click", chooseFolder);
  newHandoutButton.addEventListener("click", makeNewHandout);
  saveButton.addEventListener("click", saveCurrent);
  window.addEventListener("keydown", event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); saveCurrent(); } });
  window.addEventListener("beforeunload", event => { if (dirty) { event.preventDefault(); event.returnValue = ""; } });
}
