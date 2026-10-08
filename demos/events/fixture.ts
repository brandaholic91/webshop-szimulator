// Kezzel irt mini-vilag a tesztekhez; a lap soha nem olvassa. Az alakja a ket
// valodi fajle (world/out/events_sample.json, events_emitted.json), a tartalma
// kitalalt: harom journey, bennuk mind a harom sors.
import type { Emitted, EmittedEvent, Fate, Sample } from './journey';

const ev = (
  id: string, name: string, minute: number, device: string, session: string, fate: Fate,
  extra: Record<string, unknown> = {},
): EmittedEvent => ({
  event_id: id,
  event_name: name,
  occurred_at: `2023-01-01T10:${String(minute).padStart(2, '0')}:00+00:00`,
  session_id: session,
  anonymous_id: device,
  page_url: 'https://bolt.example/',
  consent_analytics: fate !== 'withheld',
  payload: {},
  fate,
  ...extra,
});

export const EMITTED: Emitted = {
  schema_version: 1,
  journeys: [
    {
      kind: 'stitched_two_devices',
      emitted_events: [
        ev('a1', 'page_view', 0, 'dev-A', 's1', 'sent', { utm_source: 'google', utm_medium: 'cpc' }),
        ev('a2', 'purchase', 1, 'dev-A', 's1', 'sent_twice'),
        ev('a3', 'page_view', 2, 'dev-B', 's2', 'sent'),
        ev('a4', 'purchase', 3, 'dev-B', 's2', 'sent'),
      ],
    },
    {
      kind: 'anonymous',
      emitted_events: [
        ev('b1', 'page_view', 0, 'dev-C', 's3', 'sent'),
        ev('b2', 'add_to_cart', 1, 'dev-C', 's3', 'sent'),
      ],
    },
    {
      kind: 'no_consent',
      emitted_events: [
        ev('c1', 'page_view', 0, 'dev-D', 's4', 'withheld'),
        ev('c2', 'purchase', 1, 'dev-D', 's4', 'withheld'),
      ],
    },
  ],
};

const arrived = (id: string, name: string, device: string, session: string) => ({
  event_id: id, event_name: name, anonymous_id: device, session_id: session,
});

export const SAMPLE: Sample = {
  schema_version: 1,
  journeys: [
    {
      kind: 'stitched_two_devices',
      raw_events: [
        arrived('a1', 'page_view', 'dev-A', 's1'), arrived('a2', 'purchase', 'dev-A', 's1'),
        arrived('a3', 'page_view', 'dev-B', 's2'), arrived('a4', 'purchase', 'dev-B', 's2'),
      ],
      clean_events: [
        { ...arrived('a1', 'page_view', 'dev-A', 's1'), source_medium: 'google / cpc', person_id: 'cust-1' },
        { ...arrived('a2', 'purchase', 'dev-A', 's1'), source_medium: 'direct / none', person_id: 'cust-1' },
        { ...arrived('a3', 'page_view', 'dev-B', 's2'), source_medium: 'direct / none', person_id: 'cust-1' },
        { ...arrived('a4', 'purchase', 'dev-B', 's2'), source_medium: 'direct / none', person_id: 'cust-1' },
      ],
      orders: [
        { order_id: 'ord-1', event_id: 'a2', value: 10000, currency: 'HUF', customer_key: 'cust-1' },
        { order_id: 'ord-2', event_id: 'a4', value: 20000, currency: 'HUF', customer_key: 'cust-1' },
      ],
      identity_links: [
        { anonymous_id: 'dev-A', customer_key: 'cust-1' },
        { anonymous_id: 'dev-B', customer_key: 'cust-1' },
      ],
    },
    {
      kind: 'anonymous',
      raw_events: [arrived('b1', 'page_view', 'dev-C', 's3'), arrived('b2', 'add_to_cart', 'dev-C', 's3')],
      clean_events: [
        { ...arrived('b1', 'page_view', 'dev-C', 's3'), source_medium: 'direct / none', person_id: 'dev-C' },
        { ...arrived('b2', 'add_to_cart', 'dev-C', 's3'), source_medium: 'direct / none', person_id: 'dev-C' },
      ],
      orders: [],
      identity_links: [],
    },
  ],
};
