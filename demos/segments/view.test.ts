import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ariAxis, cellFill, cellInk, chartLabel, clusterHeaders, clusterLabel, confusionRows, dec1, dec3, ft,
  int, kData, parseSegments, pct, pctNumber, profileRows, recoveryPoints, selectionRows, seqStep,
  silhouetteAxis, silhouettePoints, kNal, DEFAULT_FEATURE_SET, FEATURE_SETS, FEATURE_SET_TITLE,
} from './view';

const nbsp = (s: string) => s.replace(/\u00a0/g, ' ');

// Kezzel irt, a spec 5. fejezete szerinti alak: 100 vevo, ket k, kerek szamok.
// A konfuzio sorai (az igazsag) mindket k-nal 40 / 25 / 25 / 10, az oszlopai a meretek.
const profil = (customers: number, aov: number, orders: number, sessions: number, share: number[]) =>
  ({ customers, aov_huf: aov, orders_per_customer: orders, sessions_per_customer: sessions, channel_share: share });

const BY2 = {
  silhouette: 0.2, inertia: 900, ari: 0.3, sizes: [60, 40],
  profiles: [
    profil(60, 12000, 1.2, 3, [0.5, 0.1, 0.1, 0.1, 0.1, 0.1]),
    profil(40, 20000, 2.5, 9, [0.1, 0.1, 0.1, 0.1, 0.2, 0.4]),
  ],
  confusion: [[30, 10], [20, 5], [5, 20], [5, 5]],
};
const BY3 = {
  silhouette: 0.15, inertia: 700, ari: 0.25, sizes: [50, 30, 20],
  profiles: [
    profil(50, 11000, 1.1, 3, [0.5, 0.1, 0.1, 0.1, 0.1, 0.1]),
    profil(30, 18000, 2.0, 8, [0.1, 0.1, 0.1, 0.1, 0.2, 0.4]),
    profil(20, 30000, 3.0, 10, [0.1, 0.1, 0.1, 0.4, 0.2, 0.1]),
  ],
  confusion: [[25, 10, 5], [15, 5, 5], [5, 10, 10], [5, 5, 0]],
};
const FIXTURE = {
  schema_version: 2,
  ks: [2, 3],
  default_k: 2,
  seed: 1,
  features: ['log_orders', 'log_aov', 'log_revenue', 'recency_days', 'tenure_days', 'log_sessions',
    'share_google_ads', 'share_meta_ads', 'share_arukereso', 'share_organic', 'share_direct', 'share_email'],
  customers: 100,
  segments: ['alkalmi', 'arvadasz', 'markahu', 'nagykosaras'],
  selection: { all: [0.45, 0.25, 0.2, 0.1], clustered: [0.4, 0.25, 0.25, 0.1] },
  ceiling: { ari: 0.48, accuracy: 0.74 },
  by_k: { '2': BY2, '3': BY3 },
};
// A fixture a keszlet lapos alakja (ahogy a lap fuggvenyei latjak); a `file` ebbol irja
// meg a 2-es semat: a kozos mezok felul, a keszletfuggok mindket keszlet alatt.
const SHARED = ['schema_version', 'ks', 'seed', 'customers', 'segments', 'selection'];
function file(flat: Record<string, unknown>, value: Record<string, unknown> = {}) {
  const top: Record<string, unknown> = { feature_sets: ['value', 'all'] };
  const set: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(flat)) (SHARED.includes(key) ? top : set)[key] = v;
  return {
    ...top,
    by_feature_set: { value: { ...set, features: FIXTURE.features.slice(0, 5), ...value }, all: set },
  };
}
const parse = (flat: Record<string, unknown>) => parseSegments(file(flat)).sets.all;
const data = parse(FIXTURE);

