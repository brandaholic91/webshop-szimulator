import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  PATHS_KEPT, analyticPower, binomial, expectedZ, makeRng, mde, normCdf, normInv,
  sampleSizePerArm, simulate, zTest,
} from './model';

// Az elvart ertekek Pythonban szamolt referenciak (a terv Global Constraints
// szekcioja mondja meg, hogyan). Ha egy teszt elbukik, a model.ts-t javitsd,
// ne a hatart lazitsd.

// A bolt alapallasa: 1026 session/nap, agankent 513; 28 nap alatt 14 364.
const SHOP = { sessionsPerArmPerDay: 513, baseRate: 0.0162, days: 28, alpha: 0.05 };
const N_28 = 513 * 28;

describe('normalis eloszlas', () => {
  it('normCdf', () => {
    expect(Math.abs(normCdf(1.96) - 0.9750021)).toBeLessThan(1e-6);
    expect(Math.abs(normCdf(-1) - 0.1586553)).toBeLessThan(1e-6);
    expect(Math.abs(normCdf(0) - 0.5)).toBeLessThan(1e-6);
  });

  it('normInv', () => {
    expect(Math.abs(normInv(0.975) - 1.959964)).toBeLessThan(1e-6);
    expect(Math.abs(normInv(0.8) - 0.841621)).toBeLessThan(1e-6);
    expect(Math.abs(normInv(0.001) - -3.090232)).toBeLessThan(1e-6);
  });
});

describe('zTest', () => {
  it('ismert pelda', () => {
    const { z, p } = zTest(200, 10000, 250, 10000);
    expect(Math.abs(z - 2.383995)).toBeLessThan(1e-5);
    expect(Math.abs(p - 0.017126)).toBeLessThan(1e-5);
  });

  it('ha nincs szoras, nincs dontes', () => {
    expect(zTest(0, 100, 0, 100)).toEqual({ z: 0, p: 1 });
    expect(zTest(100, 100, 100, 100)).toEqual({ z: 0, p: 1 });
  });
});

describe('ero, mintameret, MDE', () => {
  it('sampleSizePerArm', () => {
    expect(Math.abs(sampleSizePerArm(0.02, 0.1, 0.05, 0.8) - 80682)).toBeLessThanOrEqual(1);
    expect(Math.abs(sampleSizePerArm(0.0162, 0.1, 0.05, 0.8) - 100013)).toBeLessThanOrEqual(1);
  });

  it('sampleSizePerArm nulla hatasnal vegtelen', () => {
    expect(sampleSizePerArm(0.0162, 0, 0.05, 0.8)).toBe(Infinity);
  });

  it('analyticPower', () => {
    expect(Math.abs(analyticPower(0.02, 0.1, 50000, 0.05) - 0.59698)).toBeLessThan(1e-3);
    expect(Math.abs(analyticPower(0.0162, 0.25, N_28, 0.05) - 0.72774)).toBeLessThan(1e-3);
  });

  it('nulla hatasnal az ero maga az alpha', () => {
    expect(Math.abs(analyticPower(0.02, 0, 50000, 0.05) - 0.05)).toBeLessThan(1e-6);
  });

  it('mde a bolt forgalman', () => {
    expect(Math.abs(mde(0.0162, N_28, 0.05, 0.8) - 0.2744)).toBeLessThan(1e-3);
  });

  it('az mde-nel az ero pontosan a celertek', () => {
    for (const n of [700, N_28, 450000]) {
      const lift = mde(0.0162, n, 0.05, 0.8);
      expect(Math.abs(analyticPower(0.0162, lift, n, 0.05) - 0.8)).toBeLessThan(1e-6);
    }
  });

  it('expectedZ', () => {
    expect(expectedZ(0.0162, 0, N_28)).toBe(0);
    expect(Math.abs(expectedZ(0.0162, 0.25, N_28) - 2.565890)).toBeLessThan(1e-5);
  });
});

