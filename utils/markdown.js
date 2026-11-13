(function (root) {
  'use strict';

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderInline(text) {
    return escapeHtml(text)
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*\n])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  }

  function renderMarkdown(text) {
    if (!text) return '';

    const blocks = [];
    const source = String(text).replace(/\r\n/g, '\n');
    const fenced = source.replace(/```([^\n`]*)\n([\s\S]*?)```/g, (_, _lang, code) => {
      const token = `\u0000CODE${blocks.length}\u0000`;
      const escapedCode = escapeHtml(code.replace(/\n$/, '')).replace(/\n/g, '\u0001');
      blocks.push(`<pre><code>${escapedCode}</code></pre>`);
      return token;
    });

    const lines = fenced.split('\n');
    const rendered = [];
    let listType = null;

    function closeList() {
      if (!listType) return;
      rendered.push(listType === 'ol' ? '</ol>' : '</ul>');
      listType = null;
    }

    for (const line of lines) {
      const codeMatch = line.match(/^\u0000CODE(\d+)\u0000$/);
      if (codeMatch) {
        closeList();
        rendered.push(blocks[Number(codeMatch[1])]);
        continue;
      }

      const ordered = line.match(/^(\d+)\.\s+(.+)$/);
      const unordered = line.match(/^[-*]\s+(.+)$/);
      if (ordered) {
        if (listType !== 'ol') {
          closeList();
          rendered.push('<ol>');
          listType = 'ol';
        }
        rendered.push(`<li>${renderInline(ordered[2])}</li>`);
        continue;
      }
      if (unordered) {
        if (listType !== 'ul') {
          closeList();
          rendered.push('<ul>');
          listType = 'ul';
        }
        rendered.push(`<li>${renderInline(unordered[1])}</li>`);
        continue;
      }

      closeList();
      const heading = line.match(/^#{1,6}\s+(.+)$/);
      if (heading) {
        rendered.push(`<strong>${renderInline(heading[1])}</strong>`);
        continue;
      }
      const quote = line.match(/^>\s?(.+)$/);
      if (quote) {
        rendered.push(`<blockquote>${renderInline(quote[1])}</blockquote>`);
        continue;
      }
      rendered.push(renderInline(line));
    }
    closeList();

    let html = rendered.join('\n');
    html = html
      .replace(/\n{2,}/g, '</p><p>')
      .replace(/\n/g, '<br>');
    html = `<p>${html}</p>`;
    html = html.replace(/<p>(<(?:pre|ul|ol)>[\s\S]*?<\/(?:pre|ul|ol)>)<\/p>/g, '$1');
    html = html.replace(/<br>\s*(<(?:pre|ul|ol)>)/g, '$1');
    html = html.replace(/(<\/(?:pre|ul|ol)>)\s*<br>/g, '$1');
    html = html.replace(/<(ul|ol)><br>/g, '<$1>');
    html = html.replace(/<br><\/(ul|ol)>/g, '</$1>');
    html = html.replace(/<\/li><br>(?=<li>)/g, '</li>');
    html = html.replace(/<p><\/p>/g, '');
    html = html.replace(/\u0001/g, '\n');
    return html;
  }

  root.AutoWindowMarkdown = { escapeHtml, renderMarkdown };
})(typeof globalThis !== 'undefined' ? globalThis : this);
