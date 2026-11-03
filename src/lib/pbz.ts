import type { StudyType } from '../data/types';
import type { Pub, Scenario } from '../data/types';

/* ПБЗ: ответ на вопрос по найденному. Текст собирается из данных найденных публикаций (резюме темы, фрагменты, тип, год),
   без отдельной модели: в прототипе важно показать, как работа продолжается в том же треде, а не придумать новый ответ. */

export interface PbzAnswer { text: string; sources: string[] }

export const PBZ_PROMPTS = ['Кратко: что говорят найденные работы?', 'Чем различаются подходы в этих работах?', 'С каких работ начать читать?'];
export const PBZ_PROMPTS_ONE = ['О чём эта статья в двух предложениях?', 'Какие у неё ограничения?', 'Что она значит для практики?'];

/** Название типа в единственном числе: в ответе ПБЗ он стоит рядом с годом конкретной работы. */
const TYPE_ONE: Record<StudyType, string> = { sr: 'систематический обзор', ma: 'метаанализ', rct: 'РКИ', cohort: 'когортное исследование' };

const TYPE_ORDER = { ma: 0, sr: 1, rct: 2, cohort: 3 } as const;
const firstSentence = (s: string) => (s.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? s).trim();

/** Источники: сначала обзоры и метаанализы, внутри — свежие. */
export function topSources(items: Pub[], n: number): Pub[] {
  return [...items].sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || b.year - a.year).slice(0, n);
}

const ruFragment = (p: Pub) => p.fragmentRu ?? firstSentence(p.abstractRu ?? p.abstract ?? '');

/* Вопрос своими словами сопоставляется с текстом найденных работ по корням слов (и нескольким близким словам),
   чтобы разные вопросы давали разные ответы, а там, где ответа в найденном нет, об этом говорилось прямо. */
const SYN: Record<string, string[]> = {
  безоп: ['нежелательн', 'побочн', 'безопасн'],
  побоч: ['нежелательн', 'побочн'],
  нежел: ['нежелательн', 'побочн'],
  эффек: ['эффектив', 'боль', 'исход'],
  длите: ['длительн', 'непрерывн'],
  реци: ['рецидив'],
  боли: ['боль'],
  болев: ['боль'],
};
const STOP = new Set(['что', 'как', 'при', 'про', 'есть', 'этих', 'этой', 'этот', 'каких', 'какие', 'какой', 'можно', 'нужно', 'если', 'или', 'было', 'будет', 'работ', 'работы', 'найден', 'найде']);
const stemsOf = (q: string) => (q.toLowerCase().match(/[а-яё]{4,}/g) ?? []).filter((w) => !STOP.has(w)).map((w) => w.slice(0, 5));
const hay = (p: Pub) => `${p.titleRu ?? ''} ${p.abstractRu ?? ''} ${p.fragmentRu ?? ''}`.toLowerCase();
const relevance = (p: Pub, st: string[]) => st.reduce((n, w) => n + ((SYN[w] ?? [w]).some((t) => hay(p).includes(t)) ? 1 : 0), 0);
const STOCK = /^(кратко|чем различаются|с каких работ)/i;

export function answerFor(sc: Scenario, items: Pub[], question: string, short: boolean, one?: Pub | null): PbzAnswer {
  const q = question.toLowerCase();
  if (one) {
    const body = one.abstractRu ?? one.abstract;
    return { text: body ? (short ? firstSentence(body) : body) : 'У этой записи нет abstract, поэтому ответить по тексту нельзя. Откройте статью и проверьте полный текст', sources: [one.id] };
  }
  if (!items.length) return { text: 'В найденном нет публикаций, на которые можно опереться. Измените условия поиска или задайте вопрос без привязки к статьям', sources: [] };
  const src = topSources(items, short ? 3 : 5);
  if (/начать|читать|первы/.test(q)) {
    const list = src.slice(0, 3).map((p, i) => `[${i + 1}] ${TYPE_ONE[p.type]}, ${p.year}`).join('; ');
    return { text: `Начните с обзоров и метаанализов, они охватывают больше работ: ${list}. Исходные исследования читайте после них`, sources: src.slice(0, 3).map((p) => p.id) };
  }
  if (/различ/.test(q)) {
    const list = src.map((p, i) => `[${i + 1}] ${TYPE_ONE[p.type]}, ${p.year}`).join('; ');
    return { text: `Работы различаются по дизайну и году: ${list}. Что именно сравнивали и с какими результатами, видно во фрагментах источников`, sources: src.map((p) => p.id) };
  }
  if (!STOCK.test(question.trim())) {
    const st = stemsOf(question);
    /* Слова с известными синонимами — суть вопроса (безопасность, рецидив): совпасть должны они, остальные слова только уточняют. */
    const key = st.filter((w) => SYN[w]);
    const use = key.length ? key : st;
    const ranked = use.length ? [...items].map((p) => ({ p, n: relevance(p, use) })).sort((a, b) => b.n - a.n || b.p.year - a.p.year) : [];
    const need = key.length ? key.length : Math.max(1, Math.ceil(use.length / 2));
    const hit = ranked.filter((r) => r.n >= need).slice(0, 3).map((r) => r.p);
    if (hit.length) return { text: `В найденных работах по этому вопросу есть: ${hit.map((p, i) => `${ruFragment(p)} [${i + 1}]`).join(' ')}`, sources: hit.map((p) => p.id) };
    return { text: `В найденных публикациях прямого ответа на этот вопрос нет. Ближайшие по теме: ${src.slice(0, 3).map((_, i) => `[${i + 1}]`).join('')}. Уточните вопрос или поищите ещё в PubMed`, sources: src.slice(0, 3).map((p) => p.id) };
  }
  const lead = sc.summary.replace(/[.\s]+$/, '');
  if (short) return { text: `${lead} ${src.map((_, i) => `[${i + 1}]`).join('')}`, sources: src.map((p) => p.id) };
  return { text: `${lead}. ${src.map((p, i) => `${ruFragment(p)} [${i + 1}]`).join(' ')}`, sources: src.map((p) => p.id) };
}
