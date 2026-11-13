/**
 * content.js — injects the AutoWindow chat panel into the current page.
 */
(function () {
  'use strict';

  if (document.getElementById('aw-root') || !document.body) return;

  const STREAM_IDLE_MS = 30000;
  const state = {
    config: null,
    messages: [],
    isStreaming: false,
    collapsed: false,
    hidden: false,
    model: 'deepseek-v4-pro',
    models: [],
    streamTimer: null
  };
  let lastToggleAt = 0;
  let aiBubble = null;
  let reasoningWrap = null;
  let reasoningBody = null;
  let aiBody = null;
  let aiContent = '';
  let aiReasoning = '';

  const root = document.createElement('div');
  root.id = 'aw-root';
  root.innerHTML = `
    <div id="aw-container">
      <div id="aw-resize-handle"></div>
      <div id="aw-header">
        <div id="aw-header-left">
          <span class="aw-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg></span>
          <span>AutoWindow AI</span>
        </div>
        <div id="aw-header-right">
          <button class="aw-header-btn" id="aw-btn-min" type="button" title="折叠" aria-label="折叠">─</button>
          <button class="aw-header-btn" id="aw-btn-close" type="button" title="关闭" aria-label="关闭">✕</button>
        </div>
      </div>
      <div id="aw-messages"></div>
      <div id="aw-input-bar">
        <div id="aw-model-selector">
          <button id="aw-model-btn" type="button" aria-haspopup="listbox" aria-expanded="false">
            <span id="aw-model-label">DeepSeek-V4-Pro</span>
            <span aria-hidden="true">▾</span>
          </button>
          <div id="aw-model-dropdown" role="listbox"></div>
        </div>
        <div id="aw-input-wrapper">
          <textarea id="aw-input" rows="1" placeholder="输入消息，Enter 发送，Shift+Enter 换行..."
            autocomplete="off"></textarea>
        </div>
        <button id="aw-send-btn" type="button" aria-label="发送">↑</button>
      </div>
    </div>
    <button id="aw-float-btn" type="button" title="AutoWindow AI" aria-label="打开 AutoWindow AI"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg></button>
  `;
  document.body.appendChild(root);

  const $container = document.getElementById('aw-container');
  const $messages = document.getElementById('aw-messages');
  const $input = document.getElementById('aw-input');
  const $sendBtn = document.getElementById('aw-send-btn');
  const $modelBtn = document.getElementById('aw-model-btn');
  const $modelLabel = document.getElementById('aw-model-label');
  const $modelDropdown = document.getElementById('aw-model-dropdown');
  const $floatBtn = document.getElementById('aw-float-btn');
  const $resizeHandle = document.getElementById('aw-resize-handle');

  root.addEventListener('keydown', (event) => event.stopPropagation());
  root.addEventListener('keyup', (event) => event.stopPropagation());
  root.addEventListener('keypress', (event) => event.stopPropagation());
  root.addEventListener('mousedown', (event) => event.stopPropagation());
  root.addEventListener('pointerdown', (event) => event.stopPropagation());

  function escapeHtml(value) {
    return globalThis.AutoWindowMarkdown
      ? globalThis.AutoWindowMarkdown.escapeHtml(value)
      : String(value ?? '');
  }

  function contextMessage(err) {
    const message = err && err.message ? err.message : '无法连接扩展后台';
    if (/context invalidated|Extension context/i.test(message)) {
      return '扩展已更新或重新加载，请刷新页面后再试。';
    }
    return message;
  }

  function applyConfig(config) {
    const wasHidden = state.hidden;
    state.config = globalThis.AutoWindowConfig.mergeConfig(config);
    state.model = state.config.model;
    state.models = state.config.models;
    state.hidden = state.config.enabled === false;
    root.classList.toggle('aw-hidden', state.hidden);
    if (state.hidden) $floatBtn.classList.remove('aw-visible');
    buildModelDropdown();
    updateModelLabel();
    if (wasHidden && !state.hidden) $input.focus();
  }

  function buildModelDropdown() {
    $modelDropdown.innerHTML = '';
    const models = state.models.length > 0 ? state.models : globalThis.AutoWindowConfig.DEFAULT_CONFIG.models;
    models.forEach((model) => {
      const option = document.createElement('div');
      option.className = `aw-model-option${model.id === state.model ? ' aw-active' : ''}`;
      option.setAttribute('role', 'option');
      option.innerHTML = `<span>${escapeHtml(model.name)}</span><span class="aw-provider-tag">${escapeHtml(model.provider || '')}</span>`;
      option.addEventListener('click', () => selectModel(model));
      $modelDropdown.appendChild(option);
    });
  }

  function updateModelLabel() {
    const models = state.models.length > 0 ? state.models : globalThis.AutoWindowConfig.DEFAULT_CONFIG.models;
    const current = models.find((model) => model.id === state.model);
    $modelLabel.textContent = current ? current.name : state.model;
  }

  function setDropdownOpen(open) {
    $modelDropdown.classList.toggle('aw-open', open);
    $modelBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function selectModel(model) {
    state.model = model.id;
    updateModelLabel();
    setDropdownOpen(false);
    buildModelDropdown();
    chrome.runtime.sendMessage({ type: 'setConfig', config: { model: model.id } }).catch((err) => {
      addErrorMessage(contextMessage(err));
    });
  }

  function setCollapsed(collapsed) {
    state.collapsed = collapsed;
    $container.classList.toggle('aw-collapsed', collapsed);
    $floatBtn.classList.toggle('aw-visible', collapsed && !state.hidden);
    if (!collapsed) $input.focus();
  }

  function showPanel() {
    state.hidden = false;
    root.classList.remove('aw-hidden');
    if (state.collapsed) setCollapsed(false);
    else $input.focus();
  }

  function hidePanel() {
    state.hidden = true;
    root.classList.add('aw-hidden');
    $floatBtn.classList.remove('aw-visible');
  }

  function togglePanel() {
    const now = Date.now();
    if (now - lastToggleAt < 400) return;
    lastToggleAt = now;
    if (state.hidden) {
      showPanel();
      chrome.runtime.sendMessage({ type: 'setConfig', config: { enabled: true } }).catch(() => {});
      addSystemMessage('AutoWindow AI 已重新启用');
    } else {
      hidePanel();
      chrome.runtime.sendMessage({ type: 'setConfig', config: { enabled: false } }).catch(() => {});
    }
  }

  function setStreaming(active) {
    state.isStreaming = active;
    $sendBtn.classList.toggle('aw-stop', active);
    $sendBtn.textContent = active ? '■' : '↑';
    $sendBtn.setAttribute('aria-label', active ? '停止生成' : '发送');
    $input.disabled = active;
  }

  function rememberAssistant(content) {
    if (!content) return;
    state.messages.push({ role: 'assistant', content });
    state.messages = globalThis.AutoWindowMessages.trimHistory(
      state.messages,
      state.config?.maxHistoryLength || 20
    );
  }

  function resetAiBuffer() {
    aiBubble = null;
    reasoningWrap = null;
    reasoningBody = null;
    aiBody = null;
    aiContent = '';
    aiReasoning = '';
  }

  function removeLoading() {
    $messages.querySelectorAll('.aw-loading').forEach((node) => node.closest('.aw-msg')?.remove());
  }

  function ensureAiBubble() {
    if (aiBubble) return;
    removeLoading();
    aiBubble = document.createElement('div');
    aiBubble.className = 'aw-msg aw-msg-ai';
    reasoningWrap = document.createElement('details');
    reasoningWrap.className = 'aw-reasoning';
    reasoningWrap.hidden = true;
    const summary = document.createElement('summary');
    summary.textContent = '思考过程';
    reasoningBody = document.createElement('div');
    reasoningBody.className = 'aw-reasoning-body';
    reasoningWrap.append(summary, reasoningBody);
    aiBody = document.createElement('div');
    aiBubble.append(reasoningWrap, aiBody);
    $messages.appendChild(aiBubble);
  }

  function renderFinal(content, reasoning) {
    ensureAiBubble();
    if (reasoning) {
      reasoningWrap.hidden = false;
      reasoningWrap.open = !content;
      reasoningBody.textContent = reasoning;
    } else if (reasoningWrap) {
      reasoningWrap.hidden = true;
      reasoningBody.textContent = '';
    }
    aiBody.innerHTML = globalThis.AutoWindowMarkdown.renderMarkdown(content || '');
    scrollToBottom();
  }

  function endStream({ cancel = false, error = '', content = null, reasoning = null, emptyNotice = '' } = {}) {
    if (!state.isStreaming) return;
    const finalContent = content == null ? aiContent : content;
    const finalReasoning = reasoning == null ? aiReasoning : reasoning;
    setStreaming(false);
    clearTimeout(state.streamTimer);
    if (cancel) chrome.runtime.sendMessage({ type: 'cancelStream' }).catch(() => {});
    removeLoading();
    if (finalContent || finalReasoning) {
      renderFinal(finalContent, finalReasoning);
      rememberAssistant(finalContent);
      if (!finalContent && finalReasoning) addSystemMessage('模型只返回了思考过程，没有正文。');
    } else if (emptyNotice) {
      addSystemMessage(emptyNotice);
    }
    resetAiBuffer();
    if (error) addErrorMessage(error);
    $input.disabled = false;
    $input.focus();
  }

  function armIdleTimer() {
    clearTimeout(state.streamTimer);
    state.streamTimer = setTimeout(() => {
      endStream({ cancel: true, error: '请求超时，请重试' });
    }, STREAM_IDLE_MS);
  }

  function appendDelta(content, reasoning) {
    ensureAiBubble();
    if (reasoning) {
      aiReasoning += reasoning;
      reasoningWrap.hidden = false;
      if (!aiContent) reasoningWrap.open = true;
      reasoningBody.textContent = aiReasoning;
    }
    if (content) {
      aiContent += content;
      if (reasoningWrap) reasoningWrap.open = false;
      aiBody.innerHTML = globalThis.AutoWindowMarkdown.renderMarkdown(aiContent);
    }
    scrollToBottom();
  }

  function readPageContext() {
    if (!globalThis.AutoWindowParser) return null;
    try {
      return globalThis.AutoWindowParser.parsePage();
    } catch (err) {
      console.error('[AutoWindow] 页面解析失败', err);
      return { title: document.title || '', url: location.href, text: '', length: 0 };
    }
  }

  function readSelection() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return '';
    const text = selection.toString().trim();
    if (!text) return '';
    const node = selection.anchorNode;
    const element = node && (node.nodeType === 1 ? node : node.parentElement);
    if (element && root.contains(element)) return '';
    return text;
  }

  async function refreshConfig() {
    const response = await chrome.runtime.sendMessage({ type: 'getConfig' });
    if (response && response.config) applyConfig(response.config);
    if (response && response.error) throw new Error(response.error);
  }

  async function sendMessage() {
    const text = $input.value.trim();
    if (!text || state.isStreaming) return;
    const selection = readSelection();
    $input.value = '';
    autoResizeInput();
    addUserMessage(text);

    try {
      await refreshConfig();
    } catch (err) {
      addErrorMessage(contextMessage(err));
      return;
    }

    const userContent = globalThis.AutoWindowMessages.composeUserContent(text, selection);
    state.messages.push({ role: 'user', content: userContent });
    state.messages = globalThis.AutoWindowMessages.trimHistory(
      state.messages,
      state.config.maxHistoryLength
    );
    if (state.hidden || state.config?.enabled === false) {
      addErrorMessage('AutoWindow AI 已禁用，请在工具栏中启用');
      return;
    }
    const apiMessages = globalThis.AutoWindowMessages.buildApiMessages({
      systemPrompt: state.config.systemPrompt,
      pageContext: readPageContext(),
      history: state.messages,
      maxHistoryLength: state.config.maxHistoryLength
    });

    addLoadingMessage();
    setStreaming(true);
    armIdleTimer();

    let response;
    try {
      response = await chrome.runtime.sendMessage({ type: 'chatStream', messages: apiMessages });
    } catch (err) {
      endStream({ error: contextMessage(err) });
      return;
    }
    if (!state.isStreaming) return;
    if (response && response.error) {
      endStream({ error: response.error });
      return;
    }
    if (response && (response.streaming || response.aborted)) {
      endStream({ emptyNotice: '模型没有返回内容' });
      return;
    }
    endStream({ error: '没有收到模型响应' });
  }

  function createMessageElement(role, text) {
    const element = document.createElement('div');
    element.className = `aw-msg aw-msg-${role}`;
    element.textContent = text;
    return element;
  }

  function addUserMessage(text) {
    $messages.appendChild(createMessageElement('user', text));
    scrollToBottom();
  }

  function addSystemMessage(text) {
    $messages.appendChild(createMessageElement('system', text));
    scrollToBottom();
  }

  function addErrorMessage(text) {
    $messages.appendChild(createMessageElement('error', text));
    scrollToBottom();
  }

  function addLoadingMessage() {
    const element = document.createElement('div');
    element.className = 'aw-msg aw-msg-ai';
    element.innerHTML = '<div class="aw-loading" aria-label="正在生成"><span></span><span></span><span></span></div>';
    $messages.appendChild(element);
    scrollToBottom();
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      $messages.scrollTop = $messages.scrollHeight;
    });
  }

  function autoResizeInput() {
    $input.style.height = 'auto';
    $input.style.height = `${Math.min(120, $input.scrollHeight)}px`;
  }

  $modelBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    setDropdownOpen(!$modelDropdown.classList.contains('aw-open'));
  });
  document.addEventListener('click', () => setDropdownOpen(false));
  document.getElementById('aw-btn-min').addEventListener('click', () => setCollapsed(!state.collapsed));
  $floatBtn.addEventListener('click', () => setCollapsed(false));
  document.getElementById('aw-btn-close').addEventListener('click', () => {
    hidePanel();
    chrome.runtime.sendMessage({ type: 'setConfig', config: { enabled: false } }).catch(() => {});
  });
  $sendBtn.addEventListener('click', () => {
    if (state.isStreaming) {
      endStream({ cancel: true });
      return;
    }
    sendMessage();
  });
  $input.addEventListener('keydown', (event) => {
    if (globalThis.AutoWindowKeys.shouldSendOnEnter(event)) {
      event.preventDefault();
      sendMessage();
    }
  });
  $input.addEventListener('input', autoResizeInput);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setDropdownOpen(false);
    if (globalThis.AutoWindowKeys.isToggleShortcut(event)) {
      event.preventDefault();
      event.stopPropagation();
      togglePanel();
    }
  }, true);

  let resizeStartY = 0;
  let resizeStartHeight = 0;
  function onResizeMove(event) {
    const next = Math.max(200, Math.min(window.innerHeight * 0.8, resizeStartHeight + (resizeStartY - event.clientY)));
    $container.style.height = `${next}px`;
  }
  function onResizeEnd(event) {
    $resizeHandle.removeEventListener('pointermove', onResizeMove);
    $resizeHandle.removeEventListener('pointerup', onResizeEnd);
    try {
      $resizeHandle.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture was already released.
    }
  }
  $resizeHandle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    resizeStartY = event.clientY;
    resizeStartHeight = $container.offsetHeight;
    $resizeHandle.setPointerCapture(event.pointerId);
    $resizeHandle.addEventListener('pointermove', onResizeMove);
    $resizeHandle.addEventListener('pointerup', onResizeEnd);
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || !message.type) return;
    if (!state.isStreaming && (message.type === 'streamChunk' || message.type === 'streamEnd' || message.type === 'streamError')) {
      return;
    }

    switch (message.type) {
      case 'streamChunk':
        armIdleTimer();
        appendDelta(message.content || message.chunk || '', message.reasoning || '');
        break;
      case 'streamEnd': {
        const result = message.result || {};
        endStream({
          content: result.content || aiContent,
          reasoning: result.reasoning || aiReasoning,
          emptyNotice: '模型没有返回内容'
        });
        break;
      }
      case 'streamError':
        endStream({ error: message.error || '请求失败' });
        break;
      case 'show':
        showPanel();
        break;
      case 'hide':
        hidePanel();
        break;
      case 'toggle':
        togglePanel();
        break;
      case 'modelChanged':
        state.model = message.model;
        updateModelLabel();
        buildModelDropdown();
        addSystemMessage(`模型已切换为 ${$modelLabel.textContent}`);
        break;
      case 'clearChat':
        state.messages = [];
        resetAiBuffer();
        $messages.innerHTML = '';
        addSystemMessage('对话已清除。当前页面内容将在下次发送时重新读取。');
        break;
      default:
        break;
    }
  });

  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync' || !changes.autowindow_config) return;
      applyConfig(changes.autowindow_config.newValue);
    });
  }

  async function init() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'getConfig' });
      if (response && response.config) applyConfig(response.config);
      else if (response && response.error) addErrorMessage(response.error);
    } catch (err) {
      addErrorMessage(contextMessage(err));
    }
    addSystemMessage('AutoWindow AI 已就绪。发送消息时会读取当前页面的主要内容。');
    addSystemMessage(`页面: ${(document.title || '').slice(0, 80)}`);
    autoResizeInput();
  }

  init();
})();
