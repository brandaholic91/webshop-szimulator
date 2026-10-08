import React from 'react';
import { scaleLinear } from 'd3-scale';
import { line } from 'd3-shape';
import { useContainerWidth } from '../world/useContainerWidth';
import { ChartTooltip, Crosshair, useCrosshair } from '../../components/ChartHover';
import { pct } from './format';

interface Props {
  power: number[];  // az ero a tesztido fuggvenyeben; a 0. elem az 1. nap
  days: number;     // a valasztott tesztido
  target: number;   // az ero celerteke
}

const W_FALLBACK = 720, H = 220;
const PAD = { top: 16, right: 12, bottom: 28, left: 52 };

// Egy adatsor: az ero a tesztido fuggvenyeben. A celertek szaggatott
// segedvonal, a valasztott tesztido fuggoleges jelolo egy ponttal.
const PowerCurve: React.FC<Props> = ({ power, days, target }) => {
  const { ref, width: W } = useContainerWidth(W_FALLBACK);
  const maxDays = power.length;

  const x = scaleLinear().domain([0, maxDays - 1]).range([PAD.left, W - PAD.right]);
  const y = scaleLinear().domain([0, 1]).range([H - PAD.bottom, PAD.top]);
  const d = line<number>().x((_, i) => x(i)).y(v => y(v))(power) ?? '';
  const chosen = power[days - 1];
  // A jelolo felirata a vonal bal oldalara kerul, ha jobbra nem ferne ki.
  const labelLeft = x(days - 1) > W - PAD.right - 160;
  // A felirat alul all, kiveve ha ott a gorbe futna at rajta. A gorbe
  // monoton no: a jelolotol jobbra legalabb `chosen`, balra legfeljebb annyi.
  // Jobb oldalon ezert csak alacsony eronel kell felulre tenni, bal oldalon
  // viszont mindig, amig a gorbe a felso savot el nem eri.
  const labelTop = chosen < (labelLeft ? 0.85 : 0.2);
  const { index: hover, handlers } = useCrosshair(maxDays);

  return (
    <div ref={ref} className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img"
           aria-label={`A teszt ereje a tesztidő függvényében: ${days} nap alatt ` +
             `${pct(chosen, 0)}, a cél ${pct(target, 0)}`}>
        {[0, 0.5, 1].map(t => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)}
                  stroke="var(--color-border)" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end"
                  className="t-label-sm tabular-nums" fill="var(--color-on-surface-subtle)">
              {pct(t, 0)}
            </text>
          </g>
        ))}
        <line x1={PAD.left} x2={W - PAD.right} y1={y(target)} y2={y(target)}
              stroke="var(--color-border-strong)" strokeWidth={1} strokeDasharray="4 4" />
        <line x1={x(days - 1)} x2={x(days - 1)} y1={PAD.top} y2={H - PAD.bottom}
              stroke="var(--color-border-strong)" strokeWidth={1} />
        <path d={d} fill="none" stroke="var(--color-viz-ord-3)" strokeWidth={2} />
        <circle cx={x(days - 1)} cy={y(chosen)} r={4}
                fill="var(--color-viz-ord-3)" stroke="var(--color-surface)" strokeWidth={2} />
        {/* keskeny abran a gorbe es a jelolo a feliraton fut at: felulet-szinu gyuru */}
        <text x={PAD.left + 6} y={y(target) - 6} className="t-label-sm"
              fill="var(--color-on-surface-subtle)"
              style={W < 480 ? { paintOrder: 'stroke', stroke: 'var(--color-surface)', strokeWidth: 4 } : undefined}>
          cél: {pct(target, 0)}
        </text>
        <text x={x(days - 1) + (labelLeft ? -8 : 8)} y={labelTop ? PAD.top + 12 : H - PAD.bottom - 8}
              textAnchor={labelLeft ? 'end' : 'start'}
              className="t-label-sm" fill="var(--color-on-surface-subtle)">
          {days} nap: {pct(chosen, 0)}
        </text>
        <text x={PAD.left} y={H - 8} className="t-label-sm" fill="var(--color-on-surface-subtle)">
          1. nap
        </text>
        <text x={W - PAD.right} y={H - 8} textAnchor="end"
              className="t-label-sm" fill="var(--color-on-surface-subtle)">
          {maxDays}. nap
        </text>
        <Crosshair x0={PAD.left} x1={W - PAD.right} y0={PAD.top} y1={H - PAD.bottom}
                   at={hover === null ? null : x(hover)} handlers={handlers}
                   dots={hover === null ? [] : [{ y: y(power[hover]), color: 'var(--color-viz-ord-3)' }]} />
      </svg>
      {hover !== null && (
        <ChartTooltip x={x(hover)} width={W} title={`${hover + 1}. nap`} rows={[
          { label: 'erő', value: pct(power[hover]), color: 'var(--color-viz-ord-3)' },
        ]} />
      )}
    </div>
  );
};

export default PowerCurve;
