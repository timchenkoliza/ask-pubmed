import type { Entity, Grouping, Pub, PubQuote, Scenario, StudyType } from '../data/types';

/* Как один и тот же набор публикаций раскладывается по смыслу:
   по типам, годам, полному тексту, темам; на пару объектов сравнения; по аспектам; по цитатам. */

export interface Group { id: string; label: string; items: Pub[]; tone: number }

const TYPE_DEFAULT: Record<StudyType, string> = {
  ma: 'Метаанализы',
  sr: 'Систематические обзоры',
  rct: 'РКИ',
  cohort: 'Когорты',
};
const TYPE_ORDER: StudyType[] = ['ma', 'sr', 'rct', 'cohort'];

export const typeLabel = (sc: Scenario | null, t: StudyType): string => sc?.typeLabels?.[t] ?? TYPE_DEFAULT[t];

function byType(items: Pub[], sc: Scenario | null, priority?: StudyType[]): Group[] {
  const order = [...(priority ?? []), ...TYPE_ORDER.filter((t) => !priority?.includes(t))];
  // Метаанализы и обзоры в подписи групп не сокращаем: это заголовки зон.
  return order
    .map((t, i) => ({ id: t, label: t === 'ma' ? 'Метаанализы' : t === 'sr' ? 'Систематические обзоры' : t === 'cohort' ? 'Когорты' : typeLabel(sc, t), items: items.filter((p) => p.type === t), tone: i }))
    .filter((g) => g.items.length > 0)
    .map((g, i) => ({ ...g, tone: i }));
}

function byYear(items: Pub[]): Group[] {
  const years = [...new Set(items.map((p) => p.year))].sort((a, b) => b - a);
  return years.map((y, i) => ({ id: String(y), label: String(y), items: items.filter((p) => p.year === y), tone: i }));
}

function byFullText(items: Pub[]): Group[] {
  return [
    { id: 'ft', label: 'С полным текстом', items: items.filter((p) => p.fullTextState === 'pmc-full-text'), tone: 0 },
    { id: 'abs', label: 'Только abstract', items: items.filter((p) => p.fullTextState === 'abstract-only'), tone: 1 },
    { id: 'pub', label: 'Текст у издателя', items: items.filter((p) => p.fullTextState === 'publisher-link'), tone: 2 },
    { id: 'emb', label: 'Полный текст позже', items: items.filter((p) => p.fullTextState === 'pmc-embargoed'), tone: 3 },
    { id: 'meta', label: 'Только запись PubMed', items: items.filter((p) => p.fullTextState === 'metadata-only'), tone: 4 },
  ]
    .filter((g) => g.items.length > 0)
    .map((g, i) => ({ ...g, tone: i }));
}

function byMesh(items: Pub[]): Group[] {
  const freq = new Map<string, number>();
  items.forEach((p) => new Set(p.mesh).forEach((m) => freq.set(m, (freq.get(m) ?? 0) + 1)));
  const top = [...freq.entries()]
    .filter(([, n]) => n >= 2 && n < items.length)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([m]) => m);
  const groups: Group[] = top.map((m, i) => ({ id: m, label: m, items: [], tone: i }));
  const rest: Group = { id: 'rest', label: 'Другие темы', items: [], tone: top.length };
  items.forEach((p) => {
    const m = top.find((t) => p.mesh.includes(t));
    (groups.find((g) => g.id === m) ?? rest).items.push(p);
  });
  return [...groups, rest].filter((g) => g.items.length > 0).map((g, i) => ({ ...g, tone: i }));
}

export function groupBy(items: Pub[], grouping: Grouping, sc: Scenario | null, priority?: StudyType[]): Group[] {
  switch (grouping) {
    case 'year':
      return byYear(items);
    case 'fullText':
      return byFullText(items);
    case 'mesh':
      return byMesh(items);
    default:
      return byType(items, sc, priority);
  }
}

