# The Markdown Handout Maker

An offline-first desktop editor for creating printable classroom handouts from
Markdown. It combines a local file browser, Markdown editor, live paginated
preview, native printing, and PDF export in one Electron application for
Linux and macOS.

The Markdown Handout Maker keeps your source handouts in local folders. Google Drive export and Google Doc sync are optional; they upload a copy only when you choose a Google command.

## Features

- Open, create, edit, and save Markdown handouts from a local folder
- Preview letter, A4, half-sheet, duplicate-half-sheet, 8.5×11 booklet, and 11×17 booklet layouts
- Print natively, export a PDF, or export a PDF to Google Drive
- Export the handout Markdown and linked local assets together as a ZIP
- Sync a handout to a Google Doc with Push, Pull, and a phone QR link
- Use classroom-focused Markdown additions for answer lines, drawing spaces,
  images, grids, cards, and page breaks

## Quick start

Prerequisites: a current Node.js LTS release and npm.

```bash
git clone https://github.com/mabrate/handout-maker-desktop.git
cd handout-maker-desktop
npm install
npm start
```

### Ubuntu sandbox startup error

On Ubuntu 24.04 and later, AppArmor can block Electron's user namespaces. If
`npm start` aborts with `The SUID sandbox helper binary was found, but is not
configured correctly`, run this once from the checkout:

```bash
npm run setup:linux-sandbox
npm start
```

The setup prints and validates an AppArmor profile, then uses `sudo` to install
and load it. It allows user namespaces for only this checkout's Electron
executable, preserving Chromium's sandbox and Ubuntu's system-wide restriction.
The permission applies to any executable placed at that exact path, so keep the
checkout under your control. Preview the rule with
`npm run setup:linux-sandbox -- --print`. Re-run setup if you move the checkout;
ordinary dependency updates at the same path keep working. This setup is for
`npm start`, rather than installed AppImage or deb builds.

For dependency warnings, run `npm audit`. This project requires Electron
44.10.0 or later in the 44.x series to include the current security patches;
use `npm install` after pulling dependency updates.

In the app, choose **File → Open Folder…** to work with a folder of Markdown
handouts, or **File → Open File…** for one handout. Use **File → Save** or
Ctrl/Cmd+S to write changes back to the selected file. New handouts start with
`layout: letter` YAML, Name/Date/Period fields, and a level-one title. This starter
is also used when creating a handout from the file browser.

Choose **File → Export ZIP…** to share the current Markdown (including unsaved
edits) and its linked local images, videos, and other files. Save a new handout
first when prompted. The archive keeps the folders needed for relative links to
work after extraction, including links to assets in parent folders. Only linked
files are included; web links remain online links. Assets must use relative paths
inside the open folder. Missing or inaccessible assets stop the export with the
filename so you can fix the link before sharing.

## Unsaved-file recovery

The desktop app automatically keeps a local recovery copy of every unsaved tab,
including new handouts and slide decks. A green status strip confirms that the
drafts are protected; this does not save changes to the original Markdown files.
You can close the app and choose **Restore files** at the next launch. Recovery
also protects the latest draft after an unexpected app termination. The active
draft, editor selection, and scroll positions are retained. Local images remain
linked to their original files and need to stay available on disk.

If an original file changed on disk or is no longer available, its draft opens
as a separate unsaved `-recovered.md` copy. Save it to a location you choose.
Successful saves and explicit **Discard** choices remove the corresponding
recovery drafts. **Discard recovery** at startup removes all pending drafts;
it does not change the original files. Canceling a save keeps the recovery copy.

Recovery files live in the app's per-user data folder under
`recovery/unsaved-work.json`. They stay on this computer and are written
atomically, separately from your lesson folders. If recovery cannot be written,
a persistent warning asks you to save; closing then offers **Keep editing** or
**Close without recovery**. Starting another instance focuses the existing app
so two processes cannot overwrite the same recovery record.

When dragging an image into the Markdown editor, a blue caret marks where its
code will be inserted, including with line wrapping enabled. Images already in
the open folder are referenced directly rather than copied again. New slide
images start with a `3in` width that can be adjusted in the preview.

## Preview navigation

Click **Present** beside the preview page count to show the current handout
fullscreen with the editing panels hidden. Scroll normally, use arrow keys or
Page Up/Down, and enlarge the pages with **−**, **+**, or **Fit width**. Videos
remain playable. Click **Exit presentation** or press **Esc** to restore the
workspace, including panel widths and visibility, editor selection, and your
place in the handout. Presentation does not change the Markdown or save edits.

