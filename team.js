// Team features for the main window: sign-in, who's live, watching a
// teammate's call with nudges, and the shared settings panels.
// Loaded after app.js and uses its helpers (h, call, go, …).

// ---------------------------------------------------------------------------
// Sign-in
// ---------------------------------------------------------------------------

let signinAs = 'team'; // 'team' | 'client'
function renderSignIn(message) {
  const asClient = signinAs === 'client';
  const email = h('input', { type: 'text', placeholder: asClient ? 'you@yourcompany.com' : 'you@synapsemfg.com', autocomplete: 'username', spellcheck: 'false' });
  const pin = asClient
    ? h('input', { type: 'text', placeholder: 'From your Cue invite', autocomplete: 'off', maxlength: '12', class: 'pin-input', spellcheck: 'false', style: 'text-transform:uppercase' })
    : h('input', { type: 'password', inputmode: 'numeric', placeholder: '••••', autocomplete: 'off', maxlength: '12', class: 'pin-input' });
  const err = h('div', { class: 'form-error' }, message || '');
  const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Sign in');
  const tab = (who, label) => h('button', { type: 'button', class: `chip-btn ${signinAs === who ? 'on' : ''}`, onclick: () => { signinAs = who; renderSignIn(); } }, label);
  const form = h('form', { class: 'signin', onsubmit: async (e) => {
    e.preventDefault();
    err.textContent = '';
    if (!/^\S+@\S+\.\S+$/.test(email.value.trim())) { err.textContent = asClient ? 'Enter your email.' : 'Enter your work email.'; return; }
    if (asClient ? !/^[A-Za-z0-9]{6,12}$/.test(pin.value.trim()) : !/^\d{4,12}$/.test(pin.value.trim())) { err.textContent = asClient ? 'Enter the code from your invite.' : 'Enter the team PIN (numbers only).'; return; }
    btn.disabled = true; btn.textContent = 'Signing in…';
    const r = await call('auth:signIn', { email: email.value, pin: pin.value, asClient });
    btn.disabled = false; btn.textContent = 'Sign in';
    if (!r.ok) { err.textContent = r.error; pin.value = ''; pin.focus(); return; }
    authState = await call('auth:state');
    renderAccount(); renderNav(); renderFolders(); renderTeamLive(); presetsChanged();
    go({ view: 'home' });
  } },
  h('img', { class: 'signin-logo', src: 'assets/logo.svg', alt: '' }),
  h('h1', {}, asClient ? 'Sign in to Cue' : 'Sign in to your team'),
  h('div', { class: 'row', style: 'gap:6px;margin:-4px 0 12px' }, tab('team', 'Synapse team'), tab('client', 'Client')),
  asClient
    ? h('p', {}, 'Cue records your meetings and writes the notes for you. Use the email and the code from your Cue invite (your Synapse contact sends it).')
    : [h('p', { class: 'signin-by' }, 'Cue is Synapse Mfg’s in-house call coach and note taker.'), h('p', {}, 'Your calls, notes and presets are shared with the Synapse team. Use your work email and the team PIN.')],
  h('div', { class: 'field' }, h('label', {}, asClient ? 'Email' : 'Work email'), email),
  h('div', { class: 'field' }, h('label', {}, asClient ? 'Invite code' : 'Team PIN'), pin),
  err,
  h('div', { class: 'row' }, btn,
    WEB || asClient ? null : h('button', { class: 'link-btn', type: 'button', onclick: () => { sessionStorage.setItem('cue-offline', '1'); go({ view: 'home' }); } }, 'Use without signing in')));
  $view.replaceChildren(form);
  setTimeout(() => email.focus(), 50);
}

function renderAccount() {
  const el = document.getElementById('account');
  if (!el) return;
  if (!authState.configured) { el.replaceChildren(); return; }
  if (!authState.user) {
    el.replaceChildren(h('button', { class: 'account-btn', onclick: () => { sessionStorage.removeItem('cue-offline'); renderSignIn(); } }, 'Sign in to your team'));
    return;
  }
  const u = authState.user;
  el.replaceChildren(h('button', { class: 'account-btn', title: `${u.email} · settings`, onclick: () => go({ view: 'settings' }) },
    h('span', { class: 'avatar' }, (u.name || u.email)[0].toUpperCase()), h('span', { class: 'grow' }, u.name || u.email)));
}

// ---------------------------------------------------------------------------
// Who's live right now (sidebar)
// ---------------------------------------------------------------------------

let teamLiveKey = '';
async function renderTeamLive() {
  teamLive = authState.user && !isClientUser() ? await call('team:live').catch(() => []) : [];
  const key = teamLive.map((c) => c.id).join(',');
  if (key === teamLiveKey) return;
  teamLiveKey = key;
  renderNav();
  if (route.view === 'watch') renderWatch();
}

// The Live page: every call happening on the team right now.
let watchTimer = null;
function renderWatch() {
  clearInterval(watchTimer);
  const list = teamLive;
  const rows = list.map((c) => {
    const timer = h('span', { class: 'lw-time' }, fmtDur(Date.now() - c.startedAt));
    timer.dataset.start = c.startedAt;
    const ownReal = c.mine && !/^Simulation · /.test(c.title || '');
    return h('button', { class: 'live-card', onclick: () => go(ownReal ? { view: 'live' } : { view: 'monitor', id: c.id }) },
      h('span', { class: 'lw-dot' }),
      h('span', { class: 'grow' },
        h('b', {}, c.title || 'Call'),
        h('span', {}, [c.mine ? 'You' : c.owner || 'Teammate', c.presetName].filter(Boolean).join(' · '))),
      timer,
      h('span', { class: 'btn primary' }, ownReal ? 'Open' : 'Watch live'));
  });
  $view.replaceChildren(
    h('h1', { class: 'page' }, 'Live'),
    h('p', { class: 'hint', style: 'margin:0 0 18px;color:var(--text-3)' }, list.length
      ? 'Open a call to follow the transcript, checklist and talk time as it happens, and send a quiet nudge.'
      : 'Calls show up here the moment anyone on the team starts recording.'),
    list.length ? h('div', { class: 'live-list' }, rows) : h('div', { class: 'live-empty' },
      h('span', { class: 'le-ring', html: ICON.live }),
      h('b', {}, 'Nobody is on a call right now'),
      h('span', {}, 'This page updates by itself.')));
  if (list.length) watchTimer = setInterval(() => {
    if (route.view !== 'watch') return clearInterval(watchTimer);
    document.querySelectorAll('.lw-time').forEach((el) => { el.textContent = fmtDur(Date.now() - Number(el.dataset.start)); });
  }, 1000);
}

// ---------------------------------------------------------------------------
// Watching a teammate's call
// ---------------------------------------------------------------------------

let mon = null; // {id, meeting, snapshot, names}

function stopMonitor() {
  if (mon) call('monitor:close');
  mon = null;
}

function dreamCard(score) {
  const tone = score >= 70 ? 'good' : score >= 45 ? 'mid' : 'low';
  return h('div', { class: `dream ${tone}`, title: 'Share of pitch lines that sold the buyer\'s outcome instead of listing features' },
    h('span', { class: 'num' }, `${score}%`), h('span', { class: 'txt' }, 'selling the outcome'));
}

async function renderMonitor(id) {
  const fresh = pageTicket();
  stopMonitor();
  $view.replaceChildren(h('div', { class: 'placeholder' }, h('span', { class: 'spin' }), 'Connecting to the call…'));
  const r = await call('monitor:open', id).catch(() => null);
  if (!fresh()) { if (r?.meeting && route.view !== 'monitor') call('monitor:close'); return; }
  if (!r || !r.meeting) { $view.replaceChildren(h('div', { class: 'placeholder' }, 'That call isn’t available.')); return; }
  const first = (r.meeting.owner || 'Caller').split(' ')[0];
  mon = { id, meeting: r.meeting, snapshot: r.snapshot, names: { me: first, them: 'Them' } };

  const input = h('input', { type: 'text', class: 'input nudge-input', maxlength: '200', placeholder: `Send ${first} a quiet nudge…` });
  const status = h('span', { class: 'saved' });
  const sendNudge = async (text) => {
    text = String(text || '').trim();
    if (!text) return;
    status.textContent = 'Sending…';
    const res = await call('nudge:send', { id, text });
    status.textContent = res.ok ? `Sent to ${first}` : res.error;
    if (res.ok) input.value = '';
    setTimeout(() => { status.textContent = ''; }, 2500);
  };
  const quick = ['Tie it to their goal', 'Ask their close rate', 'Do the meeting math', 'Compare to an in-house hire', 'Ask for the decision', 'Slow down, let them talk'];

  $view.replaceChildren(
    h('div', { class: 'meta' }, h('span', { class: 'chip live' }, h('span', { class: 'live-dot pulse' }), 'Live'),
      h('span', { id: 'mon-clock' }, fmtClock(Date.now() - r.meeting.startedAt)), h('span', {}, r.meeting.owner || ''),
      r.meeting.presetName ? h('span', { class: 'chip' }, r.meeting.presetName) : null),
    h('h1', { class: 'page', style: 'margin-bottom:16px' }, r.meeting.title),
    h('div', { id: 'mon-stats', class: 'score-row' }),
    h('div', { id: 'mon-alert' }),
    h('div', { class: 'nudge-box' },
      h('form', { class: 'row', onsubmit: (e) => { e.preventDefault(); sendNudge(input.value); } }, input, h('button', { class: 'btn primary', type: 'submit' }, 'Send'), status),
      h('div', { class: 'quick' }, quick.map((q) => h('button', { class: 'chip-btn', type: 'button', onclick: () => sendNudge(q) }, q)))),
    h('div', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', {}, 'Checklist')), h('ul', { class: 'checks', id: 'mon-checks' })),
    h('div', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', {}, 'Live transcript')), h('div', { class: 'lines', id: 'mon-lines' },
      (r.meeting.transcript || []).map((s) => lineRow(s, null, false, mon.names))), h('div', { class: 'lines', id: 'mon-partial' })),
  );
  paintMonitor();
}

function paintMonitor() {
  if (!mon) return;
  const s = mon.snapshot;
  const stats = document.getElementById('mon-stats');
  const checks = document.getElementById('mon-checks');
  const alert = document.getElementById('mon-alert');
  if (!stats) return;
  if (!s) { stats.replaceChildren(h('div', { class: 'placeholder' }, 'Waiting for the first update…')); return; }
  stats.replaceChildren(coverage(s.done, s.total), s.dreamScore != null ? dreamCard(s.dreamScore) : h('div', { class: 'dream pending' }, h('span', { class: 'txt' }, 'Outcome score shows after a few pitch lines')));
  checks.replaceChildren(...(s.items || []).map((i) => checkRow(i, false)));
  const bits = [];
  if (s.objection) bits.push(h('div', { class: 'obj' }, h('b', {}, `Objection: ${s.objection.title}`), s.objection.quote ? h('span', {}, `“${s.objection.quote}”`) : null));
  if (s.pitchNudge) bits.push(h('div', { class: 'banner warn' }, `Cue told ${mon.names.me}: ${s.pitchNudge.text}`));
  if (s.teamNudge) bits.push(h('div', { class: 'banner' }, `On ${mon.names.me}’s card now: “${s.teamNudge.text}”`));
  alert.replaceChildren(...bits);
  const partial = document.getElementById('mon-partial');
  partial.replaceChildren(...['them', 'me'].filter((k) => s.partials && s.partials[k]).map((k) => lineRow({ speaker: k, text: s.partials[k] }, null, true, mon.names)));
}

function onMonitorEvent(e) {
  if (!mon || e.id !== mon.id) return;
  const main = document.getElementById('main');
  const atBottom = main.scrollHeight - main.scrollTop - main.clientHeight < 120;
  if (e.type === 'segment') {
    document.getElementById('mon-lines')?.append(lineRow(e.seg, null, false, mon.names));
  } else if (e.type === 'snapshot') {
    mon.snapshot = e.snapshot;
    paintMonitor();
  } else if (e.type === 'status' && e.status !== 'live') {
    const id = mon.id;
    setTimeout(() => { if (route.view === 'monitor' && route.id === id) go({ view: 'call', id }); }, 1500);
    return;
  }
  if (atBottom) main.scrollTop = main.scrollHeight;
}

