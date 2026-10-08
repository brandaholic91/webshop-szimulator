import React from 'react';
import Page from '../../components/Page';
import Fold from '../../components/Fold';
import LiveTracker from './LiveTracker';
import Inspector from './Inspector';
import LedgerTables from './LedgerTables';
import { useEventsData } from './useEventsData';
import type { EventsData } from './useEventsData';
import { eventPath, sides } from './ledger';
import { ft, int, pct } from './format';

const Folds: React.FC<{ data: EventsData }> = ({ data }) => {
  const { ledger } = data;
  const e = ledger.events;
  const path = Object.fromEntries(eventPath(ledger).map(r => [r.key, r]));
  const withheld = path.withheld_no_consent;
  const duplicate = path.sent_duplicate;
  const [sessions, orders, revenue] = sides(ledger);
  const i = ledger.identity;

  return (
    <Page className="pb-16">
      <Fold title="Hogyan számol?">
        <p>
          A felső blokkban az <code>fp-collector</code> trackere fut, ugyanaz a fájl, ami a
          collector saját oldalán. Egy rejtett keretben él, ahol a lap a tárolóját memóriabelire
          cseréli, a hálózati hívását pedig elfogja, mielőtt elindulna. Ezért látod a kérést, és
          ezért nem megy sehova.
        </p>
        <p className="mt-3">
          Az alsó két blokk nem a kattintásaidból számol. A szimulált bolt három évének minden
          sessionjéből esemény készült ({int(e.generated)} darab), és ami consentet kapott, az
          valódi HTTP-kérésként ment be egy helyi <code>fp-collector</code> példányba. A
          collector a <code>raw_events</code> táblába írta, a worker megtisztította
          (<code>clean_events</code>), a vásárlásokból pedig rendelés (<code>orders</code>) és
          eszköz–vásárló kapcsolat (<code>identity_links</code>) lett. A főkönyv a két végét
          teszi egymás mellé: ami legyártódott, és ami a táblákban van.
        </p>
        <p className="mt-3">
          Egy esemény kétféleképp nem ér célba. Consent nélkül el sem indul:{' '}
          {int(withheld.value)} esemény, a legyártottak {pct(withheld.share ?? 0)}-a. Ha kétszer
          megy el, a collector az azonos <code>event_id</code> miatt a másodikat eldobja:{' '}
          {int(duplicate.value)} ilyen volt, és egy sem került be kétszer.
        </p>
      </Fold>
      <Fold title="Mikor számít ez élesben?">
        <p>
          A pipeline a sessionök {pct(sessions.coverage)}-át, a rendelések{' '}
          {pct(orders.coverage)}-át és a bevétel {pct(revenue.coverage)}-át látja:{' '}
          {ft(revenue.pipeline)}-ot a {ft(revenue.dgp)}-ból. A különbség nem hiba a pipeline-ban.
          Ebben a világban a rendelés csak követett <code>purchase</code> eseményből épül, tehát
          aki nem adott consentet, annak a vásárlása a mérés számára nem létezik.
        </p>
        <p className="mt-3">
          Ezért nem szabad az analitika bevételét a könyvelés bevételével egyenlőnek venni. Egy
          valódi boltban a rendelés a webshop adatbázisából is megvan, consenttől függetlenül; a
          tracker abból csak azt a részt látja, amihez hozzájárulás tartozik. Minden modell, ami
          a pipeline-ból tanul, ezt a szűkebb képet kapja.
        </p>
        <p className="mt-3">
          A több eszköz a másik veszteség. A pipeline {int(i.devices_pipeline)} eszközt lát, és
          az összefűzés után {int(i.persons_after_stitching)} személyt: csak azt az eszközt tudja
          emberhez kötni, amelyikről vásároltak. Ezek mögött az eszközök mögött valójában{' '}
          {int(i.customers_consented_dgp)} ember áll; a különbség ugyanannak az embernek a
          másik eszköze, amit a mérés külön személynek lát.
        </p>
        <p className="mt-3">
          A forrásjel is elveszhet. A tracker az UTM-paramétert az aktuális oldal címéből
          olvassa, ezért csak a landing eseményen van rajta. Ha a látogató továbbkattint, mielőtt
          hozzájárul, az első elküldött eseményen már nincs forrás. Ezt a felső blokkban ki
          tudod próbálni.
        </p>
      </Fold>
      <Fold title="Mi támasztja alá">
        <p>
          A collector, a worker és a tracker az <code>fp-collector</code> repóban él:{' '}
          <a href="https://github.com/brandaholic91/fp-collector" className="text-primary underline">
            github.com/brandaholic91/fp-collector
          </a>. A tracker itteni példánya annak bájtra azonos másolata
          (<code>public/events/tracker.js</code>).
        </p>
        <p className="mt-3">
          A világ eseményeit a <code>world/src/world/emit.py</code> gyártja, a betöltést a{' '}
          <code>load.py</code>, a három adatfájlt az <code>export.py</code> végzi. Az export nem ír
          fájlt, ha a pipeline számai nem egyeznek azzal, ami elindult. A szintetikus forgalom
          külön, helyi példányba megy, soha nem a collector éles adatbázisába.
        </p>
        <p className="mt-3">
          Amit ez a lap nem állít: hogy a pipeline most is fut. Az adat egyszer ment át rajta, a
          lap a rögzített eredményt mutatja.
        </p>
      </Fold>
    </Page>
  );
};

