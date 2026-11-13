(function (root) {
  'use strict';

  const DEFAULT_SELECTION_LIMIT = 4000;

  function isChatMessage(message) {
    return Boolean(message)
      && (message.role === 'user' || message.role === 'assistant')
      && typeof message.content === 'string';
  }

  function trimHistory(messages, maxHistoryLength) {
    const history = Array.isArray(messages) ? messages.filter(isChatMessage) : [];
    const max = root.AutoWindowConfig
      ? root.AutoWindowConfig.clampNumber(maxHistoryLength, 1, 100, 20)
      : 20;
    if (history.length <= max) return history.map((message) => ({ ...message }));
    return history.slice(history.length - max).map((message) => ({ ...message }));
  }

  function formatPageContext(page) {
    return [
      '以下是用户正在浏览的网页内容：',
      '',
      `标题: ${page.title || ''}`,
      `URL: ${page.url || ''}`,
      '',
      '内容:',
      page.text || '（未能提取到正文）'
    ].join('\n');
  }

  function buildApiMessages({ systemPrompt, pageContext, history, maxHistoryLength }) {
    const messages = [{
      role: 'system',
      content: systemPrompt || '你是一个有用的 AI 助手。'
    }];

    if (pageContext && (pageContext.title || pageContext.url || pageContext.text)) {
      messages.push({ role: 'system', content: formatPageContext(pageContext) });
    }

    const limit = maxHistoryLength == null
      ? Math.max(1, Array.isArray(history) ? history.length : 1)
      : maxHistoryLength;
    for (const message of trimHistory(history, limit)) {
      messages.push(message);
    }
    return messages;
  }

  function composeUserContent(text, selection, maxSelection) {
    const question = String(text || '').trim();
    let selected = String(selection || '').trim();
    const limit = maxSelection || DEFAULT_SELECTION_LIMIT;
    if (selected.length > limit) {
      selected = `${selected.slice(0, limit)}\n[... 选区过长，已截断 ...]`;
    }
    if (!selected) return question;
    return `选中的文字：\n${selected}\n\n问题：\n${question}`;
  }

  root.AutoWindowMessages = {
    trimHistory,
    formatPageContext,
    buildApiMessages,
    composeUserContent
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
