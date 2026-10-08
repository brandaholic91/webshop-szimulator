import React, { useMemo, useState } from 'react';
import Page from '../../components/Page';
import Readout from '../../components/Readout';
import { KINDS, alignJourney } from './journey';
import type { AlignedEvent, Fate, Kind } from './journey';
import type { EventsData } from './useEventsData';
import { ft, int } from './format';

const KIND_LABEL: Record<Kind, string> = {
  stitched_two_devices: 'Vásárló két eszközről',
  anonymous: 'Névtelen látogató',
  no_consent: 'Vásárló consent nélkül',
};

const FATE_LABEL: Record<Fate, string> = {
  sent: 'elküldve',
  withheld: 'visszatartva',
  sent_twice: 'kétszer elküldve',
};

// Mobilon (max-md) a tabla gorgetes nelkul fer el: szukebb cellakoz, szukebb
// fejlec-betukoz, es a "Legyartva" oszlop tartalma az elso cellaba kerul.
const TAB = 't-label-sm rounded-sm border px-3 py-2 text-left max-md:min-h-10';
const TH = 't-label-sm border-b border-border-strong py-2 pr-4 text-left font-medium text-on-surface-subtle max-md:pr-2 max-md:tracking-[.08em] max-md:last:pr-0';
const TD = 'border-b border-border py-2 pr-4 align-top max-md:pr-2 max-md:last:pr-0';

const time = (iso: string) => iso.slice(0, 19).replace('T', ' ');
const json = (v: unknown) => JSON.stringify(v, null, 2);

// A clean_events source_medium-ja esemenyenkenti, nem a session forrasa: a landing
// utani sorokon mindig 'direct / none'. Az inspektor ezert nem mutatja.
const withoutSource = (clean: AlignedEvent['clean']) => (clean === null ? null
  : Object.fromEntries(Object.entries(clean).filter(([k]) => k !== 'source_medium')));

// Egy reteg cellaja: megvan vagy nincs. Az ures cella a lenyeg — ott veszett el.
const Mark: React.FC<{ present: boolean }> = ({ present }) => (present ? (
  <>
    <span className="inline-block h-2.5 w-2.5 rounded-sm bg-primary" aria-hidden="true" />
    <span className="sr-only">megvan</span>
  </>
) : (
  <span className="text-on-surface-subtle">
    <span aria-hidden="true">—</span><span className="sr-only">nincs</span>
  </span>
));

const Layer: React.FC<{ title: string; value: unknown }> = ({ title, value }) => (
  <div className="mt-3">
    <div className="t-label-sm text-on-surface-subtle">{title}</div>
    {value === null ? (
      <p className="t-body mt-1 text-on-surface-subtle">Ebben a rétegben nincs meg.</p>
    ) : (
      <pre className="mt-1 overflow-x-auto rounded-sm bg-surface-sunken p-3 text-[12px] leading-relaxed max-md:w-0 max-md:min-w-full">
        <code>{json(value)}</code>
      </pre>
    )}
  </div>
);

const EventRow: React.FC<{ e: AlignedEvent; open: boolean; onToggle: () => void }> = ({ e, open, onToggle }) => (
  <>
    <tr>
      <td className={TD}>
        <button type="button" onClick={onToggle} aria-expanded={open}
                className="whitespace-nowrap text-left text-primary max-md:-my-2.5 max-md:py-2.5">
          <span className="inline-block w-3 font-bold">{open ? '−' : '+'}</span> {e.eventName}
        </button>
        <div className="md:hidden">{FATE_LABEL[e.fate]}</div>
        <div className="pl-3 text-on-surface-subtle max-md:whitespace-nowrap max-md:pl-0 max-md:text-[12px]">{time(e.occurredAt)}</div>
      </td>
      <td className={`${TD} max-md:hidden`}>{FATE_LABEL[e.fate]}</td>
      <td className={TD}><Mark present={e.raw !== null} /></td>
      <td className={TD}><Mark present={e.clean !== null} /></td>
      <td className={`${TD} max-md:whitespace-nowrap`}>
        {e.order && typeof e.order.value === 'number' ? ft(e.order.value) : <Mark present={e.order !== null} />}
      </td>
    </tr>
    {open && (
      <tr>
        <td colSpan={5} className="border-b border-border pb-4 pl-3">
          <Layer title="legyártva" value={e.emitted} />
          <Layer title="raw_events" value={e.raw} />
          <Layer title="clean_events" value={withoutSource(e.clean)} />
          {e.eventName === 'purchase' && <Layer title="orders" value={e.order} />}
        </td>
      </tr>
    )}
  </>
);

