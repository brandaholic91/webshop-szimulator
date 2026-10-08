import React, { useLayoutEffect, useRef, useState } from 'react';

// Az abrak hover-retege (DESIGN.md > Jeloles-specifikaciok): vonalon es
// teruleten celkereszt + tooltip. Harom darab, amit minden abra ugyanugy rak
// ossze: a useCrosshair megmondja, melyik adatponton all a mutato, a
// Crosshair kirajzolja az SVG-ben, a ChartTooltip pedig HTML-kent lebeg az
// abra folott. A tooltip csak kiegeszit: amit mutat, azt az abra felirata, a
// readout vagy az aria-label is elmondja.

// A mutato vizszintes helyzetebol adatpont-index. Nem a vonalat kell
// eltalalni: a teljes rajzterulet a celpont, es a legkozelebbi pontra ugrik.
export function useCrosshair(count: number) {
  const [raw, setRaw] = useState<number | null>(null);

  const track = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const t = (e.clientX - r.left) / r.width;
    setRaw(Math.max(0, Math.min(count - 1, Math.round(t * (count - 1)))));
  };

  return {
    // Ha az adatsor kozben rovidebb lett (pl. a tesztido csuszkaja), a regi
    // index mar nem letezo pontra mutatna.
    index: raw !== null && raw < count ? raw : null,
    handlers: {
      onPointerMove: track,
      onPointerDown: track,   // erintesnel a koppintas is mutat erteket
      onPointerLeave: () => setRaw(null),
    },
  };
}

export type CrosshairHandlers = ReturnType<typeof useCrosshair>['handlers'];

interface CrosshairProps {
  x0: number; x1: number;   // a rajzterulet szelei, viewBox-egysegben
  y0: number; y1: number;
  at: number | null;        // a celkereszt x-e; null = nincs hover
  dots?: { y: number; color: string }[];
  handlers: CrosshairHandlers;
}

// Az SVG UTOLSO gyerekekent kell allnia: az atlatszo teglalap igy van legfelul,
// es o kapja a mutato esemenyeit. A `transparent` (nem `none`) kitoltes kell,
// mert a `none` kitoltesu alakzat nem fog esemenyt.
export const Crosshair: React.FC<CrosshairProps> = ({ x0, x1, y0, y1, at, dots = [], handlers }) => (
  <g>
    {at !== null && (
      <g pointerEvents="none">
        <line x1={at} x2={at} y1={y0} y2={y1} stroke="var(--color-border-strong)" strokeWidth={1} />
        {dots.map((d, i) => (
          <circle key={i} cx={at} cy={d.y} r={4}
                  fill={d.color} stroke="var(--color-surface)" strokeWidth={2} />
        ))}
      </g>
    )}
    {/* pan-y: fuggolegesen az oldal gorog, vizszintesen az ujj az abrat tapogatja */}
    <rect x={x0} y={y0} width={Math.max(0, x1 - x0)} height={Math.max(0, y1 - y0)}
          fill="transparent" style={{ touchAction: 'pan-y' }} {...handlers} />
  </g>
);

export interface TooltipRow {
  label: string;
  value: string;
  color?: string;   // az adatsor szine: rovid vonaskent all a sor elott
}

interface TooltipProps {
  x: number;       // a celkereszt x-e a kontener bal szeletol, px
  width: number;   // a kontener szelessege, px
  title: string;
  rows: TooltipRow[];
}

const GAP = 12;

// A szulo kontenernek `relative`-nak kell lennie. Az ertek az eros elem, a
// felirat a masodlagos — a jelmagyarazat forditottja, mert itt az olvaso mar
// tudja, melyik adatsort nezi, es a szamot keresi.
export const ChartTooltip: React.FC<TooltipProps> = ({ x, width, title, rows }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  // A sajat szelesseget meri, hogy tudja, kifer-e a celkereszt jobb oldalan.
  // Fuggosegi tomb nelkul fut: a szoveg minden lepesnel valtozhat. Ha a
  // szelesseg nem valtozott, a setW nem indit uj renderelest.
  useLayoutEffect(() => {
    if (ref.current) setW(ref.current.offsetWidth);
  });

  // Alapbol a celkereszttol jobbra; ha ott nem fer ki, balra; ha sehol
  // (keskeny abra), a kontener szelehez igazodik.
  let left = x + GAP;
  if (left + w > width) left = x - GAP - w;
  left = Math.max(0, Math.min(left, width - w));

  return (
    <div ref={ref} style={{ left, top: 0 }}
         className="pointer-events-none absolute z-10 whitespace-nowrap rounded-sm border border-border bg-surface px-3 py-2 shadow-tooltip">
      <div className="t-label-sm text-on-surface-subtle">{title}</div>
      <div className="mt-1 grid grid-cols-[auto_1fr_auto] items-center gap-x-2">
        {rows.map(r => (
          <React.Fragment key={r.label}>
            <span className="h-0.5 w-3" style={{ backgroundColor: r.color }} />
            <span className="t-body text-on-surface-muted">{r.label}</span>
            <span className="t-strong text-right tabular-nums text-on-surface">{r.value}</span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};
