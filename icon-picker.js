// Notion-style icons for folders and spaces: one solid glyph in one of Notion's
// colours, never an emoji. A stored icon is "name" or "name:colour", e.g.
// "handshake" or "fire:orange". Folders from before this (which held an emoji)
// show the closest icon instead.
(() => {
  const LIB = new Map((window.CUE_ICONS || []).map(([name, tags, d]) => [name, { tags, d }]));
  const COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];
  const FROM_EMOJI = {
    '📁': 'folder', '📂': 'folder-open', '🗂': 'folders', '⭐': 'star:yellow', '🔥': 'fire:orange', '🎯': 'target:red', '💰': 'money:green',
    '📈': 'chart-line-up:green', '📊': 'chart-bar:blue', '🤝': 'handshake:orange', '📞': 'phone', '☎': 'phone-call', '💬': 'chat:blue', '🧠': 'brain:pink',
    '💡': 'lightbulb:yellow', '🛠': 'wrench', '🏭': 'factory', '⚙': 'gear', '🔩': 'nut', '🚚': 'truck', '🏗': 'crane:orange', '🧪': 'flask:purple',
    '🔒': 'lock', '👤': 'user', '👥': 'users', '🧑‍💼': 'briefcase', '🎓': 'student', '📚': 'books:brown', '📝': 'note-pencil', '✅': 'check-circle:green',
    '🗓': 'calendar', '⏳': 'hourglass', '🚀': 'rocket-launch:purple', '🏆': 'trophy:yellow', '❤': 'heart:red', '🟢': 'circle:green', '🟡': 'circle:yellow',
    '🔴': 'circle:red', '🔵': 'circle:blue', '🟣': 'circle:purple', '⚫': 'circle', '🌱': 'plant:green', '🧭': 'compass', '🎙': 'microphone',
    '📣': 'megaphone:orange', '💼': 'briefcase:brown', '🏢': 'building-office', '🇺🇸': 'flag:blue', '🧾': 'receipt', '🤖': 'robot',
  };

  function parse(value) {
    if (!value) return null;
    const s = String(value).trim();
    const m = /^([a-z0-9-]+)(?::([a-z]+))?$/.exec(s);
    if (m && LIB.has(m[1])) return { name: m[1], color: COLORS.includes(m[2]) ? m[2] : 'gray' };
    const hit = FROM_EMOJI[s.replace(/️/g, '')];
    const [name, color = 'gray'] = (hit || 'folder').split(':');
    return { name, color };
  }
  const stored = (name, color) => (color && color !== 'gray' ? `${name}:${color}` : name);
  // Path data comes from icons.js (checked when it is built), never from what a user typed.
  const svg = (name, size) => { const it = LIB.get(name); return it ? `<svg viewBox="0 0 256 256" width="${size}" height="${size}" fill="currentColor" aria-hidden="true"><path d="${it.d}"/></svg>` : ''; };
  const label = (name) => name.replace(/-/g, ' ');

  // An icon for a folder or space value, or null when it has none.
  function cueIcon(value, size = 16) {
    const p = parse(value);
    if (!p || !LIB.has(p.name)) return null;
    const el = document.createElement('span');
    el.className = `cue-icon ic-${p.color}`;
    el.style.width = el.style.height = `${size}px`;
    el.innerHTML = svg(p.name, size);
    return el;
  }

  const store = {
    get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
    set(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} },
  };
  const UI = {
    search: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.35-4.35"/></svg>',
    shuffle: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5 M4 20 21 3 M21 16v5h-5 M15 15l6 6 M4 4l5 5"/></svg>',
  };

  let current = null;
  function close() {
    if (!current) return;
    current.el.remove();
    document.removeEventListener('pointerdown', current.outside, true);
    document.removeEventListener('keydown', current.key, true);
    window.removeEventListener('resize', close);
    window.removeEventListener('blur', close);
    current = null;
  }

  // Opens the picker under `anchor`. onPick(value) gets the new stored value, or '' for Remove.
  function openIconPicker(anchor, { value = '', onPick } = {}) {
    const wasOpenHere = current && current.anchor === anchor;
    close();
    if (wasOpenHere) return;
    const now = parse(value);
    let color = now ? now.color : store.get('cue-icon-color', 'gray');
    let chosen = now ? now.name : null;
    const recent = store.get('cue-icons-recent', []).filter((n) => LIB.has(n)).slice(0, 12);

    const cells = (names) => names.map((n) => `<button type="button" class="ip-cell${n === chosen ? ' on' : ''}" data-n="${n}" aria-label="${label(n)}">${svg(n, 20)}</button>`).join('');
    const el = document.createElement('div');
    el.className = `ip ic-${color}`;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Choose an icon');
    el.innerHTML = `
      <div class="ip-head"><span class="ip-tab on">Icons</span><span class="ip-grow"></span>${value ? '<button type="button" class="ip-remove">Remove</button>' : ''}</div>
      <div class="ip-tools">
        <label class="ip-search">${UI.search}<input type="text" placeholder="Filter…" spellcheck="false" autocomplete="off"></label>
        <button type="button" class="ip-tool ip-shuffle" title="Random icon" aria-label="Random icon">${UI.shuffle}</button>
        <button type="button" class="ip-tool ip-color" title="Colour" aria-label="Colour"><i class="ip-dot"></i></button>
      </div>
      <div class="ip-colors" hidden>${COLORS.map((c) => `<button type="button" class="ip-swatch ic-${c}${c === color ? ' on' : ''}" data-c="${c}" title="${c[0].toUpperCase() + c.slice(1)}" aria-label="${c}"><i></i></button>`).join('')}</div>
      <div class="ip-scroll">
        ${recent.length ? `<div class="ip-recent"><div class="ip-label">Recent</div><div class="ip-grid">${cells(recent)}</div></div>` : ''}
        <div class="ip-label ip-all-label">Icons</div>
        <div class="ip-grid ip-all">${cells([...LIB.keys()])}</div>
        <div class="ip-none" hidden>No icons match that.</div>
      </div>
      <div class="ip-tip" hidden></div>`;
    document.body.append(el);

    const q = (s) => el.querySelector(s);
    const input = q('.ip-search input');
    const tip = q('.ip-tip');
    const all = [...el.querySelectorAll('.ip-all .ip-cell')];
    const words = new Map(all.map((b) => [b, `${label(b.dataset.n)} ${LIB.get(b.dataset.n).tags}`]));

    const pick = (name, keepOpen) => {
      chosen = name;
      store.set('cue-icons-recent', [name, ...store.get('cue-icons-recent', []).filter((n) => n !== name)].slice(0, 12));
      el.querySelectorAll('.ip-cell.on').forEach((b) => b.classList.remove('on'));
      el.querySelectorAll(`.ip-cell[data-n="${name}"]`).forEach((b) => b.classList.add('on'));
      if (!keepOpen) close();
      Promise.resolve(onPick && onPick(stored(name, color))).catch(() => {});
    };

    el.addEventListener('click', (e) => {
      const cell = e.target.closest('.ip-cell');
      if (cell) return pick(cell.dataset.n);
      if (e.target.closest('.ip-remove')) { close(); Promise.resolve(onPick && onPick('')).catch(() => {}); return; }
      if (e.target.closest('.ip-color')) { q('.ip-colors').hidden = !q('.ip-colors').hidden; return; }
      const sw = e.target.closest('.ip-swatch');
      if (sw) {
        el.classList.remove(`ic-${color}`);
        color = sw.dataset.c;
        el.classList.add(`ic-${color}`);
        store.set('cue-icon-color', color);
        el.querySelectorAll('.ip-swatch').forEach((b) => b.classList.toggle('on', b === sw));
        if (chosen) pick(chosen, true); // recolour the icon that's already set
        return;
      }
      if (e.target.closest('.ip-shuffle')) {
        const shown = all.filter((b) => !b.hidden);
        if (shown.length) pick(shown[Math.floor(Math.random() * shown.length)].dataset.n, true);
      }
    });
    input.addEventListener('input', () => {
      const terms = input.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
      let any = false;
      for (const b of all) { b.hidden = terms.length > 0 && !terms.every((t) => words.get(b).includes(t)); any ||= !b.hidden; }
      const r = q('.ip-recent'); if (r) r.hidden = terms.length > 0;
      q('.ip-none').hidden = any;
      q('.ip-all-label').hidden = !any;
      q('.ip-scroll').scrollTop = 0;
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); const first = all.find((b) => !b.hidden); if (first) pick(first.dataset.n); }
    });
    el.addEventListener('pointerover', (e) => {
      const cell = e.target.closest('.ip-cell');
      if (!cell) { tip.hidden = true; return; }
      tip.textContent = label(cell.dataset.n);
      tip.hidden = false;
      const box = el.getBoundingClientRect(); const c = cell.getBoundingClientRect();
      tip.style.left = `${Math.max(6, Math.min(c.left - box.left + c.width / 2 - tip.offsetWidth / 2, box.width - tip.offsetWidth - 6))}px`;
      tip.style.top = `${c.top - box.top - tip.offsetHeight - 4}px`;
    });
    el.addEventListener('pointerleave', () => { tip.hidden = true; });
    q('.ip-scroll').addEventListener('scroll', () => { tip.hidden = true; });

    // Below the anchor if it fits, otherwise above; always inside the window.
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth; const hgt = el.offsetHeight;
    el.style.left = `${Math.max(8, Math.min(r.left, innerWidth - w - 8))}px`;
    el.style.top = `${r.bottom + 6 + hgt <= innerHeight - 8 ? r.bottom + 6 : Math.max(8, r.top - hgt - 6)}px`;

    current = {
      el, anchor,
      outside: (e) => { if (!el.contains(e.target) && !anchor.contains(e.target)) close(); },
      key: (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } },
    };
    document.addEventListener('pointerdown', current.outside, true);
    document.addEventListener('keydown', current.key, true);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    setTimeout(() => input.focus(), 0);
  }

  window.cueIcon = cueIcon;
  window.openIconPicker = openIconPicker;
  window.closeIconPicker = close;
})();
