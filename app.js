// Cue main window: calls (notes), the live call, presets and settings.

// Empty pieces (null/false/'') are skipped instead of being printed as text.
{
  const rc = Element.prototype.replaceChildren;
  const ap = Element.prototype.append;
  const clean = (kids) => kids.flat(Infinity).filter((k) => k != null && k !== false && k !== '');
  Element.prototype.replaceChildren = function (...kids) { return rc.apply(this, clean(kids)); };
  Element.prototype.append = function (...kids) { return ap.apply(this, clean(kids)); };
}

const rawCall = (ch, arg) => window.cue.invoke(ch, arg);
// View as (viewas.js): the admin previewing Cue as someone else. Every page reads through
// call(), so the preview's read-only rules and filters sit in this one place.
let viewAs = null;
const call = (ch, arg) => (viewAs ? viewAsCall(ch, arg) : rawCall(ch, arg));
// The browser version (cue.synapsemfg.com): everything except recording calls.
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

let teamLive = []; // calls live on the team right now (team.js keeps it fresh)
// Our side of a call: Synapse addresses plus everyone on the team list (any domain).
let TEAM_EMAILS = new Set();
// Cue for clients: a note taker that only shows the client's own calls.
// Who the pages are drawn for: you, or the person you're viewing Cue as.
const viewer = () => viewAs || authState.user;
const isClientUser = () => viewer()?.role === 'client';
const isOurs = (e) => /@synapsemfg\.com$/i.test(e || '') || TEAM_EMAILS.has(String(e || '').toLowerCase());
const loadTeamEmails = () => call('team:emails').then((l) => { if (Array.isArray(l) && l.length) TEAM_EMAILS = new Set(l); }).catch(() => {});
// Line icons drawn like the Master Inbox's (24px grid, 1.6 stroke).
const lineIcon = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
const ICON = {
  check: '<svg viewBox="0 0 12 12" fill="none"><path d="M2.5 6.2l2.3 2.3 4.7-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  home: lineIcon('M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'),
  calls: lineIcon('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8'),
  presets: lineIcon('M10 6h10 M10 12h10 M10 18h10 M4 6l1.2 1.2L7.5 5 M4 12l1.2 1.2 2.3-2.2 M4 18l1.2 1.2 2.3-2.2'),
  settings: lineIcon('M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6'),
  chev: '<svg viewBox="0 0 12 12" fill="none"><path d="M4.5 3l3 3-3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  link: lineIcon('M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'),
  dots: '<svg viewBox="0 0 16 16" fill="none"><circle cx="4" cy="8" r="1.2" fill="currentColor"/><circle cx="8" cy="8" r="1.2" fill="currentColor"/><circle cx="12" cy="8" r="1.2" fill="currentColor"/></svg>',
  lock: lineIcon('M6 11h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z M8 11V7a4 4 0 0 1 8 0v4'),
  team: lineIcon('M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75'),
  notesTab: lineIcon('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8'),
  companyTab: lineIcon('M3 21h18 M5 21V7l8-4v18 M19 21V11l-6-4 M9 9h.01 M9 12h.01 M9 15h.01 M9 18h.01'),
  personTab: lineIcon('M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'),
  filesTab: lineIcon('M12 2 2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5'),
  folder: lineIcon('M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z'),
  live: lineIcon('M4.9 19.1a10 10 0 0 1 0-14.2 M7.8 16.2a6 6 0 0 1 0-8.4 M16.2 7.8a6 6 0 0 1 0 8.4 M19.1 4.9a10 10 0 0 1 0 14.2 M14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0z'),
  sparkle: lineIcon('M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z M19 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z'),
  archive: lineIcon('M21 8v13H3V8 M1 3h22v5H1z M10 12h4'),
  unarchive: lineIcon('M21 8v13H3V8 M1 3h22v5H1z M12 18v-6 M9.5 14.5 12 12l2.5 2.5'),
  trash: lineIcon('M3 6h18 M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6 M10 11v6 M14 11v6 M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2'),
  trophy: lineIcon('M6 9H4.5a2.5 2.5 0 0 1 0-5H6 M18 9h1.5a2.5 2.5 0 0 0 0-5H18 M4 22h16 M10 14.7V17c0 .6-.5 1-1 1.2C7.9 18.8 7 20.2 7 22 M14 14.7V17c0 .6.5 1 1 1.2 1.1.6 2 2 2 3.8 M18 2H6v7a6 6 0 0 0 12 0V2z'),
  shield: lineIcon('M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M9 12l2 2 4-4'),
  plus: lineIcon('M12 5v14 M5 12h14'),
  pen: lineIcon('M12 20h9 M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z'),
  globe: lineIcon('M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M2 12h20 M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z'),
  laptop: lineIcon('M4 5h16a1 1 0 0 1 1 1v10H3V6a1 1 0 0 1 1-1z M1 19h22'),
  back: lineIcon('M19 20 9 12l10-8v16z M5 19V5'),
  next: lineIcon('M5 4l10 8-10 8V4z M19 5v14'),
  play: lineIcon('M6 3l14 9-14 9V3z'),
  pause: lineIcon('M6 4h4v16H6z M14 4h4v16h-4z'),
  x: lineIcon('M18 6 6 18 M6 6l12 12'),
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

// d.flush() runs a pending call now (before the page changes).
// Anything typed while viewing Cue as someone else (View as) is dropped, even if the
// timer fires after the preview ends: the preview never saves.
function debounce(fn, ms) {
  let t;
  let args = null;
  let queuedInPreview = false;
  const run = () => { const x = args; args = null; if (queuedInPreview) return; fn(...x); };
  const d = (...a) => { clearTimeout(t); args = a; queuedInPreview = !!viewAs; t = setTimeout(run, ms); };
  d.flush = () => { if (!args) return; clearTimeout(t); run(); };
  return d;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// renderMd and cleanHtml live in md.js (loaded first): markdown from notes, briefs
// and Claude is rebuilt from a short allowlist of tags before it reaches the page.

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
    $start.replaceChildren(h('button', { class: 'start-btn live', onclick: () => go({ view: 'live' }) }, h('span', { class: 'mark' }), liveState.snapshot.total ? `On a call · ${liveState.snapshot.done}/${liveState.snapshot.total}` : 'On a call'));
    return;
  }
  const presets = presetsCache || (presetsCache = await call('presets:get'));
  const templates = templatesCache || (templatesCache = await call('notes:templates'));
  const btn = h('button', { class: 'start-btn', onclick: (e) => { e.stopPropagation(); menuOpen = !menuOpen; renderStart(); } },
    h('span', { html: ICON.plus, style: 'width:16px;height:16px;display:inline-grid' }), 'Start a call',
    h('span', { class: 'kbd', title: 'Start or stop a call from anywhere' }, /Mac/i.test(navigator.platform) ? '⌥⌘C' : 'Ctrl Alt C'));
  const kids = [btn];
  if (menuOpen) {
    const item = (p) => h('button', { onclick: async () => { menuOpen = false; startKey = ''; await call('call:start', { presetId: p.id }); go({ view: 'live' }); } }, p.name);
    kids.push(h('div', { class: 'menu' },
      presets.some((p) => p.kind !== 'notes') ? h('div', { class: 'menu-label' }, 'Coach me') : null, presets.filter((p) => p.kind !== 'notes').map(item),
      h('div', { class: 'menu-label' }, 'Just take notes'), [...presets.filter((p) => p.kind === 'notes'), ...templates].map(item)));
  }
  $start.replaceChildren(...kids);
}
document.addEventListener('click', () => { if (menuOpen) { menuOpen = false; renderStart(); } });
function presetsChanged() { presetsCache = null; startKey = ''; renderStart(); }

