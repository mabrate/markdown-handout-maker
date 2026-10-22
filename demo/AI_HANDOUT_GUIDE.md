# AI Guide for The Markdown Handout Maker

Use this guide when creating or revising a printable classroom handout for The Markdown Handout Maker. Treat the rules below as output requirements, not optional suggestions.

## Output and file conventions

- Return the complete handout as Markdown in one fenced code block unless I ask you to edit a file directly.
- Editable handouts and their nearby images belong in `content/handouts/`.
- Generated HTML and PDF files belong in `exports/handouts/`.
- Use the app layout selector, or the supported `layout` YAML setting below, for letter pages, half-sheets, duplicate half-sheets, packets, and booklet imposition.
- Write pages in normal reading order. Use explicit page breaks only when the content needs them.
- Keep the handout practical to revise later. Prefer short, independent sections over a layout whose parts depend on fixed numbering or fragile spacing.

Click an element in the handout preview to highlight its source Markdown and scroll the editor to it. List items and table rows select their own source; clicking an image also keeps its resize control available. Ctrl-click links (⌘-click on Mac) to open them in your browser.

### Preview settings

Click a supported element to open its contextual settings above the handout. The row stays visible while you scroll. Changes update the Markdown and support Undo; the controls do not appear in printing or PDF exports.

- **Images:** image path, alt text, width, and in-flow/left-float/right-float placement. Existing image titles and other attributes are preserved.
- **QR codes:** web URL, width, and placement. Use an `http://` or `https://` URL.
- **Questions:** points, answer-line count for short-answer questions, and a read-only teacher answer. Short-answer keys and marked correct choices appear in the settings even when answers are hidden in the handout. Missing keys show "No answer provided." Prompts, choices, correct-answer markers, IDs, and teacher answers remain in the source.
- **Grids:** column count, fractional widths such as `1/3,2/3`, and card borders. Changing the column count clears custom widths and reflows the existing cells.
- **Drawing and answer spaces:** height/line count, drawing style, and inline/new-line answer placement.
- **Markdown tables:** click a cell to change its column's alignment.

Image and QR widths accept `in`, `cm`, `mm`, `px`, or `%`, such as `2in` or `40%`. Leave width blank to restore automatic sizing. Clicking content inside a question or grid also shows the containing block's settings. Text and headings keep their click-to-source navigation without contextual controls. More complex content remains editable in the highlighted Markdown. Choose **Close settings** to dismiss the row.

## YAML front matter

An optional YAML block may appear at the first line of a handout. The app removes it from the preview, printout, and PDF:

```md
---
layout: letter
---
```

Use only these app-supported parameters:

| Parameter | Values and behavior |
| --- | --- |
| `layout` | `letter`, `letter-landscape`, `a4`, `half-portrait`, `half-landscape`, `half-duplicate-portrait`, `half-duplicate-landscape`, `booklet-letter`, or `booklet`. Selects the layout when the handout opens. |

## Required opening and heading structure

After any optional YAML front matter, start every handout with this student information line, before the first heading:

```md
**Name:** ____________________________________  **Period:** ______  **Date:** __________
```

Every handout must have a clear title and descriptive section headings.

- Use one unnumbered level 1 heading (`#`) for the handout title.
- Use unnumbered level 2 headings (`##`) for the major sections. Never put numbers such as `1.`, `Section 2`, or Roman numerals in level 1 or level 2 headings. Sections must remain easy to add, remove, and reorder.
- Use level 3 headings (`###`) sparingly for small subsections, usually only when a major section has about one to five short parts. These smaller headings may be numbered when the sequence matters.
- Do not manually number ordinary questions. Use `:::question` blocks so the app numbers them automatically.
- Use concise, student-friendly headings. Do not submit a worksheet that is only a stream of paragraphs and questions without headings.

## Classroom-writing priorities

- Write for the requested grade level, subject, time limit, and learning objective.
- Give students the information and directions they need without crowding the page.
- Favor editable text, predictable instructions, and visible response space.
- Keep a question and its answer area together when practical.
- Use checklists for tasks students must complete or verify. Do not imitate checkboxes with Unicode symbols, emoji, or an ordinary bulleted list.
- Avoid putting written-response questions in a column grid; narrow columns rarely provide enough writing room.
- Use QR codes and links to integrate iPads when a digital resource improves the activity. Briefly identify what students will open and what they should do there.
- Never invent a source, image filename, or web address. When browsing is available, verify a proposed link before using it.

## Checklist syntax — always use this form

Use the supported `:::checklist` block whenever the content is a checklist:

```md
:::checklist
- Read the design brief.
- Label the important measurements.
- Explain your strongest evidence.
:::
```

Each `-` item becomes a consistent empty printed checkbox. A regular Markdown list remains a bulleted list, so it is not an acceptable substitute for a checklist.

## Questions, answer areas, and teacher answers

Use a question block for questions that should be numbered automatically.

Multiple choice:

```md
:::question id=Q1 type=mc points=1
Which material best resists a pulling force?
- Paper
- String *
- Modeling clay
- Aluminum foil
:::
```

