# Classroom Handout Maker

A dependency-free browser tool that turns Markdown into consistently formatted, printable classroom handouts. It runs directly from a folder: no server, account, build step, or installation is required.

## Desktop application

This repository also contains an Electron desktop application for Linux and
macOS. It keeps the renderer in this folder and adds a local file browser,
editable Markdown files, live preview, native printing, and PDF export.

```bash
npm install
npm start
```

Choose **Open Folder**, select a Markdown file from the left panel, and use
**Save** (or Ctrl/Cmd+S) to write back to that same file. The most recently
chosen folder is remembered locally by the app. **Page Settings** is the layout
menu; it controls both the on-screen paper and the print/PDF output.

To make a distributable app on the current platform, run `npm run dist`.
Electron Builder is configured for Linux AppImage/Deb and macOS DMG targets.
Build macOS output on macOS for the most dependable signing/notarization path.

### Optional local AI

The desktop app includes optional local AI tools powered by `node-llama-cpp`.
No API key is required after setup. The first time you use **AI Tools**, open
**AI Settings** and choose **Download recommended model**. The app downloads the
model to its per-user data folder, verifies its SHA-256 checksum, and selects it
automatically. You can instead choose any compatible instruction-tuned `.gguf`
file with **Select another GGUF model**. The model is loaded only when an AI
action is run and reused for later actions.

Available actions include **Create Vocabulary Table**, **Create Vocabulary Table
with Examples**, and **Generate Multiple-Choice Distractors**. The vocabulary
actions insert editable HTML tables with `<col>` percentage widths, so adjust
the column proportions directly in the Markdown. Select Markdown in the editor before choosing an action. Results
are validated and shown in a preview dialog. The document is not changed until
you click **Insert/Replace**. If no model is installed, the rest of the desktop
application remains fully usable.

Add optional context to a handout's YAML front matter:

```markdown
---
ai_context: |
  This is a middle-school greenhouse lesson about seed starting.
  Prefer practical examples and short student-friendly language.
---
```

The **Generate Quiz Questions** action opens a form for question count, default
points, and additional teacher direction. It combines that information with
`ai_context`, previews the generated questions, and only inserts them after
approval.

## Use it

### Edit in a code editor with automatic preview

This is the recommended workflow. Python 3 is the only requirement:

From the workspace root:

```bash
python3 tools/handout-maker/preview.py tools/handout-maker/examples/example-handout.md
```

The command opens the Handout Maker in your browser. Edit the Markdown in VS
Code or another editor and save it; the browser checks for changes every 750
milliseconds and updates automatically. Relative images are loaded from the
Markdown file's folder. The preview retains its scroll position when it
updates.

Stop the preview server with `Ctrl+C`. Useful options:

```bash
# Choose another port
python3 tools/handout-maker/preview.py content/handouts/my-handout.md --port 8080

# Start without opening a browser
python3 tools/handout-maker/preview.py content/handouts/my-handout.md --no-open
```

The server listens only on `127.0.0.1`, so it is not exposed to other computers
on the school network.

### Use without a server

1. Download or clone this repository.
2. Double-click `tools/handout-maker/index.html` to open it in Chrome, Edge, or Firefox.
3. Choose **Open Markdown**, or choose **Open Folder** when the handout uses local images.
4. Edit the Markdown and review the visible 8.5 × 11 inch pages.
5. Choose **Print / PDF** to print or save a PDF. Choose **Save HTML** for a portable, already-paginated HTML copy.

The folder picker loads the first Markdown file it finds and embeds the folder's images in the preview and exported HTML. Opening a single Markdown file works best when it has no local images.

The **Handout syntax** menu at the bottom of the editor inserts templates at
the cursor for headings, questions, answers, drawing spaces, wrapped images,
grids, card columns, page breaks, and custom styles. Its table picker can
insert either a Markdown table or an HTML table. HTML tables include a
`<colgroup>`; change the percentage on a `<col>` to resize that column.

## Page sizes and print layouts

You can set a document's starting layout with YAML-style front matter at the
very top of the Markdown file:

```markdown
---
layout: letter-landscape
---

# My worksheet
```

The layout menu remains available for changing the layout manually after the
file opens. Supported values are `letter`, `letter-landscape`, `a4`,
`half-portrait`, `half-landscape`, `half-duplicate-portrait`,
`half-duplicate-landscape`, and `booklet`.

Choose a preset from the **Layout** menu:

- **Letter** — 8.5 × 11 inch portrait pages.
- **Letter landscape** — 11 × 8.5 inch pages.
- **A4** — 210 × 297 mm portrait pages.
- **Half letter portrait** — individual 5.5 × 8.5 inch pages.
- **Half letter landscape** — individual 8.5 × 5.5 inch pages.
- **Two portrait half-sheet copies** — puts two identical 5.5 × 8.5 inch
  portrait handouts side-by-side on a letter landscape sheet. Cut vertically
  along the dashed guide.
- **Two landscape half-sheet copies** — stacks two identical 8.5 × 5.5 inch
  landscape handouts on a letter portrait sheet. Cut horizontally along the
  dashed guide.
- **11×17 booklet** — writes letter-size content pages, pads the document to a
  multiple of four pages, and arranges them in booklet order on tabloid
  landscape sheet sides.

