// A hat csatorna egyetlen forrasa a TS-oldalon. A slug egyezik a
// world/src/world/config.py ALL_SLUGS-javal, es a sorrend is.
//
// A DESIGN.md szabalya: a kategorikus szin az ENTITAST koveti, sosem a
// rangsort. Ha egy szuro megvaltoztatja a csatornak szamat, a megmaradok NEM
// szinezodnek at — ezert all a szin itt, fixen, es nem indexbol szamolodik.

export interface Channel {
  slug: string;
  title: string;
  kind: 'paid' | 'unpaid';
  cssVar: string;
}

export const CHANNELS: readonly Channel[] = [
  { slug: 'google_ads', title: 'Google Ads', kind: 'paid',   cssVar: '--color-viz-cat-4' },
  { slug: 'meta_ads',   title: 'Meta Ads',   kind: 'paid',   cssVar: '--color-viz-cat-2' },
  { slug: 'arukereso',  title: 'Árukereső',  kind: 'paid',   cssVar: '--color-viz-cat-1' },
  { slug: 'organic',    title: 'Organikus',  kind: 'unpaid', cssVar: '--color-viz-cat-5' },
  { slug: 'direct',     title: 'Direct',     kind: 'unpaid', cssVar: '--color-viz-cat-3' },
  { slug: 'email',      title: 'E-mail',     kind: 'unpaid', cssVar: '--color-viz-cat-6' },
];

export const PAID = CHANNELS.filter(c => c.kind === 'paid');

export const channelColor = (slug: string): string => {
  const ch = CHANNELS.find(c => c.slug === slug);
  return ch ? `var(${ch.cssVar})` : 'var(--color-viz-neutral-mass)';
};
