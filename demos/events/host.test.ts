import { describe, expect, it } from 'vitest';
import { makeFrame } from './fakeFrame';

// A host-hid es a tracker egyutt, abban a sorrendben, ahogy a host.html betolti.
const SCRIPTS = ['host.js', 'tracker.js'];
const GOOGLE = '?utm_source=google&utm_medium=cpc';
const of = (f: { posted: any[] }, type: string) => f.posted.filter(m => m.type === type);
const lastBody = (f: { posted: any[] }) => JSON.parse(of(f, 'request').at(-1).body);

describe('host.js: semmi nem jut ki', () => {
  it('a valodi storage-hoz es a valodi fetch-hez egy teljes vasarlas alatt sem er hozza', () => {
    const f = makeFrame(GOOGLE, SCRIPTS);
    f.load();
    f.send({ type: 'consent', granted: true });
    f.send({ type: 'track', name: 'view_item', payload: { item_id: 'sku-001' }, url: '/events/bolt/termek/1' });
    f.send({ type: 'track', name: 'purchase', payload: { order_id: 'ord-pelda' }, url: '/events/bolt/koszonjuk' });
    expect(of(f, 'request')).toHaveLength(3);
    expect(f.fetched).toEqual([]);
    expect(f.real.local.writes).toEqual([]);
    expect(f.real.session.writes).toEqual([]);
  });

  it('consent nelkul a potlek-storage is ures marad', () => {
    const f = makeFrame(GOOGLE, SCRIPTS);
    f.send({ type: 'track', name: 'view_item', payload: {}, url: '/events/bolt/termek/1' });
    expect(f.win.localStorage.length).toBe(0);
    expect(f.win.sessionStorage.length).toBe(0);
  });
});

describe('host.js: az uzenet-hid', () => {
  it('betolteskor ready-t kuld, es megmondja, megvan-e a tracker', () => {
    const f = makeFrame('', SCRIPTS);
    f.load();
    expect(of(f, 'ready')).toEqual([{ source: 'events-host', type: 'ready', ok: true }]);

    const ures = makeFrame('', ['host.js']);   // a tracker.js nem toltodott be
    ures.load();
    expect(of(ures, 'ready')[0].ok).toBe(false);
  });

  it('consent nelkul a track parancsbol nulla keres lesz, es ezt jelenti', () => {
    const f = makeFrame('', SCRIPTS);
    f.send({ type: 'track', name: 'add_to_cart', payload: {}, url: '/events/bolt/termek/1' });
    expect(of(f, 'request')).toEqual([]);
    expect(of(f, 'done')).toEqual([
      { source: 'events-host', type: 'done', command: 'track', name: 'add_to_cart', sent: 0 },
    ]);
  });

  it('a consent megadasa egy page_view kerest indit a landing URL-lel', () => {
    const f = makeFrame(GOOGLE, SCRIPTS);
    f.send({ type: 'consent', granted: true });
    const [req] = of(f, 'request');
    expect(req.method).toBe('POST');
    expect(req.url).toBe('/v1/events');
    expect(req.headers).toEqual({ 'Content-Type': 'application/json' });
    const b = JSON.parse(req.body);
    expect(b.event_name).toBe('page_view');
    expect(b.page_url).toBe('http://portfolio.test/events/bolt/' + GOOGLE);
    expect(b.utm_source).toBe('google');
    expect(of(f, 'done').at(-1)).toMatchObject({ command: 'consent', sent: 1 });
  });

  it('a masodik esemenyen mar nincs forrasjel, de a session ugyanaz', () => {
    const f = makeFrame(GOOGLE, SCRIPTS);
    f.send({ type: 'consent', granted: true });
    const elso = lastBody(f);
    f.send({ type: 'track', name: 'view_item', payload: { item_id: 'sku-001' }, url: '/events/bolt/termek/1' });
    const masodik = lastBody(f);
    expect(masodik.event_name).toBe('view_item');
    expect(masodik.page_url).toBe('http://portfolio.test/events/bolt/termek/1');
    expect(masodik.utm_source).toBeNull();
    expect(masodik.utm_medium).toBeNull();
    expect(masodik.session_id).toBe(elso.session_id);
    expect(masodik.anonymous_id).toBe(elso.anonymous_id);
  });

  it('ha a latogato a consent elott tovabblep, a page_view-n mar nincs forrasjel', () => {
    const f = makeFrame(GOOGLE, SCRIPTS);
    f.send({ type: 'track', name: 'view_item', payload: {}, url: '/events/bolt/termek/1' });
    f.send({ type: 'consent', granted: true });
    const b = lastBody(f);
    expect(b.event_name).toBe('page_view');
    expect(b.page_url).toBe('http://portfolio.test/events/bolt/termek/1');
    expect(b.utm_source).toBeNull();
  });

  it('a consent visszavonasa utan a kovetkezo esemeny nem indul el', () => {
    const f = makeFrame('', SCRIPTS);
    f.send({ type: 'consent', granted: true });
    f.send({ type: 'consent', granted: false });
    f.send({ type: 'track', name: 'view_item', payload: {}, url: '/events/bolt/termek/1' });
    expect(of(f, 'request')).toHaveLength(1);
    expect(of(f, 'done').at(-1)).toMatchObject({ command: 'track', sent: 0 });
  });

  it('a visszavonas az azonositokat is torli: ujabb consent utan mas a ket azonosito', () => {
    const f = makeFrame('', SCRIPTS);
    f.send({ type: 'consent', granted: true });
    const elso = lastBody(f);
    f.send({ type: 'consent', granted: false });
    f.send({ type: 'consent', granted: true });
    const masodik = lastBody(f);
    expect(masodik.anonymous_id).not.toBe(elso.anonymous_id);
    expect(masodik.session_id).not.toBe(elso.session_id);
  });

  it('idegen ablak uzenetet es ertelmetlen uzenetet figyelmen kivul hagy', () => {
    const f = makeFrame('', SCRIPTS);
    f.sendFrom({}, { type: 'consent', granted: true });
    f.send(null);
    f.send({ type: 'track' });
    f.send({ type: 'valami' });
    expect(f.posted).toEqual([]);
  });
});
