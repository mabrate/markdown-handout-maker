'use strict';
const assert = require('assert/strict');
const YAML = require('yaml');
const settings = require('../renderer/document-settings');
const apply = (text, edits) => {
  const change = settings.update(text, edits);
  return change ? text.slice(0, change.start) + change.text + text.slice(change.end) : text;
};
const body = '# Food webs\n\n## Explore\n\nWrite here.\n';
assert.equal(settings.update(body), null);
assert.equal(settings.update(body, { lesson: [['title', undefined]] }), null);
assert.equal(settings.read(body).lesson, null);
const created = apply(body, { lesson: [['title', 'Food webs'], ['learning-goals', ['Explain relationships', 'Use evidence']], ['duration-minutes', 25], ['materials', ['Cards', 'String']], ['outdoors', false]] });
assert.ok(created.endsWith(body));
assert.deepEqual(settings.read(created).document.toJS(), { 'lesson-info': { title: 'Food webs', 'learning-goals': ['Explain relationships', 'Use evidence'], 'duration-minutes': 25, materials: ['Cards', 'String'], outdoors: false } });
assert.ok(!created.includes('layout:') && !created.includes('assignment:') && !created.includes('audience:'));
assert.equal(settings.update(created, { lesson: [['title', 'Food webs'], ['learning-goals', ['Explain relationships', 'Use evidence']]] }), null);
const existing = '---\n# Keep header\nlayout: letter # paper\ncustom-document: { code: 07, note: "quoted" }\nlesson-info:\n  # Keep title comment\n  title: Original # activity\n  learning-goals: # goals comment\n    - Explain\n  resource:\n    url: https://example.com\n    nested: [one, two]\n---\n\n' + body;
const changed = apply(existing, { document: [['layout', 'a4']], lesson: [['title', 'New: title # with punctuation'], ['learning-goals', ['Compare', 'Explain']]] });
assert.ok(changed.endsWith('\n\n' + body));
for (const comment of ['# Keep header', '# paper', '# Keep title comment', '# activity', '# goals comment']) assert.ok(changed.includes(comment), comment);
assert.deepEqual(settings.read(changed).document.toJS()['custom-document'], { code: 7, note: 'quoted' });
assert.deepEqual(settings.read(changed).document.toJS()['lesson-info'].resource, { url: 'https://example.com', nested: ['one', 'two'] });
assert.equal(settings.read(changed).document.getIn(['lesson-info', 'title']), 'New: title # with punctuation');
const removed = apply(changed, { lesson: [['title', undefined], ['learning-goals', undefined], ['resource', undefined]] });
assert.equal(settings.read(removed).document.has('lesson-info'), false);
assert.ok(removed.includes('custom-document:'));
assert.equal(apply('---\nlesson-info:\n  title: Only field\n---\n' + body, { lesson: [['title', undefined]] }), body);
assert.equal(settings.read(apply('---\nlesson-info:\n---\n' + body, { lesson: [['audience', 'Grade 7']] })).document.getIn(['lesson-info', 'audience']), 'Grade 7');
const crlf = '\uFEFF---\r\nlayout: letter\r\nlesson-info:\r\n  title: Old\r\n---\r\n\r\n# Body\r\n';
const newCrlf = apply(crlf, { lesson: [['title', 'New']] });
assert.ok(newCrlf.startsWith('\uFEFF---\r\n'));
assert.ok(newCrlf.endsWith('\r\n\r\n# Body\r\n'));
assert.ok(!newCrlf.replace(/\r\n/g, '').includes('\n'));
assert.ok(apply('\uFEFF' + body, { lesson: [['title', 'New']] }).startsWith('\uFEFF---\n'));
const anchors = '---\nshared: &shared\n  - One\ncopy: *shared\nlesson-info:\n  title: Existing\n---\n' + body;
assert.deepEqual(settings.read(apply(anchors, { lesson: [['title', 'Updated']] })).document.toJS().copy, ['One']);
for (const invalid of ['---\nlesson-info: [wrong]\n---\n', '---\nlayout: letter\nlayout: a4\n---\n', '---\nlesson-info:\n  title: [broken\n---\n', '---\n- not a mapping\n---\n', '---\nlayout: letter\n']) {
  assert.throws(() => settings.update(invalid + body, { lesson: [['title', 'Must not replace data']] }));
}
assert.deepEqual(settings.valueOf('list', 'One\n\n Two '), ['One', 'Two']);
assert.equal(settings.valueOf('number', '0'), 0);
assert.equal(settings.valueOf('boolean', 'false'), false);
assert.equal(settings.valueOf('text', '   '), undefined);
assert.throws(() => settings.valueOf('number', 'not a number'));
assert.throws(() => settings.valueOf('yaml', '[broken'));
const nested = apply(body, { lesson: [['grouping', settings.valueOf('yaml', 'size: 3\nroles: [reader, recorder]')]] });
assert.deepEqual(settings.read(nested).document.toJS()['lesson-info'].grouping, { size: 3, roles: ['reader', 'recorder'] });
for (const value of ['yes', 'false', '2026-10-25', 'A: B # C', 'Line one\nLine two']) {
  assert.equal(settings.read(apply(body, { lesson: [['example', value]] })).document.getIn(['lesson-info', 'example']), value);
}
const slides = apply('---\ntype: slides\ntheme: classroom\naspect: 16:9\n---\n# First\n\n---\n# Second', { document: [['theme', 'dark'], ['aspect', '4:3']], lesson: [['audience', 'Grade 7']] });
assert.ok(slides.endsWith('# First\n\n---\n# Second'));
assert.equal(settings.read(slides).document.get('type'), 'slides');
assert.deepEqual(settings.describe(YAML.parseDocument('[One, Two]').contents), { type: 'list', value: 'One\nTwo' });
assert.equal(settings.describe(YAML.parseDocument('{ size: 3 }').contents).type, 'yaml');
console.log('Document settings preserve nested metadata, comments, custom values, aliases, CRLF, document bodies, and slide separators');
