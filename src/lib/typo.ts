// Типографика по правилам Яндекс Мед: неразрывные пробелы, «ёлочки», тире.
const NB = ' ';

/** Склеивает короткие слова со следующим, число с единицей и тире с предыдущим словом. */
export function nb(s: string): string {
  return s
    .replace(/(^|[\s(«])([а-яёА-ЯЁA-Za-z]{1,3})\s+(?=\S)/g, (_m, a: string, w: string) => `${a}${w}${NB}`)
    .replace(/(\d)\s+(?=(?:%|мин|лет|года|год|ч|мг|кг|мл|публикаций|публикации|публикация)(?![а-яё]))/g, `$1${NB}`)
    .replace(/\s+—/g, `${NB}—`);
}

/** Склонение: plural(5, 'публикация', 'публикации', 'публикаций'). */
export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

export const periodLabel = (p: number | null): string =>
  p === null ? 'Любой период' : p === 1 ? '1 год' : p < 5 ? `${p} года` : `${p} лет`;

export const periodGenitive = (p: number): string => (p === 1 ? '1 года' : `${p} лет`);

/** «Последний год», «Последние 2 года», «Последние 5 лет». */
export const lastPeriod = (p: number): string => (p === 1 ? 'Последний год' : p < 5 ? `Последние ${p} года` : `Последние ${p} лет`);

/** «за 1 год», «за 3 года», «за 5 лет». */
export const withinPeriod = (p: number): string => (p === 1 ? 'за 1 год' : p < 5 ? `за ${p} года` : `за ${p} лет`);
