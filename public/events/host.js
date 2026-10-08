// Az events oldal host-lapjanak hidja. A tracker.js ELOTT fut, es harom dolgot
// tesz: a storage-ot memoriabeli potlekra csereli, a fetch-et olyanra, ami
// semmit nem kuld, es figyeli a szulo oldal parancsait. A protokoll parja a
// demos/events/useTracker.ts-ben van; a ketto egyutt valtozik.
(function () {
  // A landing oldal utvonala. Egyezik a demos/events/sources.ts SHOP_PATH-javal.
  const SHOP_PATH = '/events/bolt';

  function memoryStorage() {
    const m = new Map();
    return {
      getItem: function (k) { return m.has(k) ? m.get(k) : null; },
      setItem: function (k, v) { m.set(k, String(v)); },
      removeItem: function (k) { m.delete(k); },
      clear: function () { m.clear(); },
      get length() { return m.size; },
    };
  }

  Object.defineProperty(window, 'localStorage', { value: memoryStorage(), configurable: true });
  Object.defineProperty(window, 'sessionStorage', { value: memoryStorage(), configurable: true });

  function post(msg) {
    window.parent.postMessage(Object.assign({ source: 'events-host' }, msg), '*');
  }

  let sent = 0;
  window.fetch = function (url, init) {
    const o = init || {};
    sent += 1;
    post({
      type: 'request',
      method: o.method || 'GET',
      url: String(url),
      headers: o.headers || {},
      body: typeof o.body === 'string' ? o.body : null,
    });
    return Promise.resolve({ ok: true, status: 202 });
  };

  // A lap cime host.html?<forrasjel>; a tracker ne ezt lassa, hanem a bolt
  // fooldalat ugyanazzal a query stringgel.
  history.replaceState(null, '', SHOP_PATH + '/' + window.location.search);

  window.addEventListener('message', function (e) {
    if (e.source !== window.parent) return;
    const m = e.data || {};
    const before = sent;
    if (m.type === 'track' && typeof m.name === 'string') {
      if (typeof m.url === 'string') history.replaceState(null, '', m.url);
      window.track(m.name, m.payload || {});
      post({ type: 'done', command: 'track', name: m.name, sent: sent - before });
    } else if (m.type === 'consent') {
      if (m.granted) window.grantConsent();
      else window.revokeConsent();
      post({ type: 'done', command: 'consent', sent: sent - before });
    }
  });

  window.addEventListener('load', function () {
    post({ type: 'ready', ok: typeof window.track === 'function' });
  });
})();
