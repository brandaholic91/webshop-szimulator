import React, { useState } from 'react';
import Page from '../../components/Page';
import Readout from '../../components/Readout';
import Fold from '../../components/Fold';
import RecoveryCharts from './RecoveryCharts';
import ConfusionMatrix from './ConfusionMatrix';
import { useSegmentsData } from './useSegmentsData';
import {
  DEFAULT_FEATURE_SET, FEATURE_SETS, FEATURE_SET_TITLE, dec1, dec3, ft, int, kData, kNal, pct, profileRows,
  selectionRows,
} from './view';
import type { FeatureSet, SegmentsData, SegmentsFile } from './view';

// Mobilon (max-md) a tablaknak 341 px-en kell elfernie: szukebb cellakoz, az
// utolso oszlop utan semmi, a szam nem torik (az attribution tablainak mintaja).
const TH = 't-label-sm border-b border-border-strong py-2 pr-4 font-medium text-on-surface-subtle ' +
  'max-md:pr-1.5 max-md:tracking-normal max-md:last:pr-0';
const TD = 'border-b border-border py-2 pr-4 max-md:pr-1.5 max-md:last:pr-0';
const NUM = `${TD} whitespace-nowrap text-right`;
// A jellemzokeszlet neve mondat kozepen (a kapcsolo cimkeje nem ragozhato).
const SET_PHRASE: Record<FeatureSet, string> = {
  value: 'az öt értékjellemző',
  all: 'mind a tizenkét jellemző',
};