// 2. blokk: a vilag harom rogzitett journey-je, retegenkent.
const Inspector: React.FC<{ data: EventsData }> = ({ data }) => {
  const [kind, setKind] = useState<Kind>(KINDS[0]);
  const [openId, setOpenId] = useState<string | null>(null);
  const journey = useMemo(() => alignJourney(kind, data.sample, data.emitted), [kind, data]);

  const choose = (k: Kind) => {
    setKind(k);
    setOpenId(null);
  };
  const persons = [...new Set(journey.events.map(e => e.clean?.person_id).filter(p => typeof p === 'string'))];

  return (
    <>
      <Page className="pb-6">
        <div className="g12 border-t border-border pt-8">
          <div className="c3 pr-8">
            <div className="t-label-sm text-on-surface-subtle">Hova jut az esemény?</div>
          </div>
          <div className="c9">
            <p className="t-body prose-col text-on-surface-muted">
              Három látogató útja a kitalált boltból; ezek nem a fenti kattintásaid. Minden sor
              egy esemény, az oszlopok pedig az állomások, amelyeken át kell jutnia.
            </p>
            <ul className="t-body prose-col mt-3 list-disc pl-5 text-on-surface-muted">
              <li><strong>Legyártva:</strong> megtörtént a boltban.</li>
              <li><code>raw_events</code>: megérkezett a szerverre, még nyersen.</li>
              <li><code>clean_events</code>: megtisztítva, elemzésre készen.</li>
              <li><code>orders</code>: a vásárlásból rendelés lett.</li>
            </ul>
            <p className="t-body prose-col mt-3 text-on-surface-muted">
              Az üres cella mutatja, hol veszett el az esemény. A sorra kattintva azt is látod,
              mi áll róla az egyes állomásokon.
            </p>
          </div>
        </div>
      </Page>

      <Page className="pb-10">
        <div className="g12">
          <div className="c3 pr-8">
            <div className="t-label-sm text-on-surface-subtle">Melyik látogató</div>
            <div className="mt-2 flex flex-col items-stretch gap-y-2">
              {KINDS.map(k => (
                <button key={k} type="button" onClick={() => choose(k)} aria-pressed={k === kind}
                        className={k === kind
                          ? `${TAB} border-primary bg-primary-soft text-primary-dark`
                          : `${TAB} border-border text-primary`}>
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>
          </div>

          <div className="c9 min-w-0 max-md:mt-8">
            <div className="relative overflow-x-auto">
              <table className="t-body w-full border-collapse tabular-nums">
                <caption className="sr-only">{KIND_LABEL[kind]}: események rétegenként</caption>
                <thead>
                  <tr>
                    <th scope="col" className={TH}>Esemény</th>
                    <th scope="col" className={`${TH} max-md:hidden`}>Legyártva</th>
                    <th scope="col" className={TH}><code>raw_<wbr />events</code></th>
                    <th scope="col" className={TH}><code>clean_<wbr />events</code></th>
                    <th scope="col" className={TH}><code>orders</code></th>
                  </tr>
                </thead>
                <tbody>
                  {journey.events.map(e => (
                    <EventRow key={e.eventId} e={e} open={openId === e.eventId}
                              onToggle={() => setOpenId(openId === e.eventId ? null : e.eventId)} />
                  ))}
                </tbody>
              </table>
            </div>

            {kind === 'stitched_two_devices' && (
              <div className="mt-6">
                <div className="t-label-sm text-on-surface-subtle">Összefűzés</div>
                <p className="t-body mt-2 text-on-surface-muted">
                  A mérés eszközöket lát, nem embereket. Ez a vásárló két eszközről is vásárolt,
                  a pipeline ezért a kettőt egy személlyé fűzte össze:{' '}
                  {int(journey.anonymousIds.length)} eszköz, {int(journey.identityLinks.length)}{' '}
                  <code>identity_links</code> sor, a <code>clean_events</code> rétegben{' '}
                  {int(persons.length)} <code>person_id</code>.
                </p>
                <pre className="mt-2 overflow-x-auto rounded-sm bg-surface-sunken p-3 text-[12px] leading-relaxed">
                  <code>{json({ anonymous_ids: journey.anonymousIds, identity_links: journey.identityLinks })}</code>
                </pre>
              </div>
            )}
          </div>
        </div>
      </Page>

      <Page className="pb-10">
        <Readout items={[
          { value: int(journey.counts.emitted), label: 'legyártott esemény ezen az úton' },
          { value: int(journey.counts.raw), label: 'megérkezett a raw_events-be' },
          { value: int(journey.counts.clean), label: 'feldolgozva a clean_events-be' },
          { value: int(journey.counts.orders), label: 'rendelés az orders táblában' },
        ]} />
      </Page>
    </>
  );
};

export default Inspector;
