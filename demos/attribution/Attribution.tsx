import React, { useEffect, useState } from 'react';
import Page from '../../components/Page';
import Readout from '../../components/Readout';
import Fold from '../../components/Fold';
import ModelBars from './ModelBars';
import { useAttributionData } from './useAttributionData';
import {
  MODEL_LABEL, MODEL_SHORT, chartGroups, chartLabel, ft, int, modelErrors, pct, pp, roasFmt, shareMax,
  signedPp, tableRows, windowData,
} from './view';
import type { AttributionData } from './view';

// Mobilon (max-md) a hat oszlopnak 341 px-en kell elfernie vizszintes gorgetes
// nelkul: szukebb cellakoz, az utolso oszlop utan semmi, a fejlecben kisebb
// betukoz, a szam nem torik.
const TH = 't-label-sm border-b border-border-strong py-2 pr-4 font-medium text-on-surface-subtle ' +
  'max-md:pr-1.5 max-md:tracking-normal max-md:last:pr-0';
const TD = 'border-b border-border py-2 pr-4 max-md:pr-1.5 max-md:last:pr-0';
const NUM = `${TD} whitespace-nowrap text-right`;

const Tables: React.FC<{ data: AttributionData; lookback: number }> = ({ data, lookback }) => {
  const rows = tableRows(data, lookback);
  const head = (
    <thead>
      <tr>
        <th scope="col" className={`${TH} text-left`}>Csatorna</th>
        {data.models.map(m => (
          <th key={m} scope="col" className={`${TH} text-right`}>
            <span className="max-md:hidden">{MODEL_LABEL[m]}</span>
            {/* mobilon az abra jelmagyarazatanak rovid cimkeje all itt */}
            <abbr title={MODEL_LABEL[m]} className="no-underline md:hidden">{MODEL_SHORT[m]}</abbr>
          </th>
        ))}
        <th scope="col" className={`${TH} text-right text-on-surface`}>Igazság</th>
      </tr>
    </thead>
  );

  return (
    <Page className="pb-10">
      <div className="g12 border-t border-border pt-8">
        <div className="c3 pr-8">
          <div className="t-label-sm text-on-surface-subtle">Mind a hat csatorna</div>
          <p className="t-body prose-col mt-2 text-on-surface-muted">
            A {lookback} napos ablak számai, a nem fizetett csatornákkal együtt. Az első tábla a
            bevétel arányát mutatja, a második azt, mennyi bevétel jut 1 Ft költésre (ROAS).
            Igazsága csak a három fizetett csatornának van: a nem fizetetteknek nincs költése,
            amit nullázni lehetne.
          </p>
        </div>

        <div className="c9 min-w-0 max-md:mt-8">
          <div className="overflow-x-auto">
            <table className="t-body w-full border-collapse tabular-nums">
              <caption className="t-label-sm pb-2 text-left text-on-surface-subtle">
                A bevétel aránya
              </caption>
              {head}
              <tbody>
                {rows.map(r => (
                  <tr key={r.slug}>
                    <th scope="row" className={`${TD} text-left font-normal`}>{r.title}</th>
                    {r.share.map((v, i) => (
                      <td key={data.models[i]} className={NUM}>{pct(v)}</td>
                    ))}
                    <td className={`${NUM} font-semibold text-on-surface`}>
                      {r.truthShare === null ? '' : pct(r.truthShare)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-8 overflow-x-auto">
            <table className="t-body w-full border-collapse tabular-nums">
              <caption className="t-label-sm pb-2 text-left text-on-surface-subtle">
                ROAS, a bolt teljes bevételével számolva
              </caption>
              {head}
              <tbody>
                {rows.filter(r => r.roas !== null).map(r => (
                  <tr key={r.slug}>
                    <th scope="row" className={`${TD} text-left font-normal`}>{r.title}</th>
                    {(r.roas ?? []).map((v, i) => (
                      <td key={data.models[i]} className={NUM}>{roasFmt(v)}</td>
                    ))}
                    <td className={`${NUM} font-semibold text-on-surface`}>
                      {r.truthRoas === null ? '' : roasFmt(r.truthRoas)}
                    </td>
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

// A szovegek az alapallas (default_window) szamaibol dolgoznak, nem a
// kapcsolo allasabol: a lecsukott blokk ne irodjon at olvasas kozben.
// Az igazsag zaja csatornankent: a bevetel-arany szorasa a vilag ujrafuttatasaibol
// (world/src/world/noise.py). Ha a fajl nem toltodik be, a mondat kimarad.
interface Noise { replicates: number; sd: Record<string, { share_of_revenue: number }> }

function useNoise(): Noise | null {
  const [noise, setNoise] = useState<Noise | null>(null);
  useEffect(() => {
    let elo = true;
    fetch('/data/world_noise.json')
      .then(r => (r.ok ? r.json() : null))
      .then(n => elo && setNoise(n))
      .catch(() => {});
    return () => { elo = false; };
  }, []);
  return noise;
}

const Folds: React.FC<{ data: AttributionData }> = ({ data }) => {
  const noise = useNoise();
  const w = data.default_window;
  const d = windowData(data, w);
  const groups = chartGroups(data, w);

  return (
    <Page className="pb-16">
      <Fold title="Hogyan számol?">
        <p>
          A négy modell ugyanazt az adatot kapja: a Mérés (01.2) pipeline-jából
          kiolvasott sessionöket és rendeléseket. Egy session forrása az első eseményének
          forrása, a rendelés pedig annak a sessionnek a forrását kapja, amelyikben történt.
        </p>
        <p className="mt-3">
          Minden rendeléshez egy útvonal tartozik: a vásárló session, és ugyanannak a személynek
          azok a korábbi sessionjei, amelyek az előző vásárlása után és a lookback-ablakon belül
          kezdődtek. A {w} napos ablakban {int(d.paths.converting)} ilyen útvonal van, és{' '}
          {int(d.paths.non_converting)} olyan, ami nem ért vásárlásig.
        </p>
        <ul className="mt-3 list-disc pl-5">
          <li><strong>Last-click:</strong> az útvonal teljes bevétele az utolsó session csatornájáé.</li>
          <li><strong>Lineáris:</strong> a bevétel egyenlően oszlik az útvonal sessionjei között.</li>
          <li>
            <strong>Time-decay:</strong> a session súlya hét naponként feleződik a vásárlástól
            visszafelé. A felezési idő rögzített.
          </li>
          <li>
            <strong>Markov:</strong> az útvonalakból csatornák közti átmenet-valószínűségeket
            számol, a vásárlásig nem jutó útvonalakból is. Azt nézi, mennyivel esne a vásárlás
            valószínűsége, ha egy csatorna kiesne a láncból (removal effect), és a bevételt ezek
            arányában osztja szét.
          </li>
        </ul>
        <p className="mt-3">
          A last-click nem néz vissza, ezért az ablak váltására nem mozdul. A Markov a teljes
          bevételt osztja szét, tehát nem látja, hogy egyes útvonalak kosárértéke nagyobb. Egy
          útvonalból bármelyik csatornát kivéve az egész útvonal elvész, ezért a Markov minden
          érintett csatornának a teljes útvonalat írja jóvá: minél hosszabb az ablak, annál
          közelebb kerülnek egymáshoz a csatornák részesedései. Ezt az ábrán a kapcsolóval
          követni tudod.
        </p>
        <p className="mt-3">
          Az összevetés mértéke a bevétel aránya: a modell által a csatornának adott bevétel
          osztva azzal, amit a pipeline lát ({ft(data.pipeline_revenue_huf)}). Ez a bolt
          bevételének {pct(data.pipeline_revenue_huf / data.total_revenue_huf)}-a, mert consent
          nélkül nincs mérés. A hozzájárulás ebben a világban független a csatornától, ezért az
          arány összevethető a teljes bevételre vonatkozó igazsággal.
        </p>
        <p className="mt-3">
          A ROAS az arányt a bolt teljes bevételével ({ft(data.total_revenue_huf)}) szorozza, és a
          csatorna költésével osztja. Ez feltevés: azt mondja, hogy a bolt a teljes bevételét a
          saját rendszeréből ismeri, nem a trackerből.
        </p>
        <p className="mt-3">
          A böngésző itt nem becsül. Mind a négy ablak eredménye előre kiszámolva érkezik, a
          kapcsoló csak választ közülük.
        </p>
      </Fold>

      <Fold title="Mikor számít ez élesben?">
        <p>
          Élesben az igazság jelölője nincs az ábrán. Itt azért van, mert a világ újrafuttatható
          a csatorna költése nélkül. Valódi boltban ezt a holdout vagy a geo-lift teszt adja.
        </p>
        <p className="mt-3">A {w} napos ablakban a last-click szerint:</p>
        <ul className="mt-2 list-disc pl-5">
          {groups.map(g => (
            <li key={g.slug}>
              {g.title}: a bevétel {pct(g.bars[0].share)}-a, az igazság {pct(g.truth)}{' '}
              ({signedPp(g.bars[0].errorPp)}).
            </li>
          ))}
        </ul>
        <p className="mt-3">
          Az elfogás felfelé tolja a fizetett csatorna mért arányát: a fizetett csatornán
          megjelenő sessionök egy része olyan látogatóé, aki hirdetés nélkül is megjött volna,
          organikusan vagy közvetlenül. A tracker ezt a sessiont a fizetett csatornán látja, és
          mind a négy modell ott számolja el. Élesben ennek a megfelelője a márkanévre futó
          keresési hirdetés. Az elfogás nem magyaráz meg minden eltérést: ahol egy modell az
          igazság alatt mér (a fenti listában negatív előjel), ott vagy erősebb egy másik hatás,
          amit ez a lap nem azonosít, vagy az eltérés az igazság zaján belül van.
        </p>
        <p className="mt-3">
          Az igazság csatornánként egy ellentényes futásból jön, és zajos.
          {noise && (
            <>
              {' '}A világot {noise.replicates}-szer újrafuttatva az igazság aránya ennyit szór:{' '}
              {groups.map(g => `${g.title} ±${pp(noise.sd[g.slug].share_of_revenue * 100)}`).join(', ')}.
            </>
          )}
          {' '}Az ennél kisebb eltérést ne olvasd tévedésnek, a modellek közötti kis különbséget
          pedig sorrendnek.
        </p>
        <p className="mt-3">
          A mérés az útvonalakat is csonkítja. A consent nélküli eszköz sessionjei hiányoznak, és
          az összefűzés csak azt az eszközt köti a vásárlóhoz, amelyikről vásárolt. A modellek
          ezért rövidebb útvonalakból dolgoznak, mint ami történt, és ez a lap a két hatást nem
          választja szét.
        </p>
        <p className="mt-3">
          Ebben a világban nincs célzás és nincs igény-alapú vásárlás. Az eredmény erre a
          világra szól.
        </p>
      </Fold>

      <Fold title="Mi támasztja alá">
        <p>
          Az útvonalakat a <code>world/src/world/journeys.py</code> építi, a négy modell a{' '}
          <code>world/src/world/models/attribution.py</code>-ban van, a futtató a{' '}
          <code>world/src/world/attribution.py</code>. A modellek kódja nem hivatkozhat az
          igazságot olvasó modulra; ezt teszt őrzi.
        </p>
        <p className="mt-3">
          A modellek kézzel kiszámolt példákon vannak tesztelve, a Markov removal effectje egy
          kézzel megoldható láncon. Külön teszt ellenőrzi mind a négy ablakra, hogy minden
          rendelés pontosan egy útvonalban van, és hogy minden modell a teljes bevételt osztja
          szét.
        </p>
        <p className="mt-3">
          A futtató nem ír fájlt, ha az adatbázis sessionjeinek vagy rendeléseinek száma és
          összege nem egyezik a Mérés (01.2) főkönyvével.
        </p>
        <p className="mt-3">
          Amit ez a lap nem állít: hogy bármelyik modell általában jobb a másiknál.
        </p>
      </Fold>
    </Page>
  );
};

// Az Attribucio muszer (01.3): negy modell az igazsaghoz merve.
const Attribution: React.FC = () => {
  const { data, error } = useAttributionData();
  // null = az adatfajl alapallasa (default_window)
  const [chosen, setChosen] = useState<number | null>(null);

  if (error) {
    return (
      <Page className="pb-16">
        <div className="g12 border-t border-border pt-8">
          <p className="c12 t-body prose-col text-on-surface-muted">
            Az attribúció adata nem tölthető be ({error}). A <code>public/data/</code> alatt
            az <code>attribution.json</code> kell: a <code>world/</code> alatt a{' '}
            <code>uv run python -m world.attribution</code> írja meg, és a{' '}
            <code>uv run python -m world.publish</code> másolja oda.
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

  const lookback = chosen ?? data.default_window;
  const groups = chartGroups(data, lookback);
  const d = windowData(data, lookback);
  const errors = modelErrors(data, lookback).map(e => e.errorPp);

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
              Aki vásárol, az előtte gyakran többször is járt a boltban, és nem mindig ugyanonnan
              érkezett: egyszer egy Meta-hirdetésről, máskor a Google-ből, végül egy hírlevélből.
              Az attribúció arra felel, hogy a vásárlás bevételét melyik csatornának írjuk jóvá.
            </p>
            <p className="t-body prose-col mt-3 text-on-surface-muted">
              Erre nincs egyetlen helyes szabály. Négy elterjedt módszer:
            </p>
            <ul className="t-body prose-col mt-2 list-disc pl-5 text-on-surface-muted">
              <li><strong>Last-click:</strong> minden az utolsó látogatás csatornájáé.</li>
              <li><strong>Lineáris:</strong> a bevétel egyenlően oszlik a látogatások között.</li>
              <li><strong>Time-decay:</strong> a vásárláshoz közelebbi látogatás többet kap.</li>
              <li>
                <strong>Markov:</strong> egy csatorna annyit kap, amennyivel nélküle kevesebb
                vásárlás lenne a látogatók útjai alapján.
              </li>
            </ul>
            <p className="t-body prose-col mt-3 text-on-surface-muted">
              Valódi boltban nem lehet tudni, melyik módszer jár közelebb a valósághoz. Ebben a
              kitalált boltban igen: A bolt (01.1) oldalon mindhárom fizetett csatornára megvan,
              mennyi bevételt hozott valójában. Ez a lap ehhez az igazsághoz méri a négy modellt.
            </p>
          </div>
        </div>
      </Page>

      {/* ---- az abra: negy modell es az igazsag ---- */}
      <Page className="pb-6">
        <div className="g12 border-t border-border pt-8">
          <div className="c3 pr-8">
            <div className="t-label-sm text-on-surface-subtle">Mit mond a négy modell?</div>
          </div>
          <div className="c9">
            <p className="t-body prose-col text-on-surface-muted">
              Az ábrán a három fizetett csatorna áll. Mindegyiknél négy sáv mutatja, hogy az
              egyes modellek a bevétel hány százalékát írják a csatornának. A sötét vonal az
              igazság: ennyit hozott a csatorna valójában. Ha a sáv a vonal fölé ér, a modell
              többet tulajdonít a csatornának, mint amennyi jár neki.
            </p>
            <p className="t-body prose-col mt-3 tabular-nums text-on-surface-muted">
              A {lookback} napos ablakban a négy modell átlagos eltérése az igazságtól{' '}
              {pp(Math.min(...errors))} és {pp(Math.max(...errors))} között van (pp =
              százalékpont).
            </p>
          </div>
        </div>
      </Page>

      <Page className="pb-10">
        <div className="g12">
          <div className="c3 pr-8">
            <div className="t-label-sm text-on-surface-subtle">Visszatekintés (lookback)</div>
            <div className="mt-2 flex flex-wrap gap-1 max-md:grid max-md:grid-cols-4">
              {data.windows.map(w => (
                <button key={w} type="button" onClick={() => setChosen(w)}
                        aria-pressed={w === lookback}
                        className={`t-label-sm rounded-sm border px-3 py-2 tabular-nums max-md:min-h-10 max-md:px-1 ${
                          w === lookback ? 'border-border-strong bg-surface-sunken' : 'border-border'}`}>
                  {w} nap
                </button>
              ))}
            </div>
            <p className="t-body prose-col mt-6 text-on-surface-muted">
              Ennyi napra néz vissza a modell a vásárlás előtt. Az ablakot az elemző választja.
              A last-click kivételével a sávok vele mozdulnak, az igazság nem.
            </p>
            <p className="t-body prose-col mt-3 tabular-nums text-on-surface-muted">
              Ebben az ablakban {int(d.paths.converting)} útvonal ért vásárlásig, és{' '}
              {int(d.paths.non_converting)} nem.
            </p>
          </div>

          <div className="c9 max-md:mt-8">
            <ModelBars groups={groups} yMax={shareMax(data)} ariaLabel={chartLabel(groups, lookback)} />
          </div>
        </div>
      </Page>

      <Page className="pb-10">
        <Readout items={modelErrors(data, lookback).map(e => ({
          value: pp(e.errorPp),
          label: `${e.label}: átlagos eltérés az igazságtól`,
        }))} />
      </Page>

      <Tables data={data} lookback={lookback} />
      <Folds data={data} />
    </>
  );
};

export default Attribution;
