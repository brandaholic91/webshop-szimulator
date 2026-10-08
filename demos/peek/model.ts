// A Kiserlet muszer (01.4) matekja. Elo TypeScript-matek, a bongeszoben fut.
//
// A 12. dontes szerint ez a kivetel a "Python becsul, TypeScript rajzol"
// szabaly alol: szimulacio es zart alaku keplet, nem adatra illesztes. Nincs
// benne optimalizalas es konvergencia — a mde() felezese egy monoton fuggveny
// invertalasa, nem modellillesztes.
//
// A fajl UI- es bongeszofuggetlen: semmit nem hoz be kivulrol, es a veletlen egyetlen
// forrasa a makeRng() seedelt generatora. Ezt a model.test.ts ket ortesztje
// ellenorzi.

// ---- veletlen ------------------------------------------------------------

// mulberry32: 32 bites allapot, ugyanaz a seed -> ugyanaz a sorozat, [0, 1).
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Standard normalis huzas (Box-Muller). A 1 - rng() a (0, 1] tartomanyba
// visz, igy a log() sosem kap nullat.
function normalDraw(rng: () => number): number {
  const u = 1 - rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Egy binomialis huzas: n kiserletbol hany siker p valoszinuseggel.
const INVERSION_LIMIT = 500;

export function binomial(rng: () => number, n: number, p: number): number {
  if (n <= 0 || p <= 0) return 0;
  if (p >= 1) return n;
  const mean = n * p;
  if (mean > INVERSION_LIMIT) {
    // Nagy varhato erteknel az (1-p)^n alulcsordulna: normalis kozelites.
    const x = Math.round(mean + Math.sqrt(mean * (1 - p)) * normalDraw(rng));
    return Math.min(n, Math.max(0, x));
  }
  // Inverzios mintavetel: a tomegfuggvenyt 0-tol felfele osszegezzuk, amig
  // at nem lepi az egyenletes huzast. P(k+1) = P(k) * (n-k)/(k+1) * p/(1-p).
  const u = rng();
  const odds = p / (1 - p);
  let pmf = Math.pow(1 - p, n);
  let cdf = pmf;
  let k = 0;
  while (u > cdf && k < n) {
    pmf *= ((n - k) / (k + 1)) * odds;
    cdf += pmf;
    k++;
  }
  return k;
}

// ---- normalis eloszlas ---------------------------------------------------

// Hibafuggveny, Abramowitz-Stegun 7.1.26 (abszolut hiba 1,5e-7 alatt).
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const poly =
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) * t;
  return sign * (1 - poly * Math.exp(-ax * ax));
}

// Standard normalis eloszlasfuggveny.
export function normCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

// A standard normalis eloszlasfuggveny inverze (Acklam racionalis kozelitese).
export function normInv(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416];
  const low = 0.02425;
  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - low) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

// ---- a proba es az ereje -------------------------------------------------

// Ketaranyos z-proba, osszevont (pooled) szorassal, ketoldali p-ertekkel.
// xa/na: az A ag sikerei es mintaja; xb/nb: a B age. Pozitiv z = a B a jobb.
export function zTest(xa: number, na: number, xb: number, nb: number): { z: number; p: number } {
  const pooled = (xa + xb) / (na + nb);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / na + 1 / nb));
  if (!(se > 0)) return { z: 0, p: 1 };
  const z = (xb / nb - xa / na) / se;
  return { z, p: 2 * (1 - normCdf(Math.abs(z))) };
}

// A ket hipotezis alatti standard hiba. lift = relativ hatas (0.10 = +10%).
function standardErrors(baseRate: number, lift: number, nPerArm: number) {
  const p1 = baseRate;
  const p2 = baseRate * (1 + lift);
  const pb = (p1 + p2) / 2;
  return {
    delta: p2 - p1,
    se0: Math.sqrt((2 * pb * (1 - pb)) / nPerArm),
    se1: Math.sqrt((p1 * (1 - p1) + p2 * (1 - p2)) / nPerArm),
  };
}