function renderNav() {
  // Companies, People and Files are tabs of Home, so Home stays lit on them.
  const HOME_TABS = ['home', 'companies', 'company', 'people', 'person', 'files'];
  const item = (view, label, icon) => h('button', {
    class: `nav-item ${route.view === view || (view === 'home' && HOME_TABS.includes(route.view)) ? 'on' : ''}`,
    onclick: () => go({ view }),
  }, h('span', { html: ICON[icon], style: 'display:inline-grid' }), label);
  // Live is always there; it glows (with a count) while anyone on the team is on a call.
  const n = teamLive.length;
  const live = authState.user ? h('button', {
    class: `nav-item live-nav ${route.view === 'watch' ? 'on' : ''} ${n ? 'glow' : ''}`,
    title: n ? `${n} call${n === 1 ? '' : 's'} live now` : 'Nobody is on a call',
    onclick: () => go({ view: 'watch' }),
  }, h('span', { html: ICON.live, style: 'display:inline-grid' }), 'Live', n ? h('span', { class: 'live-count' }, n) : null) : null;
  // Like the Master Inbox: where you work at the top, setup at the bottom of the sidebar.
  const $foot = document.getElementById('foot-nav');
  if (isClientUser()) { $nav.replaceChildren(item('home', 'Home', 'home')); $foot.replaceChildren(item('settings', 'Settings', 'settings')); return; }
  $nav.replaceChildren(item('home', 'Home', 'home'), live, authState.user ? item('ask', 'Ask Cue', 'sparkle') : null, authState.user ? item('wins', 'What wins', 'trophy') : null);
  $foot.replaceChildren(item('presets', 'Presets', 'presets'), item('settings', 'Settings', 'settings'),
    viewer()?.role === 'admin' ? item('admin', 'Admin', 'shield') : null);
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

// Pages load their data, then paint. A page still loading when the user moves on must
// not paint over (or reach into) the page they moved to: each render takes a ticket
// and gives up once a newer render has started.
let pageSeq = 0;
const pageTicket = () => { const n = pageSeq; return () => n === pageSeq; };

// A new page rises in once its content is there, and the scroll goes back to the top at
// the same moment. Doing either on the old page while the new one loaded made the old
// tab play again before the new one showed.
let pageEnter = null; // set while a new page is on its way
const SIBLING_TABS = ['home', 'companies', 'people', 'files'];
new MutationObserver(() => {
  if (!pageEnter) return;
  const kids = [...$view.children];
  if (!kids.length) return;
  if (pageEnter.scroll) { document.getElementById('main').scrollTop = 0; pageEnter.scroll = false; }
  if (kids.every((k) => k.classList.contains('placeholder'))) return; // still loading: rise with the content
  const still = pageEnter.still;
  pageEnter = null;
  if (still || matchMedia('(prefers-reduced-motion: reduce)').matches) return; // Home's own tabs swap without the rise
  for (const k of kids) k.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: 'ease', fill: 'backwards' });
}).observe($view, { childList: true });

function go(r) {
  if (route.view === 'monitor' && (r.view !== 'monitor' || r.id !== route.id)) stopMonitor();
  activeNotepad?.flush?.(); // edits typed in the last moment before leaving still save
  activeNotepad = null;
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
      ? 'An admin removed this computer from Cue. Ask Dylan to approve it again in Admin → Devices.'
      : d ? `For safety, each computer has to be approved once. Dylan can approve “${d.name}” in Cue → Admin → Devices. This page opens by itself as soon as he does.`
        : 'One moment while Cue checks this computer is allowed.'),
    d && !revoked ? h('div', { class: 'row', style: 'gap:10px;justify-content:center' }, h('span', { class: 'spin' }), h('span', { class: 'saved' }, 'Waiting…')) : null,
    h('div', { class: 'row', style: 'gap:10px;justify-content:center;margin-top:18px' },
      h('button', { class: 'btn primary', onclick: async () => { out.textContent = 'Checking…'; await call('computer:check'); authState = await call('auth:state'); out.textContent = ''; renderNav(); renderFolders(); renderView(); } }, 'Check again'),
      h('button', { class: 'btn allow', onclick: async () => { await call('auth:signOut'); authState = await call('auth:state'); renderAccount(); renderFolders(); go({ view: 'home' }); } }, 'Sign out')),
    out));
}

