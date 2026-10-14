import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { channelValues, cheapNotBest } from './value';
import type { WorldData } from './useWorldData';

const cf = (spend: number, inc: number) =>
  ({ weekly_revenue: [], spend_huf: spend, incremental_revenue_huf: inc, true_roas: inc / spend, share_of_revenue: 0 });
const ch = (slug: string, sessions: number, audience: number[]) =>
  ({ slug, adstock_decay: 0, half_saturation_huf: 1, shape: 1, reach_scale: 1, paid_sessions: sessions, audience });

// Kezzel irt vilag: a Meta latogatasa a legolcsobb, a Google terul meg a legjobban.
const DATA = {
  response: {
    segments: ['alkalmi', 'arvadasz', 'markahu', 'nagykosaras'],
    channels: [
      ch('google_ads', 1000, [0.3, 0.5, 0.1, 0.1]),
      ch('meta_ads', 1000, [0.9, 0.05, 0.03, 0.02]),
      ch('arukereso', 500, [0.05, 0.9, 0.03, 0.02]),
    ],
    reference: {},
  },
  incrementality: {
    schema_version: 1,
    channels: ['google_ads', 'meta_ads', 'arukereso'],
    weekly_revenue: [],
    counterfactual: { google_ads: cf(100_000, 340_000), meta_ads: cf(80_000, 190_000), arukereso: cf(60_000, 120_000) },
  },
} as unknown as WorldData;

describe('channelValues', () => {
  it('a ROAS a latogatas hozamanak es aranak hanyadosa', () => {
    const rows = channelValues(DATA);
    expect(rows.map(r => r.title)).toEqual(['Google Ads', 'Meta Ads', 'Árukereső']);
    expect(rows[1]).toMatchObject({ sessions: 1000, costPerSession: 80, valuePerSession: 190 });
    for (const r of rows) expect(r.roas).toBeCloseTo(r.valuePerSession / r.costPerSession, 12);
    expect(rows[1].topSegment).toEqual({ title: 'Alkalmi', share: 0.9 });
  });

  it('a legolcsobb latogatas nem a legjobb megterules', () => {
    const p = cheapNotBest(channelValues(DATA));
    expect(p?.cheap.slug).toBe('meta_ads');
    expect(p?.best.slug).toBe('google_ads');
  });

  it('hianyzo kozonsegnel megnevezett hiba', () => {
    const rossz = JSON.parse(JSON.stringify(DATA));
    delete rossz.response.channels[2].audience;
    expect(() => channelValues(rossz)).toThrow(/arukereso/);
  });
});

// A valodi, kiszallitott fajlokon. Szamot nem rogzit, csak azt, amit a lap allit.
describe('a publikalt vilag', () => {
  const read = (f: string) =>
    JSON.parse(readFileSync(fileURLToPath(new URL(`../../public/data/${f}`, import.meta.url)), 'utf-8'));
  const data = { response: read('world_response.json'), incrementality: read('world_incrementality.json') } as WorldData;

  it('a lap allitasa igaz: a legolcsobb latogatasu csatorna nem terul meg a legjobban', () => {
    const rows = channelValues(data);
    for (const r of rows) expect(r.roas).toBeCloseTo(r.valuePerSession / r.costPerSession, 9);
    expect(cheapNotBest(rows)).not.toBeNull();
  });
});
