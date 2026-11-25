// Notes / Companies / People / Files tabs, person and company pages, space
// pages, and files on a call. Loaded after app.js and team.js and uses their
// helpers (h, call, go, …).

// ---- company logos (from their website icon) ----
const logoCache = new Map(); // domain -> data URL | null
const logoWaiters = new Map(); // domain -> elements waiting for it
let logoTimer = null;
function companyLogo(domain, name, size = 26) {
  const el = h('span', { class: 'ent-ico', style: `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.45)}px` }, (name || domain || '?')[0].toUpperCase());
  if (!domain) return el;
  const d = String(domain).toLowerCase();
  const fill = (url) => { if (url) { el.classList.add('has-logo'); el.replaceChildren(h('img', { src: url, alt: '', draggable: 'false' })); } };
  if (logoCache.has(d)) { fill(logoCache.get(d)); return el; }
  if (!logoWaiters.has(d)) logoWaiters.set(d, []);
  logoWaiters.get(d).push(fill);
  clearTimeout(logoTimer);
  logoTimer = setTimeout(async () => {
    const want = [...logoWaiters.keys()];
    const waiting = new Map(logoWaiters); logoWaiters.clear();
    const got = await call('logos:get', want);
    for (const dom of want) { logoCache.set(dom, got[dom] || null); for (const f of waiting.get(dom) || []) f(got[dom] || null); }
  }, 30);
  return el;
}

const TABS = [['home', 'Notes', 'notesTab'], ['companies', 'Companies', 'companyTab'], ['people', 'People', 'personTab'], ['files', 'Files', 'filesTab']];

function tabBar(active) {
  return h('div', { class: 'tabs' }, TABS.map(([view, label, icon]) => h('button', { class: `tab ${active === view ? 'on' : ''}`, onclick: (e) => {
    // Show the new tab as chosen right away, even if its page takes a moment to load.
    for (const b of e.currentTarget.parentElement.children) b.classList.toggle('on', b === e.currentTarget);
    go({ view });
  } },
    h('span', { class: 'tab-ico', html: ICON[icon] }), label)));
}

