'use strict';
const assert = require('assert/strict');
const insert = require('../renderer/insert-menu');
const links = require('../renderer/internal-links');
const markdown = require('../renderer/vendor/markdown-it.min.js')();

const handout = { mode: 'handout', hasDocument: true, saved: true }, slides = { ...handout, mode: 'slides' };
for (const id of ['image', 'drawing', 'link', 'internal-link', 'qr', 'youtube', 'video', 'heading', 'checklist', 'table', 'rubric', 'columns', 'cards']) {
  assert(insert.applicable(insert.find(id), handout), id + ' works in handouts');
  assert(insert.applicable(insert.find(id), slides), id + ' works in slides');
}
for (const id of ['question', 'lines', 'inline-lines', 'space', 'box', 'dots', 'total-points', 'grade-box', 'wrap', 'pagebreak', 'style']) {
  assert(insert.applicable(insert.find(id), handout)); assert(!insert.applicable(insert.find(id), slides), id + ' is handout-only');
}
for (const id of ['background', 'text', 'notes', 'center', 'list', 'footer']) {
  assert(insert.applicable(insert.find(id), slides)); assert(!insert.applicable(insert.find(id), handout), id + ' is slide-only');
}
assert(!insert.applicable(insert.find('image'), { ...handout, saved: false }));
assert(!insert.applicable(insert.find('drawing'), { ...handout, saved: false }));
for (const group of insert.groups) for (const item of group.items) assert(!insert.applicable(item, { ...slides, hasDocument: false }));
assert(!insert.applicable(insert.find('unknown'), handout));
const menu = insert.build(slides, (command, payload) => { assert.equal(command, 'insert-content'); assert.equal(payload, 'columns'); });
assert.equal(menu.find(item => item.label === 'Handout Elements').enabled, false);
assert.equal(menu.find(item => item.label === 'Slide Elements').enabled, true);
assert.equal(menu.find(item => item.id === 'insert-internal-link').label, 'Link to Slide…');
menu.find(item => item.label === 'Layout').submenu.find(item => item.id === 'insert-columns').click();
const label = 'See [this]\\here', web = links.webMarkup(label, 'https://example.com/a (b)?q=test');
assert.match(markdown.render(web), /href="https:\/\/example.com\/a%20%28b%29\?q=test"/);
for (const address of ['javascript:alert(1)', 'file:///tmp/test', 'data:text/plain,hello', 'invalid']) assert.throws(() => links.webMarkup('Link', address));
console.log('Insert menu format compatibility, disabled states, command routing, and web link markup passed');
