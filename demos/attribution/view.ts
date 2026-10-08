// Az attribution.json alakja, az ellenorzese, es a belole szamolt sorok az
// abranak, a tablaknak es a readoutnak. Tiszta fuggvenyek: a bongeszo itt
// NEM becsul (12. dontes), csak kivalasztja a mar kiszamolt ablakot.
//
// A fajlt a world/src/world/attribution.py irja; ha az alakja megvaltozik, a
// schema_version emelkedik, es itt hibauzenet lesz belole, nem ures abra.

import { CHANNELS } from '../world/channels';

// A sorrend a DESIGN.md ordinalis letraja: novekvo kifinomultsag.
export const MODELS = ['last_click', 'linear', 'time_decay', 'markov'] as const;
export type Model = (typeof MODELS)[number];

export const MODEL_LABEL: Record<Model, string> = {
  last_click: 'Last-click',
  linear: 'Lineáris',
  time_decay: 'Time-decay',
  markov: 'Markov',
};

// Rovid cimke a sav ala: az elso letrafok kontrasztja feheren 1,49, ezert a
// modellt nem azonosithatja egyedul a szin (DESIGN.md > Az ordinalis letra).
export const MODEL_SHORT: Record<Model, string> = {
  last_click: 'LC',
  linear: 'Lin',
  time_decay: 'TD',
  markov: 'Mkv',
};

export const MODEL_COLOR: Record<Model, string> = {
  last_click: 'var(--color-viz-ord-1)',
  linear: 'var(--color-viz-ord-2)',
  time_decay: 'var(--color-viz-ord-3)',
  markov: 'var(--color-viz-ord-4)',
};

export interface WindowData {
  paths: { converting: number; non_converting: number };
  share: Record<Model, number[]>;   // csatornankent, a `channels` sorrendjeben
  roas: Record<Model, number[]>;    // fizetett csatornankent, a `paid` sorrendjeben
  mean_abs_error_pp: Record<Model, number>;
}

export interface AttributionData {
  schema_version: number;
  windows: number[];
  default_window: number;
  channels: string[];
  paid: string[];
  models: Model[];
  total_revenue_huf: number;
  pipeline_revenue_huf: number;
  truth: Record<string, { share: number; roas: number }>;
  by_window: Record<string, WindowData>;
}

const FILE = 'attribution.json';
const EXPECTED_SCHEMA_VERSION = 1;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function object(v: unknown, where: string): Record<string, unknown> {
  if (!isObject(v)) throw new Error(`${FILE}: ${where}: hiányzik vagy nem objektum`);
  return v;
}

function num(v: unknown, where: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
    throw new Error(`${FILE}: ${where}: hiányzik vagy nem nemnegatív szám`);
  }
  return v;
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

export function parseAttribution(raw: unknown): AttributionData {
  const o = object(raw, 'a fájl');
  if (o.schema_version !== EXPECTED_SCHEMA_VERSION) {
    throw new Error(`${FILE}: schema_version ${String(o.schema_version)}, a lap ${EXPECTED_SCHEMA_VERSION}-et vár`);
  }
  const channels = sameList(o.channels, CHANNELS.map(c => c.slug), 'channels');
  const paid = sameList(o.paid, CHANNELS.filter(c => c.kind === 'paid').map(c => c.slug), 'paid');
  const models = sameList(o.models, MODELS, 'models') as Model[];

  if (!Array.isArray(o.windows) || o.windows.length === 0) {
    throw new Error(`${FILE}: windows: hiányzik vagy üres`);
  }
  const windows = o.windows.map((w, i) => num(w, `windows[${i}]`));
  const default_window = num(o.default_window, 'default_window');
  if (!windows.includes(default_window)) {
    throw new Error(`${FILE}: default_window (${default_window}) nincs a windows listában`);
  }

  const t = object(o.truth, 'truth');
  const truth: AttributionData['truth'] = {};
  for (const slug of paid) {
    const row = object(t[slug], `truth.${slug}`);
    truth[slug] = { share: num(row.share, `truth.${slug}.share`), roas: num(row.roas, `truth.${slug}.roas`) };
  }

  const bw = object(o.by_window, 'by_window');
  const by_window: AttributionData['by_window'] = {};
  for (const w of windows) {
    const where = `by_window.${w}`;
    const d = object(bw[String(w)], where);
    const paths = object(d.paths, `${where}.paths`);
    const share = object(d.share, `${where}.share`);
    const roas = object(d.roas, `${where}.roas`);
    const error = object(d.mean_abs_error_pp, `${where}.mean_abs_error_pp`);
    const perModel = <T>(f: (m: Model) => T) =>
      Object.fromEntries(models.map(m => [m, f(m)])) as Record<Model, T>;
    by_window[String(w)] = {
      paths: {
        converting: num(paths.converting, `${where}.paths.converting`),
        non_converting: num(paths.non_converting, `${where}.paths.non_converting`),
      },
      share: perModel(m => nums(share[m], channels.length, `${where}.share.${m}`)),
      roas: perModel(m => nums(roas[m], paid.length, `${where}.roas.${m}`)),
      mean_abs_error_pp: perModel(m => num(error[m], `${where}.mean_abs_error_pp.${m}`)),
    };
  }

  return {
    schema_version: EXPECTED_SCHEMA_VERSION,
    windows,
    default_window,
    channels,
    paid,
    models,
    total_revenue_huf: num(o.total_revenue_huf, 'total_revenue_huf'),
    pipeline_revenue_huf: num(o.pipeline_revenue_huf, 'pipeline_revenue_huf'),
    truth,
    by_window,
  };
}