For booklet output, print on both sides of 11×17 paper using **short-edge
binding**, keep the browser scale at **100% / Actual size**, then fold the
printed sheets in half. The preview labels front and back sheet sides; those
labels are hidden when printing. On screen, each complete 11×17 sheet side is
automatically scaled to fit the preview area. This visual scaling does not
change the physical print dimensions.

For two half-sheet copies, each logical half-page is duplicated on the
appropriate letter sheet orientation. This produces two copies after cutting;
it does not create a duplex front and back.

## Custom syntax

### Answer lines

```text
What is photosynthesis?

{{lines:3}}
```

To begin the first answer line at the end of the question:

```text
Name the capital of France. {{lines:2:inline}}
```

The first line automatically fills all remaining width between the question and
the right page margin. Additional lines span the full content width. Answer
groups also include a small gap before the next paragraph or question.

### Drawing and working space

The size uses the same vertical measurement as answer lines. For example, each of
these is six answer-lines tall.

Blank space without a visible boundary:

```text
Draw a model of the water cycle.

{{space:6}}
```

A slightly rounded outlined box:

```text
{{space:6:box}}
```

A slightly rounded box with a light dot grid:

```text
{{space:6:dots}}
```

Drawing spaces may be from 1 to 30 lines tall. If a drawing space and its prompt
do not fit on the current page, the drawing-space block moves to the next page.

### Manual line breaks and blank lines

Use `<br>` wherever a manual line break is needed:

```text
First line<br>
Second line
```

Repeat it to add blank vertical space:

```text
Text above.
<br><br>
Text below.
```

`<br/>` and `<br />` are also accepted. Other raw HTML remains escaped.
For larger writing or drawing areas, prefer `{{lines:N}}` or `{{space:N}}`
because those forms provide more consistent printed sizing.

### Images with multi-paragraph text wrapping

Put an image and all paragraphs that should wrap around it inside a `:::wrap`
section:

```text
:::wrap
![Map of France](france.png){.float-right width=2in}

France is a country in Western Europe. This paragraph begins beside the image.

Its geography includes coastal plains, mountain ranges, and several major
river systems. This paragraph also wraps until the text passes the image.
:::
```

The image should come before the text that belongs beside it. Use `.float-left`
to place it on the left or `.float-right` to place it on the right:

```markdown
![Map of France](france.png){.float-left width=2in}
```

Allowed width units are `in`, `cm`, `mm`, `px`, and `%`. A wrap section is kept
together as one pagination block, so keep each section short enough to fit on
one page. Start another `:::wrap` section for the next page or topic.

### Grid

```text
:::grid columns=2
:::cell
Content in the left column
:::cell
Content in the right column
:::
```

Grids support one to four columns. Normal Markdown may be used inside cells.

Use proportional columns with comma-separated fractions:

```text
:::grid widths=1/3,2/3
:::cell
Narrow column
:::cell
Wide column
:::
```

Questions, answer blocks, image wraps, and nested grids can be placed inside a
cell. The syntax menu can generate Markdown or HTML versions of these layouts.

To render each cell as an outlined card with slightly rounded corners and
internal padding, add the `cards` modifier:

```text
:::grid columns=2 cards
:::cell
### Vocabulary
Key terms and definitions
:::cell
### Examples
Worked examples or reminders
:::
```

Cards in the same grid row stretch to equal height. Plain grids remain
borderless.

### Page break

```text
:::pagebreak
```

See `tools/AI Prompts/HANDOUT_MARKDOWN.txt` for a short prompt that can be given to an AI agent.

## Design decisions

- **Sharing:** A GitHub repository is the best source of truth. On a school computer, use GitHub's **Code → Download ZIP**, unzip it, and open `index.html`. Git is optional.
- **No server:** Everything runs locally in the browser. This reduces setup and works within typical school-computer restrictions.
- **Optional live-preview server:** `preview.py` provides automatic refresh for
  code-editor workflows while remaining local and dependency-free. The
  original no-server workflow remains available.
- **Output:** The live preview is generated on the fly. Nothing is stored unless **Save HTML** is selected. Browser printing can produce paper copies or PDF files.
- **CSS:** The project uses a bespoke, small stylesheet rather than a framework. This makes the printed result predictable, offline-capable, and easy to customize.
- **Google Drive:** Keep the project in a synced Google Drive for desktop folder and use it like any local folder. Direct Drive API access is intentionally not built in because it requires an internet connection, Google Cloud credentials, sign-in permissions, and often school administrator approval. A future hosted/PWA edition could add Google Picker and Drive API support.
- **Page preview:** The browser view renders discrete letter-size sheets and automatically moves whole content blocks to the next page. Very large single blocks are marked because they should be shortened or split manually.

## Customize printing

Edit the `.handout-page` rules in `styles.css`. Page size, padding, type size, answer-line and drawing-space sizing, grids, and image defaults are all kept there. The print rule uses CSS `@page { size: letter portrait; margin: 0; }`.

## Current scope

The built-in Markdown renderer supports headings, paragraphs, bold, italic, strikeout, links, images, block quotes, ordered and unordered lists, horizontal rules, and fenced code blocks. Raw HTML is escaped for safer offline use.