const ago = (ts) => {
  if (!ts) return '';
  const d = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 30 ? `${d} days ago` : d < 365 ? `${Math.floor(d / 30)} mo ago` : `${Math.floor(d / 365)} yr ago`;
};
const fmtSize = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n > 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`);
const searchBox = (placeholder, onInput) => h('input', { class: 'input search', type: 'search', placeholder, oninput: (e) => onInput(e.target.value.trim().toLowerCase()) });
const match = (q, ...fields) => !q || fields.some((f) => String(f || '').toLowerCase().includes(q));

// A list of calls, grouped by day; rows can be dragged onto folders.
// Who a call was with: the first outside company (for its logo), and names.
const PERSONAL = /^(gmail|googlemail|yahoo|hotmail|outlook|live|msn|icloud|me|mac|aol|proton|protonmail|comcast|att|verizon|ymail)\./i;
let companyNames = new Map(); // domain -> display name (from the Companies list)
async function loadCompanyNames() {
  if (companyNames.size || !authState.user) return;
  try { companyNames = new Map((await call('companies:list')).map((c) => [c.domain, c.name])); } catch {}
}
function callWho(c) {
  const outside = (c.attendees || []).filter((a) => a.email && !isOurs(a.email));
  const domain = outside.map((a) => a.email.split('@')[1].toLowerCase()).find((d) => !PERSONAL.test(d)) || null;
  const company = domain ? (companyNames.get(domain) || domain.split('.')[0].replace(/^./, (x) => x.toUpperCase())) : null;
  const people = outside.map((a) => a.name || a.email.split('@')[0]).filter(Boolean);
  return { domain, company, people };
}
// Really on a call now: your current call, or a teammate's that started in the
// last 6 hours. Your own old "live" calls were cut off by a quit or crash.
function isLiveNow(c) {
  if (c.status !== 'live' && c.status !== 'writing') return false;
  if (c.status === 'writing') return true;
  if (typeof liveState !== 'undefined' && liveState?.mode === 'live' && liveState.callId === c.id) return true;
  return c.mine === false && Date.now() - c.startedAt < 6 * 3600_000;
}

function callAvatar(c, who) {
  if (who.domain) return companyLogo(who.domain, who.company, 30);
  const letter = (who.people[0] || '').trim()[0];
  return h('span', { class: 'ent-ico neutral', style: 'width:30px;height:30px' }, letter ? letter.toUpperCase() : h('span', { html: ICON.calls, style: 'display:inline-grid;width:14px;height:14px' }));
}

function callRows(meetings, { showOwner = true } = {}) {
  const out = [];
  let lastDay = null;
  for (const c of meetings) {
    const day = dayLabel(c.startedAt);
    if (day !== lastDay) { out.push(h('div', { class: 'day-label' }, day)); lastDay = day; }
    const who = callWho(c);
    const sub = [who.company && !c.title?.toLowerCase().includes(who.company.toLowerCase()) ? who.company : null,
      who.people.length ? who.people.slice(0, 2).join(', ') + (who.people.length > 2 ? ` +${who.people.length - 2}` : '') : null,
      showOwner && c.mine === false && c.owner ? c.owner.split(' ')[0] : null].filter(Boolean).join(' · ');
    const liveNow = isLiveNow(c);
    const row = h('button', { class: `call-item ${selectedCalls.has(c.id) ? 'selected' : ''}`, 'data-call': c.id,
      onclick: (e) => onCallClick(e, c.id, () => go(c.status === 'live' && c.mine === false ? { view: 'monitor', id: c.id } : { view: 'call', id: c.id })),
      oncontextmenu: (e) => callContextMenu(e, c) },
      // The icon turns into a select box on hover (or once anything is selected).
      h('span', { class: 'ci-lead' }, callAvatar(c, who),
        h('span', { class: 'ci-check', role: 'checkbox', title: 'Select', 'aria-label': 'Select', html: ICON.check,
          onmousedown: (e) => e.stopPropagation(),
          onclick: (e) => { e.stopPropagation(); e.preventDefault(); toggleSelected(c.id); } })),
      h('span', { class: 'ci-main' },
        h('span', { class: 'ci-title' }, liveNow ? h('i', { class: 'live-dot' }) : null, c.outcome === 'won' || c.outcome === 'lost' ? h('span', { class: `oc-pill ${c.outcome}` }, c.outcome === 'won' ? 'Won' : 'Lost') : null, c.visibility === 'private' ? h('span', { class: 'lock inline', html: ICON.lock }) : null, c.title || 'Untitled call'),
        sub ? h('span', { class: 'ci-sub' }, sub) : null),
      h('span', { class: 'ci-time' }, timeOf(c.startedAt)),
      rowActions(c));
    if (authState.user && !isClientUser()) makeDraggable(row, 'call', c.id);
    out.push(row);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Notes tab
// ---------------------------------------------------------------------------

// The 90-second product demo, on Home until it's been watched or hidden.
function demoCard() {
  if (!authState.user) return null;
  let hidden = false;
  try { hidden = localStorage.getItem('cue-demo-hidden') === '1'; } catch {}
  if (hidden) return null;
  const hide = (e) => { e?.stopPropagation(); try { localStorage.setItem('cue-demo-hidden', '1'); } catch {} card.remove(); };
  const card = h('div', { class: 'demo-card', role: 'button', tabindex: '0', onclick: () => playDemo(), onkeydown: (e) => { if (e.key === 'Enter') playDemo(); } },
    h('span', { class: 'demo-thumb' }, h('img', { src: 'assets/demo-poster.jpg', alt: '' }), h('span', { class: 'demo-play' })),
    h('span', { class: 'grow' }, h('b', {}, 'Watch how Cue works'), h('span', {}, 'A minute and a half: the live coach, notes, the Live tab, What wins and more.')),
    h('button', { class: 'link-btn', onclick: hide }, 'Hide'));
  return card;
}

async function playDemo() {
  const url = await call('demo:url');
  if (!url) { alert('Couldn’t load the demo. Check you’re signed in and online.'); return; }
  try { localStorage.setItem('cue-demo-hidden', '1'); } catch {}
  // Plays inside the Cue window: full-screen video goes black in the desktop app.
  const video = h('video', { src: url, controls: true, autoplay: true, playsinline: true, poster: 'assets/demo-poster.jpg', controlsList: 'nofullscreen noremoteplayback nodownload', disablePictureInPicture: true,
    ondblclick: (e) => e.preventDefault() });
  video.addEventListener('fullscreenchange', () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); });
  const close = () => { video.pause(); shade.remove(); removeEventListener('keydown', esc); };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  const shade = h('div', { class: 'demo-shade', onclick: (e) => { if (e.target === shade) close(); } },
    h('div', { class: 'demo-player' }, video, h('button', { class: 'demo-close', 'aria-label': 'Close', onclick: close }, '×')));
  document.body.append(shade);
  addEventListener('keydown', esc);
}

// Teammates on a call right now: watch the transcript and checklist live.
async function liveNowSection() {
  if (!authState.user) return null;
  const list = await call('team:live').catch(() => []);
  if (!list?.length) return null;
  return h('div', { class: 'live-now' },
    h('div', { class: 'day-label' }, 'Live now'),
    list.map((c) => h('button', { class: 'cu-row now', onclick: () => go({ view: 'monitor', id: c.id }) },
      h('span', { class: 'cu-time' }, h('i', { class: 'live-dot' }), ` ${fmtDur(Date.now() - c.startedAt)}`),
      h('span', { class: 'grow' }, h('b', {}, c.title || 'Call'), h('span', {}, [c.owner, c.presetName].filter(Boolean).join(' · '))),
      h('span', { class: 'btn primary cu-go' }, 'Watch live'))));
}

// Today's and tomorrow's meetings, with the template Cue would use.
async function comingUp() {
  const list = await call('calendar:upcoming');
  if (!list.length) return null;
  const now = Date.now();
  const people = (e) => (e.attendees || []).filter((a) => !isOurs(a.email)).map((a) => a.name || (a.email || '').split('@')[0]).filter(Boolean);
  return h('div', { class: 'coming-up' },
    h('div', { class: 'day-label' }, 'Coming up'),
    list.slice(0, 6).map((e) => {
      const live = e.start - 5 * 60_000 <= now && now <= e.end;
      const who = people(e);
      return h('div', { class: `cu-row ${live ? 'now' : ''}` },
        h('span', { class: 'cu-time' }, live ? 'Now' : `${dayLabel(e.start) === 'Today' ? '' : `${dayLabel(e.start)} `}${timeOf(e.start)}`),
        h('span', { class: 'grow' }, h('b', {}, e.title || 'Meeting'), who.length ? h('span', {}, who.slice(0, 3).join(', ') + (who.length > 3 ? ` +${who.length - 3}` : '')) : null),
        e.presetName ? h('span', { class: 'cu-tpl', title: 'Template Cue will use' }, e.presetName.replace(/^Notes:\s*/, '')) : null,
        h('button', { class: `btn cu-go ${live ? 'primary' : ''}`, onclick: async () => { await call('call:start', { presetId: e.presetId, calendarEvent: e }); go({ view: 'live' }); } }, 'Start'));
    }));
}

async function renderNotesTab() {
  const fresh = pageTicket();
  const [all] = await Promise.all([call('calls:list'), loadCompanyNames()]);
  const list = h('div', { class: 'folder-list' });
  let searchSeq = 0;
  // Snippets come back with <b>…</b> around matches; everything else is escaped.
  const snippetEl = (s) => h('span', { class: 'snippet', html: esc(String(s).replace(/[#*_`>]+/g, '').replace(/\s*\n\s*-?\s*/g, ' · ').replace(/^ · /, '')).replace(/&lt;b&gt;/g, '<mark>').replace(/&lt;\/b&gt;/g, '</mark>') });
  const draw = (q) => {
    const byTitle = all.filter((c) => match(q, c.title, c.owner, c.presetName));
    list.replaceChildren(...(byTitle.length ? callRows(byTitle) : [h('div', { class: 'placeholder' }, q ? 'Searching notes and transcripts…' : 'No calls yet.')]));
    if (!q || q.length < 3 || !authState.user) { if (q && !byTitle.length) list.replaceChildren(h('div', { class: 'placeholder' }, 'No calls match.')); return; }
    const seq = ++searchSeq;
    setTimeout(async () => {
      if (seq !== searchSeq) return;
      const hits = (await call('calls:search', q)).filter((m) => !byTitle.some((c) => c.id === m.id));
      if (seq !== searchSeq) return;
      const rows = byTitle.length ? callRows(byTitle) : [];
      if (hits.length) {
        rows.push(h('div', { class: 'group', style: 'padding-left:0' }, `Mentioned in ${hits.length} call${hits.length === 1 ? '' : 's'}`));
        for (const m of hits) rows.push(h('button', { class: 'folder-call', onclick: () => go({ view: 'call', id: m.id }) },
          h('span', { class: 'grow' }, h('b', {}, m.title || 'Untitled call'),
            h('span', {}, [m.owner, `${dayLabel(m.startedAt)} ${timeOf(m.startedAt)}`].filter(Boolean).join(' · ')),
            m.snippet ? snippetEl(m.snippet) : null)));
      }
      list.replaceChildren(...(rows.length ? rows : [h('div', { class: 'placeholder' }, 'No calls match.')]));
    }, 250);
  };
  draw('');
  const client = isClientUser();
  const [nudge, soon, liveNow] = client ? [null, null, null] : await Promise.all([WEB ? null : calendarNudge(), comingUp(), liveNowSection()]);
  if (!fresh()) return; // the user moved on while this loaded
  $view.replaceChildren(client ? h('h1', { class: 'page' }, 'Your calls') : tabBar('home'), client ? null : demoCard(), liveNow, nudge, soon,
    h('div', { class: 'row tab-tools' }, searchBox('Search titles, people, notes and transcripts', draw)),
    list);
}

