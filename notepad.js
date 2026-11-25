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
    if (t === 'DEL' || t === 'S') return inner.trim() ? `~~${inner}~~` : inner;
    if (t === 'INPUT') return n.getAttribute('type') === 'checkbox' ? (n.hasAttribute('checked') ? '[x] ' : '[ ] ') : '';
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
      const text = inline(li).replace(/\n+/g, ' ').trim().replace(/^\[( |x)\]\s+/, '[$1] ');
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
    else if (t === 'PRE') out.push('', '```', el.textContent.replace(/\n$/, ''), '```');
    else if (t === 'TABLE') {
      // Tables stay tables (they used to come back as one line of text after an edit).
      const rows = [...el.querySelectorAll('tr')].map((tr) => [...tr.children].map((td) => inline(td).replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim()));
      if (rows.length) {
        const n = Math.max(...rows.map((r) => r.length));
        const line = (r) => `| ${Array.from({ length: n }, (_, i) => r[i] || '').join(' | ')} |`;
        out.push('', line(rows[0]), `| ${Array.from({ length: n }, () => '---').join(' | ')} |`, ...rows.slice(1).map(line));
      }
    }
    else { const text = inline(el).trim(); if (text) out.push('', text); }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// The blocks we colour and track: list items (own text only), paragraphs, headings.
function noteBlocks(root) {
  return [...root.querySelectorAll('li, p, h1, h2, h3, h4, blockquote')].filter((el) => el.tagName !== 'P' || !el.closest('li'));
}
const ownText = (el) => [...el.childNodes].filter((n) => !(n.nodeType === 1 && /^(UL|OL)$/.test(n.tagName))).map((n) => n.textContent).join('');

// The notes as text you can paste anywhere: title, date and the notes.
function noteMarkdown(c) {
  const when = c.startedAt ? new Date(c.startedAt).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  const who = (c.attendees || []).map((a) => a.name || a.email).filter(Boolean);
  const head = [`# ${c.title || 'Untitled call'}`, [when, who.length ? `With ${who.join(', ')}` : ''].filter(Boolean).join(' · ')].filter(Boolean).join('\n');
  return `${head}\n\n${String(c.aiNotes || c.myNotes || '').trim()}\n`;
}

function transcriptText(c, names = { me: 'You', them: 'Them' }) {
  return (c.transcript || []).map((s) => `${typeof s.at === 'number' ? `[${fmtClock(s.at)}] ` : ''}${s.speaker === 'me' ? names.me : s.speaker === 'them' ? names.them : s.speaker}: ${s.text}`).join('\n');
}

// Copy as rich text (pastes formatted into Gmail, Docs, Slack) with the markdown as plain text.
async function copyRich(md) {
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([renderMd(md)], { type: 'text/html' }), 'text/plain': new Blob([md], { type: 'text/plain' }) })]);
    return true;
  } catch {
    try { await navigator.clipboard.writeText(md); return true; } catch { return false; }
  }
}

