'use strict';

const assert = require('assert');
const { renderQrBlock, validatedUrl } = require('../renderer/qr-block');

const valid = validatedUrl('https://example.com/lesson?q=plants');
assert.strictEqual(valid.url, 'https://example.com/lesson?q=plants');
assert.strictEqual(validatedUrl('').error, 'QR code URL is empty.');
assert.strictEqual(validatedUrl('not a URL').error, 'QR code URL is invalid.');
assert.match(validatedUrl('javascript:alert(1)').error, /http:\/\/ or https:\/\//);

const markup = renderQrBlock('https://example.com');
assert.match(markup, /class="qr-code"/);
assert.match(markup, /<svg[^>]+viewBox=/);
assert.match(markup, /<path /);
assert.doesNotMatch(markup, /<img|data:image|https:\/\/.*(?:src|href)=/);
assert.match(renderQrBlock(''), /class="qr-code-error"/);
assert.match(renderQrBlock('https://example.com', 'width=1.25in'), /style="width:1.25in"/);
const floatedMarkup = renderQrBlock('https://example.com', '.float-right width=1.25in');
assert.match(floatedMarkup, /class="qr-code float-right"/);
assert.match(floatedMarkup, /style="width:1.25in"/);
assert.match(renderQrBlock('https://example.com', '.float-left'), /class="qr-code float-left"/);
assert.doesNotMatch(renderQrBlock('https://example.com', '.unknown'), /class="[^"]*unknown/);

console.log('QR block rendering test: OK');