Click preview text to select its Markdown source. List items, nested items,
checklists, question choices, and Markdown table rows use their original source
locations, so repeated wording does not jump to the first occurrence. The editor
reveals the selected item's beginning with line wrapping accounted for.

Handout preview clicks also open contextual settings for images, QR codes,
questions, grids, drawing/answer spaces, and Markdown table column
alignment. The settings stay visible while scrolling, update Markdown, and support
Undo. They are hidden from printing and PDF exports. Image/QR widths accept units
such as `2in` or `40%`; leave width blank for automatic sizing. Nested content also
exposes its containing question and grid settings. Question settings show the teacher
answer or marked correct choices while student preview answers remain hidden.
Text and headings keep click-to-source navigation without contextual controls.

## File browser

Open a folder to browse its handouts and images. Select a folder, then use **+**
to create a handout or folder there; type its name inline and press Enter.
Press Escape to cancel. Right-click a folder or handout for creation actions.

Search above the tree filters filenames while keeping their parent folders visible.
The active handout is highlighted, and a dot marks open handouts with unsaved changes.
Opening a handout from a tab or Recent Files reveals its parent folder in the tree.

Drag any file onto a folder to move it, or right-click it and choose **Move to…**.
Drop onto the folder name above the tree to move a file to the root folder.
Moving a Markdown handout adjusts its relative image and link references while
keeping unsaved edits unsaved. Existing files are never replaced. Moving an image
or another supporting file does not rewrite links in other documents.

When leaving an edited handout, choose **Save**, **Discard**, or **Cancel**.
Switching between open tabs preserves their unsaved edits. Hover a web link in
the handout preview for the **Ctrl-click** hint (⌘-click also works on Mac).

## Google Drive and Google Docs

Google integration requires internet access and your own Google Cloud OAuth **Desktop app** client ID. In that Cloud project, enable the Google Drive API and Google Docs API, then configure its OAuth consent screen. In the app, open **File → Google Drive → Settings and sign in…**, paste the Desktop client ID, save it, and sign in through your system browser. The app requests the `drive.file` scope. Google may limit access while your consent screen is in testing mode.

- **Export PDF to Drive…** uploads the current print preview, and displays its link and QR code.
- **Sync to a Google Doc…** creates a Doc containing the saved Markdown as literal plain text, and links that local file to its Doc ID.
- **Push** saves the current handout, then replaces the linked Doc text with literal Markdown. It refuses to overwrite a Doc whose Drive version changed since the last sync.
- **Pull** replaces the local file with the literal text of the linked Doc. If the local file changed since the last sync, it saves a dated Markdown backup beside the handout before replacing it.
- **Google Doc link and QR…** displays the link and an offline-generated QR code. The phone needs internet and permission to open the Doc.

The Google Doc shows Markdown characters as ordinary text in Consolas; it does not render the handout layout. Google Docs may still alter text that you edit manually on a phone, so review a pull before relying on it for a classroom handout. The sync link is stored in per-user app settings; refresh tokens are encrypted with the operating system's secure storage when available. Sign-in lasts only for the current app session if secure storage is unavailable.

## YAML front matter

Choose **Settings…** beside the Markdown heading, or **File → Document settings…**.
The dialog separates document formatting from **Lesson info**. Choose suggested
lesson properties or add custom ones as text, lists, numbers, yes/no values, or
nested YAML. Only fields you fill in are added under `lesson-info`; unused
suggestions stay out of the file. Remove a field or clear its value to omit it.

**Apply** makes one undoable Markdown edit; **Cancel** leaves the document alone.
Save the file normally afterward. **Show YAML** selects the frontmatter for
direct editing. Existing comments and other metadata are retained. Invalid YAML
must be corrected before applying settings.

Put an optional YAML block at the very beginning of a handout. The app removes it
from the printed preview and PDF:

```md
---
layout: letter
lesson-info:
  title: Exploring food webs
  audience: Grade 7 science
  learning-goals:
    - Describe relationships within a food web.
  duration-minutes: 25
  materials:
    - Species cards
    - String
---
```

| Parameter | Values and behavior |
| --- | --- |
| `layout` | `letter`, `letter-landscape`, `a4`, `half-portrait`, `half-landscape`, `half-duplicate-portrait`, `half-duplicate-landscape`, `booklet-letter`, or `booklet`. Sets the page layout. The dialog, source, and View menu update the same setting. |
| `lesson-info` | Optional nested information about the activity; it does not change the printed content. Custom properties belong inside this mapping. |

