// A harom fizetett csatorna megterulese ket tenyezore bontva: mennyibe kerul egy
// hirdeteses latogatas, es mennyi bevetelt hoz. A ROAS a ketto hanyadosa, mert a
// ket szam ugyanazzal a latogatasszammal oszt.
//
// A latogatasszam es a kozonseg a bolt egy futasabol jon (world_response.json), a
// bevetel az ujrafuttatasok atlaga (world_incrementality.json).

import { PAID } from './channels';
import { SEGMENT_TITLE } from '../segments/view';
import type { WorldData } from './useWorldData';

export interface ChannelValue {
  slug: string;
  title: string;
  sessions: number;          // a hirdetes sajat latogatasai, az elfogas elott
  costPerSession: number;    // Ft
  valuePerSession: number;   // Ft, a csatorna inkrementalis bevetele latogatasonkent
  roas: number;
  topSegment: { title: string; share: number };   // a kozonseg legnagyobb tipusa
}

export function channelValues(data: WorldData): ChannelValue[] {
  const { segments, channels } = data.response;
  return PAID.map(({ slug, title }) => {
    const r = channels.find(c => c.slug === slug);
    if (!r || !(r.paid_sessions > 0) || r.audience?.length !== segments?.length) {
      throw new Error(`world_response.json: ${slug}: hiányzik a látogatásszám vagy a közönség`);
    }
    const cf = data.incrementality.counterfactual[slug];
    const top = r.audience.indexOf(Math.max(...r.audience));
    return {
      slug,
      title,
      sessions: r.paid_sessions,
      costPerSession: cf.spend_huf / r.paid_sessions,
      valuePerSession: cf.incremental_revenue_huf / r.paid_sessions,
      roas: cf.true_roas,
      topSegment: { title: SEGMENT_TITLE[segments[top]] ?? segments[top], share: r.audience[top] },
    };
  });
}

// A lap allitasa: a legolcsobb latogatasu csatorna nem a legjobban megterulo.
// null, ha ugyanaz a csatorna (akkor a lap ezt a mondatot nem irja ki).
export function cheapNotBest(rows: ChannelValue[]): { cheap: ChannelValue; best: ChannelValue } | null {
  const cheap = rows.reduce((a, b) => (b.costPerSession < a.costPerSession ? b : a));
  const best = rows.reduce((a, b) => (b.roas > a.roas ? b : a));
  return cheap.slug === best.slug ? null : { cheap, best };
}
