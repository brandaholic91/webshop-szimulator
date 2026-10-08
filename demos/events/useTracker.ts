import { useCallback, useEffect, useReducer, useRef, useState } from 'react';

// A szulo oldal fele a hidnak; a parja a public/events/host.js. A tracker egy
// rejtett iframe-ben fut, ez a hook parancsot kuld neki (track, consent), es
// osszegyujti, amit a host-lap az elfogott fetch-hivasokrol visszauzen.

// Egy sor a hivas-listaban. sent=false: a gombnyomasbol nem lett hivas.
export interface Call {
  id: number;
  sent: boolean;
  eventName: string;
  method: string;
  url: string;
  body: Record<string, unknown> | null;
}

export interface CallLog {
  calls: Call[];      // a legfrissebb elol, legfeljebb MAX_CALLS
  sent: number;       // osszes elkuldott hivas ebben a munkamenetben
  withheld: number;   // osszes visszatartott
}

export type HostMessage =
  | { type: 'ready'; ok: boolean }
  | { type: 'request'; method: string; url: string; body: string | null }
  | { type: 'done'; command: 'track' | 'consent'; name: string | null; sent: number };

export const EMPTY_LOG: CallLog = { calls: [], sent: 0, withheld: 0 };
export const MAX_CALLS = 20;
export const READY_TIMEOUT_MS = 2000;

// Barmi johet postMessage-ben (bongeszo-bovitmenyek is kuldenek): csak azt
// engedjuk tovabb, ami a host.js harom uzenetenek egyike, ep mezokkel.
export function parseHostMessage(data: unknown): HostMessage | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  if (d.source !== 'events-host') return null;
  if (d.type === 'ready') return { type: 'ready', ok: d.ok === true };
  if (d.type === 'request' && typeof d.method === 'string' && typeof d.url === 'string') {
    return { type: 'request', method: d.method, url: d.url, body: typeof d.body === 'string' ? d.body : null };
  }
  if (d.type === 'done' && (d.command === 'track' || d.command === 'consent') && typeof d.sent === 'number') {
    return { type: 'done', command: d.command, name: typeof d.name === 'string' ? d.name : null, sent: d.sent };
  }
  return null;
}

function parseBody(body: string | null): Record<string, unknown> | null {
  if (body === null) return null;
  try {
    const v: unknown = JSON.parse(body);
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const push = (log: CallLog, call: Omit<Call, 'id'>): Call[] =>
  [{ ...call, id: log.sent + log.withheld + 1 }, ...log.calls].slice(0, MAX_CALLS);

// Tiszta fuggveny: a hivas-lista kovetkezo allapota egy host-uzenet utan.
export function logReducer(log: CallLog, msg: HostMessage): CallLog {
  if (msg.type === 'request') {
    const body = parseBody(msg.body);
    const eventName = typeof body?.event_name === 'string' ? body.event_name : 'ismeretlen esemény';
    return {
      ...log,
      calls: push(log, { sent: true, eventName, method: msg.method, url: msg.url, body }),
      sent: log.sent + 1,
    };
  }
  // A tracker consent nelkul csendben visszater: abbol tudjuk, hogy a 'done'
  // nulla kerest jelent. A consent-parancs nulla kerese nem visszatartas.
  if (msg.type === 'done' && msg.command === 'track' && msg.sent === 0) {
    return {
      ...log,
      calls: push(log, { sent: false, eventName: msg.name ?? 'ismeretlen esemény', method: '', url: '', body: null }),
      withheld: log.withheld + 1,
    };
  }
  return log;
}

export type TrackerStatus = 'loading' | 'ready' | 'failed';

// `visit`: a latogatas sorszama. Amikor no, az oldal uj iframe-et tesz ki
// (uj storage, uj azonositok), es a hook ujra a 'ready'-re var.
export function useTracker(visit: number) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<TrackerStatus>('loading');
  const [log, dispatch] = useReducer(logReducer, EMPTY_LOG);

  useEffect(() => {
    setStatus('loading');
    const onMessage = (e: MessageEvent) => {
      // Csak a sajat iframe-unk uzenetet fogadjuk el.
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      const msg = parseHostMessage(e.data);
      if (!msg) return;
      if (msg.type === 'ready') setStatus(msg.ok ? 'ready' : 'failed');
      else dispatch(msg);
    };
    window.addEventListener('message', onMessage);
    const timer = window.setTimeout(
      () => setStatus(s => (s === 'loading' ? 'failed' : s)),
      READY_TIMEOUT_MS,
    );
    return () => {
      window.removeEventListener('message', onMessage);
      window.clearTimeout(timer);
    };
  }, [visit]);

  // A cimzett '*': az uzenetben nincs titok (esemenynev, payload, utvonal).
  const send = useCallback((msg: Record<string, unknown>) => {
    frame.current?.contentWindow?.postMessage(msg, '*');
  }, []);
  const track = useCallback(
    (name: string, payload: Record<string, unknown>, url: string) => send({ type: 'track', name, payload, url }),
    [send],
  );
  const setConsent = useCallback((granted: boolean) => send({ type: 'consent', granted }), [send]);

  return { frame, status, log, track, setConsent };
}
