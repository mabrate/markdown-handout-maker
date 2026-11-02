# Bundled Vector Lab

This is a standalone snapshot from the local drawing-app project, with a Handout Maker open/save adapter in src/main.js. It does not contact draw.marcabrate.com or modify the original project.

To rebuild: install this directory's locked dependencies with npm ci, then run npm run build -- --outDir ../../renderer/vector-lab --emptyOutDir. Commit the generated renderer/vector-lab files with changes to this snapshot. The packaged app includes the generated editor and fonts; no development tools or server are required.

The adapter accepts image bytes from the isolated Electron preload and returns editable SVG or PNG. The app owns the target path and checks for external changes before saving. PNG exports embed editable SVG.

Updated with drawing-app commit `ea0d6b36074e0ebb433bfd1b2388cda7fff69dec` (2026-11-02): drag crops stay aligned with the canvas on rotated images, while preserving shape restrictions and editable SVG round trips. Handout Maker's open/save adapter is retained.

To check the imported crop regressions, run `npm test` in this directory after `npm ci`. These browser tests currently use Chrome at `/usr/bin/google-chrome` and cover rotated crop previews, undo/redo, reset, shape clipping, browser recovery, and SVG reopening.
