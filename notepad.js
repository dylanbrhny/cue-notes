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

// The coaching written for the rep (Checklist review, Dream outcome, Conversation dynamics)
// gets its own tab, so the notes can be edited, copied and shared without it, and it stays put.
// The split goes by heading name on purpose: the Coaching tab is exactly what a share link
// leaves out, so a section typed under one of these headings moves there (and stays private).
// Saving puts the coaching after the notes; nothing is dropped.
// Both still live in one stored document (aiNotes), so Ask, MCP and the share page see what
// they always did. KEEP IN STEP with public.shareable_notes in supabase/029_overnight_fixes.sql:
// a section starts at a #-#### heading whose text begins with one of these names (any case) and
// runs to the next #-#### heading.
const COACH_HEAD = /^#{1,4}[ \t]*(checklist review|dream outcome|conversation dynamics)/i;
const ANY_HEAD = /^#{1,4}[ \t]/;
function splitCoaching(md) {
  const notes = [];
  const coaching = [];
  let inCoach = false;
  for (const line of String(md || '').split('\n')) {
    if (COACH_HEAD.test(line)) inCoach = true;
    else if (ANY_HEAD.test(line)) inCoach = false;
    (inCoach ? coaching : notes).push(line);
  }
  const tidy = (a) => a.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { notes: tidy(notes), coaching: tidy(coaching) };
}
const joinNotes = (notes, coaching) => [notes, coaching].map((x) => String(x || '').trim()).filter(Boolean).join('\n\n');
// Notes-mode calls (the plain note taker) have no coaching: never split those.
const notesParts = (c) => (c.mode === 'notes' ? { notes: String(c.aiNotes || '').trim(), coaching: '' } : splitCoaching(c.aiNotes));

// The notes as text you can paste anywhere: title, date and the notes.
function noteMarkdown(c, body) {
  const when = c.startedAt ? new Date(c.startedAt).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  const who = (c.attendees || []).map((a) => a.name || a.email).filter(Boolean);
  const head = [`# ${c.title || 'Untitled call'}`, [when, who.length ? `With ${who.join(', ')}` : ''].filter(Boolean).join(' · ')].filter(Boolean).join('\n');
  // body: the text of one tab (Notes, Coaching, My notes). Without it: the whole notes.
  return `${head}\n\n${String(body !== undefined ? body : (c.aiNotes || c.myNotes || '')).trim()}\n`;
}

function transcriptText(c, names = { me: 'You', them: 'Them' }) {
  return (c.transcript || []).map((s) => `${typeof s.at === 'number' ? `[${fmtClock(s.at)}] ` : ''}${s.speaker === 'me' ? names.me : s.speaker === 'them' ? names.them : s.speaker}: ${s.text}`).join('\n');
}

