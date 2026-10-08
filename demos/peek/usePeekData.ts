import { useEffect, useState } from 'react';

// A bolt ket leiro szama, amibol a csuszkak alapallasa lesz (31. dontes).
export interface ShopBaseline {
  baseRate: number;        // rendeles / session, a teljes idoszakra
  sessionsPerDay: number;  // atlagos napi session, egeszre kerekitve
}

const sum = (xs: number[]) => xs.reduce((s, v) => s + v, 0);
const isNumberArray = (v: unknown): v is number[] =>
  Array.isArray(v) && v.length > 0 && v.every(x => typeof x === 'number');

// A world_outcome.json-bol szamolja az alapallast. Tiszta fuggveny, hogy
// tesztelheto legyen. Hibat dob, ha a szukseges mezo hianyzik vagy a nevezo
// nulla — egy NaN csendben vegigmenne a szimulacion es ures abrat adna.
export function shopBaseline(outcome: unknown): ShopBaseline {
  const o = (outcome ?? {}) as Record<string, unknown>;
  const { weekly_sessions: sessions, weekly_orders: orders, daily_seasonality: daily } = o;
  if (!isNumberArray(sessions) || !isNumberArray(orders) || !isNumberArray(daily)) {
    throw new Error('world_outcome.json: hiányzik a weekly_sessions, a weekly_orders vagy a daily_seasonality');
  }
  const totalSessions = sum(sessions);
  if (totalSessions <= 0) throw new Error('world_outcome.json: a sessionök összege nulla');
  return {
    baseRate: sum(orders) / totalSessions,
    sessionsPerDay: Math.round(totalSessions / daily.length),
  };
}

export function usePeekData() {
  const [data, setData] = useState<ShopBaseline | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let elo = true;
    fetch('/data/world_outcome.json')
      .then(r => {
        if (!r.ok) throw new Error(`world_outcome.json: ${r.status}`);
        return r.json();
      })
      .then(outcome => {
        const baseline = shopBaseline(outcome);
        if (elo) setData(baseline);
      })
      .catch(e => elo && setError(String(e)));
    return () => { elo = false; };
  }, []);

  return { data, error };
}
