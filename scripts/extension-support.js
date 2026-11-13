import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

export function loadScripts(files) {
  const sandbox = {
    console,
    URL,
    TextDecoder,
    TextEncoder,
    AbortController,
    fetch,
    setTimeout,
    clearTimeout
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const file of files) {
    const filename = path.join(repoRoot, file);
    vm.runInContext(fs.readFileSync(filename, 'utf8'), sandbox, { filename });
  }
  return sandbox;
}

export function textNode(value) {
  return { nodeType: 3, textContent: value, childNodes: [] };
}

export function element(tag, children = [], attrs = {}) {
  const node = {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    id: attrs.id || '',
    className: attrs.className || '',
    hidden: Boolean(attrs.hidden),
    style: attrs.style || {},
    childNodes: [],
    getAttribute(name) {
      if (name === 'role') return attrs.role ?? null;
      if (name === 'aria-hidden') return attrs.ariaHidden ?? null;
      if (name === 'class') return attrs.className ?? null;
      if (name === 'hidden') return attrs.hidden ? '' : null;
      return null;
    },
    hasAttribute(name) {
      return this.getAttribute(name) !== null;
    },
    get textContent() {
      return this.childNodes.map((child) => child.textContent || '').join('');
    }
  };
  node.childNodes = children;
  return node;
}

function matches(node, selector) {
  if (node.nodeType !== 1) return false;
  if (selector.startsWith('.')) return node.className.split(/\s+/).includes(selector.slice(1));
  if (selector.startsWith('#')) return node.id === selector.slice(1);
  if (selector.startsWith('[')) return node.getAttribute('role') === 'main' && selector.includes('main');
  return node.tagName === selector.toUpperCase();
}

function walk(node, visit, found = []) {
  if (node.nodeType === 1 && visit(node)) found.push(node);
  for (const child of node.childNodes || []) walk(child, visit, found);
  return found;
}

export function makeDocument({ title = '', body, href = 'https://example.com/article' }) {
  return {
    document: {
      title,
      body,
      querySelector(selector) {
        return walk(body, (node) => matches(node, selector))[0] || null;
      }
    },
    window: {
      location: { href },
      getComputedStyle(node) {
        if (node.id === 'css-hidden') return { display: 'none', visibility: 'visible', opacity: '1' };
        return { display: 'block', visibility: 'visible', opacity: '1' };
      }
    }
  };
}