// ---------------------------------------------------------------------------
// Companies
// ---------------------------------------------------------------------------

async function renderCompanies() {
  const fresh = pageTicket();
  if (!authState.user) return $view.replaceChildren(tabBar('companies'), h('div', { class: 'placeholder' }, 'Sign in to see companies.'));
  const all = (await call('companies:list')).sort((a, b) => new Date(b.last_met) - new Date(a.last_met));
  const body = h('tbody');
  const draw = (q) => body.replaceChildren(...all.filter((c) => match(q, c.name, c.domain)).map((c) => h('tr', { onclick: () => go({ view: 'company', id: c.domain }) },
    h('td', {}, h('div', { class: 'ent' }, companyLogo(c.domain, c.name), h('span', {}, h('b', {}, c.name), h('small', {}, c.domain)))),
    h('td', { class: 'num' }, c.people), h('td', { class: 'num' }, c.meetings), h('td', { class: 'dim' }, ago(c.last_met)))));
  draw('');
  const tidy = h('button', { class: 'link-btn', onclick: async () => {
    tidy.textContent = 'Naming…'; tidy.disabled = true;
    const r = await call('companies:aiNames');
    if (!r.ok) alert(r.error);
    renderCompanies();
  } }, h('span', { html: ICON.sparkle, style: 'display:inline-grid;width:13px;height:13px;vertical-align:-2px;margin-right:4px' }), 'Tidy names with AI');
  if (!fresh()) return;
  $view.replaceChildren(tabBar('companies'),
    h('div', { class: 'row tab-tools' }, searchBox('Search companies', draw), h('span', { class: 'saved' }, `${all.length} companies`), tidy),
    h('table', { class: 'ent-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Company'), h('th', { class: 'num' }, 'People'), h('th', { class: 'num' }, 'Meetings'), h('th', {}, 'Last met'))), body));
}

