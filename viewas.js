// View as (Admin): see Cue the way a teammate or a client sees it.
//
// It only changes this window. You stay signed in as yourself, so anything that would
// change something (edit notes, move a call, save a preset, start a call, Ask…) is
// blocked, and every list is cut down to what that person can see:
//   - a teammate sees the team's calls and folders: your private ones are hidden, and
//     theirs can't be shown (nobody but them can read their private calls);
//   - a client sees only the calls they recorded themselves, and none of the team pages.
// Leaves by itself when you sign in as someone else, a call starts, or Cue opens a page.

// Reads that pass through (then get filtered below). Anything not here or in VIEW_LOCAL
// is refused while previewing.
const VIEW_READS = new Set([
  'app:info', 'auth:state', 'calendar:status', 'calendar:upcoming', 'call:state', 'call:liveNotes', 'call:transcript',
  'calls:list', 'calls:get', 'calls:archived', 'calls:search', 'calls:myPrivate', 'clients:list', 'coaching:get',
  'companies:list', 'companies:get', 'context:status', 'teamcal:status', 'demo:url', 'devices:list', 'computers:list',
  'files:list', 'files:open', 'folders:list', 'folders:meetings', 'keys:state', 'logos:get', 'notes:templates',
  'people:list', 'people:get', 'presets:get', 'settings:get', 'share:get', 'share:base', 'sim:scripts', 'spaces:list',
  'spaces:meetings', 'team:emails', 'team:list', 'team:live', 'trash:list', 'update:state', 'wins:get', 'workspace:get',
]);
// Window chrome on this computer only: nothing shared changes.
const VIEW_LOCAL = new Set([
  'overlay:collapse', 'overlay:resize', 'overlay:open-main', 'overlay:hide', 'shell:open', 'ready:dismiss', 'call:dismiss',
  'app:openAxSettings', 'app:openScreenSettings', 'update:check', 'update:mac', 'monitor:close',
]);

let viewAsPrivate = new Set(); // your own private calls: never shown while previewing
let viewAsPrivBy = { email: new Map(), domain: new Map() }; // how many of those each person / company was on
let viewAsBar = null;
let viewAsAdminId = null;

const viewList = (v) => (Array.isArray(v) ? v : []);
const viewIsClient = () => viewAs?.role === 'client';
// Could the person being previewed open this call?
function viewCanSee(c) {
  if (!c || !viewAs) return false;
  if (viewIsClient()) return c.ownerId === viewAs.id && !c.archivedAt;
  if (c.visibility === 'private' || viewAsPrivate.has(c.id)) return false;
  // A call recorded on this computer that hasn't reached the cloud yet is only on your Mac.
  if (Object.prototype.hasOwnProperty.call(c, 'synced')) return false;
  return true;
}
const viewRow = (c) => ({ ...c, mine: !!viewAs && c.ownerId === viewAs.id });
// Index rows (people or companies) minus the calls only you can see.
function viewLessPrivate(rows, key) {
  const by = key === 'email' ? viewAsPrivBy.email : viewAsPrivBy.domain;
  return viewList(rows).map((r) => {
    const less = by.get(String(r && r[key] || '').toLowerCase()) || 0;
    return less && typeof r.meetings === 'number' ? { ...r, meetings: r.meetings - less } : r;
  }).filter((r) => r && !(typeof r.meetings === 'number' && r.meetings <= 0));
}
const viewCalls = (rows) => viewList(rows).filter(viewCanSee).map(viewRow);

