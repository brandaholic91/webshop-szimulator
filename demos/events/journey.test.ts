import { describe, expect, it } from 'vitest';
import { EMITTED, SAMPLE } from './fixture';
import { KINDS, alignJourney } from './journey';
import type { Emitted, Sample } from './journey';

// Mely masolat: a tesztek belenyulhatnak anelkul, hogy egymast zavarnak.
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v));

describe('alignJourney', () => {
  it('a ket eszkozos vasarlo: minden esemeny megvan minden retegben, a rendeles a purchase soran', () => {
    const j = alignJourney('stitched_two_devices', SAMPLE, EMITTED);
    expect(j.events.map(e => e.eventId)).toEqual(['a1', 'a2', 'a3', 'a4']);
    expect(j.counts).toEqual({ emitted: 4, raw: 4, clean: 4, orders: 2 });
    expect(j.events[0].order).toBeNull();
    expect(j.events[1].order).toMatchObject({ order_id: 'ord-1' });
    expect(j.events[1].clean).toMatchObject({ person_id: 'cust-1' });
    expect(j.anonymousIds).toEqual(['dev-A', 'dev-B']);
    expect(j.identityLinks).toHaveLength(2);
  });

  it('a ketszer elkuldott esemeny egy sor, es egyszer van a raw_events-ben', () => {
    const j = alignJourney('stitched_two_devices', SAMPLE, EMITTED);
    const dupla = j.events.filter(e => e.fate === 'sent_twice');
    expect(dupla.map(e => e.eventId)).toEqual(['a2']);
    expect(dupla[0].raw).not.toBeNull();
  });

  it('a nevtelen latogato: megerkezik, de nincs rendeles es nincs link', () => {
    const j = alignJourney('anonymous', SAMPLE, EMITTED);
    expect(j.counts).toEqual({ emitted: 2, raw: 2, clean: 2, orders: 0 });
    expect(j.identityLinks).toEqual([]);
    expect(j.anonymousIds).toEqual(['dev-C']);
  });

  it('a consent nelkuli vasarlo: legyartva igen, minden mas reteg ures', () => {
    const j = alignJourney('no_consent', SAMPLE, EMITTED);
    expect(j.counts).toEqual({ emitted: 2, raw: 0, clean: 0, orders: 0 });
    expect(j.events.every(e => e.fate === 'withheld')).toBe(true);
    expect(j.events.every(e => e.raw === null && e.clean === null && e.order === null)).toBe(true);
    expect(j.events[1].eventName).toBe('purchase');
  });

  it('mindharom journey osszerendezheto', () => {
    for (const k of KINDS) expect(alignJourney(k, SAMPLE, EMITTED).kind).toBe(k);
  });
});

describe('alignJourney: ellentmondo fajloknal hibat dob', () => {
  it('hianyzo journey az emitted fajlban', () => {
    const e: Emitted = { ...EMITTED, journeys: EMITTED.journeys.filter(j => j.kind !== 'no_consent') };
    expect(() => alignJourney('no_consent', SAMPLE, e)).toThrow(/events_emitted\.json/);
  });

  it('hianyzo journey a sample fajlban (a no_consent kivetelevel)', () => {
    const s: Sample = { ...SAMPLE, journeys: SAMPLE.journeys.filter(j => j.kind !== 'anonymous') };
    expect(() => alignJourney('anonymous', s, EMITTED)).toThrow(/events_sample\.json/);
  });

  it('megerkezett esemeny, amit senki nem gyartott le', () => {
    const s = copy(SAMPLE);
    s.journeys[1].raw_events.push({ event_id: 'idegen', event_name: 'page_view' });
    expect(() => alignJourney('anonymous', s, EMITTED)).toThrow(/senki nem gyártott le/);
  });

  it('elkuldott esemeny, ami nincs a raw_events-ben', () => {
    const s = copy(SAMPLE);
    s.journeys[1].raw_events.pop();
    expect(() => alignJourney('anonymous', s, EMITTED)).toThrow(/hiányzik a raw_events-ből/);
  });

  it('visszatartott esemeny, ami megis megerkezett', () => {
    const s = copy(SAMPLE);
    s.journeys.push({
      kind: 'no_consent', raw_events: [{ event_id: 'c1' }], clean_events: [], orders: [], identity_links: [],
    });
    expect(() => alignJourney('no_consent', s, EMITTED)).toThrow(/visszatartott esemény/);
  });

  it('event_id nelkuli sor', () => {
    const s = copy(SAMPLE);
    s.journeys[1].clean_events.push({ event_name: 'page_view' });
    expect(() => alignJourney('anonymous', s, EMITTED)).toThrow(/clean_events/);
  });
});