export function windowData(data: AttributionData, lookback: number): WindowData {
  const d = data.by_window[String(lookback)];
  if (!d) throw new Error(`${FILE}: nincs ${lookback} napos ablak`);
  return d;
}

const title = (slug: string): string => CHANNELS.find(c => c.slug === slug)?.title ?? slug;

// ---- a fo abra: fizetett csatornankent negy sav es az igazsag ----

export interface Bar {
  model: Model;
  label: string;
  short: string;
  color: string;
  share: number;     // a modell szerint a bevetel ekkora hanyada a csatornae
  errorPp: number;   // elojeles elteres az igazsagtol, szazalekpontban
}

export interface Group {
  slug: string;
  title: string;
  truth: number;
  bars: Bar[];
}

export function chartGroups(data: AttributionData, lookback: number): Group[] {
  const d = windowData(data, lookback);
  return data.paid.map(slug => {
    const i = data.channels.indexOf(slug);
    const truth = data.truth[slug].share;
    return {
      slug,
      title: title(slug),
      truth,
      bars: data.models.map(model => ({
        model,
        label: MODEL_LABEL[model],
        short: MODEL_SHORT[model],
        color: MODEL_COLOR[model],
        share: d.share[model][i],
        errorPp: (d.share[model][i] - truth) * 100,
      })),
    };
  });
}

// Az y-tengely teteje MINDEN ablakra kozos: ablakvaltaskor a savok mozdulnak,
// az igazsag jeloloje a helyen marad. Az 1,15 a fejter a felso cimkenek.
export function shareMax(data: AttributionData): number {
  let max = 0;
  for (const slug of data.paid) {
    const i = data.channels.indexOf(slug);
    max = Math.max(max, data.truth[slug].share);
    for (const w of data.windows) {
      for (const m of data.models) max = Math.max(max, windowData(data, w).share[m][i]);
    }
  }
  return max * 1.15;
}

// ---- a ket tabla ----

export interface TableRow {
  slug: string;
  title: string;
  share: number[];             // modellenkent, a `models` sorrendjeben
  truthShare: number | null;   // csak a fizetett csatornaknak van igazsaga
  roas: number[] | null;       // csak a fizetett csatornaknak van koltese
  truthRoas: number | null;
}

export function tableRows(data: AttributionData, lookback: number): TableRow[] {
  const d = windowData(data, lookback);
  return data.channels.map((slug, i) => {
    const p = data.paid.indexOf(slug);
    return {
      slug,
      title: title(slug),
      share: data.models.map(m => d.share[m][i]),
      truthShare: p < 0 ? null : data.truth[slug].share,
      roas: p < 0 ? null : data.models.map(m => d.roas[m][p]),
      truthRoas: p < 0 ? null : data.truth[slug].roas,
    };
  });
}

// ---- a readout ----

export interface ModelError {
  model: Model;
  label: string;
  errorPp: number;   // atlagos abszolut elteres a harom fizetett csatornan
}

export function modelErrors(data: AttributionData, lookback: number): ModelError[] {
  const d = windowData(data, lookback);
  return data.models.map(model => ({
    model,
    label: MODEL_LABEL[model],
    errorPp: d.mean_abs_error_pp[model],
  }));
}

// ---- szamformatum: magyar, tizedesvesszovel ----

const intFmt = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 0 });
const fixed = (digits: number, signDisplay: 'auto' | 'exceptZero' = 'auto') =>
  new Intl.NumberFormat('hu-HU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay,
  });
const one = fixed(1);
const oneSigned = fixed(1, 'exceptZero');
const two = fixed(2);

export const int = (n: number): string => intFmt.format(n);
export const ft = (n: number): string => `${intFmt.format(n)} Ft`;
// Hanyad -> szazalek. pct(0.186) = "18,6%".
export const pct = (share: number, digits = 1): string => `${fixed(digits).format(share * 100)}%`;
export const pp = (v: number): string => `${one.format(v)} pp`;
export const signedPp = (v: number): string => `${oneSigned.format(v)} pp`;
export const roasFmt = (v: number): string => two.format(v);

// Az abra szoveges megfeleloje kepernyoolvasonak.
export function chartLabel(groups: Group[], lookback: number): string {
  const sorok = groups.map(g =>
    `${g.title}: ${g.bars.map(b => `${b.label} ${pct(b.share)}`).join(', ')}, igazság ${pct(g.truth)}.`);
  return `A bevétel aránya csatornánként négy attribúciós modell szerint, ${lookback} napos ` +
    `lookback-ablakkal, az igazsághoz mérve. ${sorok.join(' ')}`;
}
