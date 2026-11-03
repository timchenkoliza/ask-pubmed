import type { Pub, Scenario } from '../data/types';
import { plural } from './typo';

/* Deep Research: режимы и план исследования. План собирается из того, что передано: запрос, понятия, число публикаций и полных текстов. */

export type DrMode = 'search' | 'brief' | 'review';

export const DR_MODES: { id: DrMode; name: string; text: string; result: string }[] = [
  { id: 'search', name: 'Поиск статей', text: 'Подберём публикации по нескольким формулировкам и источникам, без связного текста', result: 'Собрать список публикаций с пояснениями' },
  { id: 'brief', name: 'Краткий обзор', text: 'Короткий связный ответ со ссылками на публикации', result: 'Написать краткий обзор со ссылками' },
  { id: 'review', name: 'Обзорная статья', text: 'Развёрнутый обзор с разделами и списком литературы', result: 'Написать обзорную статью с разделами и списком литературы' },
];

export const modeOf = (id: DrMode) => DR_MODES.find((m) => m.id === id)!;

export function stepsOf(mode: DrMode, items: Pub[], web: boolean): string[] {
  const n = items.length;
  const ft = items.filter((p) => p.fullTextState === 'pmc-full-text').length;
  const steps = [
    `Проверить, хватает ли найденных ${n} ${plural(n, 'публикации', 'публикаций', 'публикаций')} для вопроса`,
    web ? 'Дополнить поиск другими формулировками, источниками Яндекс Мед и интернетом' : 'Дополнить поиск другими формулировками и источниками Яндекс Мед',
  ];
  if (mode !== 'search') steps.push(`Прочитать полные тексты: ${ft} из ${n}`, 'Сопоставить результаты и расхождения между работами');
  steps.push(modeOf(mode).result);
  return steps;
}

export const defaultMode = (plan: 'review' | 'compare' | 'conclusion' | undefined): DrMode => (plan === 'review' ? 'review' : 'brief');

export function resultOf(sc: Scenario, items: Pub[]): { summary: string; points: { pub: Pub; text: string }[] } {
  const order = { ma: 0, sr: 1, rct: 2, cohort: 3 } as const;
  const src = [...items].filter((p) => p.fragment).sort((a, b) => order[a.type] - order[b.type] || b.year - a.year).slice(0, 4);
  return { summary: sc.summary, points: src.map((p) => ({ pub: p, text: p.fragmentRu ?? p.fragment! })) };
}
