import type { KnownRef, Pub, Scenario } from './types';
import { SCENARIOS } from './scenarios';

/* Известная публикация: PMID, DOI, точное название или «автор + год».
   Резолвер возвращает одну запись и не запускает тематический поиск. */

export const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/g, ' ')
    .trim();

export const PMID_RE = /(?:pmid|пмид)\s*[:№#]?\s*(\d{5,9})/i;
/** Ссылка на запись в PubMed: pubmed.ncbi.nlm.nih.gov/12345678 (с «https://», без него, с хвостом пути). */
export const PUBMED_URL_RE = /pubmed\.ncbi\.nlm\.nih\.gov\/(\d{5,9})(?![\d])/i;
export const DOI_RE = /\b(10\.\d{4,9}\/\S+)/i;
const AUTHOR_YEAR = /^\s*([A-Z][A-Za-z-]{2,})(?:\s+(?:et\s+al\.?|и\s+соавт\.?))?[,\s]+((?:19|20)\d{2})\s*$/;

export interface KnownHit {
  ref: KnownRef;
  pub?: Pub;
  sc?: Scenario;
  /** Номер или DOI, которому ничего не соответствует. */
  notFound?: string;
}

const allPubs = () => SCENARIOS.flatMap((sc) => sc.pool.map((pub) => ({ pub, sc })));

const hasCyrillic = (s: string) => /[а-яё]/i.test(s);

/** Похоже ли на название статьи из PubMed: латиница, много слов, как правило с двоеточием или скобками. Короткий набор слов — это тематический запрос. */
export function looksLikeTitle(text: string): boolean {
  const t = text.trim().replace(/^[«"“]|[»"”]$/g, '');
  if (hasCyrillic(t) || /[?]$/.test(t)) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 8 || t.length < 40) return false;
  return /[:(]/.test(t) || words.length >= 10;
}

export function findByTitle(text: string): { pub: Pub; sc: Scenario } | null {
  const n = norm(text);
  if (n.length < 12) return null;
  const pubs = allPubs();
  const exact = pubs.find(({ pub }) => norm(pub.title) === n || norm(pub.titleRu) === n);
  if (exact) return exact;
  /* Начало или часть английского названия: врач копирует его не целиком. Русскую фразу так не ищем — это тематический запрос. */
  if (!hasCyrillic(text) && n.length >= 24 && n.split(' ').length >= 5) {
    const part = pubs.filter(({ pub }) => norm(pub.title).includes(n));
    if (part.length === 1) return part[0];
  }
  return null;
}

/** Все идентификаторы в запросе, без повторов: «PMID 1 и PMID 2», «PMID 1, 2», ссылки PubMed, DOI. Порядок — как в тексте. */
export function knownIds(raw: string): string[] {
  const out: { at: number; id: string }[] = [];
  const push = (at: number, id: string) => { if (!out.some((o) => o.id === id)) out.push({ at, id }); };
  for (const m of raw.matchAll(/(?:pmid|пмид)\s*[:№#]?\s*(\d{5,9}(?:\s*(?:,|;|и|and|или|\/)\s*(?:(?:pmid|пмид)\s*[:№#]?\s*)?\d{5,9})*)/gi)) {
    for (const n of m[1].matchAll(/\d{5,9}/g)) push((m.index ?? 0) + (n.index ?? 0), `PMID ${n[0]}`);
  }
  for (const m of raw.matchAll(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d{5,9})(?![\d])/gi)) push(m.index ?? 0, `PMID ${m[1]}`);
  for (const m of raw.matchAll(/\b(10\.\d{4,9}\/\S+)/gi)) push(m.index ?? 0, `DOI ${m[1].replace(/[.,;)»"]+$/, '')}`);
  return out.sort((a, b) => a.at - b.at).map((o) => o.id);
}

export function resolveKnown(raw: string): KnownHit | null {
  const text = raw.trim();
  const pm = text.match(PMID_RE)?.[1] ?? text.match(PUBMED_URL_RE)?.[1] ?? (/^\s*\d{7,9}\s*$/.test(text) ? text : null);
  const doiRaw = text.match(DOI_RE)?.[1]?.replace(/[.,;)»"]+$/, '');
  const pubs = allPubs();

  if (pm) {
    const hit = pubs.find(({ pub }) => pub.pmid === pm);
    return hit ? { ref: { by: 'pmid', value: `PMID ${pm}`, pubId: hit.pub.id }, ...hit } : { ref: { by: 'pmid', value: `PMID ${pm}` }, notFound: `PMID ${pm}` };
  }
  if (doiRaw) {
    const hit = pubs.find(({ pub }) => pub.doi?.toLowerCase() === doiRaw.toLowerCase());
    return hit ? { ref: { by: 'doi', value: `DOI ${doiRaw}`, pubId: hit.pub.id }, ...hit } : { ref: { by: 'doi', value: `DOI ${doiRaw}` }, notFound: `DOI ${doiRaw}` };
  }

  const exact = findByTitle(text);
  if (exact) return { ref: { by: 'title', value: exact.pub.title, pubId: exact.pub.id }, ...exact };
  /* Название в кавычках внутри более длинной фразы: «в статье «…» найди …». */
  const quoted = [...text.matchAll(/[«"“]([^»"”]{20,})[»"”]/g)].map((m) => m[1].trim());
  for (const q of quoted) {
    const inner = findByTitle(q);
    if (inner) return { ref: { by: 'title', value: inner.pub.title, pubId: inner.pub.id }, ...inner };
  }

  const ay = text.match(AUTHOR_YEAR);
  if (ay) {
    const sur = ay[1].toLowerCase();
    const year = Number(ay[2]);
    const hit = pubs.find(({ pub }) => pub.year === year && pub.authors?.[0]?.split(' ')[0].toLowerCase() === sur);
    if (hit) return { ref: { by: 'author-year', value: `${ay[1]} ${year}`, pubId: hit.pub.id }, ...hit };
  }
  /* Название, которого нет в данных: честно говорим «не нашли», а не подбираем похожую тему. */
  const missing = quoted.find(looksLikeTitle) ?? (looksLikeTitle(text) ? text.trim().replace(/^[«"“]|[»"”]$/g, '') : null);
  if (missing) return { ref: { by: 'title', value: missing }, notFound: missing };
  return null;
}

/** Публикация по id из любого сценария. */
export const pubById = (id: string): { pub: Pub; sc: Scenario } | null => allPubs().find((x) => x.pub.id === id) ?? null;

/** Запись в синтаксисе PubMed для известной публикации. */
export function knownQuery(ref: KnownRef, pub?: Pub): string {
  if (!pub) {
    if (ref.by === 'pmid') return `${ref.value.replace(/\D/g, '')}[pmid]`;
    if (ref.by === 'doi') return `"${ref.value.replace(/^DOI\s*/, '')}"[AID]`;
    if (ref.by === 'title') return `"${ref.value}"[Title]`;
    return ref.value;
  }
  if (ref.by === 'pmid' && pub.pmid) return `${pub.pmid}[pmid]`;
  if (ref.by === 'doi' && pub.doi) return `"${pub.doi}"[AID]`;
  if (ref.by === 'author-year' && pub.authors?.[0]) return `${pub.authors[0]}[Author] AND ${pub.year}[Date - Publication]`;
  return `"${pub.title}"[Title]`;
}