setInterval(() => {
  const el = document.getElementById('mon-clock');
  if (el && mon) el.textContent = fmtClock(Date.now() - mon.meeting.startedAt);
}, 1000);

// ---------------------------------------------------------------------------
// Settings panels for team features (inserted at the top of Settings)
// ---------------------------------------------------------------------------

async function teamSettingsPanels(s) {
  const panels = [];
  // Account
  if (authState.configured) {
    panels.push(h('div', { class: 'panel' }, h('h3', {}, 'Team account'),
      authState.user
        ? h('div', { class: 'row', style: 'margin-bottom:12px' }, h('span', { class: 'grow' }, `Signed in as ${authState.user.name} (${authState.user.email})`),
          h('button', { class: 'btn allow', onclick: async () => { await call('auth:signOut'); authState = await call('auth:state'); renderAccount(); renderTeamLive(); go({ view: 'home' }); } }, 'Sign out'))
        : h('div', { class: 'row', style: 'margin-bottom:12px' }, h('span', { class: 'grow' }, 'Not signed in. Calls stay on this computer.'),
          h('button', { class: 'btn primary', onclick: () => { sessionStorage.removeItem('cue-offline'); renderSignIn(); } }, 'Sign in')),
      authState.user ? h('label', { class: 'toggle' },
        h('input', { type: 'checkbox', checked: !!s.notifyTeamCalls, onchange: (e) => call('settings:save', { notifyTeamCalls: e.target.checked }) }),
        h('span', { class: 'tx' }, h('b', {}, 'Tell me when a teammate starts a call'), h('span', {}, 'A notification with a link to watch it live.'))) : null,
      authState.user ? h('div', { class: 'row', style: 'margin-top:8px' }, h('button', { class: 'link-btn allow', onclick: () => playDemo() }, 'Watch the 90-second Cue demo')) : null));
  }

  // Calendar
  const cal = await call('calendar:status');
  const calInput = h('input', { type: 'password', value: s.calendarUrl ? s.calendarUrl : '', placeholder: 'https://calendar.google.com/calendar/ical/…/private-…/basic.ics', autocomplete: 'off', spellcheck: 'false',
    onfocus: (e) => { if (e.target.value.startsWith('••••')) e.target.value = ''; },
    onchange: async (e) => {
      const v = e.target.value.trim();
      if (v.startsWith('••••')) return;
      const r = await call('settings:save', { calendarUrl: v });
      if (r.calendarError) { alert(r.calendarError); e.target.value = ''; }
    } });
  const manual = h('details', { class: 'cal-manual' }, h('summary', {}, 'Paste the link yourself'),
    field('Private calendar link', calInput, 'Google Calendar → Settings → your calendar → "Secret address in iCal format".'));
  panels.push(h('div', { class: 'panel' }, h('h3', {}, 'Calendar'),
    cal.source === 'team'
      ? h('div', { class: 'cal-state' },
          h('div', { class: 'row' }, h('span', { class: 'dot ok' }), h('b', { class: 'grow' }, `Connected by your admin · ${cal.events} meetings this week`)),
          h('div', { class: 'hint' }, `Synapse’s team calendars are connected${cal.teamBy ? ` through ${cal.teamBy}` : ''}. Nothing to set up on your side.`),
          (cal.upcoming || []).length ? h('ul', { class: 'upcoming' }, cal.upcoming.slice(0, 4).map((e) => h('li', {}, `${dayLabel(e.start)} ${timeOf(e.start)} · ${e.title}`))) : null)
    : cal.configured
      ? h('div', { class: 'cal-state' },
          h('div', { class: 'row' }, h('span', { class: `dot ${cal.lastError ? 'bad' : 'ok'}` }),
            h('b', { class: 'grow' }, cal.lastError ? `Couldn’t read the calendar: ${cal.lastError}` : `Connected · ${cal.events} meetings this week`),
            h('button', { class: 'link-btn danger', onclick: async () => { if (confirm('Disconnect your calendar?')) { await call('calendar:disconnect'); renderSettings(); } } }, 'Disconnect')),
          h('div', { class: 'hint' }, cal.synced ? 'Saved to your Cue account, so it stays connected after updates and on any computer you sign in on.' : 'Saved on this computer. Sign in to keep it on your account.'),
          (cal.upcoming || []).length ? h('ul', { class: 'upcoming' }, cal.upcoming.slice(0, 4).map((e) => h('li', {}, `${dayLabel(e.start)} ${timeOf(e.start)} · ${e.title}`))) : null)
      : cal.waiting
        ? h('div', { class: 'cal-state' },
            h('div', { class: 'row' }, h('span', { class: 'spin' }), h('b', { class: 'grow' }, 'Waiting for the secret address…'),
              h('button', { class: 'link-btn', onclick: async () => { await call('calendar:cancel'); renderSettings(); } }, 'Cancel')),
            h('ol', { class: 'cal-steps' },
              h('li', {}, 'In the Google Calendar tab that just opened, scroll to ', h('b', {}, 'Integrate calendar'), '.'),
              h('li', {}, 'Next to ', h('b', {}, 'Secret address in iCal format'), ', click the copy button.'),
              h('li', {}, 'That’s it. Cue picks it up on its own and clears your clipboard.')))
        : h('div', { class: 'cal-state' },
            h('div', { class: 'hint' }, 'Calls get their real meeting title and attendees, and Cue lists what’s next. Connect once: it stays on your account.'),
            h('div', { class: 'row', style: 'margin-top:10px' }, h('button', { class: 'btn primary', onclick: async () => { await call('calendar:connect'); renderSettings(); } }, 'Connect Google Calendar'))),
    cal.configured || WEB ? null : manual));
  if (WEB && !cal.configured) panels[panels.length - 1].append(h('div', { class: 'hint' }, 'Calendars are connected from the Cue desktop app.'));

  if (WEB) return panels; // connecting Claude and updates happen in the desktop app
  // Claude
  panels.push(h('div', { class: 'panel' }, h('h3', {}, 'Claude'),
    h('div', { class: 'hint', style: 'margin-bottom:10px;font-size:12.5px;color:var(--text-3);line-height:1.5' }, 'Let Claude search and read every team call, the same way it reads Granola today.'),
    h('div', { class: 'row', style: 'margin-bottom:12px' }, h('button', { class: 'btn allow', disabled: !authState.user, onclick: async (e) => {
      e.target.disabled = true; e.target.textContent = 'Connecting…';
      const r = await call('claude:connect');
      e.target.textContent = r.ok ? 'Connected' : 'Connect Claude';
      e.target.disabled = false;
      claudeOut.textContent = r.ok ? r.message : r.error;
    } }, 'Connect Claude'), authState.user ? null : h('span', { class: 'saved' }, 'Sign in first')),
    h('div', { class: 'test-out', style: 'margin-bottom:12px' })));
  const claudeOut = panels[panels.length - 1].lastChild;

  // Updates
  const up = await call('update:state');
  const upText = {
    off: 'Updates are checked in installed copies only.',
    idle: 'Checking for updates shortly…',
    current: 'You have the latest version.',
    available: `Version ${up.latest} is available.`,
    downloading: `Downloading ${up.latest}… ${up.progress || 0}%`,
    ready: `Version ${up.latest} is downloaded and ready.`,
    downloaded: `Version ${up.latest} was saved to Downloads. Open it and drag Cue into Applications.`,
    error: `Couldn't check for updates: ${up.error || ''}`,
  }[up.status] || '';
  const upBtns = [];
  if (up.status === 'ready') upBtns.push(h('button', { class: 'btn primary allow', onclick: async () => { const r = await call('update:install'); if (!r.ok) alert(r.error); } }, 'Restart to update'));
  if (up.status === 'available' && info.platform === 'darwin') upBtns.push(h('button', { class: 'btn primary allow', onclick: async (e) => { e.target.disabled = true; e.target.textContent = 'Downloading…'; const r = await call('update:mac'); e.target.disabled = false; e.target.textContent = r.ok ? 'Opened' : 'Download update'; if (!r.ok) alert(r.error); } }, 'Download update'));
  if (up.status !== 'off' && up.status !== 'downloading' && up.status !== 'ready') upBtns.push(h('button', { class: 'btn allow', onclick: async () => { await call('update:check'); renderSettings(); } }, 'Check now'));
  panels.push(h('div', { class: 'panel' }, h('h3', {}, 'Updates'),
    h('div', { class: 'hint', style: 'margin-bottom:10px;font-size:12.5px;color:var(--text-2);line-height:1.5' }, `Cue ${up.current || info.version}. ${upText}`),
    up.error && up.status !== 'error' ? h('div', { class: 'hint', style: 'margin-bottom:10px;font-size:12px;color:var(--amber)' }, up.error) : null,
    upBtns.length ? h('div', { class: 'row', style: 'margin-bottom:12px' }, ...upBtns) : null));
  return panels;
}


// ---------------------------------------------------------------------------
// Admin (only Dylan): everything that changes Cue for the whole team
// ---------------------------------------------------------------------------

async function renderAdmin() {
  const fresh = pageTicket();
  if (authState.user?.role !== 'admin') return go({ view: 'settings' });
  const panels = [];
  panels.push(await simulatorPanel(), await devicesPanel(), await clientsPanel(), await contextPanel(), await adminPanel());

  // Who we are + how we sell
  const ws = await call('workspace:get');
  const profile = h('textarea', { rows: 5, value: ws.companyProfile, placeholder: 'Who we are, what we sell, who buys it, our pricing. Claude reads this on every call.' });
  const knowledge = h('textarea', { rows: 8, value: ws.knowledge, placeholder: 'Leave empty to use the built-in Synapse closing playbook (sell the dream outcome, meeting math, in-house hire comparison).' });
  const saved = h('span', { class: 'saved' });
  const save = debounce(async () => { await call('workspace:save', { companyProfile: profile.value, knowledge: knowledge.value }); saved.textContent = ws.shared ? 'Saved for the team' : 'Saved'; setTimeout(() => { saved.textContent = ''; }, 1600); }, 600);
  profile.addEventListener('input', save);
  knowledge.addEventListener('input', save);
  panels.push(h('div', { class: 'panel' }, h('div', { class: 'row', style: 'margin-bottom:12px' }, h('h3', { style: 'margin:0;flex:1' }, 'Who we are and how we sell'), saved),
    field('Company profile', profile, ws.shared ? 'Shared with the team.' : 'Saved on this computer until you sign in.'),
    field('Sales playbook', knowledge, ws.knowledge ? 'Shared with the team. Cue coaches and grades calls against it.' : 'No playbook yet. Paste how your team sells (offer, prices, objections) and Cue will coach against it.'),
    !ws.knowledge && ws.bundledKnowledge ? h('div', { class: 'row', style: 'margin:-4px 0 12px' }, h('button', { class: 'link-btn', onclick: () => { knowledge.value = ws.bundledKnowledge; save(); } }, 'Copy the built-in playbook here to edit it')) : null));

  panels.push(await coachingPanel(), await teamCalendarPanel(), await shareDomainPanel());
  const s = await call('settings:get');
  const saveSetting = (patch) => call('settings:save', patch);
  const keyInput = (k, placeholder) => h('input', { type: 'password', value: s[k], placeholder, autocomplete: 'off', spellcheck: 'false',
    onfocus: (e) => { if (e.target.value.startsWith('••••')) e.target.value = ''; },
    onchange: (e) => { const v = e.target.value.trim(); if (v) saveSetting({ [k]: v }); } });
  panels.push(await keysPanel(s, keyInput, saveSetting, h('div', { class: 'test-out' })));
  if (!fresh()) return;
  $view.replaceChildren(
    h('h1', { class: 'page' }, 'Admin'),
    h('p', { class: 'sub' }, 'Only you see this page. Changes here apply to everyone on the team; Grant and Christian can read team settings but can’t change them.'),
    ...panels);
}