async function renderView() {
  const v = route.view;
  pageSeq += 1;
  // The saved sign-in is still loading: don't flash the sign-in page.
  if (authState.restoring && v !== 'signin') { $view.replaceChildren(h('div', { class: 'placeholder' }, h('span', { class: 'spin' }), 'Opening Cue…')); return; }
  if (deviceBlocked() && v !== 'signin') return renderWaiting();
  // Moving between Home's tabs (Notes, Companies, People, Files) is a plain swap; other pages rise in.
  if ($view.dataset.view !== v || $view.dataset.id !== String(route.id || '')) pageEnter = { scroll: true, still: SIBLING_TABS.includes(v) && SIBLING_TABS.includes($view.dataset.view) };
  $view.dataset.view = v;
  $view.dataset.id = String(route.id || '');
  if (v === 'live') { const fresh = pageTicket(); liveState = await call('call:state'); if (!fresh()) return; renderList(); return renderLive(true); }
  if (v === 'call') return renderCall(route.id);
  if (v === 'monitor') return renderMonitor(route.id);
  if (v === 'watch') return renderWatch();
  if (v === 'archive') return renderArchive();
  if (v === 'wins') return renderWins();
  if (v === 'trash') return renderTrash();
  if (v === 'admin') return renderAdmin();
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
  const fresh = pageTicket();
  if (authState.configured && !authState.user && !sessionStorage.getItem('cue-offline')) return renderSignIn();
  if (authState.user) return renderNotesTab();
  const s = await call('settings:get');
  if (!fresh()) return;
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
      h('div', { class: 'row', style: 'margin-bottom:18px' }, h('h1', { class: 'page', style: 'flex:1;margin:0' }, 'Call in progress'),
        h('button', { class: 'btn', id: 'live-pause', onclick: () => call('call:pause', !liveState?.paused) }, liveState.paused ? 'Resume' : 'Pause'),
        h('button', { class: 'btn', onclick: () => { pushNotes.flush(); call('call:stop'); } }, 'End call and write notes')),
      h('div', { id: 'live-warn' }),
      h('div', { id: 'live-coverage' }),
      h('div', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', {}, 'Your notes')), liveNotesEl),
      h('div', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', {}, 'Live notes'), h('span', { class: 'saved', id: 'live-people' })),
        h('div', { class: 'md live-notes', id: 'live-ai-notes' }, h('div', { class: 'placeholder' }, 'Cue writes these as the call goes, every couple of minutes.'))),
      h('div', { class: 'section', style: s.items.length ? '' : 'display:none' }, h('div', { class: 'section-head' }, h('h2', {}, 'Checklist')), h('ul', { class: 'checks', id: 'live-checks' })),   // note-taking calls have no checklist
      h('div', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', {}, 'Live transcript')), h('div', { class: 'lines', id: 'live-lines' })),
      // Ask about the call while it's on, like Granola (the same chat carries on after the call).
      authState.user && !isClientUser() && !viewAs && liveState.callId ? h('div', { class: 'ask-dock' }, askPanel({ callId: liveState.callId, compact: true, dock: true })) : null,
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
  warn.replaceChildren(
    liveState.paused ? h('div', { class: 'banner paused' }, h('span', { class: 'grow' }, 'Paused. Cue isn’t listening, so nothing said now goes in the transcript or the notes.'), h('button', { class: 'btn primary', onclick: () => call('call:pause', false) }, 'Resume')) : '',
    w ? h('div', { class: 'banner warn' }, w) : '');
  const pauseBtn = document.getElementById('live-pause');
  if (pauseBtn) pauseBtn.textContent = liveState.paused ? 'Resume' : 'Pause';
  const checksKey = JSON.stringify(s.items.map((i) => [i.id, i.done, i.skipped, i.say]));
  const checksEl = document.getElementById('live-checks');
  if (checksEl.dataset.key !== checksKey) {
    checksEl.dataset.key = checksKey;
    document.getElementById('live-coverage').replaceChildren(...(s.total ? [coverage(s.done, s.total)] : []));
    checksEl.replaceChildren(...[...s.items.filter((i) => !i.skipped), ...s.items.filter((i) => i.skipped)].map((i) => checkRow(i, true)));
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

// One beat: ticked, open (with what to say for this prospect, from the prep), or not for
// this call (with why, and who said so). Live rows tick on click and can be skipped.
function checkRow(i, isLive) {
  if (i.skipped) {
    return h('li', { class: 'skipped', title: 'Not for this call: doesn’t count for or against the rep' },
      h('span', { class: 'box skip-box' }),
      h('span', { class: 'grow' }, h('span', { class: 'label' }, i.label),
        h('span', { class: 'ev' }, `Not for this call${i.skipReason ? `: ${i.skipReason}` : ''}${i.skipBy && i.skipBy !== 'manual' ? ' (Cue)' : ''}`)),
      isLive ? h('button', { class: 'link-btn', onclick: (e) => { e.stopPropagation(); call('call:skip', { id: i.id, skip: false }); } }, 'Bring back') : null);
  }
  return h('li', { class: `${i.done ? 'done' : ''} ${isLive ? 'live' : ''}`, onclick: isLive ? () => call('call:toggle', i.id) : null, title: isLive ? 'Click to tick by hand' : null },
    h('span', { class: 'box', html: i.done ? ICON.check : '' }),
    h('span', { class: 'grow' }, h('span', { class: 'label' }, i.label), i.done && i.evidence ? h('span', { class: 'ev' }, `“${i.evidence}”`) : null,
      !i.done && i.say ? h('span', { class: 'say' }, `For them: ${i.say}`) : null),
    isLive && !i.done ? h('button', { class: 'link-btn skip-link', title: 'Not for this call (doesn’t count against you)', onclick: (e) => { e.stopPropagation(); call('call:skip', { id: i.id, skip: true }); } }, 'Not for this call') : null);
}

function lineRow(seg, key, partial = false, names = { me: 'You', them: 'Them' }) {
  const who = seg.speaker === 'me' ? names.me : seg.speaker === 'them' ? names.them : (seg.speaker || '');
  return h('div', { class: `line ${seg.speaker === 'me' ? 'me' : 'them'} ${partial ? 'partial' : ''}`, 'data-k': key, title: typeof seg.at === 'number' ? fmtClock(seg.at) : null },
    h('span', { class: 'who', title: who }, who), h('span', {}, seg.text));
}

setInterval(() => {
  const el = document.getElementById('live-clock');
  if (el && liveState?.mode === 'live') el.textContent = fmtClock(Date.now() - liveState.snapshot.startedAt);
}, 1000);

// ---------------------------------------------------------------------------
// A finished call
// ---------------------------------------------------------------------------

let undoRewrite = null;   // { id, aiNotes, notesMine, template } right after "Rewrite notes"
let activeNotepad = null; // the open call's notepad (to save pending edits before leaving)

async function renderCall(id) {
  const fresh = pageTicket();
  const c = await call('calls:get', id);
  if (!fresh()) return;
  if (!c) return go({ view: 'home' });
  if (c.status === 'live' && liveState?.mode === 'live' && liveState.callId === id) return go({ view: 'live' });

  const saveTitle = debounce((v) => call('calls:update', { id, patch: { title: v } }).then(renderList), 400);
  const coaching = c.mode !== 'notes' && (c.total || (c.checklist || []).length);
  const [shareBtn, shareBox] = shareButton(c) || [null, null];
  const names = c.mine === false && c.owner ? { me: c.owner.split(' ')[0], them: 'Them' } : { me: 'You', them: 'Them' };

  if (undoRewrite && undoRewrite.id !== id) undoRewrite = null;
  // Everything that isn't the notes lives in one quiet "…" menu.
  // Rewriting keeps what you had if the AI can't write new notes, and can be undone.
  const rewrite = async (presetId = null, templateName = '') => {
    np?.flush?.();
    const before = { aiNotes: c.aiNotes || '', notesMine: np?.edits?.() || c.notesMine || [] };
    if (before.aiNotes && before.notesMine.length && !confirm('Write the notes again? Your edits to the AI notes will be replaced (your own notes stay, and you can undo right after).')) return;
    np?.flush?.();
    body.replaceChildren(h('div', { class: 'placeholder' }, h('span', { class: 'spin' }), templateName ? `Writing notes with “${templateName}”…` : 'Writing notes…'));
    const r = await call('calls:rewrite', presetId ? { id, presetId } : id);
    if (r && r.ok === false) { if (route.view === 'call' && route.id === id) renderCall(id); alert(r.error); return; }
    undoRewrite = before.aiNotes ? { id, ...before, template: r?.template || templateName } : null;
    if (route.view === 'call' && route.id === id) renderCall(id);
  };
  const attach = async () => { const r = await call('files:attach', c.id); if (!r.ok) alert(r.error); loadFiles(); };
  const flashMenu = (text) => { const el = h('div', { class: 'np-toast' }, text); document.body.append(el); setTimeout(() => el.remove(), 1600); };
  let menuOpenHere = false;
  let menuPage = 'main';
  let templates = null;
  const menuWrap = h('span', { class: 'more-wrap' });
  const pickTemplate = async () => {
    menuPage = 'templates';
    if (!templates) {
      const [notesT, presets] = await Promise.all([call('notes:templates'), isClientUser() ? [] : call('presets:get')]);
      // Note templates; a coaching call can also be written up with another coaching preset.
      templates = [...(notesT || []), ...(presets || []).filter((p) => p.kind === 'notes' || c.mode !== 'notes')].filter((p, i, all) => p && p.id && all.findIndex((x) => x.id === p.id) === i);
    }
    drawMenu();
  };
  const drawMenu = () => menuWrap.replaceChildren(
    h('button', { class: 'icon-btn', title: 'More', onclick: (e) => {
      e.stopPropagation(); menuOpenHere = !menuOpenHere; menuPage = 'main'; drawMenu();
      // A click anywhere else closes it (every time it opens, not just the first).
      if (menuOpenHere) document.addEventListener('click', () => { if (menuOpenHere) { menuOpenHere = false; drawMenu(); } }, { once: true });
    } }, h('span', { html: ICON.dots, style: 'display:inline-grid;width:16px;height:16px' })),
    menuOpenHere && menuPage === 'templates' ? h('div', { class: 'pop menu-pop right tpl-pop', onclick: (e) => e.stopPropagation() },
      h('div', { class: 'menu-head' }, 'Write the notes with'),
      (templates || []).map((t) => h('button', { type: 'button', class: t.id === c.presetId ? 'on' : '', onclick: () => { menuOpenHere = false; drawMenu(); rewrite(t.id, t.name); } }, t.name))) : null,
    menuOpenHere && menuPage === 'main' ? h('div', { class: 'pop menu-pop right' },
      menuItem(c.aiNotes ? 'Rewrite notes' : 'Write notes with AI', () => rewrite()),
      isClientUser() ? null : h('button', { type: 'button', onclick: (e) => { e.stopPropagation(); pickTemplate(); } }, 'Rewrite with another template…'),
      c.aiNotes || c.myNotes ? menuItem('Copy as Markdown', async () => { np?.flush?.(); const ok = await navigator.clipboard.writeText(noteMarkdown(c)).then(() => true, () => false); flashMenu(ok ? 'Notes copied as Markdown' : 'Copy failed'); }) : null,
      c.aiNotes || c.myNotes || (c.transcript || []).length ? menuItem('Download notes (.md)', () => { np?.flush?.(); downloadText(fileNameFor(c), `${noteMarkdown(c)}${(c.transcript || []).length ? `\n## Transcript\n\n${transcriptText(c, names)}\n` : ''}`); }) : null,
      authState.user && !isClientUser() ? menuItem('Attach files', attach) : null,
      authState.user && !isClientUser() && c.status !== 'live' && c.status !== 'writing' ? menuItem(c.archivedAt ? 'Unarchive' : 'Archive', () => archiveCalls([id], !c.archivedAt)) : null,
      isClientUser() ? null : authState.user
        ? menuItem('Delete call', () => trashCalls([id]), true)
        : menuItem('Delete call', async () => { if (!confirm('Delete this call and its notes? This cannot be undone.')) return; await call('calls:delete', id); go({ view: 'home' }); }, true)) : null);
  drawMenu();

  // Who was on it, in one quiet line.
  // The people on the other side: click one to open their page (like Granola's attendee chips).
  const otherPeople = (c.attendees || []).filter((a) => !isOurs(a.email) && (a.name || a.email));
  const personBit = (a) => {
    const label = a.name || String(a.email).split('@')[0];
    return authState.user && !isClientUser() && a.email ? h('button', { class: 'meta-person', title: a.email, onclick: () => go({ view: 'person', id: String(a.email).toLowerCase() }) }, label) : label;
  };
  let showBeats = false;
  const beatsBox = h('div');
  const drawBeats = () => beatsBox.replaceChildren(...(showBeats ? [h('div', { class: 'beats' },
    h('ul', { class: 'checks' }, [...(c.checklist || []).filter((i) => !i.skipped), ...(c.checklist || []).filter((i) => i.skipped)].map((i) => checkRow(i, false))),
    (c.objections || []).length ? h('div', { class: 'beats-obj' }, c.objections.map((o) => h('div', {}, h('b', {}, o.title), o.quote ? ` “${o.quote}”` : ''))) : null)] : []));
  const metaBits = [
    `${new Date(c.startedAt).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}, ${timeOf(c.startedAt)}`,
    c.durationMs > 0 ? fmtDur(c.durationMs) : null,
    c.mine === false && c.owner ? c.owner.split(' ')[0] : null,
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

  const np = c.status === 'writing' ? null : notepad(c, { names, transcript: h('div', { class: 'lines' }, (c.transcript || []).map((s) => lineRow(s, null, false, names))) });
  activeNotepad = np;
  const body = h('div', { class: 'call-body' }, np || h('div', { class: 'placeholder' }, h('span', { class: 'spin' }), 'Writing notes…'));
  const undoBar = undoRewrite?.id === id ? h('div', { class: 'banner undo-bar' },
    h('span', { class: 'grow' }, `Notes rewritten${undoRewrite.template ? ` with “${undoRewrite.template}”` : ''}.`),
    h('button', { class: 'btn', onclick: async () => {
      const u = undoRewrite; undoRewrite = null;
      await call('calls:update', { id, patch: { aiNotes: u.aiNotes, notesMine: u.notesMine } });
      renderCall(id);
    } }, 'Undo'),
    h('button', { class: 'icon-btn', title: 'Dismiss', html: ICON.x, onclick: () => { undoRewrite = null; undoBar.remove(); } })) : null;

  const page = h('div', { class: 'call-page' },
    h('div', { class: 'call-top' },
      h('span', { class: 'grow' }),
      isClientUser() ? null : folderPicker(c),
      isClientUser() ? null : outcomePicker(c),
      isClientUser() ? null : privacyToggle(c),
      isClientUser() ? null : shareBtn,
      menuWrap),
    shareBox,
    h('input', { class: 'title-input', value: c.title || '', placeholder: 'Untitled call', readonly: viewAs ? true : null, oninput: (e) => saveTitle(e.target.value) }),
    h('div', { class: 'call-meta' },
      h('span', {}, metaBits.join(' · '), otherPeople.length ? [' · ', ...otherPeople.slice(0, 3).flatMap((a, i) => [i ? ', ' : '', personBit(a)]), otherPeople.length > 3 ? ` +${otherPeople.length - 3}` : ''] : null),
      talkLine ? h('span', { class: 'meta-talk', title: 'Share of talking time' }, talkLine) : null,
      coaching ? h('button', { class: 'beats-btn', 'aria-expanded': 'false', title: 'Show which checklist beats were covered on this call',
        onclick: (e) => { showBeats = !showBeats; e.currentTarget.classList.toggle('on', showBeats); e.currentTarget.setAttribute('aria-expanded', String(showBeats)); drawBeats(); } },
        h('span', { class: `beats-ring${c.done ? '' : ' none'}`, html: ICON.check }),
        `Checklist ${c.done}/${c.total}`,
        c.dreamScore != null ? h('span', { class: 'beats-sub' }, `· Outcome ${c.dreamScore}%`) : null,
        h('span', { class: 'beats-chev', html: ICON.chev })) : null,
      c.status === 'interrupted' || c.status === 'live' ? h('span', { class: 'meta-warn' }, 'Interrupted') : null),
    beatsBox,
    undoBar,
    body,
    filesRow,
    authState.user && !isClientUser() && !viewAs && c.status !== 'live' && c.status !== 'writing' ? h('div', { class: 'ask-dock' }, askPanel({ callId: c.id, compact: true, dock: true })) : null);
  page.addEventListener('dragover', (e) => { if (authState.user && e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); page.classList.add('drop'); } });
  page.addEventListener('dragleave', (e) => { if (e.target === page) page.classList.remove('drop'); });
  page.addEventListener('drop', async (e) => {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault(); page.classList.remove('drop');
    if (viewAs) return alert(`You're viewing Cue as ${viewAs.name}, so nothing can be changed. Exit View as first.`);
    const r = await window.cue.dropFiles(c.id, [...e.dataTransfer.files]);
    if (!r.ok) alert(r.error); loadFiles();
  });
  if (!fresh()) return;
  $view.dataset.status = c.status || '';
  $view.replaceChildren(page);
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

let presetEditing = null;

// Teammates can read the presets; only the admin edits them.
async function renderPresets() {
  const locked = !!viewer() && viewer().role === 'member';
  if (locked && presetEditing === '__ai') presetEditing = null;
  const fresh = pageTicket();
  await renderPresetsInner();
  if (!locked || !fresh()) return;
  $view.querySelectorAll('.ai-tab').forEach((el) => el.remove());
  $view.querySelectorAll('.preset-tab').forEach((el) => { if (/New preset/.test(el.textContent)) el.remove(); });
  $view.querySelectorAll('input, select, textarea, button:not(.preset-tab):not(.allow), [contenteditable="true"]').forEach((el) => { if (el.isContentEditable) el.contentEditable = 'false'; else el.disabled = true; });
  $view.querySelector('h1.page')?.after(h('div', { class: 'banner' }, 'Only Dylan can change presets. You can read them here.'));
}

async function renderPresetsInner() {
  const fresh = pageTicket();
  const presets = presetsCache = await call('presets:get');
  const settings = await call('settings:get');
  if (!fresh()) return;
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

  // See it on a call: a step-by-step preview of the card, or a full AI test call.
  const isAdmin = !authState.user || viewer().role === 'admin';
  const tryOut = h('div', { class: 'test-out' });
  const tryPanel = h('div', { class: 'panel try-panel' },
    h('div', { class: 'try-head' },
      h('span', { class: 'grow' }, h('b', {}, 'See it on a call'), h('span', {}, p.kind === 'notes'
        ? 'Walk through a call with this template: the call card, “Meeting over?” and the notes.'
        : `Walk through every stage of a call on the real call card, with this preset’s ${p.checklist.length} beat${p.checklist.length === 1 ? '' : 's'} and ${(p.objections || []).length} objection${(p.objections || []).length === 1 ? '' : 's'}. Nothing is recorded.`)),
      h('div', { class: 'try-btns' },
      h('button', { class: 'btn primary allow', onclick: async () => {
        const r = await call('preview:start', JSON.parse(JSON.stringify(p)));
        if (!r.ok) tryOut.textContent = r.error;
      } }, 'Preview on a call'),
      !WEB && isAdmin && p.kind !== 'notes' ? h('button', { class: 'btn', onclick: async (e) => {
        e.target.disabled = true; e.target.textContent = 'Writing a test call… (about 30 s)'; tryOut.textContent = '';
        const r = await call('preview:testCall', JSON.parse(JSON.stringify(p)));
        e.target.disabled = false; e.target.textContent = 'Test call with AI';
        tryOut.textContent = r.ok ? (r.waiting ? 'Click Start on the “Call detected” card. Claude wrote a call that covers every beat and raises the objections; it plays at 2× with the real AI cues, then writes notes (private, in My notes).' : 'Running.') : r.error;
      } }, 'Test call with AI') : null)),
    tryOut);

  // Advanced: when to use it, and coaching targets that differ from the team's.
  const teamCoach = await call('coaching:get').catch(() => null);
  const STAGES = [['opening', 'Opening'], ['discovery', 'Discovery'], ['pitch', 'Pitch'], ['objection', 'Objection'], ['close', 'Close'], ['wrap_up', 'Wrap-up']];
  const pc = () => { p.coaching = p.coaching || {}; p.coaching.talk_targets = p.coaching.talk_targets || {}; return p.coaching; };
  const numIn = (value, placeholder, onset) => h('input', { type: 'number', class: 'num-in', min: '0', max: '100', value: value ?? '', placeholder: String(placeholder ?? ''), oninput: (e) => { onset(e.target.value === '' ? undefined : Number(e.target.value)); touch(); } });
  const advanced = h('details', { class: 'advanced', open: !!((p.match || []).length || Object.keys(p.coaching?.talk_targets || {}).length || p.coaching?.monologue_seconds) },
    h('summary', {}, 'Advanced'),
    h('div', { class: 'panel' },
      field('Use automatically for meetings titled', h('input', { type: 'text', value: csv(p.match), placeholder: 'e.g. intro, discovery, demo', oninput: (e) => { p.match = fromCsv(e.target.value); touch(); } }),
        'Comma separated. When a calendar meeting’s title has one of these words, Cue picks this preset for it.'),
      p.kind === 'notes' ? null : h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Your talk share for this preset (%)'),
        h('div', { class: 'stage-grid' }, STAGES.map(([k, label]) => h('label', { class: 'stage-cell' }, h('span', {}, label),
          numIn(p.coaching?.talk_targets?.[k], teamCoach?.talk_targets?.[k], (v) => { const c = pc(); if (v == null) delete c.talk_targets[k]; else c.talk_targets[k] = v; })))),
        h('div', { class: 'hint' }, 'Leave a box empty to use the team target (shown faded). The card marks the target on the talk bar for each stage.')),
      p.kind === 'notes' ? null : field('Longest monologue before a nudge (seconds)', numIn(p.coaching?.monologue_seconds, teamCoach?.monologue_seconds, (v) => { const c = pc(); if (v == null) delete c.monologue_seconds; else c.monologue_seconds = v; }),
        'Empty uses the team setting.')));

  const wins = authState.user ? await call('wins:get').catch(() => null) : null;
  const pst = wins?.stats?.[p.id];
  const beatStat = (id) => { const b = pst?.beats.find((x) => x.id === id); return b && (b.won.n || b.lost.n) ? h('span', { class: `beat-stat ${b.gap >= 30 ? 'good' : b.gap <= -20 ? 'bad' : ''}`, title: 'From won and lost sales calls (What wins)' }, `Won ${b.won.k}/${b.won.n} · Lost ${b.lost.k}/${b.lost.n}`) : null; };
  const itemBlocks = p.checklist.map((it, i) => h('div', { class: 'editor-block' },
    h('div', { class: 'bar' }, h('span', { class: 'n' }, `Beat ${i + 1}`), beatStat(it.id),
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
      tryPanel,
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
      advanced,
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

// Teammates see their settings but can't change them (the theme is theirs to pick).
function lockSettings(root) {
  root.querySelectorAll('.panel:not([data-open])').forEach((p) => {
    p.classList.add('locked');
    p.querySelectorAll('input, select, textarea, button:not(.allow)').forEach((el) => { el.disabled = true; });
  });
}

async function renderSettings() {
  const fresh = pageTicket();
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

  const team = isClientUser() ? await clientSettingsPanels() : await teamSettingsPanels(s);
  const locked = !!viewer() && viewer().role === 'member';
  if (!fresh()) return;
  $view.replaceChildren(
    h('h1', { class: 'page' }, 'Settings'),
    h('p', { class: 'sub' }, isClientUser() ? 'Your account and how Cue listens to your calls.' : WEB ? 'Cue on the web: everything except recording calls. Recording, the call widget and audio live in the desktop app.' : 'Keys are stored encrypted on this computer and only sent to ElevenLabs and Anthropic.'),
    locked ? h('div', { class: 'banner' }, 'Only Dylan can change Cue’s settings. You can pick your own theme.') : null,
    viewer()?.role === 'admin' ? h('button', { class: 'banner banner-link', onclick: () => go({ view: 'admin' }) },
      h('span', { html: ICON.shield, style: 'display:inline-grid;width:16px;height:16px' }),
      h('span', { class: 'grow' }, h('b', {}, 'Team settings are on the Admin page'), ' · coaching, playbook, presets, devices, calendars, share links, keys and the simulator'),
      h('span', {}, 'Open →')) : null,
    h('div', { class: 'panel', 'data-open': '' }, h('h3', {}, 'Appearance'),
      // The same three themes as the Master Inbox.
      h('div', { class: 'theme-pick' }, [
        ['light', 'Light', '#f9f9f8', '#ffffff', ['#37352f', '#2383e2']],
        ['dark', 'Dark', '#202020', '#191919', ['#ededed', '#2383e2']],
        ['synapse', 'Synapse', '#0b1120', '#070b16', ['#4a9eff', '#34d399']],
      ].map(([id, label, side, page, [a, b]]) => h('button', { class: (s.theme || 'light') === id ? 'on' : '', onclick: async () => { applyTheme(id); await save({ theme: id }); renderSettings(); } },
        h('span', { class: 'sw', style: `background:${page}` },
          h('span', { class: 's1', style: `background:${side}` }, h('i', { style: `width:80%;background:${a};opacity:.55` }), h('i', { style: `width:60%;background:${a};opacity:.3` }), h('i', { style: `width:70%;background:${a};opacity:.3` })),
          h('span', { class: 's2' }, h('i', { style: `width:70%;background:${a};opacity:.8` }), h('i', { style: `width:90%;background:${a};opacity:.25` }), h('i', { style: `width:40%;background:${b}` }))),
        label)))),
    ...team,
    viewer()?.role === 'admin' || isClientUser() ? null : await keysPanel(s, keyInput, save, out),
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
          h('button', { class: 'btn allow', onclick: async (e) => {
            e.target.disabled = true; e.target.textContent = 'Listening 5 s…';
            const r = await call('audio:testSystem');
            e.target.disabled = false; e.target.textContent = 'Test call audio';
            out.textContent = r.ok ? `Working: heard the call audio (level ${Math.round(r.peak * 100)}%).`
              : r.error ? `Didn’t work: ${r.error}`
              : 'Heard only silence. Is something playing? If so, allow Cue under System Settings → Privacy & Security → Screen & System Audio Recording → System Audio Recording Only.';
          } }, 'Test call audio'),
          h('button', { class: 'btn allow', onclick: () => call('app:openScreenSettings') }, 'Open Settings'));
      })() : null),
    WEB ? null : h('div', { class: 'panel' }, h('h3', {}, 'Calls'),
      toggle('detectCalls', 'Notice when a call starts', info.detectSupported ? 'Watches for apps using the microphone and for open meeting windows (Meet, Zoom, Teams, Slack huddles), like Granola.' : `Windows only. On this computer, start calls from the sidebar, the menu bar icon, or ${mod}+${info.platform === 'darwin' ? 'Option' : 'Alt'}+C.`, !info.detectSupported),
      info.platform === 'darwin' ? h('div', { class: 'row', style: 'margin-top:-4px' },
        h('span', { class: 'grow', style: 'font-size:12.5px;color:var(--text-3)' }, info.windowAccess ? 'Meeting windows: watching (Accessibility allowed)' : 'Meeting windows: off. Allow Cue under Accessibility so a meeting is spotted even with your mic muted.'),
        info.windowAccess ? null : h('button', { class: 'btn allow', onclick: () => call('app:openAxSettings') }, 'Open Settings')) : null,
      toggle('autoStart', 'Start cues without asking', 'Skips the "Call detected" card and uses the default preset.'),
      isClientUser() ? null : field('Default preset', h('select', { onchange: (e) => save({ defaultPresetId: e.target.value }) },
        presets.map((p) => h('option', { value: p.id, selected: p.id === s.defaultPresetId }, p.name))))),
    WEB ? null : h('div', { class: 'panel' }, h('h3', {}, 'Cue card'),
      h('div', { class: 'hint', style: 'margin-bottom:8px;font-size:12.5px;color:var(--text-3)' }, 'Drag it anywhere on the screen; it remembers the spot. It is hidden from screen shares.'),
      h('div', { class: 'hint', style: 'margin-bottom:12px;font-size:12.5px;color:var(--text-3)' }, `Shortcuts: ${mod}+${info.platform === 'darwin' ? 'Option' : 'Alt'}+C starts or ends a call. ${mod}+Shift+Space shrinks the card.`)),
    WEB ? null : h('div', { class: 'panel' }, h('h3', {}, 'App'),
      toggle('launchAtLogin', 'Open Cue when the computer starts', 'Runs quietly in the tray so it is ready for the first call.'),
      h('div', { class: 'field', style: 'margin-top:10px' }, h('span', { class: 'lbl' }, 'Data folder'), h('div', { class: 'hint' }, info.dataDir || ''))),
  );
  if (locked) lockSettings($view);
}

// ---------------------------------------------------------------------------

let routedByMain = false;
window.cue.on('route', (r) => { routedByMain = true; if (viewAs) exitViewAs(false); go(r); });
// Typing in a call's notes or title: don't redraw the page under you (it would drop the
// caret and could show an older copy). Redraw only when the call itself moved on, e.g.
// "Writing notes…" became the notes.
const editingInView = () => { const a = document.activeElement; return !!a && $view.contains(a) && (a.isContentEditable || /^(TEXTAREA|INPUT)$/.test(a.tagName)); };
window.cue.on('calls:changed', async (p) => {
  renderList();
  if (route.view === 'home') renderHome();
  if (route.view !== 'call' || (p?.id && p.id !== route.id)) return;
  if (!editingInView()) return renderCall(route.id);
  const id = route.id;
  const c = await call('calls:get', id).catch(() => null);
  if (c && route.view === 'call' && route.id === id && c.status !== $view.dataset.status) renderCall(id);
});
window.cue.on('team:changed', () => { renderList(); renderTeamLive(); });
window.cue.on('auth:changed', async () => {
  if (typeof tabMemo !== 'undefined') tabMemo.clear();
  const was = authState.user?.id || null;
  authState = await rawCall('auth:state');
  // Someone else signed in, or nobody is: drop the Ask chats (they can quote the last person's calls).
  if ((authState.user?.id || null) !== was && typeof askReset === 'function') askReset();
  viewAsCheckAccount(); loadTeamEmails(); renderAccount(); renderNav(); renderTeamLive(); renderFolders(); presetsChanged(); renderView(); });
window.cue.on('computers:changed', () => { if (route.view === 'settings' || route.view === 'admin') renderView(); });
window.cue.on('monitor:event', (e) => onMonitorEvent(e));
window.cue.on('settings:changed', (s) => { applyTheme(s.theme); if (route.view === 'settings') renderSettings(); });
window.cue.on('live:notes', (n) => { const el = document.getElementById('live-ai-notes'); if (el && n?.text) el.replaceChildren(h('div', { html: renderMd(n.text) })); });
window.cue.on('calendar:changed', () => { if (route.view === 'settings' || route.view === 'admin') renderView(); });
let lastUpdateStatus = null;
window.cue.on('update:changed', (st) => { if (route.view === 'settings' && st.status !== lastUpdateStatus) renderSettings(); lastUpdateStatus = st.status; });
// The preset preview's control bar: step through the stages of a call.
let previewBar = null;
function drawPreviewBar(info) {
  if (!info) { previewBar?.remove(); previewBar = null; return; }
  const bar = h('div', { class: 'preview-bar' },
    h('div', { class: 'pv-top' },
      h('span', { class: 'pv-dot' }),
      h('span', { class: 'grow' }, h('b', {}, `Preview · ${info.presetName}`), h('span', {}, `${info.step + 1}/${info.steps.length} · ${info.steps[info.step]}`)),
      h('button', { class: 'icon-btn', title: 'Back', 'aria-label': 'Back', html: ICON.back, onclick: () => call('preview:go', -1) }),
      h('button', { class: 'icon-btn', title: info.paused ? 'Play' : 'Pause', 'aria-label': info.paused ? 'Play' : 'Pause', html: info.paused ? ICON.play : ICON.pause, onclick: () => call('preview:pause') }),
      h('button', { class: 'icon-btn', title: 'Next', 'aria-label': 'Next', html: ICON.next, onclick: () => call('preview:go', 1) }),
      h('button', { class: 'icon-btn', title: 'End preview', 'aria-label': 'End preview', html: ICON.x, onclick: () => call('preview:stop') })),
    h('div', { class: 'pv-steps' }, info.steps.map((label, i) => h('button', { class: `pv-step ${i === info.step ? 'on' : i < info.step ? 'past' : ''}`, title: label, onclick: () => call('preview:to', i) }))));
  if (previewBar) previewBar.replaceWith(bar); else document.body.append(bar);
  previewBar = bar;
}
window.cue.on('preview:changed', drawPreviewBar);
window.cue.on('wins:changed', () => { if (route.view === 'wins') renderWins(); });

window.cue.on('live:state', (st) => {
  if (st?.preview) return; // the preset preview only drives the call card
  const wasLive = liveState?.mode === 'live';
  liveState = st;
  if (viewAs && !wasLive && st?.mode === 'live') exitViewAs(); // a call starting on this computer: back to your own Cue
  renderStart();
  if (route.view === 'live') renderLive(false);
  if (wasLive !== (st.mode === 'live')) renderList();
});

// Cmd/Ctrl+K: search every call (titles, people, notes and transcripts), like Granola.
document.addEventListener('keydown', (e) => {
  if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'k') return;
  e.preventDefault();
  const focusSearch = () => { const box = $view.querySelector('.tab-tools .search'); if (box) { box.focus(); box.select(); return true; } return false; };
  if (route.view === 'home' && focusSearch()) return;
  go({ view: 'home' });
  let tries = 0;
  const t = setInterval(() => { if (focusSearch() || ++tries > 40) clearInterval(t); }, 50);
});

// Start once every script on the page (app.js, team.js) has run.
function applyTheme(t) { document.documentElement.dataset.theme = ['light', 'dark', 'synapse'].includes(t) ? t : 'light'; }
window.addEventListener('DOMContentLoaded', async () => {
  call('settings:get').then((s) => applyTheme(s.theme));
  info = await call('app:info');
  document.body.classList.toggle('win', info.platform === 'win32'); // Windows: its window buttons sit over the top-right corner
  authState = await call('auth:state');
  loadTeamEmails();
  renderAccount();
  renderTeamLive();
  renderFolders();
  liveState = await call('call:state');
  if (!routedByMain) go(liveState.mode === 'live' ? { view: 'live' } : { view: 'home' });
  renderStart();
});
