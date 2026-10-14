import React from 'react';
import { cellFill, cellInk, clusterHeaders, confusionRows, int, pct, pctNumber } from './view';
import type { SegmentsData } from './view';

interface Props {
  data: SegmentsData;
  k: number;
}

// 4 sor (a vilag szegmensei, az igazsag) x k oszlop (a klaszterek). A cella a
// SOR hanyada: a szegmens vevoinek ekkora resze kerult abba a klaszterbe.
// Egyetlen szinszerep (szekvencialis indigo) kozvetlen szazalek-cimkevel; a
// darabszam a cella title-jeben. HTML-tabla, nem SVG: 341 px-en k = 8-nal is
// kifer, es a kepernyoolvaso sor- es oszlopfejlecet kap.
const ConfusionMatrix: React.FC<Props> = ({ data, k }) => {
  const rows = confusionRows(data, k);
  const heads = clusterHeaders(data, k);
  const narrow = k >= 6;   // mobilon a % jel eltunik, a szam marad

  return (
    <div>
      <table className="w-full table-fixed border-collapse tabular-nums"
             aria-label={`A négy szegmens vevőinek megoszlása ${k} klaszter közt, sorhányadban`}>
        <colgroup>
          <col className="w-[28%] md:w-[22%]" />
          {heads.map(h => <col key={h.label} />)}
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className="t-label-sm pb-2 pr-2 text-left font-medium text-on-surface-subtle">
              Igazság ↓ · klaszter →
            </th>
            {heads.map(h => (
              <th key={h.label} scope="col" className="t-label-sm pb-2 text-center font-medium text-on-surface-subtle">
                <div className="text-on-surface">{h.label}</div>
                <div className="max-md:hidden">{int(h.size)} vevő</div>
                <div>{pctNumber(h.share)}<span className={narrow ? 'max-md:hidden' : ''}>%</span></div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.slug}>
              <th scope="row" className="py-1 pr-2 text-left font-normal">
                <div className="t-body text-on-surface">{r.title}</div>
                <div className="t-label-sm text-on-surface-subtle">{pct(r.share, 0)} a vevők közt</div>
              </th>
              {r.cells.map((c, j) => (
                <td key={j} title={`${int(c.count)} vevő`}
                    style={{ backgroundColor: cellFill(c.rowShare), color: cellInk(c.rowShare) }}
                    className="t-label-sm h-12 border-2 border-surface text-center font-medium">
                  {pctNumber(c.rowShare)}<span className={narrow ? 'max-md:hidden' : ''}>%</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="t-label-sm mt-3 text-on-surface-subtle">
        Cella: a sor szegmensének vevőiből hány százalék került az oszlop klaszterébe. Sötétebb
        = nagyobb hányad. Egy tökéletes visszanyerésnél minden sorban egy cella volna 100%.
      </p>
    </div>
  );
};

export default ConfusionMatrix;
