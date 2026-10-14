import React, { useState } from 'react';
import { scaleLinear, scalePoint } from 'd3-scale';
import { useContainerWidth } from '../world/useContainerWidth';
import { ChartTooltip } from '../../components/ChartHover';
import { ariAxis, chartLabel, dec3, recoveryPoints, silhouetteAxis, silhouettePoints } from './view';
import type { Axis, KPoint, SegmentsData } from './view';

// Ket kis panel egymas mellett (mobilon egymas alatt), mindegyik EGY adatsorral:
// igy a DESIGN.md vezerszabalya (egy abran egy szinszerep) all, es jelmagyarazat
// sem kell. A sorozat az ordinalis indigo 3. foka (a GF primary); az igazsag
// (a felso hatar) on-surface referenciavonal, nem adatsor; a kivalasztott k
// jeloloje nagyobb, feher gyuruvel es kulso karikaval (nem mas szinnel).

interface PanelProps {
  title: string;
  points: KPoint[];
  axis: Axis;
  chosen: number;
  onPick: (k: number) => void;
  reference?: { value: number; label: string; shortLabel?: string };   // az igazsag-jel
  peak?: { k: number; label: string };            // kozvetlen cimke egy ponton
  ariaLabel: string;
}

const W_FALLBACK = 340, H = 240;
const PAD = { top: 28, right: 16, bottom: 40, left: 44 };
const SERIES = 'var(--color-viz-ord-3)';
const TRUTH = 'var(--color-viz-truth)';
const tick = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 2 });

const Panel: React.FC<PanelProps> = ({ title, points, axis, chosen, onPick, reference, peak, ariaLabel }) => {
  const { ref, width: W } = useContainerWidth(W_FALLBACK);
  const [hover, setHover] = useState<number | null>(null);

  const x = scalePoint<number>().domain(points.map(p => p.k)).range([PAD.left, W - PAD.right]).padding(0.5);
  const y = scaleLinear().domain([axis.min, axis.max]).range([H - PAD.bottom, PAD.top]);
  const px = (k: number) => x(k) ?? 0;
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${px(p.k)},${y(p.value)}`).join(' ');
  const active = hover === null ? undefined : points.find(p => p.k === hover);
  const peakPoint = peak ? points.find(p => p.k === peak.k) : undefined;
  // A cimke a rajzteruleten belul marad: a szelso ponton a pont fele nyilik.
  const peakAnchor = peakPoint === points[0] ? 'start'
    : peakPoint === points[points.length - 1] ? 'end' : 'middle';
  // Keskeny rajzteruleten (mobil) a rovid felirat fer ki.
  const refLabel = reference && reference.shortLabel && W - PAD.left - PAD.right < 330
    ? reference.shortLabel : reference?.label;

  return (
    <div>
      <div className="t-label-sm text-on-surface-subtle">{title}</div>
      <div ref={ref} className="relative mt-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={ariaLabel}>
          {y.ticks(4).map(t => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)}
                    stroke="var(--color-border)" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end"
                    className="t-label-sm tabular-nums" fill="var(--color-on-surface-subtle)">
                {tick.format(t)}
              </text>
            </g>
          ))}
          {axis.min < 0 && (
            <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)}
                  stroke="var(--color-border-strong)" strokeWidth={1} />
          )}

          {reference && (
            <g pointerEvents="none">
              <line x1={PAD.left} x2={W - PAD.right} y1={y(reference.value)} y2={y(reference.value)}
                    stroke={TRUTH} strokeWidth={2} />
              <text x={W - PAD.right} y={y(reference.value) - 6} textAnchor="end"
                    className="t-label-sm tabular-nums" fill={TRUTH}>
                {refLabel}: {dec3(reference.value)}
              </text>
            </g>
          )}

          <path d={path} fill="none" stroke={SERIES} strokeWidth={2} />

          {points.map(p => {
            const ez = p.k === chosen;
            return (
              <g key={p.k} style={{ cursor: 'pointer' }}
                 onPointerEnter={() => setHover(p.k)} onPointerLeave={() => setHover(null)}
                 onClick={() => onPick(p.k)}>
                {ez && <circle cx={px(p.k)} cy={y(p.value)} r={11} fill="none" stroke={SERIES} strokeWidth={1.5} />}
                <circle cx={px(p.k)} cy={y(p.value)} r={ez ? 7 : 5} fill={SERIES}
                        stroke="var(--color-surface)" strokeWidth={2} />
                {/* nagyobb, lathatatlan celpont az ujjnak */}
                <circle cx={px(p.k)} cy={y(p.value)} r={16} fill="transparent" />
                <text x={px(p.k)} y={H - PAD.bottom + 18} textAnchor="middle"
                      className="t-label-sm tabular-nums" fontWeight={ez ? 600 : 400}
                      fill={ez ? 'var(--color-on-surface)' : 'var(--color-on-surface-subtle)'}>
                  {p.k}
                </text>
              </g>
            );
          })}

          {peak && peakPoint && (
            <text x={px(peakPoint.k)} y={y(peakPoint.value) - 16} textAnchor={peakAnchor}
                  className="t-label-sm" fill="var(--color-on-surface-muted)">
              {peak.label}
            </text>
          )}

          <text x={(PAD.left + W - PAD.right) / 2} y={H - 4} textAnchor="middle"
                className="t-label-sm" fill="var(--color-on-surface-muted)">
            k, a klaszterek száma
          </text>
        </svg>

        {active && (
          <ChartTooltip x={px(active.k)} width={W} title={`k = ${active.k}`}
                        rows={[{ label: title, value: dec3(active.value), color: SERIES }]} />
        )}
      </div>
    </div>
  );
};

interface Props {
  data: SegmentsData;
  k: number;
  onPick: (k: number) => void;
}

const RecoveryCharts: React.FC<Props> = ({ data, k, onPick }) => {
  const ari = recoveryPoints(data);
  const sil = silhouettePoints(data);
  const ceiling = { value: data.ceiling.ari, label: 'ha a címkék ismertek volnának', shortLabel: 'felső határ' };
  return (
    <div className="grid gap-8 md:grid-cols-2">
      <Panel title="Visszanyerés (ARI), az igazsághoz mérve" points={ari} axis={ariAxis(data)}
             chosen={k} onPick={onPick} reference={ceiling}
             ariaLabel={chartLabel('ARI', ari, k, { value: data.ceiling.ari, label: 'felső határ, ha a címkék ismertek volnának' })} />
      <Panel title="Amit az elemző lát: silhouette" points={sil} axis={silhouetteAxis(data)}
             chosen={k} onPick={onPick} peak={{ k: data.default_k, label: 'a silhouette választása' }}
             ariaLabel={chartLabel('Silhouette', sil, k)} />
    </div>
  );
};

export default RecoveryCharts;
