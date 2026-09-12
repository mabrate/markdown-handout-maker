# Handout Maker Desktop

An offline-first desktop editor for creating printable classroom handouts from
Markdown. It combines a local file browser, Markdown editor, live paginated
preview, native printing, and PDF export in one Electron application for
Linux and macOS.

Handout Maker works with local files. Your handouts stay in folders you choose;
they are not uploaded to a service.

## Features

- Open, create, edit, and save Markdown handouts from a local folder
- Preview letter, A4, half-sheet, duplicate-half-sheet, and booklet layouts
- Print natively or export a PDF
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
