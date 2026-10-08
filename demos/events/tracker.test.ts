import { describe, expect, it } from 'vitest';
import { makeFrame } from './fakeFrame';

// A public/events/tracker.js az fp-collector trackerenek masolata. Itt host-hid
// NELKUL fut: a hamis ablak storage-a es fetch-e latja, mit tenne egy valodi
// oldalon.
const body = (call: { init: any }) => JSON.parse(call.init.body);

describe('tracker.js consent nelkul', () => {
  it('betolteskor semmit nem tarol es semmit nem kuld', () => {
    const f = makeFrame('?utm_source=google&utm_medium=cpc', ['tracker.js']);
    expect(f.real.local.writes).toEqual([]);
    expect(f.real.session.writes).toEqual([]);
    expect(f.fetched).toEqual([]);
  });

  it('a track() hivas utan sem', () => {
    const f = makeFrame('', ['tracker.js']);
    f.win.track('view_item', { item_id: 'sku-001' });
    expect(f.real.local.writes).toEqual([]);
    expect(f.real.session.writes).toEqual([]);
    expect(f.fetched).toEqual([]);
  });
});

describe('tracker.js consent utan', () => {
  it('a grantConsent() page_view-t kuld, es ekkor jon letre a ket azonosito', () => {
    const f = makeFrame('?utm_source=google&utm_medium=cpc', ['tracker.js']);
    f.win.grantConsent();
    expect(f.fetched).toHaveLength(1);
    expect(f.fetched[0].url).toBe('/v1/events');
    expect(f.fetched[0].init.method).toBe('POST');
    const b = body(f.fetched[0]);
    expect(b.event_name).toBe('page_view');
    expect(b.consent_analytics).toBe(true);
    expect(b.utm_source).toBe('google');
    expect(b.utm_medium).toBe('cpc');
    expect(b.anonymous_id).toBe(f.real.local.store.get('anonymous_id'));
    expect(b.session_id).toBe(f.real.session.store.get('session_id'));
  });

  it('ket esemeny ugyanazt a session_id-t es anonymous_id-t kapja, mas event_id-val', () => {
    const f = makeFrame('', ['tracker.js']);
    f.win.grantConsent();
    f.win.track('view_item', { item_id: 'sku-001' });
    const [a, b] = f.fetched.map(body);
    expect(b.session_id).toBe(a.session_id);
    expect(b.anonymous_id).toBe(a.anonymous_id);
    expect(b.event_id).not.toBe(a.event_id);
    expect(b.payload).toEqual({ item_id: 'sku-001' });
  });

  it('a consent visszavonasa utan nem kuld', () => {
    const f = makeFrame('', ['tracker.js']);
    f.win.grantConsent();
    f.real.local.removeItem('consent_analytics');
    f.win.track('add_to_cart', {});
    expect(f.fetched).toHaveLength(1);
  });
});
