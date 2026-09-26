Create or revise a printable classroom handout in Markdown for this workspace's Markdown Handout Maker app.

File and output conventions:
- Editable handouts and their nearby images belong in content/handouts/.
- Generated HTML and PDF files belong in exports/handouts/.
- Return Markdown, not HTML or PDF, unless I explicitly request another format.
- I may target a standard single-page handout, a multi-page packet, an individual half-letter handout, two duplicate half-sheets on one letter sheet, or a letter-page booklet imposed on 11x17 paper.
- Choose print layout in the app, or set it with the optional `layout` YAML setting below. Write to the requested target: keep half-sheets especially compact, use intentional page breaks for packets, and organize booklet pages in normal reading order because the tool performs imposition automatically.

## YAML front matter

An optional YAML block at the first line of a handout controls its opening layout and adds context to local AI actions. It is removed from the preview, printout, and PDF:

```md
---
layout: letter
ai_context: |
  Subject: [subject]
  Grade: [grade]
  Learning goal: [learning goal]
---
```

| Parameter | Values and behavior |
| --- | --- |
| `layout` | `letter`, `letter-landscape`, `a4`, `half-portrait`, `half-landscape`, `half-duplicate-portrait`, `half-duplicate-landscape`, or `booklet`. Selects the layout when the handout opens. |
| `ai_context` | A quoted one-line value or an indented YAML block. Sends handout context with local AI requests. |

In addition to basic Markdown, The Markdown Handout Maker supports:

- Blank writing lines:
  {{lines:N}}
- Begin the first answer line after the question and extend it to the right margin:
  Question text {{lines:N:inline}}
- Blank drawing or working space measured in answer-line heights:
  {{space:N}}
- Rounded outlined drawing space:
  {{space:N:box}}
- Rounded dot-grid drawing space:
  {{space:N:dots}}
- Manual line breaks or small layout adjustments:
  <br> or <br><br>
- Explicit printed page break:
  :::pagebreak

Checklist block:

:::checklist
- Bring a notebook
- Record your observations
- Explain your evidence
:::

Each Markdown list item becomes a printed empty checkbox. Keep the checklist
items inside the block; the block is available from **Snippets → Basics →
Checklist**. A regular unordered list remains a regular bulleted list.

Wrap several paragraphs around a left- or right-floating image:

:::wrap
![Descriptive alternative text](image-file.png){.float-right width=2in}

The first paragraph begins beside the image.

Later paragraphs continue wrapping until they pass the image.
:::

Use .float-left for a left image. Image widths may use in, cm, mm, px, or %.

QR codes can float inside the same wrap block:

```md
:::wrap
[qr:https://example.com]{.float-right width=1.25in}

Text wraps beside the QR code. Use `.float-left` to place it on the other side.
:::
```

Create a one-to-four-column grid:

:::grid columns=2
:::cell
First column
:::cell
Second column
:::

Add rounded outlined cards with:

:::grid columns=2 cards
:::cell
First card
:::cell
Second card
:::

Use proportional columns with `widths=`. Widths are comma-separated fractions:

:::grid widths=1/3,2/3
:::cell
Narrow column
:::cell
Wide column
:::

Supported examples include `1/2,1/2`, `1/3,2/3`, `1/4,3/4`, and
`1/4,1/4,1/2`. Other `:::` blocks, including questions, answer blocks,
image wraps, and nested grids, may be placed inside a cell.

Tables and worksheet tables:

- Use a normal Markdown table for compact reference or response tables. Column
  alignment follows standard Markdown markers such as `:---`, `:---:`, and
  `---:`.
- Insert a worksheet table from **Snippets → Layout → Table…**. Choose
  Markdown for an editable Markdown table or HTML for fixed proportional
  columns. Generated body cells are intentionally blank and print with extra
  handwriting space.
- For HTML worksheet tables, use `<table class="worksheet-table">` and blank
  `<td></td>` body cells when you need fixed column widths and writing room.

