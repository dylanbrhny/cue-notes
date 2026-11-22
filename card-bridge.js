// Stands in for Electron's preload inside the preview card frame.
(() => {
  const listeners = {}; const waiting = {}; let n = 0;
  window.addEventListener('message', (e) => {
    if (e.source !== window.parent || !e.data) return;
    if (e.data.cueCard === 'state') (listeners['overlay:state'] || []).forEach((cb) => cb(e.data.state));
    if (e.data.cueCard === 'reply' && waiting[e.data.id]) { waiting[e.data.id](e.data.result); delete waiting[e.data.id]; }
  });
  window.cue = {
    invoke: (ch, arg) => new Promise((ok) => { const id = ++n; waiting[id] = ok; window.parent.postMessage({ cueCard: 'call', id, ch, arg }, location.origin); }),
    on: (ch, cb) => { (listeners[ch] = listeners[ch] || []).push(cb); },
  };
})();
