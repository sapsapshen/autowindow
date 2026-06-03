/**
 * popup.js — 工具栏弹窗逻辑
 */

document.addEventListener('DOMContentLoaded', async () => {
  // DOM 引用
  const $toggle = document.getElementById('toggle-enabled');
  const $statusDot = document.getElementById('status-dot');
  const $statusText = document.getElementById('status-text');
  const $currentModel = document.getElementById('current-model');
  const $modelSelect = document.getElementById('model-select');
  const $btnOptions = document.getElementById('btn-options');
  const $btnClear = document.getElementById('btn-clear');

  // 获取配置
  let config;
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'getConfig' });
    config = resp.config || {};
  } catch (err) {
    setStatus('warn', '无法连接后台');
    return;
  }

  const models = config.models || [];
  const currentModel = config.model || 'deepseek-v4-pro';

  // 设置开关
  $toggle.checked = config.enabled !== false;
  updateStatus(config.enabled !== false);

  // 设置当前模型
  const currentModelInfo = models.find(m => m.id === currentModel);
  $currentModel.textContent = currentModelInfo ? currentModelInfo.name : currentModel;

  // 填充模型下拉
  $modelSelect.innerHTML = '';
  if (models.length === 0) {
    $modelSelect.innerHTML = '<option value="">无可用模型</option>';
  } else {
    models.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = `${m.name} (${m.provider || 'unknown'})`;
      if (m.id === currentModel) opt.selected = true;
      $modelSelect.appendChild(opt);
    });
  }

  // ---- 事件绑定 ----

  // 开关切换
  $toggle.addEventListener('change', async () => {
    const enabled = $toggle.checked;
    try {
      await chrome.runtime.sendMessage({ type: 'setConfig', config: { enabled } });
      updateStatus(enabled);

      // 通知当前活动标签页
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, {
          type: enabled ? 'show' : 'hide'
        }).catch(() => {});
      }
    } catch (err) {
      $toggle.checked = !enabled; // 恢复
      setStatus('warn', '切换失败: ' + err.message);
    }
  });

  // 模型切换
  $modelSelect.addEventListener('change', async () => {
    const modelId = $modelSelect.value;
    if (!modelId) return;

    try {
      await chrome.runtime.sendMessage({ type: 'setConfig', config: { model: modelId } });
      const info = models.find(m => m.id === modelId);
      $currentModel.textContent = info ? info.name : modelId;

      // 通知当前标签页更新模型
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'modelChanged',
          model: modelId
        }).catch(() => {});
      }
    } catch (err) {
      console.error('模型切换失败:', err);
    }
  });

  // 完整设置
  $btnOptions.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });

  // 清除对话
  $btnClear.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'clearChat' }).catch(() => {});
      }
      window.close();
    } catch (err) {
      console.error('清除失败:', err);
    }
  });

  // ---- 辅助函数 ----
  function updateStatus(enabled) {
    if (!config.apiKey) {
      setStatus('warn', '未配置 API Key');
    } else if (enabled) {
      setStatus('on', '已启用');
    } else {
      setStatus('off', '已禁用');
    }
  }

  function setStatus(state, text) {
    $statusDot.className = 'dot ' + state;
    $statusText.textContent = text;
  }
});
