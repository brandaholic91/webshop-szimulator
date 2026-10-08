import React, { useState } from 'react';
import Page from '../../components/Page';
import { CHANNELS } from '../world/channels';
import { HOST_PATH, LANDING, STEPS } from './sources';
import { useTracker } from './useTracker';
import { int } from './format';

// Az iframe jogai. allow-same-origin nelkul a WebKit (Safari, minden
// iOS-bongeszo) megtiltja a host.js utvonal-cserejet (history.replaceState),
// es a tracker el sem indul.
// A tarolot ezert nem a sandbox, hanem a host.js potleka tartja tavol (36. dontes).
const SANDBOX = 'allow-scripts allow-same-origin';

const BUTTON = 't-label-sm rounded-sm border px-3 py-2 disabled:opacity-50 max-md:min-h-10';
const SECONDARY = `${BUTTON} border-border text-primary`;
const PRIMARY = `${BUTTON} border-secondary bg-secondary text-on-secondary`;

// 1. blokk: az fp-collector trackere fut, a hivasait a lap elfogja.
const LiveTracker: React.FC = () => {
  const [slug, setSlug] = useState(CHANNELS[0].slug);
  const [visit, setVisit] = useState(0);
  const [consent, setConsent] = useState(false);
  const { frame, status, log, track, setConsent: sendConsent } = useTracker(visit);
  const ready = status === 'ready';

  // Egyszerre egy hivas JSON-ja van nyitva, kulonben a lista letolna az
  // inspektort es a fokonyvet. Alapbol a legfrissebb; ha a latogato masikat
  // valaszt, az addig ervenyes, amig uj hivas nem jon (akkor megint a legfrissebb).
  const newest = log.calls[0]?.id ?? null;
  const [picked, setPicked] = useState<{ id: number | null; newest: number | null } | null>(null);
  const openId = picked && picked.newest === newest ? picked.id : newest;
  const toggle = (id: number) => setPicked({ id: openId === id ? null : id, newest });

  // Csatornavaltas = uj latogatas: uj iframe, benne ures storage, consent nelkul.
  const changeChannel = (next: string) => {
    setSlug(next);
    setVisit(v => v + 1);
    setConsent(false);
  };
  const toggleConsent = (granted: boolean) => {
    setConsent(granted);
    sendConsent(granted);
  };

  return (
    <>
    <Page className="pb-6">
      <div className="g12 border-t border-border pt-8">
        <div className="c3 pr-8">
          <div className="t-label-sm text-on-surface-subtle">Mit küld a tracker?</div>
        </div>
        <div className="c9">
          <p className="t-body prose-col text-on-surface-muted">
            Itt te vagy a látogató. Válaszd ki, honnan érkezel, majd nyomd végig a bolt gombjait.
            Jobbra megjelenik, mit küld a tracker az egyes lépéseknél; a sorra kattintva a
            teljes üzenetet is látod.
          </p>
          <p className="t-body prose-col mt-3 text-on-surface-muted">
            Próbáld ki consent nélkül is: akkor a tracker semmit nem küld. A kérés valójában
            egyik esetben sem megy ki a hálózatra, a lap elfogja és megmutatja.
          </p>
        </div>
      </div>
    </Page>
    <Page className="pb-10">
      <div className="g12">
        <div className="c3 pr-8">
          <label className="block">
            <span className="t-label-sm text-on-surface-subtle">Honnan jön a látogató</span>
            <select value={slug} onChange={e => changeChannel(e.target.value)}
                    aria-describedby="events-channel-signal"
                    className="t-body mt-2 block w-full rounded-sm border border-border bg-surface px-2 py-2 max-md:min-h-10">
              {CHANNELS.map(c => <option key={c.slug} value={c.slug}>{c.title}</option>)}
            </select>
          </label>
          <p id="events-channel-signal" className="t-body mt-2 text-on-surface-muted">{LANDING[slug].signal}</p>

          <label className="mt-6 flex items-center gap-x-3 max-md:-mb-3 max-md:mt-3 max-md:py-3">
            <input type="checkbox" role="switch" checked={consent} disabled={!ready}
                   onChange={e => toggleConsent(e.target.checked)} />
            <span className="t-label-sm text-on-surface">
              Consent: {consent ? 'megadva' : 'nincs megadva'}
            </span>
          </label>

          <div className="t-label-sm mt-6 text-on-surface-subtle">A bolt</div>
          <div className="mt-2 flex flex-col items-start gap-y-2">
            {STEPS.map(s => (
              <button key={s.name} type="button" disabled={!ready}
                      onClick={() => track(s.name, s.payload, s.url)}
                      className={s.primary ? PRIMARY : SECONDARY}>
                {s.label}
              </button>
            ))}
          </div>
          <p className="t-body prose-col mt-6 text-on-surface-muted">
            A termék és a rendelés értéke <strong>példa</strong>, nem a bolt adata: a payload
            alakját mutatja. Az itt keletkező esemény nem megy át a pipeline-on.
          </p>

          <iframe key={visit} ref={frame} src={HOST_PATH + LANDING[slug].search} sandbox={SANDBOX}
                  title="A tracker futtatókörnyezete" aria-hidden="true" tabIndex={-1}
                  className="absolute h-0 w-0 border-0" />
        </div>

        <div className="c9 min-w-0 max-md:mt-8">
          {/* Mobilon a cimke rovid, a szamlalo alatta sima sorkent all (kulonben 4 sornyi verzal). */}
          <div className="t-label-sm text-on-surface-subtle" role="status">
            A tracker hívásai{' '}
            <span className="max-md:hidden">·{' '}</span>
            <span className="max-md:mt-1 max-md:block max-md:text-[14px] max-md:leading-[1.55] max-md:font-normal max-md:tracking-normal max-md:normal-case max-md:text-on-surface-muted max-md:first-letter:uppercase">
              a saját kattintásaidból ebben a munkamenetben:{' '}
              <span className="tabular-nums text-on-surface">{int(log.sent)}</span> elküldött,{' '}
              <span className="tabular-nums text-on-surface">{int(log.withheld)}</span> visszatartott
            </span>
          </div>

          {status === 'failed' && (
            <p className="t-body mt-4 text-on-surface-muted">
              A tracker nem töltődött be, ezért a gombok nem élnek. Töltsd újra az oldalt.
            </p>
          )}
          {status !== 'failed' && log.calls.length === 0 && (
            <p className="t-body mt-4 text-on-surface-subtle">
              Még nem volt hívás. Kapcsold be a consentet, vagy nyomj meg egy gombot nélküle.
            </p>
          )}

          <ol className="mt-4">
            {log.calls.map(c => (
              <li key={c.id} className="border-t border-border py-3">
                {c.sent ? (
                  <>
                    <div className="t-body text-on-surface">
                      <button type="button" onClick={() => toggle(c.id)} aria-expanded={openId === c.id}
                              className="whitespace-nowrap text-left text-primary max-md:-my-2.5 max-md:py-2.5">
                        <span className="inline-block w-3 font-bold">{openId === c.id ? '−' : '+'}</span>{' '}
                        <code>{c.eventName}</code>
                      </button>
                      {' '}· <strong>{c.method}</strong> <code>{c.url}</code> · elfogva, a hálózatra nem ment ki
                    </div>
                    {openId === c.id && (
                      <pre className="mt-2 overflow-x-auto rounded-sm bg-surface-sunken p-3 text-[12px] leading-relaxed">
                        <code>{JSON.stringify(c.body, null, 2)}</code>
                      </pre>
                    )}
                  </>
                ) : (
                  <div className="t-body text-on-surface-muted">
                    <span className="inline-block w-3" />{' '}
                    <code>{c.eventName}</code> · a hívás el sem indult: nincs consent
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Page>
    </>
  );
};

export default LiveTracker;
