# The Markdown Handout Maker

An offline-first desktop editor for creating printable classroom handouts from
Markdown. It combines a local file browser, Markdown editor, live paginated
preview, native printing, and PDF export in one Electron application for
Linux and macOS.

The Markdown Handout Maker keeps your source handouts in local folders. Google Drive export and Google Doc sync are optional; they upload a copy only when you choose a Google command.

## Features

- Open, create, edit, and save Markdown handouts from a local folder
- Preview letter, A4, half-sheet, duplicate-half-sheet, and booklet layouts
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

## Google Drive and Google Docs

Google integration requires internet access and your own Google Cloud OAuth **Desktop app** client ID. In that Cloud project, enable the Google Drive API and Google Docs API, then configure its OAuth consent screen. In the app, open **File → Google Drive → Settings and sign in…**, paste the Desktop client ID, save it, and sign in through your system browser. The app requests the `drive.file` scope. Google may limit access while your consent screen is in testing mode.

- **Export PDF to Drive…** uploads the current print preview, and displays its link and QR code.
- **Sync to a Google Doc…** creates a Doc containing the saved Markdown as literal plain text, and links that local file to its Doc ID.
- **Push** saves the current handout, then replaces the linked Doc text with literal Markdown. It refuses to overwrite a Doc whose Drive version changed since the last sync.
- **Pull** replaces the local file with the literal text of the linked Doc. If the local file changed since the last sync, it saves a dated Markdown backup beside the handout before replacing it.
- **Google Doc link and QR…** displays the link and an offline-generated QR code. The phone needs internet and permission to open the Doc.

The Google Doc shows Markdown characters as ordinary text; it does not render the handout layout. Google Docs may still alter text that you edit manually on a phone, so review a pull before relying on it for a classroom handout. The sync link is stored in per-user app settings; refresh tokens are encrypted with the operating system's secure storage when available. Sign-in lasts only for the current app session if secure storage is unavailable.

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
- See [the authoring guide](demo/HANDOUT_MARKDOWN.md) for the supported Markdown
  extensions and classroom layout patterns.

## Contributing

Keep changes cross-platform and offline-friendly. Do not commit generated
application builds, dependencies, or AI models. Run `npm test` before opening a
pull request.
