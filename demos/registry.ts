// A nyolc muszer egyetlen forrasa: slug, szam, cim, kerdes, lede, statusz.
// A 'question' a nyitolap regiszterenek kozertheto sora (laikusnak is ertheto
// kerdes), a 'lede' a muszer-oldal szakmai alcime.
// A sorrend a MEGJELENITESI sorrend (PLAN.md > Lineup > A regiszter), nem az
// epitesi. A 22. dontes szerint mind a nyolc benne van; csak a 'live' sorok
// linkek. Egy muszer elesitese = a status atirasa 'live'-ra.

import type React from 'react';
import World from './world/World';
import Peek from './peek/Peek';
import Events from './events/Events';
import Attribution from './attribution/Attribution';

export type InstrumentStatus = 'live' | 'wip' | 'todo';

export interface Instrument {
  slug: string;
  num: string;
  title: string;
  lede: string;
  question: string;
  status: InstrumentStatus;
  component?: React.ComponentType;
}

export const instruments: Instrument[] = [
  {
    slug: 'world',
    num: '01.1',
    title: 'A bolt',
    lede: 'Mennyit hozott valójában egy hirdetési csatorna? Egy kitalált webshopban ez pontosan megmondható.',
    question: 'A kitalált webshop, és amit biztosan tudok róla',
    status: 'live',
    component: World,
  },
  {
    slug: 'events',
    num: '01.2',
    title: 'Mérés',
    lede: 'Mit lát a mérés abból, ami a boltban történik? Ami hozzájárulás nélkül történik, az nem jut el az adatbázisig.',
    question: 'Mi jut el egy látogatásból az adatbázisig, és mit állít meg a hozzájárulás hiánya',
    status: 'live',
    component: Events,
  },
  {
    slug: 'attribution',
    num: '01.3',
    title: 'Attribúció',
    lede: 'Melyik hirdetés hozta a vásárlást? Négy elterjedt számítási mód négy választ ad, itt pedig a helyes is ismert.',
    question: 'Melyik hirdetés hozta a vásárlást? Négy számítási mód, négy válasz',
    status: 'live',
    component: Attribution,
  },
  {
    slug: 'peek',
    num: '01.4',
    title: 'Kísérlet',
    lede: 'Mi történik, ha egy A/B teszt eredményére idő előtt ránéznek? A véletlen is győztesnek látszhat, a valódi hatás pedig rejtve maradhat.',
    question: 'Mi történik, ha egy A/B teszt eredményébe idő előtt belenéznek',
    status: 'live',
    component: Peek,
  },
  {
    slug: 'segments',
    num: '01.5',
    title: 'Szegmensek',
    lede: 'Klaszter-visszanyerés latens típusokra',
    question: 'Megtalálja-e a gép a vásárlótípusokat, amelyeket a világba írtam',
    status: 'wip',
  },
  {
    slug: 'forecast',
    num: '01.6',
    title: 'Előrejelzés',
    lede: 'Hiba és intervallum-lefedettség',
    question: 'Mennyit téved a forgalom előrejelzése',
    status: 'wip',
  },
  {
    slug: 'mmm',
    num: '01.7',
    title: 'Budget',
    lede: 'Adstock, szaturáció, paraméter-visszanyerés',
    question: 'Hol nem hoz már többet a több hirdetési pénz',
    status: 'wip',
  },
  {
    slug: 'clv',
    num: '01.8',
    title: 'Élettartam',
    lede: 'CLV-kalibráció a leszimulált élettartamhoz',
    question: 'Mennyit ér egy vásárló a teljes vásárlói élete alatt',
    status: 'wip',
  },
];

export const findInstrument = (slug: string): Instrument | undefined =>
  instruments.find(i => i.slug === slug);
