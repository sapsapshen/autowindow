(function (root) {
  'use strict';

  function parseSseLine(line) {
    const trimmed = String(line || '').trim();
    if (!trimmed || trimmed.startsWith(':') || !trimmed.startsWith('data:')) return null;

    const data = trimmed.slice(5).trim();
    if (!data) return null;
    if (data === '[DONE]') return { type: 'done' };

    let parsed;
    try {
      parsed = JSON.parse(data);
    } catch {
      return null;
    }

    if (parsed.error) {
      const message = parsed.error.message || parsed.error.code || '流式响应失败';
      return { type: 'error', message: String(message) };
    }

    const choice = Array.isArray(parsed.choices) ? parsed.choices[0] : null;
    const delta = (choice && choice.delta) || {};
    return {
      type: 'delta',
      content: typeof delta.content === 'string' ? delta.content : '',
      reasoning: typeof delta.reasoning_content === 'string' ? delta.reasoning_content : '',
      model: typeof parsed.model === 'string' ? parsed.model : ''
    };
  }

  function createSseParser() {
    let buffer = '';

    function consume(text) {
      return String(text || '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
        .map(parseSseLine)
        .filter(Boolean);
    }

    return {
      push(text) {
        buffer += String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        return lines.map(parseSseLine).filter(Boolean);
      },
      flush() {
        if (!buffer.trim()) {
          buffer = '';
          return [];
        }
        const events = consume(buffer);
        buffer = '';
        return events;
      }
    };
  }

  root.AutoWindowSse = { parseSseLine, createSseParser };
})(typeof globalThis !== 'undefined' ? globalThis : this);
