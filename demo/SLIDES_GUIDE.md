# Markdown slide decks

Use this guide when an AI agent creates or revises presentations for The Markdown Handout Maker. Return one complete Markdown file and keep its images beside it or in a nearby images folder.

Separate slides with a line containing three dashes: `---`. Arrange content with `:::` blocks when needed. There are no slide layout types to select.

## Start a deck

Choose **File → New Slide Deck**, or create a `.md` file beginning with this YAML:

```markdown
---
type: slides
theme: classroom
aspect: 16:9
---

# Lesson title

A short introduction.

---

# Learning objective

We are learning to explain how evidence supports an idea.

- Observe carefully.
- Compare results.
- Explain your reasoning.

---

# Reflect

What changed your thinking today?
```

The opening YAML must be at the start of the file. Its opening and closing `---` lines are metadata boundaries; subsequent `---` lines separate slides. A separator inside a fenced code block or presenter notes remains literal content. Place separators outside columns and other content blocks, closing those blocks first.

Each slide can have a `#` title followed by ordinary Markdown content. Text, images, and tables flow down the slide. An image on its own fills the available area without changing its proportions. Add columns when text and an image should appear beside each other.

| YAML setting | Values |
| --- | --- |
| `type` | `slides` (required) |
| `theme` | `classroom`, `light`, `dark` |
| `aspect` | `16:9`, `4:3` |

Theme and aspect controls update the YAML. Ordinary Markdown files without `type: slides` remain handouts.

## Columns

Open a group with `:::columns`, start each column with `:::column`, and close the whole group with `:::`:

```markdown
# Compare the designs

:::columns
:::column
## Wide base

- Describe what happened.
- Identify supporting evidence.

:::column
## Narrow base

- Describe what happened.
- Identify supporting evidence.
:::

A short conclusion can follow the columns.
```

The example is one slide. A `:::column` marker starts a column; individual columns do not need closing markers. The final `:::` closes the entire group. Two to four columns work best. Columns can contain text, lists, small tables, images, or another content block.

Columns are equal width by default. Give one positive number or fraction per column to change the proportions:

```markdown
:::columns widths=1/3,2/3
:::column
A short explanation.

:::column
![Pond ecosystem](pond-example.svg)
:::
```

The **Columns** button inserts an editable example at the cursor. No layout selector is needed.

## Centered content

Use `:::center` to center a group horizontally:

```markdown
:::center
## Think before sharing

What evidence supports your explanation?
:::
```

Close every content block with `:::`. Blocks may be combined with ordinary paragraphs before or after them.

## Images and tables

Use real relative image filenames:

```markdown
![Pond ecosystem](images/pond.png)
```

Save the deck before pasting images into it. Pasted images are saved beside its Markdown file. Keep the deck and its images together when sharing. PowerPoint export supports PNG, JPEG, GIF, and SVG; convert WebP to PNG first. Export does not download website images. Do not invent image filenames. Avoid SVGs containing scripts or external resources.

Use small Markdown tables for data:

```markdown
| Design | Observation |
| --- | --- |
| Wide base | Record evidence |
| Narrow base | Record evidence |
```

Tables, text, and images export as editable PowerPoint objects. Bold, italic, web links, lists, and fenced code blocks are supported. Ctrl-click a preview link to open it in your browser (⌘-click also works on Mac).

Use Markdown and `:::` blocks rather than HTML/CSS. Handout directives such as questions, drawing spaces, and booklet settings are not presentation syntax. Separate slides with `---` and arrange content with `:::` blocks.

## Presenter notes

Notes belong to the current slide:

```markdown
:::notes
Give students two minutes to observe before discussing.
Teacher answer: look for both living and nonliving components.
:::
```

Notes are visible below the current slide preview and exported to PowerPoint's speaker notes. They stay out of the presentation display and slide PDFs. Close notes before starting the next slide.

## Preview and navigation

Only the current slide appears in the preview. Move the text cursor into another slide to preview it, click its title in the outline, or use **Previous slide** and **Next slide**. Click an empty part of the slide or Tab into the preview, then use Right/Down arrow for the next slide and Left/Up arrow for the previous slide. The counter identifies the current slide and total slide count.

Click a slide title, paragraph, bullet, image, table row, or code block in the preview to highlight its Markdown in the editor. The editor scrolls to reveal the selection. Ctrl-click a link (⌘-click on Mac) opens it in your browser.