const Tables: React.FC<{ data: SegmentsData; k: number }> = ({ data, k }) => {
  const profil = profileRows(data, k);
  const szelekcio = selectionRows(data);
  return (
    <Page className="pb-10">
      <div className="g12 border-t border-border pt-8">
        <div className="c3 pr-8">
          <div className="t-label-sm text-on-surface-subtle">Mit nevezne az elemző a klasztereknek?</div>
          <p className="t-body prose-col mt-2 text-on-surface-muted">
            Az első tábla a modell kimenete {kNal(k)}: a klaszterek mérete, kosárértéke,
            vásárlási és látogatási gyakorisága, és a legnagyobb csatornájuk. Ezekből adna nevet
            az elemző a csoportoknak. A nevek nem a világ nevei.
          </p>
          <p className="t-body prose-col mt-3 text-on-surface-muted">
            A második tábla nem függ k-tól: a négy típus aránya mindenki közt és az azonosított
            vevők közt. Aki nem vásárolt, az nincs a vevőbázisban, és a típusok aránya ettől
            eltolódik.
          </p>
        </div>

        <div className="c9 min-w-0 max-md:mt-8">
          <div className="overflow-x-auto">
            <table className="t-body w-full border-collapse tabular-nums">
              <caption className="t-label-sm pb-2 text-left text-on-surface-subtle">
                A klaszterek profilja {kNal(k)} (a modell kimenete)
              </caption>
              <thead>
                <tr>
                  <th scope="col" aria-label="Klaszter" className={`${TH} text-left`}>
                    <span className="max-md:hidden">Klaszter</span><span className="md:hidden">K</span>
                  </th>
                  <th scope="col" className={`${TH} text-right`}>Vevő</th>
                  <th scope="col" aria-label="Kosárérték" className={`${TH} text-right`}>
                    <span className="max-md:hidden">Kosárérték</span><span className="md:hidden">Kosár</span>
                  </th>
                  <th scope="col" aria-label="Rendelés vevőnként" className={`${TH} text-right`}>
                    <span className="max-md:hidden">Rend./vevő</span><span className="md:hidden">Rend.</span>
                  </th>
                  <th scope="col" aria-label="Session vevőnként" className={`${TH} text-right`}>
                    <span className="max-md:hidden">Sess./vevő</span><span className="md:hidden">Sess.</span>
                  </th>
                  <th scope="col" aria-label="Legnagyobb csatorna" className={`${TH} text-right`}>
                    <span className="max-md:hidden">Legnagyobb csatorna</span><span className="md:hidden">Csatorna</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {profil.map(r => (
                  <tr key={r.label}>
                    <th scope="row" className={`${TD} text-left font-normal`}>{r.label}</th>
                    <td className={NUM}>{int(r.customers)} <span className="text-on-surface-subtle max-md:hidden">({pct(r.share, 0)})</span></td>
                    <td className={NUM}>{ft(Math.round(r.aovHuf))}</td>
                    <td className={NUM}>{dec1(r.ordersPerCustomer)}</td>
                    <td className={NUM}>{dec1(r.sessionsPerCustomer)}</td>
                    <td className={`${TD} text-right md:whitespace-nowrap`}>{r.topChannel.title} <span className="text-on-surface-subtle max-md:hidden">{pct(r.topChannel.share, 0)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-8 overflow-x-auto">
            <table className="t-body w-full border-collapse tabular-nums">
              <caption className="t-label-sm pb-2 text-left text-on-surface-subtle">
                A négy típus aránya (igazság): a szelekció
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={`${TH} text-left`}>Típus</th>
                  <th scope="col" className={`${TH} text-right`}>Mindenki közt</th>
                  <th scope="col" className={`${TH} text-right text-on-surface`}>Az azonosított vevők közt</th>
                </tr>
              </thead>
              <tbody>
                {szelekcio.map(r => (
                  <tr key={r.slug}>
                    <th scope="row" className={`${TD} text-left font-normal`}>{r.title}</th>
                    <td className={NUM}>{pct(r.all, 1)}</td>
                    <td className={`${NUM} font-semibold text-on-surface`}>{pct(r.clustered, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Page>
  );
};

// A ket keszlet ARI-ja a vilagba irt negy csoportnal; null, ha a 4 nincs a k-k kozt.
const negyNel = (file: SegmentsFile) =>
  file.sets.all.ks.includes(4)
    ? { ertek: kData(file.sets.value, 4), mind: kData(file.sets.all, 4) }
    : null;

// A szovegek az alapallas (default_k) es a vilagba irt 4 szamaibol dolgoznak,
// nem a kapcsolo allasabol: a lecsukott blokk ne irodjon at olvasas kozben.
const Folds: React.FC<{ file: SegmentsFile }> = ({ file }) => {
  const ertek = file.sets.value;
  const data = file.sets.all;
  const d0 = kData(data, data.default_k);
  return (
    <Page className="pb-16">
      <Fold title="Hogyan számol?">
        <p>
          A modell a Mérés (01.2) pipeline-jának azonosított vevőit kapja: azokat a személyeket,
          akikhez vásárlás köt egy eszközt. Ez {int(data.customers)} vevő. Aki nem vásárolt, az
          eszköz-szintű személy kosárérték nélkül, és kimarad; egy webshop a vevőbázisát
          szegmentálja, nem a látogatóit.
        </p>
        <p className="mt-3">
          Két jellemzőkészlet van, mindkettő standardizálva. Az első öt értékjellemző: a
          rendelések száma, az átlagos kosárérték és az összes bevétel (logaritmusban), és a
          napok az utolsó és az első rendelés óta. A második tizenkettő: ugyanez, mellé a
          látogatások száma (logaritmusban) és a hat csatorna aránya a látogatásokban.
        </p>
        <p className="mt-3">
          A két készlet előre rögzült, és nem lett az eredményhez igazítva. A világ viszont
          igen: úgy írtam át, hogy a típusok egy része értékben közel álljon egymáshoz, a
          csatornáiban pedig eltérjen. A lap ezt a különbséget méri, nem fedezi fel.
        </p>
        <p className="mt-3">
          A k-means k középpontot keres úgy, hogy minden vevő a legközelebbihez tartozzon, és a
          távolságok négyzetösszege a legkisebb legyen. Tíz véletlen indításból a legjobb marad
          (k-means++ indítás, rögzített seed). A <strong>silhouette</strong> azt méri, mennyire
          ül mindenki a saját csoportjában a legközelebbi másikhoz képest; ehhez nem kell
          igazság, ezért ezzel választ k-t az elemző. A tizenkét jellemzőn {kNal(data.default_k)}{' '}
          tetőzik ({dec3(d0.silhouette)}), az öt értékjellemzőn {kNal(ertek.default_k)}.
        </p>
        <p className="mt-3">
          Az <strong>ARI</strong> (adjusted Rand index) a klasztereket az igazsághoz méri a
          vevőpárok szintjén: 1 a tökéletes visszanyerés, 0 a véletlen. A klaszterek neve nem
          számít, ezért nem kell őket a típusokhoz párosítani. A <strong>felső határ</strong>{' '}
          egy olyan osztályozó ARI-ja, ami ismeri a négy típus középpontját ugyanezekből a
          jellemzőkből, és minden vevőt a legközelebbihez sorol. A tizenkét jellemzőn{' '}
          {dec3(data.ceiling.ari)} (a vevők {pct(data.ceiling.accuracy, 0)}-át találja el), az
          öt értékjellemzőn {dec3(ertek.ceiling.ari)} ({pct(ertek.ceiling.accuracy, 0)}). Ez
          viszonyítási pont, nem matematikai korlát: azt mutatja, mennyire válnak szét a
          típusok ezekben a jellemzőkben, ha a címkék ismertek volnának.
        </p>
        <p className="mt-3">
          A böngésző itt nem becsül. Mind a {data.ks.length} k eredménye mindkét készleten előre
          kiszámolva érkezik, a gombsorok csak választanak közülük.
        </p>
      </Fold>

      <Fold title="Mikor számít ez élesben?">
        <p>
          Élesben nincs igazság-sor és nincs felső határ: senki nem tudja, hány típus van, és ki
          melyikbe tartozik. A szegmensek az elemző döntései, nem felfedezések. A silhouette
          segít a k választásában, de garanciát nem ad: a tizenkét jellemzőn{' '}
          {kNal(data.default_k)} tetőzik, az öt értékjellemzőn {kNal(ertek.default_k)}; a világba
          írt típusok száma négy.
        </p>
        <p className="mt-3">
          Ebben a világban a jellemzők választása többet számít, mint a k-é. Ami a megmutatott
          jellemzőkben átfed, azt egy klaszterező nem tudja szétválasztani, akárhány csoportot
          kér tőle az elemző.
        </p>
        <p className="mt-3">
          A vevőbázis nem a piac. Aki nem vásárolt, az nincs a vevők közt, ezért
          a típusok aránya a vevők közt más, mint mindenki közt (a szelekció-tábla). Egy
          szegmentáció a vevőkről szól, és ezt a torzítást hordozza.
        </p>
        <p className="mt-3">
          A mérés a történetet is csonkítja: az összefűzés csak azt az eszközt köti a vevőhöz,
          amelyikről vásárolt, a másik eszköz látogatásai hiányoznak a látogatásszámból és a
          csatorna-mixből. A modell rövidebb történetből dolgozik, mint ami történt.
        </p>
        <p className="mt-3">
          Ez egy futás, egy seed. Más indításból vagy más replikából más klaszterek jöhetnek; a
          klaszterezés zaját a lap nem méri. Ebben a világban nincs termék, tehát nincs
          termék-affinitás sem: a jellemzők csak a vásárlás és a látogatás mintázatai.
        </p>
      </Fold>

      <Fold title="Mi támasztja alá">
        <p>
          A vevőket a <code>world/src/world/customers.py</code> olvassa a pipeline-ból, a
          k-means és a silhouette a <code>world/src/world/models/segments.py</code>-ban van, a
          futtató a <code>world/src/world/segments.py</code>. A két első fájl kódja nem
          hivatkozhat az igazságot olvasó modulra; ezt teszt őrzi.
        </p>
        <p className="mt-3">
          A k-means jól elváló szintetikus csomókon hibátlanul visszaadja a csoportokat, és az
          inerciája k = 2…8-ra 1%-on belül egyezik a scikit-learn implementációjával; a
          silhouette és az ARI ugyanazon a mintán a scikit-learn számával egyezik. A
          scikit-learn csak a tesztekben fut, a szállított kód nem függ tőle.
        </p>
        <p className="mt-3">
          A futtató nem ír fájlt, ha az adatbázis vevőinek és rendeléseinek száma vagy összege
          nem egyezik a Mérés (01.2) főkönyvével.
        </p>
        <p className="mt-3">
          Amit ez a lap nem állít: hogy a k-means rossz, hogy több klaszter jobb, vagy hogy
          bármelyik eljárás általában visszanyerné a típusokat. Csak azt, amit ez a világ mér.
        </p>
      </Fold>
    </Page>
  );
};

// A Szegmensek muszer (01.5): k-means a vevokon, az igazsag negy tipusahoz merve.
const Segments: React.FC = () => {
  const { data: file, error } = useSegmentsData();
  // null = az adatfajl alapallasa (a keszlet default_k-ja, a silhouette valasztasa)
  const [chosen, setChosen] = useState<number | null>(null);
  const [set, setSet] = useState<FeatureSet>(DEFAULT_FEATURE_SET);

  if (error) {
    return (
      <Page className="pb-16">
        <div className="g12 border-t border-border pt-8">
          <p className="c12 t-body prose-col text-on-surface-muted">
            A szegmensek adata nem tölthető be ({error}). A <code>public/data/</code> alatt
            a <code>segments.json</code> kell: a <code>world/</code> alatt a{' '}
            <code>uv run python -m world.segments</code> írja meg, és a{' '}
            <code>uv run python -m world.publish</code> másolja oda.
          </p>
        </div>
      </Page>
    );
  }
  if (!file) {
    return (
      <Page className="pb-16">
        <div className="g12 border-t border-border pt-8">
          <p className="c12 t-body text-on-surface-subtle">Betöltés…</p>
        </div>
      </Page>
    );
  }

  const data = file.sets[set];
  const k = chosen ?? data.default_k;
  const d = kData(data, k);
  const negy = negyNel(file);

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
              A bolt vásárlói négy típusból állnak: ezt A bolt (01.1) világába írtam, és minden
              vásárlónál tudom, melyikbe tartozik. Egy valódi webshop ezt nem tudja. A vevőit a
              viselkedésük alapján csoportokra osztja, és a csoportoknak utólag ad nevet.
            </p>
            <p className="t-body prose-col mt-3 text-on-surface-muted">
              Ez a lap egy elterjedt ilyen eljárást, a k-means klaszterezést futtatja a
              Mérés (01.2) pipeline-jából kiolvasott vevőkön, és azt méri, mennyit talál vissza
              a négy típusból. Két dolgot a gép nem tud, ezeket az elemző dönti el: mely
              jellemzőket mutatja meg a modellnek, és hány csoportot (k) kér tőle. Itt mindkettőt
              te választod, az igazság közben nem mozdul.
            </p>
          </div>
        </div>
      </Page>

      {/* ---- mit talal a gep ---- */}
      <Page className="pb-6">
        <div className="g12 border-t border-border pt-8">
          <div className="c3 pr-8">
            <div className="t-label-sm text-on-surface-subtle">Mit talál a gép?</div>
          </div>
          <div className="c9">
            <p className="t-body prose-col tabular-nums text-on-surface-muted">
              Az azonosított {int(data.customers)} vevőt {SET_PHRASE[set]} alapján
              k = {k} csoportra osztva a visszanyerés (ARI) {dec3(d.ari)}. A sötét vonal a felső határ, {dec3(data.ceiling.ari)}: ennyit
              érne el egy osztályozó, ami ismerné a címkéket, ugyanezekből a jellemzőkből. A
              silhouette, amivel az elemző igazság nélkül választ k-t, {kNal(data.default_k)}{' '}
              tetőzik.
            </p>
            {negy && (
              <p className="t-body prose-col mt-3 tabular-nums text-on-surface-muted">
                A világba írt négy csoportnál az öt értékjellemzővel az ARI {dec3(negy.ertek.ari)},
                a tizenkettővel {dec3(negy.mind.ari)}. Ugyanaz az algoritmus, ugyanazok a vevők: a
                típusok értékben átfednek, a látogatásaikban viszont szétválnak (a felső határ{' '}
                {dec3(file.sets.value.ceiling.ari)}, illetve {dec3(file.sets.all.ceiling.ari)}). Hogy
                melyik jellemző választja szét őket, azt az elemző nem tudja előre. Válts lent a két
                készlet között, és nézd meg, hova kerülnek a típusok.
              </p>
            )}
          </div>
        </div>
      </Page>

      <Page className="pb-10">
        <div className="g12">
          <div className="c3 pr-8">
            <div className="t-label-sm text-on-surface-subtle">Mit lát a modell?</div>
            <div className="mt-2 flex flex-wrap gap-1 max-md:grid max-md:grid-cols-1">
              {FEATURE_SETS.map(s => (
                <button key={s} type="button" onClick={() => setSet(s)}
                        aria-pressed={s === set}
                        className={`t-label-sm rounded-sm border px-3 py-2 text-left max-md:min-h-10 ${
                          s === set ? 'border-border-strong bg-surface-sunken' : 'border-border'}`}>
                  {FEATURE_SET_TITLE[s]}
                </button>
              ))}
            </div>
            <p className="t-body prose-col mt-3 mb-6 text-on-surface-muted">
              Ugyanaz az eljárás, ugyanazok a vevők; csak az változik, mit mutatunk meg a
              modellnek. Az első készlet a vásárlások értéke és ideje, a második ehhez
              hozzáveszi, honnan jöttek a látogatások.
            </p>
            <div className="t-label-sm text-on-surface-subtle">Klaszterszám (k)</div>
            <div className="mt-2 flex flex-wrap gap-1 max-md:grid max-md:grid-cols-7">
              {data.ks.map(kk => (
                <button key={kk} type="button" onClick={() => setChosen(kk)}
                        aria-pressed={kk === k}
                        className={`t-label-sm rounded-sm border px-3 py-2 tabular-nums max-md:min-h-10 max-md:px-1 ${
                          kk === k ? 'border-border-strong bg-surface-sunken' : 'border-border'}`}>
                  {kk}
                </button>
              ))}
            </div>
            <p className="t-body prose-col mt-6 text-on-surface-muted">
              Ennyi csoportra osztja a k-means a vevőket. A számot az elemző választja; a lap
              azzal nyit, amit a silhouette választana (k = {data.default_k}). A világba írt
              típusok száma négy.
            </p>
          </div>

          <div className="c9 max-md:mt-8">
            <RecoveryCharts data={data} k={k} onPick={setChosen} />
          </div>
        </div>
      </Page>

      {/* ---- a konfuzios matrix ---- */}
      <Page className="pb-10">
        <div className="g12 border-t border-border pt-8">
          <div className="c3 pr-8">
            <div className="t-label-sm text-on-surface-subtle">Hova kerültek a típusok?</div>
            <p className="t-body prose-col mt-2 text-on-surface-muted">
              Soronként egy típus (igazság), oszloponként egy klaszter. Ha a gép visszanyerné a
              típusokat, minden sorban egy cella volna sötét. Ahol két típus ugyanabba a
              klaszterbe ömlik, ott a viselkedésük nem válik szét.
            </p>
          </div>
          <div className="c9 min-w-0 max-md:mt-8">
            <ConfusionMatrix data={data} k={k} />
          </div>
        </div>
      </Page>

      <Page className="pb-10">
        <Readout items={[
          { value: dec3(d.ari), label: `ARI ${kNal(k)}: visszanyerés az igazsághoz mérve` },
          { value: dec3(d.silhouette), label: `silhouette ${kNal(k)}: amit az elemző lát` },
          { value: dec3(data.ceiling.ari), label: 'felső határ (igazság): ha a címkék ismertek volnának' },
          { value: String(data.default_k), label: 'a silhouette választása (k)' },
        ]} />
      </Page>

      <Tables data={data} k={k} />
      <Folds file={file} />
    </>
  );
};

export default Segments;
