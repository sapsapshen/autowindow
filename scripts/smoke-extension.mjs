import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const repoRoot = path.resolve(import.meta.dirname, '..');
const debugPort = 9333;

const server = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><meta charset="utf-8"><title>Smoke Page</title>
    <article><h1>Smoke Title</h1><p>${'正文内容 '.repeat(80)}</p></article>`);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const pagePort = server.address().port;
const userDataDir = await mkdtemp(path.join(tmpdir(), 'aw-chrome-'));
const chrome = spawn('google-chrome', [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  `--user-data-dir=${userDataDir}`,
  '--enable-unsafe-extension-debugging',
  `--remote-debugging-port=${debugPort}`,
  'about:blank'
], { stdio: 'ignore' });

let browser;
try {
  let version;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      version = await (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json();
      break;
    } catch {
      await delay(250);
    }
  }
  if (!version?.webSocketDebuggerUrl) throw new Error('Chrome 调试端口没有就绪');

  browser = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    browser.addEventListener('open', resolve, { once: true });
    browser.addEventListener('error', reject, { once: true });
  });

  let messageId = 0;
  const pending = new Map();
  browser.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error)));
    else resolve(message.result);
  });

  function send(method, params = {}, sessionId) {
    const id = ++messageId;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      browser.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }

  async function attach(url) {
    const { targetId } = await send('Target.createTarget', { url });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Runtime.enable', {}, sessionId);
    await send('Page.enable', {}, sessionId);
    return sessionId;
  }

  async function evaluate(sessionId, expression) {
    const evaluated = await send('Runtime.evaluate', {
      expression,
      returnByValue: true
    }, sessionId);
    if (evaluated.exceptionDetails) {
      throw new Error(evaluated.exceptionDetails.text || '页面脚本执行失败');
    }
    return evaluated.result?.value;
  }

  const loaded = await send('Extensions.loadUnpacked', { path: repoRoot });
  if (!loaded?.id) throw new Error('扩展没有加载');

  const pageSession = await attach(`http://127.0.0.1:${pagePort}/`);
  let panel = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    panel = await evaluate(pageSession, `(() => {
      const root = document.getElementById('aw-root');
      if (!root) return null;
      const button = document.getElementById('aw-float-btn');
      return {
        text: root.innerText,
        label: document.getElementById('aw-model-label')?.textContent || '',
        floatDisplay: button ? getComputedStyle(button).display : '',
        hidden: root.classList.contains('aw-hidden')
      };
    })()`);
    if (panel?.text?.includes('发送消息时会读取当前页面的主要内容')) break;
    await delay(200);
  }
  if (!panel?.text?.includes('发送消息时会读取当前页面的主要内容')) {
    throw new Error(`面板未注入或欢迎文案不匹配: ${JSON.stringify(panel)}`);
  }
  if (panel.label.includes('DeepSeek-V3') || panel.floatDisplay !== 'none' || panel.hidden) {
    throw new Error(`面板初始状态不正确: ${JSON.stringify(panel)}`);
  }

  await evaluate(pageSession, `document.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'K', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true
  }))`);
  await delay(100);
  const hidden = await evaluate(pageSession, `document.getElementById('aw-root').classList.contains('aw-hidden')`);
  if (!hidden) throw new Error('Ctrl+Shift+K 没有隐藏面板');

  await delay(450);
  await evaluate(pageSession, `document.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'K', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true
  }))`);
  await delay(100);
  const shown = await evaluate(pageSession, `!document.getElementById('aw-root').classList.contains('aw-hidden')`);
  if (!shown) throw new Error('再次按下快捷键没有显示面板');

  await evaluate(pageSession, `(() => {
    const input = document.getElementById('aw-input');
    input.value = '你好';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  })()`);
  let afterSend = '';
  for (let attempt = 0; attempt < 30; attempt += 1) {
    afterSend = await evaluate(pageSession, `document.getElementById('aw-root').innerText`);
    if (afterSend.includes('请先在扩展设置中配置 API Key') && afterSend.includes('你好')) break;
    await delay(200);
  }
  if (!afterSend.includes('你好') || !afterSend.includes('请先在扩展设置中配置 API Key')) {
    throw new Error(`缺少 Key 时没有立即提示: ${afterSend.slice(0, 300)}`);
  }
  if (afterSend.includes('请求超时')) throw new Error('缺少 Key 时错误被显示成了超时');

  const optionsSession = await attach(`chrome-extension://${loaded.id}/options.html`);
  let options = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    options = await evaluate(optionsSession, `(() => ({
      baseUrl: document.getElementById('api-base-url')?.value || '',
      models: [...document.querySelectorAll('.model-id')].map((input) => input.value),
      thinking: Boolean(document.getElementById('thinking')?.checked)
    }))()`);
    if (options?.baseUrl) break;
    await delay(200);
  }
  if (options.baseUrl !== 'https://api.deepseek.com' || options.thinking
    || options.models?.[0] !== 'deepseek-v4-pro' || options.models?.[1] !== 'deepseek-flash') {
    throw new Error(`设置页默认值不正确: ${JSON.stringify(options)}`);
  }

  const popupSession = await attach(`chrome-extension://${loaded.id}/popup.html`);
  let popup = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    popup = await evaluate(popupSession, `(() => ({
      status: document.getElementById('status-text')?.textContent || '',
      model: document.getElementById('current-model')?.textContent || '',
      shortcut: document.getElementById('shortcut-hint')?.textContent || ''
    }))()`);
    if (popup?.status && popup.status !== '正在加载...') break;
    await delay(200);
  }
  if (popup.status !== '未配置 API Key' || !popup.model.includes('DeepSeek-V4-Pro') || !popup.shortcut.includes('Ctrl+Shift+K')) {
    throw new Error(`弹窗状态不正确: ${JSON.stringify(popup)}`);
  }

  console.log(JSON.stringify({
    extensionId: loaded.id,
    label: panel.label,
    shortcutHiddenThenShown: true,
    missingKey: true,
    optionsBaseUrl: options.baseUrl,
    popupStatus: popup.status
  }));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  browser?.close();
  chrome.kill('SIGKILL');
  server.close();
  await delay(200);
  await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
}
