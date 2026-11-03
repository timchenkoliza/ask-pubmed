import type { Concept, Params, QueryVariants, Scenario, StudyType } from './types';
import { NOW } from './scenarios';
import { CGroup, groupsOf, preferredClauses } from './match';

/* Компиляция структурированного запроса в синтаксис PubMed (MeSH, поля, Boolean).
   Три варианта различаются по существу, а не оформлением:
   Exact    — понятия точными полями (MeSH, Pharmacological Action и основная формулировка в Title/Abstract; без MeSH — Title/Abstract) + REQUIRED + PREFERRED;
   Broad    — те же условия, но понятия MeSH OR синонимы в Title/Abstract (SEARCH_EXPANSION), пара сравнения через OR;
   Fallback — понятия и только REQUIRED-условия, желательные снимаются.
   Этот слой виден по действию «Запрос PubMed» в «Как искали». */

const tag = (term: string, field = 'Title/Abstract'): string => `${/\s/.test(term) ? `"${term}"` : term}[${field}]`;

const wrap = (parts: string[]) => (parts.length === 0 ? '' : parts.length > 1 ? `(${parts.join(' OR ')})` : parts[0]);

function conceptClause(c: Concept, mode: 'exact' | 'broad' | 'fallback'): string {
  const mesh = (c.mesh ?? []).map((m) => `"${m}"[MeSH Terms]`);
  const pa = (c.pa ?? []).map((m) => `"${m}"[Pharmacological Action]`);
  const tiab = c.tiab.map((t) => tag(t));
  if (mode === 'exact') return wrap(mesh.length || pa.length ? [...mesh, ...pa, ...(c.meshOnly ? [] : tiab.slice(0, 1))] : tiab);
  if (mode === 'broad') return wrap([...mesh, ...pa, ...tiab]);
  /* Fallback: слова из сопоставления без полей, как при автоматическом разборе PubMed. */
  const free = [...new Set(c.mapped.split(/;\s*/))].filter((x) => x && !x.startsWith('Источник')).map((x) => (/\s/.test(x) ? `"${x}"` : x));
  return wrap([...free, ...tiab]);
}

function groupClause(g: CGroup, mode: 'exact' | 'broad' | 'fallback'): string {
  return wrap(g.members.map((m) => conceptClause(m, mode)).filter(Boolean));
}

const TYPE_CLAUSE: Record<StudyType, string[]> = {
  sr: ['"Systematic Review"[Publication Type]', '"systematic review"[Title/Abstract]'],
  ma: ['"Meta-Analysis"[Publication Type]', '"meta-analysis"[Title/Abstract]'],
  rct: ['"Randomized Controlled Trial"[Publication Type]'],
  cohort: ['"Cohort Studies"[MeSH Terms]', 'cohort[Title/Abstract]'],
};

const pad = (n: number) => String(n).padStart(2, '0');

function dateClause(period: number): string {
  const d = new Date(NOW);
  d.setFullYear(d.getFullYear() - period);
  const from = `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
  return `("${from}"[Date - Publication] : "3000"[Date - Publication])`;
}

function typeClause(types: StudyType[]): string {
  const parts = types.flatMap((t) => TYPE_CLAUSE[t]);
  return parts.length ? `(${parts.join(' OR ')})` : '';
}

/** Фильтры. В Fallback остаются только REQUIRED: допустимые типы всегда, период и полный текст по их весу. */
function filters(p: Params, mode: 'exact' | 'broad' | 'fallback'): string[] {
  const out: string[] = [];
  const t = typeClause(p.types);
  if (t) out.push(t);
  if (mode !== 'fallback' && p.preferTypes.length) out.push(typeClause(p.preferTypes));
  if (p.period && (mode !== 'fallback' || p.periodKind === 'REQUIRED')) out.push(dateClause(p.period));
  if (p.humans) out.push('"humans"[MeSH Terms]');
  if (p.fullTextOnly && (mode !== 'fallback' || p.fullTextKind === 'REQUIRED')) out.push('"full text"[Filter]');
  return out;
}

export function compileQueries(sc: Scenario, p: Params): QueryVariants {
  const groups = groupsOf(p, sc);
  const join = (lines: string[]) => lines.filter(Boolean).join('\nAND ');

  const exact = [...groups.map((g) => groupClause(g, 'exact')), ...filters(p, 'exact')];

  /* Broad: пара объектов сравнения принимает любой из двух. */
  const pair = groups.filter((g) => g.pair);
  const rest = groups.filter((g) => !g.pair);
  const orPair = pair.length > 1 ? [wrap(pair.map((g) => groupClause(g, 'broad')))] : pair.map((g) => groupClause(g, 'broad'));
  const broad = [...rest.map((g) => groupClause(g, 'broad')), ...orPair, ...filters(p, 'broad')];

  const required = groups.filter((g) => g.kind === 'REQUIRED');
  const fallback = [...required.map((g) => groupClause(g, 'fallback')), ...filters(p, 'fallback')];

  return { exact: join(exact), broad: join(broad), fallback: join(fallback) };
}

/** Есть ли что снимать в Fallback. */
export const hasPreferred = (p: Params, sc: Scenario | null) => preferredClauses(p, sc).length > 0;

/** Ссылка в PubMed: единственная внешняя ссылка прототипа, запрос настоящий. */
export const pubmedUrl = (query: string): string =>
  `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(query.replace(/\n/g, ' '))}`;