- Mark the correct choice with a trailing `*`. The marker does not appear in the student export.
- Do not type letters such as `(A)` or question numbers; the app supplies them.
- `id=` is optional. Use stable, unique IDs when an answer key or later revision may need them.
- `points=N` is optional and contributes to `{{total-points}}` and `{{grade}}`.

Short answer with a teacher key:

```md
:::question id=Q2 type=short points=2
Why does a wide base make a structure more stable?
:::answer
A wide base keeps the center of mass over the support area more easily.
:::
```

The app hides the `:::answer` content in the student view and provides a short writing area. **View → Toggle Answers** reveals the teacher answer.

For a prompt that does not need an answer key, use explicit writing space:

```md
Explain what you observed. {{lines:3:inline}}
```

Available response-space syntax:

```md
{{lines:3}}
{{lines:2:inline}}
{{space:5}}
{{space:5:box}}
{{space:5:dots}}
```

- `{{lines:N}}` creates full-width writing lines.
- `{{lines:N:inline}}` starts the first line after the prompt and continues later lines at full width.
- `{{space:N}}` creates blank working or drawing space measured in answer-line heights.
- `{{space:N:box}}` creates a rounded outlined area.
- `{{space:N:dots}}` creates a rounded dot-grid area.
- Use `<br>` or `<br><br>` only for small, intentional line breaks.

To show scoring totals, use `{{total-points}}` and `{{grade}}` where appropriate.

## Tables — use HTML by default

Do not use Markdown pipe tables unless I explicitly request one. AI-generated Markdown tables often produce poor column widths. Use an HTML table with a `<colgroup>` so I can adjust each width directly.

Use `class="worksheet-table"` for classroom tables. Percentages in the `<col>` elements should add up to 100%.

```html
<table class="worksheet-table">
  <colgroup>
    <col style="width: 25%">
    <col style="width: 45%">
    <col style="width: 30%">
  </colgroup>
  <thead>
    <tr>
      <th>Term</th>
      <th>Meaning</th>
      <th>Example or sketch</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Compression</td>
      <td>A force that pushes material together</td>
      <td></td>
    </tr>
    <tr>
      <td>Tension</td>
      <td>A force that pulls material apart</td>
      <td></td>
    </tr>
  </tbody>
</table>
```

Use truly empty `<td></td>` cells when students need handwriting space; the app gives empty worksheet cells extra height. Do not fill writing cells with underscores, `<br>` tags, or placeholder text. Use `<thead>`, `<tbody>`, `<tr>`, `<th>`, and `<td>` consistently. Choose widths according to what students must write, not according to heading length.

HTML tables are also preferred for rubrics, comparison charts, observation logs, schedules, and compact sets of prompts. Add a specific class when a table needs custom styling, for example `<table class="worksheet-table observation-table">`.

## Columns and cards

Use a grid for short parallel content, vocabulary cards, examples, or side-by-side reference material. Use one to four columns.

Equal columns:

```md
:::grid columns=2
:::cell
First column
:::cell
Second column
:::
```

Outlined cards:

```md
:::grid columns=2 cards
:::cell
First card
:::cell
Second card
:::
```

Proportional columns:

```md
:::grid widths=1/3,2/3
:::cell
Narrow reference column
:::cell
Wide work area
:::
```

Supported patterns include `1/2,1/2`, `1/3,2/3`, `1/4,3/4`, and `1/4,1/4,1/2`. Start every cell with `:::cell` and use one final `:::` to close the grid. Do not add a separate closing marker for each cell.

Blocks such as checklists, questions, wraps, and nested grids may go inside a cell, but keep the result simple enough to print reliably. Do not use columns merely to squeeze too much content onto one page.

## Images and wrapped text

Use a relative filename and descriptive alternative text:

```md
![Labeled diagram of a truss bridge](truss-bridge-diagram.png){width=3.2in}
```

Supported width units include `in`, `cm`, `mm`, `px`, and `%`.

Wrap short text around a floated image when it improves the page:

```md
:::wrap
![Labeled diagram of a truss bridge](truss-bridge-diagram.png){.float-right width=2.2in}

A truss uses connected triangles to distribute forces through a structure.

Look for members in tension and compression as a load is added.
:::
```

Use `.float-left` to place the image on the other side. Keep a `:::wrap` short enough to fit on one printed page.

Recommend a custom image when a diagram, process sequence, map, labeled specimen, visual comparison, or example/non-example pair would materially improve understanding. Make the recommendation specific: describe the subject, labels, viewpoint, style, and intended placement. If the asset does not exist, do not insert a fictional filename into the final handout. Instead, give the image recommendation in a short note after the handout code block.

## QR codes and relevant links

QR codes are generated locally as print-sharp SVG graphics:

```md
[qr:https://example.com]{width=1.25in}
```

They can float with nearby explanatory text:

```md
:::wrap
[qr:https://example.com/activity]{.float-right width=1.25in}

**Interactive bridge simulation**  
Open the simulation on your iPad. Change the load and observe which structural members experience the greatest force.
:::
```

