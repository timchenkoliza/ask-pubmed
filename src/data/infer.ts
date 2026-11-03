import type { ConstraintKind, Params, QueryPlan, Scenario, StudyType } from './types';
import { NOW_YEAR, cloneParams } from './scenarios';
import { addLexicon, stems } from './terms';

/* Разбор свободного текста в параметры поиска.
   Для исходных запросов сценариев параметры берутся из сценария без изменений.
   Для любой другой формулировки типы, период и полный текст читаются из текста вместе с весом условия:
   «только РКИ» и «за последние 5 лет» — REQUIRED, «желательно», «в приоритете» — PREFERRED. */

const word = (re: string) => new RegExp(`(?:^|[^а-яёa-z])(?:${re})(?![а-яёa-z])`, 'i');

const PREFER = /желательно|предпочтительно|в\s+приоритете|приоритетн\S*|лучше\s+всего|лучше|хотелось\s+бы|по\s+возможности/gi;
const REQUIRE = /только|обязательно|строго|исключительно|непременно|должн\S*/gi;
const CONSTRAINT_WORD = /мета-?анализ|обзор|рки|рандомизированн|когортн|за\s+(?:последни\S*\s+)?\d+|за\s+последни\S*\s+год|последни\S*\s+\d+|не\s+старше|с\s+(?:19|20)\d\d|полн\S*\s+текст/i;

/** Вес условия, которое начинается в тексте с позиции `at`: смотрим на слово перед ним в пределах одной части фразы. */
export function kindAt(t: string, at: number): 'REQUIRED' | 'PREFERRED' {
  const raw = t.slice(Math.max(0, at - 40), at);
  const cut = Math.max(raw.lastIndexOf(','), raw.lastIndexOf(';'), raw.lastIndexOf('.'), raw.lastIndexOf(':'), raw.lastIndexOf('—'));
  const win = raw.slice(cut + 1);
  let last: { kind: 'REQUIRED' | 'PREFERRED'; end: number } | null = null;
  for (const m of win.matchAll(PREFER)) last = { kind: 'PREFERRED', end: (m.index ?? 0) + m[0].length };
  for (const m of win.matchAll(REQUIRE)) {
    const end = (m.index ?? 0) + m[0].length;
    if (!last || end > last.end) last = { kind: 'REQUIRED', end };
  }
  if (!last) return 'REQUIRED';
  /* Другое условие между словом-весом и этим условием: вес относится к тому, что ближе к нему. */
  if (CONSTRAINT_WORD.test(win.slice(last.end))) return 'REQUIRED';
  return last.kind;
}

/* Срок публикаций. Прототип считает его в годах назад от текущего года: «за 3 года», «три года», «последние 2 года»,
   «не старше 3 лет» (если рядом нет слов о пациентах: «дети не старше 3 лет» — это возраст, а не срок публикаций),
   «с 2022 года», «после 2021». Точный год или диапазон («за 2024 год», «2020–2022») считается от начала: до сегодняшнего дня. */
const MAX_YEARS = 30;
const WORDS: Record<string, number> = {
  один: 1, одного: 1, два: 2, две: 2, три: 3, трех: 3, четыре: 4, четырех: 4, пять: 5, пяти: 5, шесть: 6, шести: 6,
  семь: 7, семи: 7, восемь: 8, восьми: 8, девять: 9, девяти: 9, десять: 10, десяти: 10, пятнадцать: 15, пятнадцати: 15, двадцать: 20, двадцати: 20,
};
const NUM = `(\\d{1,2}|${Object.keys(WORDS).join('|')})`;
const YEARS = `\\s*(?:год|лет)`;
const LEAD = '(^|[^а-яеa-z0-9])';
const AGE_WORD = /дет|ребен|ребён|младен|новорожд|пациент|больн|возраст|взросл|подрост|женщин|мужчин|пожил|людей/;
const clampYears = (n: number) => Math.min(MAX_YEARS, Math.max(1, n));
const numOf = (s: string) => (/^\d/.test(s) ? Number(s) : WORDS[s]);
const sinceYear = (y: number) => (y >= 1990 && y <= NOW_YEAR ? clampYears(NOW_YEAR - y) : null);

