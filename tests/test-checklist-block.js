'use strict';

const assert = require('assert');
const { renderChecklistBlock } = require('../renderer/checklist-block');

assert.strictEqual(renderChecklistBlock('<ul>\n<li>Bring a notebook</li>\n</ul>'), '<ul class="checklist">\n<li>Bring a notebook</li>\n</ul>');
assert.strictEqual(renderChecklistBlock('<p>No list</p>'), '<p>No list</p>');
console.log('checklist block test: OK');