async function viewAsCall(ch, arg) {
  const p = viewAs;
  if (VIEW_LOCAL.has(ch)) return rawCall(ch, arg);
  if (!VIEW_READS.has(ch)) return { ok: false, error: `You're viewing Cue as ${p.name}, so nothing can be changed. Exit View as first.` };
  const client = viewIsClient();
  switch (ch) {
    case 'calls:list': return viewCalls(await rawCall(client ? 'spaces:meetings' : 'calls:list', client ? 'clients' : undefined));
    case 'calls:archived': return client ? [] : viewCalls(await rawCall(ch, arg));
    case 'calls:get': { const c = await rawCall(ch, arg); return viewCanSee(c) ? viewRow(c) : null; }
    case 'calls:search': return client ? [] : viewList(await rawCall(ch, arg)).filter((r) => r && !viewAsPrivate.has(r.id));
    case 'folders:list': return client ? [] : viewList(await rawCall(ch, arg)).filter((f) => !f.private).map((f) => ({ ...f, mine: f.ownerId === p.id }));
    case 'folders:meetings': return client ? [] : viewCalls(await rawCall(ch, arg));
    case 'spaces:list': return client ? [] : rawCall(ch, arg);
    case 'spaces:meetings':
      if (client) return [];
      // "My notes" is theirs: only the calls they own that you can see (not their private ones).
      if (arg === 'mine') return viewCalls(await rawCall(ch, 'team')).filter((c) => c.ownerId === p.id);
      return viewCalls(await rawCall(ch, arg));
    case 'people:get': case 'companies:get': {
      if (client) return null;
      const r = await rawCall(ch, arg);
      if (!r || typeof r !== 'object') return r;
      const out = Array.isArray(r.meetings) ? { ...r, meetings: r.meetings.filter((m) => m && !viewAsPrivate.has(m.id)) } : { ...r };
      if (Array.isArray(r.people)) out.people = viewLessPrivate(r.people, 'email');
      return out;
    }
    // People and companies met only on your private calls aren't theirs to see.
    case 'people:list': return client ? [] : viewLessPrivate(await rawCall(ch, arg), 'email');
    case 'companies:list': return client ? [] : viewLessPrivate(await rawCall(ch, arg), 'domain');
    case 'files:list': return client ? [] : viewList(await rawCall(ch, arg)).filter((f) => f && !(f.meetingId && viewAsPrivate.has(f.meetingId)));
    case 'wins:get': {
      if (client) return null;
      const w = await rawCall(ch, arg);
      return w && Array.isArray(w.rows) ? { ...w, rows: w.rows.filter((r) => r && !viewAsPrivate.has(r.id)) } : w;
    }
    case 'presets:get': case 'team:live': return client ? [] : rawCall(ch, arg);
    case 'coaching:get': case 'workspace:get': return client ? null : rawCall(ch, arg);
    case 'trash:list': case 'calendar:upcoming': return []; // theirs aren't readable from your account
    case 'calendar:status': { const st = await rawCall(ch, arg); return st && typeof st === 'object' ? { ...st, upcoming: [], events: 0 } : st; }
    case 'keys:state': { const k = await rawCall(ch, arg); return k && typeof k === 'object' ? { ...k, isAdmin: false } : k; }
    case 'auth:state': return rawCall(ch, arg); // the real account; the bar says who you're viewing as
    default: return rawCall(ch, arg);
  }
}

async function startViewAs(person) {
  if (!person?.id || authState.user?.role !== 'admin' || person.id === authState.user.id) return;
  if (liveState?.mode === 'live') return alert('Finish your call first: View as is off while a call is running on this computer.');
  activeNotepad?.flush?.();
  // Your private calls must be known before anything is shown, or they'd leak into the preview.
  const got = await rawCall('calls:myPrivate').catch(() => null);
  if (!got || got.ok === false || !Array.isArray(got.rows)) return alert('Couldn’t load your private calls, so View as can’t hide them. Check your connection and try again.');
  const priv = got.rows;
  // Companies are grouped by the company set on each person (or their email domain), as the
  // Companies list does it.
  const domainOf = new Map(viewList(await rawCall('people:list').catch(() => [])).map((r) => [String(r.email || '').toLowerCase(), String(r.domain || '').toLowerCase()]));
  viewAsPrivate = new Set(priv.map((p) => (typeof p === 'string' ? p : p && p.id)).filter(Boolean));
  viewAsPrivBy = { email: new Map(), domain: new Map() };
  for (const p of priv) {
    const emails = new Set((p && Array.isArray(p.emails) ? p.emails : []).filter((e) => !isOurs(e)));
    for (const e of emails) viewAsPrivBy.email.set(e, (viewAsPrivBy.email.get(e) || 0) + 1);
    for (const d of new Set([...emails].map((e) => domainOf.get(e) || e.split('@')[1]).filter(Boolean))) viewAsPrivBy.domain.set(d, (viewAsPrivBy.domain.get(d) || 0) + 1);
  }
  viewAsAdminId = authState.user.id;
  viewAs = { id: person.id, name: person.name || person.email, email: person.email, role: person.role === 'client' ? 'client' : person.role === 'admin' ? 'admin' : 'member', org: person.org || '' };
  viewAsRefresh({ view: 'home' });
}

function exitViewAs(redraw = true) {
  if (!viewAs) return;
  viewAs = null;
  viewAsPrivate = new Set();
  viewAsPrivBy = { email: new Map(), domain: new Map() };
  viewAsRefresh(redraw ? { view: 'admin' } : null);
}

