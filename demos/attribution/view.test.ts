import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  MODELS, chartGroups, chartLabel, ft, int, modelErrors, parseAttribution, pct, pp, roasFmt,
  shareMax, signedPp, tableRows, windowData,
} from './view';

// Kezzel irt, a spec 5. fejezete szerinti alak. Ket ablak, kerek szamok.
const win = (google: number, errors: number[]) => ({
  paths: { converting: 10, non_converting: google === 0.3 ? 40 : 25 },
  share: {
    last_click: [google, 0.1, 0.05, 0.3, 0.15, 0.1],
    linear: [0.25, 0.15, 0.05, 0.3, 0.15, 0.1],
    time_decay: [0.25, 0.15, 0.05, 0.3, 0.15, 0.1],
    markov: [0.2, 0.2, 0.1, 0.25, 0.15, 0.1],
  },
  roas: {
    last_click: [3, 1, 0.5],
    linear: [2.5, 1.5, 0.5],
    time_decay: [2.5, 1.5, 0.5],
    markov: [2, 2, 1],
  },
  mean_abs_error_pp: {
    last_click: errors[0], linear: errors[1], time_decay: errors[2], markov: errors[3],
  },
});

const FIXTURE = {
  schema_version: 1,
  windows: [7, 30],
  default_window: 30,
  channels: ['google_ads', 'meta_ads', 'arukereso', 'organic', 'direct', 'email'],
  paid: ['google_ads', 'meta_ads', 'arukereso'],
  models: ['last_click', 'linear', 'time_decay', 'markov'],
  total_revenue_huf: 2000,
  pipeline_revenue_huf: 1600,
  truth: {
    google_ads: { share: 0.2, roas: 2 },
    meta_ads: { share: 0.2, roas: 2 },
    arukereso: { share: 0.1, roas: 1 },
  },
  by_window: { '7': win(0.3, [8.3, 5, 5, 0]), '30': win(0.35, [10, 5, 5, 0]) },
};
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v));

describe('parseAttribution', () => {
  it('ep fajlt valtozatlanul visszaad', () => {
    expect(parseAttribution(FIXTURE)).toEqual(FIXTURE);
  });

  it('hianyzo vagy rossz mezonel megnevezi a mezot', () => {
    expect(() => parseAttribution(null)).toThrow(/attribution\.json/);
    expect(() => parseAttribution({ ...FIXTURE, schema_version: 2 })).toThrow(/schema_version 2/);
    expect(() => parseAttribution({ ...FIXTURE, models: ['markov', 'linear', 'time_decay', 'last_click'] })).toThrow(/models/);
    expect(() => parseAttribution({ ...FIXTURE, channels: FIXTURE.channels.slice(0, 5) })).toThrow(/channels/);
    expect(() => parseAttribution({ ...FIXTURE, default_window: 14 })).toThrow(/default_window \(14\)/);
    expect(() => parseAttribution({ ...FIXTURE, windows: [] })).toThrow(/windows/);

    const nincsIgazsag = copy(FIXTURE) as any;
    delete nincsIgazsag.truth.meta_ads;
    expect(() => parseAttribution(nincsIgazsag)).toThrow(/truth\.meta_ads/);

    const rovid = copy(FIXTURE) as any;
    rovid.by_window['30'].share.markov.pop();
    expect(() => parseAttribution(rovid)).toThrow(/by_window\.30\.share\.markov/);

    const nincsAblak = copy(FIXTURE) as any;
    delete nincsAblak.by_window['7'];
    expect(() => parseAttribution(nincsAblak)).toThrow(/by_window\.7/);

    const szoveg = copy(FIXTURE) as any;
    szoveg.by_window['7'].mean_abs_error_pp.linear = '5';
    expect(() => parseAttribution(szoveg)).toThrow(/by_window\.7\.mean_abs_error_pp\.linear/);
  });
});

