// Teszt-segedlet, nem a lap resze. A public/events/ scriptjeit futtatja egy
// hamis bongeszo-ablakban (node:vm), hogy a vitest lassa, mit csinal a tracker
// es a host-hid: mit ir a storage-ba, mit kuldene a halozatra, mit uzen a
// szulonek. A hamis ablak csak azt tudja, amit a ket script hasznal.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const read = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../../public/events/${name}`, import.meta.url)), 'utf-8');

// "Valodi" storage, ami feljegyzi, mit irtak bele.
export function spyStorage() {
  const store = new Map<string, string>();
  const writes: string[] = [];
  return {
    store,
    writes,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { writes.push(k); store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
  };
}

export interface FakeFrame {
  win: any;
  posted: any[];                              // amit a lap a szulonek uzent
  fetched: { url: string; init: any }[];      // ami a VALODI fetch-ig eljutott
  real: { local: ReturnType<typeof spyStorage>; session: ReturnType<typeof spyStorage> };
  load: () => void;                           // a 'load' esemeny
  send: (data: unknown) => void;              // uzenet a szulotol
  sendFrom: (source: unknown, data: unknown) => void;  // uzenet idegen ablakbol
}

export function makeFrame(search: string, scripts: string[]): FakeFrame {
  const posted: any[] = [];
  const fetched: { url: string; init: any }[] = [];
  const listeners: Record<string, ((e: any) => void)[]> = {};
  const real = { local: spyStorage(), session: spyStorage() };
  const origin = 'http://portfolio.test';
  const parent = { postMessage: (m: unknown) => { posted.push(m); } };

  const win: any = {
    location: new URL(`/events/host.html${search}`, origin),
    document: { referrer: `${origin}/muszerek/events` },
    history: {
      replaceState(_state: unknown, _title: string, url: string) {
        win.location = new URL(url, win.location.href);
      },
    },
    localStorage: real.local,
    sessionStorage: real.session,
    fetch: (url: string, init: any) => {
      fetched.push({ url, init });
      return Promise.resolve({ ok: true });
    },
    parent,
    addEventListener: (type: string, fn: (e: any) => void) => {
      (listeners[type] ??= []).push(fn);
    },
    crypto: globalThis.crypto,
    URL,
    URLSearchParams,
    Uint8Array,
  };
  win.window = win;

  const context = vm.createContext(win);
  for (const name of scripts) vm.runInContext(read(name), context, { filename: name });

  const fire = (type: string, event: unknown) => (listeners[type] ?? []).forEach(fn => fn(event));
  return {
    win, posted, fetched, real,
    load: () => fire('load', {}),
    send: data => fire('message', { source: parent, data }),
    sendFrom: (source, data) => fire('message', { source, data }),
  };
}
