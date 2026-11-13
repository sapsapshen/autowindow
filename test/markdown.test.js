import assert from 'node:assert/strict';
import test from 'node:test';
import { loadScripts } from '../scripts/extension-support.js';

function render(value) {
  return loadScripts(['utils/markdown.js']).AutoWindowMarkdown.renderMarkdown(value);
}

test('markdown escapes HTML once and keeps code fences literal', () => {
  const html = render('```js\na < b && c\n**not bold**\n```');
  assert.match(html, /<pre><code>a &lt; b &amp;&amp; c\n\*\*not bold\*\*<\/code><\/pre>/);
  assert.doesNotMatch(html, /&amp;lt;/);
  assert.doesNotMatch(html, /<strong>not bold<\/strong>/);
});

test('markdown keeps ordered list numbers and renders inline emphasis', () => {
  const html = render('1. Keep **this**\n2. And *that*\n\nSee `x < y`');
  assert.match(html, /<ol><li>Keep <strong>this<\/strong><\/li><li>And <em>that<\/em><\/li><\/ol>/);
  assert.match(html, /<code>x &lt; y<\/code>/);
  assert.doesNotMatch(html, /<script>/);
});

test('markdown renders headings and quotes without dropping the text', () => {
  const html = render('# Title\n\n> quoted <b>');
  assert.match(html, /<strong>Title<\/strong>/);
  assert.match(html, /<blockquote>quoted &lt;b&gt;<\/blockquote>/);
});
