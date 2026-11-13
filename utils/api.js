(function (root) {
  'use strict';

  function configApi() {
    return root.AutoWindowConfig;
  }

  function chatCompletionsUrl(apiBaseUrl) {
    return `${configApi().normalizeBaseUrl(apiBaseUrl)}/chat/completions`;
  }

  function buildChatPayload(config, messages, stream) {
    const normalized = configApi().mergeConfig(config);
    const payload = {
      model: normalized.model,
      messages,
      temperature: normalized.temperature,
      max_tokens: normalized.maxTokens,
      stream: Boolean(stream)
    };
    if (configApi().isDeepSeekUrl(normalized.apiBaseUrl)) {
      payload.thinking = { type: normalized.thinking ? 'enabled' : 'disabled' };
    }
    return payload;
  }

  function parseApiError(status, bodyText) {
    const text = String(bodyText || '');
    try {
      const parsed = JSON.parse(text);
      const message = parsed.error?.message || parsed.message;
      if (message) return String(message);
    } catch {
      // Response body is not JSON.
    }
    const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 200);
    return snippet ? `HTTP ${status}: ${snippet}` : `HTTP ${status}`;
  }

  function formatError(err) {
    if (!err) return '请求失败';
    if (err.name === 'AbortError') return '请求已取消';
    const message = err.message || String(err);
    if (/Failed to fetch|NetworkError|Load failed|network error/i.test(message)) {
      return '无法连接 API。请检查 Base URL、网络，以及扩展是否已获得该站点权限。';
    }
    return message;
  }

  function jsonHeaders(config) {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`
    };
  }

  async function readBody(response) {
    try {
      return await response.text();
    } catch {
      return '';
    }
  }

  async function completeChat(config, messages, fetchImpl) {
    const request = fetchImpl || root.fetch;
    const normalized = configApi().mergeConfig(config);
    const response = await request(chatCompletionsUrl(normalized.apiBaseUrl), {
      method: 'POST',
      headers: jsonHeaders(normalized),
      body: JSON.stringify(buildChatPayload(normalized, messages, false))
    });
    const text = await readBody(response);
    if (!response.ok) throw new Error(parseApiError(response.status, text));

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('API 返回了无法解析的内容');
    }
    if (data.error) throw new Error(data.error.message || '请求失败');

    const message = data.choices?.[0]?.message || {};
    return {
      content: message.content || '',
      reasoning: message.reasoning_content || '',
      model: data.model || normalized.model,
      usage: data.usage || null
    };
  }

  function abortError() {
    const error = new Error('The operation was aborted');
    error.name = 'AbortError';
    return error;
  }

  async function streamChat(config, messages, options = {}) {
    const request = options.fetchImpl || root.fetch;
    const normalized = configApi().mergeConfig(config);
    const response = await request(chatCompletionsUrl(normalized.apiBaseUrl), {
      method: 'POST',
      headers: jsonHeaders(normalized),
      body: JSON.stringify(buildChatPayload(normalized, messages, true)),
      signal: options.signal
    });
    if (!response.ok) throw new Error(parseApiError(response.status, await readBody(response)));
    if (!response.body || typeof response.body.getReader !== 'function') {
      throw new Error('浏览器没有返回可读的流');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const parser = root.AutoWindowSse.createSseParser();
    let content = '';
    let reasoning = '';
    let model = normalized.model;

    const onAbort = () => {
      reader.cancel().catch(() => {});
    };
    options.signal?.addEventListener('abort', onAbort);

    async function consume(events) {
      for (const event of events) {
        if (event.type === 'error') throw new Error(event.message);
        if (event.type === 'done') return true;
        if (event.model) model = event.model;
        if (event.content) {
          content += event.content;
          await options.onDelta?.({ content: event.content });
        }
        if (event.reasoning) {
          reasoning += event.reasoning;
          await options.onDelta?.({ reasoning: event.reasoning });
        }
      }
      return false;
    }

    try {
      while (true) {
        if (options.signal?.aborted) throw abortError();
        const { done, value } = await reader.read();
        if (done) break;
        const stop = await consume(parser.push(decoder.decode(value, { stream: true })));
        if (stop) break;
      }
      await consume(parser.push(decoder.decode()));
      await consume(parser.flush());
    } finally {
      options.signal?.removeEventListener('abort', onAbort);
      try {
        reader.releaseLock();
      } catch {
        // The reader may already have been cancelled.
      }
    }

    return { content, reasoning, model };
  }

  root.AutoWindowApi = {
    chatCompletionsUrl,
    buildChatPayload,
    parseApiError,
    formatError,
    completeChat,
    streamChat
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