describe('parseSegments', () => {
  it('a jo fajlt elfogadja', () => {
    expect(data.default_k).toBe(2);
    expect(data.ks).toEqual([2, 3]);
    expect(kData(data, 3).sizes).toEqual([50, 30, 20]);
  });

  it('a hibas fajl megnevezett hiba, nem ures abra', () => {
    expect(() => parse({ ...FIXTURE, schema_version: 3 })).toThrow(/schema_version/);
    expect(() => parse({ ...FIXTURE, default_k: 4 })).toThrow(/default_k/);
    expect(() => parse({ ...FIXTURE, segments: ['alkalmi', 'markahu', 'arvadasz', 'nagykosaras'] }))
      .toThrow(/segments: a lap ezt várja/);
    expect(() => parse({ ...FIXTURE, by_k: { ...FIXTURE.by_k, '3': { ...BY3, confusion: [[1, 2], [3, 4], [5, 6], [7, 8]] } } }))
      .toThrow(/confusion/);
    expect(() => parse({ ...FIXTURE, by_k: { ...FIXTURE.by_k, '2': { ...BY2, sizes: [60, 50] } } }))
      .toThrow(/sizes/);
    expect(() => parse({ ...FIXTURE, by_k: { '2': BY2 } })).toThrow(/by_k\.3/);
    expect(() => parse({ ...FIXTURE, by_k: { ...FIXTURE.by_k, '2': { ...BY2, confusion: [[30, 10], [20, 5], [10, 15], [5, 5]] } } }))
      .toThrow(/oszlopösszegek/);
    expect(() => parse({ ...FIXTURE, ks: [2.5, 3] })).toThrow(/ks\[0\]: egész/);
  });

  it('az ARI lehet negativ, a meret nem', () => {
    expect(parse({ ...FIXTURE, by_k: { ...FIXTURE.by_k, '2': { ...BY2, ari: -0.02 } } }).by_k['2'].ari).toBe(-0.02);
    expect(() => parse({ ...FIXTURE, customers: -1 })).toThrow(/customers/);
  });

  it('a ket keszlet kulon all, kozos vevokkel es szelekcioval', () => {
    const f = parseSegments(file(FIXTURE, { default_k: 3, ceiling: { ari: 0.1, accuracy: 0.5 } }));
    expect(Object.keys(f.sets)).toEqual(['value', 'all']);
    expect(f.sets.value.features).toHaveLength(5);
    expect(f.sets.all.features).toHaveLength(12);
    expect(f.sets.value.default_k).toBe(3);
    expect(f.sets.all.default_k).toBe(2);
    expect(f.sets.value.ceiling.ari).toBe(0.1);
    expect(f.sets.value.customers).toBe(f.sets.all.customers);
    expect(f.sets.value.selection).toEqual(f.sets.all.selection);
  });

  it('a regi sema, a hianyzo keszlet es a rossz jellemzoszam megnevezett hiba', () => {
    expect(() => parseSegments({ ...FIXTURE, schema_version: 1 })).toThrow(/schema_version 1/);
    const hianyos = file(FIXTURE);
    delete (hianyos.by_feature_set as Record<string, unknown>).value;
    expect(() => parseSegments(hianyos)).toThrow(/by_feature_set\.value/);
    expect(() => parseSegments(file(FIXTURE, { features: FIXTURE.features })))
      .toThrow(/features: 5 név kell.*value/);
    expect(() => parseSegments({ ...file(FIXTURE), feature_sets: ['all', 'value'] }))
      .toThrow(/feature_sets: a lap ezt várja/);
  });

  it('a lap az ertekjellemzokkel nyit, es mindket keszletnek van felirata', () => {
    expect(FEATURE_SETS).toEqual(['value', 'all']);
    expect(DEFAULT_FEATURE_SET).toBe('value');
    expect(FEATURE_SET_TITLE.value).toContain('5');
    expect(FEATURE_SET_TITLE.all).toContain('12');
  });
});

describe('a ket panel', () => {
  it('k szerinti pontok', () => {
    expect(recoveryPoints(data)).toEqual([{ k: 2, value: 0.3 }, { k: 3, value: 0.25 }]);
    expect(silhouettePoints(data)).toEqual([{ k: 2, value: 0.2 }, { k: 3, value: 0.15 }]);
  });

  it('az ARI tengelye a felso hatar fole er, es lefele is nyit, ha kell', () => {
    expect(ariAxis(data)).toEqual({ min: 0, max: 0.48 * 1.2 });
    const neg = parse({ ...FIXTURE, by_k: { ...FIXTURE.by_k, '3': { ...BY3, ari: -0.1 } } });
    expect(ariAxis(neg).min).toBeCloseTo(-0.12, 12);
    expect(silhouetteAxis(data)).toEqual({ min: 0, max: 0.3 });
  });

  it('a kepernyoolvaso szovege a pontokat, a valasztast es a referenciat is kimondja', () => {
    const label = chartLabel('ARI', recoveryPoints(data), 2, { value: 0.48, label: 'felső határ' });
    expect(label).toContain('k = 2: 0,300');
    expect(label).toContain('k = 3: 0,250');
    expect(label).toContain('Kiválasztva k = 2.');
    expect(label).toContain('felső határ: 0,480');
    expect(chartLabel('silhouette', silhouettePoints(data), 3)).not.toContain('felső');
  });
});