// The plain-text half of every copy, for wherever plain text is all that lands: WhatsApp,
// iMessage, SMS, a .txt file, a terminal. No markup characters (no **, *, #, _), because
// those only mean something in some apps and are clutter everywhere else. The shape is
// kept instead: "•" bullets, "◦" for nested ones (indented), numbered lists, headings on
// their own line, a blank line between blocks. Apps that take formatting (Slack, Gmail,
// Docs, Notion, Word) get the HTML half, with real bold and lists.
function plainText(root) {
  const inline = (node) => [...node.childNodes].map((n) => {
    if (n.nodeType === 3) return n.nodeValue.replace(/\s+/g, ' ');
    if (n.nodeType !== 1) return '';
    const t = n.tagName;
    if (t === 'UL' || t === 'OL') return '';
    if (t === 'BR') return '\n';
    if (t === 'INPUT') return n.getAttribute('type') === 'checkbox' ? (n.hasAttribute('checked') || n.checked ? '☑ ' : '☐ ') : '';
    const inner = inline(n);
    if (t === 'A') { const href = n.getAttribute('href') || ''; const s2 = inner.trim(); return /^https?:\/\//.test(href) && s2 && s2 !== href ? `${inner} (${href})` : inner; }
    return inner;
  }).join('');
  const line = (el) => inline(el).replace(/[ \t]*\n[ \t]*/g, '\n').replace(/ {2,}/g, ' ').trim();
  const blocks = [];
  const list = (el, depth, out) => {
    let i = Number(el.getAttribute('start')) || 1;
    for (const li of el.children) {
      if (li.tagName !== 'LI') continue;
      const mark = el.tagName === 'OL' ? `${i++}.` : depth ? '◦' : '•';
      const text = line(li);
      if (text) out.push(`${'    '.repeat(depth)}${mark} ${text.replace(/\n/g, `\n${'    '.repeat(depth)}  `)}`);
      for (const sub of li.children) if (sub.tagName === 'UL' || sub.tagName === 'OL') list(sub, depth + 1, out);
    }
  };
  let run = null;   // loose inline content (a selection can start in the middle of a paragraph)
  const flush = () => { if (run) { const t = line(run); if (t) blocks.push(t); run = null; } };
  const walk = (parent) => {
    for (const el of [...parent.childNodes]) {
      const t = el.nodeType === 1 ? el.tagName : '';
      if (!t || !/^(P|DIV|SECTION|ARTICLE|H[1-6]|UL|OL|LI|BLOCKQUOTE|PRE|TABLE|THEAD|TBODY|TR|HR)$/.test(t)) {
        if (!run) run = document.createElement('span');
        run.append(el.cloneNode(true));
        continue;
      }
      flush();
      if (/^H[1-6]$/.test(t)) { const h2 = el.textContent.replace(/\s+/g, ' ').trim(); if (h2) blocks.push(h2); }
      else if (t === 'UL' || t === 'OL') { const out = []; list(el, 0, out); if (out.length) blocks.push(out.join('\n')); }
      else if (t === 'LI') { const holder = document.createElement('ul'); holder.append(el.cloneNode(true)); const out = []; list(holder, 0, out); if (out.length) blocks.push(out.join('\n')); }
      else if (t === 'BLOCKQUOTE') { const q = plainText(el); if (q) blocks.push(q.split('\n').map((l) => (l ? `> ${l}` : '>')).join('\n')); }
      else if (t === 'PRE') blocks.push(el.textContent.replace(/\n$/, ''));
      else if (t === 'TABLE' || t === 'THEAD' || t === 'TBODY' || t === 'TR') {
        const rows = (t === 'TR' ? [el] : [...el.querySelectorAll('tr')]).map((tr) => [...tr.children].map((td) => line(td)).join(' | ')).filter(Boolean);
        if (rows.length) blocks.push(rows.join('\n'));
      } else if (t === 'HR') blocks.push('———');
      else if (t === 'P') { const p2 = line(el); if (p2) blocks.push(p2); }
      else walk(el);   // DIV, SECTION…: look inside
    }
    flush();
  };
  walk(root);
  return blocks.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}
const mdToPlain = (md) => { const d = document.createElement('div'); d.innerHTML = renderMd(md); return plainText(d); };

// Copy as rich text (pastes formatted into Slack, Gmail, Docs, Notion) with clean plain text
// (bullets, no markup) for WhatsApp, texts and .txt files.
async function copyRich(md) {
  const plain = mdToPlain(md);
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([renderMd(md)], { type: 'text/html' }), 'text/plain': new Blob([plain], { type: 'text/plain' }) })]);
    return true;
  } catch {
    try { await navigator.clipboard.writeText(plain); return true; } catch { return false; }
  }
}

