/* Отрицание перед типом исследования: «без РКИ», «кроме обзоров», «не мета-анализы», «исключи когортные».
   Тип, перед которым стоит такое слово, исключается из выдачи, а не включается в неё.
   Перечисление продолжает отрицание: «без метаанализов и РКИ» исключает оба.
   «Не только РКИ» отрицанием не считается: между «не» и типом стоит «только». */

const TYPE_WORD = '(?:мета-?анализ\\S*|систематическ\\S*\\s+обзор\\S*|обзор\\S*|рки|рандомизированн\\S*(?:\\s+контролируем\\S*)?(?:\\s+исследован\\S*)?|когортн\\S*(?:\\s+исследован\\S*)?)';
const NEG = new RegExp(
  `(?:^|[\\s,;(—-])(?:без|кроме|не|исключая|исключи\\S*|исключить|за\\s+исключением|минус)\\s+(?:(?:любых|всех|все|любые|никаких)\\s+)?(?:${TYPE_WORD}\\s*(?:,|и|или)\\s*)*$`,
  'i',
);

/** Стоит ли перед позицией `at` слово, исключающее следующее за ним понятие. */
export function negatedAt(text: string, at: number): boolean {
  return NEG.test(text.slice(Math.max(0, at - 90), at));
}

/** Первое вхождение, перед которым нет отрицания; -1, если все вхождения отрицаются или их нет. */
export function firstPositive(text: string, re: RegExp): number {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  for (const m of text.matchAll(g)) {
    const at = m.index ?? 0;
    if (!negatedAt(text, at)) return at;
  }
  return -1;
}

/** Есть ли вхождение, перед которым стоит отрицание. */
export function hasNegated(text: string, re: RegExp): boolean {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  for (const m of text.matchAll(g)) if (negatedAt(text, m.index ?? 0)) return true;
  return false;
}