// Settings for Cue for clients: their account, and a word on who sees what.
async function clientSettingsPanels() {
  const u = authState.user || {};
  const panels = [h('div', { class: 'panel' }, h('h3', {}, 'Your account'),
    h('div', { class: 'row', style: 'margin-bottom:10px' }, h('span', { class: 'grow' }, `Signed in as ${u.name || u.email} (${u.email})`),
      h('button', { class: 'btn allow', onclick: async () => { await call('auth:signOut'); authState = await call('auth:state'); renderAccount(); renderNav(); renderFolders(); go({ view: 'home' }); } }, 'Sign out')),
    h('div', { class: 'hint' }, 'Your recordings and notes are private to you and shared with your Synapse team. Nobody else sees them.'))];
  if (WEB) return panels;
  const up = await call('update:state');
  panels.push(h('div', { class: 'panel' }, h('h3', {}, 'Updates'),
    h('div', { class: 'hint', style: 'margin-bottom:10px' }, `Cue ${up.current || info.version}. ${up.status === 'current' ? 'You have the latest version.' : up.status === 'ready' ? `Version ${up.latest} is ready.` : up.status === 'available' ? `Version ${up.latest} is available.` : 'Cue updates itself.'}`),
    up.status === 'ready' ? h('button', { class: 'btn primary allow', onclick: async () => { const r = await call('update:install'); if (!r.ok) alert(r.error); } }, 'Restart to update') : null,
    // Macs (teammates and clients) download the new version themselves.
    up.status === 'available' && info.platform === 'darwin' ? h('button', { class: 'btn primary allow', onclick: async (e) => { e.target.disabled = true; e.target.textContent = 'Downloading…'; const r = await call('update:mac'); e.target.disabled = false; e.target.textContent = r.ok ? 'Opened' : 'Download update'; if (!r.ok) alert(r.error); } }, 'Download update') : null));
  return panels;
}

// ---------------------------------------------------------------------------
// API keys: one set for the whole team, managed by the admin
// ---------------------------------------------------------------------------

async function keysPanel(s, keyInput, save, out) {
  const k = await call('keys:state');
  const testRow = h('div', { class: 'row', style: 'margin-bottom:12px' }, h('button', { class: 'btn allow', onclick: async (e) => {
    e.target.disabled = true; out.textContent = 'Testing…';
    const r = await call('settings:test');
    e.target.disabled = false;
    const line = (name, v) => h('div', {}, `${name}: `, h('span', { class: v === 'ok' ? 'ok' : 'bad' }, v === 'ok' ? 'working' : v));
    out.replaceChildren(line('ElevenLabs', r.elevenlabs), line('Anthropic', r.anthropic));
  } }, 'Test keys'), out);

  if (!k.signedIn) {
    return h('div', { class: 'panel' }, h('h3', {}, 'Keys (this computer)'),
      field('ElevenLabs API key', keyInput('elevenlabsKey', 'xi-…'), 'Sign in to use the team’s keys instead.'),
      field('Anthropic API key', keyInput('anthropicKey', 'sk-ant-…')),
      testRow);
  }
  if (!k.isAdmin) {
    return h('div', { class: 'panel' }, h('h3', {}, 'Keys'),
      h('div', { class: 'hint', style: 'margin-bottom:10px;font-size:13px;color:var(--text-2);line-height:1.5' },
        k.source === 'team' ? 'Cue uses the team’s ElevenLabs and Anthropic keys, managed by your admin. Nothing to set up here.' : 'Your admin hasn’t added the team keys yet.'),
      testRow);
  }
  const status = h('span', { class: 'saved' });
  const teamKey = (f, placeholder) => h('input', { type: 'password', value: k[f], placeholder, autocomplete: 'off', spellcheck: 'false',
    onfocus: (e) => { if (e.target.value.startsWith('••••')) e.target.value = ''; },
    onchange: async (e) => {
      const v = e.target.value.trim();
      if (!v) return;
      status.textContent = 'Saving…';
      const r = await call('keys:saveTeam', { [f]: v });
      status.textContent = r.ok ? 'Saved for the whole team' : r.error;
      setTimeout(() => { status.textContent = ''; }, 2500);
    } });
  return h('div', { class: 'panel' },
    h('div', { class: 'row', style: 'margin-bottom:12px' }, h('h3', { style: 'margin:0;flex:1' }, 'Team keys'), status),
    h('div', { class: 'hint', style: 'margin:-4px 0 12px;font-size:12.5px;color:var(--text-3);line-height:1.5' }, 'Everyone on the team uses these. Only admins can change them.'),
    field('ElevenLabs API key', teamKey('elevenlabsKey', 'xi-…'), 'Live transcription for both sides of every call.'),
    field('Anthropic API key', teamKey('anthropicKey', 'sk-ant-…'), 'Live cues, objection detection, notes and the preset generator.'),
    field('Model', h('select', { onchange: async (e) => { const r = await call('keys:saveTeam', { model: e.target.value }); status.textContent = r.ok ? 'Saved for the whole team' : r.error; } },
      Object.entries(info.models || {}).map(([id, m]) => h('option', { value: id, selected: id === k.model }, m.label))),
      'Opus judges best. Haiku is faster and far cheaper; try it if cues feel slow.'),
    testRow);
}

