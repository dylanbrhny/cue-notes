// Ask Cue: chat with the team's meetings. A full page (all calls), laid out like the
// Master Inbox's Ask AI, and a box docked at the bottom of each call and folder.
// Conversations stay in memory per scope; each question sends the last turns along,
// so follow-ups work.

const askThreads = new Map(); // scope -> [{ role, text, used, pending, error, wait }]
const askClosed = new Set();   // docked chats the user closed (scope), so a repaint keeps them closed
let askDraft = '';             // what's typed in the Ask Cue page's box, kept when the page is drawn again
let askRoute = null;           // the route the page was last drawn for: a new visit puts the cursor in the box

// Someone else signed in, or nobody is: forget the chats (their answers can quote calls
// only the last person could see).
function askReset() { askThreads.clear(); askClosed.clear(); askDraft = ''; }

// The Ask Cue page's quick starts along the top: a short label and an icon on the
// button, and the full question it asks straight away.
const ASK_STARTERS = [
  { icon: 'calendar', label: 'Grant’s week', q: 'Summarize Grant’s calls this week' },
  { icon: 'chat', label: 'Top objections', q: 'What objections come up most, and how is Grant handling them?' },
  { icon: 'clock', label: 'Waiting on us', q: 'Which prospects are waiting on us for a next step?' },
  { icon: 'alert', label: 'Client complaints', q: 'What have clients complained about this month?' },
];

