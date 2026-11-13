(function (root) {
  'use strict';

  function validateChat(config, message) {
    if (!config || !config.apiKey) return { error: '请先在扩展设置中配置 API Key' };
    if (config.enabled === false) return { error: 'AutoWindow AI 已禁用，请在工具栏中启用' };
    if (!message || !Array.isArray(message.messages) || message.messages.length === 0) {
      return { error: '消息不能为空' };
    }
    return null;
  }

  function tabIdOf(sender) {
    return sender && sender.tab ? sender.tab.id : undefined;
  }

  function createChatController(deps) {
    const active = new Map();

    function cancel(sender) {
      const tabId = tabIdOf(sender);
      const controller = active.get(tabId);
      if (controller) controller.abort();
    }

    async function complete(message) {
      const config = await deps.getConfig();
      const rejected = validateChat(config, message);
      if (rejected) return rejected;
      try {
        return { result: await deps.complete(config, message.messages) };
      } catch (err) {
        return { error: deps.formatError(err) };
      }
    }

    async function stream(message, sender) {
      const config = await deps.getConfig();
      const rejected = validateChat(config, message);
      if (rejected) return rejected;

      const tabId = tabIdOf(sender);
      if (!tabId) return { error: '无法获取当前标签页' };

      const controller = new AbortController();
      active.set(tabId, controller);
      try {
        const result = await deps.stream(config, message.messages, {
          signal: controller.signal,
          onDelta(delta) {
            return deps.sendChunk(tabId, delta);
          }
        });
        if (controller.signal.aborted) return { aborted: true };
        await deps.sendEnd(tabId, result);
        return { streaming: true };
      } catch (err) {
        if ((err && err.name === 'AbortError') || controller.signal.aborted) return { aborted: true };
        const error = deps.formatError(err);
        try {
          await deps.sendError(tabId, error);
        } catch {
          // The tab is already gone.
        }
        return { error };
      } finally {
        if (active.get(tabId) === controller) active.delete(tabId);
      }
    }

    async function handle(message, sender) {
      switch (message && message.type) {
        case 'getConfig':
          return { config: await deps.getConfig() };
        case 'setConfig':
          return { success: true, config: await deps.setConfig((message && message.config) || {}) };
        case 'getModels': {
          const config = await deps.getConfig();
          return { models: config.models };
        }
        case 'getModelPresets':
          return { presets: deps.presets };
        case 'cancelStream':
          cancel(sender);
          return { success: true };
        case 'chat':
          return complete(message);
        case 'chatStream':
          return stream(message, sender);
        default:
          return { error: `未知消息类型: ${message && message.type}` };
      }
    }

    return { handle };
  }

  root.AutoWindowChat = { createChatController };
})(typeof globalThis !== 'undefined' ? globalThis : this);