**Add slide** inserts a `---` separator and the selected template after the current slide. Templates are ordinary editable Markdown:

- **Blank content:** a simple heading and content placeholder.
- **Bell-ringer:** a class topic, opening question, agenda, and private teacher notes.
- **Fullscreen image with text:** a cropped background, dark overlay, and movable white title. Set the image filename in its background settings.
- **Title slide:** a large, centered title and a separate subtitle. Both are independently movable and use the current theme's text color.

**Append slide** adds the selected template at the end of the deck, regardless of which slide you are editing.

Use **Slides → Snippets** to insert Columns, Background, Text, Notes, QR code, Table, Centered text, Checklist, or Card grid. **Fit text** wraps the current slide in an automatic fitting block. The syntax guide is under **Slides → Slide Syntax Guide**. These insertion and help buttons are kept out of the preview toolbar.

## Image backgrounds and positioned text

Use `:::background` for a full-slide image and `:::text` for text placed over it. These blocks are for slides. A background may appear anywhere in the slide's source; it is always behind the content. Text blocks are drawn above the normal flowing content, in source order.

```md
:::background position=center overlay=dark opacity=35
![Garden](garden.jpg)
:::

:::text x=10% y=65% width=80% size=54 color=white
**Garden Observations**
:::
```

A background block contains exactly one Markdown image. Use an image in the lesson folder, with the same relative filename rules as other slide images. The image fills the slide without stretching; extra edges are cropped. Omit the text block for an image-only slide. Background slides omit the automatic slide number.

Background options:

| Option | Values | Default |
| --- | --- | --- |
| `position` | `center`, `left`, `right`, `top`, `bottom`, `top-left`, `top-right`, `bottom-left`, `bottom-right` | `center` |
| `overlay` | `none`, `dark`, `light` | `none` |
| `opacity` | Overlay strength, 0–100 | 35 when an overlay is enabled |

`opacity=35` means a 35% dark or light overlay. The image itself stays opaque. Use one background per slide.

Text options:

| Option | Meaning | Default |
| --- | --- | --- |
| `x`, `y` | Top-left corner as percentages of the full slide, 0–100% | `10%`, `65%` |
| `width` | Text wrapping width, 1–100% of the full slide | `80%` |
| `size` | Font size in points, 8–144 | `54` |
| `color` | A basic color name such as `white`, `black`, `yellow`, or a hex color such as `#FFFFFF` | `white` |
| `align` | `left`, `center`, `right` | `left` |
| `font` | `Arial`, `Calibri`, `Georgia`, `Verdana`, `CourierNew` | `Arial` |

Text blocks support paragraphs, headings, lists, checklists, line breaks, bold, italic, code, and links. Headings inside a text block stay in that box and use its specified size. Lists remain native PowerPoint bullet or numbering paragraphs in a single text box. Put images, tables, and other layout blocks outside text blocks. Multiple text blocks can be positioned independently, with or without a background. Fonts must be available on the presentation computer; another font may be substituted there.

Use **Slides → Snippets → Background** or **Text** to insert these blocks. Replace the background's `image.jpg` placeholder with your image filename. Click positioned text in the preview to highlight its source and reveal **Move** and **Width** handles. Drag a handle to update the coordinates or width in Markdown. Escape cancels a drag; Undo reverses a completed change. Coordinates can also be edited directly in the source.

## Contextual settings

Click a background or text block in the preview, or place the editor cursor inside its Markdown block. A settings row appears above the slide:

- **Background:** image filename, crop position, overlay, opacity, and Remove background.
- **Text:** font size, color, font, alignment, left/top position, and wrapping width.
- **Image or QR code:** physical width, plus a proportional resize handle on the selected image.

Every change updates the Markdown, saves with the document, supports Undo, and carries through to PDF and PowerPoint. The settings row and resize handles stay out of presenting and exported documents. Click ordinary text, a heading, code, or a list and choose **Position freely** to convert it into a movable text block at its current position. A whole list moves together and retains native bullets. Positioned text overlays other content; flowing text can reflow after conversion, so review the arrangement.

## Shared handout elements

Slides accept the same Markdown images, QR codes, lists, emphasis, links, and Markdown tables used in handouts. For example:

