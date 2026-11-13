/**
 * popup.js — toolbar popup.
 */
document.addEventListener('DOMContentLoaded', async () => {
  const $toggle = document.getElementById('toggle-enabled');
  const $statusDot = document.getElementById('status-dot');
  const $statusText = document.getElementById('status-text');
  const $currentModel = document.getElementById('current-model');
  const $modelSelect = document.getElementById('model-select');
  const $btnOptions = document.getElementById('btn-options');
  const $btnClear = document.getElementById('btn-clear');
  const $shortcut = document.getElementById('shortcut-hint');

  if ($shortcut && globalThis.AutoWindowKeys) {
    $shortcut.textContent = globalThis.AutoWindowKeys.shortcutLabel();
  }

  $btnOptions.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });

  let config;
  try {
    const response = await chrome.runtime.sendMessage({ type: 'getConfig' });
    if (!response || response.error || !response.config) {
      setStatus('warn', (response && response.error) || '无法连接后台');
      $modelSelect.innerHTML = '<option value="">无法加载</option>';
      return;
    }
    config = response.config;
  } catch (err) {
    setStatus('warn', '无法连接后台');
    return;
  }

  const models = config.models || [];
  const currentModel = config.model || 'deepseek-v4-pro';
  $toggle.checked = config.enabled !== false;
  updateStatus(config.enabled !== false);

  const currentModelInfo = models.find((model) => model.id === currentModel);
  $currentModel.textContent = currentModelInfo ? currentModelInfo.name : currentModel;

  $modelSelect.innerHTML = '';
  if (models.length === 0) {
    $modelSelect.innerHTML = '<option value="">无可用模型</option>';
  } else {
    models.forEach((model) => {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = `${model.name} (${model.provider || 'custom'})`;
      option.selected = model.id === currentModel;
      $modelSelect.appendChild(option);
    });
  }

  $toggle.addEventListener('change', async () => {
    const enabled = $toggle.checked;
    try {
      await chrome.runtime.sendMessage({ type: 'setConfig', config: { enabled } });
      updateStatus(enabled);
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, { type: enabled ? 'show' : 'hide' }).catch(() => {});
      }
    } catch (err) {
      $toggle.checked = !enabled;
      setStatus('warn', `切换失败: ${err.message}`);
    }
  });

  $modelSelect.addEventListener('change', async () => {
    const modelId = $modelSelect.value;
    if (!modelId) return;
    try {
      await chrome.runtime.sendMessage({ type: 'setConfig', config: { model: modelId } });
      const info = models.find((model) => model.id === modelId);
      $currentModel.textContent = info ? info.name : modelId;
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'modelChanged', model: modelId }).catch(() => {});
      }
    } catch (err) {
      setStatus('warn', `模型切换失败: ${err.message}`);
    }
  });

  $btnClear.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'clearChat' }).catch(() => {});
      window.close();
    } catch (err) {
      setStatus('warn', `清除失败: ${err.message}`);
    }
  });

  function updateStatus(enabled) {
    if (!config.apiKey) setStatus('warn', '未配置 API Key');
    else if (enabled) setStatus('on', '已启用');
    else setStatus('off', '已禁用');
  }

  function setStatus(kind, text) {
    $statusDot.className = `dot ${kind}`;
    $statusText.textContent = text;
  }
});
