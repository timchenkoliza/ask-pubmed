import type {
  Alternative,
  Blocker,
  Dropped,
  ExecutedVariant,
  Params,
  Period,
  Provenance,
  Pub,
  Relax,
  Scenario,
  SearchPlan,
  SearchResponse,
  SortMode,
  Strategy,
} from './types';
import { ALL_TYPES, evaluate, Eval, kindOfConcept, preferredClauses } from './match';
import { applyCandidate } from './terms';
import { compileQueries } from './compile';
import { knownQuery, pubById } from './known';
import { withinPeriod } from '../lib/typo';

/* Конвейер поиска: варианты запроса → выполнение → слияние → дедупликация → происхождение → ранжирование.
   Интерфейс результата (SearchResponse) тот же, что вернёт PubMed API: подмена источника не меняет экраны. */

const ORDER: Strategy[] = ['exact', 'broad', 'fallback'];
const TYPE_ORDER = { ma: 0, sr: 1, rct: 2, cohort: 3 } as const;

/** Ключ слияния: одна публикация попадает в выдачу один раз, даже если её вернули два варианта или две записи. */
export const keyOf = (p: Pub) => p.pmid ?? p.doi?.toLowerCase() ?? p.id;

interface Row { pub: Pub; ev: Eval }

/** Выполнение одного варианта: отбор и порядок «по релевантности» (демо-аналог Best Match). */
function execute(pool: Pub[], params: Params, sc: Scenario, mode: Strategy): Row[] {
  const rows: Row[] = [];
  for (const pub of pool) {
    const ev = evaluate(pub, params, sc, mode);
    if (ev.ok) rows.push({ pub, ev });
  }
  return rows.sort((a, b) => b.ev.score - a.ev.score || b.pub.year - a.pub.year || TYPE_ORDER[a.pub.type] - TYPE_ORDER[b.pub.type] || a.pub.id.localeCompare(b.pub.id));
}

interface Collected {
  rows: Record<Strategy, Row[]>;
  ran: Strategy[];
}

/** Exact и Broad выполняются всегда. Fallback — когда в запросе есть желательные условия, которые можно снять,
    или когда первые два варианта ничего не вернули. */
function collect(pool: Pub[], params: Params, sc: Scenario): Collected {
  const exact = execute(pool, params, sc, 'exact');
  const broad = execute(pool, params, sc, 'broad');
  const ran: Strategy[] = ['exact', 'broad'];
  let fallback: Row[] = [];
  if (preferredClauses(params, sc).length > 0 || (exact.length === 0 && broad.length === 0)) {
    fallback = execute(pool, params, sc, 'fallback');
    ran.push('fallback');
  }
  return { rows: { exact, broad, fallback }, ran };
}

const unionSize = (c: Collected) => new Set(ORDER.flatMap((s) => c.rows[s].map((r) => keyOf(r.pub)))).size;

/* ─── Калибровка счётчиков исходного запроса (27 · 8 · 5) ─── */

const cache = new Map<string, { total: number; ft: number; rev: number }>();

function calib(sc: Scenario) {
  const hit = cache.get(sc.id);
  if (hit) return hit;
  let k = { total: 1, ft: 1, rev: 1 };
  if (sc.calibration) {
    const items = merge(sc.pool, collect(sc.pool, sc.baseParams, sc), sc.baseParams, sc, 'relevance').items;
    k = {
      total: sc.calibration.total / (items.length || 1),
      ft: sc.calibration.fullText / (items.filter((x) => x.fullTextState === 'pmc-full-text').length || 1),
      rev: sc.calibration.reviews / (items.filter((x) => x.type === 'sr').length || 1),
    };
  }
  cache.set(sc.id, k);
  return k;
}

function factor(sc: Scenario, p: Params, ambiguityId?: string): number {
  let f = 1;
  for (const c of p.concepts) {
    if (!c.factor) continue;
    const base = sc.baseParams.concepts.find((b) => b.id === c.id);
    if (!base) continue;
    if (c.active && !base.active) f *= c.factor;
    if (!c.active && base.active) f /= c.factor;
  }
  if (!p.humans) f *= 1.2;
  if (ambiguityId && sc.ambiguity) f *= sc.ambiguity.options.find((o) => o.id === ambiguityId)?.factor ?? 1;
  return f;
}

