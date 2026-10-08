import React, { useMemo } from 'react';
import { scaleLinear } from 'd3-scale';
import { line } from 'd3-shape';
import { adstock, saturate } from './response';
import { useContainerWidth } from './useContainerWidth';
import { ChartTooltip, Crosshair, useCrosshair, type CrosshairHandlers } from '../../components/ChartHover';
import { ft } from './format';

interface Props {
  spend: number[];       // napi Ft, egy csatornara
  decay: number;
  half: number;
  truthDecay: number;    // a vilag valodi parameterei: a 3. panel referenciavonala
  truthHalf: number;
  shape: number;
  color: string;
  reachScale: number;
}

const W_FALLBACK = 720;
const H = 108;          // panelenkent
const PAD = { top: 8, right: 8, bottom: 4, left: 52 };
const TRUTH = 'var(--color-viz-truth)';

const Panel: React.FC<{
  values: number[]; color: string; label: string; unit: string; last: boolean;
  width: number; yMax?: number;
  truth?: number[];      // truth-marker: tinta referenciavonal a szines vonal alatt
  hover: number | null; handlers: CrosshairHandlers;
}> = ({ values, color, label, unit, last, width, yMax, truth, hover, handlers }) => {
  const x = scaleLinear().domain([0, values.length - 1]).range([PAD.left, width - PAD.right]);
  const y = scaleLinear().domain([0, (yMax ?? Math.max(...values)) * 1.05 || 1])
    .range([H - PAD.bottom, PAD.top]);
  const path = line<number>().x((_, i) => x(i)).y(v => y(v));
  const d = path(values) ?? '';

  return (
    <>
    {/* mobilon a felirat a panel FOLOTT all, sajat sorban: a rajzteruleten
        belul a hosszabbak a keskeny abran a vonalra ultek ra */}
    <div className="t-label-sm mt-4 flex flex-wrap justify-between gap-x-4 text-on-surface-subtle first:mt-0 md:hidden">
      <span>{label}</span>
      <span>{unit}</span>
      {truth && <span style={{ color: TRUTH }}>sötét vonal: igazság</span>}
    </div>
    <svg viewBox={`0 0 ${width} ${H}`} className="block w-full" role="img" aria-label={label}>
      <line x1={PAD.left} x2={width - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom}
            stroke="var(--color-border)" strokeWidth={1} />
      {truth && <path d={path(truth) ?? ''} fill="none" stroke={TRUTH} strokeWidth={1.5} />}
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} />
      <text x={0} y={PAD.top + 9} className="t-label-sm max-md:hidden" fill="var(--color-on-surface-subtle)"
            stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">
        {label}
      </text>
      <text x={0} y={PAD.top + 22} className="t-label-sm max-md:hidden" fill="var(--color-on-surface-subtle)"
            stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">
        {unit}
      </text>
      {truth && (
        <text x={width - PAD.right} y={PAD.top + 9} textAnchor="end" className="t-label-sm max-md:hidden"
              fill={TRUTH} stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">
          sötét vonal: igazság
        </text>
      )}
      {last && (
        <text x={width - PAD.right} y={H - PAD.bottom - 4} textAnchor="end"
              className="t-label-sm" fill="var(--color-on-surface-subtle)">
          1096 nap
        </text>
      )}
      <Crosshair x0={PAD.left} x1={width - PAD.right} y0={PAD.top} y1={H - PAD.bottom}
                 at={hover === null ? null : x(hover)} handlers={handlers}
                 dots={hover === null ? [] : [{ y: y(values[hover]), color }]} />
    </svg>
    </>
  );
};

const ChainChart: React.FC<Props> = ({ spend, decay, half, truthDecay, truthHalf, shape, color, reachScale }) => {
  const { ref, width } = useContainerWidth(W_FALLBACK);

  const { adstocked, response } = useMemo(() => {
    const a = adstock(spend, decay);
    return { adstocked: a, response: a.map(v => saturate(v, half, shape) * reachScale) };
  }, [spend, decay, half, shape, reachScale]);

  // Amit a vilag valodi parameterei adnak. Csak akkor rajzoljuk ki, ha a
  // csuszkak elmozdultak: alapallasban a ket vonal pontosan fedne egymast.
  const truthResponse = useMemo(
    () => adstock(spend, truthDecay).map(v => saturate(v, truthHalf, shape) * reachScale),
    [spend, truthDecay, truthHalf, shape, reachScale],
  );
  const moved = decay !== truthDecay || half !== truthHalf;

  // 1. es 2. panel UGYANAZON a skalan fut (mindketto Ft/nap): kulon
  // normalizalva az adstock szintemelese — az egesz oka, amiert a 2. panel
  // létezik — elveszne, es a ket vonal megkulonboztethetetlenne valna.
  // A 3. panel mas mertekegyseg (session/nap), es ROGZITETT skalan fut: a
  // teteje a reachScale, vagyis a teljes telitodes latogatasszama. Ha a
  // vonal maximumahoz igazodna, a csuszkak szintvaltozasa nem latszana.
  const sharedMax = Math.max(...spend, ...adstocked);

  // A harom panel ugyanazt a napot mutatja, ezert a celkereszt kozos: egy
  // tooltip adja mindharom erteket, es a mutato barmelyik panelen allhat.
  const { index: hover, handlers } = useCrosshair(spend.length);
  // Ugyanaz az x-lekepezes, mint a Panelben.
  const hoverX = hover === null ? 0
    : PAD.left + (hover / (spend.length - 1)) * (width - PAD.right - PAD.left);

  return (
    <div ref={ref} className="relative flex flex-col">
      <Panel values={spend} color={color} label="1 · napi költés" unit="Ft/nap"
             last={false} width={width} yMax={sharedMax} hover={hover} handlers={handlers} />
      <Panel values={adstocked} color={color} label="2 · lecsengéssel (adstock)" unit="Ft/nap"
             last={false} width={width} yMax={sharedMax} hover={hover} handlers={handlers} />
      <Panel values={response} color={color} label="3 · telítődés után" unit="látogatás/nap"
             last width={width} yMax={reachScale} truth={moved ? truthResponse : undefined}
             hover={hover} handlers={handlers} />
      {hover !== null && (
        <ChartTooltip x={hoverX} width={width} title={`${hover + 1}. nap`} rows={[
          { label: 'nyers költés', value: `${ft(spend[hover])} Ft`, color },
          { label: 'adstock után', value: `${ft(adstocked[hover])} Ft`, color },
          { label: 'szaturáció után', value: `${ft(response[hover])} session`, color },
          ...(moved ? [{ label: 'igazság', value: `${ft(truthResponse[hover])} session`, color: TRUTH }] : []),
        ]} />
      )}
    </div>
  );
};

export default ChainChart;
