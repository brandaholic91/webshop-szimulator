import { useEffect, useState } from 'react';
import { parseJsonResponse } from '../events/useEventsData';
import { parseAttribution } from './view';
import type { AttributionData } from './view';

const FILE = 'attribution.json';

// Betoltes es ellenorzes egy helyen: a muszer es a nyitolap tezis-abraja is
// ezt hasznalja. Hibas vagy hianyzo fajlbol hibauzenet lesz, nem ures abra.
export function useAttributionData() {
  const [data, setData] = useState<AttributionData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let elo = true;
    fetch(`/data/${FILE}`)
      .then(r => parseJsonResponse(r, FILE))
      .then(raw => {
        const parsed = parseAttribution(raw);
        if (elo) setData(parsed);
      })
      .catch(e => elo && setError(e instanceof Error ? e.message : String(e)));
    return () => { elo = false; };
  }, []);

  return { data, error };
}