Recommend a QR link when a specific, relevant resource would add real value: a simulation, primary source, short demonstration, museum object, accessible reading, collaborative tool, data-collection form, or teacher-approved reference. Design the surrounding directions as part of an intentional iPad workflow: tell students what to open, what to observe or create, and what evidence to record on the worksheet. Prefer touch-friendly, stable, reputable, student-appropriate pages. Verify the exact URL when possible; otherwise recommend the resource without inventing a URL.

When students may view the worksheet itself on an iPad, include a descriptive clickable text link as well as a QR code when practical; scanning a code displayed on the same device is inconvenient.

## Page breaks and print planning

Force a new printed page with:

```md
:::pagebreak
```

Use page breaks intentionally between major activities, student and teacher sections, or packet pages. Do not add them merely because the source looks long; preview and pagination determine the actual printed result. Keep booklet content in normal reading order because the app handles imposition.

## Custom HTML and CSS

Use custom HTML and CSS when they make the handout clearer or more editable than the built-in syntax. Good uses include adjustable tables, callout boxes, compact labels, diagrams made from simple boxes, and small page-specific spacing fixes. Keep the HTML semantic and printable.

Place document-specific CSS in a `<style>` block and scope every selector to `.handout-page` so it cannot affect the editor interface:

```html
<style>
.handout-page .safety-note {
  border: 2px solid #8a3b12;
  border-radius: .08in;
  padding: .1in .14in;
  background: #fff7ed;
}

.handout-page .observation-table col:nth-child(1) { width: 22%; }
.handout-page .observation-table col:nth-child(2) { width: 48%; }
.handout-page .observation-table col:nth-child(3) { width: 30%; }
</style>
```

Use the built-in syntax when it already solves the problem. Do not add ornamental CSS or JavaScript. Custom HTML and CSS should support the worksheet's instructional purpose and remain compatible with printing. Avoid fixed heights that may clip student text. Prefer inches for print-specific measurements and percentages for table columns.

## Final quality check for AI

Before returning a handout, confirm all of the following:

:::checklist
- The Name, Period, and Date line appears before the title.
- The handout has one clear level 1 title and useful level 2 section headings.
- Level 1 and level 2 headings are not numbered.
- Ordinary questions are in `:::question` blocks and are not manually numbered.
- Every true checklist uses `:::checklist`, not symbols or ordinary bullets.
- Every table is HTML with explicit, sensible column widths unless I requested Markdown.
- Empty student-writing cells use `<td></td>`.
- Writing and drawing tasks have enough visible response space.
- Images use relative filenames, descriptive alt text, and intentional sizes.
- QR links are specific, relevant, student-appropriate, and include clear directions for the iPad activity.
- Custom CSS is scoped to `.handout-page` and supports the instructional layout.
- Major sections can be added, removed, or reordered without renumbering the handout.
:::

## Starter structure

Use this as a starting point, then adapt it to the actual assignment rather than filling it mechanically:

```md
**Name:** ____________________________________  **Period:** ______  **Date:** __________

# Clear Handout Title

One brief sentence stating the purpose or learning target.

## Background or directions

Provide only the information students need to begin.

## Main activity

:::checklist
- Complete the first required task.
- Record evidence or observations.
- Review the work before turning it in.
:::

:::question type=short points=2
Ask a focused question that checks the learning target.
:::answer
Provide the concise teacher answer.
:::

## Reflection or close

Ask for individual evidence of learning. {{lines:3:inline}}
```

My handout request follows:

## Embedded videos

Use a standalone line for a YouTube video or a local video file:

```md
[youtube:https://www.youtube.com/watch?v=M7lc1UVf-VE]

[youtube:https://youtu.be/M7lc1UVf-VE?t=30]{width=5in start=30}

[video:media/garden-tour.mp4]{width=5in}
```

- Insert these from **Snippets → YouTube Video** or **Local Video**. Replace the example URL or filename.
- YouTube supports watch/share/Shorts/embed URLs and bare video IDs. Click **Load YouTube video**, then use its player. An internet connection and a video that permits embedding are required. The app uses YouTube's privacy-enhanced player and does not load it until clicked.
- `start` is an optional YouTube start time in whole seconds (0–86400). A URL's `t` or `start` value is used when the explicit setting is absent.
- `width` accepts `in`, `cm`, `mm`, `px`, or `%`. Leave it out for the available column width. Videos use a 16:9 player area.
- Local filenames are relative to the Markdown file and must resolve inside the open lesson folder. Use `%20` for spaces, or insert the video from its file-browser preview. MP4 is recommended; M4V, WebM, OGV/OGG, and MOV are also recognized, with playback depending on the file's codecs and the platform.
- Click a video in the file browser to preview it, then choose **Insert video**. Local playback works offline and does not copy the video into Markdown. Keep the video with the lesson files when sharing.
- Printed handouts and PDFs show a reference card with the YouTube URL or local filename instead of an interactive player. Video syntax inside fenced code remains literal.
