import type { ConstraintKind, DeepResearchPayload, Params, Pub, Scenario, SearchResponse, SearchSession } from '../data/types';
import { TYPE_NAME, kindOfConcept, periodText } from '../data/match';
import type { State } from './machine';
import { intentOf, viewOf } from './machine';

/* Состояние поиска как данные: из него собираются «Как искали», передача в Deep Research и проверки.
   Ничего здесь не придумывается: всё берётся из запроса, условий и ответа бэкенда. */

export interface Item { id: string; label: string; kind: ConstraintKind }

/** Ключ публикации для передачи дальше: PMID, а если его нет — DOI или внутренний номер. */
export const keyOfPub = (p: Pub): string => p.pmid ?? p.doi ?? p.id;

export function conceptsOf(params: Params): Item[] {
  return params.concepts.filter((c) => c.active && c.role !== 'quote').map((c) => ({ id: c.id, label: c.label, kind: kindOfConcept(c) }));
}

/** Условия, которые не являются понятиями: типы, приоритет, период, полный текст. */
export function constraintsOf(params: Params, sc: Scenario): Item[] {
  const out: Item[] = [];
  const names = (list: typeof params.types) => list.map((t) => sc.typeLabels?.[t] ?? TYPE_NAME[t]).join(', ');
  if (params.types.length && params.types.length < 4) out.push({ id: 'types', label: `Типы: ${names(params.types)}`, kind: 'REQUIRED' });
  if (params.preferTypes.length) out.push({ id: 'prefer-types', label: `В приоритете: ${names(params.preferTypes)}`, kind: 'PREFERRED' });
  if (params.period !== null) out.push({ id: 'period', label: `Публикации ${periodText(params.period)}`, kind: params.periodKind });
  if (params.fullTextOnly) out.push({ id: 'fulltext', label: 'Только с полным текстом', kind: params.fullTextKind });
  return out;
}

export function sessionOf(s: State, sc: Scenario, params: Params, response: SearchResponse | null): SearchSession {
  return {
    originalQuery: s.query,
    job: s.plan?.job ?? 'literature-search',
    concepts: params.concepts.filter((c) => c.role !== 'quote').map((c) => ({ id: c.id, label: c.label, kind: kindOfConcept(c), active: c.active })),
    constraints: constraintsOf(params, sc),
    searchVariants: response?.queries ?? null,
    executedVariants: response?.executed ?? [],
    mergedResults: response?.items.map(keyOfPub) ?? [],
    selectedSort: s.sort,
    selectedLayout: viewOf(s),
    selectedPublication: s.pub?.id ?? null,
    ambiguityResolution: s.ambiguityId ?? null,
  };
}

/** Что получает Deep Research. Врачу ничего не нужно набирать заново. */
export function payloadOf(s: State, sc: Scenario, params: Params, response: SearchResponse): DeepResearchPayload {
  const intent = intentOf(s);
  const mode = s.plan?.drMode ?? (intent === 'compare' ? 'compare' : 'review');
  const corpus = response.items.map(keyOfPub);
  const picked = response.items.filter((p) => s.selected.includes(p.id)).map(keyOfPub);
  return {
    originalQuery: s.query,
    concepts: conceptsOf(params).map(({ id, label, kind }) => ({ id, label, kind })),
    constraints: constraintsOf(params, sc),
    selectedPmids: picked,
    currentCorpusPmids: corpus,
    mode,
    job: s.plan?.job ?? 'literature-search',
    resultState: response.state,
    pubmedQuery: response.queries[response.lead ?? 'exact'],
  };
}
