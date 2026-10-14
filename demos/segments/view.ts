// A segments.json alakja, az ellenorzese, es a belole szamolt sorok a ket
// panelnek, a konfuzios matrixnak, a tablaknak es a readoutnak. Tiszta
// fuggvenyek: a bongeszo itt NEM becsul (12. dontes), csak kivalasztja a mar
// kiszamolt k-t.
//
// A fajlt a world/src/world/segments.py irja; ha az alakja megvaltozik, a
// schema_version emelkedik, es itt hibauzenet lesz belole, nem ures abra.

import { CHANNELS } from '../world/channels';

// A vilag negy szegmense a config.py sorrendjeben (a fajl `segments` listaja
// ezt kell adja). A nevek a lap nevei; a modell ezeket nem latja.
export const SEGMENTS = ['alkalmi', 'arvadasz', 'markahu', 'nagykosaras'] as const;
export const SEGMENT_TITLE: Record<string, string> = {
  alkalmi: 'Alkalmi',
  arvadasz: 'Árvadász',
  markahu: 'Márkahű',
  nagykosaras: 'Nagykosaras',
};
// A ket jellemzokeszlet, amin ugyanaz a k-means fut (58. dontes). A lap a szukebbel
// nyit: ez a naiv valasztas, a kapcsolo visz a teljes keszletre.
export const FEATURE_SETS = ['value', 'all'] as const;
export type FeatureSet = typeof FEATURE_SETS[number];
export const DEFAULT_FEATURE_SET: FeatureSet = 'value';
export const FEATURE_SET_TITLE: Record<FeatureSet, string> = {
  value: 'Érték (5 jellemző)',
  all: 'Érték + csatorna (12 jellemző)',
};
const FEATURE_COUNT: Record<FeatureSet, number> = { value: 5, all: 12 };

export interface Profile {
  customers: number;
  aov_huf: number;
  orders_per_customer: number;
  sessions_per_customer: number;
  channel_share: number[];       // a hat csatorna, CHANNELS sorrendben
}

export interface KData {
  silhouette: number;
  inertia: number;
  ari: number;
  sizes: number[];               // klaszterenkent vevo
  profiles: Profile[];
  confusion: number[][];         // 4 sor (SEGMENTS) x k oszlop, darabszam
}

export interface SegmentsData {
  schema_version: number;
  ks: number[];
  default_k: number;
  seed: number;
  features: string[];
  customers: number;
  segments: string[];
  selection: { all: number[]; clustered: number[] };
  ceiling: { ari: number; accuracy: number };
  by_k: Record<string, KData>;
}

// A fajl: keszletenkent egy SegmentsData. A kozos mezok (vevok, szelekcio, ks) mindket
// keszletben ugyanazok; igy a lap minden fuggvenye egy keszletet kap, mint eddig.
export interface SegmentsFile { sets: Record<FeatureSet, SegmentsData> }

const FILE = 'segments.json';
const EXPECTED_SCHEMA_VERSION = 2;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function object(v: unknown, where: string): Record<string, unknown> {
  if (!isObject(v)) throw new Error(`${FILE}: ${where}: hiányzik vagy nem objektum`);
  return v;
}

// Elojeles valos szam (az ARI es a silhouette lehet negativ).
function real(v: unknown, where: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`${FILE}: ${where}: hiányzik vagy nem szám`);
  }
  return v;
}

function num(v: unknown, where: string): number {
  if (real(v, where) < 0) throw new Error(`${FILE}: ${where}: nem lehet negatív`);
  return v as number;
}

function whole(v: unknown, where: string): number {
  if (!Number.isInteger(num(v, where))) throw new Error(`${FILE}: ${where}: egész szám kell`);
  return v as number;
}

function nums(v: unknown, length: number, where: string): number[] {
  if (!Array.isArray(v) || v.length !== length) {
    throw new Error(`${FILE}: ${where}: ${length} elemű számlista kell`);
  }
  return v.map((x, i) => num(x, `${where}[${i}]`));
}

function sameList(v: unknown, expected: readonly string[], where: string): string[] {
  if (!Array.isArray(v) || v.length !== expected.length || v.some((x, i) => x !== expected[i])) {
    throw new Error(`${FILE}: ${where}: a lap ezt várja: ${expected.join(', ')}`);
  }
  return [...expected];
}

function profile(v: unknown, where: string): Profile {
  const p = object(v, where);
  return {
    customers: num(p.customers, `${where}.customers`),
    aov_huf: num(p.aov_huf, `${where}.aov_huf`),
    orders_per_customer: num(p.orders_per_customer, `${where}.orders_per_customer`),
    sessions_per_customer: num(p.sessions_per_customer, `${where}.sessions_per_customer`),
    channel_share: nums(p.channel_share, CHANNELS.length, `${where}.channel_share`),
  };
}