// Download a text file (the notes as .md) on the desktop and in the browser.
function downloadText(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
const fileNameFor = (c) => `${String(c.title || 'Call notes').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Call notes'}.md`;

// Typing "- ", "1. " or "# " at the start of a line makes a list or a heading, like Granola.
function markdownShortcut(editor) {
  const sel = window.getSelection();
  if (!sel || !sel.isCollapsed || !sel.anchorNode || sel.anchorNode.nodeType !== 3) return false;
  const node = sel.anchorNode;
  const block = node.parentElement?.closest('p, div, li, h1, h2, h3, h4');
  if (!block || block === editor || !editor.contains(block) || block.tagName === 'LI' || /^H/.test(block.tagName) || block.firstChild !== node) return false;
  const m = /^(-|\*|1\.|#{1,3}) $/.exec(node.textContent.slice(0, sel.anchorOffset).replace(/\u00a0/g, ' '));
  if (!m) return false;
  node.textContent = node.textContent.slice(sel.anchorOffset);
  if (!block.textContent) block.replaceChildren(document.createElement('br'));
  const range = document.createRange();
  range.setStart(block.firstChild.nodeType === 3 ? block.firstChild : block, 0);
  range.collapse(true);
  sel.removeAllRanges(); sel.addRange(range);
  if (m[1].startsWith('#')) document.execCommand('formatBlock', false, `h${Math.min(4, m[1].length + 2)}`);
  else document.execCommand(m[1] === '1.' ? 'insertOrderedList' : 'insertUnorderedList');
  return true;
}

function notepad(c, { onSaved, extra = null, transcript = null, names } = {}) {
  const myLines = String(c.myNotes || '').split(/\r?\n/).map((l) => l.replace(/^\s*([-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean);
  const mine = new Set((c.notesMine || []).map(normLine));
  let view = c.aiNotes ? 'notes' : 'mine';
  let find = '';
  const wrap = h('div', { class: 'notepad-wrap' });
  const status = h('span', { class: 'np-status', 'aria-live': 'polite' });
  const showSaved = (r) => {
    // calls:update says { ok: false } when the edit didn't save (offline and not on this computer, or no right to edit).
    if (r && r.ok === false) { status.textContent = 'Not saved. Check your connection'; status.classList.add('bad'); } else { status.textContent = ''; status.classList.remove('bad'); }
  };

  const saveMine = debounce((v) => call('calls:update', { id: c.id, patch: { myNotes: v } }).then(showSaved), 400);
  let lastMd = c.aiNotes || '';
  const saveDoc = debounce((editor) => {
    const md = htmlToMd(editor);
    if (md === lastMd) return;
    lastMd = md;
    c.aiNotes = md; // so switching tabs and coming back shows what you wrote
    call('calls:update', { id: c.id, patch: { aiNotes: md, notesMine: [...mine] } }).then(showSaved);
    onSaved && onSaved();
  }, 700);
  // Save what's pending before the page changes (a tab, leaving the call).
  const flush = () => { saveDoc.flush(); saveMine.flush(); };
  wrap.flush = flush;
  wrap.edits = () => [...mine]; // the lines you changed in the AI notes

  function paint(editor) {
    for (const el of noteBlocks(editor)) {
      const text = ownText(el);
      if (!el.dataset.orig) el.dataset.orig = normLine(text);
      el.classList.toggle('mine', /^H/.test(el.tagName) ? false : lineIsMine(text, myLines, mine));
    }
  }

  const copyBtn = () => h('button', { class: 'np-copy', title: view === 'transcript' ? 'Copy the transcript' : 'Copy the notes (pastes formatted into email, Docs or Slack)', onclick: async (e) => {
    flush();
    const b = e.currentTarget;
    const ok = view === 'transcript' ? await navigator.clipboard.writeText(transcriptText(c, names)).then(() => true, () => false) : await copyRich(noteMarkdown(view === 'mine' ? { ...c, aiNotes: '' } : c));
    b.textContent = ok ? 'Copied' : 'Copy failed';
    setTimeout(() => { b.textContent = 'Copy'; }, 1400);
  } }, 'Copy');

  function drawTranscript() {
    const count = h('span', { class: 'saved' });
    const apply = () => {
      const q = find.trim().toLowerCase();
      let hits = 0;
      for (const el of transcript.children) {
        const hit = !q || el.textContent.toLowerCase().includes(q);
        el.style.display = hit ? '' : 'none';
        if (q && hit) hits++;
      }
      count.textContent = q ? `${hits} line${hits === 1 ? '' : 's'}` : '';
    };
    const input = h('input', { class: 'input search np-find', type: 'search', placeholder: 'Find in transcript', value: find, oninput: (e) => { find = e.target.value; apply(); } });
    apply();
    return h('div', { class: 'np-transcript' }, h('div', { class: 'row np-find-row' }, input, count), transcript);
  }

  function draw() {
    const tab = (v, label) => h('button', { class: view === v ? 'on' : '', onclick: () => { flush(); view = v; draw(); } }, label);
    const tabs = h('div', { class: 'np-tabs' },
      c.aiNotes ? tab('notes', 'Notes') : null,
      tab('mine', c.aiNotes ? 'My notes' : 'Notes'),
      transcript && (c.transcript || []).length ? tab('transcript', 'Transcript') : null,
      h('span', { class: 'np-key' }, status),
      (view === 'transcript' || c.aiNotes || c.myNotes) ? copyBtn() : null,
      extra);

    if (view === 'transcript' && transcript) { wrap.replaceChildren(tabs, drawTranscript()); return; }
    if (view === 'notes' && c.aiNotes) {
      const editor = h('div', { class: 'notepad md', contenteditable: viewAs ? 'false' : 'true', spellcheck: 'true', html: renderMd(c.aiNotes) });
      paint(editor);
      editor.addEventListener('input', (e) => {
        // After this input is done (a list can't be made in the middle of another edit).
        if (e.inputType === 'insertText' && e.data === ' ') setTimeout(() => markdownShortcut(editor), 0);
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
      editor.addEventListener('keydown', (e) => {
        if (!(e.metaKey || e.ctrlKey)) return;
        const k = e.key.toLowerCase();
        if (k === 'b' || k === 'i') { e.preventDefault(); document.execCommand(k === 'b' ? 'bold' : 'italic'); }
      });
      editor.addEventListener('focus', () => document.execCommand('defaultParagraphSeparator', false, 'p'));
      editor.addEventListener('blur', flush);
      wrap.replaceChildren(tabs, editor);
    } else {
      const ta = h('textarea', { class: 'notes notepad-raw', placeholder: 'Your notes. Type as you go; after the call the AI writes the rest around them.', value: c.myNotes || '', oninput: (e) => { c.myNotes = e.target.value; saveMine(e.target.value); }, onblur: flush });
      wrap.replaceChildren(tabs, ta);
    }
  }
  draw();
  return wrap;
}