Suggested lesson fields are `title`, `audience`, `assignment`, `learning-goals`,
`success-criteria`, `prior-knowledge`, `duration-minutes`, and `scaffolding`.
Lists use one item per line in the dialog. All fields are optional; a plain
handout does not acquire a lesson template automatically. Slide decks use the
same Lesson info section, alongside their theme and aspect ratio settings.

Run `node tests/test-document-settings.cjs` with the optional Playwright setup
for the native Electron editing and saving check. The offline YAML bundle and
license are committed in `renderer/vendor`; regenerate them with
`npm run build:yaml` after updating the YAML dependency.

## Build and test

```bash
# Run automated checks
npm test

# Build an unpacked application for the current platform
npm run package

# Create distributable artifacts for the current platform
npm run dist
```

Build macOS artifacts on macOS for the most reliable signing and notarization
workflow. Generated `dist/`, `node_modules/`, and `.gguf` files are ignored by
Git.

## Project layout

```text
electron/          Electron main process, isolated preload bridge, and filesystem services
renderer/           Renderer, styles, preview logic, and bundled Markdown support
demo/              Example handouts and the Handout Markdown authoring guide
tests/             Focused Node-based checks
```

## Handout syntax and examples

- Start with [the example handout](demo/example-handout.md).
- See [the handout Markdown guide](demo/HANDOUT_MARKDOWN.md) for supported Markdown
  extensions, YAML settings, and classroom layout patterns.

## Contributing

Keep changes cross-platform and offline-friendly. Do not commit generated
application builds or dependencies. Run `npm test` before opening a
pull request.

### Preview navigation regression check

With Playwright and its Chromium browser installed, run
`node tests/test-preview-navigation.cjs`. For an existing browser installation,
set `CHROME_PATH` to its executable. `PLAYWRIGHT_MODULE` optionally selects an
existing Playwright package. This check uses a mocked desktop bridge; native
macOS focus and selection behavior should also be checked in the packaged app.

With the same browser setup and `pdftotext` installed, run
`node tests/test-handout-settings.cjs` to check contextual handout editing,
Undo, nested blocks, duplicate sheets, and the absence of controls in PDFs.

### Other files and ZIP archives

The file browser shows all non-hidden file types. Double-click a file such as a
CSV, PDF, or spreadsheet (or select it and press Enter) to open it in the system's
default app. CSV files open in Excel if Excel is your Mac's default CSV app.
Markdown and images keep their existing in-app editing and preview actions.

Right-click any file or folder for **Show in Finder** and **Open in default app**
(or **Open in Finder** for folders). Right-click the folder name above the tree
for the same folder actions. On Linux, these actions use the default file manager.

Right-click a ZIP and choose **Extract ZIP** to extract beside the archive into
a fresh folder. If that name exists, a numbered folder is created. The archive
stays intact and the extracted folder appears in the tree automatically. Damaged,
encrypted, unsafe-path, and symlink archives are rejected; partial output is
removed on failure. Extraction is limited to 512 MB and 10,000 entries.

The optional `node tests/test-file-browser-external.cjs` browser check uses the
same Playwright setup as the preview navigation regression check. Native Finder
and default-app launches still need a check on the target operating system.

### Automatic file browser refresh

The open folder is checked every two seconds while the app is visible, and again
when you return to the app. Added, removed, and renamed files update automatically;
open handout text and unsaved edits are preserved. Refresh waits while you type
a new file or folder name.

Expanded subfolders are remembered separately for each folder across sessions.
New folders start collapsed. Search expansion is temporary; revealing an active
handout can still expand its parents.

Drag a subfolder by its name onto another folder to move it and all its contents.
Drop onto the folder name above the tree or empty tree space to move it back to
the open root. Folders also have a **Move to…** action in their right-click menu.
Open tabs and expanded subfolders follow the move, unsaved edits stay unsaved,
and relative links inside moved handouts keep pointing to their resources.
Moves cannot replace an existing item or put a folder inside itself.

Run `node tests/test-folder-moves.cjs` with the optional Playwright setup to check
folder moves in Electron using a temporary folder and an isolated app profile.

Run `node tests/test-file-browser-refresh.cjs` with the optional Playwright setup
described above to check automatic refresh and expansion persistence.

### Teaching materials and clipboard paste

- **Help → AI Handout Syntax Guide** opens the bundled AI authoring guide in a
  read-only pane. **Copy entire guide** copies it for use in another application.
  **Save as…** saves a Markdown copy wherever you choose for your AI agent.
  Both Help guides work offline and leave your current handout and folder open.
- Drag images and supporting files from the file browser into another app's file
  drop area. All files, including Markdown, drag directly from their filenames.
  Drop onto a folder in the app to move it. Dragging out sends the saved file;
  unsaved edits stay in the editor. Export a PDF first when you need a PDF.
