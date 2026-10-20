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
- Sync a handout to a Google Doc with Push, Pull, and a phone QR link
- Use classroom-focused Markdown additions for answer lines, drawing spaces,
  images, grids, cards, and page breaks
- Optional local AI tools for vocabulary tables, distractors, and quiz questions
- Download and verify the recommended local AI model, or choose your own
  compatible `.gguf` file

## Quick start

Prerequisites: a current Node.js LTS release and npm.

```bash
git clone https://github.com/mabrate/handout-maker-desktop.git
cd handout-maker-desktop
npm install
npm start
```

In the app, choose **File → Open Folder…** to work with a folder of Markdown
handouts, or **File → Open File…** for one handout. Use **File → Save** or
Ctrl/Cmd+S to write changes back to the selected file.

## Preview navigation

Click preview text to select its Markdown source. List items, nested items,
checklists, question choices, and Markdown table rows use their original source
locations, so repeated wording does not jump to the first occurrence. The editor
reveals the selected item's beginning with line wrapping accounted for.

## File browser

Open a folder to browse its handouts and images. Select a folder, then use **+**
to create a handout or folder there; type its name inline and press Enter.
Press Escape to cancel. Right-click a folder or handout for creation actions.

Search above the tree filters filenames while keeping their parent folders visible.
The active handout is highlighted, and a dot marks open handouts with unsaved changes.
Opening a handout from a tab or Recent Files reveals its parent folder in the tree.

Drag a handout onto a folder to move it, or right-click it and choose **Move to…**.
Drop on the folder name above the tree to move to the root folder. Moving saves
any edits in that handout and adjusts its relative image and link references.
An existing file with the same name is never replaced. Image files stay in place.

## Google Drive and Google Docs

Google integration requires internet access and your own Google Cloud OAuth **Desktop app** client ID. In that Cloud project, enable the Google Drive API and Google Docs API, then configure its OAuth consent screen. In the app, open **File → Google Drive → Settings and sign in…**, paste the Desktop client ID, save it, and sign in through your system browser. The app requests the `drive.file` scope. Google may limit access while your consent screen is in testing mode.

- **Export PDF to Drive…** uploads the current print preview, and displays its link and QR code.
- **Sync to a Google Doc…** creates a Doc containing the saved Markdown as literal plain text, and links that local file to its Doc ID.
- **Push** saves the current handout, then replaces the linked Doc text with literal Markdown. It refuses to overwrite a Doc whose Drive version changed since the last sync.
- **Pull** replaces the local file with the literal text of the linked Doc. If the local file changed since the last sync, it saves a dated Markdown backup beside the handout before replacing it.
- **Google Doc link and QR…** displays the link and an offline-generated QR code. The phone needs internet and permission to open the Doc.

The Google Doc shows Markdown characters as ordinary text in Consolas; it does not render the handout layout. Google Docs may still alter text that you edit manually on a phone, so review a pull before relying on it for a classroom handout. The sync link is stored in per-user app settings; refresh tokens are encrypted with the operating system's secure storage when available. Sign-in lasts only for the current app session if secure storage is unavailable.

## YAML front matter

Put an optional YAML block at the very beginning of a handout. The app removes it from the printed preview and PDF, while using these supported settings:

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
| `layout` | `letter`, `letter-landscape`, `a4`, `half-portrait`, `half-landscape`, `half-duplicate-portrait`, `half-duplicate-landscape`, `booklet-letter`, or `booklet`. Sets the initial page layout when the handout opens. |
| `ai_context` | A quoted one-line value or an indented YAML block. Its text is included with local AI requests to supply subject, grade, learning goal, and similar handout context. |

## Local AI

AI features are optional; all editing, previewing, printing, and PDF export
work without them. In **AI Tools → AI Settings**, either:

- Choose **Download recommended model** to download, checksum-verify, and
  select the suggested model automatically (about 3 GB), or
- Choose **Choose an AI model file…** to select an existing `.gguf` model.

The selected model path is stored only in the app's per-user settings. Downloaded
models and manually selected model files are not committed to Git.

## Build and test

```bash
# Verify the local model-download integrity logic
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
electron/          Electron main process, isolated preload bridge, and local AI services
renderer/           Renderer, styles, preview logic, and bundled Markdown support
demo/              Example handouts and the Handout Markdown authoring guide
tests/             Focused Node-based checks
```

## Handout syntax and examples

- Start with [the example handout](demo/example-handout.md).
- See [the AI handout guide](demo/AI_HANDOUT_GUIDE.md) for supported Markdown
  extensions, YAML settings, and classroom layout patterns.

## Contributing

Keep changes cross-platform and offline-friendly. Do not commit generated
application builds, dependencies, or AI models. Run `npm test` before opening a
pull request.

### Preview navigation regression check

With Playwright and its Chromium browser installed, run
`node tests/test-preview-navigation.cjs`. For an existing browser installation,
set `CHROME_PATH` to its executable. `PLAYWRIGHT_MODULE` optionally selects an
existing Playwright package. This check uses a mocked desktop bridge; native
macOS focus and selection behavior should also be checked in the packaged app.

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