// Admin: who's on the team, and the PIN.
// Admin: connect Google once and every teammate's calendar comes with it.
async function teamCalendarPanel() {
  const st = await call('teamcal:status');
  const err = h('div', { class: 'form-error' });
  const ago = (t) => { if (!t) return 'not yet'; const m = Math.round((Date.now() - Date.parse(t)) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };
  const connect = h('button', { class: 'btn primary', disabled: !st.available, onclick: async (e) => {
    e.target.disabled = true; e.target.textContent = 'Waiting for Google…'; err.textContent = '';
    const r = await call('teamcal:connect');
    if (!r.ok) { err.textContent = r.error; e.target.disabled = false; e.target.textContent = 'Connect team calendars'; return; }
    renderView();
  } }, st.connected ? 'Reconnect' : 'Connect team calendars');
  return h('div', { class: 'panel' }, h('h3', {}, 'Team calendars'),
    h('p', { class: 'hint' }, st.connected
      ? `Connected through ${st.by}. Every teammate’s meetings sync every 5 minutes while your Cue is open. Each person only sees their own; you see everyone’s.`
      : 'Sign in with Google once as the admin. Cue then reads the calendar of everyone on the team, so nobody else has to set anything up.'),
    st.connected && st.error ? h('div', { class: 'banner warn', style: 'margin-bottom:10px' }, st.error) : null,
    st.connected ? h('ul', { class: 'members' }, (st.members || []).map((m) => h('li', {},
      h('span', { class: 'avatar' }, (m.name || m.email)[0].toUpperCase()),
      h('span', { class: 'grow' }, h('b', {}, m.name), h('span', {}, ` ${m.email}`)),
      m.error ? h('span', { class: 'chip bad', title: m.error }, 'Not shared') : m.count != null ? h('span', { class: 'chip' }, `${m.count} meetings`) : h('span', { class: 'chip' }, 'Waiting')))) : null,
    h('div', { class: 'row' }, connect,
      st.connected ? h('button', { class: 'btn', onclick: async (e) => { e.target.textContent = 'Syncing…'; await call('teamcal:sync'); renderView(); } }, 'Sync now') : null,
      st.connected ? h('span', { class: 'saved' }, `Last sync ${ago(st.lastSyncAt)}`) : null,
      st.connected ? h('button', { class: 'link-btn danger', onclick: async () => { if (confirm('Disconnect team calendars for everyone?')) { await call('teamcal:disconnect'); renderView(); } } }, 'Disconnect') : null),
    st.available ? null : h('div', { class: 'hint' }, st.webOnly ? 'Connect or reconnect team calendars from the Cue desktop app.' : 'This build has no Google sign-in set up.'),
    err);
}

// Approved computers: each computer or browser has to be approved once.
// Plays a scripted call through the real pipeline so every part of Cue can be
// tried without a real prospect: the "Call detected" card, the widget, AI cues,
// objections, coach tips, talk time, live notes, "Meeting over?" and the notes.
async function simulatorPanel() {
  if (WEB) return h('div', { class: 'panel' }, h('h3', {}, 'Simulator'), h('div', { class: 'hint' }, 'Run the simulator from the Cue desktop app: it drives the call widget on your screen.'));
  const scripts = await call('sim:scripts');
  const presets = await call('presets:get');
  let pick = scripts[0]?.id || 'custom';
  const scriptSel = h('select', { onchange: (e) => { pick = e.target.value; custom.hidden = pick !== 'custom'; syncPreset(); } },
    scripts.map((x) => h('option', { value: x.id }, `${x.name} (${x.lines} lines)`)), h('option', { value: 'custom' }, 'Paste my own script…'));
  const custom = h('textarea', { rows: 6, hidden: true, placeholder: 'REP: Thanks for jumping on, how do you find new customers today?\nMark: Mostly referrals.\nREP: …' });
  const presetSel = h('select', {}, h('option', { value: '' }, 'Best fit for the script'), presets.map((p) => h('option', { value: p.id }, p.name)));
  const syncPreset = () => { if (pick === 'notes') presetSel.value = (presets.find((p) => p.kind === 'notes') || {}).id || ''; };
  const speed = h('select', {}, [[1, 'Real time'], [2, '2× faster'], [4, '4× faster'], [8, '8× faster']].map(([v, l]) => h('option', { value: v, selected: v === 2 }, l)));
  const opt = (checked, title, desc) => { const box = h('input', { type: 'checkbox', checked }); return [box, h('label', { class: 'toggle' }, box, h('span', { class: 'tx' }, h('b', {}, title), h('span', {}, desc)))]; };
  const [detect, detectRow] = opt(true, 'Start with the “Call detected” card', 'Like when a Meet or Zoom call opens. Click Start on the card to begin.');
  const [leave, leaveRow] = opt(true, 'End with the other side leaving', 'Cue asks “Meeting over?” the moment they leave, then writes the notes.');
  const [visible, visibleRow] = opt(false, 'Show it on Live', 'Teammates see it glow on their Live tab (titled “Simulation · …”) and can watch along. Off: only you see it, and the notes land in My notes.');
  const status = h('div', { class: 'test-out' });
  const run = h('button', { class: 'btn primary', onclick: async () => {
    status.textContent = '';
    run.disabled = true;
    const r = await call('sim:start', { scriptId: pick === 'custom' ? null : pick, custom: pick === 'custom' ? custom.value : null, presetId: presetSel.value || null, speed: Number(speed.value), detect: detect.checked, endBy: leave.checked ? 'leave' : 'auto', visible: visible.checked });
    run.disabled = false;
    if (!r.ok) { status.textContent = r.error; return; }
    status.replaceChildren(
      h('span', {}, r.waiting ? 'The “Call detected” card is on your screen. Click Start on it. ' : 'Running. The widget is on your screen. '),
      visible.checked ? h('button', { class: 'link-btn', onclick: () => go({ view: 'watch' }) }, 'Watch it on Live') : null);
  } }, 'Run simulation');
  return h('div', { class: 'panel' }, h('h3', {}, 'Simulator'),
    h('div', { class: 'hint', style: 'margin-bottom:12px' }, 'Plays a scripted call through the real Cue: the call card, AI cues and objections, coach tips and talk time, live notes, “Meeting over?” and the finished notes. It uses the team’s AI keys like a real call (a few cents a run). Delete the call afterwards if you don’t want it.'),
    field('Script', scriptSel), custom,
    h('div', { class: 'grid-2' }, field('Preset', presetSel), field('Speed', speed)),
    detectRow, leaveRow, visibleRow,
    h('div', { class: 'row', style: 'margin:6px 0 4px;gap:12px' }, run, h('button', { class: 'btn', onclick: () => call('call:stop') }, 'End the running call')),
    status);
}

// Admin → Names from your records: where Cue learns how people and companies
// are spelled (Salesforce bookings, Slack booking posts, Drive call lists).
const SLACK_MANIFEST = {
  display_information: { name: 'Cue', description: 'Reads booking posts so Cue spells names right in call notes.' },
  features: { bot_user: { display_name: 'Cue', always_online: false } },
  oauth_config: { scopes: { bot: ['channels:read', 'channels:history', 'channels:join', 'groups:read', 'groups:history', 'users:read'] } },
  settings: { org_deploy_enabled: false, socket_mode_enabled: false, token_rotation_enabled: false },
};
async function contextPanel() {
  if (WEB) return h('div', { class: 'panel' }, h('h3', {}, 'Names from your records'), h('div', { class: 'hint' }, 'Set up from the Cue desktop app.'));
  const st = await call('context:status');
  const ago = (t) => { if (!t) return 'never'; const m = Math.round((Date.now() - Date.parse(t)) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };
  const row = (name, ok, text, extra) => h('div', { class: 'ctx-row' }, h('span', { class: `dot ${ok === true ? 'ok' : ok === false ? 'bad' : ''}` }), h('b', {}, name), h('span', { class: 'grow' }, text), extra || null);
  const s = st.synced || {};
  const line = (src) => (s[src]?.error ? `Last sync failed: ${s[src].error}` : `${(st.counts[src] || 0).toLocaleString()} names · synced ${ago(s[src]?.at)}`);
  const out = h('div', { class: 'test-out' });
  const token = h('input', { type: 'password', class: 'input', placeholder: 'xoxb-…', autocomplete: 'off', style: 'flex:1' });
  const slackBox = h('div', { class: 'ctx-slack', hidden: true },
    h('ol', { class: 'cal-steps' },
      h('li', {}, h('a', { href: `https://api.slack.com/apps?new_app=1&manifest_json=${encodeURIComponent(JSON.stringify(SLACK_MANIFEST))}`, target: '_blank', rel: 'noopener' }, 'Create the Cue app in Slack'), ' (opens Slack with everything filled in), then click ', h('b', {}, 'Create'), '.'),
      h('li', {}, 'Click ', h('b', {}, 'Install to Workspace'), ' and allow it.'),
      h('li', {}, 'Copy the ', h('b', {}, 'Bot User OAuth Token'), ' (starts with xoxb-) and paste it here. Private channels: invite @Cue to them.')),
    h('div', { class: 'row', style: 'gap:8px' }, token, h('button', { class: 'btn primary', onclick: async (e) => {
      e.target.disabled = true; out.textContent = 'Checking…';
      const r = await call('context:slackToken', token.value);
      e.target.disabled = false;
      out.textContent = r.ok ? 'Slack connected. Reading the channels now.' : r.error;
      if (r.ok) setTimeout(renderView, 1500);
    } }, 'Connect')));
  return h('div', { class: 'panel' },
    h('div', { class: 'row' }, h('h3', { class: 'grow', style: 'margin:0' }, 'Names from your records'),
      h('button', { class: 'btn', disabled: st.running, onclick: async (e) => { e.target.disabled = true; e.target.textContent = 'Syncing…'; await call('context:sync'); setTimeout(renderView, 4000); } }, st.running ? 'Syncing…' : 'Sync now')),
    h('div', { class: 'hint', style: 'margin:6px 0 12px' }, 'Cue checks call notes against these, so people and companies are spelled right (Salesforce bookings, Slack booking posts, the callers’ contact lists). Your Mac refreshes them every 6 hours; Grant and Christian’s notes use them too.'),
    row('Salesforce', st.salesforce ? !s.salesforce?.error : false, st.salesforce ? line('salesforce') : 'The Salesforce CLI (sf) isn’t on this Mac.'),
    row('Slack', st.slack ? !s.slack?.error : null, st.slack ? line('slack') : 'Not connected yet.',
      st.slack ? h('button', { class: 'link-btn danger', onclick: async () => { if (!confirm('Disconnect Slack? Cue stops reading booking posts.')) return; await call('context:slackToken', ''); renderView(); } }, 'Disconnect')
        : h('button', { class: 'btn', onclick: () => { slackBox.hidden = !slackBox.hidden; } }, 'Connect Slack')),
    slackBox,
    row('Google Drive', st.drive ? !s.drive?.error : false, st.drive ? line('drive') : 'Google Drive for desktop isn’t mirroring “Client Data Exports” on this Mac.'),
    out);
}

// Admin → Clients: Cue for clients (a note taker). Invite people at a client;
// each gets a personal code. They only ever see their own calls; the team sees
// everything they record (in the Clients space).
const orgKeyOf = (name) => String(name || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').trim().split(/\s+/)[0] || '';
function inviteText({ name, email, code }) {
  return [`Hi ${String(name || '').split(' ')[0] || 'there'},`, '',
    'You’re set up on Cue, the meeting note taker we use at Synapse. It records your calls and writes the notes for you, and your Synapse team sees them too.', '',
    '1. Download it: https://cue.synapsemfg.com/download (choose “I’m a Synapse client”)',
    '2. Install it (the page shows what to click if your computer warns you)',
    `3. Sign in with ${email} and this code: ${code}`, '', 'Thanks!'].join('\n');
}
async function clientsPanel() {
  const data = await call('clients:list');
  const out = h('div', { class: 'test-out' });
  const name = h('input', { type: 'text', class: 'input', placeholder: 'Name' });
  const email = h('input', { type: 'email', class: 'input', placeholder: 'name@client.com' });
  const orgs = [...new Set(data.orgs.map((o) => o.name))];   // companies already invited (the list lives in the database, not in the app)
  const company = h('input', { type: 'text', class: 'input', placeholder: 'Company', list: 'client-orgs' });
  const showInvite = (r, who) => {
    const text = inviteText({ name: who.name, email: r.email, code: r.code });
    out.replaceChildren(h('div', { class: 'invite-box' },
      h('b', {}, `Invite for ${r.email}`), h('pre', {}, text),
      h('div', { class: 'row', style: 'gap:8px' },
        h('button', { class: 'btn primary', onclick: (e) => { navigator.clipboard.writeText(text); e.target.textContent = 'Copied'; } }, 'Copy message'),
        h('a', { class: 'btn', href: `mailto:${encodeURIComponent(r.email)}?subject=${encodeURIComponent('Your Cue invite')}&body=${encodeURIComponent(text)}` }, 'Email it'),
        h('span', { class: 'grow', style: 'font-size:12px;color:var(--text-3)' }, 'The code is shown only now. “New code” makes another.'))));
  };
  const byOrg = new Map();
  for (const u of data.users) { if (!byOrg.has(u.org_key)) byOrg.set(u.org_key, []); byOrg.get(u.org_key).push(u); }
  const orgName = (k) => data.orgs.find((o) => o.key === k)?.name || k;
  const ago = (t) => { if (!t) return 'hasn’t signed in yet'; const d = Math.round((Date.now() - Date.parse(t)) / 86400000); return `signed in ${d <= 0 ? 'today' : `${d} days ago`}`; };
  return h('div', { class: 'panel' }, h('h3', {}, 'Clients'),
    h('div', { class: 'hint', style: 'margin-bottom:12px' }, 'Cue for clients is a note taker for people at your clients. They record their own calls and get notes; they only ever see their own calls. Everything they record shows up for the team in the Clients space.'),
    h('datalist', { id: 'client-orgs' }, orgs.map((o) => h('option', { value: o }))),
    h('form', { class: 'invite-row', onsubmit: async (e) => {
      e.preventDefault();
      if (!email.value.trim() || !company.value.trim()) { out.textContent = 'Add an email and a company.'; return; }
      const who = { name: name.value.trim(), email: email.value.trim(), orgKey: orgKeyOf(company.value), orgName: company.value.trim() };
      const r = await call('clients:invite', who);
      if (!r.ok) { out.textContent = r.error; return; }
      showInvite(r, who); name.value = ''; email.value = '';
    } }, name, email, company, h('button', { class: 'btn primary', type: 'submit' }, 'Invite')),
    out,
    ...[...byOrg.entries()].map(([k, users]) => h('div', { class: 'client-org' }, h('b', {}, orgName(k)),
      users.map((u) => h('div', { class: 'ctx-row' }, h('span', { class: `dot ${u.last_sign_in_at ? 'ok' : ''}` }), h('span', { class: 'grow' }, `${u.name || u.email} · ${u.email} · ${ago(u.last_sign_in_at)}`),
        h('button', { class: 'link-btn', onclick: async () => { const r = await call('clients:invite', { name: u.name, email: u.email, orgKey: u.org_key, orgName: orgName(u.org_key) }); if (r.ok) showInvite(r, u); else out.textContent = r.error; } }, 'New code'),
        h('button', { class: 'link-btn danger', onclick: async () => { if (!confirm(`Remove ${u.email}? They're signed out and can't sign in again. Their recorded calls stay with the team.`)) return; const r = await call('clients:remove', u.email); if (!r.ok) return alert(r.error); renderView(); } }, 'Remove'))))));
}

// Admin → Install guide: who can open cue.synapsemfg.com/download.
async function guidePanel() {
  const st = await call('guide:code');
  const out = h('div', { class: 'test-out' });
  const input = h('input', { type: 'text', class: 'input', placeholder: st.set ? 'A code is set. Type a new one to change it' : 'e.g. synapse-clients-2026', autocomplete: 'off', style: 'flex:1' });
  return h('div', { class: 'panel' }, h('h3', {}, 'Install guide'),
    h('div', { class: 'hint', style: 'margin-bottom:10px' }, 'cue.synapsemfg.com/download has the downloads and a step-by-step install guide (including the “Open Anyway” / “Run anyway” warnings). The team opens it with their work email and the team PIN. Clients open it with this code; it only opens the guide, not Cue itself.'),
    h('div', { class: 'row', style: 'gap:8px;margin-bottom:8px' }, input,
      h('button', { class: 'btn primary', onclick: async () => { if (!input.value.trim()) return; const r = await call('guide:code', input.value.trim()); out.textContent = r.ok ? `Saved. Clients use: ${input.value.trim()}` : r.error; if (r.ok) input.value = ''; } }, 'Save code'),
      st.set ? h('button', { class: 'link-btn danger', onclick: async () => { if (!confirm('Turn off client access to the install guide?')) return; const r = await call('guide:code', ''); out.textContent = r.ok ? 'Client access turned off.' : r.error; } }, 'Turn off') : null),
    h('div', { class: 'row', style: 'gap:8px' }, h('span', { class: 'grow', style: 'font-size:12.5px;color:var(--text-3)' }, st.set ? 'Client access is on.' : 'No client code yet: only the team can open it.'),
      h('button', { class: 'link-btn', onclick: () => { navigator.clipboard.writeText('https://cue.synapsemfg.com/download'); out.textContent = 'Link copied.'; } }, 'Copy link')),
    out);
}

async function devicesPanel() {
  const list = await call('computers:list');
  const msg = h('span', { class: 'saved' });
  const act = async (id, status) => { const r = await call('computers:set', { id, status }); if (!r.ok) msg.textContent = r.error; renderView(); };
  const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 2 ? 'now' : m < 60 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };
  const pending = list.filter((d) => d.status === 'pending');
  return h('div', { class: 'panel' }, h('div', { class: 'row' }, h('h3', { class: 'grow' }, 'Devices'), msg),
    h('p', { class: 'hint' }, 'Cue only opens on computers and browsers you approve. Removing one signs it out right away, including its Claude connector.'),
    pending.length ? h('div', { class: 'banner warn', style: 'margin-bottom:10px' }, `${pending.length} waiting for your approval`) : null,
    h('ul', { class: 'members devices' }, list.map((d) => h('li', { class: d.status },
      h('span', { class: 'avatar', title: d.platform, html: d.platform === 'Web' ? ICON.globe : ICON.laptop }),
      h('span', { class: 'grow' },
        h('b', { title: 'Click to rename', style: 'cursor:text', onclick: async () => { const n = prompt('Name for this computer', d.name); if (n && n.trim() && n !== d.name) { await call('computers:rename', { id: d.id, name: n.trim() }); renderView(); } } }, d.name),
        h('span', {}, ` ${d.owner}${d.thisDevice ? ' · this computer' : ''} · seen ${ago(d.lastSeen)}`)),
      d.status === 'pending' ? h('button', { class: 'btn primary', onclick: () => act(d.id, 'approved') }, 'Approve') : null,
      d.status === 'revoked' ? h('span', { class: 'chip bad' }, 'Removed') : h('span', { class: 'chip' }, d.status === 'approved' ? 'Approved' : 'Waiting'),
      d.status !== 'revoked' && !d.thisDevice ? h('button', { class: 'link-btn danger', onclick: () => { if (confirm(`Remove “${d.name}”? It will be signed out right away.`)) act(d.id, 'revoked'); } }, d.status === 'pending' ? 'Deny' : 'Remove') : null,
      d.status === 'revoked' ? h('button', { class: 'link-btn', onclick: () => act(d.id, 'approved') }, 'Approve again') : null))));
}

// How the live coach judges talk time (team-wide; Claude can change it too).
async function coachingPanel() {
  const c = await call('coaching:get');
  const msg = h('span', { class: 'saved' });
  const save = debounce(async (patch) => { const r = await call('coaching:save', patch); msg.textContent = r.ok ? 'Saved' : r.error; setTimeout(() => { msg.textContent = ''; }, 1500); }, 500);
  const num = (val, min, max, onSet) => h('input', { type: 'number', class: 'input coach-num', value: val, min, max, oninput: (e) => { const v = Math.max(min, Math.min(max, Number(e.target.value) || 0)); onSet(v); } });
  const stages = [['opening', 'Opening'], ['discovery', 'Discovery'], ['pitch', 'Pitch'], ['objection', 'Objection'], ['close', 'Close'], ['wrap_up', 'Wrap-up']];
  return h('div', { class: 'panel' }, h('div', { class: 'row' }, h('h3', { class: 'grow' }, 'Coaching'), msg),
    h('p', { class: 'hint' }, 'The coach works out which stage the call is in and nudges toward your talk share for that stage, plus monologues, cutting in, questions and pace.'),
    h('div', { class: 'coach-grid' }, stages.map(([id, label]) => h('label', { class: 'coach-cell' }, h('span', {}, label), h('span', { class: 'coach-pct' }, num(c.talk_targets[id], 10, 90, (v) => save({ talk_targets: { [id]: v } })), '%')))),
    h('div', { class: 'coach-grid two' },
      h('label', { class: 'coach-cell' }, h('span', {}, 'Longest monologue'), h('span', { class: 'coach-pct' }, num(c.monologue_seconds, 20, 300, (v) => save({ monologue_seconds: v })), 's')),
      h('label', { class: 'coach-cell' }, h('span', {}, 'In discovery'), h('span', { class: 'coach-pct' }, num(c.discovery_monologue_seconds, 15, 300, (v) => save({ discovery_monologue_seconds: v })), 's')),
      h('label', { class: 'coach-cell' }, h('span', {}, 'Fastest pace'), h('span', { class: 'coach-pct' }, num(c.pace_wpm, 120, 260, (v) => save({ pace_wpm: v })), 'wpm')),
      h('label', { class: 'coach-cell' }, h('span', {}, 'Time between tips'), h('span', { class: 'coach-pct' }, num(c.nudge_cooldown_seconds, 30, 600, (v) => save({ nudge_cooldown_seconds: v })), 's'))));
}

async function shareDomainPanel() {
  const base = await call('share:base');
  const input = h('input', { type: 'text', class: 'input', value: base, spellcheck: 'false', style: 'flex:1' });
  const msg = h('span', { class: 'saved' });
  return h('div', { class: 'panel' }, h('h3', {}, 'Share links'),
    h('p', { class: 'hint' }, 'Links look like this address + /notes/<long id>. Change it to https://ops.synapsemfg.com once the ops dashboard forwards /notes. Existing links switch over too.'),
    h('div', { class: 'row' }, input, h('button', { class: 'btn', onclick: async () => {
      const r = await call('share:setBase', input.value);
      msg.textContent = r.ok ? 'Saved' : r.error; if (r.ok) input.value = r.base;
    } }, 'Save'), msg));
}

async function adminPanel() {
  const members = await call('team:list');
  const err = h('div', { class: 'form-error' });
  const name = h('input', { type: 'text', placeholder: 'Name', class: 'input' });
  const email = h('input', { type: 'text', placeholder: 'name@synapsemfg.com', class: 'input', spellcheck: 'false' });
  const role = h('select', { class: 'input' }, h('option', { value: 'member' }, 'Member'), h('option', { value: 'admin' }, 'Admin'));
  const pin = h('input', { type: 'password', inputmode: 'numeric', placeholder: 'New PIN', class: 'input pin-input', maxlength: '12' });
  const pinMsg = h('span', { class: 'saved' });
  return h('div', { class: 'panel' }, h('h3', {}, 'Team'),
    h('ul', { class: 'members' }, members.map((m) => h('li', {},
      h('span', { class: 'avatar' }, (m.name || m.email)[0].toUpperCase()),
      h('span', { class: 'grow' }, h('b', {}, m.name), h('span', {}, ` ${m.email}`)),
      h('span', { class: 'chip' }, m.role === 'admin' ? 'Admin' : 'Member'),
      h('span', { class: 'saved', style: 'min-width:70px;text-align:right' }, m.joinedAt ? 'signed in' : 'not yet'),
      m.email === authState.user?.email ? null : h('button', { class: 'link-btn danger', onclick: async () => {
        if (!confirm(`Remove ${m.name} from the team? Their calls stay; they lose access.`)) return;
        const r = await call('team:removeMember', m.email); if (!r.ok) alert(r.error); renderView();
      } }, 'Remove')))),
    h('form', { class: 'row add-member', onsubmit: async (e) => {
      e.preventDefault(); err.textContent = '';
      if (!name.value.trim() || !/^\S+@\S+\.\S+$/.test(email.value.trim())) { err.textContent = 'Enter a name and an email.'; return; }
      const r = await call('team:setMember', { email: email.value, name: name.value, role: role.value });
      if (!r.ok) { err.textContent = r.error; return; }
      renderView();
    } }, name, email, role, h('button', { class: 'btn', type: 'submit' }, 'Add')),
    err,
    h('form', { class: 'row', style: 'margin:6px 0 12px', onsubmit: async (e) => {
      e.preventDefault();
      if (!/^\d{6,12}$/.test(pin.value)) { pinMsg.textContent = 'Use 6 to 12 digits.'; return; }
      if (!confirm('Change the team PIN? Everyone else is signed out and signs back in with the new PIN. Tell the team first.')) return;
      const r = await call('team:setPin', pin.value);
      pinMsg.textContent = r.ok ? 'PIN changed. Tell the team.' : r.error; pin.value = '';
    } }, h('span', { class: 'lbl', style: 'margin-right:4px' }, 'Team PIN'), pin, h('button', { class: 'btn', type: 'submit' }, 'Change PIN'), pinMsg));
}

// ---------------------------------------------------------------------------
// Folders (sidebar tree + folder page), Granola style
// ---------------------------------------------------------------------------

let foldersCache = [];
let spacesCache = [];
let addingFolder = null;      // {parent: folderId|null, space: 'mine'|'team'|spaceId} while typing a new name
let addingSpace = false;
let renamingFolder = null;    // folder id being renamed inline
let renamingSpace = null;
let menuFor = null;           // 'f:<id>' or 's:<id>' whose ⋯ menu is open
let dragging = null;          // {kind: 'folder'|'call', id}
const collapsed = new Set((() => { try { return JSON.parse(localStorage.getItem('cue-folders-collapsed') || '[]'); } catch { return []; } })());
const saveCollapsed = () => { try { localStorage.setItem('cue-folders-collapsed', JSON.stringify([...collapsed])); } catch {} };

const descendants = (id) => { const out = []; const walk = (x) => { for (const k of foldersCache.filter((f) => f.parentId === x)) { out.push(k.id); walk(k.id); } }; walk(id); return out; };
const folderPath = (id) => { const parts = []; let f = foldersCache.find((x) => x.id === id); while (f) { parts.unshift(f.name); f = foldersCache.find((x) => x.id === f.parentId); } return parts.join(' › '); };
// Which space a folder lives in: private folders are "My notes".
const spaceOf = (f) => (f.private ? 'mine' : f.spaceId && spacesCache.some((s) => s.id === f.spaceId) ? f.spaceId : 'team');
const topFolders = (space) => foldersCache.filter((f) => spaceOf(f) === space && (!f.parentId || !foldersCache.some((p) => p.id === f.parentId)));

function folderIcon(f, size = 16) {
  return cueIcon(f.icon, size) || h('span', { class: 'folder-ico', html: ICON.folder });
}

// Notion-style icon picker (icon-picker.js), anchored to the clicked icon.
const saveFolderIcon = (f) => (icon) => call('folders:update', { id: f.id, patch: { icon } }).then(() => { renderFolders(); if (route.view === 'folder' && route.id === f.id) renderFolder(f.id); });
const saveSpaceIcon = (sp) => (icon) => call('spaces:update', { id: sp.id, patch: { icon } }).then(() => { renderFolders(); if (route.view === 'space' && route.id === sp.id) renderSpace(sp.id); });
function pickIconFor(key, value, save) {
  const anchor = document.querySelector(`[data-icon-for="${key}"]`);
  if (anchor) openIconPicker(anchor, { value, onPick: save });
}

const menuItem = (label, fn, danger) => h('button', { class: danger ? 'danger' : '', type: 'button', onclick: (e) => { e.stopPropagation(); menuFor = null; fn(); } }, label);

function folderMenu(f) {
  return h('div', { class: 'pop menu-pop', onclick: (e) => e.stopPropagation() },
    menuItem('Rename', () => { renamingFolder = f.id; renderFolders(); }),
    menuItem('Change icon', () => { pickIconFor(`f:${f.id}`, f.icon, saveFolderIcon(f)); renderFolders(); }),
    menuItem('New folder inside', () => { addingFolder = { parent: f.id, space: spaceOf(f) }; collapsed.delete(f.id); saveCollapsed(); renderFolders(); }),
    f.parentId ? menuItem('Move out of its folder', async () => { const r = await call('folders:update', { id: f.id, patch: { parentId: null } }); if (!r.ok) alert(r.error); renderFolders(); }) : null,
    spaceOf(f) !== 'mine' ? menuItem('Move to My notes (private)', async () => { const r = await call('folders:toSpace', { id: f.id, target: 'mine' }); if (!r.ok) alert(r.error); renderFolders(); }) : null,
    spaceOf(f) !== 'team' ? menuItem('Move to Team', async () => { const r = await call('folders:toSpace', { id: f.id, target: 'team' }); if (!r.ok) alert(r.error); renderFolders(); }) : null,
    ...spacesCache.filter((sp) => spaceOf(f) !== sp.id).map((sp) => menuItem(`Move to ${sp.name}`, async () => { const r = await call('folders:toSpace', { id: f.id, target: sp.id }); if (!r.ok) alert(r.error); renderFolders(); })),
    menuItem('Delete', async () => {
      if (!confirm(`Delete the folder "${f.name}"? Its calls stay in All calls, and folders inside it move up.`)) return;
      await call('folders:delete', f.id); if (route.view === 'folder' && route.id === f.id) go({ view: 'home' }); else renderFolders();
    }, true));
}

function spaceMenu(sp) {
  const custom = sp.id !== 'mine' && sp.id !== 'team';
  return h('div', { class: 'pop menu-pop', onclick: (e) => e.stopPropagation() },
    menuItem('New folder', () => { addingFolder = { parent: null, space: sp.id }; collapsed.delete(`s:${sp.id}`); saveCollapsed(); renderFolders(); }),
    custom ? menuItem('Rename', () => { renamingSpace = sp.id; renderFolders(); }) : null,
    custom ? menuItem('Change icon', () => { pickIconFor(`s:${sp.id}`, sp.icon, saveSpaceIcon(sp)); renderFolders(); }) : null,
    custom ? menuItem('Delete space', async () => {
      if (!confirm(`Delete the space "${sp.name}"? Its folders move to Team.`)) return;
      await call('spaces:delete', sp.id); if (route.view === 'space' && route.id === sp.id) go({ view: 'home' }); else renderFolders();
    }, true) : null);
}

// Drop targets.
async function dropOnFolder(targetId) {
  const d = dragging; dragging = null;
  if (!d) return;
  if (d.kind === 'call') {
    for (const cid of d.ids || [d.id]) { const r = await call('calls:move', { id: cid, folderId: targetId }); if (!r.ok) { alert(r.error); break; } }
    clearSelection();
  } else if (d.kind === 'folder') {
    if (d.id === targetId || descendants(d.id).includes(targetId)) return;
    const target = foldersCache.find((x) => x.id === targetId);
    const moving = foldersCache.find((x) => x.id === d.id);
    if (target && moving && spaceOf(target) !== spaceOf(moving)) {
      const r1 = await call('folders:toSpace', { id: d.id, target: spaceOf(target) });
      if (!r1.ok) { alert(r1.error); return; }
    }
    const r = await call('folders:update', { id: d.id, patch: { parentId: targetId } });
    if (!r.ok) alert(r.error);
    collapsed.delete(targetId); saveCollapsed();
  }
  renderFolders(); renderList();
  if (route.view === 'folder') renderFolder(route.id);
}

async function dropOnSpace(space) {
  const d = dragging; dragging = null;
  if (!d) return;
  if (d.kind === 'folder') {
    const r = await call('folders:toSpace', { id: d.id, target: space });
    if (!r.ok) alert(r.error);
  } else if (d.kind === 'call' && (space === 'mine' || space === 'team')) {
    for (const cid of d.ids || [d.id]) { const r = await call('calls:visibility', { id: cid, visibility: space === 'mine' ? 'private' : 'team' }); if (!r.ok) { alert(r.error); break; } }
    clearSelection();
  }
  collapsed.delete(`s:${space}`); saveCollapsed();
  renderFolders(); renderList();
}

function dropZone(el, onDrop, accepts = () => true) {
  el.addEventListener('dragover', (e) => { if (!dragging || !accepts(dragging)) return; e.preventDefault(); el.classList.add('drop'); });
  el.addEventListener('dragleave', () => el.classList.remove('drop'));
  el.addEventListener('drop', (e) => { if (!dragging) return; e.preventDefault(); el.classList.remove('drop'); onDrop(); });
}

function makeDraggable(el, kind, id) {
  el.setAttribute('draggable', 'true');
  el.addEventListener('dragstart', (e) => {
    const ids = kind === 'call' ? dragIds(id) : [id];
    dragging = { kind, id, ids };
    e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id);
    if (kind === 'call') dragBadge(e, ids.length);
    el.classList.add('dragging');
  });
  el.addEventListener('dragend', () => { el.classList.remove('dragging'); setTimeout(() => { dragging = null; }, 0); });
}

function inlineRename(value, onDone) {
  const input = h('input', { class: 'rename', value, onclick: (e) => e.stopPropagation(),
    onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { e.target.value = value; e.target.blur(); } },
    onblur: (e) => onDone(e.target.value.trim()) });
  setTimeout(() => { input.focus(); input.select(); }, 10);
  return input;
}

