/**
 * background.js — service worker.
 * Proxies OpenAI-compatible chat requests and owns extension settings.
 */
importScripts(
  'utils/config.js',
  'utils/sse.js',
  'utils/api.js',
  'utils/chat-controller.js'
);

const STORAGE_KEY = AutoWindowConfig.STORAGE_KEY;

async function getConfig() {
  const stored = await chrome.storage.sync.get(STORAGE_KEY);
  return AutoWindowConfig.mergeConfig(stored[STORAGE_KEY]);
}

async function setConfig(partial) {
  const current = await getConfig();
  const next = AutoWindowConfig.mergeConfig({ ...current, ...(partial || {}) });
  AutoWindowConfig.assertSyncQuota(next);
  await chrome.storage.sync.set({ [STORAGE_KEY]: next });
  return next;
}

async function sendTab(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    // The tab can close before a chunk arrives.
  }
}

const controller = AutoWindowChat.createChatController({
  getConfig,
  setConfig,
  presets: AutoWindowConfig.MODEL_PRESETS,
  complete: (config, messages) => AutoWindowApi.completeChat(config, messages),
  stream: (config, messages, options) => AutoWindowApi.streamChat(config, messages, options),
  formatError: (err) => AutoWindowApi.formatError(err),
  sendChunk(tabId, delta) {
    return sendTab(tabId, {
      type: 'streamChunk',
      content: delta.content || '',
      reasoning: delta.reasoning || ''
    });
  },
  sendEnd(tabId, result) {
    return sendTab(tabId, { type: 'streamEnd', result });
  },
  sendError(tabId, error) {
    return sendTab(tabId, { type: 'streamError', error });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  controller.handle(message, sender).then(sendResponse).catch((err) => {
    sendResponse({ error: AutoWindowApi.formatError(err) });
  });
  return true;
});

if (chrome.commands && chrome.commands.onCommand) {
  chrome.commands.onCommand.addListener(async (command) => {
    if (command !== 'toggle-panel') return;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return;
    await sendTab(tab.id, { type: 'toggle' });
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  try {
    const stored = await chrome.storage.sync.get(STORAGE_KEY);
    const raw = stored[STORAGE_KEY];
    const next = raw ? AutoWindowConfig.mergeConfig(raw) : AutoWindowConfig.mergeConfig(null);
    AutoWindowConfig.assertSyncQuota(next);
    await chrome.storage.sync.set({ [STORAGE_KEY]: next });
  } catch (err) {
    console.error('[AutoWindow] 配置初始化失败', err);
  }
});
