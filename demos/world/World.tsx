import React, { useMemo, useState } from 'react';
import Page from '../../components/Page';
import Readout from '../../components/Readout';
import Fold from '../../components/Fold';
import ChainChart from './ChainChart';
import SaturationCurves from './SaturationCurves';
import CounterfactualChart from './CounterfactualChart';
import { useWorldData } from './useWorldData';
import { PAID, channelColor } from './channels';
import { adstock, saturate } from './response';
import { ft, mFt } from './format';
import { channelValues, cheapNotBest } from './value';

// A tabla cellai: mobilon (max-md) az ot oszlopnak 341 px-en kell elfernie.
const TH = 't-label-sm border-b border-border-strong py-2 pr-4 font-medium text-on-surface-subtle ' +
  'max-md:pr-1.5 max-md:tracking-normal max-md:last:pr-0';
const TD = 'border-b border-border py-2 pr-4 max-md:pr-1.5 max-md:last:pr-0';
const NUM = `${TD} whitespace-nowrap text-right`;

const World: React.FC = () => {
  const { data, error } = useWorldData();
  const [slug, setSlug] = useState(PAID[0].slug);
  const [decay, setDecay] = useState<number | null>(null);
  const [half, setHalf] = useState<number | null>(null);
  const [kozeli, setKozeli] = useState(true);   // a lanc-abra ablaka: csucs kornyeke vagy a teljes idoszak

  const ch = data?.response.channels.find(c => c.slug === slug);
  const idx = data?.spend.channels.indexOf(slug) ?? -1;

  // A csuszkak alapallasa A VILAG VALODI PARAMETERE (27. dontes) — a null
  // allapot ezt jelenti; a felhasznalo elmozdithatja, de a truth-marker
  // mindig az igazsagot mutatja.
  const aktualisDecay = decay ?? ch?.adstock_decay ?? 0;
  const aktualisHalf = half ?? ch?.half_saturation_huf ?? 1;

  const spend = useMemo(
    () => (data && idx >= 0 ? data.spend.daily_huf[idx] : []),
    [data, idx],
  );

  // A napi telitettseg-sorozat tenyleges atlaga — NEM az atlagos koltesbol
  // szamolt allandosult-allapoti kozelites. A ketto kulonbozik, mert a
  // szaturacio nemlinearis: a napi ingadozas atlaga a gorbe konkav szakaszan
  // magasabb telitettseget mutat, mint amit az atlag-koltes egyenkent kapna.
  const telitettseg = useMemo(() => {
    if (!ch || spend.length === 0) return 0;
    const adstockolt = adstock(spend, aktualisDecay);
    const napi = adstockolt.map(v => saturate(v, aktualisHalf, ch.shape));
    return napi.reduce((a, b) => a + b, 0) / napi.length;
  }, [ch, spend, aktualisDecay, aktualisHalf]);

  if (error) {
    return (
      <Page className="pb-16">
        <div className="g12 border-t border-border pt-8">
          <p className="c12 t-body prose-col text-on-surface-muted">
            A világ adatai nem tölthetők be ({error}). A <code>public/data/</code> alatt
            hiányoznak a JSON-ok — futtasd a <code>world/</code> alatt a
            <code> uv run python -m world.truth</code> és a
            <code> uv run python -m world.publish</code> parancsot.
          </p>
        </div>
      </Page>
    );
  }
  if (!data || !ch) {
    return (
      <Page className="pb-16">
        <div className="g12 border-t border-border pt-8">
          <p className="c12 t-body text-on-surface-subtle">Betöltés…</p>
        </div>
      </Page>
    );
  }

  const cf = data.incrementality.counterfactual[slug];
  // A lapon az ujrafuttatasok ATLAGA all (53. dontes): a ± az atlag standard
  // hibaja, azaz egy futas szorasa osztva az ujrafuttatasok szamanak gyokevel.
  const szoras = data.noise.sd[slug];
  const gyok = Math.sqrt(data.noise.replicates);
  const zaj = {
    incremental_revenue_huf: szoras.incremental_revenue_huf / gyok,
    true_roas: szoras.true_roas / gyok,
    share_of_revenue: szoras.share_of_revenue / gyok,
  };
  const szin = channelColor(slug);

  // 1096 nap = 156 teljes het + 4 nap: az utolso heti bucket csonka, es
  // ~40%-os letoresnek nezne ki az abran. A grafikon-retegben vagjuk le —
  // a JSON-okat nem generaljuk ujra —, es actual/counterfactual ugyanannyi
  // pontot ad, mert ugyanugy vagjuk le mindkettot.
  const hetiTeljes = data.incrementality.weekly_revenue.slice(0, -1);
  const hetiEllentenyes = cf.weekly_revenue.slice(0, -1);

  const csatornaNev = PAID.find(c => c.slug === slug)?.title ?? '';
  const osszeg = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

  // A harom csatorna egyutt: a teljes bevetel/koltes hanyados nem megterules,
  // mert a bevetel nagyobb resze hirdetes nelkul is megjonne.
  const teljesBevetel = osszeg(data.outcome.weekly_revenue_huf);
  const teljesKoltes = osszeg(data.spend.daily_huf.flat());
  const hirdetesHozta = osszeg(PAID.map(c => data.incrementality.counterfactual[c.slug].incremental_revenue_huf));

  // A megterules ket tenyezore bontva: a latogatas ara es hozama.
  const ertekek = channelValues(data);
  const olcso = cheapNotBest(ertekek);

  return (
    <>
      {/* ---- 1. blokk: mi ez a bolt ---- */}
      <Page className="pb-10">
        <div className="g12 border-t border-border pt-8">
          <div className="c3 pr-8">
            <div className="t-label-sm text-on-surface-subtle">A bolt</div>
          </div>
          <div className="c9">
            <p className="t-body prose-col text-on-surface-muted">
              Ez a webshop nem létezik. Egy program állította elő a forgalmát vásárlóról
              vásárlóra, {data.spend.daily_huf[0].length} napra, három fizetett hirdetési
              csatornával ({PAID.map(c => c.title).join(', ')}). A többi elemzés ezt a boltot
              méri.
            </p>
          </div>
        </div>
      </Page>

      <Page className="pb-10">
        <Readout items={[
          { value: ft(osszeg(data.outcome.weekly_sessions)), label: 'látogatás' },
          { value: ft(osszeg(data.outcome.weekly_orders)), label: 'rendelés' },
          { value: mFt(osszeg(data.outcome.weekly_revenue_huf)), label: 'bevétel' },
          { value: mFt(osszeg(data.spend.daily_huf.flat())), label: 'hirdetési költés' },
        ]} />
      </Page>

      {/* ---- 2. blokk: a felfedés ---- */}
      <Page className="pb-6">
        <div className="g12 border-t border-border pt-8">
          <div className="c3 pr-8">
            <div className="t-label-sm text-on-surface-subtle">Mennyit hozott a hirdetés?</div>
          </div>
          <div className="c9">
            <p className="t-body prose-col text-on-surface-muted">
              Lefuttattam ugyanezt a boltot még egyszer, <strong>ugyanazokkal a vásárlókkal</strong>,
              csak a(z) {csatornaNev} költése nulla. A két vonal közti rés a teljes időszakra
              összeadva az a bevétel, amit a csatorna valóban hozott (szakszóval inkrementális
              bevétel). Valós boltban ez nem mérhető így: ugyanazt az időszakot nem lehet kétszer
              lejátszani.
            </p>
            <p className="t-body prose-col mt-3 text-on-surface-muted">
              Egyetlen ilyen futáspár zajos, mert a két futásban a véletlen is máshogy alakul.
              Ezért a bolt {data.noise.replicates}-szer újrafutott más sorsolással, hirdetéssel
              és anélkül, és az ábra két vonala meg a lenti számok ezek átlagát mutatják. A ± az
              átlag bizonytalansága. Egy-egy héten az ellentényes vonal így is a tényleges fölé
              kerülhet.
            </p>
          </div>
        </div>
      </Page>

      <Page className="pb-10">
        <div className="g12">
          <div className="c3 pr-8">
            <div className="t-label-sm text-on-surface-subtle">Csatorna</div>
            <div className="mt-2 flex flex-col gap-y-1">
              {PAID.map(c => (
                <button key={c.slug} type="button" onClick={() => { setSlug(c.slug); setDecay(null); setHalf(null); }}
                        aria-pressed={c.slug === slug}
                        className={`t-label-sm rounded-sm border px-3 py-2 text-left max-md:py-3 ${
                          c.slug === slug ? 'border-border-strong bg-surface-sunken' : 'border-border'}`}>
                  {c.title}
                </button>
              ))}
            </div>
          </div>
          <div className="c9 max-md:mt-6">
            <CounterfactualChart actual={hetiTeljes}
                                 counterfactual={hetiEllentenyes} color={szin}
                                 ariaLabel={`Tényleges és ellentényes heti bevétel, ` +
                                   `${csatornaNev}: ` +
                                   `az inkrementális bevétel ${mFt(cf.incremental_revenue_huf)}`} />
          </div>
        </div>
      </Page>

      <Page className="pb-10">
        <Readout items={[
          { value: mFt(cf.incremental_revenue_huf),
            label: `ennyit hozott a csatorna · ±${mFt(zaj.incremental_revenue_huf)}` },
          { value: mFt(cf.spend_huf), label: 'ennyibe került' },
          { value: cf.true_roas.toFixed(2),
            label: `bevétel 1 Ft költésre (ROAS) · ±${zaj.true_roas.toFixed(2)}` },
          { value: `${(cf.share_of_revenue * 100).toFixed(1)}%`,
            label: `a teljes bevétel hányada · ±${(zaj.share_of_revenue * 100).toFixed(1)} százalékpont` },
        ]} />
      </Page>

      <Page className="pb-10">
        <div className="g12">
          <div className="c3 pr-8">
            <div className="t-label-sm text-on-surface-subtle">A három csatorna együtt</div>
          </div>
          <div className="c9">
            <p className="t-body prose-col text-on-surface-muted">
              A három csatorna összesen {mFt(hirdetesHozta)} bevételt hozott {mFt(teljesKoltes)} költésből,
              ez forintonként {(hirdetesHozta / teljesKoltes).toFixed(2)} Ft. A bolt teljes
              bevétele ennél jóval több, {mFt(teljesBevetel)}: nagyjából{' '}
              {Math.round((1 - hirdetesHozta / teljesBevetel) * 100)}%-a hirdetés nélkül is megjönne.
              Ezért a teljes bevétel és a költés hányadosa
              ({(teljesBevetel / teljesKoltes).toFixed(2)}) nem a hirdetés megtérülése.
            </p>
          </div>
        </div>
      </Page>

      {/* ---- miert mas a harom csatorna megterulese ---- */}
      <Page className="pb-10">
        <div className="g12">
          <div className="c3 pr-8">
            <div className="t-label-sm text-on-surface-subtle">Miért más a megtérülésük?</div>
          </div>
          <div className="c9">
            <p className="t-body prose-col text-on-surface-muted">
              A ROAS két szám hányadosa: mennyi bevételt hoz egy hirdetéses látogatás, és mennyibe
              kerül. Az árát a lenti lánc dönti el (lecsengés és szaturáció). A hozamát az, hogy
              kiket hoz a csatorna: a bolt négy vásárlótípusa más eséllyel vásárol, más
              kosárértékkel, és mindegyik más csatornán jár.
            </p>
            {olcso && (
              <p className="t-body prose-col mt-3 tabular-nums text-on-surface-muted">
                A(z) {olcso.cheap.title} látogatása a legolcsóbb ({ft(olcso.cheap.costPerSession)} Ft),
                mégsem ez térül meg a legjobban: a látogatóinak{' '}
                {Math.round(olcso.cheap.topSegment.share * 100)}%-a{' '}
                {olcso.cheap.topSegment.title.toLowerCase()} vásárló, és egy látogatása{' '}
                {ft(olcso.cheap.valuePerSession)} Ft bevételt hoz. A(z) {olcso.best.title} látogatása
                drágább ({ft(olcso.best.costPerSession)} Ft), de {ft(olcso.best.valuePerSession)} Ft-ot
                hoz. Ugyanez a különbség választja szét a vásárlótípusokat a Szegmensek (01.5)
                oldalon: a típusok abban különböznek leginkább, honnan érkeznek.
              </p>
            )}
            <table className="t-body mt-6 w-full tabular-nums">
              <thead>
                <tr>
                  <th scope="col" className={`${TH} text-left`}>Csatorna</th>
                  <th scope="col" aria-label="Egy látogatás ára" className={`${TH} text-right`}>
                    <span className="max-md:hidden">1 látogatás ára</span><span className="md:hidden">Ár</span>
                  </th>
                  <th scope="col" aria-label="Egy látogatás hozama" className={`${TH} text-right`}>
                    <span className="max-md:hidden">1 látogatás hozama</span><span className="md:hidden">Hozam</span>
                  </th>
                  <th scope="col" className={`${TH} text-right`}>ROAS</th>
                  <th scope="col" aria-label="A látogatók legnagyobb típusa" className={`${TH} text-right`}>
                    <span className="max-md:hidden">Legtöbb látogatója</span><span className="md:hidden">Közönség</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {ertekek.map(r => (
                  <tr key={r.slug}>
                    <th scope="row" className={`${TD} text-left font-normal`}>{r.title}</th>
                    <td className={NUM}>{ft(r.costPerSession)} Ft</td>
                    <td className={NUM}>{ft(r.valuePerSession)} Ft</td>
                    <td className={NUM}>{r.roas.toFixed(2)}</td>
                    <td className={`${TD} text-right`}>
                      {r.topSegment.title} {Math.round(r.topSegment.share * 100)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="t-body prose-col mt-3 text-on-surface-subtle">
              A látogatás a hirdetés saját látogatása; az elfogott organikus és közvetlen
              látogató nem számít bele, mert hirdetés nélkül is megjött volna. A hozam a csatorna
              teljes inkrementális bevétele elosztva ezzel a látogatásszámmal, tehát a későbbi,
              más csatornán történt vásárlásokat is tartalmazza.
            </p>
          </div>
        </div>
      </Page>

      {/* ---- 3. blokk: a transzformációs lánc ---- */}
      <Page className="pb-6">
        <div className="g12 border-t border-border pt-8">
          <div className="c3 pr-8">
            <div className="t-label-sm text-on-surface-subtle">Hogyan lesz a költésből látogató?</div>
          </div>
          <div className="c9">
            <p className="t-body prose-col text-on-surface-muted">
              Két szabály dolgozik a háttérben. A hirdetés hatása nem tűnik el másnap, hanem
              napokig lecseng (adstock). És minél többet költ a bolt, a következő forint annál
              kevesebbet hoz (szaturáció). A csúszkákkal mindkettő elállítható; az „igazság" az
              az érték, amivel a világ valójában futott.
            </p>
            <p className="t-body prose-col mt-3 text-on-surface-muted">
              Az ábra alapból a csatorna legnagyobb költésű napjának környékét mutatja, négy
              hetet. Az első panelen a kiugrás másnapra eltűnik, a másodikon napokig megmarad:
              ez a lecsengés. A harmadik panel teteje az a látogatásszám, amit a csatorna
              teljes telítődésnél hozna. Ha elmozdítod a csúszkákat, a színes vonal mutatja az új
              beállítást, a sötét vonal pedig azt, ami a boltban valójában történt.
            </p>
          </div>
        </div>
      </Page>

      <Page className="pb-10">
        <div className="g12">
          <div className="c3 pr-8">
            <div className="t-label-sm text-on-surface-subtle">Csatorna: {csatornaNev}</div>

            <div className="mt-4 flex flex-col gap-y-1">
              {[{ ertek: true, felirat: 'Négy hét a csúcs körül' },
                { ertek: false, felirat: `Mind a ${spend.length} nap` }].map(o => (
                <button key={o.felirat} type="button" onClick={() => setKozeli(o.ertek)}
                        aria-pressed={o.ertek === kozeli}
                        className={`t-label-sm rounded-sm border px-3 py-2 text-left max-md:py-3 ${
                          o.ertek === kozeli ? 'border-border-strong bg-surface-sunken' : 'border-border'}`}>
                  {o.felirat}
                </button>
              ))}
            </div>

            <label className="mt-6 block">
              <span className="t-label-sm text-on-surface-subtle">Mennyi marad a hatásból másnapra (adstock λ)</span>
              <input type="range" min={0} max={0.9} step={0.01} value={aktualisDecay}
                     aria-label="Adstock-lecsengés (lambda)" aria-valuetext={aktualisDecay.toFixed(2)}
                     onChange={e => setDecay(Number(e.target.value))} className="mt-2 w-full max-md:h-10" />
              <span className="t-label-sm tabular-nums text-on-surface">
                {aktualisDecay.toFixed(2)}
                <span className="ml-2" style={{ color: 'var(--color-viz-truth)' }}>
                  · igazság {ch.adstock_decay.toFixed(2)}
                </span>
              </span>
            </label>

            <label className="mt-4 block">
              <span className="t-label-sm text-on-surface-subtle">Ekkora napi költésnél feleződik a hatás (félszaturációs pont)</span>
              <input type="range" min={2000} max={60000} step={500} value={aktualisHalf}
                     aria-label="Félszaturációs pont" aria-valuetext={`${ft(aktualisHalf)} Ft/nap`}
                     onChange={e => setHalf(Number(e.target.value))} className="mt-2 w-full max-md:h-10" />
              <span className="t-label-sm tabular-nums text-on-surface">
                {ft(aktualisHalf)} Ft/nap
                <span className="ml-2" style={{ color: 'var(--color-viz-truth)' }}>
                  · igazság {ft(ch.half_saturation_huf)}
                </span>
              </span>
            </label>

            <button type="button" onClick={() => { setDecay(null); setHalf(null); }}
                    className="t-label-sm mt-4 rounded-sm border border-border px-3 py-2 text-primary max-md:py-3">
              Vissza az igazságra
            </button>
          </div>

          <div className="c9 max-md:mt-6">
            <ChainChart spend={spend} decay={aktualisDecay} half={aktualisHalf}
                        truthDecay={ch.adstock_decay} truthHalf={ch.half_saturation_huf}
                        shape={ch.shape} color={szin} reachScale={ch.reach_scale} zoom={kozeli} />
          </div>
        </div>
      </Page>

      <Page className="pb-10">
        <Readout items={[
          { value: aktualisDecay.toFixed(2), label: 'adstock-lecsengés (λ)' },
          { value: `${ft(aktualisHalf)} Ft`, label: 'félszaturációs pont / nap' },
          { value: ch.shape.toFixed(2), label: 'szaturáció meredeksége' },
          { value: `${(telitettseg * 100).toFixed(0)}%`, label: 'átlagos telítettség' },
        ]} />
      </Page>

      <Page className="pb-10">
        <div className="g12">
          <div className="c3 pr-8">
            <div className="t-label-sm text-on-surface-subtle">Szaturációs görbék</div>
            <p className="t-body prose-col mt-2 text-on-surface-muted">
              Mindhárom fizetett csatorna: vízszintesen a napi költés, függőlegesen a hatás.
              A szaggatott vonal a félszaturációs pont, ott éri el a hatás a maximum felét.
            </p>
          </div>
          <div className="c9">
            <SaturationCurves channels={data.response.channels} />
          </div>
        </div>
      </Page>

      {/* ---- lecsukott próza ---- */}
      <Page className="pb-16">
        <Fold title="Hogyan számol?">
          <p>
            A bolt nem létezik: egy seedelt generátor állítja elő, vásárló-szinten. Harmincezer
            vásárló kap latens tulajdonságokat — vásárlási hajlandóságot, csatorna-affinitást,
            aktivitást, kosárérték-szorzót, érkezési napot, élettartam-hazardot —, és ebből
            származik minden aggregátum. A napi
            költés adstockon és szaturáción megy át, abból lesz elérés, abból journey, abból
            konverzió, abból rendelés.
          </p>
          <p className="mt-3">
            Az igazság <strong>nem</strong> a generátorba beírt paraméter. Szaturáció és
            bázis-kereslet mellett a beírt együttható már nem egyenlő a valódi inkrementális
            hozzájárulással. Ezért a világ újrafut minden fizetett csatornára egyszer, annak a
            csatornának a költését nullázva — a bevétel-különbség az igazság. Ehhez rétegenként
            külön véletlen-stream kell: ez rögzíti a vásárlói kört és a többi csatorna napi
            költését, különben a nullázás az egész populációt elcsúsztatná, és a szám tiszta zaj
            lenne. Ami marad: a nullázás a látogatások, a vásárlások és a kosárértékek sorsolását
            is elmozdítja, mind a hat csatornán. Két világ különbsége ezért a hirdetés hatása
            plusz véletlen — ugyanúgy, ahogy egy éles geo-lift teszt eredménye is ingadozna, ha
            kétszer futtatnád le.
          </p>
          <p className="mt-3">
            Ezért az igazság nem egyetlen futáspár: a világ {data.noise.replicates}-szer újrafutott
            ugyanazokkal a vásárlókkal és ugyanazzal a költéssel, más sorsolással, mindegyik
            futáson ugyanez a számítás ment, és a lapon ezek <strong>átlaga</strong> áll. Egyetlen
            futás a(z) {csatornaNev} bevétel-arányán ±{(szoras.share_of_revenue * 100).toFixed(1)}{' '}
            százalékpontot szór. A számok melletti ± az átlag standard hibája: ez a szórás osztva
            az újrafuttatások számának négyzetgyökével.
          </p>
          <p className="mt-3">
            A bolt saját számai a lap tetején (látogatás, rendelés, bevétel) egyetlen futásból
            jönnek: ezt a futást méri a többi elemzés. A bevétele ezért kicsit eltér az ábra
            tényleges vonalának összegétől, ami az újrafuttatások átlaga.
          </p>
        </Fold>
        <Fold title="Mikor számít ez élesben?">
          <p>
            Valós adaton ez a szám nem létezik: nem tudod lefuttatni ugyanazt a negyedévet
            kétszer. A legközelebbi valódi megfelelője a geo-lift vagy a kikapcsolás-teszt —
            drága, lassú, és a legtöbb hirdető sosem futtatja le. Ezért mérik a csatornákat
            attribúciós modellekkel, és ezért nem tudják megmondani, mennyit tévednek.
          </p>
          <p className="mt-3">
            Ez a lap arra épül, hogy itt megtudható. A következő elemzések ehhez a számhoz mérik
            magukat.
          </p>
        </Fold>
        <Fold title="Mi támasztja alá">
          <p>
            A generátor és a tesztjei a repóban:{' '}
            <code>world/src/world/</code>. Az adstock és a szaturáció kézzel kiszámolható elvárt
            értékekre van tesztelve; a rétegenkénti véletlen-streamet külön teszt őrzi, ami azt
            ellenőrzi, hogy a nullázott világban a populáció <em>bitre</em> azonos marad.
          </p>
          <p className="mt-3">
            A lapon látható minden szám ebből a generátorból jön. A csúszkák alapállása a világ
            valódi paramétere.
          </p>
        </Fold>
      </Page>
    </>
  );
};

export default World;
