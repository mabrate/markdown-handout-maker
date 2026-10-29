# Bundled Vector Lab

This is a standalone snapshot from the local drawing-app project, with a Handout Maker open/save adapter in src/main.js. It does not contact draw.marcabrate.com or modify the original project.

To rebuild: install this directory's locked dependencies with npm ci, then run npm run build -- --outDir ../../renderer/vector-lab --emptyOutDir. Commit the generated renderer/vector-lab files with changes to this snapshot. The packaged app includes the generated editor and fonts; no development tools or server are required.

The adapter accepts image bytes from the isolated Electron preload and returns editable SVG or PNG. The app owns the target path and checks for external changes before saving. PNG exports embed editable SVG.
