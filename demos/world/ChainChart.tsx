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
  zoom: boolean;         // true: csak a legnagyobb koltesu nap kornyeke latszik
}

const W_FALLBACK = 720;
const H = 108;          // panelenkent
const PAD = { top: 8, right: 8, bottom: 4, left: 52 };
const TRUTH = 'var(--color-viz-truth)';
const ELOTTE = 7;       // a kozeli ablak: ennyi nap a csucs elott...
const UTANA = 21;       // ...es ennyi a csucs napjatol (egyutt 4 het)

const Panel: React.FC<{
  values: number[]; color: string; label: string; unit: string; last?: string;
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
          {last}
        </text>
      )}
      <Crosshair x0={PAD.left} x1={width - PAD.right} y0={PAD.top} y1={H - PAD.bottom}
                 at={hover === null ? null : x(hover)} handlers={handlers}
                 dots={hover === null ? [] : [{ y: y(values[hover]), color }]} />
    </svg>
    </>
  );
};

const ChainChart: React.FC<Props> = ({ spend, decay, half, truthDecay, truthHalf, shape, color, reachScale, zoom }) => {
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
  //
  // A harom ev 1096 pontjan a lecsenges nem latszik: a bolt minden nap kolt,
  // igy a 2. panel az 1. felnagyitott masanak tunik. A kozeli ablak a
  // legnagyobb koltesu nap kornyeket mutatja, ahol az 1. panelen a kiugras
  // masnapra eltunik, a 2. panelen napokig megmarad. Az adstock a TELJES
  // sorozaton fut, es csak a rajzhoz vagjuk ki az ablakot: az ablak elso
  // napja igy az elozo napok athozott hatasat is tartalmazza.
  const csucs = spend.indexOf(Math.max(...spend));
  const tol = zoom ? Math.max(0, csucs - ELOTTE) : 0;
  const ig = zoom ? Math.min(spend.length, csucs + UTANA) : spend.length;
  const lSpend = spend.slice(tol, ig);
  const lAdstocked = adstocked.slice(tol, ig);
  const lResponse = response.slice(tol, ig);
  const lTruth = truthResponse.slice(tol, ig);
  const sharedMax = Math.max(...lSpend, ...lAdstocked);

  // A harom panel ugyanazt a napot mutatja, ezert a celkereszt kozos: egy
  // tooltip adja mindharom erteket, es a mutato barmelyik panelen allhat.
  const { index: hover, handlers } = useCrosshair(lSpend.length);
  // Ugyanaz az x-lekepezes, mint a Panelben.
  const hoverX = hover === null ? 0
    : PAD.left + (hover / (lSpend.length - 1)) * (width - PAD.right - PAD.left);

  return (
    <div ref={ref} className="relative flex flex-col">
      <Panel values={lSpend} color={color} label="1 · napi költés" unit="Ft/nap"
             width={width} yMax={sharedMax} hover={hover} handlers={handlers} />
      <Panel values={lAdstocked} color={color} label="2 · lecsengéssel (adstock)" unit="Ft/nap"
             width={width} yMax={sharedMax} hover={hover} handlers={handlers} />
      <Panel values={lResponse} color={color} label="3 · telítődés után" unit="látogatás/nap"
             last={zoom ? `${tol + 1}–${ig}. nap` : `${spend.length} nap`}
             width={width} yMax={reachScale} truth={moved ? lTruth : undefined}
             hover={hover} handlers={handlers} />
      {hover !== null && (
        <ChartTooltip x={hoverX} width={width} title={`${tol + hover + 1}. nap`} rows={[
          { label: 'nyers költés', value: `${ft(lSpend[hover])} Ft`, color },
          { label: 'adstock után', value: `${ft(lAdstocked[hover])} Ft`, color },
          { label: 'szaturáció után', value: `${ft(lResponse[hover])} session`, color },
          ...(moved ? [{ label: 'igazság', value: `${ft(lTruth[hover])} session`, color: TRUTH }] : []),
        ]} />
      )}
    </div>
  );
};

export default ChainChart;