function folderRow(f, depth) {
  const children = foldersCache.filter((x) => x.parentId === f.id);
  const open = !collapsed.has(f.id);
  const on = route.view === 'folder' && route.id === f.id;
  const chevron = children.length
    ? h('button', { class: `chev ${open ? 'open' : ''}`, type: 'button', 'aria-label': open ? 'Collapse' : 'Expand', html: ICON.chev, onclick: (e) => { e.stopPropagation(); open ? collapsed.add(f.id) : collapsed.delete(f.id); saveCollapsed(); renderFolders(); } })
    : h('span', { class: 'chev-space' });
  const label = renamingFolder === f.id
    ? inlineRename(f.name, async (v) => { renamingFolder = null; if (v && v !== f.name) await call('folders:update', { id: f.id, patch: { name: v } }); renderFolders(); if (route.view === 'folder' && route.id === f.id) renderFolder(f.id); })
    : h('span', { class: 'grow' }, f.name);
  const row = h('div', { class: `folder-row ${on ? 'on' : ''}`, style: `padding-left:${4 + depth * 14}px`, onclick: () => go({ view: 'folder', id: f.id }),
    ondblclick: (e) => { e.stopPropagation(); renamingFolder = f.id; renderFolders(); } },
    chevron,
    h('button', { class: 'icon-btn-f', type: 'button', title: 'Change icon', 'data-icon-for': `f:${f.id}`, onclick: (e) => { e.stopPropagation(); if (menuFor) { menuFor = null; renderFolders(); } openIconPicker(e.currentTarget, { value: f.icon, onPick: saveFolderIcon(f) }); } }, folderIcon(f)),
    label,
    f.count ? h('span', { class: 'n' }, f.count) : null,
    h('button', { class: 'dots', type: 'button', title: 'More', 'aria-label': `More for ${f.name}`, html: ICON.dots, onclick: (e) => { e.stopPropagation(); closeIconPicker(); menuFor = menuFor === `f:${f.id}` ? null : `f:${f.id}`; renderFolders(); } }));
  if (renamingFolder !== f.id) makeDraggable(row, 'folder', f.id);
  dropZone(row, () => dropOnFolder(f.id), (d) => !(d.kind === 'folder' && (d.id === f.id || descendants(d.id).includes(f.id))));
  const out = [h('div', { class: 'folder-wrap' }, row,
    menuFor === `f:${f.id}` ? folderMenu(f) : null,)];
  if (open) for (const c of children) out.push(...folderRow(c, depth + 1));
  if (addingFolder && addingFolder.parent === f.id) out.push(newFolderInput(addingFolder, depth + 1));
  return out;
}

