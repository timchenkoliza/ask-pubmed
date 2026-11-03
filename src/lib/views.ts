import type { ExploreView, ResultIntent, ViewId } from '../data/types';

/* Какие представления допустимы для какого семейства экрана.
   Встряска переставляет только публикации обычного поиска литературы (сетка → зоны → список):
   у сравнения, цитат, одной статьи и вывода один смысл, и разложить их иначе значило бы изменить задачу. */
export const allowedViews: Record<ResultIntent, ViewId[]> = {
  explore: ['grid', 'grouped', 'compact'],
  compare: ['comparison'],
  'single-publication': ['publication'],
  'find-in-text': ['quotes', 'publication'],
  clarify: ['clarification'],
  empty: ['recovery'],
  synthesis: ['evidence'],
};

const FIRST: Record<ResultIntent, ViewId> = {
  explore: 'grid',
  compare: 'comparison',
  'single-publication': 'publication',
  'find-in-text': 'quotes',
  clarify: 'clarification',
  empty: 'recovery',
  synthesis: 'evidence',
};

/** Предпочтение врача влияет только на обычный поиск литературы: смысл запроса важнее привычки. */
export const defaultView = (intent: ResultIntent, preferred: ExploreView | null): ViewId =>
  intent === 'explore' && preferred ? preferred : FIRST[intent];

export const canShake = (intent: ResultIntent): boolean => intent === 'explore' && allowedViews[intent].length > 1;
