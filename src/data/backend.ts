import type { SearchBackend, SearchPlan, SearchResponse } from './types';
import { runPipeline } from './pipeline';

/* Бэкенд поиска. Интерфейс `SearchBackend` остаётся тем же, когда вместо demoBackend
   подключается PubMed E-utilities: plan.params → esearch/esummary → SearchResponse.
   Всё, что между ними (варианты запросов, слияние, происхождение, ранжирование), живёт в pipeline.ts. */

export const searchSync = (plan: SearchPlan): SearchResponse => runPipeline(plan);

/** Для проверок: задержку ответа можно увеличить, чтобы проверить устаревшие ответы. */
const delay = (): number => {
  const d = (globalThis as { __ASK_DELAY__?: number }).__ASK_DELAY__;
  return typeof d === 'number' ? d : 90;
};

export const demoBackend: SearchBackend = {
  async search(plan) {
    await new Promise((r) => setTimeout(r, delay()));
    return searchSync(plan);
  },
};
