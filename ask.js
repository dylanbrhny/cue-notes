// Ask Cue: chat with the team's meetings. A full page (all calls) and a box at
// the bottom of each call. Conversations stay in memory per scope.

const askThreads = new Map(); // scope -> [{ role, text, used }]
const askClosed = new Set();   // docked chats the user closed (scope), so a repaint keeps them closed

const ASK_PROMPTS = {
  global: [
    'Summarize Grant’s calls this week',
    'What objections come up most, and how is Grant handling them?',
    'Which prospects are waiting on us for a next step?',
    'What have clients complained about this month?',
  ],
  folder: [
    'What do these calls have in common?',
    'Which of these are waiting on us for a next step?',
    'What objections came up across these calls?',
    'Summarize where each account stands',
  ],
  call: [
    'Write the follow-up email',
    'List the action items with owners',
    'How well did we sell the outcome vs features?',
    'What objections came up and how were they handled?',
  ],
};

function askPanel({ callId = null, folderId = null, folderName = '', compact = false, dock = false } = {}) {
  const scope = callId || (folderId ? `folder:${folderId}` : 'global');
  const kind = callId ? 'call' : folderId ? 'folder' : 'global';
  if (!askThreads.has(scope)) askThreads.set(scope, []);
  const thread = askThreads.get(scope);
  const box = h('div', { class: `ask ${compact ? 'compact' : ''}` });
  const log = h('div', { class: 'ask-log' });
  const input = h('textarea', { class: 'ask-input', rows: 1, placeholder: callId ? 'Ask about this call…' : folderId ? `Ask about the calls in ${folderName || 'this folder'}…` : 'Ask anything about the team’s calls…',
    onfocus: () => box.classList.add('focused'), onblur: () => setTimeout(() => box.classList.remove('focused'), 150),
    onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input.value); } },
    oninput: () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 160)}px`; } });
  const sendBtn = h('button', { class: 'btn primary', onclick: () => send(input.value) }, 'Ask');
  let busy = false;

  const copyBtn = (text) => h('button', { class: 'link-btn', onclick: async (e) => { await navigator.clipboard.writeText(text).catch(() => {}); e.target.textContent = 'Copied'; setTimeout(() => { e.target.textContent = 'Copy'; }, 1200); } }, 'Copy');
  function drawLog() {
    log.replaceChildren(...thread.map((m) => m.role === 'user'
      ? h('div', { class: 'ask-q' }, m.text)
      : h('div', { class: 'ask-a' },
          m.pending ? h('div', { class: 'placeholder' }, h('span', { class: 'spin' }), 'Reading your calls…')
            : m.error ? h('div', { class: 'form-error' }, m.text)
            : h('div', { class: 'md', html: renderMd(m.text) }),
          !m.pending && !m.error ? h('div', { class: 'ask-foot' },
            (m.used || []).length ? h('span', { class: 'ask-used' }, 'From: ', ...m.used.slice(0, 4).map((u, i) => [i ? ', ' : '', h('a', { href: '#', onclick: (e) => { e.preventDefault(); go({ view: 'call', id: u.id }); } }, u.title)])) : h('span'),
            copyBtn(m.text)) : null)));
    if (!compact) log.scrollTop = log.scrollHeight;
  }
  async function send(q) {
    q = String(q || '').trim();
    if (!q || busy) return;
    busy = true; sendBtn.disabled = true; input.value = ''; input.style.height = 'auto';
    askClosed.delete(scope);
    const history = thread.filter((m) => !m.pending && !m.error).map((m) => ({ role: m.role, text: m.text })).slice(-10);
    thread.push({ role: 'user', text: q });
    const pending = { role: 'assistant', pending: true, text: '' };
    thread.push(pending);
    drawLog(); drawChips();
    const r = await call('ask:run', { question: q, history, callId, folderId });
    pending.pending = false;
    if (r.ok) { pending.text = r.text || 'No answer.'; pending.used = r.used; } else { pending.error = true; pending.text = r.error; }
    busy = false; sendBtn.disabled = false;
    drawLog(); drawChips();
  }
  const chips = h('div', { class: 'ask-chips' });
  const newChat = () => { thread.length = 0; askClosed.delete(scope); drawLog(); drawChips(); };
  function drawChips() {
    chips.replaceChildren(...(thread.length ? [] : ASK_PROMPTS[kind].map((p) => h('button', { class: 'chip-btn', onclick: () => send(p) }, p))),
      thread.length && !dock ? h('button', { class: 'link-btn', onclick: newChat }, 'New chat') : null);
    layout();
  }
  if (!dock) {
    drawLog(); drawChips();
    box.replaceChildren(log, chips, h('div', { class: 'ask-bar' }, input, sendBtn));
    return box;
  }

  // Docked at the bottom of a page: the chat opens in its own panel above the box, with a
  // header and a close button. Esc or a click anywhere outside closes it; "Show chat" opens it again.
  const panel = h('div', { class: 'ask-panel', role: 'dialog', 'aria-label': 'Ask Cue' },
    h('div', { class: 'ask-head' },
      h('span', { class: 'ask-title' }, h('span', { class: 'ask-ic', html: ICON.sparkle }), 'Ask Cue',
        h('span', { class: 'ask-scope' }, callId ? 'about this call' : folderId ? `about ${folderName || 'this folder'}` : 'about all calls')),
      h('span', { class: 'grow' }),
      h('button', { class: 'link-btn', onclick: () => { newChat(); input.focus(); } }, 'New chat'),
      h('button', { class: 'icon-btn ask-close', title: 'Close (Esc)', 'aria-label': 'Close chat', html: ICON.x, onclick: () => setOpen(false) })),
    log);
  const reopen = h('div', { class: 'ask-reopen-row' },
    h('button', { class: 'ask-reopen', onclick: () => setOpen(true) }, h('span', { class: 'ask-ic', html: ICON.sparkle }), 'Show chat'));
  function layout() {
    if (!dock) return;
    const has = thread.length > 0, open = has && !askClosed.has(scope);
    panel.hidden = !open;
    reopen.hidden = !has || open;
    box.classList.toggle('open', open);
  }
  function setOpen(on) {
    if (on) askClosed.delete(scope); else askClosed.add(scope);
    layout();
    if (on) log.scrollTop = log.scrollHeight;
  }
  const isOpen = () => box.isConnected && thread.length > 0 && !askClosed.has(scope);
  const offPage = () => { if (box.isConnected) return false; document.removeEventListener('mousedown', onDown, true); document.removeEventListener('keydown', onKey); return true; };
  const onDown = (e) => { if (!offPage() && isOpen() && !box.contains(e.target)) setOpen(false); };
  const onKey = (e) => {
    if (offPage() || e.key !== 'Escape' || e.defaultPrevented || !isOpen()) return;
    const a = document.activeElement;
    if (a && a !== document.body && !box.contains(a)) return; // Esc belongs to whatever else has focus
    e.preventDefault(); setOpen(false); input.blur();
  };
  document.addEventListener('mousedown', onDown, true);
  document.addEventListener('keydown', onKey);
  drawLog(); drawChips();
  box.classList.add('dock');
  box.replaceChildren(panel, reopen, chips, h('div', { class: 'ask-bar' }, input, sendBtn));
  return box;
}

function renderAsk() {
  $view.replaceChildren(
    h('h1', { class: 'page' }, 'Ask Cue'),
    h('p', { class: 'hint', style: 'margin:0 0 18px;color:var(--text-3)' }, 'Ask about any call the team has had. Cue searches the notes and transcripts and answers with where it found it. Private calls stay private.'),
    askPanel());
}
