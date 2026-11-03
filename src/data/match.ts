import type { ConstraintKind, Concept, Params, Pub, Scenario, StudyType, Strategy } from './types';
import { NOW_YEAR } from './scenarios';

/* Демо-эквивалент того, что делает PubMed с запросом врача.
   Здесь нет подмены результата по номеру примера: публикация попадает в выдачу, только если её MeSH,
   название, abstract, тип, год и состояние текста удовлетворяют условиям структурированного запроса.
   При подключении PubMed API этот файл заменяется вызовом esearch, интерфейс остаётся прежним. */

export type Via = 'mesh' | 'tiab' | 'text' | 'flag';
export type Mode = Strategy | 'diag';

/** Вес понятия: по умолчанию условия и воздействия обязательны, исходы и «что выясняем» желательны. */
export const kindOfConcept = (c: Concept): ConstraintKind => c.kind ?? (c.role === 'outcome' || c.role === 'focus' || c.optional ? 'PREFERRED' : 'REQUIRED');

/** Группа понятий: члены одной группы объединяются через OR. */
export interface CGroup {
  key: string;
  members: Concept[];
  kind: ConstraintKind;
  /** Пара объектов сравнения: в Exact нужны оба, в Broad достаточно любого. */
  pair: boolean;
}

export function groupsOf(params: Params, sc: Scenario | null): CGroup[] {
  const active = params.concepts.filter((c) => c.active && c.role !== 'quote');
  const pairIds: string[] = sc?.compareIds ?? [];
  const map = new Map<string, Concept[]>();
  for (const c of active) {
    const key = c.group ?? (c.role === 'outcome' ? 'outcome' : c.id);
    map.set(key, [...(map.get(key) ?? []), c]);
  }
  return [...map.entries()].map(([key, members]) => ({
    key,
    members,
    kind: members.some((m) => kindOfConcept(m) === 'REQUIRED') ? 'REQUIRED' : 'PREFERRED',
    pair: members.length === 1 && pairIds.includes(members[0].id),
  }));
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Поиск слова или фразы в Title/Abstract. Усечение `*` и окончания допустимы: слово ищется с начала. */
export function termIn(text: string, term: string): boolean {
  const t = term.toLowerCase().replace(/\*+$/, '').trim();
  if (!t) return false;
  return new RegExp(`(?:^|[^a-z0-9])${esc(t).replace(/\s+/g, '\\s+')}`, 'i').test(text);
}

const titleAbs = (p: Pub) => `${p.title} ${p.abstract}`;

const hasMesh = (p: Pub, list: string[] | undefined) => !!list?.some((m) => p.mesh.some((x) => x.toLowerCase() === m.toLowerCase()));

/** Одно понятие в одной публикации. null: не найдено. */
export function conceptHit(p: Pub, c: Concept, mode: Mode): { via: Via; terms: string[] } | null {
  if (c.flag === 'mentionsGBS' && p.mentionsGBS) return { via: 'flag', terms: [] };
  const text = titleAbs(p);
  const meshHit = hasMesh(p, c.mesh) || hasMesh(p, c.pa);
  const tiab = c.tiab.filter((t) => termIn(text, t));

  if (mode === 'exact') {
    /* Точно: MeSH, фармакологическое действие и основная формулировка в Title/Abstract (как слово врача, без синонимов).
       Для понятий без MeSH — поля Title/Abstract. */
    if (c.mesh?.length || c.pa?.length) {
      if (meshHit) return { via: 'mesh', terms: [] };
      return !c.meshOnly && tiab.includes(c.tiab[0]) ? { via: 'tiab', terms: [c.tiab[0]] } : null;
    }
    return tiab.length ? { via: 'tiab', terms: tiab } : null;
  }
  if (meshHit) return { via: 'mesh', terms: [] };
  if (tiab.length) return { via: 'tiab', terms: tiab };
  if (mode === 'broad') return null;

  /* Запасной и диагностика: слова из названий MeSH и сопоставления, как при автоматическом разборе PubMed. */
  const hay = `${text} ${p.mesh.join(' ')}`.toLowerCase();
  const words = [...new Set([...(c.mesh ?? []), ...(c.pa ?? []), c.mapped].flatMap((x) => x.split(/[;,\s]+/)).filter((w) => w.length >= 5))];
  const hit = words.filter((w) => hay.includes(w.toLowerCase().slice(0, Math.max(4, w.length - 1))));
  return hit.length ? { via: 'text', terms: hit } : null;
}

export const ALL_TYPES: StudyType[] = ['sr', 'ma', 'rct', 'cohort'];

/** Допустимые типы исследований. Ничего не отмечено значит «любые»: пустой список не должен обнулять выдачу. */
export const effTypes = (p: Params): StudyType[] => (p.types.length ? p.types : ALL_TYPES);

const WEIGHT: Record<Via, number> = { mesh: 3, tiab: 2, flag: 2, text: 1 };

const inPeriod = (p: Pub, period: number | null) => period === null || p.year >= NOW_YEAR - period;

export interface Eval {
  ok: boolean;
  score: number;
  matchedConcepts: string[];
  via: Record<string, Via>;
  terms: Record<string, string[]>;
  matchedRequired: string[];
  matchedPreferred: string[];
  missedPreferred: string[];
}

/** Проверка публикации по структурированному запросу в одном режиме.
    exact — всё, что задал врач, точными полями; broad — то же, но понятия ещё и синонимами;
    fallback — только REQUIRED; diag — ничего не отсеивает, только записывает, что выполнено. */
export function evaluate(p: Pub, params: Params, sc: Scenario | null, mode: Mode): Eval {
  const r: Eval = { ok: true, score: 0, matchedConcepts: [], via: {}, terms: {}, matchedRequired: [], matchedPreferred: [], missedPreferred: [] };
  const apply = (kind: ConstraintKind) => mode !== 'fallback' || kind === 'REQUIRED';
  const conceptMode: Mode = mode === 'diag' ? 'broad' : mode;
  const note = (kind: ConstraintKind, id: string, met: boolean) => {
    if (kind === 'REQUIRED') {
      if (met) r.matchedRequired.push(id);
    } else if (met) r.matchedPreferred.push(id);
    else r.missedPreferred.push(id);
  };

  /* Понятия. В Broad пара объектов сравнения объединяется через OR. */
  const groups = groupsOf(params, sc);
  const pairGroups = mode === 'broad' || mode === 'fallback' ? groups.filter((g) => g.pair) : [];
  const merged: CGroup[] = groups.filter((g) => !pairGroups.includes(g));
  if (pairGroups.length > 1) merged.push({ key: 'pair', members: pairGroups.flatMap((g) => g.members), kind: 'REQUIRED', pair: true });
  else merged.push(...pairGroups);

  for (const g of merged) {
    let any = false;
    for (const m of g.members) {
      const h = conceptHit(p, m, conceptMode);
      if (h) {
        any = true;
        r.matchedConcepts.push(m.id);
        r.via[m.id] = h.via;
        r.terms[m.id] = h.terms;
        r.score += WEIGHT[h.via] * (g.kind === 'REQUIRED' ? 2 : 1);
      }
    }
    note(g.kind, g.members[0].id, any);
    if (!any && apply(g.kind)) r.ok = false;
  }

  /* Тип исследования: допустимые типы всегда обязательны, «в приоритете» желательны. */
  const typeOk = effTypes(params).includes(p.type);
  note('REQUIRED', 'types', typeOk);
  if (!typeOk && mode !== 'diag') r.ok = false;
  if (params.preferTypes.length) {
    const pref = params.preferTypes.includes(p.type);
    note('PREFERRED', 'prefer-types', pref);
    if (pref) r.score += 2;
    if (!pref && apply('PREFERRED')) r.ok = false;
  }

  if (params.period !== null) {
    const ok = inPeriod(p, params.period);
    note(params.periodKind, 'period', ok);
    if (!ok && apply(params.periodKind)) r.ok = false;
  }
  if (params.fullTextOnly) {
    const ok = p.fullTextState === 'pmc-full-text';
    note(params.fullTextKind, 'fulltext', ok);
    if (!ok && apply(params.fullTextKind)) r.ok = false;
  }
  if (mode === 'diag') r.ok = true;
  return r;
}

/** Есть ли в запросе желательные условия: тогда Fallback даёт отличающийся результат и его стоит выполнить. */
export function preferredClauses(params: Params, sc: Scenario | null): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  for (const g of groupsOf(params, sc)) {
    if (g.kind === 'PREFERRED') out.push({ id: g.members[0].id, label: g.members.map((m) => m.label).join(', ') });
  }
  if (params.preferTypes.length) out.push({ id: 'prefer-types', label: `В приоритете: ${params.preferTypes.map((t) => TYPE_NAME[t]).join(', ')}` });
  if (params.period !== null && params.periodKind === 'PREFERRED') out.push({ id: 'period', label: periodText(params.period) });
  if (params.fullTextOnly && params.fullTextKind === 'PREFERRED') out.push({ id: 'fulltext', label: 'С полным текстом' });
  return out;
}

export const TYPE_NAME = { sr: 'обзоры', ma: 'метаанализы', rct: 'РКИ', cohort: 'когорты' } as const;
export const periodText = (n: number) => (n === 1 ? 'за последний год' : n < 5 ? `за последние ${n} года` : `за последние ${n} лет`);
