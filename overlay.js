// The cue card. Main pushes state; this draws it and reports its height so
// the window hugs the content.
//
// Default view is deliberately tiny: progress dots and the one beat to hit
// next. The full list is one click away, and an objection card takes over
// the space when the prospect raises one.

// Empty pieces (null/false/'') are skipped instead of being printed as text.
{
  const rc = Element.prototype.replaceChildren;
  const ap = Element.prototype.append;
  const clean = (kids) => kids.flat(Infinity).filter((k) => k != null && k !== false && k !== '');
  Element.prototype.replaceChildren = function (...kids) { return rc.apply(this, clean(kids)); };
  Element.prototype.append = function (...kids) { return ap.apply(this, clean(kids)); };
}

const card = document.getElementById('card');
const root = document.getElementById('root');
if (new URLSearchParams(location.search).get('snap')) document.body.classList.add('snap');

let state = { mode: 'idle' };
let prevDone = new Set();
let justDone = null;          // {label, until} shown briefly when a beat ticks
let awakeUntil = 0;
let lastObjectionAt = null;
let selectedPreset = null;
let showList = false;          // full checklist instead of just the next beat
let objMore = false;           // show every line of the objection answer
let showBook = false;          // the objection playbook
let bookOpen = null;           // which playbook entry is open
let showBrief = false;         // the prospect brief, opened from its one-line strip
let level = 0;

const ICON = {
  check: '<svg viewBox="0 0 12 12" fill="none"><path d="M2.5 6.2l2.3 2.3 4.7-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  book: '<svg viewBox="0 0 14 14" fill="none"><path d="M2.5 3c1.6-.8 3.2-.8 4.5 0v8.5c-1.3-.8-2.9-.8-4.5 0V3zM7 3c1.3-.8 2.9-.8 4.5 0v8.5c-1.6-.8-3.2-.8-4.5 0" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
  list: '<svg viewBox="0 0 14 14" fill="none"><path d="M3 4h8M3 7h8M3 10h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  up: '<svg viewBox="0 0 14 14" fill="none"><path d="M3.5 8.5L7 5l3.5 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  min: '<svg viewBox="0 0 14 14" fill="none"><path d="M3.5 7h7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  stop: '<svg viewBox="0 0 14 14" fill="none"><rect x="3.5" y="3.5" width="7" height="7" rx="1.6" fill="currentColor"/></svg>',
  x: '<svg viewBox="0 0 14 14" fill="none"><path d="M4 4l6 6M10 4l-6 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  target: '<svg viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.4"/><circle cx="7" cy="7" r="1.8" fill="currentColor"/></svg>',
  skip: '<svg viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="4.6" stroke="currentColor" stroke-width="1.4"/><path d="M3.8 10.2l6.4-6.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  back: '<svg viewBox="0 0 14 14" fill="none"><path d="M5.5 4L3 6.5 5.5 9M3.3 6.5H8a3 3 0 0 1 0 6H6.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  notes: '<svg viewBox="0 0 14 14" fill="none"><rect x="2.5" y="2" width="9" height="10" rx="2" stroke="currentColor" stroke-width="1.4"/><path d="M5 5.5h4M5 8h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
};

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v; // CSSOM, allowed under the CSP
    else if (k === 'html') el.innerHTML = v;      // only ever our own static SVG
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}

const call = (ch, arg) => window.cue.invoke(ch, arg);
const ib = (icon, title, onclick) => h('button', { class: 'ib', title, 'aria-label': title, html: ICON[icon], onclick });
const fmt = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// ---------------------------------------------------------------------------
// Redraw only when something visible changes, and never mid-click.
// ---------------------------------------------------------------------------

let lastKey = '';
let pointerDown = false;
let pendingRender = false;
document.addEventListener('mousedown', () => { pointerDown = true; });
document.addEventListener('mouseup', () => {
  pointerDown = false;
  if (pendingRender) { pendingRender = false; setTimeout(render, 0); }
});

