/**
 * page-parser.js — 页面文本提取工具
 * 从当前页面提取结构化文本内容，用于 AI 对话上下文
 */
(function () {
  'use strict';

  const MAX_TEXT_LENGTH = 12000; // 最大字符数，避免 token 超限

  /**
   * 判断元素是否应该被跳过（非内容元素）
   */
  function shouldSkip(el) {
    const tag = el.tagName.toLowerCase();
    if (['script', 'style', 'noscript', 'iframe', 'svg', 'canvas', 'video', 'audio', 'img', 'input', 'textarea', 'select', 'button', 'nav', 'footer'].includes(tag)) {
      return true;
    }
    // 跳过隐藏元素
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) {
      return true;
    }
    // 跳过常见非内容属性
    const role = el.getAttribute('role');
    if (role === 'navigation' || role === 'banner' || role === 'contentinfo' || role === 'complementary') {
      return true;
    }
    const classId = (el.className || '') + ' ' + (el.id || '');
    const nonContent = ['sidebar', 'comment', 'advertisement', 'ad-', 'social-share', 'related-posts', 'recommend'];
    for (const kw of nonContent) {
      if (classId.toLowerCase().includes(kw)) return true;
    }
    return false;
  }

  /**
   * 提取元素中的文本，保留段落结构
   */
  function extractText(el, depth) {
    if (depth === undefined) depth = 0;
    if (depth > 30) return ''; // 防止过深递归
    if (!el) return '';

    // 文本节点
    if (el.nodeType === Node.TEXT_NODE) {
      return el.textContent.trim();
    }

    // 元素节点
    if (el.nodeType !== Node.ELEMENT_NODE) return '';
    if (shouldSkip(el)) return '';

    const tag = el.tagName.toLowerCase();
    const children = el.childNodes;
    let parts = [];

    for (let i = 0; i < children.length; i++) {
      parts.push(extractText(children[i], depth + 1));
    }

    let text = parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

    if (!text) return '';

    // 块级元素之间加换行
    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'div', 'section', 'article', 'li', 'tr', 'blockquote', 'pre'].includes(tag)) {
      text = '\n' + text;
    }
    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
      text = '\n## ' + text + '\n';
    }

    return text;
  }

  /**
   * 查找页面的主要内容容器
   */
  function findMainContent() {
    // 优先级：article > main > [role=main] > body
    const selectors = [
      'article',
      'main',
      '[role="main"]',
      '.post-content', '.article-content', '.entry-content',
      '.markdown-body', '.doc-content',
      '#content', '#main-content', '#article'
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim().length > 200) {
        return el;
      }
    }
    return document.body;
  }

  /**
   * 主入口：解析当前页面
   * @returns {{ title: string, url: string, text: string, length: number }}
   */
  function parsePage() {
    const title = document.title || '';
    const url = window.location.href;

    const container = findMainContent();
    let text = extractText(container);

    // 去重空白行
    text = text.replace(/\n{3,}/g, '\n\n').trim();

    // 限制长度
    if (text.length > MAX_TEXT_LENGTH) {
      text = text.substring(0, MAX_TEXT_LENGTH) + '\n\n[... 内容过长，已截断 ...]';
    }

    return {
      title: title,
      url: url,
      text: text,
      length: text.length
    };
  }

  // 挂载到全局
  window.AutoWindowParser = { parsePage };
})();
