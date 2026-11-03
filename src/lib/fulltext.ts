import type { FullTextState, Pub } from '../data/types';

/* Что врач может сделать с публикацией, зависит от состояния полного текста.
   Одного флага «есть/нет» для этого мало: у текста в PMC, у издателя и под эмбарго разные действия. */

export const FT_LABEL: Record<FullTextState, string> = {
  'pmc-full-text': 'Полный текст',
  'abstract-only': 'Только abstract',
  'publisher-link': 'Текст у издателя',
  'pmc-embargoed': 'Текст откроется позже',
  'metadata-only': 'Только запись PubMed',
};

export const FT_LONG: Record<FullTextState, string> = {
  'pmc-full-text': 'Полный текст доступен в PubMed Central',
  'abstract-only': 'Доступен только abstract',
  'publisher-link': 'Полный текст есть только на сайте издателя',
  'pmc-embargoed': 'Полный текст появится в PubMed Central после окончания эмбарго',
  'metadata-only': 'В записи PubMed нет abstract и текста',
};

/** Можно ли искать внутри текста статьи. Только полный текст в PMC. */
export const searchableText = (p: Pub): boolean => p.fullTextState === 'pmc-full-text';

/** Есть ли abstract, в котором можно искать и который можно показать. */
export const hasAbstract = (p: Pub): boolean => p.fullTextState !== 'metadata-only' && p.abstract.trim().length > 0;

/** Результат поиска цитат в публикации: причина, по которой цитат нет, или null. */
export function noQuoteReason(p: Pub): string | null {
  switch (p.fullTextState) {
    case 'pmc-full-text':
      return null;
    case 'abstract-only':
      return 'Полный текст недоступен для поиска. Можно искать только в abstract';
    case 'publisher-link':
      return 'Полный текст только у издателя: поиск по нему здесь недоступен';
    case 'pmc-embargoed':
      return 'Полный текст появится позже. Сейчас можно искать только в abstract';
    default:
      return 'У записи нет abstract и текста, искать негде';
  }
}