- Click a supporting file to preview it. PDF uses the built-in viewer; DOCX shows
  text; XLSX, CSV, and TSV show tables. XLSX previews include up to 30 sheets,
  200 rows and 40 columns per sheet, using saved formula results. Text previews
  show up to 500,000 characters. Previews accept files up to 20 MB, with a 64 MB
  expanded-size limit for Office documents. Legacy DOC/XLS files and other formats
  offer **Open in default app**. Double-click and Enter retain the default-app action.
- Paste from Google Docs, Word, Sheets, or Excel into the Markdown editor to
  convert headings, bold, italic, lists, web links, and tables into editable Markdown.
  Tab-separated clipboard data also becomes a table. Plain-text paste remains
  available through the system's paste-as-plain-text command. Complex document
  layouts, merged cells, and spreadsheet formulas are not reproduced by paste.

Native drag-and-drop depends on the receiving application's upload area; verify
it with your browser and Canvas installation on the target operating system.

Run `node tests/test-app-lifecycle.cjs` with the optional Playwright setup to check
native Electron startup and clean shutdown using a temporary app profile.

## Markdown slideshows

Choose **File → New Slide Deck**. Each document declares its own mode with
`type: slides` in its opening YAML. Existing handouts keep their normal controls.

```markdown
---
type: slides
theme: classroom
aspect: 16:9
---

# Lesson title

A short introduction.

---

# Investigate

:::columns
:::column
- Observe the example.
- Test an idea.

:::column
![Evidence](images/example.png)
:::

:::notes
Teacher reminders and answers belong here.
:::
```

Use `---` between slides and `:::columns` / `:::column` / `:::` for side-by-side
content. Optional `widths=1/3,2/3` sets column proportions. `:::center` centers a
content block. There is no slide layout selector.

Use `:::background` around one Markdown image for a full-slide, cropped background.
Use `:::text x=10% y=65% width=80% size=54 color=white` around text to position it
over the image. Optional background overlays improve contrast. Click positioned
text to reveal Move and Width handles; dragging updates the Markdown. Both blocks
work in presenting, PDF, and editable PowerPoint export. Click a background or text
block, or put the editor cursor inside it, to open contextual settings for image
cropping, overlays, text size, color, fonts, alignment, and position. Use
**Slides → Snippets** for Columns, Background, Text, Notes, QR code, and Table.
See the slide guide for the full syntax and examples.

Only the current slide is shown in the preview. Move the editor cursor to another
slide, click a thumbnail, or choose **Previous slide** / **Next slide**. Drag thumbnails
to reorder complete slides and their notes directly in the Markdown. Undo/Redo is
available from the preview; Alt+Shift+Left/Right moves a focused thumbnail. Templates
include Blank content, Bell-ringer, Fullscreen image with text, and Title slide,
all ordinary editable Markdown. QR codes and image widths use the handout syntax;
resize them proportionally in the preview. Markdown tables remain native editable
PowerPoint tables, and checklists and grid/cell blocks are also supported.
Themes are Classroom, Light, and Dark, with 16:9 or 4:3 aspect ratios.

**Present** displays only the slide, hiding app menus and navigation controls.
Click/tap, arrow keys, Space, and Page Up/Down navigate; Home/End jump to the first
or last slide. Shift-click or right-click goes back. Escape exits and restores
editing and menus.

**Export PowerPoint…** exports editable text, tables, images, and speaker notes.
PNG, JPEG, GIF, and SVG are supported; convert WebP to PNG first. Images must be
local to the lesson folder; export does not download website images. PowerPoint
changes do not sync back into Markdown. **Export PDF…** and printing include the
entire deck, one slide per page. Notes, editor controls, and warnings stay out of
the projected slides and PDFs. Review warnings before sharing.

The slide parser, shared geometry, preview, stylesheet, and exporter are separate
from handout parsing and pagination. The example is in
[demo/example-slides.md](demo/example-slides.md). **Help → Slide Syntax Guide**
opens the [guide](demo/SLIDES_GUIDE.md), including Copy and Save as actions for an AI
agent. Keep image files beside the deck or in a nearby image folder when sharing.

`npm test` includes slide parsing, layout blocks, editable PowerPoint objects,
notes, and image-path checks. Optional checks use the Playwright setup above:

```bash
node tests/test-slides-browser.cjs
node tests/test-slides-electron.cjs
```

The native check requires Poppler's `pdfinfo` and `pdftotext` to verify complete
PDF export and notes exclusion. Check the PowerPoint file on the target computer
before teaching, since fonts and line wrapping can differ.

## Embedded videos

