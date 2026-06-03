/**
 * background.js — Service Worker
 * 代理 AI API 调用，管理 chrome.storage 中的配置
 */

// ========== 默认配置 ==========
const DEFAULT_CONFIG = {
  enabled: true,
  apiKey: '',
  apiBaseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-v4-pro',
  models: [
    { id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro', provider: 'deepseek' },
    { id: 'deepseek-v4-flash', name: 'DeepSeek-V4-Flash', provider: 'deepseek' }
  ],
  systemPrompt: '你是一个有用的 AI 助手。请根据用户提供的网页内容回答问题。如果网页内容不足以回答问题，请如实告知。请用简洁清晰的中文回答（除非用户用其他语言提问）。',
  maxHistoryLength: 20,
  temperature: 0.7,
  maxTokens: 4096
};

// ========== 存储操作 ==========
async function getConfig() {
  const result = await chrome.storage.sync.get(['autowindow_config']);
  return result.autowindow_config || DEFAULT_CONFIG;
}

async function setConfig(config) {
  await chrome.storage.sync.set({ autowindow_config: config });
}

// ========== 模型信息 ==========
const MODEL_PRESETS = {
  'deepseek-v4-pro': { name: 'DeepSeek-V4-Pro', provider: 'deepseek', maxTokens: 8192 },
  'deepseek-v4-flash': { name: 'DeepSeek-V4-Flash', provider: 'deepseek', maxTokens: 8192 },
  'gpt-4o': { name: 'GPT-4o', provider: 'openai', maxTokens: 4096 },
  'gpt-4o-mini': { name: 'GPT-4o Mini', provider: 'openai', maxTokens: 4096 },
  'gpt-3.5-turbo': { name: 'GPT-3.5 Turbo', provider: 'openai', maxTokens: 4096 },
  'claude-3-5-sonnet': { name: 'Claude 3.5 Sonnet', provider: 'anthropic', maxTokens: 4096 },
  'gemini-2.0-flash': { name: 'Gemini 2.0 Flash', provider: 'google', maxTokens: 4096 }
};

// ========== API 调用 ==========
async function callDeepSeekAPI(config, messages) {
  const response = await fetch(`${config.apiBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      messages: messages,
      temperature: config.temperature || 0.7,
      max_tokens: config.maxTokens || 4096,
      stream: false
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage;
    try {
      const err = JSON.parse(errorText);
      errorMessage = err.error?.message || `HTTP ${response.status}`;
    } catch {
      errorMessage = `HTTP ${response.status}: ${errorText.substring(0, 200)}`;
    }
    throw new Error(errorMessage);
  }

  const data = await response.json();
  return {
    content: data.choices[0]?.message?.content || '',
    model: data.model || config.model,
    usage: data.usage || null
  };
}

/**
 * 流式 API 调用（SSE 解析）
 */
async function callDeepSeekAPIStream(config, messages, onChunk) {
  const response = await fetch(`${config.apiBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      messages: messages,
      temperature: config.temperature || 0.7,
      max_tokens: config.maxTokens || 4096,
      stream: true
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage;
    try {
      const err = JSON.parse(errorText);
      errorMessage = err.error?.message || `HTTP ${response.status}`;
    } catch {
      errorMessage = `HTTP ${response.status}: ${errorText.substring(0, 200)}`;
    }
    throw new Error(errorMessage);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      if (data === '[DONE]') continue;

      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices[0]?.delta?.content;
        if (delta) {
          fullContent += delta;
          onChunk(delta);
        }
      } catch {
        // 忽略解析错误
      }
    }
  }

  // 处理缓冲区剩余
  if (buffer.trim()) {
    const data = buffer.trim().slice(6);
    if (data && data !== '[DONE]') {
      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices[0]?.delta?.content;
        if (delta) {
          fullContent += delta;
          onChunk(delta);
        }
      } catch { /* ignore */ }
    }
  }

  return { content: fullContent, model: config.model };
}

// ========== 消息处理 ==========
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch(err => {
    sendResponse({ error: err.message || String(err) });
  });
  return true; // 保持通道开放以异步响应
});

async function handleMessage(message, sender) {
  const config = await getConfig();

  switch (message.type) {
    // ---- 获取配置 ----
    case 'getConfig':
      return { config };

    // ---- 更新配置 ----
    case 'setConfig':
      await setConfig({ ...config, ...message.config });
      return { success: true };

    // ---- 获取模型列表 ----
    case 'getModels':
      return { models: config.models || DEFAULT_CONFIG.models };

    // ---- AI 对话（非流式） ----
    case 'chat': {
      if (!config.apiKey) {
        return { error: '请先在扩展设置中配置 API Key' };
      }
      if (!config.enabled) {
        return { error: 'AutoWindow AI 已禁用，请在工具栏中启用' };
      }

      const { messages } = message;
      try {
        const result = await callDeepSeekAPI(config, messages);
        return { result };
      } catch (err) {
        return { error: err.message };
      }
    }

    // ---- AI 对话（流式） ----
    case 'chatStream': {
      if (!config.apiKey) {
        return { error: '请先在扩展设置中配置 API Key' };
      }
      if (!config.enabled) {
        return { error: 'AutoWindow AI 已禁用' };
      }

      const tabId = sender.tab?.id;
      if (!tabId) {
        return { error: '无法获取当前标签页' };
      }

      const { messages } = message;
      try {
        const result = await callDeepSeekAPIStream(config, messages, (chunk) => {
          // 将流式块发送到 content script
          chrome.tabs.sendMessage(tabId, {
            type: 'streamChunk',
            chunk: chunk
          }).catch(() => {}); // 忽略发送失败（tab 可能已关闭）
        });

        chrome.tabs.sendMessage(tabId, {
          type: 'streamEnd',
          result: result
        }).catch(() => {});

        return { streaming: true };
      } catch (err) {
        chrome.tabs.sendMessage(tabId, {
          type: 'streamError',
          error: err.message
        }).catch(() => {});
        return { error: err.message };
      }
    }

    // ---- 预设模型信息 ----
    case 'getModelPresets':
      return { presets: MODEL_PRESETS };

    default:
      return { error: `未知消息类型: ${message.type}` };
  }
}

// ========== 安装/更新初始化 ==========
chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.sync.get(['autowindow_config']);
  if (!existing.autowindow_config) {
    await setConfig(DEFAULT_CONFIG);
  }
  console.log('[AutoWindow] 扩展已安装/更新');
});