// 0. blokk: mi ez a lap. A szamos mondat csak betoltott adattal jelenik meg,
// a tobbi szoveg az adat elott is all (az elo tracker sem var ra).
const Intro: React.FC<{ data: EventsData | null }> = ({ data }) => (
  <Page className="pb-10">
    <div className="g12 border-t border-border pt-8">
      <div className="c3 pr-8">
        <div className="t-label-sm text-on-surface-subtle">Mi ez?</div>
      </div>
      <div className="c9">
        <p className="t-body prose-col text-on-surface-muted">
          Egy webshop onnan tudja, mit csinálnak a látogatói, hogy egy kis program (a tracker)
          minden lépésükről üzenetet küld: megnézett egy terméket, kosárba tette, megvette. Egy
          ilyen üzenet az esemény. Az eseményeket egy szerver fogadja, megtisztítja és
          adatbázisba rendezi; ez a lánc a pipeline.
        </p>
        <p className="t-body prose-col mt-3 text-on-surface-muted">
          A tracker csak akkor küldhet, ha a látogató hozzájárult (consent). Aki nem járult
          hozzá, annak a látogatása és a vásárlása is hiányzik a mérésből.
          {data && (
            <> Ebben a kitalált boltban a mérés ezért a bevételnek csak{' '}
              {pct(sides(data.ledger)[2].coverage)}-át látja.</>
          )}
        </p>
        <p className="t-body prose-col mt-3 text-on-surface-muted">
          A lap három lépésben mutatja meg: előbb kipróbálhatod a trackert, utána
          végigkövetheted három látogató útját, a végén pedig az áll, mennyi veszett el a bolt
          három éve alatt.
        </p>
      </div>
    </div>
  </Page>
);

// A Meres muszer (01.2): elo tracker, inspektor, fokonyv.
const Events: React.FC = () => {
  const { data, error } = useEventsData();

  return (
    <>
      <Intro data={data} />
      <LiveTracker />
      {error && (
        <Page className="pb-16">
          <div className="g12 border-t border-border pt-8">
            <p className="c12 t-body prose-col text-on-surface-muted">
              A rögzített pipeline-adat nem tölthető be ({error}). A <code>public/data/</code> alatt
              három fájl kell: <code>events_ledger.json</code>, <code>events_sample.json</code>,{' '}
              <code>events_emitted.json</code>. A <code>world/</code> alatt a{' '}
              <code>uv run python -m world.publish</code> másolja oda őket.
            </p>
          </div>
        </Page>
      )}
      {!error && !data && (
        <Page className="pb-16">
          <div className="g12 border-t border-border pt-8">
            <p className="c12 t-body text-on-surface-subtle">Betöltés…</p>
          </div>
        </Page>
      )}
      {data && (
        <>
          <Inspector data={data} />
          <LedgerTables ledger={data.ledger} />
          <Folds data={data} />
        </>
      )}
    </>
  );
};

export default Events;
