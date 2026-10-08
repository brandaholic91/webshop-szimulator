import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { KINDS, alignJourney } from './journey';
import { eventPath, sides } from './ledger';
import { checkEventsData, parseEmitted, parseLedger, parseSample } from './useEventsData';

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const published = (name: string): unknown =>
  JSON.parse(readFileSync(here(`../../public/data/${name}`), 'utf-8'));

// A valodi, kiszallitott fajlokon fut. Szamot szandekosan NEM rogzit: a vilag
// kalibracioja kozben a fokonyv ertekei valtozhatnak, az alakjuk es az
// osszefuggeseik nem.
describe('a publikalt events-fajlok', () => {
  const data = checkEventsData({
    ledger: parseLedger(published('events_ledger.json')),
    sample: parseSample(published('events_sample.json')),
    emitted: parseEmitted(published('events_emitted.json')),
  });

  it('mindharom journey osszerendezheto', () => {
    for (const k of KINDS) expect(alignJourney(k, data.sample, data.emitted).events.length).toBeGreaterThan(0);
  });

  it('a ket eszkozos vasarlo ket eszkozrol jon, es mindket eszkozhoz van link', () => {
    const j = alignJourney('stitched_two_devices', data.sample, data.emitted);
    expect(j.anonymousIds).toHaveLength(2);
    expect(j.identityLinks).toHaveLength(2);
    expect(j.counts.orders).toBeGreaterThanOrEqual(2);
    expect(j.counts.raw).toBe(j.counts.emitted);
  });

  it('a consent nelkuli vasarlobol semmi nem erkezik meg', () => {
    const j = alignJourney('no_consent', data.sample, data.emitted);
    expect(j.counts.emitted).toBeGreaterThan(0);
    expect(j.counts).toMatchObject({ raw: 0, clean: 0, orders: 0 });
    expect(j.events.at(-1)?.eventName).toBe('purchase');
  });

  it('a pipeline mindenbol kevesebbet lat, mint ami tortent', () => {
    for (const row of sides(data.ledger)) {
      expect(row.coverage, row.key).toBeGreaterThan(0);
      expect(row.coverage, row.key).toBeLessThan(1);
    }
    const path = Object.fromEntries(eventPath(data.ledger).map(r => [r.key, r.value]));
    expect(path.generated).toBe(path.withheld_no_consent + path.sent_unique);
    expect(path.raw_events).toBe(path.sent_unique);
  });
});

describe('a lap forrasa', () => {
  it('a kezzel irt fixture-t csak teszt importalja', () => {
    const dir = here('./');
    const vetkes = readdirSync(dir)
      .filter(f => /\.tsx?$/.test(f) && !f.endsWith('.test.ts') && f !== 'fixture.ts')
      .filter(f => readFileSync(`${dir}${f}`, 'utf-8').includes("'./fixture'"));
    expect(vetkes).toEqual([]);
  });
});
