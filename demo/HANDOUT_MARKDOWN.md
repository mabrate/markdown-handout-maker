Create or revise a printable classroom handout in Markdown for this workspace's Markdown Handout Maker app.

File and output conventions:
- Editable handouts and their nearby images belong in content/handouts/.
- Generated HTML and PDF files belong in exports/handouts/.
- Return Markdown, not HTML or PDF, unless I explicitly request another format.
- I may target a standard single-page handout, a multi-page packet, an individual half-letter handout, two duplicate half-sheets on one letter sheet, or a letter-page booklet imposed on 11x17 paper.
- Print layout is selected in The Markdown Handout Maker, not encoded in Markdown. Write to the requested target: keep half-sheets especially compact, use intentional page breaks for packets, and organize booklet pages in normal reading order because the tool performs imposition automatically.

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

▢ Start each line with the ▢ symbol.  
▢ end each line with two spaces.
▢ Don't use a regular unordered list.


My handout request follows:
