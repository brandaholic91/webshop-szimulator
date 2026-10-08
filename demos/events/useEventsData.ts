import { useEffect, useState } from 'react';
import { FATES, KINDS, alignJourney } from './journey';
import type { Emitted, EmittedEvent, Fate, Kind, Row, Sample, SampleJourney } from './journey';
import { eventPath, sides } from './ledger';
import type { Ledger, Pair } from './ledger';

// A harom adatfajl, amibol az inspektor es a fokonyv dolgozik. Mindharmat a
// world/src/world/export.py irja; ha valamelyik alakja megvaltozik, a
// schema_version emelkedik, es itt hibauzenet lesz belole, nem ures tabla.

export interface EventsData {
  ledger: Ledger;
  sample: Sample;
  emitted: Emitted;
}

const EXPECTED_SCHEMA_VERSION = 1;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function object(v: unknown, where: string): Record<string, unknown> {
  if (!isObject(v)) throw new Error(`${where}: hiányzik vagy nem objektum`);
  return v;
}

function count(o: Record<string, unknown>, key: string, where: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
    throw new Error(`${where}.${key}: hiányzik vagy nem nemnegatív szám`);
  }
  return v;
}

function text(o: Record<string, unknown>, key: string, where: string): string {
  const v = o[key];
  if (typeof v !== 'string' || v === '') throw new Error(`${where}.${key}: hiányzik vagy nem szöveg`);
  return v;
}

function rows(o: Record<string, unknown>, key: string, where: string): Row[] {
  const v = o[key];
  if (!Array.isArray(v) || !v.every(isObject)) throw new Error(`${where}.${key}: hiányzik vagy nem sorok listája`);
  return v;
}

function schema(raw: unknown, file: string): Record<string, unknown> {
  const o = object(raw, file);
  if (o.schema_version !== EXPECTED_SCHEMA_VERSION) {
    throw new Error(`${file}: schema_version ${String(o.schema_version)}, a lap ${EXPECTED_SCHEMA_VERSION}-et vár`);
  }
  return o;
}

export function parseLedger(raw: unknown): Ledger {
  const file = 'events_ledger.json';
  const o = schema(raw, file);
  const pair = (key: string): Pair => {
    const p = object(o[key], `${file}: ${key}`);
    return { dgp: count(p, 'dgp', key), pipeline: count(p, 'pipeline', key) };
  };
  const e = object(o.events, `${file}: events`);
  const i = object(o.identity, `${file}: identity`);
  return {
    schema_version: EXPECTED_SCHEMA_VERSION,
    events: {
      generated: count(e, 'generated', 'events'),
      withheld_no_consent: count(e, 'withheld_no_consent', 'events'),
      sent_unique: count(e, 'sent_unique', 'events'),
      sent_duplicate: count(e, 'sent_duplicate', 'events'),
      raw_events: count(e, 'raw_events', 'events'),
      clean_events: count(e, 'clean_events', 'events'),
    },
    sessions: pair('sessions'),
    orders: pair('orders'),
    revenue_huf: pair('revenue_huf'),
    identity: {
      customers_dgp: count(i, 'customers_dgp', 'identity'),
      customers_consented_dgp: count(i, 'customers_consented_dgp', 'identity'),
      devices_dgp: count(i, 'devices_dgp', 'identity'),
      devices_pipeline: count(i, 'devices_pipeline', 'identity'),
      identity_links: count(i, 'identity_links', 'identity'),
      customers_identified: count(i, 'customers_identified', 'identity'),
      persons_after_stitching: count(i, 'persons_after_stitching', 'identity'),
    },
  };
}

export function parseSample(raw: unknown): Sample {
  const file = 'events_sample.json';
  const o = schema(raw, file);
  const journeys = rows(o, 'journeys', file).map((j, n): SampleJourney => {
    const where = `${file}: journeys[${n}]`;
    return {
      kind: text(j, 'kind', where),
      raw_events: rows(j, 'raw_events', where),
      clean_events: rows(j, 'clean_events', where),
      orders: rows(j, 'orders', where),
      identity_links: rows(j, 'identity_links', where),
    };
  });
  return { schema_version: EXPECTED_SCHEMA_VERSION, journeys };
}

export function parseEmitted(raw: unknown): Emitted {
  const file = 'events_emitted.json';
  const o = schema(raw, file);
  const journeys = rows(o, 'journeys', file).map((j, n) => {
    const where = `${file}: journeys[${n}]`;
    const kind = text(j, 'kind', where);
    if (!(KINDS as readonly string[]).includes(kind)) throw new Error(`${where}.kind: ismeretlen ("${kind}")`);
    const emitted_events = rows(j, 'emitted_events', where).map((e, m): EmittedEvent => {
      const at = `${where}.emitted_events[${m}]`;
      const fate = text(e, 'fate', at);
      if (!(FATES as readonly string[]).includes(fate)) throw new Error(`${at}.fate: ismeretlen ("${fate}")`);
      return {
        ...e,
        event_id: text(e, 'event_id', at),
        event_name: text(e, 'event_name', at),
        occurred_at: text(e, 'occurred_at', at),
        session_id: text(e, 'session_id', at),
        anonymous_id: text(e, 'anonymous_id', at),
        fate: fate as Fate,
      };
    });
    return { kind: kind as Kind, emitted_events };
  });
  for (const k of KINDS) {
    if (!journeys.some(j => j.kind === k)) throw new Error(`${file}: hiányzik a "${k}" journey`);
  }
  return { schema_version: EXPECTED_SCHEMA_VERSION, journeys };
}

// Betolteskor egyszer vegigszamol mindent, amit a lap kesobb rajzolni fog. Ha a
// fajlok ellentmondanak egymasnak vagy egy nevezo nulla, az ITT derul ki, es
// hibasor lesz belole — nem rajzolas kozben, ahol az egesz muszert vinne el.
export function checkEventsData(data: EventsData): EventsData {
  // A lap kimondja, hogy duplikatum nem kerult be: ez akkor igaz, ha a
  // raw_events pontosan annyi, ahany kulonbozo esemeny elment.
  const e = data.ledger.events;
  if (e.raw_events !== e.sent_unique) {
    throw new Error(`events_ledger.json: raw_events (${e.raw_events}) nem egyezik az elküldött eseményekkel (${e.sent_unique})`);
  }
  eventPath(data.ledger);
  sides(data.ledger);
  for (const k of KINDS) alignJourney(k, data.sample, data.emitted);
  return data;
}

// Hianyzo fajlnal a dev szerver / nginx SPA-fallbackje 200-zal az index.html-t adja,
// ezert a nem JSON torzs is megnevezett hiba, nem csupasz SyntaxError.
export async function parseJsonResponse(r: Response, file: string): Promise<unknown> {
  if (!r.ok) throw new Error(`${file}: ${r.status}`);
  try {
    return await r.json();
  } catch {
    throw new Error(`${file}: nem JSON (hiányzik a fájl?)`);
  }
}

const FILES = ['events_ledger.json', 'events_sample.json', 'events_emitted.json'] as const;

export function useEventsData() {
  const [data, setData] = useState<EventsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let elo = true;
    Promise.all(
      FILES.map(f => fetch(`/data/${f}`).then(r => parseJsonResponse(r, f))),
    )
      .then(([ledger, sample, emitted]) => {
        const parsed = checkEventsData({
          ledger: parseLedger(ledger),
          sample: parseSample(sample),
          emitted: parseEmitted(emitted),
        });
        if (elo) setData(parsed);
      })
      .catch(e => elo && setError(e instanceof Error ? e.message : String(e)));
    return () => { elo = false; };
  }, []);

  return { data, error };
}
