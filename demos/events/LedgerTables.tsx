import React from 'react';
import Page from '../../components/Page';
import Readout from '../../components/Readout';
import { eventPath, sides } from './ledger';
import type { Ledger } from './ledger';
import { ft, int, pct } from './format';

// Mobilon (max-md): szukebb cellakoz es fejlec-betukoz, hogy a tablak gorgetes nelkul elferjenek.
const TH = 't-label-sm border-b border-border-strong py-2 pr-4 font-medium text-on-surface-subtle max-md:pr-2 max-md:tracking-[.08em] max-md:last:pr-0';
const TD = 'border-b border-border py-2 pr-4 max-md:pr-2 max-md:last:pr-0';
// A masodik tabla negy oszlopa mobilon nem fer ki (a bevetel ket cellaja egymaga ~190px):
// ott a sor cimkeje a harom ertek fole kerul, a harom ertek pedig kozos racsra.
const ROW = 'max-md:grid max-md:grid-cols-[1fr_1fr_6rem]';
const NUM = `${TD} text-right max-md:whitespace-nowrap`;

// 3. blokk: a veszteseg-fokonyv. A teljes vilag szamai, nem a harom journey-e.
const LedgerTables: React.FC<{ ledger: Ledger }> = ({ ledger }) => {
  const path = eventPath(ledger);
  const [sessions, orders, revenue] = sides(ledger);
  const money = (key: string, n: number) => (key === 'revenue_huf' ? ft(n) : int(n));

  return (
    <>
      <Page className="pb-10">
        <div className="g12 border-t border-border pt-8">
          <div className="c3 pr-8">
            <div className="t-label-sm text-on-surface-subtle">Mennyi vész el?</div>
            <p className="t-body prose-col mt-2 text-on-surface-muted">
              Itt már a bolt három évének összes eseménye áll, nem csak a három látogatóé. Az
              első tábla azt mutatja, hány esemény jutott el az egyes állomásokig. A második
              ugyanazt a három évet kétszer: ami a boltban történt, és amit ebből a mérés lát.
            </p>
          </div>

          <div className="c4 min-w-0 pr-8 max-md:mt-8">
            <div className="overflow-x-auto">
            <table className="t-body w-full border-collapse tabular-nums">
              <caption className="t-label-sm pb-2 text-left text-on-surface-subtle">Az események útja</caption>
              <thead>
                <tr>
                  <th scope="col" className={`${TH} text-left`}>Állomás</th>
                  <th scope="col" className={`${TH} text-right`}>Esemény</th>
                  <th scope="col" className={`${TH} text-right`}>Arány</th>
                </tr>
              </thead>
              <tbody>
                {path.map(r => (
                  <tr key={r.key}>
                    <th scope="row" className={`${TD} text-left font-normal`}>{r.label}</th>
                    <td className={NUM}>{int(r.value)}</td>
                    <td className={`${NUM} text-on-surface-muted`}
                        title={r.shareOf ?? undefined}>
                      {r.share === null ? '' : pct(r.share)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>

          <div className="c5 min-w-0 max-md:mt-8">
            <div className="overflow-x-auto">
            <table className="t-body w-full border-collapse tabular-nums">
              <caption className="t-label-sm pb-2 text-left text-on-surface-subtle">Ami történt, és ami látszik belőle</caption>
              <thead>
                <tr className={ROW}>
                  <th scope="col" className={`${TH} text-left max-md:sr-only`}>Mérőszám</th>
                  <th scope="col" className={`${TH} text-right`}>Történt</th>
                  <th scope="col" className={`${TH} text-right`}>Látszik</th>
                  <th scope="col" className={`${TH} text-right`}>Lefedettség</th>
                </tr>
              </thead>
              <tbody>
                {[sessions, orders, revenue].map(r => (
                  <tr key={r.key} className={ROW}>
                    <th scope="row" className={`${TD} text-left font-normal max-md:col-span-3 max-md:border-b-0 max-md:pb-0`}>{r.label}</th>
                    <td className={NUM}>{money(r.key, r.dgp)}</td>
                    <td className={NUM}>{money(r.key, r.pipeline)}</td>
                    <td className={NUM}>{pct(r.coverage)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      </Page>

      <Page className="pb-10">
        <Readout items={[
          { value: pct(sessions.coverage), label: 'a sessionökből ennyit lát a pipeline' },
          { value: pct(orders.coverage), label: 'a rendelésekből ennyit' },
          { value: pct(revenue.coverage), label: 'a bevételből ennyit' },
          {
            value: `${int(ledger.identity.devices_pipeline)} → ${int(ledger.identity.persons_after_stitching)}`,
            label: `eszközből személy · valójában ${int(ledger.identity.customers_consented_dgp)} ember`,
          },
        ]} />
      </Page>
    </>
  );
};

export default LedgerTables;
