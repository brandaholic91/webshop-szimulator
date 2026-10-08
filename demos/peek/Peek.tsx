import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import Page from '../../components/Page';
import Readout from '../../components/Readout';
import Fold from '../../components/Fold';
import PathsChart from './PathsChart';
import PeekingCurve from './PeekingCurve';
import PowerCurve from './PowerCurve';
import { usePeekData } from './usePeekData';
import { dec, int, pct } from './format';
import {
  PATHS_KEPT, analyticPower, expectedZ, mde, normInv, sampleSizePerArm, simulate,
} from './model';

// Rogzitett beallitasok — nem csuszkak. A szignifikanciaszint es az ero
// celerteke a szakma szokasos ertekei; a futasszam az abra es a sebesseg
// kozti kompromisszum.
const ALPHA = 0.05;
const POWER_TARGET = 0.8;
const RUNS = 1000;
const SEED = 20261006;

const SESSIONS = { min: 200, max: 10000, step: 1 };
const DAYS = { min: 7, max: 90, default: 28 };
// A hatas legalabb +1%: 0-nal a 2. blokk allitasa ("a B ag tenyleg jobb") nem igaz.
const LIFT_PCT = { min: 1, max: 50, default: 25 };

const Peek: React.FC = () => {
  const { data, error } = usePeekData();
  // null = a bolt valodi forgalma; a csuszka elmozdithatja.
  const [sessions, setSessions] = useState<number | null>(null);
  const [days, setDays] = useState(DAYS.default);
  const [liftPct, setLiftPct] = useState(LIFT_PCT.default);
  const [seed, setSeed] = useState(SEED);

  const aktualisSessions = sessions ?? data?.sessionsPerDay ?? SESSIONS.min;

  // A szimulacio a halasztott ertekeken fut: csuszkahuzas kozben a felirat
  // azonnal frissul, a ket ezres futas pedig akkor, amikor a bongeszo raer.
  const dSessions = useDeferredValue(aktualisSessions);
  const dDays = useDeferredValue(days);
  const dLift = useDeferredValue(liftPct) / 100;
  const baseRate = data?.baseRate ?? 0;
  const perArm = Math.floor(dSessions / 2);

  const aa = useMemo(
    () => simulate({ sessionsPerArmPerDay: perArm, baseRate, lift: 0, days: dDays, alpha: ALPHA }, RUNS, seed),
    [perArm, baseRate, dDays, seed],
  );
  const real = useMemo(
    () => simulate({ sessionsPerArmPerDay: perArm, baseRate, lift: dLift, days: dDays, alpha: ALPHA }, RUNS, seed),
    [perArm, baseRate, dLift, dDays, seed],
  );
  const powerByDay = useMemo(
    () => Array.from({ length: DAYS.max }, (_, d) => analyticPower(baseRate, dLift, perArm * (d + 1), ALPHA)),
    [baseRate, dLift, perArm],
  );

  // Kepernyoolvasonak: az "Uj 1000 futas" gomb utan kimondjuk az uj eredmenyt.
  // Csak a seed valtozasara fut — csuszkahuzas kozben nem beszel.
  const [announce, setAnnounce] = useState('');
  useEffect(() => {
    if (seed === SEED) return;
    setAnnounce(`Új ${int(RUNS)} futás kész: naponta ránézve ${pct(aa.peekRate)} a téves ` +
      `riasztás, valódi hatásnál ${pct(real.finalRate)} a szimulált erő.`);
  }, [seed]);

  if (error) {
    return (
      <Page className="pb-16">
        <div className="g12 border-t border-border pt-8">
          <p className="c12 t-body prose-col text-on-surface-muted">
            A bolt adatai nem tölthetők be ({error}). A <code>public/data/</code> alatt
            hiányzik a <code>world_outcome.json</code> — futtasd a <code>world/</code> alatt a
            <code> uv run python -m world.truth</code> és a
            <code> uv run python -m world.publish</code> parancsot.
          </p>
        </div>
      </Page>
    );
  }
  if (!data) {
    return (
      <Page className="pb-16">
        <div className="g12 border-t border-border pt-8">
          <p className="c12 t-body text-on-surface-subtle">Betöltés…</p>
        </div>
      </Page>
    );
  }

  const zCrit = normInv(1 - ALPHA / 2);
  const nTotal = perArm * dDays;
  const truthAA = Array.from({ length: dDays }, () => 0);
  const truthReal = Array.from({ length: dDays }, (_, d) => expectedZ(baseRate, dLift, perArm * (d + 1)));
  const power = powerByDay[dDays - 1];
  const mdeNow = mde(baseRate, nTotal, ALPHA, POWER_TARGET);
  const daysNeeded = Math.ceil(sampleSizePerArm(baseRate, dLift, ALPHA, POWER_TARGET) / perArm);

  return (
    <>
      {/* ---- mi ez a lap ---- */}
      <Page className="pb-10">
        <div className="g12 border-t border-border pt-8">
          <div className="c3 pr-8">
            <div className="t-label-sm text-on-surface-subtle">Mi ez?</div>
          </div>
          <div className="c9">
            <p className="t-body prose-col text-on-surface-muted">
              Az A/B tesztben a látogatók fele a régi változatot látja (A ág), a másik fele az
              újat (B ág), és a végén az dönt, melyik ágon vásároltak többen. Kis különbség
              véletlenül is kialakul, ezért a statisztika húz egy határt: ami azon túl van, azt
              már nem tekintjük véletlennek, vagyis szignifikáns.
            </p>
            <p className="t-body prose-col mt-3 text-on-surface-muted">
              Ez a lap nem egy tesztet futtat, hanem {int(RUNS)} szimuláltat egyszerre, a kitalált
              bolt forgalmával és vásárlási arányával. Így két dolog megszámolható, ami egyetlen
              tesztből nem látszik:
            </p>
            <ul className="t-body prose-col mt-2 list-disc pl-5 text-on-surface-muted">
              <li>
                Ha a két ág egyforma, a tesztek hányada jelez mégis különbséget, és mennyivel
                több, ha valaki naponta ránéz az eredményre.
              </li>
              <li>Ha a B ág tényleg jobb, a tesztek hányada veszi ezt észre.</li>
            </ul>
          </div>
        </div>
      </Page>

      {/* ---- 1. blokk: leskelodes (A/A teszt, a hatas mindig nulla) ---- */}
      <Page className="pb-6">
        <div className="g12 border-t border-border pt-8">
          <div className="c3 pr-8">
            <div className="t-label-sm text-on-surface-subtle">Mi történik, ha naponta ránézel?</div>
          </div>
          <div className="c9">
            <p className="t-body prose-col text-on-surface-muted">
              Előbb egy próba: mindkét ág ugyanazt a változatot kapja. Ezt A/A tesztnek hívják.
              Valódi különbség így biztosan nincs, tehát minden teszt, amelyik mégis különbséget
              jelez, téved.
            </p>
            <p className="t-body prose-col mt-3 text-on-surface-muted">
              Az első ábrán minden vonal egy teszt útja napról napra: minél messzebb van a
              nullától, annál nagyobb a különbség a két ág között. A két szaggatott vonal a
              döntési határ. A teszt akkor szignifikáns, ha a vonala azon kívül jár; a piros
              pont az első átlépést jelöli.
            </p>
            <p className="t-body prose-col mt-3 text-on-surface-muted">
              Aki naponta ránéz, és az első átlépésnél leállítja a tesztet, az a véletlen
              kilengést is győzelemnek könyveli el. A második ábra azt mutatja, hogy a tesztek
              hányada lépte már át a határt legalább egyszer.
            </p>
          </div>
        </div>
      </Page>

      <Page className="pb-10">
        <div className="g12">
          <div className="c3 pr-8">
            <label className="block">
              <span className="t-label-sm text-on-surface-subtle">Napi forgalom</span>
              <input type="range" min={SESSIONS.min} max={SESSIONS.max} step={SESSIONS.step}
                     value={aktualisSessions}
                     aria-label="Napi forgalom" aria-valuetext={`${int(aktualisSessions)} session`}
                     onChange={e => setSessions(Number(e.target.value))} className="mt-2 w-full max-md:h-10" />
              <span className="t-label-sm tabular-nums text-on-surface">
                {int(aktualisSessions)} session
                <span className="ml-2" style={{ color: 'var(--color-viz-truth)' }}>
                  · a bolt {int(data.sessionsPerDay)}
                </span>
              </span>
            </label>

            <label className="mt-4 block">
              <span className="t-label-sm text-on-surface-subtle">Tesztidő</span>
              <input type="range" min={DAYS.min} max={DAYS.max} step={1} value={days}
                     aria-label="Tesztidő" aria-valuetext={`${days} nap`}
                     onChange={e => setDays(Number(e.target.value))} className="mt-2 w-full max-md:h-10" />
              <span className="t-label-sm tabular-nums text-on-surface">{days} nap</span>
            </label>

            <div className="mt-4 flex flex-col items-start gap-y-2">
              <button type="button" onClick={() => setSessions(null)}
                      className="t-label-sm rounded-sm border border-border px-3 py-2 text-primary max-md:min-h-10">
                Vissza a bolt forgalmára
              </button>
              <button type="button" onClick={() => setSeed(s => s + 1)}
                      className="t-label-sm rounded-sm border border-border px-3 py-2 text-primary max-md:min-h-10">
                Új {int(RUNS)} futás
              </button>
            </div>
            <p className="sr-only" role="status">{announce}</p>

            <p className="t-body prose-col mt-6 text-on-surface-muted">
              A két ág itt <strong>egyforma</strong>: a konverziós ráta mindkettőben{' '}
              {pct(baseRate, 2)}, a szimulált bolt értéke. Ami szignifikánsnak látszik, az mind téves
              riasztás.
            </p>
          </div>

          <div className="c9 max-md:mt-8">
            <div className="t-label-sm text-on-surface-subtle">
              {int(RUNS)} A/A teszt útja naponta mérve · az első {PATHS_KEPT} kirajzolva
            </div>
            <PathsChart paths={aa.paths} zCrit={zCrit} truth={truthAA}
                        truthLabel="igazság: nincs hatás"
                        ariaLabel={`A/A tesztek z-értéke napról napra, a döntési határral: ` +
                          `${dDays} nap alatt a futások ${pct(aa.peekRate)}-a lépte át legalább egyszer`} />
            <div className="t-label-sm mt-6 text-on-surface-subtle">
              Hány teszt jelzett már legalább egyszer hatást
            </div>
            <PeekingCurve firstCross={aa.firstCross} runs={aa.runs} alpha={ALPHA} />
          </div>
        </div>
      </Page>

      <Page className="pb-10">
        <Readout items={[
          { value: pct(ALPHA, 0), label: 'megengedett téves riasztás' },
          { value: pct(aa.finalRate), label: 'téves riasztás, ha csak a végén nézel rá' },
          { value: pct(aa.peekRate), label: 'téves riasztás, ha naponta ránézel' },
          { value: `${dec(aa.peekRate / ALPHA, 1)}×`, label: 'a megengedett ennyiszerese' },
        ]} />
      </Page>

      {/* ---- 2. blokk: ero es MDE (valodi hatassal) ---- */}
      <Page className="pb-6">
        <div className="g12 border-t border-border pt-8">
          <div className="c3 pr-8">
            <div className="t-label-sm text-on-surface-subtle">Észreveszi a teszt a valódi hatást?</div>
          </div>
          <div className="c9">
            <p className="t-body prose-col text-on-surface-muted">
              A másik hiba az ellenkezője: van hatás, de a teszt nem mutatja ki, mert túl kevés
              látogató vett részt benne. A teszt ereje azt mondja meg, hogy a tesztek hányada
              veszi észre a hatást; a szokásos elvárás {pct(POWER_TARGET, 0)}.
            </p>
            <p className="t-body prose-col mt-3 text-on-surface-muted">
              Az első ábra az erőt mutatja a tesztidő függvényében, a pont a beállított
              tesztidő. A második ugyanolyan teszt-utakat rajzol ki, mint fent, de most a B ág
              tényleg jobb, ezért a vonalak a felső határ felé tartanak.
            </p>
          </div>
        </div>
      </Page>

      <Page className="pb-10">
        <div className="g12">
          <div className="c3 pr-8">
            <label className="block">
              <span className="t-label-sm text-on-surface-subtle">Valódi hatás</span>
              <input type="range" min={LIFT_PCT.min} max={LIFT_PCT.max} step={1} value={liftPct}
                     aria-label="Valódi hatás" aria-valuetext={`+${liftPct}% konverzió`}
                     onChange={e => setLiftPct(Number(e.target.value))} className="mt-2 w-full max-md:h-10" />
              <span className="t-label-sm tabular-nums text-on-surface">+{liftPct}% konverzió</span>
            </label>

            <p className="t-body prose-col mt-6 text-on-surface-muted">
              Itt a B ág <strong>tényleg jobb</strong>. A kérdés megfordul: a tesztek hányada veszi
              észre? A forgalom és a tesztidő a fenti csúszkákról jön.
            </p>
          </div>

          <div className="c9 max-md:mt-8">
            <div className="t-label-sm text-on-surface-subtle">
              A teszt ereje a tesztidő függvényében
            </div>
            <PowerCurve power={powerByDay} days={dDays} target={POWER_TARGET} />
            <div className="t-label-sm mt-6 text-on-surface-subtle">
              {int(RUNS)} teszt útja valódi hatással · az első {PATHS_KEPT} kirajzolva
            </div>
            <PathsChart paths={real.paths} zCrit={zCrit} truth={truthReal}
                        truthLabel={`igazság: +${int(dLift * 100)}%`}
                        ariaLabel={`Valódi hatású tesztek z-értéke napról napra, a döntési határral: ` +
                          `+${int(dLift * 100)}% hatásnál a ${dDays}. napon a futások ${pct(real.finalRate)}-a szignifikáns`}
                        markCrossings={false} />
          </div>
        </div>
      </Page>

      <Page className="pb-10">
        <Readout items={[
          { value: pct(real.finalRate), label: `szimulált erő (${int(RUNS)} futás)` },
          { value: pct(power), label: 'erő a képlet szerint' },
          { value: pct(mdeNow), label: `legkisebb kimutatható hatás ${dDays} nap alatt` },
          {
            value: Number.isFinite(daysNeeded) ? `${int(daysNeeded)} nap` : '—',
            label: `ennyi kell +${int(dLift * 100)}% kimutatásához`,
          },
        ]} />
      </Page>

      {/* ---- lecsukott próza ---- */}
      <Page className="pb-16">
        <Fold title="Hogyan számol?">
          <p>
            Minden futás egy A/B teszt. A két ág naponta ugyanannyi sessiont kap, és minden
            session a beállított konverziós rátával lesz rendelés. A nap végén a szimuláció
            kétarányos z-próbát futtat az addig összegyűlt számokon: a két ág konverziós
            rátájának különbségét elosztja azzal a szórással, amit akkor várnánk, ha a két ág
            egyforma lenne. Ha az eredmény abszolút értéke átlépi a {dec(zCrit)}-os határt, a
            teszt „szignifikáns".
          </p>
          <p className="mt-3">
            A p-érték azt mondja meg, milyen gyakran látnál legalább ekkora különbséget pusztán
            véletlenül, ha a két ág valójában egyforma. A {pct(ALPHA, 0)}-os szint ennyi téves
            riasztást enged meg — de csak akkor, ha <strong>egyszer</strong> mérsz, egy előre
            rögzített napon.
          </p>
          <p className="mt-3">
            Ha naponta ránézel, és az első szignifikáns napon megállsz, minden nap új esélyt
            adsz a véletlennek. A felső blokkban a két ág végig egyforma, mégis a futások{' '}
            {pct(aa.peekRate)}-a lépte át a határt valamelyik napon.
          </p>
        </Fold>
        <Fold title="Mikor számít ez élesben?">
          <p>
            A teszt hosszát előre kell rögzíteni, és a döntést a végén kell meghozni. A
            beállított forgalmon ({int(dSessions)} session naponta) {dDays} nap alatt a
            legkisebb hatás, amit egy teszt {pct(POWER_TARGET, 0)} eséllyel észrevesz,{' '}
            {pct(mdeNow)} relatív javulás.
          </p>
          <p className="mt-3">
            Kis forgalmú boltban ezért a legtöbb A/B teszt nem azért nem talál semmit, mert
            nincs hatás, hanem mert a teszt eleve nem tudta volna kimutatni. Ilyenkor a
            „nem szignifikáns" annyit jelent: nem tudjuk.
          </p>
          <p className="mt-3">
            A leskelődésre van gyógymód: szekvenciális tesztelés, előre elosztott hibakerettel.
            Ez az elemzés a hibát mutatja meg, nem a gyógymódot.
          </p>
        </Fold>
        <Fold title="Mi támasztja alá">
          <p>
            A matek a repóban: <code>demos/peek/model.ts</code>, React-mentes, a tesztjei
            mellette (<code>model.test.ts</code>). A z-próba, az erő és a mintaméret képlete
            ismert referenciaértékekre van tesztelve. A szimuláció seedelt: ugyanaz a beállítás
            mindig ugyanazt az eredményt adja.
          </p>
          <p className="mt-3">
            A konverziós ráta és a napi forgalom alapállása a 01.1 elemzés világából jön, nem
            beírt szám. Az igazság itt maga a beállítás: a felső blokkban nulla hatás, az
            alsóban a csúszkán beállított érték.
          </p>
        </Fold>
      </Page>
    </>
  );
};

export default Peek;
