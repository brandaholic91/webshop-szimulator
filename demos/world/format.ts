// A muszer szamformatuma. Egy helyen, hogy az abrak tooltipje es a readout
// ugyanugy irja ki ugyanazt a szamot.

export const ft = (n: number) => new Intl.NumberFormat('hu-HU').format(Math.round(n));
export const mFt = (n: number) => `${(n / 1_000_000).toFixed(1)} M Ft`;
