// Az inspektor matekja: egy journey esemenyeit retegenkent egymas melle teszi.
// Ket fajlbol dolgozik, amiket a `kind` es az `event_id` kot ossze:
//   events_emitted.json — amit az emit.py legyartott, esemenyenkent a sorsaval
//   events_sample.json  — ami ebbol a collectorba megerkezett (raw, clean, orders)
// Tiszta fuggveny: nincs benne React es fetch.

export type Kind = 'stitched_two_devices' | 'anonymous' | 'no_consent';
// Ez az inspektor gombjainak sorrendje; az elso az alapallas. A veszteseg all elol,
// mert a lap allitasa az, hogy a meres veszit.
export const KINDS: readonly Kind[] = ['no_consent', 'stitched_two_devices', 'anonymous'];

export type Fate = 'sent' | 'withheld' | 'sent_twice';
export const FATES: readonly Fate[] = ['sent', 'withheld', 'sent_twice'];

// Egy adatbazis-sor vagy esemeny, ahogy a JSON-ban all.
export type Row = Record<string, unknown>;

export interface EmittedEvent extends Row {
  event_id: string;
  event_name: string;
  occurred_at: string;
  session_id: string;
  anonymous_id: string;
  fate: Fate;
}

export interface Emitted {
  schema_version: number;
  journeys: { kind: Kind; emitted_events: EmittedEvent[] }[];
}

export interface SampleJourney {
  kind: string;
  raw_events: Row[];
  clean_events: Row[];
  orders: Row[];
  identity_links: Row[];
}

export interface Sample {
  schema_version: number;
  journeys: SampleJourney[];
}

// Egy esemeny a negy retegben. null = abban a retegben nincs meg.
export interface AlignedEvent {
  eventId: string;
  eventName: string;
  occurredAt: string;
  fate: Fate;
  emitted: EmittedEvent;
  raw: Row | null;
  clean: Row | null;
  order: Row | null;
}

export interface JourneyView {
  kind: Kind;
  events: AlignedEvent[];
  anonymousIds: string[];   // az eszkozok, az elso megjelenes sorrendjeben
  identityLinks: Row[];
  counts: { emitted: number; raw: number; clean: number; orders: number };
}

const NO_LAYERS: SampleJourney = {
  kind: 'no_consent', raw_events: [], clean_events: [], orders: [], identity_links: [],
};

function byEventId(rows: Row[], layer: string): Map<string, Row> {
  const m = new Map<string, Row>();
  for (const r of rows) {
    if (typeof r.event_id !== 'string') throw new Error(`${layer}: egy sornak nincs event_id-ja`);
    m.set(r.event_id, r);
  }
  return m;
}

// A `kind` journey esemenyei, a legyartas sorrendjeben, retegenkent kitoltve.
// Hibat dob, ha a ket fajl ellentmond egymasnak — akkor a lap inkabb hibat
// mutat, mint egy felig igaz tablat.
export function alignJourney(kind: Kind, sample: Sample, emitted: Emitted): JourneyView {
  const em = emitted.journeys.find(j => j.kind === kind);
  if (!em) throw new Error(`events_emitted.json: nincs "${kind}" journey`);

  const found = sample.journeys.find(j => j.kind === kind);
  // A consent nelkuli journey-bol semmi nem erkezett meg: a sample-ben nincs.
  if (!found && kind !== 'no_consent') throw new Error(`events_sample.json: nincs "${kind}" journey`);
  const sm = found ?? NO_LAYERS;

  const raw = byEventId(sm.raw_events, 'raw_events');
  const clean = byEventId(sm.clean_events, 'clean_events');
  const orders = byEventId(sm.orders, 'orders');

  const known = new Set(em.emitted_events.map(e => e.event_id));
  for (const id of [...raw.keys(), ...clean.keys(), ...orders.keys()]) {
    if (!known.has(id)) throw new Error(`"${kind}": megérkezett egy esemény, amit senki nem gyártott le (${id})`);
  }

  const events = em.emitted_events.map((e): AlignedEvent => {
    const r = raw.get(e.event_id) ?? null;
    if (e.fate === 'withheld' && r) throw new Error(`"${kind}": visszatartott esemény a raw_events-ben (${e.event_id})`);
    if (e.fate !== 'withheld' && !r) throw new Error(`"${kind}": elküldött esemény hiányzik a raw_events-ből (${e.event_id})`);
    return {
      eventId: e.event_id,
      eventName: e.event_name,
      occurredAt: e.occurred_at,
      fate: e.fate,
      emitted: e,
      raw: r,
      clean: clean.get(e.event_id) ?? null,
      order: orders.get(e.event_id) ?? null,
    };
  });

  return {
    kind,
    events,
    anonymousIds: [...new Set(em.emitted_events.map(e => e.anonymous_id))],
    identityLinks: sm.identity_links,
    counts: {
      emitted: events.length,
      raw: events.filter(e => e.raw).length,
      clean: events.filter(e => e.clean).length,
      orders: events.filter(e => e.order).length,
    },
  };
}
