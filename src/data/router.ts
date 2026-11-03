import type { ExploreView, Grouping, Job, QueryPlan, ResultIntent, ScenarioId, SortMode, StudyType } from './types';
import { SCENARIO_MAP, matchQuery } from './scenarios';
import { resolveKnown } from './known';
import { termsFor } from './terms';

/* Маршрутизатор задачи врача.
   Порядок приоритета:
   1. известная публикация (PMID, DOI, точное название, автор и год);
      если рядом просьба найти место в тексте — это find-in-text внутри этой статьи, а не обычная выдача;
   2. цитаты из найденных публикаций;
   3. сравнение двух объектов;
   4. вывод или обзор: передача в Deep Research;
   5. поиск литературы.
   Группировка, приоритет типов и «сначала новые» — пожелания к виду и порядку, а не отдельные задачи. */

const QUOTE = /цитат|точн\S*\s+(?:формулировк|фраз|слов)|(?:найд\S*|покаж\S*)\s+(?:мест[оа]|где)\s|где\s+(?:это\s+)?(?:написано|сказано)/i;
const FIND_HERE = /в\s+(?:этой|данной)\s+статье|(?<![а-яё])где\s+(?:авторы|в\s+тексте|именно|это|написано|сказано|упомина\S*|определя\S*|описыва\S*)|покаж\S*[^.?!]{0,24}(?<![а-яё])где(?![а-яё])|найд\S*\s+(?:в\s+тексте|цитат|фраз|формулировк|упоминани)|точн\S*\s+(?:цитат|формулировк|фраз)|цитат/i;
const COMPARE = /сравн[иея]\S*|сопостав[иь]\S*\s+(?:эффект|подход|препарат|лечени)|что\s+лучше|чем\s+отличает|\bvs\b|\bversus\b|(?<![а-яё])против(?![а-яё])/i;
const SYNTH = /что\s+(?:из\s+[^?.;]{0,70}?)?(?:следует|известно)|какие\s+(?:общие\s+)?выводы|подытожь|обобщи|сделай\s+(?:краткий\s+)?(?:вывод|обзор)|сравни\S*\s+результат|сопостав\S*\s+результат|обзор\s+литератур|краткий\s+обзор/i;
const GROUPED = /в\s+приоритете|приоритет|сгруппир|разложи\s+по|по\s+типам?\s+исследовани|по\s+годам|по\s+полн\S*\s+текст|по\s+темам/i;
const NEWEST = /актуальн|свеж|новейш|сначала\s+нов|последн\S*\s+публикац/i;

const TYPE_RE: [StudyType, RegExp][] = [
  ['ma', /мета-?анализ/i],
  ['sr', /систематическ\S*\s+обзор|обзор/i],
  ['rct', /(?:^|[^а-яё])рки(?![а-яё])|рандомизированн/i],
  ['cohort', /когортн/i],
];

function priorityTypes(t: string): StudyType[] {
  const i = t.search(/приоритет/);
  if (i < 0) return [];
  const clause = t.slice(i).split(/[;.?!]/)[0];
  return TYPE_RE.map(([k, re]) => ({ k, at: clause.search(re) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((x) => x.k);
}

function groupingOf(t: string): Grouping {
  if (/по\s+годам/.test(t)) return 'year';
  if (/по\s+полн\S*\s+текст/.test(t)) return 'fullText';
  if (/по\s+темам/.test(t)) return 'mesh';
  return 'publicationType';
}

/** Фраза, которую врач просит найти в тексте: «…где авторы определяют дефицит железа» → «дефицит железа». */
function phraseOf(raw: string): string | undefined {
  const m = raw.match(/(?<![а-яё])где\s+(?:авторы\s+|в\s+тексте\s+|именно\s+|это\s+)?(?:определя\S*|описыва\S*|упомина\S*|говор\S*\s+(?:о|об|про)|пиш\S*\s+(?:о|об|про)|написано\s+(?:про|о|об)?|сказано\s+(?:про|о|об)?)?\s*(.+?)\s*[.?!]*$/i);
  const q = raw.match(/[«"“]([^»"”]{3,})[»"”]/)?.[1];
  return (m?.[1] ?? q)?.trim() || undefined;
}

export const jobIntent = (job: Job): ResultIntent =>
  job === 'literature-search'
    ? 'explore'
    : job === 'comparison-search'
      ? 'compare'
      : job === 'known-publication'
        ? 'single-publication'
        : job === 'find-in-text'
          ? 'find-in-text'
          : job === 'synthesis-request'
            ? 'synthesis'
            : 'clarify';

export const JOB_NAME: Record<Job, string> = {
  'literature-search': 'Поиск публикаций',
  'comparison-search': 'Сравнение двух подходов',
  'known-publication': 'Известная публикация',
  'find-in-text': 'Поиск в тексте',
  'synthesis-request': 'Вывод по исследованиям',
  'clarification-required': 'Нужно уточнение',
};

export function route(text: string): QueryPlan {
  const raw = text.trim();
  const t = raw.toLowerCase();

  /* 1. Известная публикация. */
  const k = resolveKnown(raw);
  if (k) {
    const scenarioId: ScenarioId | null = k.sc?.id ?? matchQuery(raw) ?? 'cardio';
    const sc = SCENARIO_MAP[scenarioId];
    if (FIND_HERE.test(t)) {
      const phrase = phraseOf(raw);
      return { job: 'find-in-text', intent: 'find-in-text', scenarioId, known: k.ref, find: { scope: 'publication', phrase, terms: phrase ? termsFor(phrase, sc) : [] } };
    }
    return { job: 'known-publication', intent: 'single-publication', scenarioId, known: k.ref };
  }

  const scenarioId = matchQuery(raw);
  const sc = scenarioId ? SCENARIO_MAP[scenarioId] : null;

  /* 2. Цитаты из найденных публикаций. */
  if (QUOTE.test(t) && sc?.quotesConcept) {
    return { job: 'find-in-text', intent: 'find-in-text', scenarioId, find: { scope: 'corpus', terms: [] } };
  }

  /* 3. Сравнение двух объектов. */
  if (sc?.entities && sc.compareIds) {
    const found = sc.entities.filter((e) => e.pattern.test(raw));
    const [a, b] = sc.compareIds;
    const both = found.some((e) => e.id === a) && found.some((e) => e.id === b);
    const between = /(?:диеногест\S*|кок)\s+или\s+/i.test(raw);
    if (both && (COMPARE.test(t) || between)) return { job: 'comparison-search', intent: 'compare', scenarioId };
  }

  /* 4. Вывод или обзор. */
  if (SYNTH.test(t) && sc) {
    const drMode = /обзор/.test(t) ? 'review' : /сравн|сопостав/.test(t) ? 'compare' : 'conclusion';
    return { job: 'synthesis-request', intent: 'synthesis', scenarioId, drMode };
  }

  /* 5. Поиск литературы; пожелания к виду и порядку. */
  const plan: QueryPlan = { job: 'literature-search', intent: 'explore', scenarioId };
  if (GROUPED.test(t) && sc) {
    const priority = priorityTypes(t);
    plan.view = 'grouped' as ExploreView;
    plan.grouping = groupingOf(t);
    if (priority.length) plan.priority = priority;
  }
  if (NEWEST.test(t)) plan.sort = 'newest' as SortMode;
  /* Цитаты просили, а фрагментов для этой темы нет: выдача обычная, но молча подменять задачу нельзя. */
  if (QUOTE.test(t) && sc && !sc.quotesConcept) plan.quotesUnavailable = true;
  return plan;
}