function newFolderInput(spec, depth) {
  const input = h('input', { class: 'input', placeholder: 'Folder name' });
  const form = h('form', { class: 'folder-add', style: `padding-left:${18 + depth * 14}px`, onsubmit: async (e) => {
    e.preventDefault();
    const v = input.value.trim();
    addingFolder = null;
    if (v) { const r = await call('folders:create', { name: v, parentId: spec.parent || null, space: spec.space }); if (r.ok) { await renderFolders(); go({ view: 'folder', id: r.id }); return; } alert(r.error); }
    renderFolders();
  } }, input);
  input.addEventListener('blur', () => { if (!input.value.trim()) { addingFolder = null; renderFolders(); } });
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { addingFolder = null; renderFolders(); } });
  setTimeout(() => input.focus(), 10);
  return form;
}

function spaceRow(sp) {
  const key = `s:${sp.id}`;
  const folders = topFolders(sp.id);
  const open = !collapsed.has(key);
  const on = route.view === 'space' && route.id === sp.id;
  const icon = sp.id === 'mine' ? h('span', { class: 'space-ico lock-ico', html: ICON.lock })
    : sp.id === 'team' ? h('img', { class: 'space-ico', src: 'assets/logo.svg', alt: '' })
    : sp.id === 'clients' ? cueIcon('handshake', 16)
    : h('button', { class: 'icon-btn-f', type: 'button', title: 'Change icon', 'data-icon-for': key, onclick: (e) => { e.stopPropagation(); if (menuFor) { menuFor = null; renderFolders(); } openIconPicker(e.currentTarget, { value: sp.icon, onPick: saveSpaceIcon(sp) }); } },
      cueIcon(sp.icon, 16) || h('span', { class: 'space-letter' }, (sp.name || '?')[0].toUpperCase()));
  const label = renamingSpace === sp.id
    ? inlineRename(sp.name, async (v) => { renamingSpace = null; if (v && v !== sp.name) await call('spaces:update', { id: sp.id, patch: { name: v } }); renderFolders(); })
    : h('span', { class: 'grow' }, sp.name);
  const row = h('div', { class: `folder-row space-row ${on ? 'on' : ''}`, onclick: () => go({ view: 'space', id: sp.id }) },
    folders.length || (addingFolder && addingFolder.space === sp.id && !addingFolder.parent)
      ? h('button', { class: `chev ${open ? 'open' : ''}`, type: 'button', 'aria-label': open ? 'Collapse' : 'Expand', html: ICON.chev, onclick: (e) => { e.stopPropagation(); open ? collapsed.add(key) : collapsed.delete(key); saveCollapsed(); renderFolders(); } })
      : h('span', { class: 'chev-space' }),
    icon, label,
    sp.id === 'clients' ? null : h('button', { class: 'dots', type: 'button', title: 'More', 'aria-label': `More for ${sp.name}`, html: ICON.dots, onclick: (e) => { e.stopPropagation(); closeIconPicker(); menuFor = menuFor === key ? null : key; renderFolders(); } }));
  if (sp.id !== 'clients') dropZone(row, () => dropOnSpace(sp.id), (d) => d.kind === 'folder' || sp.id === 'mine' || sp.id === 'team');
  const out = [h('div', { class: 'folder-wrap' }, row,
    menuFor === key ? spaceMenu(sp) : null,)];
  if (open) {
    for (const f of folders) out.push(...folderRow(f, 1));
    if (addingFolder && addingFolder.space === sp.id && !addingFolder.parent) out.push(newFolderInput(addingFolder, 1));
  }
  return out;
}

async function renderFolders() {
  const el = document.getElementById('folders');
  if (!el) return;
  if (!authState.user || isClientUser()) { el.replaceChildren(); foldersCache = []; spacesCache = []; return; }
  [foldersCache, spacesCache] = await Promise.all([call('folders:list'), call('spaces:list')]);
  const spaces = [{ id: 'mine', name: 'My notes' }, { id: 'team', name: 'Team' }, ...spacesCache, { id: 'clients', name: 'Clients', icon: 'handshake' }];
  const newSpace = addingSpace ? h('form', { class: 'folder-add', style: 'padding-left:22px', onsubmit: async (e) => {
    e.preventDefault();
    const v = e.target.querySelector('input').value.trim();
    addingSpace = false;
    if (v) { const r = await call('spaces:create', { name: v }); if (!r.ok) alert(r.error); }
    renderFolders();
  } }, h('input', { class: 'input', placeholder: 'Space name, e.g. Sales & Operations', onblur: (e) => { if (!e.target.value.trim()) { addingSpace = false; renderFolders(); } } })) : null;
  // The heading stays put; what's under each space folds.
  el.replaceChildren(
    h('div', { class: 'side-label row-label' }, h('span', { class: 'grow' }, 'Spaces'),
      h('button', { class: 'mini-btn', title: 'New space', 'aria-label': 'New space', html: ICON.plus, onclick: () => { addingSpace = true; renderFolders(); } })),
    ...spaces.flatMap(spaceRow), newSpace,
    h('div', { class: 'side-gap' }),
    binRow('archive', 'Archive', 'archive'), binRow('trash', 'Deleted', 'trash'));
  if (newSpace) setTimeout(() => newSpace.querySelector('input').focus(), 10);
}
document.addEventListener('click', () => { if (menuFor) { menuFor = null; renderFolders(); } });

// ---- What wins -------------------------------------------------------------------------
// Won sales calls next to lost ones, per preset: which beats, objections and habits
// actually go with closing. Outcomes come from Salesforce on their own.

function outcomePicker(c) {
  if (!authState.user || c.mode === 'notes' && !c.outcome) return null;
  const wrap = h('span', { class: 'oc-pick', title: c.outcomeSource === 'manual' ? 'Set by hand' : c.outcomeSource === 'salesforce' ? 'From Salesforce (click to change)' : 'Did this deal close?' });
  const draw = (cur) => wrap.replaceChildren(...[['won', 'Won'], ['lost', 'Lost'], ['open', 'Open']].map(([v, label]) => h('button', { class: `oc-btn ${cur === v ? `on ${v}` : ''}`, onclick: async () => {
    const next = cur === v ? null : v;
    const r = await call('calls:outcome', { ids: [c.id], outcome: next });
    if (!r.ok) return alert(r.error);
    c.outcome = next; draw(next);
  } }, label)));
  draw(c.outcome);
  return wrap;
}

