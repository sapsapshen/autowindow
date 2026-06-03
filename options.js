/**
 * options.js — 设置页逻辑
 */

document.addEventListener('DOMContentLoaded', async () => {
  // DOM 引用
  const $apiKey = document.getElementById('api-key');
  const $apiBaseUrl = document.getElementById('api-base-url');
  const $modelList = document.getElementById('model-list');
  const $systemPrompt = document.getElementById('system-prompt');
  const $temperature = document.getElementById('temperature');
  const $maxTokens = document.getElementById('max-tokens');
  const $btnSave = document.getElementById('btn-save');
  const $btnReset = document.getElementById('btn-reset');
  const $btnAddModel = document.getElementById('btn-add-model');
  const $btnClearAll = document.getElementById('btn-clear-all');
  const $toast = document.getElementById('save-toast');

  // 默认配置
  const DEFAULTS = {
    enabled: true,
    apiKey: '',
    apiBaseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-v4-pro',
    models: [
      { id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro', provider: 'deepseek' },
      { id: 'deepseek-v4-flash', name: 'DeepSeek-V4-Flash', provider: 'deepseek' }
    ],
    systemPrompt: '你是一个有用的 AI 助手。请根据用户提供的网页内容回答问题。如果网页内容不足以回答问题，请如实告知。请用简洁清晰的中文回答（除非用户用其他语言提问）。',
    temperature: 0.7,
    maxTokens: 4096
  };

  let config = { ...DEFAULTS };

  // 加载配置
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'getConfig' });
    if (resp.config) {
      config = { ...DEFAULTS, ...resp.config };
      // 确保 models 是数组
      if (!Array.isArray(config.models) || config.models.length === 0) {
        config.models = [...DEFAULTS.models];
      }
    }
  } catch (err) {
    console.error('加载配置失败:', err);
  }

  // 填充表单
  function renderForm() {
    $apiKey.value = config.apiKey || '';
    $apiBaseUrl.value = config.apiBaseUrl || DEFAULTS.apiBaseUrl;
    $systemPrompt.value = config.systemPrompt || DEFAULTS.systemPrompt;
    $temperature.value = config.temperature ?? 0.7;
    $maxTokens.value = config.maxTokens ?? 4096;
    renderModelList();
  }

  function renderModelList() {
    $modelList.innerHTML = '';
    config.models.forEach((m, i) => {
      const row = document.createElement('div');
      row.className = 'model-item';
      row.innerHTML = `
        <input type="text" class="model-id" value="${escAttr(m.id)}" placeholder="模型 ID" data-index="${i}" data-field="id">
        <input type="text" class="model-name" value="${escAttr(m.name)}" placeholder="显示名称" data-index="${i}" data-field="name">
        <input type="text" class="model-provider" value="${escAttr(m.provider || '')}" placeholder="提供商" data-index="${i}" data-field="provider">
        <button class="btn-danger" data-index="${i}" data-action="remove">删除</button>
      `;
      $modelList.appendChild(row);
    });

    // 绑定删除事件
    $modelList.querySelectorAll('[data-action="remove"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index);
        config.models.splice(idx, 1);
        // 如果删除了当前模型，切换到第一个
        if (config.model === config.models[idx]?.id === false && config.models.length > 0) {
          // 检查被删除的是否是当前模型
        }
        renderModelList();
      });
    });

    // 绑定输入变更
    $modelList.querySelectorAll('input').forEach(input => {
      input.addEventListener('change', () => {
        const idx = parseInt(input.dataset.index);
        const field = input.dataset.field;
        if (config.models[idx]) {
          config.models[idx][field] = input.value;
        }
      });
    });
  }

  // 添加模型
  $btnAddModel.addEventListener('click', () => {
    config.models.push({ id: '', name: '', provider: '' });
    renderModelList();
    // 聚焦新行的 ID 输入框
    const lastIdInput = $modelList.querySelector('.model-item:last-child .model-id');
    if (lastIdInput) lastIdInput.focus();
  });

  // 收集表单数据
  function collectForm() {
    config.apiKey = $apiKey.value.trim();
    config.apiBaseUrl = $apiBaseUrl.value.trim() || DEFAULTS.apiBaseUrl;
    config.systemPrompt = $systemPrompt.value.trim() || DEFAULTS.systemPrompt;
    config.temperature = parseFloat($temperature.value) || 0.7;
    config.maxTokens = parseInt($maxTokens.value) || 4096;

    // 收集模型列表
    const rows = $modelList.querySelectorAll('.model-item');
    const models = [];
    rows.forEach(row => {
      const idInput = row.querySelector('.model-id');
      const nameInput = row.querySelector('.model-name');
      const providerInput = row.querySelector('.model-provider');
      if (idInput && nameInput) {
        const id = idInput.value.trim();
        const name = nameInput.value.trim();
        if (id && name) {
          models.push({
            id,
            name,
            provider: providerInput ? providerInput.value.trim() : ''
          });
        }
      }
    });
    config.models = models.length > 0 ? models : [...DEFAULTS.models];

    // 如果当前模型不在列表中，自动设为第一个
    if (!config.models.find(m => m.id === config.model)) {
      config.model = config.models[0]?.id || 'deepseek-v4-pro';
    }
  }

  // 保存
  $btnSave.addEventListener('click', async () => {
    collectForm();
    try {
      await chrome.runtime.sendMessage({ type: 'setConfig', config });
      showToast();
    } catch (err) {
      alert('保存失败: ' + err.message);
    }
  });

  // 恢复默认
  $btnReset.addEventListener('click', () => {
    if (confirm('确定要恢复默认设置吗？这将覆盖当前所有配置。')) {
      config = { ...DEFAULTS, models: [...DEFAULTS.models] };
      renderForm();
    }
  });

  // 清除所有
  $btnClearAll.addEventListener('click', async () => {
    if (confirm('确定要清除所有数据吗？此操作不可撤销！\n\n将删除：API Key、模型列表、所有自定义设置。')) {
      try {
        await chrome.storage.sync.clear();
        config = { ...DEFAULTS, models: [...DEFAULTS.models] };
        renderForm();
        showToast();
      } catch (err) {
        alert('清除失败: ' + err.message);
      }
    }
  });

  // Toast
  function showToast() {
    $toast.classList.add('show');
    setTimeout(() => $toast.classList.remove('show'), 2000);
  }

  function escAttr(str) {
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // 初始化
  renderForm();
});
