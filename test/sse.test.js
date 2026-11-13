import assert from 'node:assert/strict';
import test from 'node:test';
import { loadScripts, plain } from '../scripts/extension-support.js';

test('SSE parser keeps partial lines and ignores malformed events', () => {
  const { createSseParser } = loadScripts(['utils/sse.js']).AutoWindowSse;
  const parser = createSseParser();
  assert.deepEqual(plain(parser.push('data: {"choices":[{"delta":{"content":"He')), []);
  const completed = parser.push('llo"}}]}\r\n: keep-alive\r\ndata: not-json\n');
  assert.equal(completed.length, 1);
  assert.equal(completed[0].content, 'Hello');
  assert.deepEqual(plain(parser.flush()), []);
});

test('SSE parser flushes a final data line and recognizes DONE', () => {
  const { createSseParser } = loadScripts(['utils/sse.js']).AutoWindowSse;
  const parser = createSseParser();
  assert.deepEqual(plain(parser.push('data: [DONE]')), []);
  assert.deepEqual(plain(parser.flush()), [{ type: 'done' }]);
});
