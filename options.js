/**
 * options.js — settings page.
 */
document.addEventListener('DOMContentLoaded', async () => {
  const $apiKey = document.getElementById('api-key');
  const $apiBaseUrl = document.getElementById('api-base-url');
  const $modelList = document.getElementById('model-list');
  const $systemPrompt = document.getElementById('system-prompt');
  const $temperature = document.getElementById('temperature');
  const $maxTokens = document.getElementById('max-tokens');
  const $maxHistory = document.getElementById('max-history');
  const $thinking = document.getElementById('thinking');
  const $btnSave = document.getElementById('btn-save');
  const $btnReset = document.getElementById('btn-reset');
  const $btnAddModel = document.getElementById('btn-add-model');
  const $btnClearAll = document.getElementById('btn-clear-all');
  const $toast = document.getElementById('save-toast');

  let config = AutoWindowConfig.mergeConfig(null);
  let toastTimer = 0;

  function showToast(message, isError) {
    $toast.textContent = message;
    $toast.classList.toggle('error', Boolean(isError));
    $toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $toast.classList.remove('show'), 2400);
  }

  function escAttr(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function renderModelList() {
    $modelList.innerHTML = '';
    config.models.forEach((model, index) => {
      const row = document.createElement('div');
      row.className = 'model-item';
      row.innerHTML = `
        <input type="text" class="model-id" value="${escAttr(model.id)}" placeholder="模型 ID" data-index="${index}" data-field="id">
        <input type="text" class="model-name" value="${escAttr(model.name)}" placeholder="显示名称" data-index="${index}" data-field="name">
        <input type="text" class="model-provider" value="${escAttr(model.provider || '')}" placeholder="提供商" data-index="${index}" data-field="provider">
        <button class="btn-danger" type="button" data-index="${index}" data-action="remove">删除</button>
      `;
      $modelList.appendChild(row);
    });
  }

  function renderForm() {
    $apiKey.value = config.apiKey || '';
    $apiBaseUrl.value = config.apiBaseUrl || AutoWindowConfig.DEFAULT_CONFIG.apiBaseUrl;
    $systemPrompt.value = config.systemPrompt || '';
    $temperature.value = config.temperature;
    $maxTokens.value = config.maxTokens;
    $maxHistory.value = config.maxHistoryLength;
    $thinking.checked = config.thinking === true;
    renderModelList();
  }

  function collectForm() {
    const models = [];
    $modelList.querySelectorAll('.model-item').forEach((row) => {
      const id = row.querySelector('.model-id').value.trim();
      const name = row.querySelector('.model-name').value.trim();
      const provider = row.querySelector('.model-provider').value.trim();
      if (!id || !name) return;
      models.push({ id, name, provider });
    });

    return {
      apiKey: $apiKey.value.trim(),
      apiBaseUrl: $apiBaseUrl.value.trim(),
      systemPrompt: $systemPrompt.value,
      temperature: $temperature.value === '' ? undefined : Number($temperature.value),
      maxTokens: $maxTokens.value === '' ? undefined : Number($maxTokens.value),
      maxHistoryLength: $maxHistory.value === '' ? undefined : Number($maxHistory.value),
      thinking: $thinking.checked,
      models,
      model: config.model,
      enabled: config.enabled !== false
    };
  }

  async function ensureHostAccess(apiBaseUrl) {
    if (!chrome.permissions || !chrome.permissions.contains || !chrome.permissions.request) return true;
    const pattern = `${new URL(apiBaseUrl).origin}/*`;
    if (await chrome.permissions.contains({ origins: [pattern] })) return true;
    return chrome.permissions.request({ origins: [pattern] });
  }

  async function persist(partial) {
    const response = await chrome.runtime.sendMessage({ type: 'setConfig', config: partial });
    if (!response || response.error) throw new Error((response && response.error) || '保存失败');
    config = AutoWindowConfig.mergeConfig(response.config || partial);
    renderForm();
  }

  $modelList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action="remove"]');
    if (!button) return;
    const index = Number(button.dataset.index);
    const removed = config.models[index];
    config.models.splice(index, 1);
    if (removed && removed.id === config.model) config.model = config.models[0]?.id || '';
    renderModelList();
  });

  $modelList.addEventListener('input', (event) => {
    const input = event.target;
    if (!input.dataset || !input.dataset.field) return;
    const index = Number(input.dataset.index);
    if (!config.models[index]) return;
    config.models[index][input.dataset.field] = input.value;
  });

  $btnAddModel.addEventListener('click', () => {
    config.models.push({ id: '', name: '', provider: '' });
    renderModelList();
    const last = $modelList.querySelector('.model-item:last-child .model-id');
    if (last) last.focus();
  });

  $btnSave.addEventListener('click', async () => {
    const draft = collectForm();
    const urlCheck = AutoWindowConfig.validateBaseUrl(draft.apiBaseUrl);
    if (!urlCheck.ok) {
      showToast(urlCheck.error, true);
      return;
    }
    draft.apiBaseUrl = urlCheck.url;
    $btnSave.disabled = true;
    try {
      const allowed = await ensureHostAccess(draft.apiBaseUrl);
      if (!allowed) {
        showToast('未授予该 API 地址的访问权限', true);
        return;
      }
      await persist(draft);
      showToast('设置已保存');
    } catch (err) {
      showToast(err.message || '保存失败', true);
    } finally {
      $btnSave.disabled = false;
    }
  });

  $btnReset.addEventListener('click', async () => {
    if (!confirm('恢复默认设置并保存？API Key 和启用状态会保留。')) return;
    $btnReset.disabled = true;
    try {
      await persist({
        ...AutoWindowConfig.DEFAULT_CONFIG,
        models: AutoWindowConfig.DEFAULT_CONFIG.models.map((model) => ({ ...model })),
        apiKey: config.apiKey,
        enabled: config.enabled
      });
      showToast('已恢复默认设置');
    } catch (err) {
      showToast(err.message || '恢复失败', true);
    } finally {
      $btnReset.disabled = false;
    }
  });

  $btnClearAll.addEventListener('click', async () => {
    if (!confirm('确定要清除所有数据吗？此操作不可撤销。\n\n将删除 API Key、模型列表和所有自定义设置。')) return;
    $btnClearAll.disabled = true;
    try {
      await persist({
        ...AutoWindowConfig.DEFAULT_CONFIG,
        models: AutoWindowConfig.DEFAULT_CONFIG.models.map((model) => ({ ...model })),
        apiKey: ''
      });
      showToast('已清除所有数据');
    } catch (err) {
      showToast(err.message || '清除失败', true);
    } finally {
      $btnClearAll.disabled = false;
    }
  });

  try {
    const response = await chrome.runtime.sendMessage({ type: 'getConfig' });
    if (response && response.config) config = AutoWindowConfig.mergeConfig(response.config);
    else if (response && response.error) showToast(response.error, true);
  } catch (err) {
    showToast(err.message || '加载配置失败', true);
  }
  renderForm();
});