describe('a nezet sorai', () => {
  const data = parseAttribution(FIXTURE);

  it('az abra: fizetett csatornankent negy sav, letra-sorrendben, az igazsaggal', () => {
    const groups = chartGroups(data, 30);
    expect(groups.map(g => g.slug)).toEqual(['google_ads', 'meta_ads', 'arukereso']);
    expect(groups[0].title).toBe('Google Ads');
    expect(groups[0].truth).toBe(0.2);
    expect(groups[0].bars.map(b => b.model)).toEqual([...MODELS]);
    expect(groups[0].bars.map(b => b.share)).toEqual([0.35, 0.25, 0.25, 0.2]);
    expect(groups[0].bars[0]).toMatchObject({ label: 'Last-click', short: 'LC', color: 'var(--color-viz-ord-1)' });
    expect(groups[0].bars[0].errorPp).toBeCloseTo(15);
    expect(groups[1].bars[0].errorPp).toBeCloseTo(-10);   // alulbecsles: negativ
  });

  it('az ablak valtasa csak a savokat mozditja, az igazsagot nem', () => {
    const a = chartGroups(data, 7), b = chartGroups(data, 30);
    expect(a[0].bars[0].share).toBe(0.3);
    expect(b[0].bars[0].share).toBe(0.35);
    expect(a.map(g => g.truth)).toEqual(b.map(g => g.truth));
  });

  it('az y-tengely teteje minden ablakra kozos', () => {
    expect(shareMax(data)).toBeCloseTo(0.35 * 1.15);
  });

  it('a tabla mind a hat csatornat adja; igazsag es ROAS csak a fizetetteknel', () => {
    const rows = tableRows(data, 30);
    expect(rows.map(r => r.title)).toEqual(['Google Ads', 'Meta Ads', 'Árukereső', 'Organikus', 'Direct', 'E-mail']);
    expect(rows[0]).toMatchObject({ share: [0.35, 0.25, 0.25, 0.2], truthShare: 0.2, roas: [3, 2.5, 2.5, 2], truthRoas: 2 });
    expect(rows[2].roas).toEqual([0.5, 0.5, 0.5, 1]);
    expect(rows[3]).toMatchObject({ share: [0.3, 0.3, 0.3, 0.25], truthShare: null, roas: null, truthRoas: null });
  });

  it('a readout: modellenkent az atlagos elteres', () => {
    expect(modelErrors(data, 7).map(e => [e.label, e.errorPp])).toEqual([
      ['Last-click', 8.3], ['Lineáris', 5], ['Time-decay', 5], ['Markov', 0],
    ]);
    expect(windowData(data, 7).paths).toEqual({ converting: 10, non_converting: 40 });
  });

  it('ismeretlen ablak megnevezett hiba', () => {
    expect(() => windowData(data, 14)).toThrow(/nincs 14 napos ablak/);
  });

  it('a kepernyoolvaso szovege minden savot es az igazsagot is kimondja', () => {
    const label = chartLabel(chartGroups(data, 30), 30);
    expect(label).toContain('30 napos');
    expect(label).toContain('Google Ads: Last-click 35,0%, Lineáris 25,0%, Time-decay 25,0%, Markov 20,0%, igazság 20,0%.');
    expect(label).toContain('Árukereső:');
  });
});

describe('szamformatum', () => {
  // A hu-HU ezres elvalasztoja nem torheto szokoz (U+00A0).
  it('magyar, tizedesvesszovel', () => {
    expect(pct(0.186)).toBe('18,6%');
    expect(pct(0.2, 0)).toBe('20%');
    expect(pp(2.59)).toBe('2,6 pp');
    expect(signedPp(4.35)).toBe('+4,4 pp');
    expect(signedPp(-2.12)).toBe('-2,1 pp');
    expect(roasFmt(3.705)).toMatch(/^3,7[01]$/);
    expect(int(14561)).toBe('14 561');
    expect(ft(261682596)).toBe('261 682 596 Ft');
  });
});

// A valodi, kiszallitott fajlon fut. Szamot szandekosan NEM rogzit: a vilag
// ujragyartasakor az ertekek valtozhatnak, az alakjuk es az osszefuggeseik nem.
describe('a publikalt attribution.json', () => {
  const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
  const data = parseAttribution(JSON.parse(readFileSync(here('../../public/data/attribution.json'), 'utf-8')));

  it('minden ablakra megvan a harom csoport negy savval', () => {
    for (const w of data.windows) {
      const groups = chartGroups(data, w);
      expect(groups).toHaveLength(3);
      for (const g of groups) expect(g.bars).toHaveLength(4);
      expect(tableRows(data, w)).toHaveLength(6);
      expect(modelErrors(data, w)).toHaveLength(4);
    }
  });

  it('minden modell a teljes bevetelt osztja szet', () => {
    for (const w of data.windows) {
      for (const m of data.models) {
        const sum = windowData(data, w).share[m].reduce((a, b) => a + b, 0);
        expect(sum, `${w} nap, ${m}`).toBeCloseTo(1, 9);
      }
    }
  });

  it('a last-click nem fugg az ablaktol, es a konvertalo utvonalak szama sem', () => {
    const first = windowData(data, data.windows[0]);
    for (const w of data.windows) {
      const d = windowData(data, w);
      d.share.last_click.forEach((v, i) => expect(v).toBeCloseTo(first.share.last_click[i], 12));
      expect(d.paths.converting).toBe(first.paths.converting);
    }
  });

  it('minden sav belefer a kozos y-tengelybe', () => {
    const max = shareMax(data);
    for (const w of data.windows) {
      for (const g of chartGroups(data, w)) {
        expect(g.truth).toBeLessThan(max);
        for (const b of g.bars) expect(b.share).toBeLessThan(max);
      }
    }
  });
});