// Copying a selection anywhere in Cue (an Ask answer, the notes, a brief): the same clean plain
// text, tidy HTML for apps that take formatting, and the markdown under a Cue-only type so
// pasting back into the notes keeps bullets and bold. Form fields copy as usual.
const CUE_MD_TYPE = 'text/x-cue-markdown';
document.addEventListener('copy', (e) => {
  const sel = window.getSelection();
  const active = document.activeElement;
  if (!e.clipboardData || !sel || sel.isCollapsed || !sel.rangeCount || (active && /^(INPUT|TEXTAREA)$/.test(active.tagName))) return;
  const box = document.createElement('div');
  for (let i = 0; i < sel.rangeCount; i++) {
    const r = sel.getRangeAt(i);
    const frag = r.cloneContents();
    const ca = r.commonAncestorContainer;
    // A selection inside one list loses the list around its items: put it back.
    if (ca.nodeType === 1 && /^(UL|OL)$/.test(ca.tagName)) { const l = document.createElement(ca.tagName); l.append(frag); box.append(l); } else box.append(frag);
  }
  box.querySelectorAll('*').forEach((el) => {
    for (const a of [...el.attributes]) if (!((el.tagName === 'A' && a.name === 'href') || (el.tagName === 'INPUT' && (a.name === 'type' || a.name === 'checked')) || (el.tagName === 'OL' && a.name === 'start'))) el.removeAttribute(a.name);
  });
  box.querySelectorAll('button, svg, .np-tabs, .ask-foot, .askp-foot').forEach((el) => el.remove());
  const text = plainText(box);
  if (!text.trim()) return;
  e.preventDefault();
  e.clipboardData.setData('text/plain', text);
  e.clipboardData.setData('text/html', box.innerHTML);
  // For the markdown, loose text at the top (a selection that starts mid-paragraph) goes in a paragraph.
  const forMd = document.createElement('div');
  let para = null;
  for (const n of [...box.childNodes]) {
    if (n.nodeType === 1 && /^(P|DIV|H[1-6]|UL|OL|BLOCKQUOTE|PRE|TABLE|HR)$/.test(n.tagName)) { para = null; forMd.append(n.cloneNode(true)); continue; }
    if (!para) { para = document.createElement('p'); forMd.append(para); }
    para.append(n.cloneNode(true));
  }
  try { e.clipboardData.setData(CUE_MD_TYPE, htmlToMd(forMd)); } catch {}
});

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
  // part: 'notes' or 'coaching', fixed when the editor is made. The other part is kept as it is,
  // so typing in one tab can never drop the other (they're stored as one document).
  const saveDoc = debounce((editor, part) => {
    const edited = htmlToMd(editor);
    const cur = notesParts(c);
    const md = part === 'coaching' ? joinNotes(cur.notes, edited) : joinNotes(edited, cur.coaching);
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

  const copyBtn = () => h('button', { class: 'np-copy', title: view === 'transcript' ? 'Copy the transcript' : view === 'coaching' ? 'Copy the coaching' : 'Copy the notes (pastes formatted into email, Docs or Slack)', onclick: async (e) => {
    flush();
    const b = e.currentTarget;
    const parts = notesParts(c);
    const ok = view === 'transcript' ? await navigator.clipboard.writeText(transcriptText(c, names)).then(() => true, () => false)
      : await copyRich(noteMarkdown(c, view === 'mine' ? (c.myNotes || '') : view === 'coaching' ? parts.coaching : parts.notes));
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
    const parts = notesParts(c);
    // Open on a tab with something in it: notes that are only coaching (e.g. the checklist
    // written when the AI couldn't run) open on Coaching, and the empty Notes tab is left out.
    const showNotes = !!c.aiNotes && (!!parts.notes || !parts.coaching);
    if (view === 'coaching' && !parts.coaching) view = 'notes';
    if (view === 'notes' && !showNotes && parts.coaching) view = 'coaching';
    const tabs = h('div', { class: 'np-tabs' },
      showNotes ? tab('notes', 'Notes') : null,
      c.aiNotes && parts.coaching ? tab('coaching', 'Coaching') : null,
      tab('mine', c.aiNotes ? 'My notes' : 'Notes'),
      transcript && (c.transcript || []).length ? tab('transcript', 'Transcript') : null,
      view === 'coaching' ? h('span', { class: 'np-hint', title: 'Checklist review, Dream outcome and Conversation dynamics stay inside Cue' }, 'For the rep. Share links leave this out.') : null,
      h('span', { class: 'np-key' }, status),
      (view === 'transcript' || c.aiNotes || c.myNotes) ? copyBtn() : null,
      extra);

    if (view === 'transcript' && transcript) { wrap.replaceChildren(tabs, drawTranscript()); return; }
    if ((view === 'notes' || view === 'coaching') && c.aiNotes) {
      const part = view;
      const editor = h('div', { class: `notepad md${part === 'coaching' ? ' np-coaching' : ''}`, contenteditable: viewAs ? 'false' : 'true', spellcheck: 'true', html: renderMd(part === 'coaching' ? parts.coaching : parts.notes) });
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
        saveDoc(editor, part);
      });
      editor.addEventListener('paste', (e) => {
        e.preventDefault();
        const md = e.clipboardData.getData(CUE_MD_TYPE);
        if (md && md.trim()) {
          // From Cue, through the same sanitizer as the notes. One paragraph goes in inline, at the caret.
          const html = renderMd(md).trim();
          const one = /^<p>[\s\S]*<\/p>$/.test(html) && html.indexOf('<p>', 1) < 0 ? html.slice(3, -4) : html;
          document.execCommand('insertHTML', false, one);
        }
        else document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
      });
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
