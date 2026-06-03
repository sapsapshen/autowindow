/**
 * content.js — AutoWindow AI 对话框注入脚本
 * 在每个页面底部注入 AI 聊天组件
 */
(function () {
  'use strict';

  // 防止重复注入
  if (document.getElementById('aw-root')) return;

  // ========== 常量 ==========
  const STREAM_CHUNK_TIMEOUT = 30000; // 流式超时 30s

  // ========== 状态 ==========
  let state = {
    config: null,
    messages: [],         // 当前会话消息历史
    isStreaming: false,
    collapsed: false,
    hidden: false,
    model: 'deepseek-v4-pro',
    models: [],
    streamTimer: null
  };

  // ========== DOM 构建 ==========
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
          <button class="aw-header-btn" id="aw-btn-min" title="折叠">─</button>
          <button class="aw-header-btn" id="aw-btn-close" title="关闭">✕</button>
        </div>
      </div>
      <div id="aw-messages"></div>
      <div id="aw-input-bar">
        <div id="aw-model-selector">
          <button id="aw-model-btn">
            <span id="aw-model-label">DeepSeek-V3</span>
            <span>▾</span>
          </button>
          <div id="aw-model-dropdown"></div>
        </div>
        <div id="aw-input-wrapper">
          <textarea id="aw-input" rows="1" placeholder="输入消息，Enter 发送，Shift+Enter 换行..."
            autocomplete="off"></textarea>
        </div>
        <button id="aw-send-btn">↑</button>
      </div>
    </div>
    <button id="aw-float-btn" title="AutoWindow AI"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg></button>
  `;

  document.body.appendChild(root);

  // ========== DOM 引用 ==========
  const $container = document.getElementById('aw-container');
  const $messages = document.getElementById('aw-messages');
  const $input = document.getElementById('aw-input');
  const $sendBtn = document.getElementById('aw-send-btn');
  const $modelBtn = document.getElementById('aw-model-btn');
  const $modelLabel = document.getElementById('aw-model-label');
  const $modelDropdown = document.getElementById('aw-model-dropdown');
  const $floatBtn = document.getElementById('aw-float-btn');
  const $header = document.getElementById('aw-header');
  const $resizeHandle = document.getElementById('aw-resize-handle');

  // ========== 初始化 ==========
  async function init() {
    // 获取配置
    const configResp = await chrome.runtime.sendMessage({ type: 'getConfig' });
    if (configResp.config) {
      state.config = configResp.config;
      state.model = configResp.config.model || 'deepseek-v4-pro';
      state.models = configResp.config.models || [];
      state.hidden = !configResp.config.enabled;
    }

    // 应用可见性
    if (state.hidden) {
      root.classList.add('aw-hidden');
    }

    // 构建模型列表
    buildModelDropdown();
    updateModelLabel();

    // 显示欢迎消息
    addSystemMessage('AutoWindow AI 已就绪。当前页面内容已自动纳入对话上下文。');
    addSystemMessage(`页面: ${document.title.substring(0, 80)}`);

    // 自动调整输入框高度
    autoResizeInput();
  }

  // ========== 模型选择器 ==========
  function buildModelDropdown() {
    $modelDropdown.innerHTML = '';
    const models = state.models.length > 0 ? state.models : [
      { id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro', provider: 'deepseek' },
      { id: 'deepseek-v4-flash', name: 'DeepSeek-V4-Flash', provider: 'deepseek' }
    ];

    models.forEach(m => {
      const opt = document.createElement('div');
      opt.className = 'aw-model-option' + (m.id === state.model ? ' aw-active' : '');
      opt.innerHTML = `
        <span>${escHtml(m.name)}</span>
        <span class="aw-provider-tag">${escHtml(m.provider || '')}</span>
      `;
      opt.addEventListener('click', () => selectModel(m));
      $modelDropdown.appendChild(opt);
    });
  }

  function updateModelLabel() {
    const models = state.models.length > 0 ? state.models : [
      { id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro' },
      { id: 'deepseek-v4-flash', name: 'DeepSeek-V4-Flash' }
    ];
    const current = models.find(m => m.id === state.model);
    $modelLabel.textContent = current ? current.name : state.model;
  }

  function selectModel(model) {
    state.model = model.id;
    updateModelLabel();
    $modelDropdown.classList.remove('aw-open');
    buildModelDropdown();
    // 持久化
    chrome.runtime.sendMessage({ type: 'setConfig', config: { model: model.id } }).catch(() => {});
  }

  $modelBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    $modelDropdown.classList.toggle('aw-open');
  });

  document.addEventListener('click', () => {
    $modelDropdown.classList.remove('aw-open');
  });

  // ========== 折叠 / 展开 ==========
  document.getElementById('aw-btn-min').addEventListener('click', () => {
    state.collapsed = !state.collapsed;
    if (state.collapsed) {
      $container.classList.add('aw-collapsed');
      $floatBtn.style.display = 'flex';
    } else {
      $container.classList.remove('aw-collapsed');
      $floatBtn.style.display = 'none';
    }
  });

  $floatBtn.addEventListener('click', () => {
    state.collapsed = false;
    $container.classList.remove('aw-collapsed');
    $floatBtn.style.display = 'none';
    $input.focus();
  });

  // ========== 关闭 ==========
  document.getElementById('aw-btn-close').addEventListener('click', () => {
    root.classList.add('aw-hidden');
    state.hidden = true;
    chrome.runtime.sendMessage({ type: 'setConfig', config: { enabled: false } }).catch(() => {});
  });

  // ========== 调整大小 ==========
  let resizeStartY = 0;
  let resizeStartHeight = 0;

  $resizeHandle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    resizeStartY = e.clientY;
    resizeStartHeight = $container.offsetHeight;
    document.addEventListener('mousemove', onResizeMove);
    document.addEventListener('mouseup', onResizeEnd);
  });

  function onResizeMove(e) {
    const deltaY = resizeStartY - e.clientY;
    const newHeight = Math.max(200, Math.min(window.innerHeight * 0.8, resizeStartHeight + deltaY));
    $container.style.height = newHeight + 'px';
  }

  function onResizeEnd() {
    document.removeEventListener('mousemove', onResizeMove);
    document.removeEventListener('mouseup', onResizeEnd);
  }

  // ========== 输入处理 ==========
  $input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  $input.addEventListener('input', autoResizeInput);

  function autoResizeInput() {
    $input.style.height = 'auto';
    $input.style.height = Math.min(120, $input.scrollHeight) + 'px';
  }

  $sendBtn.addEventListener('click', sendMessage);

  // ========== 消息发送 ==========
  async function sendMessage() {
    const text = $input.value.trim();
    if (!text || state.isStreaming) return;

    $input.value = '';
    autoResizeInput();

    // 添加用户消息
    addUserMessage(text);

    // 如果是第一条消息，先添加页面上下文
    if (state.messages.length === 0) {
      addPageContext();
    }

    // 构建消息列表
    state.messages.push({ role: 'user', content: text });
    const apiMessages = buildApiMessages();

    // 显示加载状态
    const loadId = addLoadingMessage();
    state.isStreaming = true;
    $sendBtn.disabled = true;
    $input.disabled = true;

    // 超时计时器
    state.streamTimer = setTimeout(() => {
      if (state.isStreaming) {
        removeLoadingMessage(loadId);
        addErrorMessage('请求超时，请重试');
        finishStreaming();
      }
    }, STREAM_CHUNK_TIMEOUT);

    // 发送流式请求
    chrome.runtime.sendMessage({
      type: 'chatStream',
      messages: apiMessages
    }).catch(err => {
      clearTimeout(state.streamTimer);
      removeLoadingMessage(loadId);
      addErrorMessage(err.message || '发送失败');
      finishStreaming();
    });
  }

  function buildApiMessages() {
    const systemPrompt = state.config?.systemPrompt || '你是一个有用的 AI 助手。';
    const messages = [{ role: 'system', content: systemPrompt }];

    // 添加页面上下文（如果已有）
    if (state._pageContext) {
      messages.push({
        role: 'system',
        content: `以下是用户正在浏览的网页内容：\n\n标题: ${state._pageContext.title}\nURL: ${state._pageContext.url}\n\n内容:\n${state._pageContext.text}`
      });
    }

    // 添加历史消息
    for (const msg of state.messages) {
      messages.push(msg);
    }

    return messages;
  }

  function addPageContext() {
    if (window.AutoWindowParser && !state._pageContext) {
      state._pageContext = window.AutoWindowParser.parsePage();
    }
  }

  // ========== 流式响应处理 ==========
  chrome.runtime.onMessage.addListener((message) => {
    // 已结束则忽略后续消息（如超时后到达的流式数据）
    if (!state.isStreaming && 
        (message.type === 'streamChunk' || message.type === 'streamEnd' || message.type === 'streamError')) {
      return;
    }

    switch (message.type) {
      case 'streamChunk':
        clearTimeout(state.streamTimer);
        appendToLastAiMessage(message.chunk);
        // 重置超时
        state.streamTimer = setTimeout(() => {
          if (state.isStreaming) {
            addErrorMessage('请求超时');
            finishStreaming();
          }
        }, STREAM_CHUNK_TIMEOUT);
        break;

      case 'streamEnd':
        clearTimeout(state.streamTimer);
        removeLoadingMessage();
        finalizeLastAiMessage(message.result.content);
        state.messages.push({ role: 'assistant', content: message.result.content });
        finishStreaming();
        break;

      case 'streamError':
        clearTimeout(state.streamTimer);
        removeLoadingMessage();
        addErrorMessage(message.error || '请求失败');
        finishStreaming();
        break;

      case 'show':
        root.classList.remove('aw-hidden');
        state.hidden = false;
        if (state.collapsed) {
          state.collapsed = false;
          $container.classList.remove('aw-collapsed');
          $floatBtn.style.display = 'none';
        }
        break;

      case 'hide':
        root.classList.add('aw-hidden');
        state.hidden = true;
        break;

      case 'modelChanged':
        state.model = message.model;
        updateModelLabel();
        buildModelDropdown();
        addSystemMessage(`模型已切换为 ${$modelLabel.textContent}`);
        break;

      case 'clearChat':
        state.messages = [];
        state._pageContext = null;
        $messages.innerHTML = '';
        addSystemMessage('对话已清除。当前页面内容将在下次对话中重新加载。');
        break;
    }
  });

  let _aiMessageEl = null;
  let _aiMessageContent = '';

  function appendToLastAiMessage(chunk) {
    if (!_aiMessageEl) {
      // 移除加载动画，创建 AI 消息
      removeLoadingMessage();
      _aiMessageEl = createMessageElement('ai', '');
      $messages.appendChild(_aiMessageEl);
    }
    _aiMessageContent += chunk;
    _aiMessageEl.innerHTML = simpleMarkdown(_aiMessageContent);
    scrollToBottom();
  }

  function finalizeLastAiMessage(content) {
    if (_aiMessageEl) {
      _aiMessageEl.innerHTML = simpleMarkdown(content);
      _aiMessageEl = null;
      _aiMessageContent = '';
    }
  }

  function finishStreaming() {
    state.isStreaming = false;
    $sendBtn.disabled = false;
    $input.disabled = false;
    $input.focus();
  }

  // ========== 消息渲染 ==========
  function addUserMessage(text) {
    const el = createMessageElement('user', text);
    $messages.appendChild(el);
    scrollToBottom();
  }

  function addSystemMessage(text) {
    const el = createMessageElement('system', text);
    $messages.appendChild(el);
    scrollToBottom();
  }

  function addErrorMessage(text) {
    const el = createMessageElement('error', text);
    $messages.appendChild(el);
    scrollToBottom();
  }

  let _loadingId = 0;
  function addLoadingMessage() {
    _loadingId++;
    const id = 'aw-loading-' + _loadingId;
    const el = document.createElement('div');
    el.id = id;
    el.className = 'aw-msg aw-msg-ai';
    el.innerHTML = '<div class="aw-loading"><span></span><span></span><span></span></div>';
    $messages.appendChild(el);
    scrollToBottom();
    return id;
  }

  function removeLoadingMessage(id) {
    if (id) {
      const el = document.getElementById(id);
      if (el) el.remove();
    } else {
      // 移除所有加载动画
      $messages.querySelectorAll('.aw-loading').forEach(l => {
        l.closest('.aw-msg')?.remove();
      });
    }
    _aiMessageEl = null;
    _aiMessageContent = '';
  }

  function createMessageElement(role, text) {
    const el = document.createElement('div');
    el.className = `aw-msg aw-msg-${role}`;
    if (role === 'ai') {
      el.innerHTML = simpleMarkdown(text);
    } else {
      el.textContent = text;
    }
    return el;
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      $messages.scrollTop = $messages.scrollHeight;
    });
  }

  // ========== 简单 Markdown 渲染 ==========
  function simpleMarkdown(text) {
    if (!text) return '';
    let html = escHtml(text);

    // 代码块 ```
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      return `<pre><code>${escHtml(code.trim())}</code></pre>`;
    });

    // 行内代码 `
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // 粗体 **
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // 斜体 *
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // 标题 ### (h3-h6)
    html = html.replace(/^#{3,6}\s+(.+)$/gm, '<strong>$1</strong>');

    // 标题 ## (h2)
    html = html.replace(/^##\s+(.+)$/gm, '<strong>$1</strong>');

    // 标题 # (h1)
    html = html.replace(/^#\s+(.+)$/gm, '<strong>$1</strong>');

    // 引用 >
    html = html.replace(/^&gt;\s?(.+)$/gm, '<blockquote>$1</blockquote>');

    // 无序列表
    html = html.replace(/^[\-\*]\s+(.+)$/gm, '• $1');

    // 有序列表
    html = html.replace(/^\d+\.\s+(.+)$/gm, '$1');

    // 段落间空行
    html = html.replace(/\n\n/g, '</p><p>');
    html = html.replace(/\n/g, '<br>');
    html = '<p>' + html + '</p>';

    // 修复 blockquote 中的 p
    html = html.replace(/<blockquote><p>/g, '<blockquote>');
    html = html.replace(/<\/p><\/blockquote>/g, '</blockquote>');

    return html;
  }

  function escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ========== 快捷键 ==========
  document.addEventListener('keydown', (e) => {
    // Ctrl+Shift+K 切换对话框
    if (e.ctrlKey && e.shiftKey && e.key === 'K') {
      e.preventDefault();
      if (state.hidden) {
        root.classList.remove('aw-hidden');
        state.hidden = false;
        chrome.runtime.sendMessage({ type: 'setConfig', config: { enabled: true } }).catch(() => {});
        addSystemMessage('AutoWindow AI 已重新启用');
      } else {
        root.classList.add('aw-hidden');
        state.hidden = true;
        chrome.runtime.sendMessage({ type: 'setConfig', config: { enabled: false } }).catch(() => {});
      }
    }
  });

  // ========== 启动 ==========
  init();
  console.log('[AutoWindow] 对话框已注入:', window.location.href);
})();
