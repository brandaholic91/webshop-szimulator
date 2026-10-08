// A muszer szamformatuma: magyar, tizedesvesszovel. Egy helyen, hogy a tablak
// es a readout ugyanugy irjak ki ugyanazt a szamot.

const intFmt = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 0 });

export const int = (n: number): string => intFmt.format(n);

export const ft = (n: number): string => `${intFmt.format(n)} Ft`;

// Hanyad -> szazalek. pct(0.799) = "79,9%".
export const pct = (share: number, digits = 1): string =>
  new Intl.NumberFormat('hu-HU', {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(share);