function structureKey() {
  const base = [state.mode, state.collapsed, state.idleOpacity, showList, objMore, !!justDone, showBrief];
  if (state.mode !== 'live') return JSON.stringify([...base, state.app, state.title, state.presets, state.event && state.event.title, state.dreamScore]);
  const s = state.snapshot;
  return JSON.stringify([...base, state.callMode, state.title, state.warning, state.setupWarning, s.presetName, state.askEnd && state.askEnd.at, state.sharingWhole, state.shareTip,
    s.teamNudge && s.teamNudge.at, s.pitchNudge && s.pitchNudge.at,
    s.items.map((i) => [i.id, i.done, i.skipped, i.say]), s.goodNow, s.brief, state.prepping, state.winHint, state.talk && [state.talk.me, state.talk.lately], state.coachNudge && state.coachNudge.at, showBook, bookOpen, s.objection && [s.objection.id, s.objection.at]]);
}

function update() {
  if (structureKey() === lastKey) return;
  if (pointerDown) { pendingRender = true; return; }
  render();
}

let lastPhase = null;
function render() {
  lastKey = structureKey();
  const asking = state.mode === 'live' && state.askEnd;
  const pill = state.mode === 'live' && state.collapsed && !asking;
  const phase = asking ? 'ask' : state.mode === 'live' ? `live-${state.callMode}-${pill ? 'pill' : 'card'}` : state.mode;
  card.className = ['card', state.mode === 'idle' && 'hidden', pill && 'pill', (Date.now() < awakeUntil || state.mode !== 'live') && 'awake'].filter(Boolean).join(' ');
  if (phase !== lastPhase) { lastPhase = phase; card.classList.remove('swap'); void card.offsetWidth; card.classList.add('swap'); }
  // Lists that scroll inside the card keep their place when the card is redrawn (talk time
  // changes every few seconds).
  const keep = {};
  for (const c of ['list', 'brief-lines', 'book']) { const el = card.querySelector(`.${c}`); if (el && el.scrollTop) keep[c] = el.scrollTop; }
  card.replaceChildren(...(views[state.mode] || (() => []))());
  for (const [c, top] of Object.entries(keep)) { const el = card.querySelector(`.${c}`); if (el) el.scrollTop = top; }
  requestAnimationFrame(reportSize);
}

