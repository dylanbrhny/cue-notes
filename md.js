// Safe markdown for Cue: used by the desktop app, the web app and the public share
// page (tools/build-share-page.js inlines this file). Needs `marked` loaded first.
/* global marked */
const mdEsc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Markdown from notes, briefs and Claude. Three layers, because this text can be
// written by other people (clients, teammates) and by the model:
//  1. raw HTML tokens are shown as text;
//  2. marked's "already escaped" text is never trusted, and links may only be web or mail links;
//  3. the HTML marked returns is rebuilt from a short allowlist of tags (cleanHtml),
//     so nothing else (scripts, images, event handlers, styles) can reach the page.
// silent: a note marked can't parse (e.g. thousands of ">" in a row) shows as text instead of breaking the page.
const md = new marked.Marked({ gfm: true, breaks: false, silent: true });
md.use({ renderer: { html: (token) => mdEsc(token.raw ?? token.text ?? '') } });
md.use({ walkTokens: (t) => {
  if (t.escaped) t.escaped = false;
  if ((t.type === 'link' || t.type === 'image') && !/^(https?:\/\/|mailto:)/i.test(String(t.href || '').trim())) t.href = '#';
} });
const MD_TAGS = new Set(['P', 'BR', 'STRONG', 'EM', 'B', 'I', 'U', 'S', 'DEL', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'CODE', 'PRE', 'A', 'HR', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'INPUT']);
const MD_DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'FRAME', 'OBJECT', 'EMBED', 'TEMPLATE', 'NOSCRIPT', 'TEXTAREA', 'TITLE', 'XMP', 'PLAINTEXT', 'LINK', 'META', 'BASE', 'FORM', 'SELECT', 'BUTTON']);
function cleanHtml(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = String(html || '');   // inert: nothing inside a template loads or runs
  const out = document.createElement('div');
  const copy = (from, to) => {
    for (const n of from.childNodes) {
      if (n.nodeType === 3) { to.append(document.createTextNode(n.nodeValue)); continue; }
      if (n.nodeType !== 1) continue;
      const tag = String(n.tagName).toUpperCase();
      if (n.namespaceURI !== 'http://www.w3.org/1999/xhtml' || MD_DROP.has(tag)) continue;   // svg, math and friends: gone, with their contents
      if (!MD_TAGS.has(tag)) { copy(n, to); continue; }                                      // unknown tag: keep its text only
      const el = document.createElement(tag.toLowerCase());
      if (tag === 'A') {
        const href = String(n.getAttribute('href') || '').trim();
        if (/^(https?:\/\/|mailto:)/i.test(href)) { el.setAttribute('href', href); el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer'); }
      } else if (tag === 'INPUT') {
        if (n.getAttribute('type') !== 'checkbox') continue;
        el.setAttribute('type', 'checkbox'); el.setAttribute('disabled', '');
        if (n.hasAttribute('checked')) el.setAttribute('checked', '');
      } else if (tag === 'TH' || tag === 'TD') {
        const a = n.getAttribute('align'); if (/^(left|right|center)$/.test(a || '')) el.setAttribute('align', a);
      } else if (tag === 'OL') {
        const st = n.getAttribute('start'); if (/^\d{1,6}$/.test(st || '')) el.setAttribute('start', st);
      }
      copy(n, el);
      to.append(el);
    }
  };
  copy(tpl.content, out);
  return out.innerHTML;
}
const renderMd = (text) => {
  try { return cleanHtml(md.parse(String(text || ''))); } catch { return `<p>${mdEsc(String(text || '')).replace(/\n/g, '<br>')}</p>`; }
};