let winsPreset = null;
async function renderWins() {
  const w = await call('wins:get');
  if (route.view !== 'wins') return;
  if (!w.presets.length) { $view.replaceChildren(h('h1', { class: 'page' }, 'What wins'), h('p', { class: 'sub' }, 'Make a coaching preset first.')); return; }
  if (!winsPreset || !w.presets.some((p) => p.id === winsPreset)) winsPreset = w.presets[0].id;
  const p = w.presets.find((x) => x.id === winsPreset);
  const st = w.stats[p.id] || { won: 0, lost: 0, beats: [], objections: [] };
  const hs = w.habits || { won: 0, lost: 0, habits: [], dream: {}, talk: {}, signer: {} };
  const enough = hs.won >= w.minEach && hs.lost >= w.minEach;
  const pct = (r) => (r && r.n ? `${r.k}/${r.n}` : '–');
  const bar = (r, kind) => h('span', { class: `wb ${kind}` }, h('i', { style: `width:${r && r.n ? Math.round((100 * r.k) / r.n) : 0}%` }));
  const tag = (gap, nOk) => (!nOk || gap == null ? null : gap >= 30 ? h('span', { class: 'w-tag good' }, 'Goes with wins') : gap <= -20 ? h('span', { class: 'w-tag bad' }, 'Goes with losses') : Math.abs(gap) < 10 ? h('span', { class: 'w-tag' }, 'No difference') : null);
  const ago = (t) => { if (!t) return 'not yet'; const m = Math.round((Date.now() - Date.parse(t)) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };
  const counted = w.rows.filter((r) => (r.outcome === 'won' || r.outcome === 'lost') && r.kind === 'sales');
  const open = w.rows.filter((r) => r.outcome === 'open' && r.kind === 'sales').length;
  const rows = (list) => h('div', { class: 'wins-table' }, [...list].sort((a, b) => (b.gap ?? -999) - (a.gap ?? -999)).map((b) => h('div', { class: 'wt-row' },
    h('span', { class: 'wt-label' }, b.label, tag(b.gap, b.won.n >= 2 && b.lost.n >= 2)),
    h('span', { class: 'wt-cell' }, bar(b.won, 'won'), h('small', {}, `won ${pct(b.won)}`)),
    h('span', { class: 'wt-cell' }, bar(b.lost, 'lost'), h('small', {}, `lost ${pct(b.lost)}`)))));
  $view.replaceChildren(
    h('h1', { class: 'page' }, 'What wins'),
    h('p', { class: 'sub' }, 'Won sales calls next to lost ones: which habits actually go with closing. Outcomes come from Salesforce by themselves, and client calls (reviews, onboarding) are left out.'),
    h('div', { class: 'wins-sync' }, h('span', { class: `dot ${w.sync.running ? 'busy' : w.sync.error ? 'bad' : 'ok'}` }),
      w.sync.running ? `Updating from Salesforce… ${w.sync.analyzed ? `${w.sync.analyzed} calls read so far, ` : ''}numbers fill in as calls are read` : w.sync.error ? `Last update failed: ${w.sync.error}` : `Updated from Salesforce ${ago(w.sync.at)}${w.sync.web ? '' : ' · every 6 hours'}`,
      !WEB && authState.user?.role === 'admin' && !w.sync.running ? h('button', { class: 'link-btn', onclick: async () => { await call('wins:sync'); setTimeout(renderWins, 300); } }, 'Update now') : null,
      !WEB && authState.user?.role === 'admin' && w.sync.running ? h('button', { class: 'link-btn', title: 'Stop this update and start again (calls already read are kept)', onclick: async (e) => { e.target.disabled = true; e.target.textContent = 'Restarting…'; await call('wins:restart'); setTimeout(renderWins, 500); } }, 'Restart') : null),
    h('div', { class: 'wins-sum' },
      h('div', { class: 'ws won' }, h('b', {}, hs.won), h('span', {}, 'won sales calls')),
      h('div', { class: 'ws lost' }, h('b', {}, hs.lost), h('span', {}, `lost · ${open} still open`)),
      h('div', { class: 'ws' }, h('b', {}, hs.dream?.won ?? '–'), h('span', {}, `outcome selling, won (lost ${hs.dream?.lost ?? '–'})`)),
      h('div', { class: 'ws' }, h('b', {}, hs.talk?.won != null ? `${hs.talk.won}%` : '–'), h('span', {}, `rep talk share, won (lost ${hs.talk?.lost != null ? `${hs.talk.lost}%` : '–'})`)),
      h('div', { class: 'ws' }, h('b', {}, pct(hs.signer?.won)), h('span', {}, `signer on the call, won (lost ${pct(hs.signer?.lost)})`))),
    !enough ? h('div', { class: 'banner warn' }, `Early signal: ${hs.won} won and ${hs.lost} lost sales calls so far. Treat these as hints; they sharpen as deals close.`) : null,
    h('div', { class: 'section-head' }, h('h2', {}, 'Habits · every offer')),
    rows(hs.habits || []),
    w.presets.length > 1 ? h('div', { class: 'tabs-row' }, w.presets.map((x) => h('button', { class: `chip-btn ${x.id === p.id ? 'on' : ''}`, onclick: () => { winsPreset = x.id; renderWins(); } }, x.name))) : null,
    h('div', { class: 'section-head' }, h('h2', {}, `Beats · ${p.name}`)),
    st.won + st.lost ? rows(st.beats) : h('div', { class: 'placeholder' }, 'Compared once won and lost calls have been made with this preset in Cue (its beats only make sense for its offer). The live card starts using them at 3 of each.'),
    st.won + st.lost && st.objections.length ? h('div', { class: 'section-head' }, h('h2', {}, 'Objections')) : null,
    st.won + st.lost && st.objections.length ? h('div', { class: 'wins-table' }, st.objections.map((o) => h('div', { class: 'wt-row' },
      h('span', { class: 'wt-label' }, o.title, h('small', { class: 'wt-sub' }, `answered well: won ${pct(o.answeredWon)} · lost ${pct(o.answeredLost)}`)),
      h('span', { class: 'wt-cell' }, bar(o.won, 'won'), h('small', {}, `came up, won ${pct(o.won)}`)),
      h('span', { class: 'wt-cell' }, bar(o.lost, 'lost'), h('small', {}, `lost ${pct(o.lost)}`))))) : null,
    h('div', { class: 'section-head' }, h('h2', {}, `Calls counted · ${counted.length}`)),
    counted.length ? h('div', { class: 'folder-list' }, counted.map((r) => h('button', { class: 'folder-call', onclick: () => go({ view: 'call', id: r.id }) },
      h('span', { class: 'grow' }, h('b', {}, h('span', { class: `oc-pill ${r.outcome}` }, r.outcome === 'won' ? 'Won' : 'Lost'), ' ', r.title || 'Untitled call'),
        h('span', {}, [dayLabel(r.startedAt), r.owner, r.source === 'manual' ? 'set by hand' : 'from Salesforce'].filter(Boolean).join(' · '))))))
      : h('div', { class: 'placeholder' }, w.sync.running ? 'Reading the calls… this takes a few minutes the first time.' : 'No won or lost sales calls read yet.'));
}

// Archive and Deleted, under the spaces. Drop calls on them, too.
function binRow(view, label, icon) {
  const row = h('div', { class: `folder-row bin-row ${route.view === view ? 'on' : ''}`, onclick: () => go({ view }) },
    h('span', { class: 'chev-space' }), h('span', { class: 'space-ico', html: ICON[icon] }), h('span', { class: 'grow' }, label));
  dropZone(row, () => {
    const d = dragging; dragging = null;
    if (d?.kind === 'call') view === 'trash' ? trashCalls(d.ids) : archiveCalls(d.ids, true);
  }, (d) => d.kind === 'call');
  return h('div', { class: 'folder-wrap' }, row);
}

async function renderArchive() {
  const fresh = pageTicket();
  const calls = await call('calls:archived');
  if (!fresh()) return;
  $view.replaceChildren(
    h('h1', { class: 'page' }, 'Archive'),
    h('p', { class: 'hint', style: 'margin:0 0 18px;color:var(--text-3)' }, 'Calls you archived. They’re out of Home and the folders but still show up in search and for Claude. Right-click or hover a call to bring it back.'),
    calls.length ? h('div', { class: 'call-items' }, callRows(calls)) : h('div', { class: 'live-empty' }, h('span', { class: 'le-ring', html: ICON.archive }), h('b', {}, 'Nothing archived'), h('span', {}, 'Hover a call and click the box icon to archive it.')));
}

async function renderTrash() {
  const fresh = pageTicket();
  const list = await call('trash:list');
  const admin = authState.user?.role === 'admin';
  const days = (t) => Math.max(0, Math.ceil((t - Date.now()) / 86_400_000));
  const rows = list.map((m) => h('div', { class: 'trash-row' },
    h('span', { class: 'grow' },
      h('b', {}, m.title || 'Untitled call'),
      h('span', {}, [`${dayLabel(m.startedAt)} ${timeOf(m.startedAt)}`, m.owner, `deleted ${ago(m.deletedAt)}${m.deletedBy ? ` by ${m.deletedBy.split(' ')[0]}` : ''}`].filter(Boolean).join(' · '))),
    h('span', { class: 'trash-days' }, `${days(m.purgeAt)} day${days(m.purgeAt) === 1 ? '' : 's'} left`),
    h('button', { class: 'btn', onclick: async () => { const r = await call('trash:restore', [m.id]); if (!r.ok) return alert(r.error); flash('Restored'); renderTrash(); renderList(); renderFolders(); } }, 'Restore'),
    h('button', { class: 'link-btn danger', onclick: async () => {
      if (!confirm(`Delete “${m.title || 'this call'}” for good? Its notes and transcript can’t be brought back.`)) return;
      const r = await call('trash:purge', [m.id]); if (!r.ok) return alert(r.error); renderTrash();
    } }, 'Delete forever')));
  if (!fresh()) return;
  $view.replaceChildren(
    h('div', { class: 'row', style: 'align-items:flex-end;gap:12px' },
      h('h1', { class: 'page', style: 'flex:1;margin-bottom:0' }, 'Deleted'),
      list.length ? h('button', { class: 'btn danger-btn', onclick: async () => {
        if (!confirm(`Delete all ${list.length} call${list.length === 1 ? '' : 's'} in here for good? This can’t be undone.`)) return;
        const r = await call('trash:purge', null); if (!r.ok) return alert(r.error); flash('Deleted emptied'); renderTrash();
      } }, 'Empty Deleted') : null),
    h('p', { class: 'hint', style: 'margin:8px 0 18px;color:var(--text-3)' }, `Deleted calls stay here for 30 days, then they’re removed for good. Nobody else sees them${admin ? ' (as the admin you see everyone’s)' : ''}.`),
    list.length ? h('div', { class: 'trash-list' }, rows) : h('div', { class: 'live-empty' }, h('span', { class: 'le-ring', html: ICON.trash }), h('b', {}, 'Nothing deleted'), h('span', {}, 'Deleted calls wait here for 30 days.')));
}

async function renderFolder(id) {
  const fresh = pageTicket();
  if (!foldersCache.some((x) => x.id === id)) foldersCache = await call('folders:list');
  if (!fresh()) return;
  const f = foldersCache.find((x) => x.id === id);
  if (!f) return go({ view: 'home' });
  const meetings = await call('folders:meetings', id);
  const saveName = debounce(async (v) => { await call('folders:update', { id, patch: { name: v } }); renderFolders(); }, 500);
  const blocked = new Set([id, ...descendants(id)]);
  const parentOpts = foldersCache.filter((x) => !blocked.has(x.id)).map((x) => h('option', { value: x.id, selected: x.id === f.parentId }, folderPath(x.id)));
  await loadCompanyNames();
  if (!fresh()) return;
  const out = callRows(meetings);
  const iconBtn = h('button', { class: 'big-icon', type: 'button', title: 'Change icon', onclick: (e) => { e.stopPropagation(); openIconPicker(e.currentTarget, { value: f.icon, onPick: saveFolderIcon(f) }); } }, cueIcon(f.icon, 30) || h('span', { class: 'folder-ico big', html: ICON.folder }));
  $view.replaceChildren(
    h('div', { class: 'folder-head' }, iconBtn,
      h('input', { class: 'title-input', value: f.name, placeholder: 'Folder name', oninput: (e) => saveName(e.target.value) })),
    h('div', { class: 'row folder-tools', style: 'margin:-8px 0 22px;gap:12px' },
      h('span', { class: 'saved' }, `${meetings.length} call${meetings.length === 1 ? '' : 's'}`),
      h('label', { class: 'lbl' }, 'Inside ', h('select', { class: 'chip-select', onchange: async (e) => { const r = await call('folders:update', { id, patch: { parentId: e.target.value || null } }); if (!r.ok) alert(r.error); renderFolders(); renderFolder(id); } },
        h('option', { value: '' }, 'Top level'), parentOpts)),
      h('button', { class: `chip-btn ${f.private ? 'on' : ''}`, onclick: async () => {
        const r = await call('folders:visibility', { id, visibility: f.private ? 'team' : 'private' });
        if (!r.ok) { alert(r.error); return; }
        await renderFolders(); renderFolder(id);
      } }, h('span', { html: f.private ? ICON.lock : ICON.team, style: 'display:inline-grid;width:12px;height:12px;vertical-align:-1px;margin-right:5px' }), f.private ? 'Only me' : 'Shared with team'),
      h('span', { class: 'grow' }),
      h('button', { class: 'link-btn', onclick: () => { addingFolder = { parent: id, space: spaceOf(f) }; collapsed.delete(id); saveCollapsed(); renderFolders(); } }, 'New sub-folder'),
      h('button', { class: 'link-btn danger', onclick: async () => {
        if (!confirm(`Delete the folder "${f.name}"? Its calls stay in All calls, and folders inside it move up.`)) return;
        await call('folders:delete', id); await renderFolders(); go({ view: 'home' });
      } }, 'Delete')),
    meetings.length ? h('div', { class: 'folder-list' }, out) : h('div', { class: 'placeholder' }, 'No calls here yet. Drag a call from the sidebar onto this folder, or pick the folder at the top of a call.'),
    // Ask about every call in this folder (and the folders inside it), like Granola's folder chat.
    meetings.length && authState.user && !isClientUser() ? h('div', { class: 'ask-dock' }, askPanel({ folderId: id, folderName: f.name, compact: true, dock: true })) : null,
  );
}

// The folder picker and privacy toggle shown on a call.
function folderPicker(c) {
  if (!authState.user || !foldersCache.length) return null;
  const opts = foldersCache.slice().sort((a, b) => folderPath(a.id).localeCompare(folderPath(b.id)))
    .map((f) => h('option', { value: f.id, selected: f.id === c.folderId }, `${folderPath(f.id)}${f.private ? ' (private)' : ''}`));
  return h('select', { class: 'chip-select', title: 'Move to folder', onchange: async (e) => {
    const r = await call('calls:move', { id: c.id, folderId: e.target.value || null });
    if (!r.ok) alert(r.error);
    renderFolders(); renderCall(c.id);
  } }, h('option', { value: '' }, 'No folder'), opts);
}

function privacyToggle(c) {
  if (!authState.user || c.mine === false) return null;
  const priv = c.visibility === 'private';
  return h('button', { class: `chip-btn ${priv ? 'on' : ''}`, title: priv ? 'Only you can see this call' : 'Your team can see this call', onclick: async () => {
    const r = await call('calls:visibility', { id: c.id, visibility: priv ? 'team' : 'private' });
    if (!r.ok) { alert(r.error); return; }
    renderCall(c.id); renderList();
  } }, h('span', { html: priv ? ICON.lock : ICON.team, style: 'display:inline-grid;width:12px;height:12px;vertical-align:-1px;margin-right:5px' }), priv ? 'Only me' : 'Team');
}

// Share link: anyone with it can read the notes and transcript until it's turned off.
// One click makes the link (if there isn't one yet) and copies it.
async function copyShareLink(id) {
  let share = await call('share:get', id).catch(() => null);
  if (!share) {
    const r = await call('share:create', id);
    if (!r.ok) { alert(r.error); return null; }
    share = r;
  }
  await navigator.clipboard.writeText(share.url).catch(() => {});
  return share;
}

// A small note at the bottom of the window ("Link copied"), with Undo when given.
function flash(text, undo) {
  document.querySelectorAll('.flash').forEach((x) => x.remove());
  const el = h('div', { class: 'flash' }, h('span', {}, text),
    undo ? h('button', { class: 'flash-undo', onclick: async () => { el.remove(); await undo(); } }, 'Undo') : null);
  document.body.append(el);
  const ms = undo ? 6000 : 1800;
  setTimeout(() => el.classList.add('out'), ms);
  setTimeout(() => el.remove(), ms + 400);
}

// ---- Archive and Deleted ----------------------------------------------------------

function afterCallsMoved(ids) {
  clearSelection();
  renderList(); renderFolders();
  if ((route.view === 'call' || route.view === 'monitor') && ids.includes(route.id)) go({ view: 'home' }); else renderView();
}
async function trashCalls(ids) {
  ids = [].concat(ids);
  const r = await call('calls:delete', ids);
  if (r && r.ok === false) { alert(r.error); return; }
  afterCallsMoved(ids);
  flash(ids.length === 1 ? 'Moved to Deleted' : `${ids.length} calls moved to Deleted`, async () => { await call('trash:restore', ids); renderList(); renderFolders(); renderView(); });
}
async function archiveCalls(ids, on = true) {
  ids = [].concat(ids);
  const r = await call('calls:archive', { ids, on });
  if (!r.ok) { alert(r.error); return; }
  afterCallsMoved(on ? ids : []);
  flash(on ? (ids.length === 1 ? 'Archived' : `${ids.length} calls archived`) : 'Back in your notes', async () => { await call('calls:archive', { ids, on: !on }); renderList(); renderFolders(); renderView(); });
}
// The calls an action applies to: the whole selection if this call is part of it.
const actionIds = (id) => (selectedCalls.has(id) && selectedCalls.size > 1 ? [...selectedCalls] : [id]);

// Right-click menu, drawn by Cue so it looks the same on Mac, Windows and web.
function contextMenu(e, items) {
  e.preventDefault();
  document.querySelectorAll('.ctx-menu').forEach((x) => x.remove());
  const menu = h('div', { class: 'pop menu-pop ctx-menu' }, items.filter(Boolean).map(([label, fn, danger]) =>
    h('button', { class: danger ? 'danger' : '', onclick: () => { menu.remove(); fn(); } }, label)));
  document.body.append(menu);
  const r = menu.getBoundingClientRect();
  menu.style.left = `${Math.min(e.clientX, innerWidth - r.width - 8)}px`;
  menu.style.top = `${Math.min(e.clientY, innerHeight - r.height - 8)}px`;
  const close = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); removeEventListener('mousedown', close, true); } };
  setTimeout(() => addEventListener('mousedown', close, true));
}

