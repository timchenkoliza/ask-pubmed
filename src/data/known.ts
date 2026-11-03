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

export function findByTitle(text: string): { pub: Pub; sc: Scenario } | null {
  const n = norm(text);
  if (n.length < 12) return null;
  return allPubs().find(({ pub }) => norm(pub.title) === n || norm(pub.titleRu) === n) ?? null;
}

export function resolveKnown(raw: string): KnownHit | null {
  const text = raw.trim();
  const pm = text.match(PMID_RE)?.[1] ?? (/^\s*\d{7,9}\s*$/.test(text) ? text : null);
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
  for (const m of text.matchAll(/[«"“]([^»"”]{20,})[»"”]/g)) {
    const inner = findByTitle(m[1]);
    if (inner) return { ref: { by: 'title', value: inner.pub.title, pubId: inner.pub.id }, ...inner };
  }

  const ay = text.match(AUTHOR_YEAR);
  if (ay) {
    const sur = ay[1].toLowerCase();
    const year = Number(ay[2]);
    const hit = pubs.find(({ pub }) => pub.year === year && pub.authors?.[0]?.split(' ')[0].toLowerCase() === sur);
    if (hit) return { ref: { by: 'author-year', value: `${ay[1]} ${year}`, pubId: hit.pub.id }, ...hit };
  }
  return null;
}

/** Публикация по id из любого сценария. */
export const pubById = (id: string): { pub: Pub; sc: Scenario } | null => allPubs().find((x) => x.pub.id === id) ?? null;

/** Запись в синтаксисе PubMed для известной публикации. */
export function knownQuery(ref: KnownRef, pub?: Pub): string {
  if (!pub) {
    if (ref.by === 'pmid') return `${ref.value.replace(/\D/g, '')}[pmid]`;
    if (ref.by === 'doi') return `"${ref.value.replace(/^DOI\s*/, '')}"[AID]`;
    return ref.value;
  }
  if (ref.by === 'pmid' && pub.pmid) return `${pub.pmid}[pmid]`;
  if (ref.by === 'doi' && pub.doi) return `"${pub.doi}"[AID]`;
  if (ref.by === 'author-year' && pub.authors?.[0]) return `${pub.authors[0]}[Author] AND ${pub.year}[Date - Publication]`;
  return `"${pub.title}"[Title]`;
}
