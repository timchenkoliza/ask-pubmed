import type { Params, Pub, Scenario, SearchResponse, Strategy } from '../data/types';
import { TYPE_NAME, kindOfConcept, periodText } from '../data/match';
import { FT_LONG } from './fulltext';
import { lcFirst } from './typo';

/* «Почему эта публикация здесь»: объяснение строится из происхождения записи (provenance), а не пишется заранее. */

export const STRATEGY_NAME: Record<Strategy, string> = { exact: 'Точный поиск', broad: 'Расширенный поиск', fallback: 'Запасной поиск' };

export interface WhyData {
  tier: Strategy;
  headline: string;
  found: { strategy: Strategy; rank?: number }[];
  concepts: { label: string; how: string }[];
  required: string[];
  missed: string[];
  fullText: string;
  pmid?: string;
}

const VIA: Record<string, string> = { mesh: 'есть в рубрикаторе PubMed', tiab: 'слова в названии или abstract', text: 'похожие слова в записи', flag: 'упомянуто в тексте' };

export function labelOf(id: string, params: Params, sc: Scenario): string {
  if (id === 'types') return params.types.length ? `Тип исследования: ${params.types.map((t) => lcFirst(sc.typeLabels?.[t] ?? TYPE_NAME[t])).join(', ')}` : 'Тип исследования: любой';
  if (id === 'prefer-types') return `В приоритете: ${params.preferTypes.map((t) => TYPE_NAME[t]).join(', ')}`;
  if (id === 'period') return params.period ? `Период: ${periodText(params.period)}` : 'Период';
  if (id === 'fulltext') return 'Полный текст';
  const c = params.concepts.find((x) => x.id === id);
  if (c) return c.label;
  return id;
}

export function explain(pub: Pub, response: SearchResponse, params: Params, sc: Scenario): WhyData | null {
  const prov = response.prov[pub.id];
  if (!prov) return null;
  const known = response.state === 'known-publication-found';
  const found = (['exact', 'broad', 'fallback'] as Strategy[])
    .filter((s) => prov.foundBy.includes(s))
    .map((s) => ({ strategy: s, rank: prov.pubmedRankByQuery[s] }));
  const concepts = prov.matchedConcepts.map((id) => {
    const c = params.concepts.find((x) => x.id === id);
    const via = prov.via[id];
    const terms = prov.terms[id]?.filter(Boolean) ?? [];
    return {
      label: c?.label ?? id,
      how: `${VIA[via] ?? 'совпадение'}${via === 'tiab' && terms.length ? `: ${terms.slice(0, 3).join(', ')}` : ''}`,
    };
  });
  const required = prov.matchedRequired.map((id) => labelOf(id, params, sc));
  const missed = prov.missedPreferred.map((id) => labelOf(id, params, sc));
  const headline = known
    ? 'Это публикация, которую вы назвали'
    : prov.tier === 'exact'
      ? 'Подходит под все условия запроса'
      : prov.tier === 'broad'
        ? 'Нашли по синонимам в названии и abstract: точный поиск эту публикацию не вернул'
        : 'Подходит под обязательные условия, но не под все пожелания';
  return { tier: prov.tier, headline, found, concepts, required, missed, fullText: FT_LONG[pub.fullTextState], pmid: pub.pmid };
}

export { kindOfConcept };
