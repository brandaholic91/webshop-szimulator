import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { shopBaseline } from './usePeekData';

const published = JSON.parse(readFileSync(
  fileURLToPath(new URL('../../public/data/world_outcome.json', import.meta.url)), 'utf-8',
));

describe('shopBaseline', () => {
  it('kezzel kiszamolhato peldan', () => {
    const b = shopBaseline({
      weekly_sessions: [700, 700], weekly_orders: [7, 21], daily_seasonality: new Array(14).fill(1),
    });
    expect(b.sessionsPerDay).toBe(100);
    expect(b.baseRate).toBeCloseTo(0.02, 12);
  });

  // Szandekosan rogzitett ket szam a public/data/world_outcome.json-bol: ha a
  // vilagot ujrageneralod, ez a teszt elbukik — akkor ezt a ket erteket ird at.
  it('a publikalt vilagon a bolt ismert szamait adja', () => {
    const b = shopBaseline(published);
    expect(b.sessionsPerDay).toBe(1012);
    expect(Math.abs(b.baseRate - 0.018204)).toBeLessThan(1e-6);
  });

  it('hianyzo mezonel hibat dob, nem NaN-t ad', () => {
    expect(() => shopBaseline({})).toThrow();
    expect(() => shopBaseline(null)).toThrow();
    expect(() => shopBaseline({ ...published, weekly_sessions: undefined })).toThrow();
    expect(() => shopBaseline({ ...published, daily_seasonality: [] })).toThrow();
  });

  it('nulla forgalomnal hibat dob', () => {
    expect(() => shopBaseline({
      weekly_sessions: [0, 0], weekly_orders: [0, 0], daily_seasonality: [1, 1],
    })).toThrow();
  });
});
