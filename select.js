// Picking several calls at once, like files in Finder:
//   Cmd/Ctrl-click adds or removes one, Shift-click takes a range, dragging a
//   box over empty space selects what it touches. Drag any selected call onto
//   a folder (or a space) to move them all. Esc or a click on empty space clears.

const selectedCalls = new Set();
let lastSelected = null;

function paintSelection() {
  document.querySelectorAll('.call-item[data-call]').forEach((el) => el.classList.toggle('selected', selectedCalls.has(el.dataset.call)));
  document.body.classList.toggle('has-selection', selectedCalls.size > 0);
  drawSelBar();
}
function toggleSelected(id) {
  if (selectedCalls.has(id)) selectedCalls.delete(id); else selectedCalls.add(id);
  lastSelected = id; paintSelection();
}
function clearSelection() { if (!selectedCalls.size) return; selectedCalls.clear(); lastSelected = null; paintSelection(); }

function onCallClick(e, id, open) {
  if (e.metaKey || e.ctrlKey) {
    e.preventDefault();
    if (selectedCalls.has(id)) selectedCalls.delete(id); else selectedCalls.add(id);
    lastSelected = id; paintSelection(); return;
  }
  if (e.shiftKey) {
    e.preventDefault();
    const ids = [...document.querySelectorAll('.call-item[data-call]')].map((r) => r.dataset.call);
    const a = ids.indexOf(lastSelected || id); const b = ids.indexOf(id);
    if (a < 0 || b < 0) selectedCalls.add(id);
    else ids.slice(Math.min(a, b), Math.max(a, b) + 1).forEach((x) => selectedCalls.add(x));
    lastSelected = id; paintSelection(); return;
  }
  clearSelection();
  open();
}

// The ids a drag should carry: the whole selection if you grab a selected call.
function dragIds(id) { return selectedCalls.has(id) && selectedCalls.size > 1 ? [...selectedCalls] : [id]; }
function dragBadge(e, n) {
  if (n < 2) return;
  const b = h('div', { class: 'drag-badge' }, `${n} calls`);
  document.body.append(b);
  e.dataTransfer.setDragImage(b, 10, 10);
  setTimeout(() => b.remove(), 0);
}

// A small bar while calls are selected.
let selBar = null;
function drawSelBar() {
  if (!selectedCalls.size) { selBar?.remove(); selBar = null; return; }
  const folders = (typeof foldersCache !== 'undefined' ? foldersCache : []) || [];
  const move = h('select', { class: 'chip-select', onchange: async (e) => {
    const target = e.target.value; if (!target) return;
    const ids = [...selectedCalls];
    for (const id of ids) { const r = await call('calls:move', { id, folderId: target === '__none' ? null : target }); if (!r.ok) { alert(r.error); break; } }
    clearSelection(); renderFolders(); renderList(); renderView();
  } }, h('option', { value: '' }, 'Move to…'), h('option', { value: '__none' }, 'No folder'),
    folders.map((f) => h('option', { value: f.id }, typeof folderPath === 'function' ? folderPath(f.id) : f.name)));
  const bar = h('div', { class: 'sel-bar' },
    h('b', {}, `${selectedCalls.size} call${selectedCalls.size === 1 ? '' : 's'} selected`),
    h('button', { class: 'link-btn', onclick: () => { document.querySelectorAll('#view .call-item[data-call]').forEach((el) => selectedCalls.add(el.dataset.call)); paintSelection(); } }, 'Select all'),
    move,
    h('button', { class: 'link-btn', onclick: () => archiveCalls([...selectedCalls], route.view !== 'archive') }, route.view === 'archive' ? 'Unarchive' : 'Archive'),
    h('button', { class: 'link-btn danger', onclick: () => trashCalls([...selectedCalls]) }, 'Delete'),
    h('button', { class: 'link-btn', onclick: clearSelection }, 'Clear'));
  if (selBar) selBar.replaceWith(bar); else document.body.append(bar);
  selBar = bar;
}

// Box selection over empty space in the main area.
window.addEventListener('DOMContentLoaded', () => {
  const main = document.getElementById('main');
  let box = null; let start = null; let base = null; let moved = false;
  main.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('.call-item, button, a, input, select, textarea, [contenteditable="true"], .notepad, .ask, details, label')) return;
    if (!main.querySelector('.call-item')) return;
    start = { x: e.clientX, y: e.clientY }; moved = false;
    base = e.metaKey || e.ctrlKey || e.shiftKey ? new Set(selectedCalls) : new Set();
  });
  window.addEventListener('mousemove', (e) => {
    if (!start) return;
    const w = Math.abs(e.clientX - start.x), hgt = Math.abs(e.clientY - start.y);
    if (!moved && w + hgt < 6) return;
    moved = true;
    if (!box) { box = h('div', { class: 'marquee' }); document.body.append(box); document.body.classList.add('selecting'); }
    const r = { left: Math.min(e.clientX, start.x), top: Math.min(e.clientY, start.y), right: Math.max(e.clientX, start.x), bottom: Math.max(e.clientY, start.y) };
    Object.assign(box.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.right - r.left}px`, height: `${r.bottom - r.top}px` });
    selectedCalls.clear(); base.forEach((x) => selectedCalls.add(x));
    document.querySelectorAll('.call-item[data-call]').forEach((el) => {
      const b = el.getBoundingClientRect();
      if (b.right > r.left && b.left < r.right && b.bottom > r.top && b.top < r.bottom) selectedCalls.add(el.dataset.call);
    });
    paintSelection();
  });
  window.addEventListener('mouseup', () => {
    if (!start) return;
    if (!moved) clearSelection();
    start = null; box?.remove(); box = null; document.body.classList.remove('selecting');
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') clearSelection();
    // Delete / Backspace moves the selected calls to Deleted (Undo is offered).
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedCalls.size && !e.target.closest('input, textarea, select, [contenteditable="true"]')) {
      e.preventDefault();
      trashCalls([...selectedCalls]);
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a' && !e.target.closest('input, textarea, [contenteditable="true"]') && document.querySelector('.call-item[data-call]')) {
      e.preventDefault();
      document.querySelectorAll('.call-item[data-call]').forEach((el) => selectedCalls.add(el.dataset.call));
      paintSelection();
    }
  });
});