function callContextMenu(e, c) {
  if (!authState.user || isClientUser()) return;
  const done = !isLiveNow(c);
  const ids = actionIds(c.id);
  const many = ids.length > 1 ? ` ${ids.length} calls` : '';
  contextMenu(e, [
    many ? null : ['Open', () => go(c.status === 'live' && c.mine === false ? { view: 'monitor', id: c.id } : { view: 'call', id: c.id })],
    done && !many ? ['Copy share link', async () => { if (await copyShareLink(c.id)) flash('Share link copied'); }] : null,
    done ? (c.archivedAt ? [`Unarchive${many}`, () => archiveCalls(ids, false)] : [`Archive${many}`, () => archiveCalls(ids, true)]) : null,
    done ? [`Delete${many}`, () => trashCalls(ids), true] : null,
  ]);
}

// Shown on a call row while the mouse is over it.
function rowActions(c) {
  if (!authState.user || isClientUser() || isLiveNow(c)) return null;
  const btn = (title, icon, fn) => h('button', { class: 'ra-btn', title, 'aria-label': title, html: ICON[icon],
    onmousedown: (e) => e.stopPropagation(),
    onclick: (e) => { e.stopPropagation(); e.preventDefault(); fn(e); } });
  return h('span', { class: 'row-actions' },
    btn('Copy share link', 'link', async (e) => { const b = e.currentTarget; b.classList.add('busy'); const ok = await copyShareLink(c.id); b.classList.remove('busy'); if (ok) flash('Share link copied'); }),
    c.archivedAt ? btn('Unarchive', 'unarchive', () => archiveCalls(actionIds(c.id), false)) : btn('Archive', 'archive', () => archiveCalls(actionIds(c.id), true)),
    btn('Delete', 'trash', () => trashCalls(actionIds(c.id))));
}

function shareButton(c) {
  if (!authState.user || c.status === 'live' || c.status === 'writing') return null;
  const box = h('div', { class: 'share-box', hidden: true });
  const label = h('span', {}, 'Share');
  const btn = h('button', { class: 'chip-btn share-chip', title: 'Copy a link anyone can open', onclick: async () => {
    const was = label.textContent;
    label.textContent = 'Copying…';
    const share = await copyShareLink(c.id);
    label.textContent = share ? 'Shared' : was;
    if (share) btn.classList.add('on');
    if (!share) return;
    fill(share);
    box.hidden = false;
    flash('Share link copied');
  } }, h('span', { html: ICON.link || '', style: 'display:inline-grid;width:12px;height:12px;vertical-align:-1px;margin-right:5px' }), label);
  const copy = async (url, el) => { await navigator.clipboard.writeText(url).catch(() => {}); el.textContent = 'Copied'; setTimeout(() => { el.textContent = 'Copy link'; }, 1500); };
  function fill(share) {
    box.replaceChildren(
      h('input', { class: 'input share-url', readonly: true, value: share.url, onclick: (e) => e.target.select() }),
      h('button', { class: 'btn copy-btn', onclick: (e) => copy(share.url, e.target) }, 'Copy link'),
      h('button', { class: 'link-btn danger', onclick: async () => {
        if (!confirm('Turn this link off? Anyone who has it will stop being able to open it.')) return;
        const r = await call('share:remove', c.id);
        if (!r.ok) { alert(r.error); return; }
        box.hidden = true;
        flash('Link turned off');
      } }, 'Turn off'),
      h('button', { class: 'link-btn', onclick: () => { box.hidden = true; } }, 'Hide'),
      h('div', { class: 'share-note' }, `Link copied. Opened ${share.views || 0} time${share.views === 1 ? '' : 's'}. Anyone with it can read the notes (including lines you typed) and the transcript until you turn it off. Emails never show; edit the notes first if something shouldn't be seen.`));
  }
  // Already shared: say so on the button.
  call('share:get', c.id).then((share) => { if (share) { btn.classList.add('on'); label.textContent = 'Shared'; btn.title = `Copy the link (opened ${share.views || 0} time${share.views === 1 ? '' : 's'})`; } }).catch(() => {});
  return [btn, box];
}

// A one-line reminder on Home until your calendar is connected.
async function calendarNudge() {
  if (!authState.user || localStorage.getItem('cue-cal-nudge-off')) return null;
  const cal = await call('calendar:status');
  if (cal.configured) return null;
  const bar = h('div', { class: 'nudge-bar' },
    h('span', { class: 'grow' }, 'Connect your calendar so calls get their real titles and attendees.'),
    h('button', { class: 'btn primary', onclick: async () => { await call('calendar:connect'); go({ view: 'settings' }); } }, 'Connect'),
    h('button', { class: 'link-btn', onclick: () => { localStorage.setItem('cue-cal-nudge-off', '1'); bar.remove(); } }, 'Not now'));
  return bar;
}

window.cue.on('folders:changed', () => { renderFolders(); if (route.view === 'folder') renderFolder(route.id); });
