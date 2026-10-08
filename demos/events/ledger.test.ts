import { describe, expect, it } from 'vitest';
import { eventPath, ratio, sides } from './ledger';
import type { Ledger } from './ledger';

// Kezzel szamolhato fokonyv; a valodi a world/out/events_ledger.json.
const L: Ledger = {
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

describe('eventPath', () => {
  it('hat sor, a fokonyv sorrendjeben, a fajl szamaival', () => {
    const rows = eventPath(L);
    expect(rows.map(r => r.key)).toEqual([
      'generated', 'withheld_no_consent', 'sent_unique', 'sent_duplicate', 'raw_events', 'clean_events',
    ]);
    expect(rows.map(r => r.value)).toEqual([1000, 200, 800, 8, 800, 800]);
  });

  it('az aranyok: a visszatartott a legyartotthoz, a duplikatum az elkuldotthoz', () => {
    const by = Object.fromEntries(eventPath(L).map(r => [r.key, r]));
    expect(by.generated.share).toBeNull();
    expect(by.withheld_no_consent.share).toBeCloseTo(0.2, 12);
    expect(by.sent_unique.share).toBeCloseTo(0.8, 12);
    expect(by.sent_duplicate.share).toBeCloseTo(0.01, 12);
    expect(by.sent_duplicate.shareOf).toBe('az elküldöttből');
    expect(by.clean_events.share).toBeCloseTo(0.8, 12);
  });

  it('nulla legyartott vagy nulla elkuldott esemenynel hibat dob', () => {
    expect(() => eventPath({ ...L, events: { ...L.events, generated: 0 } })).toThrow(/nevező nulla/);
    expect(() => eventPath({ ...L, events: { ...L.events, sent_unique: 0 } })).toThrow(/nevező nulla/);
  });
});

describe('sides', () => {
  it('harom sor, a lefedettseg pipeline / DGP', () => {
    const rows = sides(L);
    expect(rows.map(r => r.key)).toEqual(['sessions', 'orders', 'revenue_huf']);
    expect(rows[0]).toMatchObject({ dgp: 200, pipeline: 160 });
    expect(rows[0].coverage).toBeCloseTo(0.8, 12);
    expect(rows[1].coverage).toBeCloseTo(0.8, 12);
    expect(rows[2].coverage).toBeCloseTo(0.75, 12);
  });

  it('nulla DGP-oldalnal hibat dob, es megnevezi a sort', () => {
    expect(() => sides({ ...L, orders: { dgp: 0, pipeline: 0 } })).toThrow(/rendelés/);
  });
});

describe('ratio', () => {
  it('NaN-t es vegtelent sosem ad', () => {
    expect(ratio(1, 4, 'x')).toBe(0.25);
    expect(() => ratio(1, 0, 'x')).toThrow();
    expect(() => ratio(0, 0, 'x')).toThrow();
    expect(() => ratio(1, Number.NaN, 'x')).toThrow();
  });
});
