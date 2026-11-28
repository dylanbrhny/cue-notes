// Ask Cue: chat with the team's meetings. A full page laid out like the Master Inbox's Ask AI,
// with saved chats like ChatGPT (the newest under the box, All chats with search and delete),
// and a box docked at the bottom of each call and folder (those chats stay in memory, per
// call or folder). Each question sends the last turns along, so follow-ups work. Answers
// stream in: the steps Cue takes ("Searching calls…"), then the answer as it is written.

const askThreads = new Map(); // docked chats: scope (call id, folder:<id>) -> [{ role, text, used, pending, error, wait }]
const askClosed = new Set();   // docked chats the user closed (scope), so a repaint keeps them closed
let askDraft = '';             // what's typed in the Ask Cue page's box, kept when the page is drawn again
let askRoute = null;           // the route the page was last drawn for: a new visit puts the cursor in the box

// ---- saved chats ---------------------------------------------------------------------------
// The Ask Cue page's chats live in this computer's (or browser's) localStorage, under the
// signed-in person's id: someone else signing in here never sees them. Newest first.
// A chat: { id, title, createdAt, updatedAt, messages: [{ role, text, used?, error?, stopped? }] }.
// Answers still being written are never saved; the question is, and the answer is saved
// into the chat it was asked in when it lands, wherever the page is by then.
const ASK_KEEP = 200;
// About 3 MB of the browser's ~5 MB per site: the web app keeps its sign-in and settings in
// the same storage, and everyone who signs in on this computer has their own list.
const ASK_BYTES = 1_500_000;
let askStore = null;          // { owner, chats } for whoever is signed in now
let askOpenId = null;         // the chat on the page (null: the empty page)
let askAll = false;           // the All chats list is showing
let askFilter = '';           // All chats' search box
const askSeeded = new Set();  // demo: owners whose sample chats were put back this session
const askGone = new Set();    // chats deleted here, so another tab's copy of the list can't bring them back

// Someone else signed in, or nobody is: forget what's in memory (the answers can quote calls
// only the last person could see), and stop answers still being written. Saved chats stay
// saved, under their owner.
function askReset() {
  for (const m of askLive.values()) askStop(m);
  askThreads.clear(); askClosed.clear(); askDraft = ''; askStore = null; askOpenId = null; askAll = false; askFilter = '';
}

const askKey = (owner) => `cue-ask-chats:${owner}`;
const askId = () => { try { return crypto.randomUUID(); } catch { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`; } };
// The chat's name: its first question, on one line, cut at a word near 60 characters.
function askTitle(q) {
  const t = String(q || '').replace(/\s+/g, ' ').trim();
  if (t.length <= 60) return t || 'New chat';
  const cut = t.slice(0, 60);
  const at = cut.lastIndexOf(' ');
  return `${(at > 30 ? cut.slice(0, at) : cut).replace(/[\s,.;:!?-]+$/, '')}…`;
}
// Today: the time. Before: the day ("Nov 24"), with the year when it isn't this one.
function askDay(ms) {
  const d = new Date(ms);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
}

// What is saved for one message / chat: plain fields only (no pending answers, no live state).
function askSaved(m) {
  return { role: m.role, text: String(m.text || ''), ...(m.used?.length ? { used: m.used.slice(0, 8).map((u) => ({ id: String(u.id), title: String(u.title || '') })) } : {}), ...(m.error ? { error: true } : {}), ...(m.stopped ? { stopped: true } : {}) };
}
function askSavedChat(c) {
  return { id: c.id, title: c.title, createdAt: c.createdAt, updatedAt: c.updatedAt, messages: c.messages.filter((m) => !m.pending).map(askSaved) };
}
// A chat read back from storage, checked field by field (it is only ever shown as text or
// through the markdown cleaner, but a damaged entry should not break the page).
function askClean(c) {
  if (!c || typeof c !== 'object' || typeof c.id !== 'string' || !Array.isArray(c.messages)) return null;
  const messages = c.messages.filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string').map((m) => askSaved({
    ...m, used: Array.isArray(m.used) ? m.used.filter((u) => u && typeof u.id === 'string') : null,
  }));
  if (!messages.length) return null;
  // Closed (or reloaded) before its answer came: say so, rather than end on a bare question.
  if (messages[messages.length - 1].role === 'user') messages.push({ role: 'assistant', text: '', stopped: true });
  const now = Date.now();
  const createdAt = Number(c.createdAt) || now;
  return { id: c.id.slice(0, 64), title: typeof c.title === 'string' && c.title.trim() ? c.title.slice(0, 120) : askTitle(messages[0].text), createdAt, updatedAt: Number(c.updatedAt) || createdAt, messages };
}
function askRead(owner) {
  try {
    const v = JSON.parse(localStorage.getItem(askKey(owner)) || '[]');
    return (Array.isArray(v) ? v : []).map(askClean).filter(Boolean).sort((a, b) => b.updatedAt - a.updatedAt);
  } catch { return []; }
}
const askQuota = (e) => !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014);
// Saves the newest 200, within ASK_BYTES (the oldest go first; the newest is always kept).
// When storage is full anyway, older chats go a few at a time until it fits, but what was
// saved before is never replaced by an empty list. Returns the ids saved (null: nothing written).
function askWrite(owner, chats) {
  const list = chats.slice().sort((a, b) => b.updatedAt - a.updatedAt).slice(0, ASK_KEEP).map(askSavedChat).filter((c) => c.messages.length);
  const parts = list.map((c) => JSON.stringify(c));
  let n = parts.length;
  let size = parts.reduce((t, p) => t + p.length + 1, 1);
  while (n > 1 && size > ASK_BYTES) size -= parts[--n].length + 1;
  for (;;) {
    try { localStorage.setItem(askKey(owner), `[${parts.slice(0, n).join(',')}]`); return new Set(list.slice(0, n).map((c) => c.id)); } catch (e) {
      if (!askQuota(e) || n <= 1) return null;
      n = Math.max(1, n - Math.ceil(n / 10));
    }
  }
}
// Sample chats for the demo and screenshots (made-up accounts, nobody real).
function askDemoChats() {
  const now = Date.now();
  const at = (h) => now - h * 3600_000;
  const chat = (id, h, q, a, used) => ({ id, title: askTitle(q), createdAt: at(h + 0.1), updatedAt: at(h), messages: [{ role: 'user', text: q }, { role: 'assistant', text: a, used }] });
  return [
    chat('demo-waiting', 2, 'Which prospects are waiting on us for a next step?', 'Three are waiting on us:\n\n- **Redline Supplies**: asked for the 5-meeting pack pricing in writing. Due Friday.\n- **Brightwell**: wants two example calls from their industry before they decide.\n- **Summit Platforms**: asked who else signs off; we said we’d send a one-pager for their owner.', [{ id: 'm1', title: 'Synapse Bi-Weekly Review · Redline' }, { id: 'm4', title: '30 Min Meeting Brightwell Notes (Rob Sellers)' }]),
    chat('demo-pricing', 27, 'How are we pitching the 5-meeting pack on calls?', 'Mostly as a low-risk start: **pay for held meetings only**, no retainer. It lands best when the rep ties it to their own numbers (average order and close rate) before naming the price. On two calls the price came before the math, and both prospects pushed back on cost.', [{ id: 'm4', title: '30 Min Meeting Brightwell Notes (Rob Sellers)' }]),
    chat('demo-agency', 75, 'What do prospects say when they have tried an agency before?', 'The same worry comes up each time: they paid a retainer and got meetings with the wrong people. What works best is naming that first, then explaining that we only charge for meetings held with the owner or a buyer.', []),
  ];
}
// The person's chats, read once per sign-in. In the demo they start as the sample chats.
function askChats() {
  const owner = authState.user?.id || null;
  if (!askStore || askStore.owner !== owner) {
    let chats = owner ? askRead(owner) : [];
    if (owner && info.demo && !askSeeded.has(owner)) { askSeeded.add(owner); chats = askDemoChats(); askWrite(owner, chats); }
    for (const c of chats) c.owner = owner;
    askStore = { owner, chats };
  }
  return askStore.chats;
}
// Saves a chat for whoever asked it: the person signed in now, or (when an answer lands after
// someone else signed in) its own owner's list, never the new person's.
function askPersist(chat = null) {
  if (chat?.owner && chat.owner !== askStore?.owner) {
    if (chat.deleted) return;
    askWrite(chat.owner, [chat, ...askRead(chat.owner).filter((c) => c.id !== chat.id)]);
    return;
  }
  if (!askStore?.owner) return;
  // Signed out and back in meanwhile: the list was read again, so this chat replaces its copy.
  const i = chat ? askStore.chats.findIndex((c) => c.id === chat.id) : -1;
  if (i >= 0 && askStore.chats[i] !== chat) { if (askStore.chats[i].deleted) return; askStore.chats[i] = chat; }
  // Chats another tab (of the web app) saved since this one read the list are kept too.
  const have = new Set(askStore.chats.map((c) => c.id));
  for (const c of askRead(askStore.owner)) if (!have.has(c.id) && !askGone.has(c.id)) { c.owner = askStore.owner; askStore.chats.push(c); }
  askStore.chats.sort((a, b) => b.updatedAt - a.updatedAt);
  if (askStore.chats.length > ASK_KEEP) askStore.chats.splice(ASK_KEEP);
  const kept = askWrite(askStore.owner, askStore.chats);
  // What didn't fit goes from the lists too (it would be gone after a restart anyway).
  if (kept) for (let j = askStore.chats.length - 1; j >= 0; j--) if (!kept.has(askStore.chats[j].id) && !askStore.chats[j].messages.some((m) => m.pending)) askStore.chats.splice(j, 1);
}
// Another tab of the web app saved chats: read them again (unless an answer is coming here).
window.addEventListener('storage', (e) => {
  if (!askStore?.owner || e.key !== askKey(askStore.owner)) return;
  if (askStore.chats.some((c) => c.messages.some((m) => m.pending))) return;
  askStore = null;
  if (route.view === 'ask' && !viewAs) renderAsk();
});

// ---- asking ----------------------------------------------------------------------------------

// The page's quick starts along the top: a short label and an icon on the
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
  history: lineIcon('M3 12a9 9 0 1 0 3-6.7L3 8 M3 3v5h5 M12 7v5l3 2'),
  search: lineIcon('M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.35-4.35'),
  stop: '<svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor"/></svg>',
};

// Answers being written, by request id, and the one listener that feeds them: steps go on a
// list, text is the answer so far (a step means the text before it was not the answer).
const askLive = new Map();
let askListening = false;
function askListen() {
  if (askListening) return;
  askListening = true;
  window.cue.on('ask:progress', (ev) => {
    const m = ev && askLive.get(ev.id);
    if (!m || !m.pending) return;
    if (ev.type === 'status') {
      const t = String(ev.text || '').slice(0, 140);
      if (t && m.live.steps.at(-1) !== t) m.live.steps.push(t);
      m.live.text = '';
    } else if (ev.type === 'text') {
      if (ev.turn !== m.live.turn) { m.live.turn = ev.turn; m.live.text = ''; }
      m.live.text += String(ev.delta || '');
    } else return;
    askPing(m);
  });
}
function askPing(m) { for (const fn of [...m.subs]) { try { fn(); } catch (e) { console.error(e); } } }
const askStop = (m) => { if (m?.pending && m.reqId) call('ask:stop', m.reqId).catch(() => {}); };

// Asks Cue one question in a conversation. The question and a pending answer go on the
// thread at once, and the pending answer is returned; its .wait settles once the answer
// (or the error) has filled it in, so a page drawn again meanwhile can wait on it too, and
// its .subs hear about every step and every piece of text while it is written.
function askSend(thread, q, { callId = null, folderId = null } = {}) {
  const history = thread.filter((m) => !m.pending && !m.error && String(m.text || '').trim()).map((m) => ({ role: m.role, text: m.text })).slice(-10);
  thread.push({ role: 'user', text: q });
  const pending = { role: 'assistant', pending: true, text: '', reqId: askId(), live: { steps: [], text: '', turn: -1 }, subs: new Set() };
  thread.push(pending);
  askListen();
  askLive.set(pending.reqId, pending);
  pending.wait = (async () => {
    let r;
    // A request that fails outright (rather than an answer saying why) gets the plain message.
    try { r = await call('ask:run', { question: q, history, callId, folderId, reqId: pending.reqId }); } catch { r = { ok: false }; }
    askLive.delete(pending.reqId);
    pending.pending = false;
    if (r?.ok && r.stopped) { pending.stopped = true; pending.text = r.text || pending.live.text || ''; pending.used = r.used; }
    else if (r?.ok) { pending.text = r.text || 'No answer.'; pending.used = r.used; }
    else { pending.error = true; pending.text = r?.error || 'Cue couldn’t answer that. Try again.'; }
    askPing(pending);
  })();
  return pending;
}

// Copy an answer: formatted for Slack, Gmail and Docs; clean bulleted text for WhatsApp, texts and .txt.
const askCopyBtn = (text) => h('button', { class: 'link-btn', onclick: async (e) => { e.target.textContent = (await copyRich(text)) ? 'Copied' : 'Copy failed'; setTimeout(() => { e.target.textContent = 'Copy'; }, 1200); } }, 'Copy');
// "From: call, call": the calls the answer came from, each one a link to the call.
const askUsed = (used, cls) => ((used || []).length ? h('span', { class: cls }, 'From: ', ...used.slice(0, 4).map((u, i) => [i ? ', ' : '', h('a', { href: '#', onclick: (e) => { e.preventDefault(); go({ view: 'call', id: u.id }); } }, u.title)])) : h('span'));
// Redraws at most once a frame while text streams in.
function askFrame(fn) { let raf = 0; return () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; fn(); }); }; }
// Half-written markdown (an answer still coming, or stopped): close an open **bold** or
// `code` so it doesn't show its marks for a moment.
function askPartialMd(text) {
  let t = String(text || '');
  const fences = (t.match(/^```/gm) || []).length;
  if (fences % 2) return `${t}\n\`\`\``;
  const plain = t.replace(/```[\s\S]*?```/g, '');
  if (((plain.match(/`/g) || []).length) % 2) t += '`';
  if (((plain.replace(/`[^`]*`/g, '').match(/\*\*/g) || []).length) % 2) t = `${t.replace(/\s+$/, '')}**`;
  return t;
}

// The Ask box docked at the bottom of a call or a folder (the Ask Cue page is askPage below).
function askPanel({ callId = null, folderId = null, folderName = '', compact = false } = {}) {
  const scope = callId || (folderId ? `folder:${folderId}` : 'global');
  const kind = callId ? 'call' : 'folder';
  if (!askThreads.has(scope)) askThreads.set(scope, []);
  const thread = askThreads.get(scope);
  const box = h('div', { class: `ask ${compact ? 'compact' : ''}` });
  const log = h('div', { class: 'ask-log' });
  const input = h('textarea', { class: 'ask-input', rows: 1, placeholder: callId ? 'Ask about this call' : `Ask about the calls in ${folderName || 'this folder'}`,
    onfocus: () => box.classList.add('focused'), onblur: () => setTimeout(() => box.classList.remove('focused'), 150),
    onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(input.value); } },
    oninput: () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 160)}px`; } });
  const sendBtn = h('button', { class: 'btn primary', onclick: () => send(input.value) }, 'Ask');
  let busy = false;

  // One node per message, kept while it doesn't change, so a text selection or a focused Copy
  // in an earlier answer survives the next one streaming in. The answer being written is
  // updated in place: its latest step, then its text.
  const shown = new WeakMap(); // message -> { key, el }
  function pendingEl(m) {
    const el = h('div', { class: 'ask-a' });
    const md = h('div', { class: 'md streaming' });
    let showing = null; // the step or text on screen
    el.update = () => {
      const text = m.live?.text || '';
      if (text) {
        if (showing !== `t:${text}`) { md.innerHTML = renderMd(askPartialMd(text)); showing = `t:${text}`; }
        if (el.firstChild !== md) el.replaceChildren(md);
      } else {
        const step = m.live?.steps.at(-1) || 'Reading your calls…';
        if (showing !== `s:${step}`) { el.replaceChildren(h('div', { class: 'placeholder' }, h('span', { class: 'spin' }), step)); showing = `s:${step}`; }
      }
    };
    el.update();
    return el;
  }
  const msgEl = (m) => (m.role === 'user' ? h('div', { class: 'ask-q' }, m.text)
    : m.pending ? pendingEl(m)
    : h('div', { class: 'ask-a' },
        m.error ? h('div', { class: 'form-error' }, m.text)
          : !m.text ? h('div', { class: 'placeholder' }, 'Stopped before an answer.')
          : h('div', { class: 'md', html: renderMd(m.text) }),
        !m.error && m.text ? h('div', { class: 'ask-foot' }, askUsed(m.used, 'ask-used'), askCopyBtn(m.text)) : null));
  function drawLog() {
    const atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    const els = thread.map((m) => {
      const key = m.role === 'user' ? 'q' : m.pending ? 'wait' : 'done';
      let s = shown.get(m);
      if (!s || s.key !== key) { s = { key, el: msgEl(m) }; shown.set(m, s); } else if (key === 'wait') s.el.update();
      return s.el;
    });
    for (const el of [...log.children]) if (!els.includes(el)) el.remove();
    els.forEach((el, i) => { if (log.children[i] !== el) log.insertBefore(el, log.children[i] || null); });
    if (!compact || (atEnd && thread.some((m) => m.pending))) log.scrollTop = log.scrollHeight;
  }
  const redraw = askFrame(() => { if (box.isConnected) drawLog(); });
  // Waits for an answer (showing it as it is written), then shows it, if this box is still on the page.
  async function settle(pending) {
    busy = true; sendBtn.disabled = true;
    const sub = () => { if (!box.isConnected) pending.subs.delete(sub); else redraw(); };
    pending.subs.add(sub);
    await pending.wait;
    pending.subs.delete(sub);
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
      h('span', { class: 'ask-title' }, h('span', { class: 'ask-ic', html: ICON.chat }), 'Ask Cue',
        h('span', { class: 'ask-scope' }, callId ? 'about this call' : `about ${folderName || 'this folder'}`)),
      h('span', { class: 'grow' }),
      h('button', { class: 'link-btn', onclick: () => { newChat(); input.focus(); } }, 'New chat'),
      h('button', { class: 'icon-btn ask-close', title: 'Close (Esc)', 'aria-label': 'Close chat', html: ICON.x, onclick: () => setOpen(false) })),
    log);
  const reopen = h('div', { class: 'ask-reopen-row' },
    h('button', { class: 'ask-reopen', onclick: () => setOpen(true) }, h('span', { class: 'ask-ic', html: ICON.chat }), 'Show chat'));
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
// top (with New chat and All chats), then one of three views: the empty page (the orb
// and "Ask Cue" over one big box, the recent chats under it), a conversation (the box
// docked at the bottom for follow-ups), or All chats (search, open, delete).
// ---------------------------------------------------------------------------

const askOrb = (cls = '') => h('span', { class: `askp-orb ${cls}`, 'aria-hidden': 'true' });

function askPage() {
  const chats = askChats();
  let chat = askOpenId ? chats.find((c) => c.id === askOpenId) || null : null;
  if (!chat) askOpenId = null;
  const pendingIn = (c) => c?.messages.find((m) => m.pending) || null;
  const busy = () => !!pendingIn(chat);
  const fresh = askRoute !== route; // opened just now, not drawn again in place
  askRoute = route;
  const wasTyping = !!document.activeElement?.classList?.contains('askp-input');

  // The box grows with what you type. Enter asks, Shift+Enter starts a new line. While an
  // answer is being written, the arrow is a Stop button.
  const input = h('textarea', { class: 'askp-input', rows: 1, 'aria-label': 'Ask Cue',
    onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(input.value); } },
    oninput: () => { askDraft = input.value; fit(); sync(); } });
  input.value = askDraft;
  const sendBtn = h('button', { type: 'button', class: 'askp-send', onclick: () => (busy() ? askStop(pendingIn(chat)) : ask(input.value)) });
  const row = h('div', { class: 'askp-compose-row' }, h('span', { class: 'grow' }), sendBtn);
  // A click on the card around the text still puts the cursor in it.
  const box = h('div', { class: 'askp-compose', onmousedown: (e) => { if (e.target === box || e.target === row || e.target.classList.contains('grow')) { e.preventDefault(); input.focus(); } } }, input, row);
  const fit = () => { input.style.height = 'auto'; if (input.scrollHeight) input.style.height = `${Math.min(input.scrollHeight, 220)}px`; };
  let sendMode = '';
  const sync = () => {
    const stop = busy();
    if (sendMode !== (stop ? 'stop' : 'send')) {
      sendMode = stop ? 'stop' : 'send';
      sendBtn.innerHTML = stop ? ASK_ICON.stop : ASK_ICON.send;
      sendBtn.title = stop ? 'Stop' : 'Ask (Enter)';
      sendBtn.setAttribute('aria-label', stop ? 'Stop the answer' : 'Ask');
      sendBtn.classList.toggle('stop', stop);
    }
    sendBtn.disabled = !stop && !input.value.trim();
  };

  // Along the top: New chat, the quick starts, All chats. Made once and only switched on and
  // off, so a focused one keeps its focus. A quick start always starts its own chat (one
  // still being answered carries on).
  const newBtn = h('button', { type: 'button', class: 'askp-chip', onclick: newChat }, h('span', { class: 'askp-chip-ic', html: ICON.plus }), 'New chat');
  const starters = ASK_STARTERS.map((s) => h('button', { type: 'button', class: 'askp-chip starter', title: s.q, onclick: () => { askAll = false; chat = null; askOpenId = null; ask(s.q); } },
    h('span', { class: 'askp-chip-ic', html: ASK_ICON[s.icon] }), s.label));
  const histBtn = h('button', { type: 'button', class: 'askp-chip askp-hist', title: 'All chats', 'aria-label': 'All chats', 'aria-pressed': 'false', html: ASK_ICON.history, onclick: () => showAll(!askAll) });
  const top = h('div', { class: 'askp-top' }, newBtn, starters, histBtn);

  const note = h('p', { class: 'askp-note' }, 'Cue searches the notes and transcripts and answers with where it found it. Private calls stay private.');
  const recent = h('div', { class: 'askp-recent' });
  const home = h('div', { class: 'askp-home' }, h('h1', { class: 'askp-hero' }, askOrb('lg'), 'Ask Cue'), note, recent);
  const log = h('div', { class: 'askp-thread' });
  const body = h('div', { class: 'askp-body' }, log);
  const dock = h('div', { class: 'askp-dock' });
  const title = h('h1', { class: 'askp-sr' }, 'Ask Cue'); // the conversation's heading, for screen readers
  const status = h('div', { class: 'askp-sr', role: 'status' }); // tells screen readers when an answer lands
  const search = h('input', { type: 'search', class: 'input askp-search', placeholder: 'Search chats', 'aria-label': 'Search chats', value: askFilter,
    oninput: () => { askFilter = search.value; confirming = null; drawRows(); } });
  const rows = h('div', { class: 'askp-list' });
  const all = h('div', { class: 'askp-all' }, h('div', { class: 'askp-all-head' }, h('h1', { class: 'askp-all-title' }, 'All chats'), search), rows);
  const view = h('div', { class: 'askp-view' });
  const page = h('div', { class: 'askp', onkeydown: onKey });

  function ask(q) {
    q = String(q || '').trim();
    if (!q || busy()) return;
    input.value = ''; askDraft = '';
    if (!chat) { const now = Date.now(); chat = { id: askId(), title: askTitle(q), createdAt: now, updatedAt: now, messages: [], owner: askStore.owner }; chats.unshift(chat); }
    askOpenId = chat.id;
    askAll = false;
    chat.updatedAt = Date.now();
    const asked = chat;
    const pending = askSend(asked.messages, q);
    askPersist(asked);
    // Saved into the chat it was asked in when it lands, wherever the page is by then.
    pending.wait.then(() => { asked.updatedAt = Date.now(); askPersist(asked); });
    follow = true;
    status.textContent = 'Reading your calls…';
    draw('end');
    input.focus();
    watch(asked, pending);
  }
  // An answer being written: shown as it comes while its chat is on the page, then in full.
  function watch(c, m) {
    const sub = () => { if (!page.isConnected) { m.subs.delete(sub); return; } if (chat === c && !askAll) streamed(); };
    m.subs.add(sub);
    m.wait.then(() => { m.subs.delete(sub); landed(c, m); });
  }
  // An answer (or an error) came in. In the chat on the page: show it. In another chat: only
  // the lists change (its time, its "still answering" dot); the open chat doesn't move.
  function landed(c, m) {
    if (!page.isConnected || c.deleted) return;
    if (chat === c && !askAll) {
      status.textContent = m.error ? m.text : m.stopped ? 'Stopped.' : 'Cue answered.';
      draw(follow ? 'answer' : 'none'); // scrolled up to read while it was written: stay there
    } else if (askAll) keepRow(rows, drawRows);
    else if (!chat) keepRow(recent, drawRecent);
  }
  function newChat() { chat = null; askOpenId = null; askAll = false; status.textContent = ''; draw(); input.focus(); }
  function openChat(c) {
    chat = c; askOpenId = c.id; askAll = false; status.textContent = '';
    follow = true;
    draw('end');
    input.focus();
    const m = pendingIn(c);
    if (m) status.textContent = 'Reading your calls…';
  }
  function showAll(on) {
    askAll = on; confirming = null;
    draw();
    if (on) search.focus(); else input.focus();
  }
  function removeChat(c) {
    const at = [...rows.querySelectorAll('.askp-row')].findIndex((r) => r.dataset.id === c.id);
    c.deleted = true;
    askGone.add(c.id);
    askStop(pendingIn(c));
    const i = chats.indexOf(c);
    if (i >= 0) chats.splice(i, 1);
    askPersist();
    if (chat === c) { chat = null; askOpenId = null; }
    confirming = null;
    draw();
    // The cursor goes to the row that took its place (or the one above), else the search box.
    const left = rows.querySelectorAll('.askp-row');
    (left[Math.min(Math.max(at, 0), left.length - 1)] || search).focus();
  }
  // A list drawn again in place, keeping the cursor on the row it was on.
  function keepRow(list, redraw) {
    const was = list.contains(document.activeElement) ? document.activeElement.closest('.askp-row')?.dataset.id : null;
    redraw();
    if (was) list.querySelector(`.askp-row[data-id="${CSS.escape(was)}"]`)?.focus();
  }
  function onKey(e) {
    if (e.key !== 'Escape' || e.defaultPrevented || !askAll) return;
    e.preventDefault();
    if (confirming) { const id = confirming; confirming = null; drawRows(); rows.querySelector(`.askp-row[data-id="${CSS.escape(id)}"] .askp-row-del`)?.focus(); }
    else showAll(false);
  }

  // The message being written: the steps so far (the latest one turning), then the answer as
  // it comes in. Drawn once and updated in place.
  function pendingEl(m) {
    const steps = h('div', { class: 'askp-live' });
    const text = h('div', { class: 'md askp-md streaming' });
    const wait = h('div', { class: 'askp-thinking' }, 'Reading your calls…');
    const main = h('div', { class: 'askp-main' });
    const el = h('div', { class: 'askp-msg ai' }, askOrb('busy'), main);
    let shownText = null;
    el.update = () => {
      const st = m.live.steps.slice(-4);
      const writing = !!m.live.text;
      steps.replaceChildren(...st.map((s, i) => {
        const now = i === st.length - 1 && !writing;
        return h('div', { class: now ? 'now' : '' }, now ? h('span', { class: 'spin' }) : h('span', { class: 'askp-done', html: ICON.check }), s);
      }));
      if (writing && shownText !== m.live.text) { text.innerHTML = renderMd(askPartialMd(m.live.text)); shownText = m.live.text; }
      main.replaceChildren(st.length ? steps : null, writing ? text : null, !st.length && !writing ? wait : null);
    };
    el.update();
    return el;
  }
  const msg = (m) => (m.role === 'user'
    ? h('div', { class: 'askp-msg me' }, h('div', { class: 'askp-bubble' }, m.text))
    : m.pending ? pendingEl(m)
    : h('div', { class: 'askp-msg ai' }, askOrb(),
        h('div', { class: 'askp-main' },
          m.error ? h('div', { class: 'askp-error' }, m.text)
            : !m.text ? h('div', { class: 'askp-thinking' }, 'Stopped before an answer.')
            : [h('div', { class: 'md askp-md', html: renderMd(m.stopped ? askPartialMd(m.text) : m.text) }),
              h('div', { class: 'askp-foot' }, askUsed(m.used, 'askp-used'), m.stopped ? h('span', { class: 'askp-stopped' }, 'Stopped') : null, askCopyBtn(m.text))])));
  // Messages that haven't changed keep their node, so focus or a text selection in an
  // earlier answer survives a new one landing.
  const shown = new WeakMap(); // message -> { key, el }
  function drawLog() {
    const els = chat.messages.map((m) => {
      const key = m.role === 'user' ? 'q' : m.pending ? 'wait' : m.error ? 'error' : 'answer';
      let s = shown.get(m);
      if (!s || s.key !== key) { s = { key, el: msg(m) }; shown.set(m, s); } else if (key === 'wait') s.el.update(); // steps that came while another chat was showing
      return s.el;
    });
    for (const el of [...log.children]) if (!els.includes(el)) el.remove();
    els.forEach((el, i) => { if (log.children[i] !== el) log.insertBefore(el, log.children[i] || null); });
  }
  // Puts the last question at the top, so a long answer reads from its start (a short one
  // just shows the bottom). While an answer streams in, the page follows it this way until
  // the person scrolls.
  let follow = true;
  const toAnswer = () => {
    const qs = log.querySelectorAll('.askp-msg.me');
    body.scrollTop = !qs.length ? body.scrollHeight : Math.max(0, qs[qs.length - 1].offsetTop - 16);
  };
  // Only the person's own scrolling stops it (text turning into a step can shrink the page and
  // move the scroll by itself).
  const stopFollowing = () => { follow = false; };
  body.addEventListener('wheel', stopFollowing, { passive: true });
  body.addEventListener('touchmove', stopFollowing, { passive: true });
  body.addEventListener('keydown', (e) => { if (/^(PageUp|PageDown|ArrowUp|ArrowDown|Home|End| )$/.test(e.key)) stopFollowing(); });
  const streamed = askFrame(() => {
    const m = pendingIn(chat);
    const s = m && shown.get(m);
    if (!s || s.key !== 'wait' || !page.isConnected) return;
    s.el.update();
    if (follow) toAnswer();
    sync();
  });

  // Recent chats, under the box on the empty page.
  function drawRecent() {
    const list = chats.slice(0, 4);
    recent.hidden = !list.length;
    recent.replaceChildren(...(list.length ? [
      h('div', { class: 'askp-recent-head' }, h('span', {}, 'Recent chats'), h('button', { type: 'button', class: 'askp-link', onclick: () => showAll(true) }, 'All chats')),
      ...list.map((c) => h('button', { type: 'button', class: 'askp-row', 'data-id': c.id, onclick: () => openChat(c) },
        h('span', { class: 'askp-row-title' }, c.title),
        pendingIn(c) ? askOrb('busy sm') : null,
        h('span', { class: 'askp-row-date' }, askDay(c.updatedAt)))),
    ] : []));
  }
  // All chats: newest first, the search box matching titles and what was said. Delete asks
  // once, in the row ("Delete?"), since it can't be undone.
  let confirming = null;
  function drawRows() {
    const f = askFilter.trim().toLowerCase();
    const list = chats.filter((c) => !f || c.title.toLowerCase().includes(f) || c.messages.some((m) => String(m.text || '').toLowerCase().includes(f)));
    if (!list.length) { rows.replaceChildren(h('p', { class: 'askp-empty' }, f ? 'No chats match.' : 'No chats yet. Ask something and it’s kept here.')); return; }
    rows.replaceChildren(...list.map((c) => (confirming === c.id
      ? h('div', { class: 'askp-row confirm', 'data-id': c.id, role: 'group', 'aria-label': 'Delete this chat?' },
          h('span', { class: 'askp-row-title' }, 'Delete this chat? It can’t be undone.'),
          h('button', { type: 'button', class: 'btn danger askp-yes', onclick: () => removeChat(c) }, 'Delete'),
          h('button', { type: 'button', class: 'btn askp-no', onclick: () => { confirming = null; drawRows(); rows.querySelector(`.askp-row[data-id="${CSS.escape(c.id)}"] .askp-row-del`)?.focus(); } }, 'Cancel'))
      : h('div', { class: 'askp-row', 'data-id': c.id, role: 'button', tabindex: '0', onclick: () => openChat(c),
          onkeydown: (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); openChat(c); } } },
          h('span', { class: 'askp-row-title' }, c.title),
          pendingIn(c) ? askOrb('busy sm') : null,
          h('span', { class: 'askp-row-date' }, askDay(c.updatedAt)),
          h('button', { type: 'button', class: 'askp-ib askp-row-del', title: 'Delete chat', 'aria-label': `Delete chat: ${c.title}`, html: ICON.trash,
            onclick: (e) => { e.stopPropagation(); confirming = c.id; drawRows(); rows.querySelector('.askp-row.confirm .askp-no')?.focus(); } })))));
  }

  // scroll: 'end' shows the newest message; 'answer' puts the last question at the top; 'none' leaves it.
  function draw(scroll = 'answer') {
    const mode = askAll ? 'all' : chat ? 'chat' : 'home';
    page.classList.toggle('chat', mode === 'chat');
    page.classList.toggle('all', mode === 'all');
    newBtn.hidden = mode === 'home';
    histBtn.classList.toggle('on', mode === 'all');
    histBtn.setAttribute('aria-pressed', String(mode === 'all'));
    input.placeholder = mode === 'chat' ? 'Ask a follow-up' : 'Ask anything about the team’s calls';
    box.classList.toggle('big', mode === 'home');
    const typing = document.activeElement === input;
    if (mode === 'home') {
      drawRecent();
      if (box.parentNode !== home) home.insertBefore(box, note);
      if (home.parentNode !== view) view.replaceChildren(home);
    } else if (mode === 'chat') {
      drawLog();
      // Moved only when it isn't there yet, so typing (or an IME) isn't cut off when an answer lands.
      if (box.parentNode !== dock) dock.replaceChildren(box);
      if (body.parentNode !== view) view.replaceChildren(title, body, dock);
      if (scroll !== 'none') requestAnimationFrame(() => {
        if (scroll === 'end') body.scrollTop = body.scrollHeight; else toAnswer();
      });
    } else {
      if (search.value !== askFilter) search.value = askFilter;
      drawRows();
      if (all.parentNode !== view) view.replaceChildren(all);
    }
    if (typing && mode !== 'all' && document.activeElement !== input) input.focus();
    fit(); sync();
  }

  // Back on the page while an answer is still coming: follow it again and show it when it lands.
  for (const c of chats) { const m = pendingIn(c); if (m) watch(c, m); }
  draw(chat && pendingIn(chat) ? 'end' : 'answer');
  page.replaceChildren(top, view, status);
  // A new visit puts the cursor in the box, like the inbox (not on touch screens, where it
  // would pop the keyboard up); so does drawing the page again while you were typing.
  requestAnimationFrame(() => {
    if (!page.isConnected) return;
    fit();
    if (askAll) { if (fresh) search.focus(); return; }
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