```md
![Garden](images/garden.jpg){.float-right width=3in}

[qr:https://example.com/lesson]{width=1.5in}

| Observation | Count |
| --- | ---: |
| Plants | 12 |

:::checklist
- Observe carefully
- Record evidence
:::
```

Image and QR widths accept `in`, `cm`, `mm`, `px`, and `%`. Percentages refer to the containing column or slide content area. Dragging a resize handle writes a width in inches, preserves the image's proportions, and retains attributes such as `.float-right`. The width setting can also be edited directly. Local QR codes are generated offline, with the same HTTP/HTTPS URL checks as handouts, and export as sharp vector images. They do not fetch the linked page.

Markdown tables export as native editable PowerPoint tables. Use **Slides → Snippets → Table** for the table builder; slides use Markdown tables rather than HTML. Table cells can be edited in the source after clicking the corresponding preview row.

`:::grid` / `:::cell` are supported as aliases for columns, including fractional `widths=` values. `cards` draws editable card borders. `:::checklist` uses checkbox bullets, including in movable text blocks.

Slides place right-floated images at the right edge of their containing area. For text beside an image, use columns; slide text does not wrap around the bottom of a picture as handout text does. Worksheet questions, answer spaces, booklet settings, arbitrary HTML/CSS, and handout page breaks remain handout-specific. Slide boundaries use `---`.

Backgrounds, overlays, and positioned text work in preview, presenting, PDF, and PowerPoint. PowerPoint keeps the cropped background image, overlay rectangle, and each text box as separate editable objects. Preview clicks still highlight the source. Out-of-bounds text produces an overflow warning; move it, change its width or size, or use **Shrink text to fit**. Automatic column creation is disabled for slides with manually positioned content.

## Fix overflowing text

An overflow warning offers two actions for the current slide:

- **Shrink text to fit** automatically reduces text sizes as needed, down to 65% of their normal size. The title, body, and table text use the same scale; images retain their proportions and slide numbers keep their size. The warning remains if the content still cannot fit at that size.
- **Create columns** divides the body into two columns at a paragraph or list-item boundary. The title stays above the columns, and teacher notes stay private. This action is available when the body has at least two suitable parts and does not already have columns. Columns can still overflow; review the result and shorten or split the slide if needed.

Both actions update the editable Markdown and apply to the preview, presentation, PowerPoint, and PDF. Use Undo (Ctrl/Cmd+Z) to reverse a change. Fix incomplete blocks before using them.

Automatic fitting wraps all visible content on the slide in a `:::fit` block. Keep notes outside it. Remove the opening `:::fit` and its matching closing `:::` to restore normal text sizes.

```md
:::fit
# A crowded slide

- First observation
- Second observation
:::

:::notes
Private teacher reminders.
:::
```

## Present

**Present** hides the editor, app menus, and presentation controls. Only the slide is displayed, with letterboxing when the screen and slide proportions differ.

- Next slide: click/tap, Right/Down arrow, Space, or Page Down.
- Previous slide: Left/Up arrow, Page Up, Shift-click, or right-click.
- First/last slide: Home/End.
- Exit and restore the editor and menus: Escape.

There are no visible navigation menus or buttons during presentation. Presenter notes are not projected.

## Save and export

- **Save** saves the editable Markdown source.
- **Export PowerPoint…** exports the entire deck, including editable objects and speaker notes. Each list becomes one editable text box with native bullets or numbering, including nested items. Lists in separate columns remain separate text boxes. PowerPoint edits do not sync back into Markdown.
- **Export PDF…** and printing include every slide, one per page at the deck's aspect ratio, even though the preview displays only the current slide.
- The guide's **Copy entire guide** and **Save as…** actions let you share these instructions with an AI agent.

Review overflow and image warnings before exporting. Split crowded content into additional slides. Font rendering can differ between computers, so check the deck on the computer you will use for teaching.

## AI quality check

- Include the required YAML and separate slides with `---`.
- Use a clear `#` title on each slide where appropriate.
- Preserve the requested slide count, purpose, and student reading level.
- Use `:::columns` for side-by-side content; close every content block.
- Keep text brief and tables small enough to read on a projector.
- Put teacher reminders and answers in `:::notes`, not on the visible slide.
- Use real image filenames and descriptive alt text.
- Do not add custom HTML, CSS, layout attributes, animations, or invented image files.
