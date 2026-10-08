// A muszer szamformatuma: magyar, tizedesvesszovel. Egy helyen, hogy az abrak
// felirata es a readout ugyanugy irja ki ugyanazt a szamot.

const intFmt = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 0 });

export const int = (n: number): string => intFmt.format(n);

// Hanyad -> szazalek. pct(0.274) = "27,4%", pct(0.05, 0) = "5%".
export const pct = (share: number, digits = 1): string =>
  new Intl.NumberFormat('hu-HU', {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(share);

export const dec = (n: number, digits = 2): string =>
  new Intl.NumberFormat('hu-HU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
