// Az elo tracker ket tablaja: melyik csatorna milyen landing URL-t ad, es a
// bolt-sav negy gombja mit kuld. Mindketto a vilag emit.py-janak masolata
// (world/src/world/emit.py: LANDING, illetve az events() forgatokonyve) — a
// lap ugyanazt az ot esemenynevet es ugyanazokat a forrasjeleket mutatja,
// amiket a pipeline feldolgozott.

export const HOST_PATH = '/events/host.html';
// A bolt utvonalai a host-lap alatt. Egyezik a public/events/host.js SHOP_PATH-javal.
export const SHOP_PATH = '/events/bolt';

export interface Landing {
  search: string;   // a landing URL query stringje ('' = nincs)
  signal: string;   // amit a csatorna-valaszto alatt kiirunk
}

// Kulcs: a csatorna slugja (demos/world/channels.ts).
export const LANDING: Record<string, Landing> = {
  google_ads: { search: '?utm_source=google&utm_medium=cpc', signal: 'utm_source=google · utm_medium=cpc' },
  meta_ads: { search: '?utm_source=facebook&utm_medium=cpc', signal: 'utm_source=facebook · utm_medium=cpc' },
  arukereso: { search: '?utm_source=arukereso&utm_medium=cpc', signal: 'utm_source=arukereso · utm_medium=cpc' },
  organic: {
    search: '',
    signal: 'csak referrer. Itt a referrer ez az oldal, nem a kereső: a host-lap nem tudja átírni',
  },
  direct: { search: '', signal: 'nincs UTM. Itt a referrer ez az oldal; valódi direct látogatásnál üres' },
  email: { search: '?utm_source=newsletter&utm_medium=email', signal: 'utm_source=newsletter · utm_medium=email' },
};

export interface Step {
  name: string;                       // az esemeny neve
  label: string;                      // a gomb felirata
  url: string;                        // az oldal, ahol az esemeny tortenik
  payload: Record<string, unknown>;
  primary?: boolean;                  // az egyetlen emerald gomb
}

// A peldatermek es a peldarendeles NEM a vilag adata: a payload alakjat mutatja.
// A lap ezt a bolt-sav alatt kimondja (4. nem-targyalhato szabaly).
const ITEM = { item_id: 'sku-001' };

export const STEPS: readonly Step[] = [
  { name: 'view_item', label: 'Termék megnézése', url: `${SHOP_PATH}/termek/1`, payload: ITEM },
  { name: 'add_to_cart', label: 'Kosárba', url: `${SHOP_PATH}/termek/1`, payload: ITEM },
  { name: 'begin_checkout', label: 'Pénztár', url: `${SHOP_PATH}/penztar`, payload: {} },
  {
    name: 'purchase',
    label: 'Vásárlás',
    url: `${SHOP_PATH}/koszonjuk`,
    payload: { order_id: 'ord-pelda', value: 12990, currency: 'HUF', customer_key: 'pelda-vasarlo' },
    primary: true,
  },
];
