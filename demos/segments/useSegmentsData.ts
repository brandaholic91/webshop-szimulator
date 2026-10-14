import { useEffect, useState } from 'react';
import { parseJsonResponse } from '../events/useEventsData';
import { parseSegments } from './view';
import type { SegmentsFile } from './view';

const FILE = 'segments.json';

// Betoltes es ellenorzes egy helyen. Hibas vagy hianyzo fajlbol hibauzenet
// lesz, nem ures abra: a dev szerver es az nginx hianyzo fajlra 200-zal az
// index.html-t adja, ezt a parseJsonResponse teszi megnevezett hibava.
export function useSegmentsData() {
  const [data, setData] = useState<SegmentsFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let elo = true;
    fetch(`/data/${FILE}`)
      .then(r => parseJsonResponse(r, FILE))
      .then(raw => {
        const parsed = parseSegments(raw);
        if (elo) setData(parsed);
      })
      .catch(e => elo && setError(e instanceof Error ? e.message : String(e)));
    return () => { elo = false; };
  }, []);

  return { data, error };
}
