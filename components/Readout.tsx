import React from 'react';

export interface ReadoutItem {
  value: string;
  label: string;
}

// A muszer alairasa, kozvetlenul az abra alatt.
// KOTELEZO SZABALY (CLAUDE.md 4. nem-targyalhato pont): ide csak a modellbol
// vagy a truth.json-bol jott ertek kerulhet. Kitalalt szam, becsult szazalek
// nem. Ha egy ertek illusztrativ, azt a felirata mondja ki.
const Readout: React.FC<{ items: ReadoutItem[] }> = ({ items }) => (
  <div className="readout">
    {items.map(item => (
      <div key={item.label}>
        <div className="t-readout text-on-surface">{item.value}</div>
        <div className="t-label-sm mt-1.5 text-on-surface-subtle">{item.label}</div>
      </div>
    ))}
  </div>
);

export default Readout;
