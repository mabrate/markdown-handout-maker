'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const version = require('yaml/package.json').version;
require('esbuild').buildSync({
  absWorkingDir: root, entryPoints: ['node_modules/yaml/browser/index.js'], bundle: true,
  format: 'iife', globalName: 'HandoutYaml', outfile: 'renderer/vendor/yaml.min.js', minify: true,
  banner: { js: `/* yaml ${version}, Copyright Eemeli Aro. ISC license: yaml.LICENSE */` }
});
fs.copyFileSync(path.join(root, 'node_modules/yaml/LICENSE'), path.join(root, 'renderer/vendor/yaml.LICENSE'));