// A z-ertek varhato erteke adott mintan: ez az abra "igazsag"-vonala.
export function expectedZ(baseRate: number, lift: number, nPerArm: number): number {
  const { delta, se0 } = standardErrors(baseRate, lift, nPerArm);
  return se0 > 0 ? delta / se0 : 0;
}

// A z-proba ereje zart alakban. lift = 0-nal pontosan alpha-t ad.
export function analyticPower(baseRate: number, lift: number, nPerArm: number, alpha: number): number {
  const { delta, se0, se1 } = standardErrors(baseRate, lift, nPerArm);
  const zAlpha = normInv(1 - alpha / 2);
  return normCdf((delta - zAlpha * se0) / se1) + normCdf((-delta - zAlpha * se0) / se1);
}

// Agankenti mintameret adott erohoz, felfele kerekitve. lift = 0-nal Infinity.
export function sampleSizePerArm(baseRate: number, lift: number, alpha: number, power: number): number {
  const p1 = baseRate;
  const p2 = baseRate * (1 + lift);
  const pb = (p1 + p2) / 2;
  const zAlpha = normInv(1 - alpha / 2);
  const zBeta = normInv(power);
  const root = zAlpha * Math.sqrt(2 * pb * (1 - pb)) +
    zBeta * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2));
  return Math.ceil((root * root) / ((p2 - p1) * (p2 - p1)));
}

// A legkisebb relativ hatas, amit adott mintan adott erovel ki lehet mutatni.
// Felezes az analyticPower-en, nem kulon kozelito keplet — igy a ketto nem
// terhet el egymastol. A felso hatar +500%, de legfeljebb annyi, hogy a B ag
// aranya 1 alatt maradjon.
export function mde(baseRate: number, nPerArm: number, alpha: number, power: number): number {
  let lo = 0;
  let hi = Math.min(5, 1 / baseRate - 1);
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (analyticPower(baseRate, mid, nPerArm, alpha) < power) lo = mid;
    else hi = mid;
  }
  return hi;
}

// ---- a szimulacio --------------------------------------------------------

export interface ExperimentParams {
  sessionsPerArmPerDay: number;
  baseRate: number;
  lift: number;      // 0 = A/A teszt
  days: number;
  alpha: number;
}

export interface SimulationResult {
  runs: number;
  finalRate: number;       // a futasok hanyada, ami az utolso napon szignifikans
  peekRate: number;        // a futasok hanyada, ami BARMELYIK napon szignifikans volt
  firstCross: number[];    // days hosszu: hany futas lepte at eloszor a hatart az adott napon
  paths: number[][];       // az elso PATHS_KEPT futas z-erteke naprol napra (az abrahoz)
}

export const PATHS_KEPT = 60;

export function simulate(params: ExperimentParams, runs: number, seed: number): SimulationResult {
  const { sessionsPerArmPerDay: n, baseRate, lift, days, alpha } = params;
  const rng = makeRng(seed);
  const rateB = baseRate * (1 + lift);
  const firstCross = new Array<number>(days).fill(0);
  const paths: number[][] = [];
  let finalHits = 0;
  let peekHits = 0;

  for (let r = 0; r < runs; r++) {
    const path = r < PATHS_KEPT ? new Array<number>(days) : null;
    let xa = 0;
    let xb = 0;
    let crossed = false;
    let lastP = 1;
    for (let d = 0; d < days; d++) {
      xa += binomial(rng, n, baseRate);
      xb += binomial(rng, n, rateB);
      const nCum = n * (d + 1);
      const { z, p } = zTest(xa, nCum, xb, nCum);
      if (path) path[d] = z;
      if (p < alpha && !crossed) {
        crossed = true;
        firstCross[d]++;
      }
      lastP = p;
    }
    if (crossed) peekHits++;
    if (lastP < alpha) finalHits++;
    if (path) paths.push(path);
  }

  return { runs, finalRate: finalHits / runs, peekRate: peekHits / runs, firstCross, paths };
}
