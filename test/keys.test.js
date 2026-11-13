import assert from 'node:assert/strict';
import test from 'node:test';
import { loadScripts } from '../scripts/extension-support.js';

test('Enter sends only when IME composition is finished', () => {
  const { shouldSendOnEnter, isToggleShortcut, shortcutLabel } = loadScripts(['utils/keys.js']).AutoWindowKeys;
  assert.equal(shouldSendOnEnter({ key: 'Enter' }), true);
  assert.equal(shouldSendOnEnter({ key: 'Enter', shiftKey: true }), false);
  assert.equal(shouldSendOnEnter({ key: 'Enter', isComposing: true }), false);
  assert.equal(shouldSendOnEnter({ key: 'Enter', keyCode: 229 }), false);
  assert.equal(isToggleShortcut({ key: 'K', ctrlKey: true, shiftKey: true }), true);
  assert.equal(isToggleShortcut({ key: 'k', metaKey: true, shiftKey: true }), true);
  assert.equal(isToggleShortcut({ key: 'K', ctrlKey: true, shiftKey: true, altKey: true }), false);
  assert.equal(isToggleShortcut({ key: 'K', shiftKey: true }), false);

  const mac = loadScripts(['utils/keys.js']);
  mac.navigator = { platform: 'MacIntel' };
  assert.equal(mac.AutoWindowKeys.shortcutLabel(), '⌘+Shift+K 切换对话框');
  assert.match(shortcutLabel(), /Ctrl\+Shift\+K/);
});
