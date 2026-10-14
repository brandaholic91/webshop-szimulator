import { useEffect, useState } from 'react';

export interface ResponseChannel {
  slug: string;
  adstock_decay: number;
  half_saturation_huf: number;
  shape: number;
  reach_scale: number;
  paid_sessions: number;   // a hirdetes sajat latogatasai a bolt futasaban
  audience: number[];      // a latogatasok szegmens-aranya, a `segments` sorrendjeben
}

export interface WorldData {
  spend: { start: string; channels: string[]; daily_huf: number[][] };
  response: {
    segments: string[];
    channels: ResponseChannel[];
    reference: Record<string, { spend_huf: number[]; saturated: number[] }>;
  };
  outcome: { start: string; weekly_revenue_huf: number[]; weekly_orders: number[]; weekly_sessions: number[] };
  incrementality: {
    schema_version: number;
    channels: string[];
    weekly_revenue: number[];
    counterfactual: Record<string, {
      weekly_revenue: number[];
      spend_huf: number;
      incremental_revenue_huf: number;
      true_roas: number;
      share_of_revenue: number;
    }>;
  };
  // A harom mertek szorasa csatornankent, `replicates` ujrafuttatasbol (43. dontes).
  noise: {
    replicates: number;
    sd: Record<string, {
      incremental_revenue_huf: number;
      true_roas: number;
      share_of_revenue: number;
    }>;
  };
}

const FILES = {
  spend: 'world_spend.json',
  response: 'world_response.json',
  outcome: 'world_outcome.json',
  incrementality: 'world_incrementality.json',
  noise: 'world_noise.json',
} as const;

// A world/src/world/truth.py ezt a szamot irja a world_incrementality.json-ba.
// Ha megvaltozna az alak, ez a szam is emelkedne (27. dontes) — enelkul a
// vizsgalat nelkul egy atalakitott JSON csendben undefined-ekkel torne el a
// lapot, egy hibaüzenet helyett.
const EXPECTED_SCHEMA_VERSION = 1;

export function useWorldData() {
  const [data, setData] = useState<WorldData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let elo = true;
    Promise.all(
      Object.values(FILES).map(f =>
        fetch(`/data/${f}`).then(r => {
          if (!r.ok) throw new Error(`${f}: ${r.status}`);
          return r.json();
        }),
      ),
    )
      .then(([spend, response, outcome, incrementality, noise]) => {
        if (incrementality.schema_version !== EXPECTED_SCHEMA_VERSION) {
          throw new Error(
            `world_incrementality.json séma-verziója (${incrementality.schema_version}) ` +
            `nem az elvárt ${EXPECTED_SCHEMA_VERSION} — az adatformátum megváltozott.`,
          );
        }
        if (elo) setData({ spend, response, outcome, incrementality, noise } as WorldData);
      })
      .catch(e => elo && setError(String(e)));
    return () => { elo = false; };
  }, []);

  return { data, error };
}