Handouts and slides accept `[youtube:URL]` and `[video:media/clip.mp4]` on their
own lines, optionally followed by `{width=5in}`. YouTube also accepts `start=30`
in seconds. Use the corresponding Snippets menu entries, or preview a local
video in the file browser and choose **Insert video**. YouTube loads on click;
local videos play offline from the open lesson folder. MP4 is recommended;
other recognized video formats depend on platform/codec support.

Players work in slide presentation mode without advancing the slide when used.
PDFs and printing show reference cards. PowerPoint exports embed local video
files and include YouTube online video objects; check playback in the intended
PowerPoint version. The syntax guides include examples and export details.

Video regressions: `node tests/test-videos-browser.cjs` (Chrome/Playwright and
`pdftotext`) and `node tests/test-videos-electron.cjs` (Electron/Playwright).
Both accept `PLAYWRIGHT_MODULE`; browser checks also accept `CHROME_PATH`.
Local playback is tested with a one-second generated green WebM fixture; the
browser YouTube test uses a mock frame. YouTube's app identity header follows
[the embedded-player requirements](https://developers.google.com/youtube/terms/required-minimum-functionality#api-client-identity-and-credentials).

Slide preview clicks keep keyboard focus in the preview while highlighting the
matching Markdown. Previous/Next and outline clicks also support arrow navigation.
The **Two columns: text + image** template and **Auto layout** help arrange
one-image slides; Auto layout writes editable columns and preserves teacher notes.
Flowing images preserve their proportions and fit the available column height as
well as width. The slide guide includes layout rules for AI-generated decks.

Preview selection regression checks: `node tests/test-slide-preview-selection.cjs`
uses a 28-slide deck to check persistent source highlights, numbered/next slide
navigation, and delayed editor-selection events. Set `NATIVE_ELECTRON=1` to run
the same checks in Electron; the browser version accepts `CHROME_PATH`.

### Slide footer blocks

Place a footer block anywhere within a slide. Each image or paragraph gets an
equal-width cell across the footer, in source order; separate paragraphs with a
blank line. Images preserve their proportions and text shrinks down to 8 pt
when necessary. Overlong text produces a warning.

```markdown
:::footer height=0.8 size=16 color=white background=navy persist=true
![School logo](images/logo.png)

Science · Ecosystems

Record evidence and explain your thinking.
:::
```

Options: `height` (0.25–2 inches, default 0.65), `size` (8–48 pt, default 16),
`color` and `background` (color name or #RRGGBB), `padding` (0–0.5 inches, default
0.12), `gap` (0–1 inches, default 0.25), and `align=left|center|right` (applies to text
and images within their cells; defaults to left). Source order is preserved even
when an image and text share a paragraph. Default
text color follows the theme and the background is transparent.

`persist=true` carries the footer to later slides until replaced by another
persistent footer. A footer without persistence applies only to its own slide,
then the earlier persistent footer resumes. `:::footer hidden=true` with a
closing `:::` hides it on one slide; add `persist=true` to stop it on later
slides as well. `overlay=true` overlays artwork instead of reserving space
above the footer. Manually positioned text remains at its specified position.

Custom footers replace the automatic slide number. They appear in preview,
presentation, PDF, and editable PowerPoint exports. Footer contents support
ordinary Markdown paragraphs (including bold, italic, links) and images.

### Edit images in bundled Vector Lab

Right-click a local PNG, JPG, or SVG in the preview or file browser and choose
**Edit in Vector Lab**. The standalone editor opens in its own window and works
offline. **Save back to slideshow** updates the original image and refreshes
the preview; every slide using that file updates. You are prompted before
replacing the image. Closing with unsaved changes asks before discarding them.
Images changed externally must be reopened before saving.

SVG objects and editable PNG artwork reopen for editing. Ordinary PNGs open as
a single raster image. SVGs must contain embedded images rather than external
image links. JPG edits save back as JPEG; layers are flattened. Use Save SVG in the editor
to keep a separate editable copy. GIF and WebP are not yet offered.
The bundled editor is a snapshot, updated separately from the live website.
Source and rebuild instructions are in `vendor/vector-lab/README.handout.md`.

Choose **Draw image…** beside Document Settings to open a blank Vector Lab
canvas. **Insert into document** saves an SVG inside the lesson folder and
inserts its Markdown image reference into the originating open document.

When editing a JPG, choose **Replace with editable PNG** in **Save image format**
to save an editable PNG and replace matching image references across all open
documents. These document changes remain unsaved until you save them. The
original JPG is kept for closed documents that may still reference it. Existing
PNG files are never silently overwritten during conversion.
