// A veszteseg-fokonyv sorai es aranyai. Tiszta fuggvenyek az
// events_ledger.json-on: itt nincs React, nincs fetch, nincs beirt szam.

export interface Pair { dgp: number; pipeline: number }

// Az events_ledger.json alakja (world/src/world/export.py: build_ledger).
export interface Ledger {
  schema_version: number;
  events: {
    generated: number;
    withheld_no_consent: number;
    sent_unique: number;
    sent_duplicate: number;
    raw_events: number;
    clean_events: number;
  };
  sessions: Pair;
  orders: Pair;
  revenue_huf: Pair;
  identity: {
    customers_dgp: number;
    customers_consented_dgp: number;   // akinek legalabb egy consentes eszkoze van
    devices_dgp: number;
    devices_pipeline: number;
    identity_links: number;
    customers_identified: number;
    persons_after_stitching: number;
  };
}

// Hanyados, ami nulla nevezonel hibat dob: egy NaN csendben kiirodna a lapra.
export function ratio(numerator: number, denominator: number, what: string): number {
  if (!(denominator > 0)) throw new Error(`${what}: a nevező nulla`);
  return numerator / denominator;
}

export interface PathRow {
  key: keyof Ledger['events'];
  label: string;
  value: number;
  share: number | null;      // a sor aranya, ha van ertelme
  shareOf: string | null;    // mihez kepest
}

// Az esemenyut: mi lett a legyartott esemenyekbol.
export function eventPath(l: Ledger): PathRow[] {
  const e = l.events;
  const ofGenerated = (v: number) => ratio(v, e.generated, 'legyártott esemény');
  return [
    { key: 'generated', label: 'legyártva', value: e.generated, share: null, shareOf: null },
    {
      key: 'withheld_no_consent', label: 'consent miatt visszatartva', value: e.withheld_no_consent,
      share: ofGenerated(e.withheld_no_consent), shareOf: 'a legyártottból',
    },
    {
      key: 'sent_unique', label: 'elküldve', value: e.sent_unique,
      share: ofGenerated(e.sent_unique), shareOf: 'a legyártottból',
    },
    {
      key: 'sent_duplicate', label: 'ebből kétszer elküldve', value: e.sent_duplicate,
      share: ratio(e.sent_duplicate, e.sent_unique, 'elküldött esemény'), shareOf: 'az elküldöttből',
    },
    {
      key: 'raw_events', label: 'raw_events', value: e.raw_events,
      share: ofGenerated(e.raw_events), shareOf: 'a legyártottból',
    },
    {
      key: 'clean_events', label: 'clean_events', value: e.clean_events,
      share: ofGenerated(e.clean_events), shareOf: 'a legyártottból',
    },
  ];
}

export interface SideRow {
  key: 'sessions' | 'orders' | 'revenue_huf';
  label: string;
  dgp: number;
  pipeline: number;
  coverage: number;   // pipeline / DGP
}

// A ket oldal egymas mellett: mi tortent (DGP), es mit lat belole a pipeline.
export function sides(l: Ledger): SideRow[] {
  const row = (key: SideRow['key'], label: string): SideRow => ({
    key, label, dgp: l[key].dgp, pipeline: l[key].pipeline,
    coverage: ratio(l[key].pipeline, l[key].dgp, `${label} (DGP)`),
  });
  return [row('sessions', 'session'), row('orders', 'rendelés'), row('revenue_huf', 'bevétel')];
}