/* ─── Слияние ─── */

interface Merged { items: Pub[]; prov: Record<string, Provenance>; mergedFrom: number }

function merge(pool: Pub[], c: Collected, params: Params, sc: Scenario, sort: SortMode): Merged {
  const byKey = new Map<string, { pub: Pub; ranks: Partial<Record<Strategy, number>>; found: Strategy[]; ev: Partial<Record<Strategy, Eval>> }>();
  let mergedFrom = 0;
  for (const s of ORDER) {
    c.rows[s].forEach((row, i) => {
      mergedFrom += 1;
      const key = keyOf(row.pub);
      const rec = byKey.get(key) ?? { pub: row.pub, ranks: {}, found: [], ev: {} };
      if (!rec.found.includes(s)) rec.found.push(s);
      rec.ranks[s] = Math.min(rec.ranks[s] ?? Infinity, i + 1);
      rec.ev[s] = row.ev;
      byKey.set(key, rec);
    });
  }
  const prov: Record<string, Provenance> = {};
  const hits: { pub: Pub; tier: Strategy }[] = [];
  for (const [key, rec] of byKey) {
    const tier = rec.found[0];
    const diag = evaluate(rec.pub, params, sc, 'diag');
    const tierEv = rec.ev[tier]!;
    prov[rec.pub.id] = {
      key,
      foundBy: rec.found,
      tier,
      matchedConcepts: diag.matchedConcepts,
      matchedRequired: diag.matchedRequired,
      matchedPreferred: diag.matchedPreferred,
      missedPreferred: diag.missedPreferred,
      pubmedRankByQuery: rec.ranks,
      via: tier === 'exact' ? tierEv.via : diag.via,
      terms: tier === 'exact' ? tierEv.terms : diag.terms,
    };
    hits.push({ pub: rec.pub, tier });
  }
  void pool;
  return { items: order(hits.map((h) => h.pub), prov, sort), prov, mergedFrom };
}

/** Порядок показа: ярусы exact → broad-only → fallback-only; внутри яруса — по релевантности или «сначала новые». */
export function order(items: Pub[], prov: Record<string, Provenance>, sort: SortMode): Pub[] {
  const tier = (p: Pub) => ORDER.indexOf(prov[p.id]?.tier ?? 'fallback');
  const rank = (p: Pub) => prov[p.id]?.pubmedRankByQuery[prov[p.id].tier] ?? 999;
  return [...items].sort((a, b) =>
    tier(a) - tier(b) ||
    (sort === 'newest' ? b.year - a.year || rank(a) - rank(b) : rank(a) - rank(b) || b.year - a.year),
  );
}

/** Пересортировка уже найденного без повторного поиска: меняется только порядок внутри ярусов. */
export function reorder(r: SearchResponse, sort: SortMode): SearchResponse {
  if (r.sort === sort) return r;
  return { ...r, sort, items: order(r.items, r.prov, sort) };
}

/* ─── Что расширил Broad ─── */

function widenedText(sc: Scenario, params: Params, items: Pub[], prov: Record<string, Provenance>): string[] {
  const out: string[] = [];
  for (const c of params.concepts.filter((x) => x.active && x.role !== 'quote')) {
    const terms = new Set<string>();
    let count = 0;
    for (const p of items) {
      const pr = prov[p.id];
      if (pr.tier !== 'broad') continue;
      if (pr.via[c.id] === 'tiab' && (c.mesh?.length || c.pa?.length)) {
        count += 1;
        pr.terms[c.id]?.forEach((t) => terms.add(t));
      }
    }
    if (count) out.push(`«${c.label}»: нашли по словам в названии и abstract (${[...terms].slice(0, 3).join(', ')}), хотя в рубрикаторе PubMed у публикации такого термина нет`);
  }
  if (!out.length && items.some((p) => prov[p.id].tier === 'broad')) {
    out.push('Пара объектов сравнения: принимаем публикации, где упомянут любой из двух');
  }
  void sc;
  return out;
}

/* ─── Что можно ослабить, если ничего не нашли ─── */

const widerPeriod = (p: number): Period => (p < 5 ? 5 : p < 10 ? 10 : null);

type RelaxDraft = Relax extends infer R ? (R extends Relax ? Omit<R, 'count'> : never) : never;

