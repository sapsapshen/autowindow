(function (root) {
  'use strict';

  const STORAGE_KEY = 'autowindow_config';
  const SYNC_VALUE_LIMIT = 8000;

  const DEFAULT_CONFIG = {
    enabled: true,
    apiKey: '',
    apiBaseUrl: 'https://api.deepseek.com',
    model: 'deepseek-v4-pro',
    models: [
      { id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro', provider: 'deepseek' },
      { id: 'deepseek-flash', name: 'DeepSeek-V4.1-Flash', provider: 'deepseek' }
    ],
    systemPrompt: '你是一个有用的 AI 助手。请根据用户提供的网页内容回答问题。如果网页内容不足以回答问题，请如实告知。请用简洁清晰的中文回答（除非用户用其他语言提问）。',
    maxHistoryLength: 20,
    temperature: 0.7,
    maxTokens: 4096,
    thinking: false
  };

  const MODEL_PRESETS = {
    'deepseek-v4-pro': {
      name: 'DeepSeek-V4-Pro',
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com'
    },
    'deepseek-flash': {
      name: 'DeepSeek-V4.1-Flash',
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com'
    },
    'gpt-4o': {
      name: 'GPT-4o',
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1'
    },
    'gpt-4o-mini': {
      name: 'GPT-4o Mini',
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1'
    }
  };

  function defaultModels() {
    return DEFAULT_CONFIG.models.map((model) => ({ ...model }));
  }

  function clampNumber(value, min, max, fallback) {
    const number = typeof value === 'number' ? value : parseFloat(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
  }

  function migrateModelId(id) {
    if (id === 'deepseek-v4-flash') return 'deepseek-flash';
    return id;
  }

  function isLocalHost(hostname) {
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  }

  function validateBaseUrl(input) {
    const raw = typeof input === 'string' ? input.trim() : '';
    if (!raw) return { ok: true, url: DEFAULT_CONFIG.apiBaseUrl };

    let parsed;
    try {
      parsed = new URL(raw);
    } catch {
      return { ok: false, error: 'API Base URL 不是有效的 URL' };
    }

    const local = isLocalHost(parsed.hostname);
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && local)) {
      return { ok: false, error: 'API Base URL 需要使用 HTTPS（本机地址可以使用 HTTP）' };
    }
    if (parsed.username || parsed.password) {
      return { ok: false, error: '请不要把账号或密码写进 API Base URL' };
    }
    if (parsed.search || parsed.hash) {
      return { ok: false, error: 'API Base URL 不需要带查询参数' };
    }

    const path = parsed.pathname.replace(/\/+$/, '').replace(/\/chat\/completions$/i, '');
    let url = `${parsed.origin}${path}`;
    if (url === 'https://api.deepseek.com/v1') url = 'https://api.deepseek.com';
    return { ok: true, url };
  }

  function normalizeBaseUrl(input) {
    const result = validateBaseUrl(input);
    return result.ok ? result.url : DEFAULT_CONFIG.apiBaseUrl;
  }

  function normalizeModels(models) {
    if (!Array.isArray(models)) return defaultModels();

    const seen = new Set();
    const normalized = [];
    for (const model of models) {
      if (!model || typeof model.id !== 'string' || typeof model.name !== 'string') continue;
      const rawId = model.id.trim();
      const id = migrateModelId(rawId);
      const rawName = model.name.trim();
      if (!id || !rawName || seen.has(id)) continue;
      seen.add(id);
      const name = rawId === 'deepseek-v4-flash' && rawName === 'DeepSeek-V4-Flash'
        ? 'DeepSeek-V4.1-Flash'
        : rawName;
      normalized.push({
        id,
        name,
        provider: typeof model.provider === 'string' ? model.provider.trim() : ''
      });
    }

    return normalized.length > 0 ? normalized : defaultModels();
  }

  function mergeConfig(stored) {
    const source = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
    const models = normalizeModels(source.models);
    let model = migrateModelId(typeof source.model === 'string' ? source.model.trim() : '');
    if (!model || !models.some((item) => item.id === model)) {
      model = models[0].id;
    }

    const systemPrompt = typeof source.systemPrompt === 'string' && source.systemPrompt.trim()
      ? source.systemPrompt.trim()
      : DEFAULT_CONFIG.systemPrompt;

    return {
      enabled: source.enabled !== false,
      apiKey: typeof source.apiKey === 'string' ? source.apiKey.trim() : '',
      apiBaseUrl: normalizeBaseUrl(source.apiBaseUrl),
      model,
      models,
      systemPrompt,
      maxHistoryLength: clampNumber(source.maxHistoryLength, 1, 100, DEFAULT_CONFIG.maxHistoryLength),
      temperature: clampNumber(source.temperature, 0, 2, DEFAULT_CONFIG.temperature),
      maxTokens: Math.round(clampNumber(source.maxTokens, 1, 384000, DEFAULT_CONFIG.maxTokens)),
      thinking: source.thinking === true
    };
  }

  function syncValueBytes(config) {
    return new TextEncoder().encode(JSON.stringify(config)).length;
  }

  function assertSyncQuota(config) {
    const bytes = syncValueBytes(config);
    if (bytes > SYNC_VALUE_LIMIT) {
      throw new Error('配置太大，无法写入 Chrome 同步存储（单项上限约 8KB）。请缩短系统提示词或减少模型。');
    }
    return bytes;
  }

  function isDeepSeekUrl(apiBaseUrl) {
    try {
      const hostname = new URL(apiBaseUrl).hostname;
      return hostname === 'api.deepseek.com' || hostname.endsWith('.deepseek.com');
    } catch {
      return false;
    }
  }

  root.AutoWindowConfig = {
    STORAGE_KEY,
    SYNC_VALUE_LIMIT,
    DEFAULT_CONFIG,
    MODEL_PRESETS,
    clampNumber,
    migrateModelId,
    validateBaseUrl,
    normalizeBaseUrl,
    normalizeModels,
    mergeConfig,
    syncValueBytes,
    assertSyncQuota,
    isDeepSeekUrl
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