function parseSet(o: Record<string, unknown>, featureCount: number): SegmentsData {
  const segments = sameList(o.segments, SEGMENTS, 'segments');
  if (!Array.isArray(o.ks) || o.ks.length === 0) throw new Error(`${FILE}: ks: hiányzik vagy üres`);
  const ks = o.ks.map((k, i) => whole(k, `ks[${i}]`));
  const default_k = num(o.default_k, 'default_k');
  if (!ks.includes(default_k)) throw new Error(`${FILE}: default_k (${default_k}) nincs a ks listában`);
  if (!Array.isArray(o.features) || o.features.length !== featureCount) {
    throw new Error(`${FILE}: features: ${featureCount} név kell`);
  }
  const customers = num(o.customers, 'customers');

  const sel = object(o.selection, 'selection');
  const ceil = object(o.ceiling, 'ceiling');

  const bw = object(o.by_k, 'by_k');
  const by_k: SegmentsData['by_k'] = {};
  for (const k of ks) {
    const where = `by_k.${k}`;
    const d = object(bw[String(k)], where);
    const sizes = nums(d.sizes, k, `${where}.sizes`);
    if (sizes.reduce((a, b) => a + b, 0) !== customers) {
      throw new Error(`${FILE}: ${where}.sizes: az összeg nem a vevők száma (${customers})`);
    }
    if (!Array.isArray(d.profiles) || d.profiles.length !== k) {
      throw new Error(`${FILE}: ${where}.profiles: ${k} profil kell`);
    }
    if (!Array.isArray(d.confusion) || d.confusion.length !== segments.length) {
      throw new Error(`${FILE}: ${where}.confusion: ${segments.length} sor kell`);
    }
    const confusion = d.confusion.map((sor, i) => nums(sor, k, `${where}.confusion[${i}]`));
    // Az oszlop egy klaszter: az osszege a merete. (A sorosszegek igy egyutt a vevok szama.)
    if (sizes.some((size, j) => confusion.reduce((a, sor) => a + sor[j], 0) !== size)) {
      throw new Error(`${FILE}: ${where}.confusion: az oszlopösszegek nem a klaszterméretek`);
    }
    by_k[String(k)] = {
      silhouette: real(d.silhouette, `${where}.silhouette`),
      inertia: num(d.inertia, `${where}.inertia`),
      ari: real(d.ari, `${where}.ari`),
      sizes,
      profiles: d.profiles.map((p, i) => profile(p, `${where}.profiles[${i}]`)),
      confusion,
    };
  }

  return {
    schema_version: EXPECTED_SCHEMA_VERSION,
    ks,
    default_k,
    seed: num(o.seed, 'seed'),
    features: o.features.map(String),
    customers,
    segments,
    selection: {
      all: nums(sel.all, segments.length, 'selection.all'),
      clustered: nums(sel.clustered, segments.length, 'selection.clustered'),
    },
    ceiling: { ari: real(ceil.ari, 'ceiling.ari'), accuracy: num(ceil.accuracy, 'ceiling.accuracy') },
    by_k,
  };
}

export function parseSegments(raw: unknown): SegmentsFile {
  const o = object(raw, 'a fájl');
  if (o.schema_version !== EXPECTED_SCHEMA_VERSION) {
    throw new Error(`${FILE}: schema_version ${String(o.schema_version)}, a lap ${EXPECTED_SCHEMA_VERSION}-et vár`);
  }
  sameList(o.feature_sets, FEATURE_SETS, 'feature_sets');
  const by = object(o.by_feature_set, 'by_feature_set');
  const sets = {} as Record<FeatureSet, SegmentsData>;
  for (const name of FEATURE_SETS) {
    const set = object(by[name], `by_feature_set.${name}`);
    try {
      // a kozos mezok felulrol, a keszletfuggok (features, default_k, ceiling, by_k) a blokkbol
      sets[name] = parseSet({ ...o, ...set }, FEATURE_COUNT[name]);
    } catch (e) {
      throw new Error(`${e instanceof Error ? e.message : String(e)} (jellemzőkészlet: ${name})`);
    }
  }
  return { sets };
}

export function kData(data: SegmentsData, k: number): KData {
  const d = data.by_k[String(k)];
  if (!d) throw new Error(`${FILE}: nincs k = ${k}`);
  return d;
}

export const clusterLabel = (j: number): string => `K${j + 1}`;
const segmentTitle = (slug: string): string => SEGMENT_TITLE[slug] ?? slug;
const channelTitle = (i: number): string => CHANNELS[i]?.title ?? `csatorna ${i + 1}`;

// ---- a ket panel: k szerint egy-egy adatsor ----

export interface KPoint { k: number; value: number }
export interface Axis { min: number; max: number }

export const recoveryPoints = (data: SegmentsData): KPoint[] =>
  data.ks.map(k => ({ k, value: kData(data, k).ari }));

export const silhouettePoints = (data: SegmentsData): KPoint[] =>
  data.ks.map(k => ({ k, value: kData(data, k).silhouette }));

// A tengely teteje a felso hatar fole er (hogy a referenciavonal cimkeje
// kiferjen); az alja 0, vagy a legkisebb negativ ertek ala.
export function ariAxis(data: SegmentsData): Axis {
  const v = recoveryPoints(data).map(p => p.value);
  return {
    min: Math.min(0, Math.min(...v) * 1.2),
    max: Math.max(0.5, data.ceiling.ari * 1.2, Math.max(...v) * 1.2),
  };
}

