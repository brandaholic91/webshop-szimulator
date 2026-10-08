import React from 'react';
import { scaleLinear } from 'd3-scale';
import { line } from 'd3-shape';
import { useContainerWidth } from '../world/useContainerWidth';
import { ChartTooltip, Crosshair, useCrosshair } from '../../components/ChartHover';
import { dec } from './format';

interface Props {
  paths: number[][];    // futasonkent a z-ertek naprol napra
  zCrit: number;        // a dontesi hatar: |z| e folott szignifikans
  truth: number[];      // a z varhato erteke naprol napra
  truthLabel: string;
  ariaLabel: string;
  markCrossings?: boolean;  // false: nincs piros elso-atlepes pont
}

const W_FALLBACK = 720, H = 300;
const PAD = { top: 16, right: 12, bottom: 28, left: 52 };
const NARROW = 480;   // ez alatt a ket felirat a futasok kotegere esik

// A futasok utja semleges tomeg: nem kell oket egyenkent azonositani. Az
// igazsag tinta-szinu referenciavonal. Piros kizarolag az a pont, ahol egy
// ut ELOSZOR lepi at a hatart — a piros sosem vonal (DESIGN.md). Valodi
// hatasnal az atlepes helyes eszleles, nem riasztas: ott a pont elmarad.
const PathsChart: React.FC<Props> = ({
  paths, zCrit, truth, truthLabel, ariaLabel, markCrossings = true,
}) => {
  const { ref, width: W } = useContainerWidth(W_FALLBACK);
  const days = truth.length;

  const peak = Math.max(zCrit + 1, ...truth.map(Math.abs), ...paths.flat().map(Math.abs));
  const x = scaleLinear().domain([0, days - 1]).range([PAD.left, W - PAD.right]);
  const y = scaleLinear().domain([-peak, peak]).range([H - PAD.bottom, PAD.top]);
  const draw = line<number>().x((_, i) => x(i)).y(v => y(v));

  const crossings = paths
    .map(p => {
      const d = p.findIndex(z => Math.abs(z) > zCrit);
      return d >= 0 ? { d, z: p[d] } : null;
    })
    .filter((c): c is { d: number; z: number } => c !== null);

  // A felirat a vonal ala kerul, ha a vonal vege tul kozel van az abra tetejehez.
  const truthEnd = y(truth[days - 1]);
  const truthLabelY = truthEnd - PAD.top < 20 ? truthEnd + 16 : truthEnd - 8;

  // Nagy varhato z-nel a tengely osszenyomodik, es a harom felirat egymasra
  // csuszna: ilyenkor a '0' marad el, a ket hatar felirata a fontosabb.
  const showZero = y(0) - y(zCrit) >= 14;
  const { index: hover, handlers } = useCrosshair(days);
  // Keskeny abran a felirat felulet-szinu gyurut kap (paint-order: a korvonal
  // a betu ala rajzolodik), hogy a rajta atfuto utak ne huzzak at.
  const halo = W < NARROW
    ? { paintOrder: 'stroke', stroke: 'var(--color-surface)', strokeWidth: 4, strokeLinejoin: 'round' as const }
    : undefined;

  return (
    <div ref={ref} className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={ariaLabel}>
        {[-zCrit, 0, zCrit].map(t => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)}
                  stroke="var(--color-border)" strokeWidth={1}
                  strokeDasharray={t === 0 ? undefined : '4 4'} />
            {(t !== 0 || showZero) && (
              <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end"
                    className="t-label-sm tabular-nums" fill="var(--color-on-surface-subtle)">
                {t === 0 ? '0' : dec(t)}
              </text>
            )}
          </g>
        ))}
        {paths.map((p, i) => (
          <path key={i} d={draw(p) ?? ''} fill="none"
                stroke="var(--color-viz-neutral-mass)" strokeWidth={1} />
        ))}
        <path d={draw(truth) ?? ''} fill="none" stroke="var(--color-viz-truth)" strokeWidth={2} />
        {markCrossings && crossings.map((c, i) => (
          <circle key={i} cx={x(c.d)} cy={y(c.z)} r={4}
                  fill="var(--color-attention)" stroke="var(--color-surface)" strokeWidth={2} />
        ))}
        {/* az also hatar ala, jobbra: ott a legritkabb a vonal es a pont */}
        <text x={W - PAD.right} y={y(-zCrit) + 16} textAnchor="end" className="t-label-sm"
              fill="var(--color-on-surface-subtle)" style={halo}>
          döntési határ
        </text>
        <text x={W - PAD.right} y={truthLabelY} textAnchor="end"
              className="t-label-sm" fill="var(--color-viz-truth)" style={halo}>
          {truthLabel}
        </text>
        <text x={PAD.left} y={H - 8} className="t-label-sm" fill="var(--color-on-surface-subtle)">
          1. nap
        </text>
        <text x={W - PAD.right} y={H - 8} textAnchor="end"
              className="t-label-sm" fill="var(--color-on-surface-subtle)">
          {days}. nap
        </text>
        <Crosshair x0={PAD.left} x1={W - PAD.right} y0={PAD.top} y1={H - PAD.bottom}
                   at={hover === null ? null : x(hover)} handlers={handlers}
                   dots={hover === null ? [] : [{ y: y(truth[hover]), color: 'var(--color-viz-truth)' }]} />
      </svg>
      {/* A futasok utja semleges tomeg, ezert egyenkent nem szerepelnek: a
          tooltip az igazsag-vonal erteket es a hatart adja. */}
      {hover !== null && (
        <ChartTooltip x={x(hover)} width={W} title={`${hover + 1}. nap`} rows={[
          { label: 'várható z', value: dec(truth[hover]), color: 'var(--color-viz-truth)' },
          { label: 'döntési határ', value: `±${dec(zCrit)}` },
        ]} />
      )}
    </div>
  );
};

export default PathsChart;