// Caches filled during the preview (presets, tabs, the Live list) are dropped either way;
// only the page to land on is optional (a page Cue opens by itself navigates on its own).
function viewAsRefresh(r) {
  if (typeof tabMemo !== 'undefined') tabMemo.clear();
  presetsCache = null;
  drawViewAsBar();
  renderAccount();
  renderTeamLive();
  presetsChanged();
  if (r) go(r);
}

// While previewing, text fields and checkboxes on the page are read-only, so nothing typed
// can be saved later (debounce() also drops anything queued during a preview).
new MutationObserver(() => {
  if (!viewAs) return;
  $view.querySelectorAll('input:not(.search):not([type=search]):not([type=button]):not([readonly]), textarea:not([readonly]), [contenteditable="true"]').forEach((el) => {
    if (el.isContentEditable) el.contentEditable = 'false';
    else if (el.type === 'checkbox' || el.type === 'radio') el.disabled = true;
    else el.readOnly = true;
  });
}).observe($view, { childList: true, subtree: true });

function drawViewAsBar() {
  document.body.classList.toggle('viewing-as', !!viewAs);
  if (!viewAs) { viewAsBar?.remove(); viewAsBar = null; return; }
  const role = viewIsClient() ? `Client${viewAs.org ? ` at ${viewAs.org}` : ''}` : viewAs.role === 'admin' ? 'Admin' : 'Teammate';
  const note = viewIsClient() ? 'They only see calls they recorded themselves.' : 'Their private calls can’t be shown, and yours are hidden.';
  const bar = h('div', { class: 'viewas-bar', role: 'status' },
    h('span', { class: 'viewas-eye', html: lineIcon('M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z') }),
    h('span', { class: 'grow' }, h('b', {}, `Viewing as ${viewAs.name}`), h('span', { class: 'viewas-meta' }, ` · ${role} · Read-only. ${note}`)),
    h('button', { class: 'viewas-exit', onclick: () => exitViewAs() }, 'Exit'));
  if (viewAsBar) viewAsBar.replaceWith(bar); else document.getElementById('main').insertBefore(bar, document.getElementById('view'));
  viewAsBar = bar;
}

// A "View as" button for the Admin page rows (team members and client users).
function viewAsButton(person) {
  if (!person?.id || person.id === authState.user?.id || authState.user?.role !== 'admin') return null;
  return h('button', { class: 'link-btn', title: `See Cue the way ${person.name || person.email} sees it (read-only)`, onclick: () => startViewAs(person) }, 'View as');
}

// Leave the preview when the real account changes (sign out, someone else signs in).
function viewAsCheckAccount() {
  if (viewAs && authState.user?.id !== viewAsAdminId) exitViewAs(false);
}

// Admin → "See Cue as someone else": pick a teammate or a client, then View.
async function viewAsPanel() {
  const [team, clients] = await Promise.all([rawCall('team:list').catch(() => []), rawCall('clients:list').catch(() => ({ users: [] }))]);
  const orgName = (k) => (clients.orgs || []).find((o) => o.key === k)?.name || k || '';
  const people = [
    ...viewList(team).filter((m) => m.id && m.id !== authState.user?.id).map((m) => ({ id: m.id, name: m.name || m.email, email: m.email, role: m.role, label: `${m.name || m.email} · ${m.role === 'admin' ? 'Admin' : 'Teammate'}` })),
    ...viewList(clients.users).filter((u) => u.id).map((u) => ({ id: u.id, name: u.name || u.email, email: u.email, role: 'client', org: orgName(u.org_key), label: `${u.name || u.email} · Client at ${orgName(u.org_key)}` })),
  ];
  const pick = h('select', { class: 'input', style: 'flex:1' }, people.map((p, i) => h('option', { value: String(i) }, p.label)));
  const notYet = viewList(clients.users).filter((u) => !u.id).length;
  return h('div', { class: 'panel' }, h('h3', {}, 'See Cue as someone else'),
    h('p', { class: 'hint' }, 'Opens Cue the way that person sees it: their menu, their pages, and only the calls they can see. Read-only: nothing can be changed until you exit. Their private calls can’t be shown (only they can read those), and yours are hidden.'),
    people.length
      ? h('div', { class: 'row' }, pick, h('button', { class: 'btn primary', onclick: () => startViewAs(people[Number(pick.value)]) }, 'View'))
      : h('p', { class: 'hint' }, 'Nobody to preview yet: teammates and clients show up here once they’ve signed in.'),
    notYet ? h('p', { class: 'hint', style: 'margin-top:8px' }, `${notYet} invited client${notYet === 1 ? ' hasn’t' : 's haven’t'} signed in yet, so ${notYet === 1 ? 'they' : 'they'} can’t be previewed.`) : null);
}
