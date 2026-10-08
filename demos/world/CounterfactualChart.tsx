import React from 'react';
import { scaleLinear } from 'd3-scale';
import { area, line } from 'd3-shape';
import { useContainerWidth } from './useContainerWidth';
import { ChartTooltip, Crosshair, useCrosshair } from '../../components/ChartHover';
import { mFt } from './format';

interface Props {
  actual: number[];          // heti bevetel, Ft
  counterfactual: number[];  // ugyanaz, a csatorna kolteset nullazva
  color: string;
  ariaLabel: string;
}

const W_FALLBACK = 720, H = 260;
const PAD = { top: 16, right: 12, bottom: 28, left: 68 };

// A tenyleges bevetel a TENYALLAS: tinta (viz-truth), referenciavonalkent.
// Az ellentenyes a csatorna szinet viseli. A kettő kozotti kulonbseg — maga az
// inkrementalitas — halvanyan kitoltve. Nincs divergalo szinskala: az elojelet
// a ket vonal egymashoz kepesti helyzete kodolja, nem a szin.
const CounterfactualChart: React.FC<Props> = ({ actual, counterfactual, color, ariaLabel }) => {
  const { ref, width: W } = useContainerWidth(W_FALLBACK);
  const n = actual.length;
  const x = scaleLinear().domain([0, n - 1]).range([PAD.left, W - PAD.right]);
  // 1.18-szoros fejter: 1.05 mellett a Black Friday-csúcsok a jobb szélen
  // pont a jelmagyarázat szövegébe futottak bele.
  const y = scaleLinear()
    .domain([0, Math.max(...actual) * 1.18 || 1])
    .range([H - PAD.bottom, PAD.top]);

  const savPath = area<number>()
    .x((_, i) => x(i))
    .y0((_, i) => y(counterfactual[i]))
    .y1(v => y(v))(actual) ?? '';
  const tenyleges = line<number>().x((_, i) => x(i)).y(v => y(v))(actual) ?? '';
  const ellentenyes = line<number>().x((_, i) => x(i)).y(v => y(v))(counterfactual) ?? '';

  const tickY = y.ticks(4);
  const { index: hover, handlers } = useCrosshair(n);

  return (
    <div ref={ref} className="relative">
      {/* mobilon a jelmagyarazat az abra FOLE kerul: a keskeny rajzteruleten a
          jobb felso sarok feliratai a sor vegi csucsokra ultek ra */}
      <div className="mb-1 flex flex-wrap justify-end gap-x-4 md:hidden">
        <span className="t-label-sm" style={{ color: 'var(--color-viz-truth)' }}>tényleges bevétel</span>
        <span className="t-label-sm" style={{ color }}>e nélkül a csatorna nélkül</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img"
           aria-label={ariaLabel}>
        {tickY.map(t => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)}
                  stroke="var(--color-border)" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end"
                  className="t-label-sm tabular-nums" fill="var(--color-on-surface-subtle)">
              {(t / 1_000_000).toFixed(1)}M
            </text>
          </g>
        ))}
        <path d={savPath} fill={color} opacity={0.16} />
        <path d={ellentenyes} fill="none" stroke={color} strokeWidth={1.5} />
        <path d={tenyleges} fill="none" stroke="var(--color-viz-truth)" strokeWidth={1.75} />
        <text x={W - PAD.right} y={PAD.top + 10} textAnchor="end"
              className="t-label-sm max-md:hidden" fill="var(--color-viz-truth)">
          tényleges bevétel
        </text>
        <text x={W - PAD.right} y={PAD.top + 26} textAnchor="end"
              className="t-label-sm max-md:hidden" fill={color}>
          e nélkül a csatorna nélkül
        </text>
        <text x={PAD.left} y={H - 8} className="t-label-sm" fill="var(--color-on-surface-subtle)">
          2023
        </text>
        <text x={W - PAD.right} y={H - 8} textAnchor="end"
              className="t-label-sm" fill="var(--color-on-surface-subtle)">
          2025 · {n} hét
        </text>
        <Crosshair x0={PAD.left} x1={W - PAD.right} y0={PAD.top} y1={H - PAD.bottom}
                   at={hover === null ? null : x(hover)} handlers={handlers}
                   dots={hover === null ? [] : [
                     { y: y(counterfactual[hover]), color },
                     { y: y(actual[hover]), color: 'var(--color-viz-truth)' },
                   ]} />
      </svg>
      {hover !== null && (
        <ChartTooltip x={x(hover)} width={W} title={`${hover + 1}. hét`} rows={[
          { label: 'tényleges', value: mFt(actual[hover]), color: 'var(--color-viz-truth)' },
          { label: 'csatorna nélkül', value: mFt(counterfactual[hover]), color },
          { label: 'különbség', value: mFt(actual[hover] - counterfactual[hover]) },
        ]} />
      )}
    </div>
  );
};

export default CounterfactualChart;
