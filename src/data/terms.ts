import type { Concept, Params, Scenario, TermCandidate } from './types';
import { SCENARIOS, cloneParams } from './scenarios';

/* Терминология: неоднозначные термины, дополнительные понятия и перевод фразы врача в слова для поиска по тексту. */

export type AmbiguityResult =
  | { status: 'none' }
  | { status: 'single'; candidate: TermCandidate }
  | { status: 'multiple'; candidates: TermCandidate[] };

/** Правило уточнения.
    0 кандидатов — вопрос не задаём (термин не неоднозначен или его нет в словаре);
    1 уверенный кандидат — продолжаем поиск, спрашивать не о чем;
    2 и больше правдоподобных кандидатов с разными медицинскими понятиями — показываем уточнение. */
export function resolveAmbiguity(query: string, sc: Scenario | null): AmbiguityResult {
  const a = sc?.ambiguity;
  if (!a || !a.trigger.test(query)) return { status: 'none' };
  const picked = a.options.filter((o) => o.pick?.test(query));
  if (picked.length === 1) return { status: 'single', candidate: picked[0] };
  const plausible = a.options.filter((o) => o.confidence >= 0.25);
  const distinct = plausible.filter((o, i) => plausible.findIndex((x) => x.label === o.label) === i);
  if (distinct.length >= 2) return { status: 'multiple', candidates: distinct };
  if (distinct.length === 1) return { status: 'single', candidate: distinct[0] };
  return { status: 'none' };
}

/** Выбранное значение термина попадает в понятие запроса. */
export function applyCandidate(params: Params, sc: Scenario, candidate: TermCandidate): Params {
  const p = cloneParams(params);
  p.concepts = p.concepts.map((c) =>
    c.id === sc.ambiguity!.conceptId ? { ...c, label: candidate.label, hint: candidate.hint, mapped: candidate.mapped, mesh: candidate.mesh, tiab: candidate.tiab } : c,
  );
  return p;
}

/** Дополнительные понятия сценария, которые врач упомянул словами запроса. */
export function addLexicon(params: Params, sc: Scenario, query: string): Params {
  const p = cloneParams(params);
  for (const e of sc.lexicon ?? []) {
    if (!e.trigger.test(query)) continue;
    const next: Concept = { ...e.concept, active: true };
    const at = p.concepts.findIndex((c) => c.id === next.id);
    if (at >= 0) p.concepts[at] = next;
    else p.concepts.push(next);
  }
  return p;
}

export const stems = (label: string) =>
  label
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split(/[\s,;/()-]+/)
    .filter((w) => w.length >= 4)
    .map((w) => w.slice(0, Math.max(4, w.length - 2)));

/** Слова врача, которые заведомо переводятся в английский термин. */
const GLOSS: [RegExp, string][] = [
  [/ферритин/, 'ferritin'],
  [/насыщени\S*\s+трансферрин/, 'transferrin saturation'],
  [/дефицит\S*\s+желез|железодефицит/, 'iron deficiency'],
  [/сердечн\S*\s+недостаточн|хсн/, 'heart failure'],
  [/порог|пороговы/, 'threshold'],
  [/критери/, 'criteria'],
  [/гемоглобин/, 'hemoglobin'],
  [/смертност/, 'mortality'],
  [/госпитализац/, 'hospitalization'],
];

/** Что искать в тексте статьи: слова на латинице из фразы врача и английские термины понятий, о которых он говорит. */
export function termsFor(phrase: string, sc: Scenario | null): string[] {
  const out: string[] = [];
  const quoted = phrase.match(/[«"“]([A-Za-z][^»"”]{2,})[»"”]/)?.[1];
  if (quoted) out.push(quoted.trim());
  (phrase.match(/[A-Za-z][A-Za-z0-9-]{3,}(?:\s+[A-Za-z][A-Za-z0-9-]{2,})*/g) ?? []).forEach((w) => !out.includes(w) && out.push(w));
  const p = phrase.toLowerCase().replace(/ё/g, 'е');
  for (const [re, en] of GLOSS) if (re.test(p) && !out.includes(en)) out.push(en);
  const scs = sc ? [sc] : SCENARIOS;
  for (const s of scs) {
    const concepts = [...s.baseParams.concepts, ...(s.lexicon ?? []).map((e) => e.concept)];
    for (const c of concepts) {
      if (!c.tiab.length || c.role === 'quote') continue;
      const st = stems(c.label);
      if (st.length && st.every((x) => p.includes(x)) && !out.includes(c.tiab[0])) out.push(c.tiab[0]);
    }
  }
  return out;
}
