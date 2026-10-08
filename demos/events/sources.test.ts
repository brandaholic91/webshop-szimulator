import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CHANNELS } from '../world/channels';
import { LANDING, SHOP_PATH, STEPS } from './sources';

describe('sources', () => {
  it('mind a hat csatornanak van landing sora, es masnak nincs', () => {
    expect(Object.keys(LANDING).sort()).toEqual(CHANNELS.map(c => c.slug).sort());
  });

  it('a query string ures, vagy ?-lel kezdodik es utm_source + utm_medium van benne', () => {
    for (const [slug, l] of Object.entries(LANDING)) {
      if (l.search === '') continue;
      const p = new URLSearchParams(l.search);
      expect(l.search.startsWith('?'), slug).toBe(true);
      expect(p.get('utm_source'), slug).toBeTruthy();
      expect(p.get('utm_medium'), slug).toBeTruthy();
    }
  });

  it('a negy gomb a vilag negy e-commerce esemenye, sorrendben', () => {
    expect(STEPS.map(s => s.name)).toEqual(['view_item', 'add_to_cart', 'begin_checkout', 'purchase']);
    expect(STEPS.filter(s => s.primary).map(s => s.name)).toEqual(['purchase']);
  });

  it('a gombok oldala forrasjel nelkuli bolt-utvonal', () => {
    for (const s of STEPS) {
      expect(s.url.startsWith(`${SHOP_PATH}/`), s.name).toBe(true);
      expect(s.url.includes('?'), s.name).toBe(false);
    }
  });

  it('a host.js ugyanazt a bolt-utvonalat hasznalja', () => {
    const host = readFileSync(
      fileURLToPath(new URL('../../public/events/host.js', import.meta.url)), 'utf-8',
    );
    expect(host).toContain(`const SHOP_PATH = '${SHOP_PATH}';`);
  });
});