/** Все фильтры сняты, понятия остались: если и так пусто, дело в самих понятиях запроса. */
const noFilters = (p: Params): Params => ({ ...p, period: null, fullTextOnly: false, types: [], preferTypes: [] });

/** Ослабляем только обязательное и только то, что подтверждено тестовым поиском: после ослабления должны появиться публикации.
    Сначала одно условие, потом все фильтры сразу: врач получает самый мягкий шаг, который действительно что-то находит. */
function relaxFor(sc: Scenario, p: Params): Relax | null {
  const cands: { relax: RelaxDraft; apply: (q: Params) => Params }[] = [];
  if (p.period !== null) {
    const to = widerPeriod(p.period);
    cands.push({ relax: { kind: 'period', to, label: to === null ? 'Искать за всё время' : `Искать ${withinPeriod(to)}` }, apply: (q) => ({ ...q, period: to }) });
  }
  if (p.fullTextOnly) {
    cands.push({ relax: { kind: 'fulltext', label: 'Искать не только с полным текстом' }, apply: (q) => ({ ...q, fullTextOnly: false }) });
  }
  if (p.types.length > 0 && p.types.length < 4) {
    cands.push({ relax: { kind: 'types', label: 'Искать по всем типам исследований' }, apply: (q) => ({ ...q, types: [...ALL_TYPES] }) });
  }
  for (const c of cands) {
    const count = unionSize(collect(sc.pool, c.apply(p), sc));
    if (count > 0) return { ...c.relax, count } as Relax;
  }
  const changed = cands.length;
  if (changed > 1) {
    const count = unionSize(collect(sc.pool, noFilters(p), sc));
    if (count > 0) return { kind: 'filters', label: 'Снять период, тип и полный текст', count };
  }
  return null;
}

const FILTER_LABEL = { period: 'Период', fulltext: 'Полный текст', types: 'Тип исследований' } as const;

/** Что помешало. Фильтр — если после его ослабления публикации есть. Иначе пробуем снять фильтры целиком:
    если и так пусто, мешает понятие запроса, и именно то, без которого публикации появляются. */
function blockerFor(sc: Scenario, p: Params, relax: Relax | null): Blocker | null {
  if (relax && relax.kind !== 'filters') return { kind: relax.kind, id: relax.kind, label: FILTER_LABEL[relax.kind] };
  if (relax) return { kind: 'filters', id: 'filters', label: 'Сочетание условий' };
  const base = noFilters(p);
  let best: { c: Params['concepts'][number]; n: number } | null = null;
  for (const c of p.concepts) {
    if (!c.active || c.role === 'quote' || kindOfConcept(c) !== 'REQUIRED') continue;
    const without: Params = { ...base, concepts: base.concepts.map((x) => (x.id === c.id ? { ...x, active: false } : x)) };
    const n = unionSize(collect(sc.pool, without, sc));
    if (n > 0 && (!best || n > best.n)) best = { c, n };
  }
  return best ? { kind: 'concept', id: best.c.id, label: best.c.label } : null;
}

/** Другие значения термина, при которых публикации есть сейчас, с текущими фильтрами. */
function alternativesFor(sc: Scenario, p: Params, blocker: Blocker | null, nowId?: string): Alternative[] {
  const amb = sc.ambiguity;
  if (!amb || !blocker || blocker.kind !== 'concept' || blocker.id !== amb.conceptId) return [];
  const out: Alternative[] = [];
  for (const o of amb.options) {
    if (o.id === nowId) continue;
    const count = unionSize(collect(sc.pool, applyCandidate(p, sc, o), sc));
    if (count > 0) out.push({ id: o.id, label: o.label, hint: o.hint, count });
  }
  return out.sort((a, b) => b.count - a.count);
}

/* ─── Основной вход ─── */

const empty = (state: SearchResponse['state'], queries: SearchResponse['queries'], sort: SortMode): SearchResponse => ({
  total: 0, fullText: 0, reviews: 0, items: [], queries, relax: null, blocker: null, alternatives: [], state, lead: null, executed: [], prov: {}, dropped: [], widened: [],
  counts: { exact: 0, broad: 0, fallback: 0 }, mergedFrom: 0, sort,
});

