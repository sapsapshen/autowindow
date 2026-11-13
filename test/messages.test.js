import assert from 'node:assert/strict';
import test from 'node:test';
import { loadScripts, plain } from '../scripts/extension-support.js';

function api() {
  return loadScripts(['utils/config.js', 'utils/messages.js']).AutoWindowMessages;
}

test('history keeps only recent chat messages', () => {
  const { trimHistory, buildApiMessages } = api();
  const history = Array.from({ length: 5 }, (_, index) => ({
    role: index % 2 ? 'assistant' : 'user',
    content: String(index)
  }));
  history.push({ role: 'system', content: 'ignore me' });
  const trimmed = trimHistory(history, 2);
  assert.deepEqual(trimmed.map((message) => message.content), ['3', '4']);

  const messages = buildApiMessages({
    systemPrompt: 'be brief',
    pageContext: { title: 'Paper', url: 'https://example.com', text: 'body' },
    history,
    maxHistoryLength: 2
  });
  assert.equal(messages[0].content, 'be brief');
  assert.match(messages[1].content, /Paper/);
  assert.match(messages[1].content, /body/);
  assert.deepEqual(plain(messages.slice(2)), plain(trimmed));
});

test('selected text is attached to the question and truncated', () => {
  const { composeUserContent } = api();
  assert.equal(composeUserContent('润色', ''), '润色');
  const composed = composeUserContent('润色', 'a'.repeat(20), 8);
  assert.match(composed, /^选中的文字：\na{8}\n\[\.\.\. 选区过长，已截断 \.\.\.\]\n\n问题：\n润色$/);
});
