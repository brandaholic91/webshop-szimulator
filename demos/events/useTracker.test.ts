import { describe, expect, it } from 'vitest';
import { EMPTY_LOG, MAX_CALLS, logReducer, parseHostMessage } from './useTracker';
import type { CallLog, HostMessage } from './useTracker';

const request = (name: string): HostMessage => ({
  type: 'request', method: 'POST', url: '/v1/events', body: JSON.stringify({ event_name: name, payload: {} }),
});
const done = (name: string, sent: number): HostMessage => ({ type: 'done', command: 'track', name, sent });

describe('parseHostMessage', () => {
  it('a host.js harom uzenetet engedi at', () => {
    expect(parseHostMessage({ source: 'events-host', type: 'ready', ok: true })).toEqual({ type: 'ready', ok: true });
    expect(parseHostMessage({
      source: 'events-host', type: 'request', method: 'POST', url: '/v1/events', headers: {}, body: '{}',
    })).toEqual({ type: 'request', method: 'POST', url: '/v1/events', body: '{}' });
    expect(parseHostMessage({
      source: 'events-host', type: 'done', command: 'track', name: 'purchase', sent: 0,
    })).toEqual({ type: 'done', command: 'track', name: 'purchase', sent: 0 });
  });

  it('minden mast eldob', () => {
    expect(parseHostMessage(null)).toBeNull();
    expect(parseHostMessage('ready')).toBeNull();
    expect(parseHostMessage({ type: 'ready', ok: true })).toBeNull();                    // nincs source
    expect(parseHostMessage({ source: 'events-host', type: 'request', method: 'POST' })).toBeNull();
    expect(parseHostMessage({ source: 'events-host', type: 'done', command: 'egyeb', sent: 1 })).toBeNull();
    expect(parseHostMessage({ source: 'events-host', type: 'done', command: 'track', sent: '0' })).toBeNull();
  });
});

describe('logReducer', () => {
  it('egy elfogott keresbol elkuldott sor lesz, a body-bol olvasott nevvel', () => {
    const log = logReducer(EMPTY_LOG, request('page_view'));
    expect(log.sent).toBe(1);
    expect(log.withheld).toBe(0);
    expect(log.calls[0]).toMatchObject({
      id: 1, sent: true, eventName: 'page_view', method: 'POST', url: '/v1/events',
    });
    expect(log.calls[0].body).toEqual({ event_name: 'page_view', payload: {} });
  });

  it('a nulla kerest ado track visszatartott sor; az elkuldott track nem ad uj sort', () => {
    let log = logReducer(EMPTY_LOG, done('view_item', 0));
    expect(log).toMatchObject({ sent: 0, withheld: 1 });
    expect(log.calls[0]).toMatchObject({ sent: false, eventName: 'view_item', body: null });
    log = logReducer(logReducer(log, request('view_item')), done('view_item', 1));
    expect(log).toMatchObject({ sent: 1, withheld: 1 });
    expect(log.calls).toHaveLength(2);
  });

  it('a consent-parancs nulla kerese nem visszatartas', () => {
    const log = logReducer(EMPTY_LOG, { type: 'done', command: 'consent', name: null, sent: 0 });
    expect(log).toEqual(EMPTY_LOG);
  });

  it('a legfrissebb all elol, es a sorszam egyedi', () => {
    let log: CallLog = EMPTY_LOG;
    for (const n of ['page_view', 'view_item', 'add_to_cart']) log = logReducer(log, request(n));
    expect(log.calls.map(c => c.eventName)).toEqual(['add_to_cart', 'view_item', 'page_view']);
    expect(new Set(log.calls.map(c => c.id)).size).toBe(3);
  });

  it('a lista legfeljebb MAX_CALLS sort tart, a szamlalo tovabb szamol', () => {
    let log: CallLog = EMPTY_LOG;
    for (let i = 0; i < MAX_CALLS + 5; i++) log = logReducer(log, request('page_view'));
    expect(log.calls).toHaveLength(MAX_CALLS);
    expect(log.sent).toBe(MAX_CALLS + 5);
  });

  it('nem JSON body-nal sem dob hibat', () => {
    const log = logReducer(EMPTY_LOG, { type: 'request', method: 'POST', url: '/v1/events', body: 'nem json' });
    expect(log.calls[0]).toMatchObject({ sent: true, eventName: 'ismeretlen esemény', body: null });
    expect(logReducer(EMPTY_LOG, { type: 'request', method: 'POST', url: '/x', body: null }).sent).toBe(1);
  });
});
