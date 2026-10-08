import { useEffect, useRef, useState } from 'react';

// Az SVG-panelek korabban fix viewBox-szelesseggel dolgoztak (pl. 720), es a
// tenyleges renderelt szelesseghez kepesti aranyban a betumeret is
// arányosan zsugorodott — mobilon (~358 px-es oszlop) a 12 px-es
// t-label-sm ~6 px-re esett a DESIGN.md 12 px-es padlaja ala. A meressel a
// viewBox mindig a valodi konteinerszelesseg, tehat 1 viewBox-egyseg = 1 CSS
// px, es a szoveg mindig a beallitott meretben jelenik meg, kepernyomerettol
// fuggetlenul.
export function useContainerWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, width } as const;
}