// The docked box's suggestions, for a folder or a call.
const ASK_PROMPTS = {
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

// Line icons for the page, drawn like the rest of Cue's (lineIcon in app.js).
const ASK_ICON = {
  calendar: lineIcon('M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z M16 2v4 M8 2v4 M3 10h18'),
  chat: lineIcon('M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z'),
  clock: lineIcon('M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2'),
  alert: lineIcon('M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 8v4 M12 16h.01'),
  send: lineIcon('M22 2 11 13 M22 2l-7 20-4-9-9-4 20-7z'),
};

// Asks Cue one question in a conversation. The question and a pending answer go on the
// thread at once, and the pending answer is returned; its .wait settles once the answer
// (or the error) has filled it in, so a page drawn again meanwhile can wait on it too.
function askSend(thread, q, { callId = null, folderId = null } = {}) {
  const history = thread.filter((m) => !m.pending && !m.error).map((m) => ({ role: m.role, text: m.text })).slice(-10);
  thread.push({ role: 'user', text: q });
  const pending = { role: 'assistant', pending: true, text: '' };
  thread.push(pending);
  pending.wait = (async () => {
    let r;
    // A request that fails outright (rather than an answer saying why) gets the plain message.
    try { r = await call('ask:run', { question: q, history, callId, folderId }); } catch { r = { ok: false }; }
    pending.pending = false;
    if (r?.ok) { pending.text = r.text || 'No answer.'; pending.used = r.used; } else { pending.error = true; pending.text = r?.error || 'Cue couldn’t answer that. Try again.'; }
  })();
  return pending;
}

const askCopyBtn = (text) => h('button', { class: 'link-btn', onclick: async (e) => { await navigator.clipboard.writeText(text).catch(() => {}); e.target.textContent = 'Copied'; setTimeout(() => { e.target.textContent = 'Copy'; }, 1200); } }, 'Copy');
// "From: call, call": the calls the answer came from, each one a link to the call.
const askUsed = (used, cls) => ((used || []).length ? h('span', { class: cls }, 'From: ', ...used.slice(0, 4).map((u, i) => [i ? ', ' : '', h('a', { href: '#', onclick: (e) => { e.preventDefault(); go({ view: 'call', id: u.id }); } }, u.title)])) : h('span'));

// The Ask box docked at the bottom of a call or a folder (the Ask Cue page is askPage below).
function askPanel({ callId = null, folderId = null, folderName = '', compact = false } = {}) {
  const scope = callId || (folderId ? `folder:${folderId}` : 'global');
  const kind = callId ? 'call' : 'folder';
  if (!askThreads.has(scope)) askThreads.set(scope, []);
  const thread = askThreads.get(scope);
  const box = h('div', { class: `ask ${compact ? 'compact' : ''}` });
  const log = h('div', { class: 'ask-log' });
  const input = h('textarea', { class: 'ask-input', rows: 1, placeholder: callId ? 'Ask about this call…' : `Ask about the calls in ${folderName || 'this folder'}…`,
    onfocus: () => box.classList.add('focused'), onblur: () => setTimeout(() => box.classList.remove('focused'), 150),
    onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(input.value); } },
    oninput: () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 160)}px`; } });
  const sendBtn = h('button', { class: 'btn primary', onclick: () => send(input.value) }, 'Ask');
  let busy = false;

  function drawLog() {
    log.replaceChildren(...thread.map((m) => m.role === 'user'
      ? h('div', { class: 'ask-q' }, m.text)
      : h('div', { class: 'ask-a' },
          m.pending ? h('div', { class: 'placeholder' }, h('span', { class: 'spin' }), 'Reading your calls…')
            : m.error ? h('div', { class: 'form-error' }, m.text)
            : h('div', { class: 'md', html: renderMd(m.text) }),
          !m.pending && !m.error ? h('div', { class: 'ask-foot' }, askUsed(m.used, 'ask-used'), askCopyBtn(m.text)) : null)));
    if (!compact) log.scrollTop = log.scrollHeight;
  }
  // Waits for an answer, then shows it (if this box is still on the page).
  async function settle(pending) {
    busy = true; sendBtn.disabled = true;
    await pending.wait;
    busy = false; sendBtn.disabled = false;
    if (box.isConnected) { drawLog(); drawChips(); }
  }
  function send(q) {
    q = String(q || '').trim();
    if (!q || busy) return;
    input.value = ''; input.style.height = 'auto';
    askClosed.delete(scope);
    const pending = askSend(thread, q, { callId, folderId });
    drawLog(); drawChips();
    settle(pending);
  }
  const chips = h('div', { class: 'ask-chips' });
  const newChat = () => { thread.length = 0; askClosed.delete(scope); drawLog(); drawChips(); };
  function drawChips() {
    chips.replaceChildren(...(thread.length ? [] : ASK_PROMPTS[kind].map((p) => h('button', { class: 'chip-btn', onclick: () => send(p) }, p))));
    layout();
  }

  // The chat opens in its own panel above the box, with a header and a close button.
  // Esc or a click anywhere outside closes it; "Show chat" opens it again.
  const panel = h('div', { class: 'ask-panel', role: 'dialog', 'aria-label': 'Ask Cue' },
    h('div', { class: 'ask-head' },
      h('span', { class: 'ask-title' }, h('span', { class: 'ask-ic', html: ICON.sparkle }), 'Ask Cue',
        h('span', { class: 'ask-scope' }, callId ? 'about this call' : `about ${folderName || 'this folder'}`)),
      h('span', { class: 'grow' }),
      h('button', { class: 'link-btn', onclick: () => { newChat(); input.focus(); } }, 'New chat'),
      h('button', { class: 'icon-btn ask-close', title: 'Close (Esc)', 'aria-label': 'Close chat', html: ICON.x, onclick: () => setOpen(false) })),
    log);
  const reopen = h('div', { class: 'ask-reopen-row' },
    h('button', { class: 'ask-reopen', onclick: () => setOpen(true) }, h('span', { class: 'ask-ic', html: ICON.sparkle }), 'Show chat'));
  function layout() {
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
  // Back on the page while an answer is still coming: wait for it here too.
  const waiting = thread.find((m) => m.pending && m.wait);
  if (waiting) settle(waiting);
  box.classList.add('dock');
  box.replaceChildren(panel, reopen, chips, h('div', { class: 'ask-bar' }, input, sendBtn));
  return box;
}

// ---------------------------------------------------------------------------
// The Ask Cue page, laid out like the Master Inbox's Ask AI: quick starts along the
// top, then either the empty page (the orb and "Ask Cue" over one big box) or the
// conversation, with the same box docked at the bottom for follow-ups.
// ---------------------------------------------------------------------------

const askOrb = (cls = '') => h('span', { class: `askp-orb ${cls}`, 'aria-hidden': 'true' });

function askPage() {
  const scope = 'global';
  if (!askThreads.has(scope)) askThreads.set(scope, []);
  const thread = askThreads.get(scope);
  const busy = () => thread.some((m) => m.pending);
  const fresh = askRoute !== route; // opened just now, not drawn again in place
  askRoute = route;
  const wasTyping = !!document.activeElement?.classList?.contains('askp-input');

  // The box grows with what you type. Enter asks, Shift+Enter starts a new line.
  const input = h('textarea', { class: 'askp-input', rows: 1, 'aria-label': 'Ask Cue',
    onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(input.value); } },
    oninput: () => { askDraft = input.value; fit(); sync(); } });
  input.value = askDraft;
  const sendBtn = h('button', { type: 'button', class: 'askp-send', title: 'Ask (Enter)', 'aria-label': 'Ask', html: ASK_ICON.send, onclick: () => ask(input.value) });
  const row = h('div', { class: 'askp-compose-row' }, h('span', { class: 'grow' }), sendBtn);
  // A click on the card around the text still puts the cursor in it.
  const box = h('div', { class: 'askp-compose', onmousedown: (e) => { if (e.target === box || e.target === row || e.target.classList.contains('grow')) { e.preventDefault(); input.focus(); } } }, input, row);
  const fit = () => { input.style.height = 'auto'; if (input.scrollHeight) input.style.height = `${Math.min(input.scrollHeight, 220)}px`; };
  const sync = () => { sendBtn.disabled = busy() || !input.value.trim(); };

  // Quick starts: made once and only switched on and off, so a focused one keeps its focus.
  const newBtn = h('button', { type: 'button', class: 'askp-chip', onclick: newChat }, h('span', { class: 'askp-chip-ic', html: ICON.plus }), 'New chat');
  const starters = ASK_STARTERS.map((s) => h('button', { type: 'button', class: 'askp-chip starter', title: s.q, onclick: () => ask(s.q) },
    h('span', { class: 'askp-chip-ic', html: ASK_ICON[s.icon] }), s.label));
  const top = h('div', { class: 'askp-top' }, newBtn, starters);

  const note = h('p', { class: 'askp-note' }, 'Cue searches the notes and transcripts and answers with where it found it. Private calls stay private.');
  const home = h('div', { class: 'askp-home' }, h('h1', { class: 'askp-hero' }, askOrb('lg'), 'Ask Cue'), note);
  const log = h('div', { class: 'askp-thread' });
  const body = h('div', { class: 'askp-body' }, log);
  const dock = h('div', { class: 'askp-dock' });
  const title = h('h1', { class: 'askp-sr' }, 'Ask Cue'); // the conversation's heading, for screen readers
  const status = h('div', { class: 'askp-sr', role: 'status' }); // tells screen readers when an answer lands
  const view = h('div', { class: 'askp-view' });
  const page = h('div', { class: 'askp' });

  function ask(q) {
    q = String(q || '').trim();
    if (!q || busy()) return;
    input.value = ''; askDraft = '';
    const pending = askSend(thread, q);
    status.textContent = 'Reading your calls…';
    draw('end');
    input.focus();
    pending.wait.then(() => landed(pending));
  }
  // An answer (or an error) came in: show it, unless that chat was cleared meanwhile.
  function landed(m) {
    if (!page.isConnected || !thread.includes(m)) return;
    status.textContent = m.error ? m.text : 'Cue answered.';
    draw('answer');
  }
  function newChat() { thread.length = 0; status.textContent = ''; draw(); input.focus(); }

  const msg = (m) => (m.role === 'user'
    ? h('div', { class: 'askp-msg me' }, h('div', { class: 'askp-bubble' }, m.text))
    : h('div', { class: 'askp-msg ai' }, askOrb(m.pending ? 'busy' : ''),
        h('div', { class: 'askp-main' },
          m.pending ? h('div', { class: 'askp-thinking' }, 'Reading your calls…')
            : m.error ? h('div', { class: 'askp-error' }, m.text)
            : [h('div', { class: 'md askp-md', html: renderMd(m.text) }), h('div', { class: 'askp-foot' }, askUsed(m.used, 'askp-used'), askCopyBtn(m.text))])));
  // Messages that haven't changed keep their node, so focus or a text selection in an
  // earlier answer survives a new one landing.
  const shown = new WeakMap(); // message -> { key, el }
  function drawLog() {
    const els = thread.map((m) => {
      const key = m.role === 'user' ? 'q' : m.pending ? 'wait' : m.error ? 'error' : 'answer';
      let s = shown.get(m);
      if (!s || s.key !== key) { s = { key, el: msg(m) }; shown.set(m, s); }
      return s.el;
    });
    for (const el of [...log.children]) if (!els.includes(el)) el.remove();
    els.forEach((el, i) => { if (log.children[i] !== el) log.insertBefore(el, log.children[i] || null); });
  }

  // scroll: 'end' shows the newest message; 'answer' puts the last question at the top,
  // so a long answer reads from its start (a short one just shows the bottom).
  function draw(scroll = 'answer') {
    const chat = thread.length > 0;
    page.classList.toggle('chat', chat);
    newBtn.hidden = !chat;
    for (const b of starters) b.disabled = busy();
    input.placeholder = chat ? 'Ask a follow-up…' : 'Ask anything about the team’s calls';
    box.classList.toggle('big', !chat);
    const typing = document.activeElement === input;
    if (!chat) {
      if (box.parentNode !== home) home.insertBefore(box, note);
      if (home.parentNode !== view) view.replaceChildren(home);
    } else {
      drawLog();
      // Moved only when it isn't there yet, so typing (or an IME) isn't cut off when an answer lands.
      if (box.parentNode !== dock) dock.replaceChildren(box);
      if (body.parentNode !== view) view.replaceChildren(title, body, dock);
      requestAnimationFrame(() => {
        const qs = log.querySelectorAll('.askp-msg.me');
        body.scrollTop = scroll === 'end' || !qs.length ? body.scrollHeight : Math.max(0, qs[qs.length - 1].offsetTop - 16);
      });
    }
    if (typing && document.activeElement !== input) input.focus();
    fit(); sync();
  }

  // Back on the page while an answer is still coming: show it when it lands.
  const waiting = thread.find((m) => m.pending && m.wait);
  if (waiting) waiting.wait.then(() => landed(waiting));
  draw();
  page.replaceChildren(top, view, status);
  // A new visit puts the cursor in the box, like the inbox (not on touch screens, where it
  // would pop the keyboard up); so does drawing the page again while you were typing.
  requestAnimationFrame(() => {
    if (!page.isConnected) return;
    fit();
    if (wasTyping || (fresh && !matchMedia('(pointer: coarse)').matches)) input.focus();
  });
  return page;
}

function renderAsk() {
  $view.replaceChildren(viewAs
    ? h('div', { class: 'askp' }, h('div', { class: 'askp-view' }, h('div', { class: 'askp-home' },
        h('h1', { class: 'askp-hero' }, askOrb('lg'), 'Ask Cue'),
        h('p', { class: 'askp-note' }, `Ask is off while you’re viewing Cue as ${viewAs.name}: it would answer from your calls, not theirs.`))))
    : askPage());
}
