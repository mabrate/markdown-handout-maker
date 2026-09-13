'use strict';

const assert = require('assert');
const { updateImageWidth, updateQrWidth } = require('../renderer/media-sizing');

const markdown = '![First](first.png)\n\n![Second](second.png "Title"){.float-right width=2in}';
assert.strictEqual(updateImageWidth(markdown, 0, '3.25in'), '![First](first.png){width=3.25in}\n\n![Second](second.png "Title"){.float-right width=2in}');
assert.strictEqual(updateImageWidth(markdown, 1, '1.5in'), '![First](first.png)\n\n![Second](second.png "Title"){.float-right width=1.5in}');
assert.strictEqual(updateImageWidth(markdown, 8, '1in'), markdown);
assert.strictEqual(updateImageWidth('---\nlayout: letter\n---\n![First](first.png)', 0, '2in'), '---\nlayout: letter\n---\n![First](first.png){width=2in}');
assert.strictEqual(updateQrWidth('[qr:https://example.com]', 0, '1.25in'), '[qr:https://example.com]{width=1.25in}');
assert.strictEqual(updateQrWidth('[qr:https://one.test]{width=2in}\n[qr:https://two.test]', 1, '1in'), '[qr:https://one.test]{width=2in}\n[qr:https://two.test]{width=1in}');
console.log('media sizing test: OK');
