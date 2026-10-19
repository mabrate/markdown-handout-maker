'use strict';

const assert = require('assert');
const { renderChecklistBlock } = require('../renderer/checklist-block');

assert.strictEqual(renderChecklistBlock('<ul>\n<li>Bring a notebook</li>\n</ul>'), '<ul class="checklist">\n<li>Bring a notebook</li>\n</ul>');
assert.strictEqual(renderChecklistBlock('<p>No list</p>'), '<p>No list</p>');
assert.strictEqual(renderChecklistBlock('<ul data-source-start="4" data-source-end="7"><li>Item</li></ul>'), '<ul class="checklist" data-source-start="4" data-source-end="7"><li>Item</li></ul>');
console.log('checklist block test: OK');