describe('veletlen', () => {
  it('ugyanaz a seed ugyanazt a sorozatot adja', () => {
    const a = makeRng(7);
    const b = makeRng(7);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it('mas seed mas sorozatot ad', () => {
    const a = makeRng(7);
    const b = makeRng(8);
    const va = Array.from({ length: 10 }, () => a());
    const vb = Array.from({ length: 10 }, () => b());
    expect(va).not.toEqual(vb);
  });

  it('a kimenet [0, 1) tartomanyban van', () => {
    const rng = makeRng(1);
    for (let i = 0; i < 10000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  const moments = (n: number, p: number) => {
    const rng = makeRng(11);
    const draws = Array.from({ length: 20000 }, () => binomial(rng, n, p));
    const mean = draws.reduce((s, v) => s + v, 0) / draws.length;
    const variance = draws.reduce((s, v) => s + (v - mean) ** 2, 0) / draws.length;
    return { mean, variance, draws };
  };

  it('binomial, inverzios ag', () => {
    const { mean, variance, draws } = moments(500, 0.0162);
    expect(Math.abs(mean - 8.1)).toBeLessThan(0.1);
    expect(Math.abs(variance - 7.969) / 7.969).toBeLessThan(0.1);
    expect(draws.every(Number.isInteger)).toBe(true);
  });

  it('binomial, normalis kozelites aga', () => {
    const { mean, variance, draws } = moments(100000, 0.02);
    expect(Math.abs(mean - 2000)).toBeLessThan(2);
    expect(Math.abs(variance - 1960) / 1960).toBeLessThan(0.1);
    expect(draws.every(Number.isInteger)).toBe(true);
  });

  it('binomial szelso esetei', () => {
    const rng = makeRng(3);
    expect(binomial(rng, 0, 0.5)).toBe(0);
    expect(binomial(rng, 100, 0)).toBe(0);
    expect(binomial(rng, 100, 1)).toBe(100);
  });
});

describe('simulate', () => {
  const aa = simulate({ ...SHOP, lift: 0 }, 2000, 42);

  it('megismetelheto', () => {
    expect(simulate({ ...SHOP, lift: 0 }, 2000, 42)).toEqual(aa);
  });

  it('mas seed mas eredmenyt ad', () => {
    expect(simulate({ ...SHOP, lift: 0 }, 2000, 43).paths).not.toEqual(aa.paths);
  });

  it('A/A: a vegen merve a hibaarany a nevleges 5% korul van', () => {
    expect(aa.finalRate).toBeGreaterThan(0.03);
    expect(aa.finalRate).toBeLessThan(0.07);
  });

  it('A/A: naponta lesve a hibaarany a tobbszorose', () => {
    expect(aa.peekRate).toBeGreaterThan(0.2);
    expect(aa.peekRate).toBeLessThan(0.35);
    expect(aa.peekRate).toBeGreaterThanOrEqual(aa.finalRate);
  });

  it('a firstCross osszege a lesve szignifikans futasok szama', () => {
    expect(aa.firstCross).toHaveLength(28);
    expect(aa.firstCross.reduce((s, v) => s + v, 0)).toBe(Math.round(aa.peekRate * aa.runs));
  });

  it('a paths az elso 60 futas teljes utja', () => {
    expect(aa.paths).toHaveLength(PATHS_KEPT);
    expect(aa.paths.every(p => p.length === 28 && p.every(Number.isFinite))).toBe(true);
  });

  it('kevesebb futasnal a paths is rovidebb', () => {
    expect(simulate({ ...SHOP, lift: 0 }, 10, 1).paths).toHaveLength(10);
  });

  it('valodi hatasnal a szimulalt ero a keplet kozeleben van', () => {
    const real = simulate({ ...SHOP, lift: 0.25 }, 2000, 42);
    const expected = analyticPower(0.0162, 0.25, N_28, 0.05);
    expect(Math.abs(real.finalRate - expected)).toBeLessThan(0.04);
  });
});

describe('orok', () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  const read = (name: string) => readFileSync(join(dir, name), 'utf-8');

  it('a model.ts UI- es bongeszofuggetlen', () => {
    const src = read('model.ts');
    expect(src).not.toMatch(/\bimport\b/);
    expect(src).not.toMatch(/\b(window|document|fetch|localStorage|Date)\b/);
    expect(src).not.toMatch(/Math\.random/);
  });

  it('a muszer egyik fajlja sem nevezi meg a vilag igazsag-fajljat', () => {
    // A keresett fajlnev ket darabbol all ossze: kulonben ez a tesztfajl maga
    // bukna el a world/tests/test_publish.py repo-szintu ellenorzesen.
    const forbidden = ['truth', 'json'].join('.');
    for (const name of readdirSync(dir)) {
      expect(read(name), name).not.toContain(forbidden);
    }
  });
});