async function renderCompany(domain) {
  const fresh = pageTicket();
  $view.replaceChildren(h('div', { class: 'placeholder' }, h('span', { class: 'spin' }), 'Loading…'));
  const c = await call('companies:get', domain);
  if (!fresh()) return;
  if (!c) return go({ view: 'companies' });
  const saveName = debounce((v) => call('companies:update', { domain, patch: { name: v } }), 500);
  const saveNotes = debounce((v) => call('companies:update', { domain, patch: { notes: v } }), 500);
  $view.replaceChildren(
    h('button', { class: 'link-btn back', onclick: () => go({ view: 'companies' }) }, '‹ Companies'),
    h('div', { class: 'folder-head' }, companyLogo(c.domain, c.name, 44),
      h('input', { class: 'title-input', value: c.name || '', placeholder: 'Company name', oninput: (e) => saveName(e.target.value) })),
    h('div', { class: 'meta', style: 'margin:-10px 0 18px' }, h('span', {}, c.domain), h('span', {}, `${c.meetings || 0} meetings`), c.last_met ? h('span', {}, `last met ${ago(c.last_met)}`) : null),
    briefSection('company', domain, c.aiSummary, c.aiSummaryAt),
    h('div', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', {}, 'People')),
      h('div', { class: 'people-chips' }, (c.people || []).map((p) => h('button', { class: 'person-chip', onclick: () => go({ view: 'person', id: p.email }) },
        h('span', { class: 'avatar' }, (p.name || p.email)[0].toUpperCase()), h('span', {}, h('b', {}, p.name), h('small', {}, `${p.meetings} meeting${p.meetings === 1 ? '' : 's'}`)))))),
    h('div', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', {}, 'Team notes')),
      h('textarea', { class: 'notes', placeholder: 'Anything the team should know about them.', value: c.notes || '', oninput: (e) => saveNotes(e.target.value) })),
    h('div', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', {}, 'Meetings')), h('div', { class: 'folder-list' }, callRows(c.meetings || []))));
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

async function renderPeople() {
  const fresh = pageTicket();
  if (!authState.user) return $view.replaceChildren(tabBar('people'), h('div', { class: 'placeholder' }, 'Sign in to see people.'));
  const all = (await call('people:list')).sort((a, b) => new Date(b.last_met) - new Date(a.last_met));
  const body = h('tbody');
  const draw = (q) => body.replaceChildren(...all.filter((p) => match(q, p.name, p.email, p.company)).map((p) => h('tr', { onclick: () => go({ view: 'person', id: p.email }) },
    h('td', {}, h('div', { class: 'ent' }, h('span', { class: 'avatar' }, (p.name || p.email)[0].toUpperCase()), h('span', {}, h('b', {}, p.name), p.title ? h('small', {}, p.title) : null))),
    h('td', {}, p.company ? h('span', { class: 'co-cell', onclick: (e) => { e.stopPropagation(); go({ view: 'company', id: p.domain }); } }, companyLogo(p.domain, p.company, 18), h('span', { class: 'link-like' }, p.company)) : h('span', { class: 'dim' }, '—')),
    h('td', { class: 'dim' }, p.email), h('td', { class: 'num' }, p.meetings), h('td', { class: 'dim' }, ago(p.last_met)))));
  draw('');
  if (!fresh()) return;
  $view.replaceChildren(tabBar('people'),
    h('div', { class: 'row tab-tools' }, searchBox('Search people, emails or companies', draw), h('span', { class: 'saved' }, `${all.length} people`)),
    h('table', { class: 'ent-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Person'), h('th', {}, 'Company'), h('th', {}, 'Email'), h('th', { class: 'num' }, 'Meetings'), h('th', {}, 'Last met'))), body));
}

async function renderPerson(email) {
  const fresh = pageTicket();
  $view.replaceChildren(h('div', { class: 'placeholder' }, h('span', { class: 'spin' }), 'Loading…'));
  const p = await call('people:get', email);
  if (!fresh()) return;
  if (!p) return go({ view: 'people' });
  const save = (patch) => call('people:update', { email, patch });
  const saveName = debounce((v) => save({ name: v }), 500);
  const saveTitle = debounce((v) => save({ title: v }), 500);
  const saveNotes = debounce((v) => save({ notes: v }), 500);
  $view.replaceChildren(
    h('button', { class: 'link-btn back', onclick: () => go({ view: 'people' }) }, '‹ People'),
    h('div', { class: 'folder-head' }, h('span', { class: 'avatar big' }, (p.name || email)[0].toUpperCase()),
      h('input', { class: 'title-input', value: p.name || '', placeholder: 'Name', oninput: (e) => saveName(e.target.value) })),
    h('div', { class: 'meta', style: 'margin:-10px 0 18px' },
      h('input', { class: 'inline-input', value: p.title || '', placeholder: 'Add a title (e.g. Owner)', oninput: (e) => saveTitle(e.target.value) }),
      p.company ? h('button', { class: 'chip co-chip', onclick: () => go({ view: 'company', id: p.domain }) }, companyLogo(p.domain, p.company, 14), p.company) : null,
      h('span', {}, email), h('span', {}, `${p.meetings || 0} meetings`), p.last_met ? h('span', {}, `last met ${ago(p.last_met)}`) : null),
    briefSection('person', email, p.aiSummary, p.aiSummaryAt),
    h('div', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', {}, 'Team notes')),
      h('textarea', { class: 'notes', placeholder: 'Anything to remember for the next call.', value: p.notes || '', oninput: (e) => saveNotes(e.target.value) })),
    h('div', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', {}, 'Meetings')), h('div', { class: 'folder-list' }, callRows(p.meetings || []))));
}

// "What we know" written by Claude from their meetings.
function briefSection(kind, id, text, at) {
  const body = h('div', { class: 'md brief' }, text ? h('div', { html: renderMd(text) }) : h('div', { class: 'placeholder' }, 'No brief yet. Claude can write one from the notes of their meetings.'));
  const btn = h('button', { class: 'link-btn', onclick: async () => {
    btn.textContent = 'Writing…'; btn.disabled = true;
    const r = await call('entity:summarize', { kind, id });
    btn.disabled = false; btn.textContent = 'Refresh';
    if (!r.ok) { alert(r.error); return; }
    body.replaceChildren(h('div', { html: renderMd(r.text) }));
    stamp.textContent = 'updated just now';
  } }, h('span', { html: ICON.sparkle, style: 'display:inline-grid;width:13px;height:13px;vertical-align:-2px;margin-right:4px' }), text ? 'Refresh' : 'Write brief');
  const stamp = h('span', { class: 'saved' }, at ? `updated ${ago(at)}` : '');
  return h('div', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', {}, 'What we know'), stamp, btn), body);
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

function fileRows(files, { showCall = true, onChange } = {}) {
  return files.map((f) => h('div', { class: 'file-row' },
    h('span', { class: 'file-ico', html: ICON.filesTab }),
    h('button', { class: 'grow file-name', onclick: async () => { const r = await call('files:open', f.id); if (!r.ok) alert(r.error); } }, h('b', {}, f.name),
      h('span', {}, [showCall && f.meetingTitle ? f.meetingTitle : null, f.uploader, fmtSize(f.size), ago(f.createdAt)].filter(Boolean).join(' · '))),
    h('button', { class: 'link-btn danger', onclick: async () => { if (!confirm(`Delete ${f.name}?`)) return; const r = await call('files:delete', f.id); if (!r.ok) alert(r.error); onChange && onChange(); } }, 'Delete')));
}

async function renderFiles() {
  const fresh = pageTicket();
  if (!authState.user) return $view.replaceChildren(tabBar('files'), h('div', { class: 'placeholder' }, 'Sign in to see files.'));
  const all = await call('files:list');
  const list = h('div', { class: 'file-list' });
  const draw = (q) => {
    const shown = all.filter((f) => match(q, f.name, f.meetingTitle, f.uploader));
    list.replaceChildren(...(shown.length ? fileRows(shown, { onChange: renderFiles }) : [h('div', { class: 'placeholder' }, all.length ? 'No files match.' : 'No files yet. Attach files to a call (open the call, then "Attach files" or drop them on it).')]));
  };
  draw('');
  if (!fresh()) return;
  $view.replaceChildren(tabBar('files'), h('div', { class: 'row tab-tools' }, searchBox('Search files', draw), h('span', { class: 'saved' }, `${all.length} files`)), list);
}

// Files section on a call page (attach button + drop anywhere on the page).
function callFilesSection(c) {
  if (!authState.user) return null;
  const list = h('div', { class: 'file-list' });
  const load = async () => {
    const files = await call('files:list', c.id);
    list.replaceChildren(...(files.length ? fileRows(files, { showCall: false, onChange: load }) : [h('div', { class: 'placeholder', style: 'font-size:13px' }, 'Drop files here or attach them: decks, contracts, screenshots (up to 50 MB each).')]));
  };
  load();
  const attach = h('button', { class: 'link-btn', onclick: async () => {
    attach.textContent = 'Uploading…';
    const r = await call('files:attach', c.id);
    attach.textContent = 'Attach files';
    if (!r.ok) alert(r.error); load();
  } }, 'Attach files');
  const sec = h('div', { class: 'section files-drop' }, h('div', { class: 'section-head' }, h('h2', {}, 'Files'), attach), list);
  sec.addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); sec.classList.add('drop'); } });
  sec.addEventListener('dragleave', () => sec.classList.remove('drop'));
  sec.addEventListener('drop', async (e) => {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault(); sec.classList.remove('drop');
    const paths = [...e.dataTransfer.files].map((f) => window.cue.pathForFile(f)).filter(Boolean);
    attach.textContent = 'Uploading…';
    const r = await call('files:drop', { meetingId: c.id, paths });
    attach.textContent = 'Attach files';
    if (!r.ok) alert(r.error); load();
  });
  return sec;
}

// ---------------------------------------------------------------------------
// Spaces
// ---------------------------------------------------------------------------

async function renderSpace(id) {
  const fresh = pageTicket();
  if (!spacesCache.length && id !== 'mine' && id !== 'team' && id !== 'clients') spacesCache = await call('spaces:list');
  if (!fresh()) return;
  const sp = id === 'mine' ? { id, name: 'My notes' } : id === 'team' ? { id, name: 'Team' } : id === 'clients' ? { id, name: 'Clients' } : spacesCache.find((x) => x.id === id);
  if (!sp) return go({ view: 'home' });
  const folders = typeof topFolders === 'function' ? topFolders(id) : [];
  const meetings = id === 'mine' || id === 'team' || id === 'clients' ? await call('spaces:meetings', id) : [];
  const sub = id === 'mine' ? 'Only you can see these: calls you recorded and your private folders.' : id === 'team' ? 'Shared with the whole team.' : id === 'clients' ? 'Calls recorded by people at your clients with Cue for clients. Each client only sees their own.' : 'A shared space for its own folders.';
  if (!fresh()) return;
  $view.replaceChildren(
    h('div', { class: 'folder-head' },
      h('span', { class: 'big-icon' }, id === 'mine' ? h('span', { class: 'lock-ico big', html: ICON.lock }) : id === 'team' ? h('img', { src: 'assets/logo.svg', style: 'width:30px;height:30px;border-radius:8px' }) : (cueIcon(id === 'clients' ? 'handshake' : sp.icon, 30) || h('span', { class: 'space-letter big' }, sp.name[0].toUpperCase()))),
      h('h1', { class: 'page', style: 'margin:0' }, sp.name)),
    h('p', { class: 'sub', style: 'margin-top:-8px' }, sub),
    folders.length ? h('div', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', {}, 'Folders')),
      h('div', { class: 'folder-cards' }, folders.map((f) => h('button', { class: 'folder-card', onclick: () => go({ view: 'folder', id: f.id }) }, folderIcon(f, 18), h('span', { class: 'grow' }, f.name), f.count ? h('span', { class: 'n' }, f.count) : null)))) : null,
    id === 'mine' || id === 'team' ? h('div', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', {}, 'Calls')),
      meetings.length ? h('div', { class: 'folder-list' }, callRows(meetings, { showOwner: id === 'team' })) : h('div', { class: 'placeholder' }, 'Nothing here yet.')) : null,
    !folders.length && id !== 'mine' && id !== 'team' ? h('div', { class: 'placeholder' }, 'No folders yet. Use ⋯ → New folder next to this space in the sidebar, or drag folders onto it.') : null);
}