export function silhouetteAxis(data: SegmentsData): Axis {
  const v = silhouettePoints(data).map(p => p.value);
  return { min: Math.min(0, Math.min(...v) * 1.2), max: Math.max(0.3, Math.max(...v) * 1.3) };
}

// ---- a konfuzios matrix ----

export interface ConfusionCell { count: number; rowShare: number }
export interface ConfusionRow {
  slug: string;
  title: string;
  total: number;      // ennyi vevo tartozik az igazsag szerint ebbe a szegmensbe
  share: number;      // a klaszterezett vevok kozti aranya
  cells: ConfusionCell[];
}

export function confusionRows(data: SegmentsData, k: number): ConfusionRow[] {
  const d = kData(data, k);
  return data.segments.map((slug, i) => {
    const sor = d.confusion[i];
    const total = sor.reduce((a, b) => a + b, 0);
    return {
      slug,
      title: segmentTitle(slug),
      total,
      share: total / data.customers,
      cells: sor.map(count => ({ count, rowShare: total ? count / total : 0 })),
    };
  });
}

export interface ClusterHeader { label: string; size: number; share: number }

export const clusterHeaders = (data: SegmentsData, k: number): ClusterHeader[] =>
  kData(data, k).sizes.map((size, j) => ({ label: clusterLabel(j), size, share: size / data.customers }));

// A szekvencialis szerep (DESIGN.md: ugyanaz az indigo) az ot meglevo ordinalis
// tokennel kvantalva: 0-20% -> 200 ... 80-100% -> 950. A 3. foktol (indigo 600)
// a cimke feher. A cella kozvetlen szazalek-cimket hord, a szin csak kiemel.
const SEQ = [1, 2, 3, 4, 5].map(i => `var(--color-viz-ord-${i})`);

export const seqStep = (share: number): number =>
  Math.min(SEQ.length - 1, Math.max(0, Math.floor(share * SEQ.length)));
export const cellFill = (share: number): string => SEQ[seqStep(share)];
export const cellInk = (share: number): string =>
  seqStep(share) >= 2 ? 'var(--color-on-primary)' : 'var(--color-on-surface)';

// ---- a ket tabla ----

export interface ProfileRow {
  label: string;
  customers: number;
  share: number;
  aovHuf: number;
  ordersPerCustomer: number;
  sessionsPerCustomer: number;
  topChannel: { title: string; share: number };
}

export function profileRows(data: SegmentsData, k: number): ProfileRow[] {
  return kData(data, k).profiles.map((p, j) => {
    const top = p.channel_share.reduce((best, v, i) => (v > p.channel_share[best] ? i : best), 0);
    return {
      label: clusterLabel(j),
      customers: p.customers,
      share: p.customers / data.customers,
      aovHuf: p.aov_huf,
      ordersPerCustomer: p.orders_per_customer,
      sessionsPerCustomer: p.sessions_per_customer,
      topChannel: { title: channelTitle(top), share: p.channel_share[top] ?? 0 },
    };
  });
}

export interface SelectionRow { slug: string; title: string; all: number; clustered: number }

export const selectionRows = (data: SegmentsData): SelectionRow[] =>
  data.segments.map((slug, i) => ({
    slug, title: segmentTitle(slug), all: data.selection.all[i], clustered: data.selection.clustered[i],
  }));

// ---- szamformatum: magyar, tizedesvesszovel ----

const intFmt = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 0 });
const fixed = (digits: number) =>
  new Intl.NumberFormat('hu-HU', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const oneFmt = fixed(1);
const threeFmt = fixed(3);

export const int = (n: number): string => intFmt.format(n);
export const ft = (n: number): string => `${intFmt.format(n)} Ft`;
// Hanyad -> szazalek. pct(0.753) = "75,3%".
export const pct = (share: number, digits = 1): string => `${fixed(digits).format(share * 100)}%`;
// A matrix cellaja: a szam a % jel nelkul, hogy mobilon a jel kulon tunhessen el.
export const pctNumber = (share: number): string => fixed(0).format(share * 100);
export const dec1 = (v: number): string => oneFmt.format(v);
// A kerekites utani -0 is 0: egy apro negativ ARI ne legyen "-0,000".
export const dec3 = (v: number): string => threeFmt.format(Math.round(v * 1000) / 1000 || 0);
// Magyar rag: a 2, 4, 5, 7 magas hangrendu kiejtesu (ketto, negy, ot, het) -> "-nel", a tobbi "-nal".
export const kNal = (k: number): string => `k = ${k}-${[2, 4, 5, 7].includes(k) ? 'nél' : 'nál'}`;

// Az abra szoveges megfeleloje kepernyoolvasonak.
export function chartLabel(what: string, points: KPoint[], chosen: number,
                           reference?: { value: number; label: string }): string {
  const sorok = points.map(p => `k = ${p.k}: ${dec3(p.value)}`).join('; ');
  const ref = reference ? ` ${reference.label}: ${dec3(reference.value)}.` : '';
  return `${what} a klaszterszám szerint. ${sorok}. Kiválasztva k = ${chosen}.${ref}`;
}
