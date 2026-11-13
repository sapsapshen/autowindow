import assert from 'node:assert/strict';
import test from 'node:test';
import { loadScripts, plain } from '../scripts/extension-support.js';

function load() {
  return loadScripts(['utils/config.js']).AutoWindowConfig;
}

test('mergeConfig fills defaults and preserves explicit zero temperature', () => {
  const { mergeConfig, DEFAULT_CONFIG } = load();
  const config = mergeConfig({ temperature: 0, apiKey: ' sk-test ' });
  assert.equal(config.temperature, 0);
  assert.equal(config.apiKey, 'sk-test');
  assert.equal(config.model, DEFAULT_CONFIG.model);
  assert.equal(config.apiBaseUrl, 'https://api.deepseek.com');
  assert.equal(config.thinking, false);
  assert.equal(config.enabled, true);
  assert.equal(config.models[1].id, 'deepseek-flash');
});

test('mergeConfig migrates legacy DeepSeek flash id and v1 base URL', () => {
  const { mergeConfig } = load();
  const input = {
    apiBaseUrl: 'https://api.deepseek.com/v1/',
    model: 'deepseek-v4-flash',
    models: [
      { id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro', provider: 'deepseek' },
      { id: 'deepseek-v4-flash', name: 'DeepSeek-V4-Flash', provider: 'deepseek' }
    ],
    enabled: false,
    thinking: true
  };
  const once = mergeConfig(input);
  const twice = mergeConfig(once);
  assert.equal(once.apiBaseUrl, 'https://api.deepseek.com');
  assert.equal(once.model, 'deepseek-flash');
  assert.equal(once.models[1].name, 'DeepSeek-V4.1-Flash');
  assert.equal(once.enabled, false);
  assert.equal(once.thinking, true);
  assert.deepEqual(once, twice);
  assert.equal(input.model, 'deepseek-v4-flash');
});

test('validateBaseUrl accepts OpenAI-compatible HTTPS and local HTTP only', () => {
  const { validateBaseUrl, normalizeBaseUrl } = load();
  assert.deepEqual(plain(validateBaseUrl('https://api.openai.com/v1/chat/completions')), {
    ok: true,
    url: 'https://api.openai.com/v1'
  });
  assert.equal(validateBaseUrl('http://localhost:11434/v1').url, 'http://localhost:11434/v1');
  assert.equal(validateBaseUrl('http://192.168.1.2:1234').ok, false);
  assert.equal(validateBaseUrl('not a url').ok, false);
  assert.equal(normalizeBaseUrl('http://evil.example'), 'https://api.deepseek.com');
});

test('mergeConfig clamps sampling settings and rejects oversized sync values', () => {
  const { mergeConfig, assertSyncQuota } = load();
  const config = mergeConfig({ temperature: 9, maxTokens: -5, maxHistoryLength: 500 });
  assert.equal(config.temperature, 2);
  assert.equal(config.maxTokens, 1);
  assert.equal(config.maxHistoryLength, 100);
  assert.doesNotThrow(() => assertSyncQuota(config));
  assert.throws(
    () => assertSyncQuota(mergeConfig({ systemPrompt: 'a'.repeat(9000) })),
    /8KB/
  );
});