/** Известная публикация: один резолвер вместо тематического поиска. Exact/Broad/Fallback не выполняются. */
function runKnown(plan: SearchPlan): SearchResponse {
  const sort = plan.sort ?? 'relevance';
  const ref = plan.query?.known;
  const hit = ref?.pubId ? pubById(ref.pubId) : null;
  const q = ref ? knownQuery(ref, hit?.pub) : '';
  const queries = { exact: q, broad: q, fallback: q };
  if (!hit || !ref) {
    const r = empty('known-publication-not-found', queries, sort);
    r.executed = [{ strategy: 'exact', query: q, count: 0, ids: [], dropped: [] }];
    return r;
  }
  const pub = hit.pub;
  const prov: Provenance = { key: keyOf(pub), foundBy: ['exact'], tier: 'exact', matchedConcepts: [], matchedRequired: [], matchedPreferred: [], missedPreferred: [], pubmedRankByQuery: { exact: 1 }, via: {}, terms: {} };
  return {
    total: 1,
    fullText: pub.fullTextState === 'pmc-full-text' ? 1 : 0,
    reviews: pub.type === 'sr' ? 1 : 0,
    items: [pub],
    queries,
    relax: null,
    blocker: null,
    alternatives: [],
    state: 'known-publication-found',
    lead: 'exact',
    executed: [{ strategy: 'exact', query: q, count: 1, ids: [pub.id], dropped: [] }],
    prov: { [pub.id]: prov },
    dropped: [],
    widened: [],
    counts: { exact: 1, broad: 0, fallback: 0 },
    mergedFrom: 1,
    sort,
  };
}

export function runPipeline(plan: SearchPlan): SearchResponse {
  const job = plan.query?.job;
  if (job === 'known-publication' || plan.query?.known) return runKnown(plan);

  const { scenario: sc, params } = plan;
  const sort: SortMode = plan.sort ?? 'relevance';
  const queries = compileQueries(sc, params);
  const col = collect(sc.pool, params, sc);
  const counts = { exact: col.rows.exact.length, broad: col.rows.broad.length, fallback: col.rows.fallback.length };

  if (unionSize(col) === 0) {
    const r = empty('zero-results', queries, sort);
    r.relax = relaxFor(sc, params);
    r.blocker = blockerFor(sc, params, r.relax);
    r.alternatives = alternativesFor(sc, params, r.blocker, plan.ambiguityId);
    r.executed = col.ran.map((s) => ({ strategy: s, query: queries[s], count: 0, ids: [], dropped: s === 'fallback' ? preferredClauses(params, sc) : [] }));
    r.counts = counts;
    return r;
  }

  const m = merge(sc.pool, col, params, sc, sort);
  const k = calib(sc);
  const f = factor(sc, params, plan.ambiguityId);
  const ftHits = m.items.filter((x) => x.fullTextState === 'pmc-full-text').length;
  const revHits = m.items.filter((x) => x.type === 'sr').length;
  const total = Math.max(m.items.length, Math.round(m.items.length * k.total * f));
  const fullText = Math.min(total, Math.max(ftHits, Math.round(ftHits * k.ft * f)));
  const reviews = Math.min(total, Math.round(revHits * k.rev * f));

  const lead: Strategy = counts.exact ? 'exact' : counts.broad ? 'broad' : 'fallback';
  const state: SearchResponse['state'] = lead === 'exact' ? 'exact-results' : lead === 'broad' ? 'broadened-results' : 'fallback-results';
  const dropped: Dropped[] = col.ran.includes('fallback') && m.items.some((p) => m.prov[p.id].tier === 'fallback') ? preferredClauses(params, sc) : [];

  const executed: ExecutedVariant[] = col.ran.map((s) => ({
    strategy: s,
    query: queries[s],
    count: counts[s],
    ids: col.rows[s].map((r) => r.pub.id),
    dropped: s === 'fallback' ? preferredClauses(params, sc) : [],
  }));

  return {
    total, fullText, reviews,
    items: m.items,
    queries,
    relax: null,
    blocker: null,
    alternatives: [],
    state, lead, executed,
    prov: m.prov,
    dropped,
    widened: state === 'broadened-results' || m.items.some((p) => m.prov[p.id].tier === 'broad') ? widenedText(sc, params, m.items, m.prov) : [],
    counts,
    mergedFrom: m.mergedFrom,
    sort,
  };
}
