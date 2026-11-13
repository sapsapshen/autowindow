import assert from 'node:assert/strict';
import test from 'node:test';
import { element, loadScripts, makeDocument, textNode } from '../scripts/extension-support.js';

function parse(body, options = {}) {
  const { AutoWindowParser } = loadScripts(['utils/page-parser.js']);
  const env = makeDocument({
    title: options.title || 'Example',
    href: options.href || 'https://example.com/post',
    body
  });
  return AutoWindowParser.createParser({ ...env, ...options }).parsePage();
}

test('parser keeps headings and code newlines and skips the extension widget', () => {
  const article = element('article', [
    element('h1', [textNode('Title')]),
    element('p', [textNode('Hello')]),
    element('pre', [textNode('const a = 1;\nconst b = 2;')]),
    element('script', [textNode('secret()')]),
    element('div', [textNode('SECRET TOKEN')], { id: 'aw-root' }),
    element('p', [textNode('x'.repeat(220))])
  ]);
  const page = parse(element('body', [article]));
  assert.match(page.text, /^## Title\n/);
  assert.match(page.text, /Hello/);
  assert.match(page.text, /const a = 1;\nconst b = 2;/);
  assert.equal(page.text.includes('secret()'), false);
  assert.equal(page.text.includes('SECRET TOKEN'), false);
  assert.equal(page.title, 'Example');
  assert.equal(page.url, 'https://example.com/post');
});

test('parser skips hidden, navigation, and non-content regions', () => {
  const body = element('body', [
    element('p', [textNode('Visible answer')]),
    element('div', [textNode('hidden attribute')], { hidden: true }),
    element('div', [textNode('css hidden')], { id: 'css-hidden' }),
    element('nav', [textNode('menu')]),
    element('div', [textNode('sidebar note')], { role: 'navigation' }),
    element('aside', [textNode('advertisement here')], { className: 'sidebar' })
  ]);
  const page = parse(body);
  assert.match(page.text, /Visible answer/);
  assert.equal(page.text.includes('hidden attribute'), false);
  assert.equal(page.text.includes('css hidden'), false);
  assert.equal(page.text.includes('menu'), false);
  assert.equal(page.text.includes('sidebar note'), false);
  assert.equal(page.text.includes('advertisement'), false);
});

test('parser truncates long text and huge node trees', () => {
  const long = parse(element('body', [element('p', [textNode('y'.repeat(80))])]), { maxText: 20 });
  assert.match(long.text, /内容过长，已截断/);
  assert.ok(long.length > 20);

  const many = element('body', Array.from({ length: 10 }, () => element('p', [textNode('node')])));
  const limited = parse(many, { maxNodes: 3 });
  assert.match(limited.text, /页面节点过多，已截断/);
});