/* ─── Сравнение ───
   Совместное упоминание — не прямое сравнение. «Прямые» только те, у кого directComparison = true:
   в них сами авторы сопоставляют два подхода в одной группе исследования.
   Остальные, где встречаются оба, — отдельная зона «упоминают оба». */

export interface Comparison {
  a: Entity;
  b: Entity;
  /** Прямые сравнения (directComparison = true). */
  direct: Pub[];
  /** Оба подхода упомянуты, но прямого сравнения нет. */
  both: Pub[];
  /** Все, где встречаются оба подхода: direct + both. */
  together: Pub[];
  onlyA: Pub[];
  onlyB: Pub[];
}

export function splitComparison(items: Pub[], sc: Scenario): Comparison | null {
  if (!sc.entities || !sc.compareIds) return null;
  const [ia, ib] = sc.compareIds;
  const a = sc.entities.find((e) => e.id === ia)!;
  const b = sc.entities.find((e) => e.id === ib)!;
  const has = (p: Pub, id: string) => !!p.entities?.includes(id);
  const together = items.filter((p) => has(p, ia) && has(p, ib));
  return {
    a,
    b,
    direct: together.filter((p) => p.directComparison === true),
    both: together.filter((p) => p.directComparison !== true),
    together,
    onlyA: items.filter((p) => has(p, ia) && !has(p, ib)),
    onlyB: items.filter((p) => has(p, ib) && !has(p, ia)),
  };
}

/* ─── Аспекты вопроса: отдельные кластеры, которые ещё не сведены в вывод ─── */

export function aspectGroups(items: Pub[], sc: Scenario): Group[] {
  if (!sc.aspects) return byType(items, sc);
  const known = sc.aspects.map((a, i) => ({ id: a.id, label: a.label, items: items.filter((p) => p.aspect === a.id), tone: i }));
  /* Публикации без своего аспекта не пропадают из корпуса: они лежат отдельной группой. */
  const rest = items.filter((p) => !sc.aspects!.some((a) => a.id === p.aspect));
  return [...known, { id: 'rest', label: 'Другие работы', items: rest, tone: known.length }].filter((g) => g.items.length > 0).map((g, i) => ({ ...g, tone: i }));
}

/* ─── Цитаты ─── */

export interface QuoteCardData { quote: PubQuote; pub: Pub; index: number; of: number }
export interface QuoteGroup { id: string; label: string; cards: QuoteCardData[]; tone: number }

export function quoteBoard(items: Pub[], sc: Scenario): { groups: QuoteGroup[]; noText: Pub[]; pubs: number; total: number } {
  const aspects = sc.aspects ?? [];
  const map = new Map<string, QuoteCardData[]>();
  let total = 0;
  const withQuotes = new Set<string>();
  for (const pub of items) {
    const qs = pub.quotes ?? [];
    qs.forEach((q, i) => {
      // Цитату из полного текста показываем только если полный текст доступен для поиска.
      if (q.source === 'fulltext' && pub.fullTextState !== 'pmc-full-text') return;
      const list = map.get(q.group) ?? [];
      list.push({ quote: q, pub, index: i + 1, of: qs.length });
      map.set(q.group, list);
      withQuotes.add(pub.id);
      total += 1;
    });
  }
  const groups = aspects
    .filter((a) => map.has(a.id))
    .map((a, i) => ({ id: a.id, label: a.label, cards: map.get(a.id)!, tone: i }));
  /* Без цитаты остаются публикации, у которых нет текста, доступного для поиска: причина зависит от состояния. */
  const noText = items.filter((p) => !withQuotes.has(p.id));
  return { groups, noText, pubs: withQuotes.size, total };
}

/** Публикация для режима «читать»: с наибольшим числом цитат и полным текстом. */
export function topQuotedPub(items: Pub[]): Pub | null {
  const ft = items.filter((p) => p.fullTextState === 'pmc-full-text');
  return [...ft].sort((a, b) => (b.quotes?.length ?? 0) - (a.quotes?.length ?? 0))[0] ?? items[0] ?? null;
}
