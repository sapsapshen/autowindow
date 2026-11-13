(function (root) {
  'use strict';

  function shouldSendOnEnter(event) {
    if (!event || event.key !== 'Enter' || event.shiftKey) return false;
    if (event.isComposing || event.keyCode === 229) return false;
    return true;
  }

  function isToggleShortcut(event) {
    if (!event || event.altKey || !event.shiftKey) return false;
    if (!event.ctrlKey && !event.metaKey) return false;
    return event.key === 'K' || event.key === 'k';
  }

  function shortcutLabel() {
    const nav = root.navigator;
    const platform = (nav && nav.userAgentData && nav.userAgentData.platform)
      || (nav && nav.platform)
      || '';
    return /mac/i.test(platform) ? '⌘+Shift+K 切换对话框' : 'Ctrl+Shift+K 切换对话框';
  }

  root.AutoWindowKeys = { shouldSendOnEnter, isToggleShortcut, shortcutLabel };
})(typeof globalThis !== 'undefined' ? globalThis : this);
