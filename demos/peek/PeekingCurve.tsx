import React from 'react';
import { scaleLinear } from 'd3-scale';
import { line } from 'd3-shape';
import { useContainerWidth } from '../world/useContainerWidth';
import { ChartTooltip, Crosshair, useCrosshair } from '../../components/ChartHover';
import { pct } from './format';

interface Props {
  firstCross: number[];  // naponta: hany futas lepte at ELOSZOR a hatart
  runs: number;
  alpha: number;
}

const W_FALLBACK = 720, H = 220;
const PAD = { top: 16, right: 12, bottom: 28, left: 52 };

// A teves riasztasok halmozott aranya: a futasok hanyada, ami addig a napig
// legalabb egyszer szignifikans volt. A megengedett szint (alpha) az igazsag:
// tinta-szinu referenciavonal, felcimkezve.
const PeekingCurve: React.FC<Props> = ({ firstCross, runs, alpha }) => {
  const { ref, width: W } = useContainerWidth(W_FALLBACK);
  const days = firstCross.length;

  let crossed = 0;
  const cumulative = firstCross.map(n => (crossed += n) / runs);
  const top = Math.max(alpha, cumulative[days - 1]) * 1.2;

  const x = scaleLinear().domain([0, days - 1]).range([PAD.left, W - PAD.right]);
  const y = scaleLinear().domain([0, top]).range([H - PAD.bottom, PAD.top]);
  const d = line<number>().x((_, i) => x(i)).y(v => y(v))(cumulative) ?? '';
  const { index: hover, handlers } = useCrosshair(days);

  return (
    <div ref={ref} className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img"
           aria-label={`A legalább egyszer szignifikáns A/A tesztek aránya a napok függvényében: ` +
             `a ${days}. napra ${pct(cumulative[days - 1])}, a megengedett ${pct(alpha, 0)}`}>
        {y.ticks(4).map(t => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)}
                  stroke="var(--color-border)" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end"
                  className="t-label-sm tabular-nums" fill="var(--color-on-surface-subtle)">
              {pct(t, 0)}
            </text>
          </g>
        ))}
        <line x1={PAD.left} x2={W - PAD.right} y1={y(alpha)} y2={y(alpha)}
              stroke="var(--color-viz-truth)" strokeWidth={2} />
        <path d={d} fill="none" stroke="var(--color-viz-ord-3)" strokeWidth={2} />
        <text x={W - PAD.right} y={y(alpha) - 6} textAnchor="end"
              className="t-label-sm" fill="var(--color-viz-truth)">
          megengedett: {pct(alpha, 0)}
        </text>
        <text x={W - PAD.right} y={y(cumulative[days - 1]) - 8} textAnchor="end"
              className="t-label-sm" fill="var(--color-viz-ord-3)">
          naponta ránézve
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
                   dots={hover === null ? [] : [{ y: y(cumulative[hover]), color: 'var(--color-viz-ord-3)' }]} />
      </svg>
      {hover !== null && (
        <ChartTooltip x={x(hover)} width={W} title={`${hover + 1}. nap`} rows={[
          { label: 'naponta ránézve', value: pct(cumulative[hover]), color: 'var(--color-viz-ord-3)' },
        ]} />
      )}
    </div>
  );
};

export default PeekingCurve;