describe('a konfuzios matrix', () => {
  it('sor = szegmens a vevok kozti aranyaval, cella = a sor hanyada', () => {
    const rows = confusionRows(data, 2);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toEqual({
      slug: 'alkalmi', title: 'Alkalmi', total: 40, share: 0.4,
      cells: [{ count: 30, rowShare: 0.75 }, { count: 10, rowShare: 0.25 }],
    });
    expect(rows[3].cells.map(c => c.rowShare)).toEqual([0.5, 0.5]);
    expect(confusionRows(data, 3)[3].cells[2]).toEqual({ count: 0, rowShare: 0 });
  });

  it('oszlopfejlec = klaszter a meretevel', () => {
    expect(clusterHeaders(data, 2)).toEqual([
      { label: 'K1', size: 60, share: 0.6 }, { label: 'K2', size: 40, share: 0.4 },
    ]);
    expect(clusterLabel(7)).toBe('K8');
  });

  it('a szekvencialis ot foka a meglevo ordinalis tokenekbol, a cimke a 3. foktol feher', () => {
    expect([0, 0.19, 0.2, 0.39, 0.4, 0.79, 0.8, 1].map(seqStep)).toEqual([0, 0, 1, 1, 2, 3, 4, 4]);
    expect(cellFill(0)).toBe('var(--color-viz-ord-1)');
    expect(cellFill(1)).toBe('var(--color-viz-ord-5)');
    expect(cellInk(0.39)).toBe('var(--color-on-surface)');
    expect(cellInk(0.4)).toBe('var(--color-on-primary)');
  });
});

describe('a ket tabla', () => {
  it('profil: klaszterenkent a modell kimenete es a legnagyobb csatorna', () => {
    const rows = profileRows(data, 2);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual({
      label: 'K2', customers: 40, share: 0.4, aovHuf: 20000, ordersPerCustomer: 2.5,
      sessionsPerCustomer: 9, topChannel: { title: 'E-mail', share: 0.4 },
    });
    expect(rows[0].topChannel).toEqual({ title: 'Google Ads', share: 0.5 });
  });

  it('szelekcio: a negy szegmens mindenki es a vevok kozt', () => {
    const rows = selectionRows(data);
    expect(rows.map(r => r.title)).toEqual(['Alkalmi', 'Árvadász', 'Márkahű', 'Nagykosaras']);
    expect(rows[2]).toEqual({ slug: 'markahu', title: 'Márkahű', all: 0.2, clustered: 0.25 });
  });
});

describe('szamformatum', () => {
  it('magyar, tizedesvesszovel', () => {
    expect(pct(0.753)).toBe('75,3%');
    expect(pct(0.753, 0)).toBe('75%');
    expect(pctNumber(0.753)).toBe('75');
    expect(dec3(0.2431)).toBe('0,243');
    expect(dec3(-0.0204)).toBe('-0,020');
    expect(dec3(-0.0004)).toBe('0,000');
    expect(dec1(2.49)).toBe('2,5');
    // Node hu-HU locale: a negyjegyu szam nincs csoportositva ("9635"), az otjegyu igen.
    expect(nbsp(int(9635))).toBe('9635');
    expect(nbsp(ft(15200))).toBe('15 200 Ft');
  });
});

// A valodi, kiszallitott fajlon fut. Szamot szandekosan NEM rogzit: a vilag
// ujragyartasakor az ertekek valtozhatnak, az alakjuk es az osszefuggeseik nem.
describe('a publikalt segments.json', () => {
  const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
  const file = parseSegments(JSON.parse(readFileSync(here('../../public/data/segments.json'), 'utf-8')));

  // mindket keszletre ugyanazok az osszefuggesek
  describe.each(FEATURE_SETS)('%s', name => {
    const real = file.sets[name];

    it('het k, mindegyiknel 4 x k matrix, k profil, es az oszlopok a meretek', () => {
      expect(real.ks).toEqual([2, 3, 4, 5, 6, 7, 8]);
      for (const k of real.ks) {
        const d = kData(real, k);
        expect(confusionRows(real, k)).toHaveLength(4);
        expect(clusterHeaders(real, k).map(h => h.size)).toEqual(d.sizes);
        expect(profileRows(real, k)).toHaveLength(k);
        expect(d.sizes.reduce((a, b) => a + b, 0)).toBe(real.customers);
      }
    });

    it('az igazsag sorai nem mozdulnak a k-val', () => {
      const elso = confusionRows(real, real.ks[0]).map(r => r.total);
      for (const k of real.ks) expect(confusionRows(real, k).map(r => r.total)).toEqual(elso);
    });

    it('a default_k a silhouette csucsa', () => {
      const pts = silhouettePoints(real);
      const csucs = pts.reduce((a, b) => (b.value > a.value ? b : a));
      expect(real.default_k).toBe(csucs.k);
    });

    it('a felso hatar belefer a tengelybe', () => {
      expect(ariAxis(real).max).toBeGreaterThan(real.ceiling.ari);
      for (const p of recoveryPoints(real)) expect(p.value).toBeLessThan(ariAxis(real).max);
    });
  });
});

describe('kNal', () => {
  it('a magyar rag a szam kiejteset koveti, k = 2…8-ra', () => {
    expect([2, 3, 4, 5, 6, 7, 8].map(kNal)).toEqual([
      'k = 2-nél', 'k = 3-nál', 'k = 4-nél', 'k = 5-nél', 'k = 6-nál', 'k = 7-nél', 'k = 8-nál',
    ]);
  });
});
