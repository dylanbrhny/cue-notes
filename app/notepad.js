// The notepad: one document per call, like Granola. After a call the AI
// writes the notes around what you typed; your lines (typed or edited) show in
// full color and the AI's additions are dimmer. Everything is editable.

const normLine = (s) => String(s || '').toLowerCase().replace(/[`*_#>\[\]()~]/g, ' ').replace(/[^a-z0-9$%.\s]/g, ' ').replace(/\s+/g, ' ').trim();
const words = (s) => normLine(s).split(' ').filter((w) => w.length > 2);

// A block counts as yours if you edited it, or most of one of your typed lines is in it.
function lineIsMine(text, myLines, mineSet) {
  const n = normLine(text);
  if (!n) return false;
  if (mineSet.has(n)) return true;
  const w = new Set(words(text));
  return myLines.some((line) => {
    const lw = words(line);
    if (!lw.length) return false;
    const hit = lw.filter((x) => w.has(x)).length;
    return hit / lw.length >= 0.7 && hit >= Math.min(2, lw.length);
  });
}

// Markdown back out of the edited page (only what the notes use).
function htmlToMd(root) {
  const inline = (node) => [...node.childNodes].map((n) => {
    if (n.nodeType === 3) return n.textContent.replace(/ /g, ' ');
    if (n.nodeType !== 1) return '';
    const t = n.tagName;
    const inner = inline(n);
    if (t === 'STRONG' || t === 'B') return inner.trim() ? `**${inner}**` : inner;
    if (t === 'EM' || t === 'I') return inner.trim() ? `*${inner}*` : inner;
    if (t === 'CODE') return `\`${inner}\``;
    if (t === 'A') return `[${inner}](${n.getAttribute('href') || ''})`;
    if (t === 'BR') return '\n';
    if (t === 'UL' || t === 'OL') return '';
    return inner;
  }).join('');
  const out = [];
  const list = (el, depth) => {
    let i = 1;
    for (const li of el.children) {
      if (li.tagName !== 'LI') continue;
      const text = inline(li).replace(/\n+/g, ' ').trim();
      if (text) out.push(`${'  '.repeat(depth)}${el.tagName === 'OL' ? `${i++}.` : '-'} ${text}`);
      for (const sub of li.children) if (sub.tagName === 'UL' || sub.tagName === 'OL') list(sub, depth + 1);
    }
  };
  for (const el of root.children) {
    const t = el.tagName;
    if (/^H[1-6]$/.test(t)) { const text = inline(el).trim(); if (text) out.push('', `${'#'.repeat(Math.max(3, +t[1]))} ${text}`); }
    else if (t === 'UL' || t === 'OL') { out.push(''); list(el, 0); }
    else if (t === 'BLOCKQUOTE') { const text = inline(el).trim(); if (text) out.push(`> ${text}`); }
    else if (t === 'HR') out.push('---');
    else { const text = inline(el).trim(); if (text) out.push('', text); }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// The blocks we colour and track: list items (own text only), paragraphs, headings.
function noteBlocks(root) {
  return [...root.querySelectorAll('li, p, h1, h2, h3, h4, blockquote')].filter((el) => el.tagName !== 'P' || !el.closest('li'));
}
const ownText = (el) => [...el.childNodes].filter((n) => !(n.nodeType === 1 && /^(UL|OL)$/.test(n.tagName))).map((n) => n.textContent).join('');

function notepad(c, { onSaved, extra = null, transcript = null } = {}) {
  const myLines = String(c.myNotes || '').split(/\r?\n/).map((l) => l.replace(/^\s*([-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean);
  const mine = new Set((c.notesMine || []).map(normLine));
  let view = c.aiNotes ? 'notes' : 'mine';
  const wrap = h('div', { class: 'notepad-wrap' });

  const saveMine = debounce((v) => call('calls:update', { id: c.id, patch: { myNotes: v } }), 400);
  let lastMd = c.aiNotes || '';
  const saveDoc = debounce((editor) => {
    const md = htmlToMd(editor);
    if (md === lastMd) return;
    lastMd = md;
    call('calls:update', { id: c.id, patch: { aiNotes: md, notesMine: [...mine] } });
    onSaved && onSaved();
  }, 700);

  function paint(editor) {
    for (const el of noteBlocks(editor)) {
      const text = ownText(el);
      if (!el.dataset.orig) el.dataset.orig = normLine(text);
      el.classList.toggle('mine', /^H/.test(el.tagName) ? false : lineIsMine(text, myLines, mine));
    }
  }

  function draw() {
    const tabs = h('div', { class: 'np-tabs' },
      c.aiNotes ? h('button', { class: view === 'notes' ? 'on' : '', onclick: () => { view = 'notes'; draw(); } }, 'Notes') : null,
      h('button', { class: view === 'mine' ? 'on' : '', onclick: () => { view = 'mine'; draw(); } }, c.aiNotes ? 'My notes' : 'Notes'),
      transcript && (c.transcript || []).length ? h('button', { class: view === 'transcript' ? 'on' : '', onclick: () => { view = 'transcript'; draw(); } }, 'Transcript') : null,
      h('span', { class: 'np-key' }),
      extra);

    if (view === 'transcript' && transcript) { wrap.replaceChildren(tabs, transcript); return; }
    if (view === 'notes' && c.aiNotes) {
      const editor = h('div', { class: 'notepad md', contenteditable: 'true', spellcheck: 'true', html: renderMd(c.aiNotes) });
      paint(editor);
      editor.addEventListener('input', () => {
        // Anything you change becomes yours.
        const sel = window.getSelection();
        const at = sel && sel.anchorNode ? (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement) : null;
        const block = at && at.closest('li, p, h1, h2, h3, h4, blockquote');
        if (block && editor.contains(block) && normLine(ownText(block)) !== block.dataset.orig) {
          mine.add(normLine(ownText(block)));
          if (!/^H/.test(block.tagName)) block.classList.add('mine');
        }
        saveDoc(editor);
      });
      editor.addEventListener('paste', (e) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); });
      editor.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); document.execCommand('bold'); } });
      wrap.replaceChildren(tabs, editor);
    } else {
      const ta = h('textarea', { class: 'notes notepad-raw', placeholder: 'Your notes. Type as you go; after the call the AI writes the rest around them.', value: c.myNotes || '', oninput: (e) => { c.myNotes = e.target.value; saveMine(e.target.value); } });
      wrap.replaceChildren(tabs, ta);
    }
  }
  draw();
  return wrap;
}