function reportSize() {
  call('overlay:resize', state.mode === 'idle' ? 40 : root.getBoundingClientRect().height);
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

const views = {
  idle: () => [],

  prompt: () => {
    if (!selectedPreset) selectedPreset = state.suggestedPresetId || state.defaultPresetId || state.presets?.[0]?.id;
    const chosen = (state.presets || []).find((p) => p.id === selectedPreset);
    return dialog({
      title: state.event?.title || (chosen?.kind === 'notes' ? 'Take notes?' : 'Call detected'),
      sub: state.app ? shortApp(state.app) : (state.event ? 'On your calendar now' : null),
      body: h('select', { class: 'dlg-select', 'aria-label': 'Preset', onchange: (e) => { selectedPreset = e.target.value; render(); } },
        h('optgroup', { label: 'Coach me' }, (state.presets || []).filter((p) => p.kind !== 'notes').map((p) => h('option', { value: p.id, selected: p.id === selectedPreset }, p.name))),
        h('optgroup', { label: 'Just take notes' }, (state.presets || []).filter((p) => p.kind === 'notes').map((p) => h('option', { value: p.id, selected: p.id === selectedPreset }, p.name)))),
      primary: ['Start', () => call('prompt:answer', { start: true, presetId: selectedPreset })],
      secondary: ['Not now', () => call('prompt:answer', { start: false })],
    });
  },

  writing: () => dialog({ title: 'Writing your notes…', spin: true }),

  ready: () => dialog({
    title: 'Notes ready',
    sub: state.callMode !== 'notes' ? `${state.done}/${state.total} beats covered${state.dreamScore != null ? ` · outcome ${state.dreamScore}%` : ''}` : (state.title || null),
    close: () => call('ready:dismiss'),
    primary: ['Open notes', () => { call('overlay:open-main', { view: 'call', id: state.callId }); call('ready:dismiss'); }],
  }),

  live: () => {
    if (state.askEnd) {
      return dialog({
        title: 'Meeting over?',
        sub: state.askEnd.reason,
        primary: ['Write notes', () => call('call:stop')],
        secondary: ['Keep going', () => call('call:keepGoing')],
      });
    }
    const s = state.snapshot;
    const open = s.items.filter((i) => !i.done && !i.skipped);
    if (state.callMode === 'notes') {
      return [h('div', { class: 'pill-in' },
        h('img', { class: 'mark', src: 'assets/logo.svg', alt: '' }),
        statusDot(),
        h('span', { class: 'nx', title: state.title || '' }, state.title || 'Taking notes'),
        h('span', { class: 'time', 'data-elapsed': s.startedAt }, fmt(Date.now() - s.startedAt)),
        ib('notes', 'Open notes', () => call('overlay:open-main', { view: 'live' })),
        ib('stop', 'End and write notes', () => call('call:stop'))),
        s.teamNudge ? teamNudge(s.teamNudge) : null];
    }
    if (state.collapsed) {
      const good = open.find((i) => i.id === s.goodNow);
      const text = s.objection ? s.objection.title : good ? good.label : open.length ? `${open.length} to cover` : 'All beats covered';
      return [h('div', { class: 'pill-in' },
        h('img', { class: 'mark', src: 'assets/logo.svg', alt: '' }),
        statusDot(),
        h('span', { class: 'count' }, `${s.done}/${s.total}`),
        h('span', { class: `nx ${s.objection ? 'obj-on' : ''}`, title: text }, text),
        ib('up', 'Expand', () => call('overlay:collapse', false)))];
    }

    const parts = [header(s)];
    if (state.sharingWhole) parts.push(h('div', { class: 'share-warn', role: 'alert' }, 'You’re sharing your whole screen, so they may see this card. Share a tab or window instead.'));
    else if (state.shareTip) parts.push(h('div', { class: 'share-tip' }, 'Presenting? Share a tab or window, not your entire screen.'));
    if (state.warning) parts.push(h('div', { class: 'warn-line', title: state.warning, onclick: () => call('overlay:open-main', { view: 'settings' }) }, state.warning));
    if (state.talk) parts.push(talkBar(state.talk));
    if (state.coachNudge && !s.teamNudge) parts.push(h('div', { class: 'coach', role: 'status' }, h('span', { class: 'grow' }, state.coachNudge.text)));
    if (s.teamNudge) parts.push(teamNudge(s.teamNudge));
    if (showBook) { parts.push(playbook()); return parts; }
    if (s.pitchNudge && !s.teamNudge) parts.push(h('div', { class: 'pitch', role: 'status' }, h('span', { class: 'pitch-ico', html: ICON.target }), h('span', { class: 'grow' }, s.pitchNudge), ib('x', 'Dismiss', () => call('call:dismiss-nudge'))));
    if (s.objection) parts.push(objection(s.objection));
    else if (s.brief || state.prepping) parts.push(briefStrip(s.brief));
    if (showList) parts.push(fullList(s));
    else if (!s.objection) parts.push(nextBeat(open));
    return parts;
  },
};

// You vs them, by time actually spoken (green when they're doing most of the talking).
function talkBar(t) {
  const share = t.lately != null ? t.lately : t.me;
  const target = t.target || 50;
  // Colour by how far you are over this stage's target, not a fixed number.
  const tone = share > target + 15 ? 'hot' : share > target + 5 ? 'warm' : 'good';
  const who = (state.people || []).length ? (state.people.length === 1 ? state.people[0].split(' ')[0] : `${state.people.length} others`) : 'Them';
  return h('div', { class: `talk ${tone}`, title: `Talk time so far: you ${t.me}%, them ${100 - t.me}%${t.lately != null ? `. Last 3 minutes: you ${t.lately}%` : ''}${t.phase ? `. ${t.phase}: aim for about ${target}%` : ''}` },
    h('span', { class: 'talk-l' }, `You ${share}%`),
    h('span', { class: 'talk-bar' }, h('i', { style: `width:${share}%` }), t.target ? h('b', { class: 'talk-aim', style: `left:${target}%` }) : null),
    h('span', { class: 'talk-r' }, t.phase ? `${t.phase} · aim ${target}%` : `${who} ${100 - share}%`));
}

function playbook() {
  const items = state.playbook || [];
  return h('div', { class: 'book' },
    h('div', { class: 'book-head' }, 'Objection playbook'),
    items.map((o) => h('div', { class: `book-item ${bookOpen === o.id ? 'open' : ''}` },
      h('button', { class: 'book-q', onclick: () => { bookOpen = bookOpen === o.id ? null : o.id; render(); } }, o.title),
      bookOpen === o.id ? h('ul', { class: 'book-a' }, o.response.map((r) => h('li', {}, r))) : null,
      bookOpen === o.id && o.caveat ? h('div', { class: 'book-c' }, o.caveat) : null)));
}

function teamNudge(n) {
  return h('div', { class: 'team', role: 'status' },
    h('div', { class: 'top' }, h('span', { class: 'label' }, n.from), ib('x', 'Dismiss', () => call('call:dismiss-nudge'))),
    h('div', { class: 'msg' }, n.text));
}

function shortApp(a) { return String(a).replace(' (Meet / Cal Video)', ''); }

function statusDot() {
  const a = state.audio || {};
  const why = state.warning || state.setupWarning || (a.me === 'error' ? 'Microphone problem' : null);
  return h('span', { class: `status ${why ? 'warn' : ''}`, id: 'status', title: why || 'Listening' });
}

// Every non-live state uses the same small dialog: Cue mark, title, one line
// of detail, optional picker, then the buttons.
function dialog({ title, sub = null, body = null, primary = null, secondary = null, close = null, spin = false }) {
  return [h('div', { class: 'dlg' },
    h('div', { class: 'dlg-head' },
      spin ? h('span', { class: 'spin' }) : h('img', { class: 'mark', src: 'assets/logo.svg', alt: '' }),
      h('span', { class: 'dlg-title', title: title || '' }, title),
      close ? ib('x', 'Close', close) : null),
    sub ? h('div', { class: 'dlg-sub' }, sub) : null,
    body,
    primary || secondary ? h('div', { class: 'dlg-row' },
      primary ? h('button', { class: 'btn-go', onclick: primary[1] }, primary[0]) : null,
      secondary ? h('button', { class: 'btn-ghost', onclick: secondary[1] }, secondary[0]) : null) : null)];
}

function header(s) {
  return h('div', { class: 'bar' },
    h('img', { class: 'mark', src: 'assets/logo.svg', alt: '' }),
    statusDot(),
    s.total <= 10
      ? h('span', { class: 'dots', title: `${s.done} of ${s.total} beats covered, in any order${s.skippedCount ? ` (${s.skippedCount} not for this call)` : ''}` }, s.items.filter((i) => !i.skipped).map((_, k) => h('i', { class: k < s.done ? 'on' : '' })))
      : h('span', { class: 'count', style: 'flex:1' }, `${s.done}/${s.total}`),
    h('span', { class: 'time', 'data-elapsed': s.startedAt }, fmt(Date.now() - s.startedAt)),
    ib(showList ? 'up' : 'list', showList ? 'Show fewer beats' : 'Show every beat', () => { showList = !showList; showBook = false; if (showList) showBrief = false; render(); }),
    (state.playbook || []).length ? ib('book', showBook ? 'Close the playbook' : 'Objection playbook', () => { showBook = !showBook; showList = false; render(); }) : null,
    ib('notes', 'Open notes', () => call('overlay:open-main', { view: 'live' })),
    ib('min', 'Shrink', () => call('overlay:collapse', true)),
    ib('stop', 'End call and write notes', () => call('call:stop')),
  );
}

// Beats can land in any order: show what fits right now (if the AI sees a
// good moment) and what's still open, not a "next / then" script.
function nextBeat(open) {
  if (justDone && justDone.until > Date.now()) {
    return h('div', { class: 'next' }, h('div', { class: 'done-flash' }, h('span', { html: ICON.check, style: 'display:inline-grid' }), justDone.label));
  }
  if (!open.length) return h('div', { class: 'next' }, h('div', { class: 'all-done' }, 'Every beat covered'));
  const good = open.find((i) => i.id === state.snapshot.goodNow);
  const rest = open.filter((i) => i !== good);
  const line = (i, main) => h('div', { class: `beat ${main ? '' : 'small'}` },
    h('button', { class: 'tick', title: 'Tick it by hand', 'aria-label': `Tick: ${i.label}`, html: ICON.check, onclick: () => call('call:toggle', i.id) }),
    h('span', { class: 'txt', title: i.say ? `${i.label}\nFor them: ${i.say}` : i.label }, i.label, main && i.say ? h('span', { class: 'say' }, i.say) : null),
    skipBtn(i));
  return h('div', { class: 'next' },
    good ? h('div', { class: 'label good' }, 'Good moment to') : h('div', { class: 'label' }, `Still to cover · ${open.length}`),
    good ? line(good, true) : null,
    good && state.winHint ? h('div', { class: 'win-hint' }, state.winHint) : null,
    ...(good ? rest.slice(0, 2) : rest.slice(0, 3)).map((i) => line(i, false)),
    (good ? rest.length > 2 : rest.length > 3) ? h('div', { class: 'then' }, `+${rest.length - (good ? 2 : 3)} more`) : null);
}

// "Not for this call": the beat leaves the count (bring it back from the full list).
function skipBtn(i) {
  return h('button', { class: 'skip', title: 'Not for this call (doesn’t count against you)', 'aria-label': `Not for this call: ${i.label}`, html: ICON.skip,
    onclick: (e) => { e.stopPropagation(); call('call:skip', { id: i.id, skip: true }); } });
}

function fullList(s) {
  const open = s.items.filter((i) => !i.done && !i.skipped);
  const done = s.items.filter((i) => i.done && !i.skipped);
  const skipped = s.items.filter((i) => i.skipped);
  const row = (i) => h('li', {
    class: ['row', i.done && 'done', i.id === s.goodNow && 'is-next'].filter(Boolean).join(' '),
    title: i.done ? (i.evidence ? `Covered: "${i.evidence}"` : 'Covered') : `Click to tick by hand${i.say ? `\nFor them: ${i.say}` : ''}`,
    onclick: () => call('call:toggle', i.id),
  }, h('span', { class: 'box', html: ICON.check }), h('span', { class: 't' }, i.label, !i.done && i.say ? h('span', { class: 'say' }, i.say) : null), i.done ? null : skipBtn(i));
  return h('ul', { class: 'list' },
    [...open, ...done].map(row),
    skipped.length ? h('li', { class: 'list-head' }, `Not for this call · ${skipped.length}`) : null,
    skipped.map((i) => h('li', { class: 'row skipped', title: `${i.skipReason || 'Not for this call'}${i.skipBy === 'manual' ? '' : ' (Cue’s call: bring it back if it fits)'}` },
      h('span', { class: 't' }, h('span', { class: 'lbl' }, i.label), h('span', { class: 'why' }, i.skipBy === 'manual' ? (i.skipReason ? `You: ${i.skipReason}` : 'You set this aside') : `Cue: ${i.skipReason || 'doesn’t fit this call'}`)),
      h('button', { class: 'bring', title: 'Bring it back', 'aria-label': `Bring back: ${i.label}`, onclick: (e) => { e.stopPropagation(); call('call:skip', { id: i.id, skip: false }); } }, h('span', { html: ICON.back }), 'Bring back'))));
}

// Who they are, from the prep before the call (their website and our past calls).
function briefStrip(b) {
  if (!b) return h('div', { class: 'brief pending' }, h('span', { class: 'spin-s' }), 'Fitting the beats to this prospect…');
  const first = b.lines[0] || b.headsUp[0] || '';
  return h('div', { class: `brief ${showBrief ? 'open' : ''}` },
    h('button', { class: 'brief-top', 'aria-expanded': String(showBrief), title: showBrief ? 'Hide' : 'About them, from their website and past calls', onclick: () => { showBrief = !showBrief; if (showBrief) showList = false; render(); } },
      h('span', { class: 'brief-k' }, b.name || b.domain || 'About them'),
      h('span', { class: 'brief-one' }, showBrief ? '' : first),
      h('span', { class: 'brief-chev', html: ICON.up })),
    showBrief ? h('ul', { class: 'brief-lines' }, b.lines.map((l) => h('li', {}, l)), b.headsUp.map((l) => h('li', { class: 'heads' }, l))) : null);
}

function objection(o) {
  const lines = o.response || [];
  const shown = objMore ? lines : lines.slice(0, 3);
  return h('div', { class: 'obj', role: 'status' },
    h('div', { class: 'top' },
      h('div', { style: 'flex:1;min-width:0' }, h('div', { class: 'label' }, 'They asked'), h('div', { class: 'q', title: o.quote ? `“${o.quote}”` : '' }, o.title)),
      ib('x', 'Dismiss', () => { objMore = false; call('call:dismiss'); })),
    h('ul', {}, shown.map((line) => h('li', {}, line))),
    lines.length > shown.length ? h('button', { class: 'more', onclick: () => { objMore = true; render(); } }, `+ ${lines.length - shown.length} more`) : null,
    o.caveat ? h('div', { class: 'caveat' }, o.caveat) : null,
    (o.links || []).length ? h('div', { class: 'links' }, o.links.map((l) => h('button', { onclick: () => call('shell:open', l.url) }, l.label || 'Open'))) : null,
  );
}

// ---------------------------------------------------------------------------
// Incoming state
// ---------------------------------------------------------------------------

window.cue.on('overlay:state', (next) => {
  if (next.theme && document.documentElement.dataset.theme !== next.theme) document.documentElement.dataset.theme = next.theme;
  if (next.mode === 'live') {
    const s = next.snapshot;
    const done = new Set(s.items.filter((i) => i.done).map((i) => i.id));
    for (const i of s.items) {
      if (i.done && !prevDone.has(i.id) && prevDone.size + 1 >= done.size) {
        justDone = { label: i.label, until: Date.now() + 1600 };
        awakeUntil = Date.now() + 3500;
        setTimeout(() => { justDone = null; update(); }, 1650);
      }
    }
    prevDone = done;
    const objAt = s.objection ? s.objection.at : null;
    if (objAt != null && objAt !== lastObjectionAt) {
      objMore = false;
      awakeUntil = Date.now() + 9000;
      setTimeout(() => card.classList.toggle('awake', Date.now() < awakeUntil), 9100);
      if (next.collapsed) call('overlay:collapse', false);
    }
    lastObjectionAt = objAt;
    if (s.teamNudge && (!state.snapshot || !state.snapshot.teamNudge || state.snapshot.teamNudge.at !== s.teamNudge.at)) {
      if (next.collapsed) call('overlay:collapse', false);
    }
  } else {
    prevDone = new Set();
    lastObjectionAt = null;
    justDone = null;
    showList = false;
    showBrief = false;
  }
  if (next.mode !== 'prompt') selectedPreset = null;
  state = next;
  card.classList.toggle('awake', Date.now() < awakeUntil || state.mode !== 'live');
  update();
});

// Audio level: the status dot breathes while someone is talking.
window.cue.on('overlay:levels', (lv) => {
  level = Math.min(1, Math.max(lv.me || 0, lv.them || 0) * 3);
  const dot = document.getElementById('status');
  if (dot && !dot.classList.contains('warn')) dot.style.transform = `scale(${(1 + level * 0.6).toFixed(2)})`;
});

setInterval(() => {
  for (const el of document.querySelectorAll('[data-elapsed]')) el.textContent = fmt(Date.now() - Number(el.dataset.elapsed));
}, 1000);

call('call:state').then((s) => { state = s; render(); });