export function parsePeriod(text: string): { period: number | null; at: number } | null {
  const t = text.replace(/ё/g, 'е');
  if (/любой\s+период|без\s+ограничени\S*\s+по\s+времени/.test(t)) return { period: null, at: 0 };
  const at = (m: RegExpMatchArray) => (m.index ?? 0) + m[1].length;

  let m = t.match(new RegExp(`${LEAD}(?:за|в\\s+течение)\\s+(?:последни\\S*\\s+)?${NUM}${YEARS}`));
  if (m) return { period: clampYears(numOf(m[2])), at: at(m) };
  m = t.match(new RegExp(`${LEAD}последни\\S*\\s+${NUM}${YEARS}`));
  if (m) return { period: clampYears(numOf(m[2])), at: at(m) };
  m = t.match(new RegExp(`${LEAD}(?:не\\s+(?:старше|более|давнее)|не\\s+больше)\\s+${NUM}${YEARS}`));
  if (m && !AGE_WORD.test(t.slice(Math.max(0, (m.index ?? 0) - 35), m.index ?? 0))) {
    return { period: clampYears(numOf(m[2])), at: at(m) };
  }
  if (/(^|[^а-яеa-z])за\s+последни\S*\s+год/.test(t)) return { period: 1, at: t.search(/за\s+последни\S*\s+год/) };

  m = t.match(new RegExp(`${LEAD}(?:с|со|начиная\\s+с)\\s+((?:19|20)\\d\\d)(?![\\d])`));
  if (m) {
    const n = sinceYear(Number(m[2]));
    if (n) return { period: n, at: at(m) };
  }
  m = t.match(new RegExp(`${LEAD}(?:после|позже)\\s+((?:19|20)\\d\\d)(?![\\d])`));
  if (m) {
    const n = sinceYear(Number(m[2]) + 1);
    if (n) return { period: n, at: at(m) };
  }
  m = t.match(new RegExp(`${LEAD}(?:за|в|от)\\s+((?:19|20)\\d\\d)\\s*(?:года|году|год|г\\b)`));
  if (m) {
    const n = sinceYear(Number(m[2]));
    if (n) return { period: n, at: at(m) };
  }
  m = t.match(new RegExp(`${LEAD}((?:19|20)\\d\\d)\\s*[–—-]\\s*(?:19|20)\\d\\d`));
  if (m) {
    const n = sinceYear(Number(m[2]));
    if (n) return { period: n, at: at(m) };
  }
  return null;
}

export function inferParams(text: string, sc: Scenario, plan?: QueryPlan): Params {
  let p = cloneParams(sc.baseParams);
  /* Цитаты включаются только если врач о них попросил. */
  if (sc.quotesConcept) {
    const on = plan?.job === 'find-in-text' && plan.find?.scope === 'corpus';
    p.concepts = p.concepts.map((c) => (c.id === sc.quotesConcept ? { ...c, active: on } : c));
  }
  const t = text.trim().toLowerCase();
  if (t === sc.query.trim().toLowerCase()) return p;

  /* Необязательные понятия сценария (исходы, уточнения) наследуются только если врач о них сказал:
     запрос «Витамин D при ОРВИ у детей» не должен тянуть из соседнего сценария «Лечение и профилактика». */
  const flat = t.replace(/ё/g, 'е');
  p.concepts = p.concepts.map((c) => (c.active && c.optional && !stems(c.label).some((x) => flat.includes(x)) ? { ...c, active: false } : c));

  p = addLexicon(p, sc, text);

  const found: { type: StudyType; kind: ConstraintKind }[] = [];
  const TYPES: [StudyType, string][] = [
    ['ma', 'мета-?анализ\\S*'],
    ['sr', 'систематическ\\S*\\s+обзор\\S*|обзор\\S*'],
    ['rct', 'рки|рандомизированн\\S*'],
    ['cohort', 'когортн\\S*'],
  ];
  /* «Сделай краткий обзор литературы» — это задача, а не тип исследования. */
  const tt = t.replace(/(?:сделай\s+)?(?:краткий\s+)?обзор\S*\s+литератур\S*|сделай\s+(?:краткий\s+)?обзор\S*|краткий\s+обзор\S*/g, (m) => ' '.repeat(m.length));
  for (const [type, re] of TYPES) {
    const m = tt.match(word(re));
    if (m && m.index !== undefined) found.push({ type, kind: kindAt(tt, m.index + (m[0].length - m[0].trimStart().length)) });
  }
  if (found.length) {
    const wanted = found.filter((f) => f.kind === 'PREFERRED').map((f) => f.type);
    const must = found.filter((f) => f.kind === 'REQUIRED').map((f) => f.type);
    if (plan?.priority?.length) {
      /* «В приоритете» задаёт порядок и желательность, а не отбор: допустимые типы остаются прежними. */
      p.preferTypes = plan.priority;
      p.types = [...new Set([...p.types, ...plan.priority])];
    } else if (wanted.length && !must.length) {
      p.preferTypes = wanted;
      p.types = [...new Set([...p.types, ...wanted])];
    } else {
      p.types = must;
      p.preferTypes = wanted;
      if (wanted.length) p.types = [...new Set([...must, ...wanted])];
    }
  }

  const per = parsePeriod(t);
  if (per) {
    p.period = per.period;
    if (per.period !== null) p.periodKind = kindAt(t, per.at);
  }

  const ft = t.match(/полн\S*\s+текст/);
  if (ft && ft.index !== undefined) {
    p.fullTextOnly = true;
    p.fullTextKind = kindAt(t, ft.index);
  }
  return p;
}
