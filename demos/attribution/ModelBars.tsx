import React, { useState } from 'react';
import { scaleBand, scaleLinear } from 'd3-scale';
import { useContainerWidth } from '../world/useContainerWidth';
import { ChartTooltip } from '../../components/ChartHover';
import { pct, signedPp } from './view';
import type { Group } from './view';

interface Props {
  groups: Group[];     // fizetett csatornankent negy sav es az igazsag
  yMax: number;        // az y-tengely teteje; minden ablakra kozos (view.shareMax)
  ariaLabel: string;
}

const W_FALLBACK = 720, H = 320;
const PAD = { top: 32, right: 12, bottom: 52, left: 48 };
const GAP = 2;            // feher res a szomszedos savok kozott (DESIGN.md)
const SHORT_MIN = 24;     // ennel keskenyebb sav ala nem fer ki a rovid cimke
const LONG_MIN = 150;     // ennel keskenyebb csoport fole csak a szam fer ki

const TRUTH = 'var(--color-viz-truth)';

// Az x-tengelyen a csatorna (pozicio kodolja), a szin a modelle: az ordinalis
// indigo letra elso negy foka. Kategorikus szin nincs az abran (DESIGN.md >
// A vezerszabaly). Az igazsag nem sav a tobbi kozott, hanem tinta-szinu
// jelolo a csoport teljes szelessegeben; ablakvaltaskor nem mozdul.
const ModelBars: React.FC<Props> = ({ groups, yMax, ariaLabel }) => {
  const { ref, width: W } = useContainerWidth(W_FALLBACK);
  const [hover, setHover] = useState<{ g: number; b: number } | null>(null);

  const x = scaleBand<string>()
    .domain(groups.map(g => g.slug))
    .range([PAD.left, W - PAD.right])
    .paddingInner(0.24)
    .paddingOuter(0.12);
  const y = scaleLinear().domain([0, yMax]).range([H - PAD.bottom, PAD.top]);

  const band = x.bandwidth();
  const n = groups[0]?.bars.length ?? 1;
  const bw = Math.max(0, (band - GAP * (n - 1)) / n);
  const barX = (g: Group, b: number) => (x(g.slug) ?? 0) + b * (bw + GAP);

  const active = hover ? groups[hover.g] : undefined;
  const activeBar = hover && active ? active.bars[hover.b] : undefined;

  return (
    <div>
      {/* jelmagyarazat: a rovid cimke itt kapja meg a teljes nevet */}
      <div className="t-body mb-3 flex flex-wrap gap-x-5 gap-y-1 text-on-surface-muted">
        {(groups[0]?.bars ?? []).map(b => (
          <span key={b.model} className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: b.color }} />
            <span><span className="font-semibold text-on-surface">{b.short}</span> {b.label}</span>
          </span>
        ))}
        <span className="flex items-center gap-2">
          <span className="inline-block h-0.5 w-4" style={{ backgroundColor: TRUTH }} />
          igazság
        </span>
      </div>

      <div ref={ref} className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={ariaLabel}>
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

          {groups.map((g, gi) => {
            const gx = x(g.slug) ?? 0;
            const mid = gx + band / 2;
            return (
              <g key={g.slug}>
                {g.bars.map((b, bi) => (
                  <g key={b.model}>
                    <rect x={barX(g, bi)} width={bw}
                          y={y(b.share)} height={Math.max(0, y(0) - y(b.share))}
                          fill={b.color}
                          style={{ transition: 'y 120ms, height 120ms' }}
                          onPointerEnter={() => setHover({ g: gi, b: bi })}
                          onPointerDown={() => setHover({ g: gi, b: bi })}
                          onPointerLeave={() => setHover(null)} />
                    {bw >= SHORT_MIN && (
                      <text x={barX(g, bi) + bw / 2} y={H - PAD.bottom + 16} textAnchor="middle"
                            fontSize={12} fontWeight={600} fill="var(--color-on-surface-subtle)">
                        {b.short}
                      </text>
                    )}
                  </g>
                ))}

                {/* truth-marker: feher gyuru alatta, hogy a savokon athaladva is latsszon */}
                <g pointerEvents="none">
                  <line x1={gx - 4} x2={gx + band + 4} y1={y(g.truth)} y2={y(g.truth)}
                        stroke="var(--color-surface)" strokeWidth={6} />
                  <line x1={gx - 4} x2={gx + band + 4} y1={y(g.truth)} y2={y(g.truth)}
                        stroke={TRUTH} strokeWidth={2} />
                </g>
                <text x={mid} y={PAD.top - 14} textAnchor="middle"
                      className="t-label-sm tabular-nums" fill={TRUTH}>
                  {band >= LONG_MIN ? `igazság ${pct(g.truth)}` : pct(g.truth)}
                </text>

                {/* keskeny csoportnal a 0,16em betukoz egymasba tolna a szomszedos neveket */}
                <text x={mid} y={H - 10} textAnchor="middle"
                      className="t-label-sm" fill="var(--color-on-surface-muted)"
                      style={band < LONG_MIN ? { letterSpacing: '0.04em' } : undefined}>
                  {g.title}
                </text>
              </g>
            );
          })}
        </svg>

        {hover && active && activeBar && (
          <ChartTooltip x={barX(active, hover.b) + bw / 2} width={W} title={active.title} rows={[
            { label: activeBar.label, value: pct(activeBar.share), color: activeBar.color },
            { label: 'igazság', value: pct(active.truth), color: TRUTH },
            { label: 'eltérés', value: signedPp(activeBar.errorPp) },
          ]} />
        )}
      </div>
    </div>
  );
};

export default ModelBars;
