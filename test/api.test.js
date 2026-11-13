import assert from 'node:assert/strict';
import test from 'node:test';
import { loadScripts, plain } from '../scripts/extension-support.js';

function load() {
  return loadScripts(['utils/config.js', 'utils/sse.js', 'utils/api.js']);
}

function streamBody(chunks) {
  let index = 0;
  const encoder = new TextEncoder();
  return {
    getReader() {
      return {
        async read() {
          if (index >= chunks.length) return { done: true, value: undefined };
          const value = encoder.encode(chunks[index]);
          index += 1;
          return { done: false, value };
        },
        releaseLock() {},
        cancel() {
          return Promise.resolve();
        }
      };
    }
  };
}

test('DeepSeek requests disable thinking unless the setting is on', () => {
  const { AutoWindowConfig, AutoWindowApi } = load();
  const config = AutoWindowConfig.mergeConfig({ apiKey: 'sk-test', temperature: 0 });
  const payload = AutoWindowApi.buildChatPayload(config, [{ role: 'user', content: 'hi' }], true);
  assert.equal(payload.model, 'deepseek-v4-pro');
  assert.equal(payload.temperature, 0);
  assert.equal(payload.stream, true);
  assert.deepEqual(plain(payload.thinking), { type: 'disabled' });
  assert.equal(AutoWindowApi.chatCompletionsUrl(config.apiBaseUrl), 'https://api.deepseek.com/chat/completions');

  const thinking = AutoWindowConfig.mergeConfig({ ...config, thinking: true });
  assert.deepEqual(plain(AutoWindowApi.buildChatPayload(thinking, [], false).thinking), { type: 'enabled' });
});

test('non-DeepSeek OpenAI-compatible payloads omit the thinking field', () => {
  const { AutoWindowConfig, AutoWindowApi } = load();
  const config = AutoWindowConfig.mergeConfig({
    apiKey: 'sk-openai',
    apiBaseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    models: [{ id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' }],
    thinking: true
  });
  const payload = AutoWindowApi.buildChatPayload(config, [], false);
  assert.equal(payload.model, 'gpt-4o');
  assert.equal(payload.thinking, undefined);
  assert.equal(AutoWindowApi.chatCompletionsUrl(config.apiBaseUrl), 'https://api.openai.com/v1/chat/completions');
});

test('completeChat reads content and surfaces API errors', async () => {
  const { AutoWindowConfig, AutoWindowApi } = load();
  const config = AutoWindowConfig.mergeConfig({ apiKey: 'sk-test' });
  const ok = await AutoWindowApi.completeChat(config, [{ role: 'user', content: 'hi' }], async () => ({
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify({
        model: 'deepseek-v4-pro',
        choices: [{ message: { content: 'hello', reasoning_content: 'because' } }]
      });
    }
  }));
  assert.equal(ok.content, 'hello');
  assert.equal(ok.reasoning, 'because');

  await assert.rejects(
    () => AutoWindowApi.completeChat(config, [], async () => ({
      ok: false,
      status: 401,
      async text() {
        return JSON.stringify({ error: { message: 'Authentication Fails' } });
      }
    })),
    /Authentication Fails/
  );
  assert.match(AutoWindowApi.formatError(Object.assign(new Error('Failed to fetch'), {})), /无法连接 API/);
});

test('streamChat reassembles split SSE chunks and reasoning deltas', async () => {
  const { AutoWindowConfig, AutoWindowApi } = load();
  const config = AutoWindowConfig.mergeConfig({ apiKey: 'sk-test' });
  const deltas = [];
  const result = await AutoWindowApi.streamChat(config, [{ role: 'user', content: 'hi' }], {
    onDelta(delta) {
      deltas.push(delta);
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      body: streamBody([
        'data: {"choices":[{"delta":{"reasoning_content":"thi"}}]}\n',
        'data: {"choices":[{"delta":{"reasoning_content":"nk"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"Hi"}}]}\n',
        'data: [DONE]\n'
      ])
    })
  });
  assert.equal(result.reasoning, 'think');
  assert.equal(result.content, 'Hi');
  assert.deepEqual(plain(deltas), [
    { reasoning: 'thi' },
    { reasoning: 'nk' },
    { content: 'Hi' }
  ]);
});

test('streamChat reports SSE errors and aborts', async () => {
  const { AutoWindowConfig, AutoWindowApi } = load();
  const config = AutoWindowConfig.mergeConfig({ apiKey: 'sk-test' });
  await assert.rejects(
    () => AutoWindowApi.streamChat(config, [], {
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        body: streamBody(['data: {"error":{"message":"overloaded"}}\n'])
      })
    }),
    /overloaded/
  );

  const controller = new AbortController();
  const pending = AutoWindowApi.streamChat(config, [], {
    signal: controller.signal,
    fetchImpl: async (_url, options) => ({
      ok: true,
      status: 200,
      body: {
        getReader() {
          return {
            read() {
              return new Promise((resolve, reject) => {
                options.signal.addEventListener('abort', () => {
                  const error = new Error('aborted');
                  error.name = 'AbortError';
                  reject(error);
                });
              });
            },
            releaseLock() {},
            cancel() {
              return Promise.resolve();
            }
          };
        }
      }
    })
  });
  controller.abort();
  await assert.rejects(pending, (error) => error.name === 'AbortError');
});
