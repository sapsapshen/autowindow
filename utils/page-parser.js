(function (root) {
  'use strict';

  const TEXT_NODE = 3;
  const ELEMENT_NODE = 1;
  const DEFAULT_MAX_TEXT = 12000;
  const DEFAULT_MAX_NODES = 8000;
  const SKIP_TAGS = new Set([
    'script', 'style', 'noscript', 'iframe', 'svg', 'canvas', 'video', 'audio',
    'img', 'input', 'textarea', 'select', 'button', 'nav', 'footer'
  ]);
  const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
  const BLOCK_TAGS = new Set([
    'p', 'div', 'section', 'article', 'li', 'tr', 'blockquote', 'pre', 'table', 'ul', 'ol', 'header'
  ]);
  const MAIN_SELECTORS = [
    'article',
    'main',
    '[role="main"]',
    '.post-content',
    '.article-content',
    '.entry-content',
    '.markdown-body',
    '.doc-content',
    '#content',
    '#main-content',
    '#article'
  ];
  const NON_CONTENT = ['sidebar', 'comment', 'advertisement', 'ad-', 'social-share', 'related-posts', 'recommend'];

  function createParser(env) {
    const maxText = env && env.maxText ? env.maxText : DEFAULT_MAX_TEXT;
    const maxNodes = env && env.maxNodes ? env.maxNodes : DEFAULT_MAX_NODES;

    function doc() {
      if (env && env.document) return env.document;
      return document;
    }

    function view() {
      if (env && env.window) return env.window;
      return window;
    }

    function classAndId(el) {
      let className = '';
      if (typeof el.className === 'string') className = el.className;
      else if (typeof el.getAttribute === 'function') className = el.getAttribute('class') || '';
      return `${className} ${el.id || ''}`.toLowerCase();
    }

    function hasAttribute(el, name) {
      if (typeof el.hasAttribute === 'function') return el.hasAttribute(name);
      if (typeof el.getAttribute !== 'function') return false;
      const value = el.getAttribute(name);
      return value !== null && value !== undefined;
    }

    function isHidden(el) {
      if (el.hidden || hasAttribute(el, 'hidden')) return true;
      if (typeof el.getAttribute === 'function' && el.getAttribute('aria-hidden') === 'true') return true;
      const inline = el.style || {};
      if (inline.display === 'none' || inline.visibility === 'hidden' || parseFloat(inline.opacity) === 0) {
        return true;
      }
      const currentView = view();
      if (!currentView || typeof currentView.getComputedStyle !== 'function') return false;
      try {
        const style = currentView.getComputedStyle(el);
        return Boolean(style) && (
          style.display === 'none'
          || style.visibility === 'hidden'
          || parseFloat(style.opacity) === 0
        );
      } catch {
        return false;
      }
    }

    function shouldSkip(el) {
      const tag = String(el.tagName || '').toLowerCase();
      if (el.id === 'aw-root' || SKIP_TAGS.has(tag)) return true;
      if (isHidden(el)) return true;
      const role = typeof el.getAttribute === 'function' ? el.getAttribute('role') : '';
      if (role === 'navigation' || role === 'banner' || role === 'contentinfo' || role === 'complementary') {
        return true;
      }
      const classId = classAndId(el);
      return NON_CONTENT.some((keyword) => classId.includes(keyword));
    }

    function joinPieces(pieces) {
      let text = '';
      for (const piece of pieces) {
        if (!text) {
          text = piece;
          continue;
        }
        text += /[\n]$/.test(text) || /^[\n]/.test(piece) ? piece : ` ${piece}`;
      }
      return text
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/[ \t]*\n[ \t]*/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }

    function extractText(el, depth, state) {
      if (!el || depth > 30) return '';
      if (state.nodes >= maxNodes) {
        state.truncated = true;
        return '';
      }
      state.nodes += 1;

      if (el.nodeType === TEXT_NODE) {
        return String(el.textContent || '').replace(/\s+/g, ' ').trim();
      }
      if (el.nodeType !== ELEMENT_NODE) return '';
      if (shouldSkip(el)) return '';

      const tag = String(el.tagName || '').toLowerCase();
      if (tag === 'br') return '\n';
      if (tag === 'pre') {
        const raw = String(el.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
        return raw ? `\n${raw}\n` : '';
      }

      const pieces = [];
      const children = el.childNodes || [];
      for (let i = 0; i < children.length; i += 1) {
        const piece = extractText(children[i], depth + 1, state);
        if (piece) pieces.push(piece);
      }
      const text = joinPieces(pieces);
      if (!text) return '';
      if (HEADING_TAGS.has(tag)) return `\n## ${text}\n`;
      if (BLOCK_TAGS.has(tag)) return `\n${text}\n`;
      return text;
    }

    function findMainContent(documentRef) {
      for (const selector of MAIN_SELECTORS) {
        const element = documentRef.querySelector(selector);
        if (element && String(element.textContent || '').trim().length > 200) return element;
      }
      return documentRef.body;
    }

    function parsePage() {
      const documentRef = doc();
      const locationRef = view().location || { href: '' };
      const state = { nodes: 0, truncated: false };
      const container = findMainContent(documentRef);
      let text = extractText(container, 0, state).replace(/\n{3,}/g, '\n\n').trim();

      if (text.length > maxText) {
        text = `${text.slice(0, maxText)}\n\n[... 内容过长，已截断 ...]`;
      } else if (state.truncated) {
        text += '\n\n[... 页面节点过多，已截断 ...]';
      }

      return {
        title: documentRef.title || '',
        url: locationRef.href || '',
        text,
        length: text.length
      };
    }

    return { parsePage, extractText, findMainContent };
  }

  const browserParser = createParser();
  root.AutoWindowParser = {
    parsePage() {
      return browserParser.parsePage();
    },
    createParser
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