Custom styling:

Add a `<style>` block when a handout needs a small, document-specific visual
adjustment. Styles are kept with the handout and apply to the printed preview;
scope selectors to `.handout-page` so they do not affect the editor UI.

```html
<style>
.handout-page h1 { color: #215b75; }
.handout-page .notice { border: 1px solid #215b75; padding: .1in; }
</style>
```

The **Snippets → Layout → Style Block** command inserts a starter block. Raw
HTML other than supported `<br>` and `<style>` blocks should be avoided; other
raw HTML is escaped by the renderer.

Authoring constraints:
- Keep questions and their answer areas together when practical.
- Use {{lines:N}} for written responses and {{space:N...}} for drawing or calculations.
- Keep each :::wrap section short enough to fit on one page.
- Use concise headings and predictable instructional language.
- Avoid raw HTML other than <br>; the renderer escapes other raw HTML. HTML comments (<!-- ... -->) are removed and do not appear in the rendered output.
- Avoid presenting questions in a grid layout. Use tables for that if the aim is to save space. There is not enough writing space for questions in a grid layout.
- Multiple consecutive spaces are preserved: runs of two or more spaces in the source are converted to non-breaking spaces so you can add extra spacing in a controlled way.
- Grid / column closing guidance: use `:::grid` with `:::cell` markers to separate cells and a single closing `:::` to end the grid. Do not rely on using a lone `:::` to "close" a cell — that is ambiguous. If you accidentally use `:::` to close a cell and then immediately write another `:::`, the parser will accept the double `:::` sequence (both are consumed), but the recommended, unambiguous pattern is shown below:

  :::grid columns=2
  :::cell
  First column content
  :::cell
  Second column content
  :::

If you prefer to terminate a cell, start the next cell with `:::cell` rather than closing the previous one with `:::`.

Question and answer-key syntax (teacher features)

- Multiple-choice questions can be authored with `:::question` blocks. Mark correct options with a trailing `*`; the student view labels choices with capital letters and the editor includes a "Show answers" toggle to reveal teacher-only highlights.

  :::question id=Q1 type=mc points=1
  Which gas do plants take in?
  - (A) O2
  - (B) CO2 *
  - (C) N2
  - (D) H2O
  :::

- The `id=` is optional; if omitted an internal numeric id is assigned. The `type=` helps future grading features — currently `type=mc` and `type=short` are supported.
- Use **View → Toggle Answers** to highlight the correct choice(s) in the preview. Correct markers (`*`) are stripped from the student-facing export.
- Short-answer questions use `type=short`. Provide the teacher answer inside an `:::answer` sub-block inside the `:::question` block. When "Show answers" is enabled the teacher answer is revealed in a handwritten font; otherwise a short answer area (a few lines) is shown for students.

  :::question id=Q3 type=short points=2
  What is the main source of energy for most ecosystems?
  :::answer
  Sunlight
  :::

- Use relative image filenames and keep those images with the Markdown file.
- Create a locally generated, print-sharp QR code by putting a complete web URL on its own line: `[qr:https://example.com]`.
- Set a QR code's printed width with the same attribute style as images: `[qr:https://example.com]{width=1.25in}`.

Scoring and rubrics

- Add `points=N` to a `:::question` block to include it in the document total.
- Use `{{total-points}}` to display the total points and `{{grade}}` to display a student grade box such as `____ / 10`.
- Rubrics generated by The Markdown Handout Maker are editable Markdown tables. Use one row per criterion with this pattern: `Criterion | Exceeds description | Meets description | Beginning description`.

## Personal Preference

### Name line at the top

Start each handout with this (before the level 1 heading):
**Name:** ________________________________  **Class:** __________  **Date:** __________

### Checklists

Prefer the `:::checklist` block described above. It produces consistent printed
checkboxes and is easier to edit than manually typed symbols.


My handout request follows:
