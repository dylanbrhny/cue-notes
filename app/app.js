// Cue main window: calls (notes), the live call, presets and settings.

// Empty pieces (null/false/'') are skipped instead of being printed as text.
{
  const rc = Element.prototype.replaceChildren;
  const ap = Element.prototype.append;
  const clean = (kids) => kids.flat(Infinity).filter((k) => k != null && k !== false && k !== '');
  Element.prototype.replaceChildren = function (...kids) { return rc.apply(this, clean(kids)); };
  Element.prototype.append = function (...kids) { return ap.apply(this, clean(kids)); };
}

const call = (ch, arg) => window.cue.invoke(ch, arg);
// The browser version (cue.synapsemfg.com/app): everything except recording calls.
const WEB = !!window.cue.web;
const $view = document.getElementById('view');
const $list = document.getElementById('call-list');
const $nav = document.getElementById('nav');
const $start = document.getElementById('start-wrap');

let route = { view: 'home' };
let liveState = null;
let calls = [];
let info = {};
let presetsCache = null;
let templatesCache = null;
let authState = { configured: false, user: null };

const ICON = {
  check: '<svg viewBox="0 0 12 12" fill="none"><path d="M2.5 6.2l2.3 2.3 4.7-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  calls: '<svg viewBox="0 0 16 16" fill="none"><rect x="2.5" y="2.5" width="11" height="11" rx="2.5" stroke="currentColor" stroke-width="1.4"/><path d="M5 6h6M5 8.5h6M5 11h3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  presets: '<svg viewBox="0 0 16 16" fill="none"><path d="M4 4.5l1.2 1.2L7.5 3.4M4 9l1.2 1.2L7.5 7.9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.5 5h3M9.5 9.5h3M4 13h8.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  settings: '<svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2.2" stroke="currentColor" stroke-width="1.4"/><path d="M8 1.8v1.6M8 12.6v1.6M14.2 8h-1.6M3.4 8H1.8M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1M12.4 12.4l-1.1-1.1M4.7 4.7L3.6 3.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  chev: '<svg viewBox="0 0 12 12" fill="none"><path d="M4.5 3l3 3-3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  link: '<svg viewBox="0 0 16 16" fill="none"><path d="M6.8 9.2a2.6 2.6 0 0 0 3.7 0l2.2-2.2a2.6 2.6 0 0 0-3.7-3.7l-.9.9M9.2 6.8a2.6 2.6 0 0 0-3.7 0L3.3 9a2.6 2.6 0 0 0 3.7 3.7l.9-.9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  dots: '<svg viewBox="0 0 16 16" fill="none"><circle cx="4" cy="8" r="1.2" fill="currentColor"/><circle cx="8" cy="8" r="1.2" fill="currentColor"/><circle cx="12" cy="8" r="1.2" fill="currentColor"/></svg>',
  lock: '<svg viewBox="0 0 12 12" fill="none"><rect x="2.5" y="5.2" width="7" height="5" rx="1.2" stroke="currentColor" stroke-width="1.2"/><path d="M4 5.2V4a2 2 0 0 1 4 0v1.2" stroke="currentColor" stroke-width="1.2"/></svg>',
  team: '<svg viewBox="0 0 12 12" fill="none"><circle cx="4.3" cy="4.2" r="1.7" stroke="currentColor" stroke-width="1.1"/><circle cx="8.4" cy="4.8" r="1.4" stroke="currentColor" stroke-width="1.1"/><path d="M1.4 10c.3-1.7 1.5-2.6 2.9-2.6s2.6.9 2.9 2.6M7.4 7.6c1.5-.3 2.9.4 3.2 2.2" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>',
  notesTab: '<svg viewBox="0 0 16 16" fill="none"><rect x="3" y="2.5" width="10" height="11" rx="2" stroke="currentColor" stroke-width="1.3"/><path d="M5.5 6h5M5.5 8.5h5M5.5 11h3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  companyTab: '<svg viewBox="0 0 16 16" fill="none"><path d="M2.5 13.5h11M3.5 13.5V6.5l4-2v9M7.5 13.5V3l5 2.5v8" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M9.5 7.5h1M9.5 10h1M5 8.5h.8M5 11h.8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  personTab: '<svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5.5" r="2.5" stroke="currentColor" stroke-width="1.3"/><path d="M3 13.5c.6-2.6 2.6-4 5-4s4.4 1.4 5 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  filesTab: '<svg viewBox="0 0 16 16" fill="none"><path d="M8 2.5l5.5 2.8L8 8.1 2.5 5.3z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M2.5 8l5.5 2.8L13.5 8M2.5 10.7l5.5 2.8 5.5-2.8" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
  folder: '<svg viewBox="0 0 16 16" fill="none"><path d="M2.5 4.5a1.5 1.5 0 0 1 1.5-1.5h2.4l1.4 1.6H12a1.5 1.5 0 0 1 1.5 1.5v5.4a1.5 1.5 0 0 1-1.5 1.5H4a1.5 1.5 0 0 1-1.5-1.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
  sparkle: '<svg viewBox="0 0 16 16" fill="none"><path d="M8 2.5l1.3 3.2 3.2 1.3-3.2 1.3L8 11.5 6.7 8.3 3.5 7l3.2-1.3z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M12.5 11v3M11 12.5h3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  plus: '<svg viewBox="0 0 16 16" fill="none"><path d="M8 3.5v9M3.5 8h9" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
};

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k === 'html') el.innerHTML = v; // static SVG and sanitized markdown only
    else if (k === 'value') el.value = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Markdown from Claude: raw HTML in it is shown as text, never rendered.
const md = new marked.Marked({ gfm: true, breaks: false });
md.use({ renderer: { html: (token) => esc(token.raw ?? token.text ?? '') } });
const renderMd = (text) => md.parse(String(text || ''));

function fmtDur(ms) {
  const m = Math.max(1, Math.round((ms || 0) / 60000));
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
}
function fmtClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function dayLabel(ts) {
  const d = new Date(ts); const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}
function timeOf(ts) { return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

let menuOpen = false;
let startKey = '';
async function renderStart() {
  if (WEB) {
    if (startKey === 'web') return; startKey = 'web';
    $start.replaceChildren(h('a', { class: 'start-btn web-get', href: 'https://cue.synapsemfg.com/download', target: '_blank', rel: 'noopener' }, 'Get the desktop app to record calls'));
    return;
  }
  const isLive = liveState && liveState.mode === 'live';
  const key = JSON.stringify([isLive, menuOpen, isLive && [liveState.snapshot.done, liveState.snapshot.total]]);
  if (key === startKey) return;
  startKey = key;
  if (isLive) {
    $start.replaceChildren(h('button', { class: 'start-btn live', onclick: () => go({ view: 'live' }) }, h('span', { class: 'mark' }), 'On a call · ', liveState.snapshot.done, '/', liveState.snapshot.total));
    return;
  }
  const presets = presetsCache || (presetsCache = await call('presets:get'));
  const templates = templatesCache || (templatesCache = await call('notes:templates'));
  const btn = h('button', { class: 'start-btn', onclick: (e) => { e.stopPropagation(); menuOpen = !menuOpen; renderStart(); } },
    h('span', { html: ICON.plus, style: 'width:14px;height:14px;display:inline-grid' }), 'Start a call');
  const kids = [btn];
  if (menuOpen) {
    const item = (p) => h('button', { onclick: async () => { menuOpen = false; startKey = ''; await call('call:start', { presetId: p.id }); go({ view: 'live' }); } }, p.name);
    kids.push(h('div', { class: 'menu' },
      h('div', { class: 'menu-label' }, 'Coach me'), presets.filter((p) => p.kind !== 'notes').map(item),
      h('div', { class: 'menu-label' }, 'Just take notes'), [...presets.filter((p) => p.kind === 'notes'), ...templates].map(item)));
  }
  $start.replaceChildren(...kids);
}
document.addEventListener('click', () => { if (menuOpen) { menuOpen = false; renderStart(); } });
function presetsChanged() { presetsCache = null; startKey = ''; renderStart(); }

function renderNav() {
  const item = (view, label, icon) => h('button', {
    class: `nav-item ${route.view === view ? 'on' : ''}`,
    onclick: () => go({ view }),
  }, h('span', { html: ICON[icon], style: 'display:inline-grid' }), label);
  $nav.replaceChildren(item('home', 'Home', 'calls'), authState.user ? item('ask', 'Ask Cue', 'sparkle') : null, item('presets', 'Presets', 'presets'), item('settings', 'Settings', 'settings'));
}

async function renderList() {
  // Signed in, the Notes tab and Spaces replace the sidebar call list (like Granola).
  const signedIn = !!authState.user;
  document.getElementById('calls-label').hidden = signedIn;
  $list.hidden = signedIn;
  if (signedIn) return;
  calls = await call('calls:list');
  const liveId = liveState?.mode === 'live' ? liveState.callId : null;
  if (!calls.length) {
    $list.replaceChildren(h('div', { class: 'empty-side' }, 'Your calls show up here, with notes and how much of the checklist you covered.'));
    return;
  }
  const out = [];
  let lastDay = null;
  for (const c of calls) {
    const day = dayLabel(c.startedAt);
    if (day !== lastDay) { out.push(h('div', { class: 'group' }, day)); lastDay = day; }
    const isLive = c.id === liveId;
    const on = (route.view === 'call' && route.id === c.id) || (route.view === 'live' && isLive);
    const teammateLive = !isLive && c.status === 'live' && c.mine === false;
    const target = isLive ? { view: 'live' } : teammateLive ? { view: 'monitor', id: c.id } : { view: 'call', id: c.id };
    const bits = [];
    if (c.mine === false && c.owner) bits.push(c.owner);
    bits.push(timeOf(c.startedAt));
    if (c.status !== 'live' && c.durationMs > 0) bits.push(fmtDur(c.durationMs));
    if (c.total) bits.push(`${c.done}/${c.total}`);
    if (c.status === 'writing') bits.push('writing…');
    const rowEl = h('button', { class: `call-row ${on || (route.view === 'monitor' && route.id === c.id) ? 'on' : ''}`, onclick: () => go(target) },
      h('div', { class: 't' }, isLive || teammateLive ? h('span', { class: 'live-dot' }) : null, c.visibility === 'private' ? h('span', { class: 'lock inline', html: ICON.lock }) : null, c.title || 'Untitled call'),
      h('div', { class: 'm' }, isLive ? 'Live now' : teammateLive ? `${c.owner || 'Teammate'} · live now` : bits.join(' · ')),
    );
    if (authState.user && !isLive && typeof makeDraggable === 'function') makeDraggable(rowEl, 'call', c.id);
    out.push(rowEl);
  }
  $list.replaceChildren(...out);
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

function go(r) {
  if (route.view === 'monitor' && (r.view !== 'monitor' || r.id !== route.id)) stopMonitor();
  if (r.view !== route.view || r.id !== route.id) document.getElementById('main').scrollTop = 0;
  route = r;
  renderNav();
  renderList();
  renderView();
  if (authState.user) renderFolders();
}

// Signed in, but this computer isn't approved (yet): nothing else opens.
const deviceBlocked = () => !!(authState.user && (!authState.device || authState.device.status !== 'approved'));
function renderWaiting() {
  const d = authState.device;
  const revoked = d?.status === 'revoked';
  const out = h('div', { class: 'saved', style: 'min-height:1.4em' });
  $view.replaceChildren(h('div', { class: 'waiting' },
    h('img', { class: 'signin-logo', src: 'assets/logo.svg', alt: '' }),
    h('h1', { class: 'page' }, revoked ? 'This computer was removed' : d ? 'Waiting for approval' : 'Checking this computer…'),
    h('p', { class: 'sub' }, revoked
      ? 'An admin removed this computer from Cue. Ask Dylan to approve it again in Settings → Devices.'
      : d ? `For safety, each computer has to be approved once. Dylan can approve “${d.name}” in Cue → Settings → Devices. This page opens by itself as soon as he does.`
        : 'One moment while Cue checks this computer is allowed.'),
    d && !revoked ? h('div', { class: 'row', style: 'gap:10px;justify-content:center' }, h('span', { class: 'spin' }), h('span', { class: 'saved' }, 'Waiting…')) : null,
    h('div', { class: 'row', style: 'gap:10px;justify-content:center;margin-top:18px' },
      h('button', { class: 'btn primary', onclick: async () => { out.textContent = 'Checking…'; await call('computer:check'); authState = await call('auth:state'); out.textContent = ''; renderNav(); renderFolders(); renderView(); } }, 'Check again'),
      h('button', { class: 'btn', onclick: async () => { await call('auth:signOut'); authState = await call('auth:state'); renderAccount(); renderFolders(); go({ view: 'home' }); } }, 'Sign out')),
    out));
}

async function renderView() {
  const v = route.view;
  if (deviceBlocked() && v !== 'signin') return renderWaiting();
  if ($view.dataset.view !== v || $view.dataset.id !== String(route.id || '')) { $view.classList.remove('enter'); void $view.offsetWidth; $view.classList.add('enter'); }
  $view.dataset.view = v;
  $view.dataset.id = String(route.id || '');
  if (v === 'live') { liveState = await call('call:state'); renderList(); return renderLive(true); }
  if (v === 'call') return renderCall(route.id);
  if (v === 'monitor') return renderMonitor(route.id);
  if (v === 'folder') return renderFolder(route.id);
  if (v === 'space') return renderSpace(route.id);
  if (v === 'companies') return renderCompanies();
  if (v === 'company') return renderCompany(route.id);
  if (v === 'people') return renderPeople();
  if (v === 'person') return renderPerson(route.id);
  if (v === 'files') return renderFiles();
  if (v === 'signin') return renderSignIn();
  if (v === 'presets') return renderPresets();
  if (v === 'settings') return renderSettings();
  if (v === 'ask') return renderAsk();
  return renderHome();
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

async function renderHome() {
  if (authState.configured && !authState.user && !sessionStorage.getItem('cue-offline')) return renderSignIn();
  if (authState.user) return renderNotesTab();
  const s = await call('settings:get');
  const needsKeys = !s.anthropicKey || !s.elevenlabsKey;
  const kids = [];
  if (needsKeys) {
    kids.push(h('div', { class: 'banner warn' }, h('span', { class: 'grow' }, 'Add your ElevenLabs and Anthropic keys so Cue can hear the call and tick things off.'),
      h('button', { class: 'btn', onclick: () => go({ view: 'settings' }) }, 'Open settings')));
  }
  if (calls.length) {
    const latest = calls[0];
    kids.push(h('h1', { class: 'page' }, 'Calls'), h('p', { class: 'sub' }, `${calls.length} call${calls.length === 1 ? '' : 's'} so far. Pick one on the left to see its notes.`));
    const finished = calls.filter((c) => c.status === 'done' && c.total);
    if (finished.length) {
      const avg = Math.round(100 * finished.reduce((a, c) => a + c.done / c.total, 0) / finished.length);
      kids.push(h('div', { class: 'coverage' }, h('span', { class: 'num' }, `${avg}%`), h('span', { class: 'txt' }, `average checklist coverage across ${finished.length} finished call${finished.length === 1 ? '' : 's'}`)));
    }
    kids.push(h('div', { class: 'section' }, h('button', { class: 'btn', onclick: () => go({ view: 'call', id: latest.id }) }, 'Open latest call')));
  } else {
    kids.push(h('div', { class: 'empty' },
      h('h1', {}, 'Cue runs quietly during your calls'),
      h('p', {}, info.detectSupported
        ? 'When a Meet, Teams or Cal Video call starts, a small card appears in the corner with your checklist. It ticks items off as you say them and shows your answer when a prospect raises an objection.'
        : 'Start a call from the button on the left. A small card appears in the corner with your checklist, ticks items off as you say them, and shows your answer when a prospect raises an objection.'),
      h('div', { class: 'row', style: 'justify-content:center' },
        h('button', { class: 'btn', onclick: () => go({ view: 'presets' }) }, 'Edit presets'),
        h('button', { class: 'btn primary', onclick: async () => { await call('call:start', {}); go({ view: 'live' }); } }, 'Start a call'))));
  }
  $view.replaceChildren(...kids);
}

// ---------------------------------------------------------------------------
// Live call
// ---------------------------------------------------------------------------

let liveNotesEl = null;
let liveBuilt = false;
const pushNotes = debounce((t) => call('call:notes', t), 300);

function renderLive(full) {
  if (!liveState || liveState.mode !== 'live') {
    liveBuilt = false;
    if (liveState?.mode === 'writing') {
      $view.replaceChildren(h('div', { class: 'placeholder' }, h('span', { class: 'spin' }), 'Writing your call notes…'));
      return;
    }
    if (route.view === 'live') return go(liveState?.callId ? { view: 'call', id: liveState.callId } : { view: 'home' });
    return;
  }
  const s = liveState.snapshot;
  // Another view may have replaced the live page since it was built.
  if (!document.getElementById('live-lines')) liveBuilt = false;
  if (full || !liveBuilt) {
    liveNotesEl = h('textarea', { class: 'notes', placeholder: 'Type notes as you go. Cue blends them into the summary after the call.', value: liveState.myNotes || '', oninput: (e) => pushNotes(e.target.value) });
    $view.replaceChildren(
      h('div', { class: 'meta' }, h('span', { class: 'chip live' }, 'Live'), h('span', { id: 'live-clock' }, fmtClock(Date.now() - s.startedAt)), liveState.app ? h('span', {}, liveState.app) : null, h('span', { class: 'chip' }, s.presetName)),
      h('div', { class: 'row', style: 'margin-bottom:18px' }, h('h1', { class: 'page', style: 'flex:1;margin:0' }, 'Call in progress'), h('button', { class: 'btn', onclick: () => call('call:stop') }, 'End call and write notes')),
      h('div', { id: 'live-warn' }),
      h('div', { id: 'live-coverage' }),
      h('div', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', {}, 'Your notes')), liveNotesEl),
      h('div', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', {}, 'Live notes'), h('span', { class: 'saved', id: 'live-people' })),
        h('div', { class: 'md live-notes', id: 'live-ai-notes' }, h('div', { class: 'placeholder' }, 'Cue writes these as the call goes, every couple of minutes.'))),
      h('div', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', {}, 'Checklist')), h('ul', { class: 'checks', id: 'live-checks' })),
      h('div', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', {}, 'Live transcript')), h('div', { class: 'lines', id: 'live-lines' })),
    );
    liveBuilt = true;
    call('call:liveNotes').then((n) => { if (n) { if (n.text) document.getElementById('live-ai-notes')?.replaceChildren(h('div', { html: renderMd(n.text) })); if (n.people?.length) { const p = document.getElementById('live-people'); if (p) p.textContent = `With ${n.people.join(', ')}`; } } });
    // Catch up on everything said before this view opened.
    call('call:transcript').then((all) => {
      const lines = document.getElementById('live-lines');
      if (!lines) return;
      for (const seg of all || []) {
        const key = `${seg.at}-${seg.speaker}`;
        if (!lines.querySelector(`[data-k="${key}"]`)) lines.append(lineRow(seg, key));
      }
      const sorted = [...lines.querySelectorAll('[data-k]')].sort((a, b) => parseInt(a.dataset.k, 10) - parseInt(b.dataset.k, 10));
      lines.replaceChildren(...sorted);
    });
  }
  const warn = document.getElementById('live-warn');
  const w = liveState.warning || liveState.setupWarning;
  warn.replaceChildren(w ? h('div', { class: 'banner warn' }, w) : '');
  const checksKey = JSON.stringify(s.items.map((i) => [i.id, i.done]));
  const checksEl = document.getElementById('live-checks');
  if (checksEl.dataset.key !== checksKey) {
    checksEl.dataset.key = checksKey;
    document.getElementById('live-coverage').replaceChildren(coverage(s.done, s.total));
    checksEl.replaceChildren(...s.items.map((i) => checkRow(i, true)));
  }
  const lines = document.getElementById('live-lines');
  const atBottom = $view.parentElement.scrollHeight - $view.parentElement.scrollTop - $view.parentElement.clientHeight < 80;
  const segs = liveState.snapshot.lastSegments;
  // Build the full transcript incrementally from the snapshot tail.
  for (const seg of segs) {
    const key = `${seg.at}-${seg.speaker}`;
    if (!lines.querySelector(`[data-k="${key}"]`)) lines.append(lineRow(seg, key));
  }
  lines.querySelectorAll('.partial').forEach((n) => n.remove());
  for (const side of ['them', 'me']) {
    if (s.partials[side]) lines.append(lineRow({ speaker: side, text: s.partials[side] }, null, true));
  }
  if (atBottom) $view.parentElement.scrollTop = $view.parentElement.scrollHeight;
}

function coverage(done, total) {
  return h('div', { class: 'coverage' },
    h('span', { class: 'num' }, `${done}/${total}`),
    h('span', { class: 'txt' }, done === total ? 'Every beat covered' : `beats covered · ${total - done} to go`),
    h('span', { class: 'segs' }, Array.from({ length: total }, (_, i) => h('i', { class: i < done ? 'on' : '' }))));
}

function checkRow(i, isLive) {
  return h('li', { class: `${i.done ? 'done' : ''} ${isLive ? 'live' : ''}`, onclick: isLive ? () => call('call:toggle', i.id) : null, title: isLive ? 'Click to tick by hand' : null },
    h('span', { class: 'box', html: i.done ? ICON.check : '' }),
    h('span', {}, h('span', { class: 'label' }, i.label), i.done && i.evidence ? h('span', { class: 'ev' }, `“${i.evidence}”`) : null));
}

function lineRow(seg, key, partial = false, names = { me: 'You', them: 'Them' }) {
  const who = seg.speaker === 'me' ? names.me : seg.speaker === 'them' ? names.them : (seg.speaker || '');
  return h('div', { class: `line ${seg.speaker === 'me' ? 'me' : 'them'} ${partial ? 'partial' : ''}`, 'data-k': key },
    h('span', { class: 'who', title: who }, who), h('span', {}, seg.text));
}

setInterval(() => {
  const el = document.getElementById('live-clock');
  if (el && liveState?.mode === 'live') el.textContent = fmtClock(Date.now() - liveState.snapshot.startedAt);
}, 1000);

// ---------------------------------------------------------------------------
// A finished call
// ---------------------------------------------------------------------------

async function renderCall(id) {
  const c = await call('calls:get', id);
  if (!c) return go({ view: 'home' });
  if (c.status === 'live' && liveState?.mode === 'live' && liveState.callId === id) return go({ view: 'live' });

  const saveTitle = debounce((v) => call('calls:update', { id, patch: { title: v } }).then(renderList), 400);
  const coaching = c.mode !== 'notes' && (c.total || (c.checklist || []).length);
  const [shareBtn, shareBox] = shareButton(c) || [null, null];
  const names = c.mine === false && c.owner ? { me: c.owner.split(' ')[0], them: 'Them' } : { me: 'You', them: 'Them' };

  // Everything that isn't the notes lives in one quiet "…" menu.
  const rewrite = async () => { body.replaceChildren(h('div', { class: 'placeholder' }, h('span', { class: 'spin' }), 'Writing notes…')); await call('calls:rewrite', id); renderCall(id); };
  const attach = async () => { const r = await call('files:attach', c.id); if (!r.ok) alert(r.error); loadFiles(); };
  let menuOpenHere = false;
  const menuWrap = h('span', { class: 'more-wrap' });
  const drawMenu = () => menuWrap.replaceChildren(
    h('button', { class: 'icon-btn', title: 'More', onclick: (e) => { e.stopPropagation(); menuOpenHere = !menuOpenHere; drawMenu(); } }, h('span', { html: ICON.dots, style: 'display:inline-grid;width:16px;height:16px' })),
    menuOpenHere ? h('div', { class: 'pop menu-pop right' },
      menuItem(c.aiNotes ? 'Rewrite notes' : 'Write notes with AI', rewrite),
      authState.user ? menuItem('Attach files', attach) : null,
      menuItem('Delete call', async () => { if (!confirm('Delete this call and its notes? This cannot be undone.')) return; await call('calls:delete', id); go({ view: 'home' }); }, true)) : null);
  drawMenu();
  document.addEventListener('click', () => { if (menuOpenHere) { menuOpenHere = false; drawMenu(); } }, { once: true });

  // Who was on it, in one quiet line.
  const others = (c.attendees || []).filter((a) => !/@synapsemfg\.com$/i.test(a.email || '')).map((a) => a.name || (a.email || '').split('@')[0]).filter(Boolean);
  let showBeats = false;
  const beatsBox = h('div');
  const drawBeats = () => beatsBox.replaceChildren(...(showBeats ? [h('div', { class: 'beats' },
    h('ul', { class: 'checks' }, (c.checklist || []).map((i) => checkRow(i, false))),
    (c.objections || []).length ? h('div', { class: 'beats-obj' }, c.objections.map((o) => h('div', {}, h('b', {}, o.title), o.quote ? ` “${o.quote}”` : ''))) : null)] : []));
  const metaBits = [
    `${new Date(c.startedAt).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}, ${timeOf(c.startedAt)}`,
    c.durationMs > 0 ? fmtDur(c.durationMs) : null,
    c.mine === false && c.owner ? c.owner.split(' ')[0] : null,
    others.length ? others.slice(0, 3).join(', ') + (others.length > 3 ? ` +${others.length - 3}` : '') : null,
  ].filter(Boolean);
  // Talk time: you vs each person on the other side (when the call was split by speaker).
  const talk = c.talk || {};
  const talkTotal = (talk.you || 0) + (talk.speakers?.length ? talk.speakers.reduce((n, x) => n + x.ms, 0) : (talk.them || 0));
  const talkLine = talkTotal > 20_000 ? [['You', talk.you || 0], ...(talk.speakers?.length ? talk.speakers.map((x) => [x.name.split(' ')[0], x.ms]) : [['Them', talk.them || 0]])]
    .map(([n, ms]) => `${n} ${Math.round((ms / talkTotal) * 100)}%`).join(' · ') : null;

  // Files only show when there are some; drop a file anywhere on the page.
  const filesRow = h('div', { class: 'files-inline' });
  const loadFiles = async () => {
    if (!authState.user) return;
    const files = await call('files:list', c.id);
    filesRow.replaceChildren(...(files.length ? fileRows(files, { showCall: false, onChange: loadFiles }) : []));
  };
  loadFiles();

  const body = h('div', { class: 'call-body' }, c.status === 'writing'
    ? h('div', { class: 'placeholder' }, h('span', { class: 'spin' }), 'Writing notes…')
    : notepad(c, { transcript: h('div', { class: 'lines' }, (c.transcript || []).map((s) => lineRow(s, null, false, names))) }));

  const page = h('div', { class: 'call-page' },
    h('div', { class: 'call-top' },
      h('span', { class: 'grow' }),
      folderPicker(c),
      privacyToggle(c),
      shareBtn,
      menuWrap),
    shareBox,
    h('input', { class: 'title-input', value: c.title || '', placeholder: 'Untitled call', oninput: (e) => saveTitle(e.target.value) }),
    h('div', { class: 'call-meta' },
      h('span', {}, metaBits.join(' · ')),
      talkLine ? h('span', { class: 'meta-talk', title: 'Share of talking time' }, talkLine) : null,
      coaching ? h('button', { class: 'meta-link', onclick: () => { showBeats = !showBeats; drawBeats(); } }, `${c.done}/${c.total} beats${c.dreamScore != null ? ` · outcome ${c.dreamScore}%` : ''}`) : null,
      c.status === 'interrupted' || c.status === 'live' ? h('span', { class: 'meta-warn' }, 'Interrupted') : null),
    beatsBox,
    body,
    filesRow,
    authState.user && c.status !== 'live' && c.status !== 'writing' ? h('div', { class: 'ask-dock' }, askPanel({ callId: c.id, compact: true, dock: true })) : null);
  page.addEventListener('dragover', (e) => { if (authState.user && e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); page.classList.add('drop'); } });
  page.addEventListener('dragleave', (e) => { if (e.target === page) page.classList.remove('drop'); });
  page.addEventListener('drop', async (e) => {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault(); page.classList.remove('drop');
    const paths = [...e.dataTransfer.files].map((f) => window.cue.pathForFile(f)).filter(Boolean);
    const r = await call('files:drop', { meetingId: c.id, paths });
    if (!r.ok) alert(r.error); loadFiles();
  });
  $view.replaceChildren(page);
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

let presetEditing = null;

async function renderPresets() {
  const presets = presetsCache = await call('presets:get');
  const settings = await call('settings:get');
  if (presetEditing !== '__ai' && (!presetEditing || !presets.some((p) => p.id === presetEditing))) presetEditing = presets[0]?.id;
  const p = presets.find((x) => x.id === presetEditing);
  const savedLabel = h('span', { class: 'saved' });

  const persist = debounce(async () => {
    await call('presets:save', presets);
    presetsChanged();
    savedLabel.textContent = 'Saved';
    setTimeout(() => { savedLabel.textContent = ''; }, 1500);
  }, 450);
  const touch = () => { savedLabel.textContent = 'Saving…'; persist(); };

  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'item';
  const uniqueId = (base, list) => { let id = slug(base); let n = 2; while (list.some((x) => x.id === id)) id = `${slug(base)}-${n++}`; return id; };
  const csv = (arr) => (arr || []).join(', ');
  const fromCsv = (s) => String(s).split(',').map((x) => x.trim()).filter(Boolean);

  const tabs = h('div', { class: 'preset-tabs' },
    presets.map((x) => h('button', { class: `preset-tab ${x.id === presetEditing ? 'on' : ''}`, onclick: () => { presetEditing = x.id; renderPresets(); } },
      x.name, h('small', {}, x.kind === 'notes'
        ? `notes template · ${(x.sections || []).length} sections${settings.defaultPresetId === x.id ? ' · default' : ''}`
        : `${x.checklist.length} beat${x.checklist.length === 1 ? '' : 's'} · ${(x.objections || []).length} objection${(x.objections || []).length === 1 ? '' : 's'}${settings.defaultPresetId === x.id ? ' · default' : ''}`))),
    h('button', { class: `preset-tab ai-tab ${presetEditing === '__ai' ? 'on' : ''}`, onclick: () => { presetEditing = '__ai'; renderPresets(); } },
      h('span', { html: ICON.sparkle, style: 'display:inline-grid;width:14px;height:14px;vertical-align:-2px;margin-right:6px' }), 'Generate with AI'),
    h('button', { class: 'preset-tab', onclick: async () => {
      const np = { id: uniqueId('new-preset', presets), name: 'New preset', description: '', checklist: [], objections: [] };
      presets.push(np); presetEditing = np.id; await call('presets:save', presets); renderPresets();
    } }, '+ New preset'));

  // Turn whatever the AI returns into a preset with ids.
  const fromAi = (g, kind, keepId) => {
    const base = { id: keepId || uniqueId(g.name || 'ai-preset', presets), name: g.name || 'New preset', description: g.description || '' };
    if (kind === 'notes') return { ...base, kind: 'notes', sections: g.sections || [], checklist: [], objections: [] };
    const items = [];
    for (const it of g.checklist || []) items.push({ id: uniqueId(it.label, items), label: it.label, counts: it.counts, phrases: it.phrases || [] });
    const objs = [];
    for (const o of g.objections || []) objs.push({ id: uniqueId(o.title, objs), title: o.title, trigger: o.trigger, phrases: o.phrases || [], caveat: o.caveat || '', response: o.response || [], links: [] });
    return { ...base, checklist: items, objections: objs };
  };

  if (presetEditing === '__ai') {
    const kind = h('select', { class: 'input', style: 'width:auto' }, h('option', { value: 'coach' }, 'Coaching preset (checklist + objections)'), h('option', { value: 'notes' }, 'Note-taking template'));
    const desc = h('textarea', { rows: 3, placeholder: 'e.g. Closing call for a manufacturer owner who already took a discovery call. Sell held meetings vs hiring an SDR, get the decision on the call.' });
    const script = h('textarea', { rows: 5, placeholder: 'Optional: paste a script, call notes, or a playbook section to build it from.' });
    const learn = h('input', { type: 'checkbox', checked: true });
    const err = h('div', { class: 'form-error' });
    const go1 = h('button', { class: 'btn primary', onclick: async () => {
      err.textContent = '';
      if (!desc.value.trim() && !script.value.trim()) { err.textContent = 'Describe the call, or paste a script to build from.'; return; }
      go1.disabled = true; go1.textContent = 'Writing… (about 30 seconds)';
      const r = await call('presets:generate', { kind: kind.value, description: desc.value, script: script.value, fromCalls: learn.checked && kind.value === 'coach' });
      go1.disabled = false; go1.textContent = 'Generate';
      if (!r.ok) { err.textContent = r.error; return; }
      const np = fromAi(r.preset, kind.value);
      presets.push(np); presetEditing = np.id;
      await call('presets:save', presets); presetsChanged(); renderPresets();
    } }, 'Generate');
    $view.replaceChildren(
      h('h1', { class: 'page' }, 'Presets'),
      h('p', { class: 'sub' }, 'Describe a kind of call and Claude writes the preset using our profile, the closing playbook and, if you like, what actually came up on our recent calls.'),
      h('div', { class: 'presets-layout' }, tabs, h('div', {}, h('div', { class: 'panel' },
        field('Make a', kind),
        field('What kind of call is it?', desc),
        field('Build it from (optional)', script),
        h('label', { class: 'toggle' }, learn, h('span', { class: 'tx' }, h('b', {}, 'Learn from our recent calls'), h('span', {}, 'Reads the notes of our latest prospect calls so the objections match what people really say.'))),
        err,
        h('div', { class: 'row', style: 'margin:8px 0 14px' }, go1)))));
    return;
  }

  if (!p) { $view.replaceChildren(h('h1', { class: 'page' }, 'Presets'), tabs); return; }

  // Improve the open preset with AI.
  const improveInput = h('input', { type: 'text', class: 'input', placeholder: 'e.g. add an objection for "we tried an agency before", make the beats shorter' });
  const improveErr = h('div', { class: 'form-error' });
  const improveBtn = h('button', { class: 'btn', onclick: async () => {
    improveErr.textContent = '';
    improveBtn.disabled = true; improveBtn.textContent = 'Rewriting…';
    const kind = p.kind === 'notes' ? 'notes' : 'coach';
    const existing = kind === 'notes' ? { name: p.name, description: p.description, sections: p.sections } : { name: p.name, description: p.description, checklist: p.checklist.map(({ label, counts, phrases }) => ({ label, counts, phrases })), objections: (p.objections || []).map(({ title, trigger, phrases, caveat, response }) => ({ title, trigger, phrases, caveat, response })) };
    const r = await call('presets:generate', { kind, existing, instructions: improveInput.value || 'Tighten it up and make it work better on a live call.', fromCalls: false });
    improveBtn.disabled = false; improveBtn.textContent = 'Improve with AI';
    if (!r.ok) { improveErr.textContent = r.error; return; }
    const links = new Map((p.objections || []).map((o) => [o.title, o.links || []]));
    const np = fromAi(r.preset, kind, p.id);
    for (const o of np.objections) o.links = links.get(o.title) || [];
    presets[presets.indexOf(p)] = np;
    await call('presets:save', presets); presetsChanged(); renderPresets();
  } }, 'Improve with AI');
  const improveRow = h('div', { class: 'improve' }, h('span', { html: ICON.sparkle, style: 'display:inline-grid;width:15px;height:15px;color:var(--green)' }), improveInput, improveBtn);

  const move = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; touch(); renderPresets(); };

  const itemBlocks = p.checklist.map((it, i) => h('div', { class: 'editor-block' },
    h('div', { class: 'bar' }, h('span', { class: 'n' }, `Beat ${i + 1}`),
      h('button', { class: 'link-btn', title: 'Move up', onclick: () => move(p.checklist, i, -1) }, '↑'),
      h('button', { class: 'link-btn', title: 'Move down', onclick: () => move(p.checklist, i, 1) }, '↓'),
      h('button', { class: 'link-btn danger', onclick: () => { p.checklist.splice(i, 1); touch(); renderPresets(); } }, 'Remove')),
    field('What he should do', h('input', { type: 'text', value: it.label, oninput: (e) => { it.label = e.target.value; touch(); } }), 'Shown on the cue card. Keep it short.'),
    field('Counts as done when', h('textarea', { rows: 2, value: it.counts || '', oninput: (e) => { it.counts = e.target.value; touch(); } }), 'Plain words. The AI uses this to recognize it even when he says it differently.'),
    field('Key phrases', h('input', { type: 'text', value: csv(it.phrases), oninput: (e) => { it.phrases = fromCsv(e.target.value); touch(); } }), 'Comma separated. If he says any of these, it ticks instantly.'),
  ));

  const objBlocks = (p.objections || []).map((o, i) => h('div', { class: 'editor-block' },
    h('div', { class: 'bar' }, h('span', { class: 'n' }, `Objection ${i + 1}`),
      h('button', { class: 'link-btn danger', onclick: () => { p.objections.splice(i, 1); touch(); renderPresets(); } }, 'Remove')),
    field('Objection', h('input', { type: 'text', value: o.title, oninput: (e) => { o.title = e.target.value; touch(); } }), 'The card title, e.g. "Do you have experience in X?"'),
    field('Shows up when', h('textarea', { rows: 2, value: o.trigger || '', oninput: (e) => { o.trigger = e.target.value; touch(); } }), 'Describe what the prospect says, in plain words.'),
    field('Trigger phrases', h('input', { type: 'text', value: csv(o.phrases), oninput: (e) => { o.phrases = fromCsv(e.target.value); touch(); } }), 'Comma separated. If the prospect says any of these, the card shows instantly.'),
    field('Note on the card', h('input', { type: 'text', value: o.caveat || '', oninput: (e) => { o.caveat = e.target.value; touch(); } }), 'Optional, e.g. "Only say no if it is true."'),
    field('What to say', h('textarea', { rows: 6, value: (o.response || []).join('\n'), oninput: (e) => { o.response = e.target.value.split('\n').map((x) => x.trim()).filter(Boolean); touch(); } }), 'One line per point. Short lines read better mid-call.'),
    field('Links', h('textarea', { rows: 2, value: (o.links || []).map((l) => `${l.label} | ${l.url}`).join('\n'), oninput: (e) => {
      o.links = e.target.value.split('\n').map((line) => { const [label, url] = line.split('|').map((x) => (x || '').trim()); return url ? { label: label || 'Open', url } : null; }).filter(Boolean); touch();
    } }), 'Optional. One per line as "Label | https://…", e.g. call recordings to show.'),
  ));

  $view.replaceChildren(
    h('div', { class: 'row', style: 'margin-bottom:4px' }, h('h1', { class: 'page', style: 'flex:1;margin:0' }, 'Presets'), savedLabel),
    h('p', { class: 'sub' }, 'Coaching presets are a checklist of beats plus the objections to watch for. Note templates set the sections for note-only meetings. Pick one when a call starts.'),
    h('div', { class: 'presets-layout' }, tabs, h('div', {},
      h('div', { class: 'panel' },
        field('Name', h('input', { type: 'text', value: p.name, oninput: (e) => { p.name = e.target.value; touch(); } })),
        field('What this call is for', h('textarea', { rows: 2, value: p.description || '', oninput: (e) => { p.description = e.target.value; touch(); } }), 'Helps the AI write better notes.'),
        h('div', { class: 'row', style: 'margin-bottom:12px' },
          settings.defaultPresetId === p.id ? h('span', { class: 'chip' }, 'Default for detected calls')
            : h('button', { class: 'btn', onclick: async () => { await call('settings:save', { defaultPresetId: p.id }); renderPresets(); } }, 'Make default'),
          h('button', { class: 'btn', onclick: async () => {
            const copy = JSON.parse(JSON.stringify(p)); copy.id = uniqueId(`${p.id}-copy`, presets); copy.name = `${p.name} (copy)`;
            presets.push(copy); presetEditing = copy.id; await call('presets:save', presets); renderPresets();
          } }, 'Duplicate'),
          presets.length > 1 ? h('button', { class: 'btn danger', onclick: async () => {
            if (!confirm(`Delete the preset "${p.name}"?`)) return;
            presets.splice(presets.indexOf(p), 1); await call('presets:save', presets); presetEditing = null; renderPresets();
          } }, 'Delete') : null)),
      improveRow, improveErr,
      p.kind === 'notes' ? h('div', {},
        h('div', { class: 'section-head' }, h('h2', {}, 'Note sections')),
        h('div', { class: 'panel' }, field('Sections, one per line', h('textarea', { rows: 7, value: (p.sections || []).join('\n'), oninput: (e) => { p.sections = e.target.value.split('\n').map((x) => x.trim()).filter(Boolean); touch(); } }), 'The notes after the meeting use these as headings, in this order.'))) : null,
      p.kind === 'notes' ? null : h('div', { class: 'section-head' }, h('h2', {}, 'Checklist')),
      p.kind === 'notes' ? null : itemBlocks,
      p.kind === 'notes' ? null : h('button', { class: 'btn', style: 'margin:2px 0 24px', onclick: () => { p.checklist.push({ id: uniqueId('beat', p.checklist), label: '', counts: '', phrases: [] }); touch(); renderPresets(); } }, '+ Add a beat'),
      p.kind === 'notes' ? null : h('div', { class: 'section-head' }, h('h2', {}, 'Objections')),
      p.kind === 'notes' ? null : objBlocks,
      p.kind === 'notes' ? null : h('button', { class: 'btn', style: 'margin:2px 0 24px', onclick: () => { p.objections = p.objections || []; p.objections.push({ id: uniqueId('objection', p.objections), title: '', trigger: '', phrases: [], caveat: '', response: [], links: [] }); touch(); renderPresets(); } }, '+ Add an objection'),
      h('div', { class: 'row' }, h('button', { class: 'link-btn danger', onclick: async () => {
        if (!confirm('Replace all presets with the starter set? Your edits will be lost.')) return;
        await call('presets:reset'); presetEditing = null; renderPresets();
      } }, 'Reset to starter presets')),
    )),
  );
}

function field(label, control, hint) {
  return h('div', { class: 'field' }, h('label', {}, label), control, hint ? h('div', { class: 'hint' }, hint) : null);
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

async function renderSettings() {
  const s = await call('settings:get');
  const presets = await call('presets:get');
  const save = (patch) => call('settings:save', patch);
  const out = h('div', { class: 'test-out' });

  const keyInput = (k, placeholder) => h('input', { type: 'password', value: s[k], placeholder, autocomplete: 'off', spellcheck: 'false',
    onfocus: (e) => { if (e.target.value.startsWith('••••')) e.target.value = ''; },
    onchange: (e) => { const v = e.target.value.trim(); if (v) save({ [k]: v }); } });

  const toggle = (k, title, desc, disabled) => h('label', { class: 'toggle' },
    h('input', { type: 'checkbox', checked: !!s[k], disabled, onchange: (e) => save({ [k]: e.target.checked }) }),
    h('span', { class: 'tx' }, h('b', {}, title), h('span', {}, desc)));

  const micSelect = h('select', { onchange: (e) => save({ micDeviceId: e.target.value }) }, h('option', { value: '' }, 'System default'));
  const callSelect = h('select', { onchange: (e) => save({ callAudioDeviceId: e.target.value }) }, h('option', { value: '' }, 'This computer\'s sound (automatic)'));
  call('devices:list').then((list) => {
    for (const d of list || []) {
      micSelect.append(h('option', { value: d.id, selected: d.id === s.micDeviceId }, d.label));
      callSelect.append(h('option', { value: d.id, selected: d.id === s.callAudioDeviceId }, d.label));
    }
  });
  const mod = info.platform === 'darwin' ? 'Cmd' : 'Ctrl';

  const team = await teamSettingsPanels(s);
  $view.replaceChildren(
    h('h1', { class: 'page' }, 'Settings'),
    h('p', { class: 'sub' }, WEB ? 'Cue on the web: everything except recording calls. Recording, the call widget and audio live in the desktop app.' : 'Keys are stored encrypted on this computer and only sent to ElevenLabs and Anthropic.'),
    h('div', { class: 'panel' }, h('h3', {}, 'Appearance'),
      h('div', { class: 'theme-pick' }, [
        ['synapse', 'Synapse', '#070b16', ['#4a9eff', '#34d399']],
        ['dark', 'Dark', '#1c1b19', ['#ecebe6', '#7cc196']],
        ['light', 'Light', '#fbfaf7', ['#22211e', '#3c7a52']],
      ].map(([id, label, bg, dots]) => h('button', { class: (s.theme || 'synapse') === id ? 'on' : '', onclick: async () => { applyTheme(id); await save({ theme: id }); renderSettings(); } },
        h('span', { class: 'sw', style: `background:${bg}` }, h('i', { style: `width:38%;background:${dots[0]}` }), h('i', { style: `width:18%;background:${dots[1]}` })),
        label)))),
    ...team,
    await keysPanel(s, keyInput, save, out),
    WEB ? null : h('div', { class: 'panel' }, h('h3', {}, 'Audio'),
      field('Microphone', micSelect),
      field('Language', h('select', { onchange: (e) => save({ language: e.target.value }) },
        [['en', 'English'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['', 'Detect automatically']].map(([v, l]) => h('option', { value: v, selected: v === s.language }, l)))),
      toggle('captureCallAudio', 'Listen to the other side of the call', 'Captures what plays through this computer\'s speakers or headphones (Meet, Teams, Cal Video). Without it Cue only hears you, and objection cues need key phrases from your side.'),
      field('Call audio source', callSelect, info.platform === 'darwin'
        ? 'Automatic needs Screen & System Audio Recording permission for Cue (System Settings → Privacy & Security). If that doesn\'t pick up the other side, route the call through a loopback device like BlackHole and choose it here.'
        : 'Leave on automatic unless you route call audio through a specific device.'),
      info.platform === 'darwin' ? (() => {
        const out = h('span', { class: 'grow', style: 'font-size:12.5px;color:var(--text-3)' }, 'Play a video with someone talking, then test. macOS may ask to let Cue record system audio: click Allow.');
        return h('div', { class: 'row', style: 'margin-top:-4px' }, out,
          h('button', { class: 'btn', onclick: async (e) => {
            e.target.disabled = true; e.target.textContent = 'Listening 5 s…';
            const r = await call('audio:testSystem');
            e.target.disabled = false; e.target.textContent = 'Test call audio';
            out.textContent = r.ok ? `Working: heard the call audio (level ${Math.round(r.peak * 100)}%).`
              : r.error ? `Didn’t work: ${r.error}`
              : 'Heard only silence. Is something playing? If so, allow Cue under System Settings → Privacy & Security → Screen & System Audio Recording → System Audio Recording Only.';
          } }, 'Test call audio'),
          h('button', { class: 'btn', onclick: () => call('app:openScreenSettings') }, 'Open Settings'));
      })() : null),
    WEB ? null : h('div', { class: 'panel' }, h('h3', {}, 'Calls'),
      toggle('detectCalls', 'Notice when a call starts', info.detectSupported ? 'Watches for apps using the microphone and for open meeting windows (Meet, Zoom, Teams, Slack huddles), like Granola.' : `Windows only. On this computer, start calls from the sidebar, the menu bar icon, or ${mod}+${info.platform === 'darwin' ? 'Option' : 'Alt'}+C.`, !info.detectSupported),
      info.platform === 'darwin' ? h('div', { class: 'row', style: 'margin-top:-4px' },
        h('span', { class: 'grow', style: 'font-size:12.5px;color:var(--text-3)' }, info.windowAccess ? 'Meeting windows: watching (Accessibility allowed)' : 'Meeting windows: off. Allow Cue under Accessibility so a meeting is spotted even with your mic muted.'),
        info.windowAccess ? null : h('button', { class: 'btn', onclick: () => call('app:openAxSettings') }, 'Open Settings')) : null,
      toggle('autoStart', 'Start cues without asking', 'Skips the "Call detected" card and uses the default preset.'),
      field('Default preset', h('select', { onchange: (e) => save({ defaultPresetId: e.target.value }) },
        presets.map((p) => h('option', { value: p.id, selected: p.id === s.defaultPresetId }, p.name))))),
    WEB ? null : h('div', { class: 'panel' }, h('h3', {}, 'Cue card'),
      h('div', { class: 'hint', style: 'margin-bottom:8px;font-size:12.5px;color:var(--text-3)' }, 'Drag it anywhere on the screen; it remembers the spot. It is hidden from screen shares.'),
      h('div', { class: 'hint', style: 'margin-bottom:12px;font-size:12.5px;color:var(--text-3)' }, `Shortcuts: ${mod}+${info.platform === 'darwin' ? 'Option' : 'Alt'}+C starts or ends a call. ${mod}+Shift+Space shrinks the card.`)),
    WEB ? null : h('div', { class: 'panel' }, h('h3', {}, 'App'),
      toggle('launchAtLogin', 'Open Cue when the computer starts', 'Runs quietly in the tray so it is ready for the first call.'),
      h('div', { class: 'field', style: 'margin-top:10px' }, h('span', { class: 'lbl' }, 'Data folder'), h('div', { class: 'hint' }, info.dataDir || ''))),
  );
}

// ---------------------------------------------------------------------------

let routedByMain = false;
window.cue.on('route', (r) => { routedByMain = true; go(r); });
window.cue.on('calls:changed', () => { renderList(); if (route.view === 'call') renderCall(route.id); if (route.view === 'home') renderHome(); });
window.cue.on('team:changed', () => { renderList(); renderTeamLive(); });
window.cue.on('auth:changed', async () => { authState = await call('auth:state'); renderAccount(); renderNav(); renderTeamLive(); renderFolders(); presetsChanged(); renderView(); });
window.cue.on('computers:changed', () => { if (route.view === 'settings') renderSettings(); });
window.cue.on('monitor:event', (e) => onMonitorEvent(e));
window.cue.on('settings:changed', (s) => { applyTheme(s.theme); if (route.view === 'settings') renderSettings(); });
window.cue.on('live:notes', (n) => { const el = document.getElementById('live-ai-notes'); if (el && n?.text) el.replaceChildren(h('div', { html: renderMd(n.text) })); });
window.cue.on('calendar:changed', () => { if (route.view === 'settings') renderSettings(); });
let lastUpdateStatus = null;
window.cue.on('update:changed', (st) => { if (route.view === 'settings' && st.status !== lastUpdateStatus) renderSettings(); lastUpdateStatus = st.status; });
window.cue.on('live:state', (st) => {
  const wasLive = liveState?.mode === 'live';
  liveState = st;
  renderStart();
  if (route.view === 'live') renderLive(false);
  if (wasLive !== (st.mode === 'live')) renderList();
});

// Start once every script on the page (app.js, team.js) has run.
function applyTheme(t) { document.documentElement.dataset.theme = t || 'synapse'; }
window.addEventListener('DOMContentLoaded', async () => {
  call('settings:get').then((s) => applyTheme(s.theme));
  info = await call('app:info');
  authState = await call('auth:state');
  renderAccount();
  renderTeamLive();
  renderFolders();
  liveState = await call('call:state');
  if (!routedByMain) go(liveState.mode === 'live' ? { view: 'live' } : { view: 'home' });
  renderStart();
});
