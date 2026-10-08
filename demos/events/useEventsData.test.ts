import { describe, expect, it } from 'vitest';
import { EMITTED, SAMPLE } from './fixture';
import { checkEventsData, parseEmitted, parseJsonResponse, parseLedger, parseSample } from './useEventsData';

const LEDGER = {
  schema_version: 1,
  events: {
    generated: 1000, withheld_no_consent: 200, sent_unique: 800,
    sent_duplicate: 8, raw_events: 800, clean_events: 800,
  },
  sessions: { dgp: 200, pipeline: 160 },
  orders: { dgp: 10, pipeline: 8 },
  revenue_huf: { dgp: 180_000, pipeline: 135_000 },
  identity: {
    customers_dgp: 150, customers_consented_dgp: 125, devices_dgp: 190, devices_pipeline: 152,
    identity_links: 8, customers_identified: 7, persons_after_stitching: 151,
  },
};
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v));

describe('parseLedger', () => {
  it('ep fajlt valtozatlanul visszaad', () => {
    expect(parseLedger(LEDGER)).toEqual(LEDGER);
  });

  it('hianyzo vagy rossz mezonel megnevezi a mezot', () => {
    expect(() => parseLedger(null)).toThrow(/events_ledger\.json/);
    expect(() => parseLedger({ ...LEDGER, schema_version: 2 })).toThrow(/schema_version 2/);
    expect(() => parseLedger({ ...LEDGER, orders: undefined })).toThrow(/orders/);
    expect(() => parseLedger({ ...LEDGER, sessions: { dgp: 200 } })).toThrow(/sessions\.pipeline/);
    expect(() => parseLedger({ ...LEDGER, events: { ...LEDGER.events, raw_events: '800' } })).toThrow(/events\.raw_events/);
    expect(() => parseLedger({ ...LEDGER, revenue_huf: { dgp: -1, pipeline: 0 } })).toThrow(/revenue_huf\.dgp/);
    expect(() => parseLedger({ ...LEDGER, identity: [] })).toThrow(/identity/);
  });
});

describe('parseSample', () => {
  it('ep fajlt valtozatlanul visszaad', () => {
    expect(parseSample(SAMPLE)).toEqual(SAMPLE);
  });

  it('hianyzo retegnel megnevezi a journey-t es a reteget', () => {
    const s = copy(SAMPLE) as any;
    delete s.journeys[1].orders;
    expect(() => parseSample(s)).toThrow(/journeys\[1\]\.orders/);
    expect(() => parseSample({ schema_version: 1 })).toThrow(/journeys/);
    expect(() => parseSample({ schema_version: 1, journeys: [null] })).toThrow(/journeys/);
  });
});

describe('parseEmitted', () => {
  it('ep fajlt valtozatlanul visszaad', () => {
    expect(parseEmitted(EMITTED)).toEqual(EMITTED);
  });

  it('ismeretlen sors, ismeretlen journey es hianyzo journey hiba', () => {
    const rosszSors = copy(EMITTED) as any;
    rosszSors.journeys[0].emitted_events[0].fate = 'elveszett';
    expect(() => parseEmitted(rosszSors)).toThrow(/fate: ismeretlen/);

    const rosszKind = copy(EMITTED) as any;
    rosszKind.journeys[0].kind = 'valami';
    expect(() => parseEmitted(rosszKind)).toThrow(/kind: ismeretlen/);

    const hianyos = { ...EMITTED, journeys: EMITTED.journeys.slice(0, 2) };
    expect(() => parseEmitted(hianyos)).toThrow(/hiányzik a "no_consent" journey/);
  });

  it('azonosito nelkuli esemeny hiba', () => {
    const e = copy(EMITTED) as any;
    delete e.journeys[2].emitted_events[1].event_id;
    expect(() => parseEmitted(e)).toThrow(/emitted_events\[1\]\.event_id/);
  });
});

describe('checkEventsData', () => {
  const data = () => ({ ledger: parseLedger(LEDGER), sample: parseSample(SAMPLE), emitted: parseEmitted(EMITTED) });

  it('osszeillo fajloknal valtozatlanul visszaadja az adatot', () => {
    const d = data();
    expect(checkEventsData(d)).toBe(d);
  });

  it('nulla nevezo mar betolteskor hiba', () => {
    const d = data();
    d.ledger.sessions.dgp = 0;
    expect(() => checkEventsData(d)).toThrow(/nevező nulla/);
  });

  it('ha a raw_events tobb, mint ahany kulonbozo esemeny elment, az betolteskor hiba', () => {
    const d = data();
    d.ledger.events.raw_events += 1;
    expect(() => checkEventsData(d)).toThrow(/raw_events \(801\) nem egyezik/);
  });

  it('egymasnak ellentmondo sample es emitted mar betolteskor hiba', () => {
    const d = data();
    d.sample.journeys[1].raw_events.pop();
    expect(() => checkEventsData(d)).toThrow(/hiányzik a raw_events-ből/);
  });
});

describe('parseJsonResponse', () => {
  const res = (body: string, status = 200) => new Response(body, { status });

  it('ervenyes JSON-t visszaad', async () => {
    expect(await parseJsonResponse(res('{"a":1}'), 'f.json')).toEqual({ a: 1 });
  });

  it('nem JSON torzs (SPA fallback index.html) hibaja megnevezi a fajlt', async () => {
    await expect(parseJsonResponse(res('<!doctype html><html></html>'), 'events_emitted.json')).rejects.toThrow(
      'events_emitted.json: nem JSON (hiányzik a fájl?)',
    );
  });

  it('nem 2xx statusz hibaja megnevezi a fajlt es a statuszt', async () => {
    await expect(parseJsonResponse(res('', 404), 'events_sample.json')).rejects.toThrow('events_sample.json: 404');
  });
});
