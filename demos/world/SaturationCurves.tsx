import React from 'react';
import { scaleLinear } from 'd3-scale';
import { line } from 'd3-shape';
import { saturate } from './response';
import { channelColor, CHANNELS } from './channels';
import { useContainerWidth } from './useContainerWidth';
import type { ResponseChannel } from './useWorldData';
import { ChartTooltip, Crosshair, useCrosshair } from '../../components/ChartHover';
import { ft } from './format';

const W_FALLBACK = 220, H = 130;
const PAD = { top: 10, right: 10, bottom: 24, left: 34 };

const Curve: React.FC<{ ch: ResponseChannel }> = ({ ch }) => {
  const { ref, width } = useContainerWidth(W_FALLBACK);
  const maxX = ch.half_saturation_huf * 4;
  const pontok = Array.from({ length: 80 }, (_, i) => (i / 79) * maxX);
  const x = scaleLinear().domain([0, maxX]).range([PAD.left, width - PAD.right]);
  const y = scaleLinear().domain([0, 1]).range([H - PAD.bottom, PAD.top]);
  const d = line<number>().x(v => x(v)).y(v => y(saturate(v, ch.half_saturation_huf, ch.shape)))(pontok) ?? '';
  const cim = CHANNELS.find(c => c.slug === ch.slug)?.title ?? ch.slug;
  const { index: hover, handlers } = useCrosshair(pontok.length);
  const valasz = (v: number) => saturate(v, ch.half_saturation_huf, ch.shape);

  return (
    <figure ref={ref} className="relative m-0 max-md:flex max-md:flex-col">
      <svg viewBox={`0 0 ${width} ${H}`} className="block w-full" role="img" aria-label={`${cim} szaturációs görbéje`}>
        {/* truth-marker: a felszaturacios pont, ahol a valasz pontosan 0,5 */}
        <line x1={x(ch.half_saturation_huf)} x2={x(ch.half_saturation_huf)}
              y1={PAD.top} y2={H - PAD.bottom}
              stroke="var(--color-viz-truth)" strokeWidth={1} strokeDasharray="3 3" />
        <line x1={PAD.left} x2={width - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom}
              stroke="var(--color-border)" />
        <path d={d} fill="none" stroke={channelColor(ch.slug)} strokeWidth={1.75} />
        {/* nincs kulon "0" felirat a bal szelen: az y-tengely mar nullarol
            indul, es a felpont-cimke pont ott allt volna, ahol utkoztek volna
            (a harom panelen "0FÉLPONT" egybeolvadt) */}
        <text x={x(ch.half_saturation_huf)} y={H - 6} textAnchor="middle"
              className="t-label-sm" fill="var(--color-viz-truth)">félpont</text>
        <Crosshair x0={PAD.left} x1={width - PAD.right} y0={PAD.top} y1={H - PAD.bottom}
                   at={hover === null ? null : x(pontok[hover])} handlers={handlers}
                   dots={hover === null ? [] : [{ y: y(valasz(pontok[hover])), color: channelColor(ch.slug) }]} />
      </svg>
      {hover !== null && (
        <ChartTooltip x={x(pontok[hover])} width={width} title={`${ft(pontok[hover])} Ft/nap`} rows={[
          { label: 'válasz', value: `${(valasz(pontok[hover]) * 100).toFixed(0)}%`, color: channelColor(ch.slug) },
        ]} />
      )}
      {/* kozvetlen felirat, nem jelmagyarazat-doboz; mobilon, ahol a harom
          abra egymas ala kerul, az abra FOLE megy, kulonben a kovetkezo abra
          cimenek latszana */}
      <figcaption className="t-label-sm mt-1 text-on-surface-subtle max-md:order-first max-md:mb-1 max-md:mt-0">{cim}</figcaption>
    </figure>
  );
};

const SaturationCurves: React.FC<{ channels: ResponseChannel[] }> = ({ channels }) => (
  <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
    {channels.map(ch => <Curve key={ch.slug} ch={ch} />)}
  </div>
);

export default SaturationCurves;
