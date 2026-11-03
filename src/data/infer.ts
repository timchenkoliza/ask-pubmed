import type { ConstraintKind, Params, QueryPlan, Scenario, StudyType } from './types';
import { cloneParams } from './scenarios';
import { addLexicon, stems } from './terms';

/* Разбор свободного текста в параметры поиска.
   Для исходных запросов сценариев параметры берутся из сценария без изменений.
   Для любой другой формулировки типы, период и полный текст читаются из текста вместе с весом условия:
   «только РКИ» и «за последние 5 лет» — REQUIRED, «желательно», «в приоритете» — PREFERRED. */

const word = (re: string) => new RegExp(`(?:^|[^а-яёa-z])(?:${re})(?![а-яёa-z])`, 'i');

const PREFER = /желательно|предпочтительно|в\s+приоритете|приоритетн\S*|лучше\s+всего|лучше|хотелось\s+бы|по\s+возможности/gi;
const REQUIRE = /только|обязательно|строго|исключительно|непременно|должн\S*/gi;
const CONSTRAINT_WORD = /мета-?анализ|обзор|рки|рандомизированн|когортн|за\s+(?:последни\S*\s+)?\d+|за\s+последни\S*\s+год|полн\S*\s+текст/i;

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

  if (/любой\s+период|без\s+ограничени\S*\s+по\s+времени/.test(t)) p.period = null;
  const n = t.match(/за\s+(?:последни\S*\s+)?(\d+)\s*(?:год|лет)/);
  if (n && n.index !== undefined) {
    p.period = Math.min(20, Math.max(1, Number(n[1])));
    p.periodKind = kindAt(t, n.index);
  } else if (/за\s+последни\S*\s+год/.test(t)) {
    p.period = 1;
    p.periodKind = kindAt(t, t.search(/за\s+последни\S*\s+год/));
  }

  const ft = t.match(/полн\S*\s+текст/);
  if (ft && ft.index !== undefined) {
    p.fullTextOnly = true;
    p.fullTextKind = kindAt(t, ft.index);
  }
  return p;
}
