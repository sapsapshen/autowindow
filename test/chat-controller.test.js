import assert from 'node:assert/strict';
import test from 'node:test';
import { loadScripts, plain } from '../scripts/extension-support.js';

function setup() {
  const sandbox = loadScripts([
    'utils/config.js',
    'utils/sse.js',
    'utils/api.js',
    'utils/chat-controller.js'
  ]);
  return sandbox;
}

function controllerWith(sandbox, overrides) {
  const calls = { complete: 0, stream: 0, errors: [], ends: [], chunks: [] };
  const controller = sandbox.AutoWindowChat.createChatController({
    getConfig: async () => sandbox.AutoWindowConfig.mergeConfig({ apiKey: 'sk-test' }),
    setConfig: async (partial) => sandbox.AutoWindowConfig.mergeConfig(partial),
    presets: sandbox.AutoWindowConfig.MODEL_PRESETS,
    formatError: (err) => sandbox.AutoWindowApi.formatError(err),
    complete: async () => {
      calls.complete += 1;
      return { content: 'ok', reasoning: '', model: 'deepseek-v4-pro', usage: null };
    },
    stream: async (_config, _messages, options) => {
      calls.stream += 1;
      await options.onDelta({ content: 'A' });
      return { content: 'A', reasoning: '', model: 'deepseek-v4-pro' };
    },
    sendChunk: async (_tabId, delta) => {
      calls.chunks.push(delta);
    },
    sendEnd: async (_tabId, result) => {
      calls.ends.push(result);
    },
    sendError: async (_tabId, error) => {
      calls.errors.push(error);
    },
    ...overrides
  });
  return { controller, calls };
}

test('chat is rejected before the API call when the key or messages are missing', async () => {
  const sandbox = setup();
  const missingKey = controllerWith(sandbox, {
    getConfig: async () => sandbox.AutoWindowConfig.mergeConfig({ apiKey: '' })
  });
  const rejected = await missingKey.controller.handle({
    type: 'chat',
    messages: [{ role: 'user', content: 'hi' }]
  });
  assert.equal(rejected.error, '请先在扩展设置中配置 API Key');
  assert.equal(missingKey.calls.complete, 0);

  const empty = controllerWith(sandbox);
  const emptyResult = await empty.controller.handle({ type: 'chatStream', messages: [] }, { tab: { id: 1 } });
  assert.equal(emptyResult.error, '消息不能为空');
  assert.equal(empty.calls.stream, 0);
});

test('stream sends chunks and returns without a second error when the key is present', async () => {
  const sandbox = setup();
  const { controller, calls } = controllerWith(sandbox);
  const result = await controller.handle(
    { type: 'chatStream', messages: [{ role: 'user', content: 'hi' }] },
    { tab: { id: 4 } }
  );
  assert.deepEqual(plain(result), { streaming: true });
  assert.deepEqual(plain(calls.chunks), [{ content: 'A' }]);
  assert.equal(calls.ends[0].content, 'A');
  assert.deepEqual(calls.errors, []);
});

test('cancelStream aborts the active request and API failures reach the tab', async () => {
  const sandbox = setup();
  let markStarted;
  const started = new Promise((resolve) => {
    markStarted = resolve;
  });
  const hanging = controllerWith(sandbox, {
    stream: (_config, _messages, options) => new Promise((_resolve, reject) => {
      markStarted();
      options.signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    })
  });
  const pending = hanging.controller.handle(
    { type: 'chatStream', messages: [{ role: 'user', content: 'hi' }] },
    { tab: { id: 9 } }
  );
  await started;
  const cancelled = await hanging.controller.handle({ type: 'cancelStream' }, { tab: { id: 9 } });
  assert.deepEqual(plain(cancelled), { success: true });
  assert.deepEqual(plain(await pending), { aborted: true });
  assert.deepEqual(plain(hanging.calls.errors), []);

  const failing = controllerWith(sandbox, {
    stream: async () => {
      throw new Error('Failed to fetch');
    }
  });
  const failure = await failing.controller.handle(
    { type: 'chatStream', messages: [{ role: 'user', content: 'hi' }] },
    { tab: { id: 2 } }
  );
  assert.match(failure.error, /无法连接 API/);
  assert.match(failing.calls.errors[0], /无法连接 API/);
});

test('disabled extension and unknown messages do not call the model', async () => {
  const sandbox = setup();
  const { controller, calls } = controllerWith(sandbox, {
    getConfig: async () => sandbox.AutoWindowConfig.mergeConfig({ apiKey: 'sk-test', enabled: false })
  });
  const disabled = await controller.handle({
    type: 'chat',
    messages: [{ role: 'user', content: 'hi' }]
  });
  assert.match(disabled.error, /已禁用/);
  assert.equal(calls.complete, 0);
  const unknown = await controller.handle({ type: 'nope' });
  assert.match(unknown.error, /未知消息类型/);
});
