import type { ExploreView, Grouping, Params, Period, QueryPlan, ResultIntent, ScenarioId, SearchResponse, SortMode, StudyType, ViewId } from '../data/types';
import { SCENARIO_MAP, cloneParams } from '../data/scenarios';
import { inferParams } from '../data/infer';
import { route } from '../data/router';
import { ALL_TYPES } from '../data/match';
import { DrMode, defaultMode } from '../lib/dr';
import { answerFor } from '../lib/pbz';
import { pubById } from '../data/known';
import { applyCandidate, resolveAmbiguity } from '../data/terms';
import { reorder } from '../data/pipeline';
import { allowedViews, defaultView } from '../lib/views';

/* Конечный автомат прототипа.
   Фазы: idle → query-entered → semantic-parsing → searching → result →
   search-details-open → parameter-edited → results-updated.
   Дополнительные: ambiguous-term, wrong-source, too-narrow, not-understood.

   Продуктовая цепочка живёт в данных, а не в интерфейсе:
   запрос → route() (задача) → inferParams() (структурированный запрос) → pipeline (стратегии, слияние, ранжирование)
   → response.state → экран → следующее действие.
   Состояние поиска (запрос, условия, сортировка, выбранный вид, открытая публикация) не теряется,
   пока врач не начал новый запрос. */

export type Phase =
  | 'idle'
  | 'query-entered'
  | 'semantic-parsing'
  | 'ambiguous-term'
  | 'searching'
  | 'wrong-source'
  | 'result'
  | 'search-details-open'
  | 'parameter-edited'
  | 'results-updated'
  | 'too-narrow'
  | 'not-understood';

export type Lang = 'en' | 'ru';

export interface AmbiguityChoice { id: string; label: string; hint: string }

/** Где сейчас врач: поиск в PubMed, разговор в ПБЗ или Deep Research. Это один тред, а не три разные страницы. */
export type Surface = 'agent' | 'pbz' | 'dr';

export interface PbzMsg { id: number; role: 'user' | 'assistant'; text: string; short: boolean; sources: string[] }
/** Тред ПБЗ: о чём разговор (найденное целиком или одна статья), режим ответа и реплики. */
export interface PbzThread { pubId: string | null; short: boolean; msgs: PbzMsg[] }
/** Deep Research: экран плана, ход исследования, результат. */
export interface DrState { stage: 'plan' | 'running' | 'done'; mode: DrMode; web: boolean }

/** Локальное предпочтение: каким видом врач заканчивает обычный поиск литературы. */
export interface Prefs { counts: Record<ExploreView, number>; preferred: ExploreView | null }

const PREFS_KEY = 'ask-pubmed:explore-view';
const ONBOARDING_KEY = 'ask-pubmed:onboarding-seen';
const emptyPrefs = (): Prefs => ({ counts: { grid: 0, grouped: 0, compact: 0 }, preferred: null });

/* В localStorage лежит только три вещи: показанное обучение, предпочитаемый вид выдачи и настройки доступности.
   Поисковая сессия там не хранится. */
export function loadPrefs(): Prefs {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return emptyPrefs();
    const p = JSON.parse(raw) as Prefs;
    return { counts: { ...emptyPrefs().counts, ...p.counts }, preferred: p.preferred ?? null };
  } catch {
    return emptyPrefs();
  }
}
export function savePrefs(p: Prefs) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* без хранилища предпочтение живёт до перезагрузки */
  }
}
export function loadOnboardingSeen(): boolean {
  try {
    return window.localStorage.getItem(ONBOARDING_KEY) === '1';
  } catch {
    return false;
  }
}
export function saveOnboardingSeen(seen: boolean) {
  try {
    if (seen) window.localStorage.setItem(ONBOARDING_KEY, '1');
    else window.localStorage.removeItem(ONBOARDING_KEY);
  } catch {
    /* без хранилища обучение показывается при каждой загрузке */
  }
}

export interface State {
  phase: Phase;
  query: string;
  /** Последний отправленный запрос: пока он не изменился, правки параметров сохраняются. */
  lastQuery: string;
  scenarioId: ScenarioId | null;
  /** Разбор формулировки: задача и то, что для неё нужно. */
  plan: QueryPlan | null;
  /** Текущее представление внутри типа выдачи; null: взять по умолчанию. */
  view: ViewId | null;
  /** Сколько раз врач переложил найденное; сбрасывается новым поиском. */
  viewMoves: number;
  /** Ключ последней учтённой «остановки» на представлении. */
  settled: string;
  prefs: Prefs;
  /** Открытая публикация: рабочая область поверх выдачи. */
  pub: { id: string; quote?: string } | null;
  /** Положение прокрутки выдачи в момент открытия статьи: к нему возвращаемся. */
  returnScroll: number | null;
  /** Выдача показана повторно после статьи: карточки не выезжают заново. */
  returning: boolean;
  oneSided: boolean;
  grouping: Grouping | null;
  sort: SortMode;
  ambiguityId?: string;
  askChoices: AmbiguityChoice[] | null;
  askKind: 'term' | null;
  params: Partial<Record<ScenarioId, Params>>;
  response: SearchResponse | null;
  /** Номер запроса к бэкенду: ответ на устаревший запрос не меняет экран. */
  reqId: number;
  sheetOpen: boolean;
  rawOpen: boolean;
  confirmGbs: boolean;
  lang: Record<string, Lang>;
  routed: boolean;
  handoff: boolean;
  changed: { kind: string; id: string; n: number } | null;
  /** Публикации, отмеченные врачом для передачи в Deep Research. */
  selected: string[];
  /** Подписки на первоисточники: журнал и тема поиска. Живут, пока открыта вкладка, и не сбрасываются новым запросом. */
  subs: string[];
  surface: Surface;
  /** Откуда открыта статья: из ПБЗ или Deep Research. Назад вернёт туда же, а не в выдачу. */
  pubFrom: 'pbz' | 'dr' | null;
  /** Какие режимы врач уже открывал в этом треде: к ним можно вернуться из полосы режимов. */
  visited: Surface[];
  pbz: PbzThread | null;
  dr: DrState | null;
  drStarted: boolean;
  revealed: number;
  jolt: number;
  hintSeen: boolean;
  /** Обучение на главной: показывается, пока врач не сделал первое осмысленное действие. */
  onboarding: boolean;
  toast: { text: string; n: number } | null;
}

export const initialState: State = {
  phase: 'idle',
  query: '',
  lastQuery: '',
  scenarioId: null,
  plan: null,
  view: null,
  viewMoves: 0,
  settled: '',
  prefs: emptyPrefs(),
  pub: null,
  returnScroll: null,
  returning: false,
  oneSided: false,
  grouping: null,
  sort: 'relevance',
  askChoices: null,
  askKind: null,
  params: {},
  response: null,
  reqId: 0,
  sheetOpen: false,
  rawOpen: false,
  confirmGbs: false,
  lang: {},
  routed: false,
  handoff: false,
  changed: null,
  selected: [],
  subs: [],
  surface: 'agent',
  pubFrom: null,
  visited: ['agent'],
  pbz: null,
  dr: null,
  drStarted: false,
  revealed: 0,
  jolt: 0,
  hintSeen: false,
  onboarding: true,
  toast: null,
};

export type Action =
  | { t: 'type'; query: string }
  | { t: 'submit' }
  | { t: 'load'; query: string }
  | { t: 'reset' }
  | { t: 'parsed' }
  | { t: 'pick-choice'; id: string }
  | { t: 'searched'; response: SearchResponse; reqId: number }
  | { t: 'route-pubmed' }
  | { t: 'route-open' }
  | { t: 'open-sheet' }
  | { t: 'close-sheet' }
  | { t: 'raw'; open: boolean }
  | { t: 'edit'; patch: (p: Params) => Params; change: { kind: string; id: string } }
  | { t: 'updated'; response: SearchResponse; reqId: number }
  | { t: 'relax' }
  | { t: 'set-meaning'; id: string }
  | { t: 'ask-gbs' }
  | { t: 'keep-gbs' }
  | { t: 'toggle-lang'; id: string; to?: Lang }
  | { t: 'dr-start' }
  | { t: 'toggle-select'; id: string }
  | { t: 'select-all'; ids: string[] }
  | { t: 'reveal' }
  | { t: 'back' }
  | { t: 'hint-seen' }
  | { t: 'reset-hint' }
  | { t: 'cycle-view' }
  | { t: 'settle' }
  | { t: 'pref-reset' }
  | { t: 'open-pub'; id: string; quote?: string; scroll?: number; /** Язык, на котором врач читал фрагмент: статья откроется на нём же. */ lang?: Lang }
  | { t: 'close-pub' }
  | { t: 'sort'; sort: SortMode }
  | { t: 'toggle-sided' }
  | { t: 'group-by'; grouping: Grouping }
  | { t: 'onboarding-done' }
  | { t: 'onboarding-show' }
  | { t: 'toast'; text: string }
  | { t: 'toggle-sub'; key: string; label: string }
  | { t: 'open-pbz'; pubId?: string; ask?: string }
  | { t: 'pbz-ask'; text: string }
  | { t: 'pbz-short'; short: boolean }
  | { t: 'to-surface'; to: Surface }
  | { t: 'dr-set'; patch: Partial<Pick<DrState, 'mode' | 'web'>> }
  | { t: 'dr-run' }
  | { t: 'dr-done' }
  | { t: 'toast-clear' };

export const paramsOf = (s: State, id: ScenarioId): Params => s.params[id] ?? cloneParams(SCENARIO_MAP[id].baseParams);

export function displayPhase(s: State): Phase {
  if (s.sheetOpen && (s.phase === 'result' || s.phase === 'results-updated')) return 'search-details-open';
  return s.phase;
}

/** Страница сама является публикацией (PMID, DOI, название, «в этой статье найди…»): выдачи под ней нет. */
export const isLanding = (plan: QueryPlan | null): boolean =>
  !!plan && (plan.job === 'known-publication' || (plan.job === 'find-in-text' && plan.find?.scope === 'publication'));

/** Семейство экрана сейчас: задача, фаза, состояние результата и включённые уточнения вместе. */
export function intentOf(s: State): ResultIntent {
  if (s.phase === 'ambiguous-term') return 'clarify';
  if (s.phase === 'too-narrow' || s.phase === 'not-understood') return 'empty';
  const plan = s.plan;
  if (!plan) return 'explore';
  const sc = s.scenarioId ? SCENARIO_MAP[s.scenarioId] : null;
  if (sc?.quotesConcept && !isLanding(plan) && (plan.job === 'literature-search' || plan.job === 'find-in-text')) {
    const on = paramsOf(s, sc.id).concepts.find((c) => c.id === sc.quotesConcept)?.active;
    if (on) return 'find-in-text';
    if (plan.job === 'find-in-text') return 'explore';
  }
  return plan.intent;
}

export function viewOf(s: State): ViewId {
  const intent = intentOf(s);
  if (s.view && allowedViews[intent].includes(s.view)) return s.view;
  if (intent === 'explore' && s.plan?.view && s.plan.job === 'literature-search') return s.plan.view;
  if (intent === 'find-in-text' && isLanding(s.plan)) return 'publication';
  return defaultView(intent, s.prefs.preferred);
}

/** Врач остановился на представлении: учитываем выбор. Два раза подряд один вид — он становится первым. */
function settle(s: State): State {
  if (intentOf(s) !== 'explore' || s.viewMoves === 0) return s;
  const v = viewOf(s) as ExploreView;
  const key = `${s.viewMoves}:${v}`;
  if (s.settled === key) return s;
  const counts = { ...s.prefs.counts, [v]: s.prefs.counts[v] + 1 };
  const becomes = counts[v] >= 2 && s.prefs.preferred !== v;
  const prefs: Prefs = { counts, preferred: becomes ? v : s.prefs.preferred };
  return {
    ...s,
    settled: key,
    prefs,
    toast: becomes ? { text: 'В следующих поисках покажем так же', n: (s.toast?.n ?? 0) + 1 } : s.toast,
  };
}

const isResultPhase = (p: Phase) => p === 'result' || p === 'results-updated' || p === 'too-narrow' || p === 'parameter-edited';

const searching = (s: State, patch: Partial<State> = {}): State => ({ ...s, ...patch, phase: 'searching', reqId: s.reqId + 1 });

/** Открытая публикация закрыта: возвращаемся в ту же выдачу. */
const leavePub = (s: State): State =>
  s.pubFrom ? { ...s, pub: null, surface: s.pubFrom, pubFrom: null } : { ...s, pub: null, returning: true };

const addVisited = (v: Surface[], x: Surface): Surface[] => (v.includes(x) ? v : [...v, x]);

export function reducer(s: State, a: Action): State {
  switch (a.t) {
    case 'type': {
      if (s.phase !== 'idle' && s.phase !== 'query-entered') return s;
      return { ...s, query: a.query, phase: a.query.trim() ? 'query-entered' : 'idle' };
    }

    case 'submit': {
      if (!s.query.trim()) return s;
      if (s.phase !== 'idle' && s.phase !== 'query-entered') return s;
      const settled = settle(s);
      const plan = route(s.query);
      const id = plan.scenarioId;
      let params = s.params;
      if (id && (s.query !== s.lastQuery || !s.params[id])) {
        params = { ...s.params, [id]: inferParams(s.query, SCENARIO_MAP[id], plan) };
      }
      return {
        ...s,
        prefs: settled.prefs,
        toast: settled.toast,
        params,
        plan,
        view: null,
        viewMoves: 0,
        settled: '',
        pub: null,
        returnScroll: null,
        returning: false,
        oneSided: false,
        grouping: null,
        sort: plan.sort ?? 'relevance',
        lastQuery: s.query,
        phase: 'semantic-parsing',
        scenarioId: id,
        ambiguityId: undefined,
        response: null,
        routed: false,
        handoff: false,
        sheetOpen: false,
        rawOpen: false,
        revealed: 0,
        selected: [],
        surface: 'agent',
        pubFrom: null,
        visited: ['agent'],
        pbz: null,
        dr: null,
        drStarted: false,
        askChoices: null,
        askKind: null,
        onboarding: false,
      };
    }

    case 'load': {
      const left = settle(s);
      const seed: State = { ...initialState, hintSeen: s.hintSeen, subs: s.subs, prefs: left.prefs, onboarding: s.onboarding, query: a.query, phase: 'query-entered' };
      return reducer(seed, { t: 'submit' });
    }

    case 'reset':
      return { ...initialState, hintSeen: s.hintSeen, subs: s.subs, prefs: s.prefs, onboarding: false };

    case 'parsed': {
      if (s.phase !== 'semantic-parsing') return s;
      const sc = s.scenarioId ? SCENARIO_MAP[s.scenarioId] : null;
      /* Ни одно понятие запроса не распознано: вопрос из одного варианта не задаём, объясняем и предлагаем примеры. */
      if (!sc) return { ...s, phase: 'not-understood' };
      /* Известная публикация ищется по идентификатору. Тематического поиска и уточнений нет. */
      if (isLanding(s.plan)) return searching(s);

      const amb = resolveAmbiguity(s.query, sc);
      if (amb.status === 'multiple' && !s.ambiguityId) {
        return {
          ...s,
          phase: 'ambiguous-term',
          askKind: 'term',
          askChoices: amb.candidates.map((o) => ({ id: o.id, label: o.label, hint: o.hint })),
        };
      }
      /* Один уверенный кандидат: продолжаем сразу, спрашивать не о чем. */
      let next = s;
      if (amb.status === 'single' && !s.ambiguityId) {
        next = { ...s, ambiguityId: amb.candidate.id, params: { ...s.params, [sc.id]: applyCandidate(paramsOf(s, sc.id), sc, amb.candidate) } };
      }
      const needsRoute = !!sc.route && sc.route.trigger.test(s.query) && !s.routed;
      if (needsRoute) return { ...next, phase: 'wrong-source' };
      return searching(next);
    }

    case 'pick-choice': {
      if (s.phase !== 'ambiguous-term' || !s.scenarioId) return s;
      const sc = SCENARIO_MAP[s.scenarioId];
      const opt = sc.ambiguity?.options.find((o) => o.id === a.id);
      if (!opt) return s;
      /* Выбор значения сразу запускает поиск: на главную не возвращаемся. */
      return searching(s, {
        ambiguityId: a.id,
        params: { ...s.params, [sc.id]: applyCandidate(paramsOf(s, sc.id), sc, opt) },
        askChoices: null,
        askKind: null,
      });
    }

    case 'searched': {
      if (s.phase !== 'searching' || a.reqId !== s.reqId) return s;
      const zero = a.response.state === 'zero-results' || a.response.state === 'known-publication-not-found';
      return { ...s, response: a.response, phase: zero ? 'too-narrow' : 'result' };
    }

    case 'route-pubmed': {
      if (s.phase !== 'wrong-source') return s;
      return searching(s, { routed: true, handoff: false });
    }

    case 'route-open': {
      if (s.phase !== 'wrong-source') return s;
      const text = SCENARIO_MAP[s.scenarioId!].route!.handoff;
      return { ...s, handoff: true, toast: { text, n: (s.toast?.n ?? 0) + 1 } };
    }

    case 'open-sheet':
      return { ...s, sheetOpen: true };
    case 'close-sheet':
      return { ...s, sheetOpen: false, rawOpen: false, confirmGbs: false };
    case 'raw':
      return { ...s, rawOpen: a.open };

    case 'edit': {
      if (!s.scenarioId || !isResultPhase(s.phase)) return s;
      const id = s.scenarioId;
      const next = a.patch(cloneParams(paramsOf(s, id)));
      return {
        ...s,
        params: { ...s.params, [id]: next },
        phase: 'parameter-edited',
        reqId: s.reqId + 1,
        changed: { ...a.change, n: (s.changed?.n ?? 0) + 1 },
        confirmGbs: false,
        revealed: 0,
        pub: null,
        selected: [],
      };
    }

    case 'updated': {
      if (s.phase !== 'parameter-edited' || a.reqId !== s.reqId) return s;
      const zero = a.response.state === 'zero-results' || a.response.state === 'known-publication-not-found';
      return { ...s, response: a.response, phase: zero ? 'too-narrow' : 'results-updated' };
    }

    case 'relax': {
      const relax = s.response?.relax;
      if (!relax || !s.scenarioId) return s;
      const id = s.scenarioId;
      const next = cloneParams(paramsOf(s, id));
      if (relax.kind === 'period') next.period = relax.to;
      if (relax.kind === 'fulltext') next.fullTextOnly = false;
      if (relax.kind === 'types') next.types = [...ALL_TYPES];
      if (relax.kind === 'filters') {
        next.period = null;
        next.fullTextOnly = false;
        next.types = [...ALL_TYPES];
      }
      return {
        ...s,
        params: { ...s.params, [id]: next },
        phase: 'parameter-edited',
        reqId: s.reqId + 1,
        changed: { kind: relax.kind, id: relax.kind, n: (s.changed?.n ?? 0) + 1 },
        revealed: 0,
      };
    }

    /* Другое значение неоднозначного термина: тот же вопрос, тот же поиск, но с иным смыслом слова.
       Работает и на нулевой выдаче, и на обычной: врач не обязан возвращаться к вопросу уточнения. */
    case 'set-meaning': {
      if (!s.scenarioId || !isResultPhase(s.phase)) return s;
      const sc = SCENARIO_MAP[s.scenarioId];
      const opt = sc.ambiguity?.options.find((o) => o.id === a.id);
      if (!opt || s.ambiguityId === a.id) return s;
      return {
        ...s,
        ambiguityId: a.id,
        params: { ...s.params, [sc.id]: applyCandidate(paramsOf(s, sc.id), sc, opt) },
        phase: 'parameter-edited',
        reqId: s.reqId + 1,
        changed: { kind: 'meaning', id: sc.ambiguity!.conceptId, n: (s.changed?.n ?? 0) + 1 },
        revealed: 0,
        pub: null,
        selected: [],
      };
    }

    case 'ask-gbs':
      return { ...s, confirmGbs: true };
    case 'keep-gbs':
      return { ...s, confirmGbs: false };

    case 'toggle-lang': {
      const cur = s.lang[a.id] ?? 'en';
      const to = a.to ?? (cur === 'en' ? 'ru' : 'en');
      return { ...s, lang: { ...s.lang, [a.id]: to } };
    }

    /* Передача в Deep Research открывает его первый экран, план исследования. Незаметного перехода нет: режим назван, вернуться можно. */
    case 'dr-start': {
      if (!s.response) return s;
      return { ...s, drStarted: true, surface: 'dr', pubFrom: null, visited: addVisited(s.visited, 'dr'), dr: { stage: 'plan', mode: defaultMode(s.plan?.drMode), web: false } };
    }
    case 'open-pbz': {
      if (!s.response || !s.scenarioId) return s;
      const same = s.pbz && s.pbz.pubId === (a.pubId ?? null);
      const base: PbzThread = same ? s.pbz! : { pubId: a.pubId ?? null, short: true, msgs: [] };
      const next: State = { ...s, surface: 'pbz', pubFrom: null, visited: addVisited(s.visited, 'pbz'), pub: null, sheetOpen: false, pbz: base };
      return a.ask ? reducer(next, { t: 'pbz-ask', text: a.ask }) : next;
    }
    case 'pbz-ask': {
      if (!s.pbz || !s.response || !s.scenarioId || !a.text.trim()) return s;
      const sc = SCENARIO_MAP[s.scenarioId];
      const one = s.pbz.pubId ? [...s.response.items, ...sc.pool].find((p) => p.id === s.pbz!.pubId) ?? pubById(s.pbz.pubId)?.pub ?? null : null;
      const ans = answerFor(sc, s.response.items, a.text, s.pbz.short, one);
      const id = s.pbz.msgs.length;
      const msgs: PbzMsg[] = [
        ...s.pbz.msgs,
        { id, role: 'user', text: a.text.trim(), short: s.pbz.short, sources: [] },
        { id: id + 1, role: 'assistant', text: ans.text, short: s.pbz.short, sources: ans.sources },
      ];
      return { ...s, pbz: { ...s.pbz, msgs } };
    }
    case 'pbz-short':
      return s.pbz ? { ...s, pbz: { ...s.pbz, short: a.short } } : s;
    case 'to-surface': {
      if (a.to === 'agent') return { ...s, surface: 'agent', pubFrom: null, drStarted: false };
      if (a.to === 'pbz') return s.pbz ? { ...s, surface: 'pbz', pubFrom: null, pub: null } : reducer(s, { t: 'open-pbz' });
      return s.dr ? { ...s, surface: 'dr', pubFrom: null, pub: null } : reducer(s, { t: 'dr-start' });
    }
    case 'dr-set':
      return s.dr && s.dr.stage === 'plan' ? { ...s, dr: { ...s.dr, ...a.patch } } : s;
    case 'dr-run':
      return s.dr && s.dr.stage === 'plan' ? { ...s, dr: { ...s.dr, stage: 'running' } } : s;
    case 'dr-done':
      return s.dr && s.dr.stage === 'running' ? { ...s, dr: { ...s.dr, stage: 'done' } } : s;
    case 'toggle-select':
      return { ...s, drStarted: false, selected: s.selected.includes(a.id) ? s.selected.filter((x) => x !== a.id) : [...s.selected, a.id] };
    case 'select-all':
      return { ...s, drStarted: false, selected: a.ids };
    case 'reveal':
      return { ...s, revealed: s.revealed + 4 };

    case 'back': {
      /* Один порядок везде: ПБЗ и Deep Research → найденное; статья → выдача; выдача → главная с тем же запросом; открытая панель закрывается первой. */
      if (s.surface !== 'agent') return { ...s, surface: 'agent', drStarted: false };
      if (s.sheetOpen && isResultPhase(s.phase)) return { ...s, sheetOpen: false, rawOpen: false, confirmGbs: false };
      if (s.pub && !isLanding(s.plan)) return leavePub(s);
      if (s.phase === 'wrong-source' || s.phase === 'ambiguous-term' || s.phase === 'semantic-parsing' || s.phase === 'searching' || s.phase === 'not-understood') {
        if (s.routed && s.phase === 'searching') return { ...s, phase: 'wrong-source', routed: false };
        return { ...s, phase: s.query.trim() ? 'query-entered' : 'idle', sheetOpen: false, rawOpen: false, askChoices: null, askKind: null };
      }
      if (isResultPhase(s.phase)) {
        if (s.routed) {
          return { ...s, phase: 'wrong-source', routed: false, response: null, sheetOpen: false, rawOpen: false, handoff: false };
        }
        return { ...s, phase: 'query-entered', response: null, pub: null, sheetOpen: false, rawOpen: false, confirmGbs: false };
      }
      return s;
    }

    case 'cycle-view': {
      if (!isResultPhase(s.phase) || s.phase === 'parameter-edited') return s;
      const intent = intentOf(s);
      if (intent !== 'explore') return s;
      const list = allowedViews[intent];
      const cur = viewOf(s);
      const next = list[(list.indexOf(cur) + 1) % list.length];
      const moved = settle(s);
      return { ...moved, view: next, pub: null, viewMoves: s.viewMoves + 1, jolt: s.jolt + 1, hintSeen: true };
    }

    case 'settle':
      return settle(s);

    case 'pref-reset':
      return { ...s, prefs: emptyPrefs(), settled: '', toast: { text: 'Вид по умолчанию сброшен', n: (s.toast?.n ?? 0) + 1 } };

    case 'open-pub':
      return {
        ...s,
        surface: 'agent',
        pubFrom: s.surface !== 'agent' ? s.surface : s.pub ? s.pubFrom : null,
        pub: { id: a.id, quote: a.quote },
        lang: a.lang ? { ...s.lang, [a.id]: a.lang } : s.lang,
        returnScroll: a.scroll ?? s.returnScroll,
        sheetOpen: false,
        rawOpen: false,
      };
    case 'close-pub':
      return leavePub(s);

    case 'sort': {
      if (!s.response || a.sort === s.sort) return s;
      return { ...s, sort: a.sort, response: reorder(s.response, a.sort), changed: { kind: 'sort', id: a.sort, n: (s.changed?.n ?? 0) + 1 } };
    }

    case 'toggle-sided':
      return { ...s, oneSided: !s.oneSided };
    case 'group-by':
      return { ...s, grouping: a.grouping, jolt: s.jolt + 1 };

    case 'hint-seen':
      return { ...s, hintSeen: true };
    case 'reset-hint':
      return { ...s, hintSeen: false };

    case 'onboarding-done':
      return { ...s, onboarding: false };
    case 'onboarding-show':
      return { ...initialState, hintSeen: s.hintSeen, subs: s.subs, prefs: s.prefs, onboarding: true };

    case 'toast':
      return { ...s, toast: { text: a.text, n: (s.toast?.n ?? 0) + 1 } };
    case 'toggle-sub': {
      const on = s.subs.includes(a.key);
      return {
        ...s,
        subs: on ? s.subs.filter((k) => k !== a.key) : [...s.subs, a.key],
        toast: { text: on ? `Подписку отключили: ${a.label}` : `Подписались: ${a.label}. Новое появится в Ленте`, n: (s.toast?.n ?? 0) + 1 },
      };
    }
    case 'toast-clear':
      return { ...s, toast: null };
  }
}

/* ─── Правки параметров ─── */

export const setPeriod = (period: Period) => (p: Params): Params => ({ ...p, period });
export const setPeriodKind = (periodKind: Params['periodKind']) => (p: Params): Params => ({ ...p, periodKind });
export const setFullTextKind = (fullTextKind: Params['fullTextKind']) => (p: Params): Params => ({ ...p, fullTextKind });
export const clearPriority = () => (p: Params): Params => ({ ...p, preferTypes: [] });
export const toggleType = (t: StudyType) => (p: Params): Params => ({
  ...p,
  types: p.types.includes(t) ? p.types.filter((x) => x !== t) : [...p.types, t],
  preferTypes: p.types.includes(t) ? p.preferTypes.filter((x) => x !== t) : p.preferTypes,
});
export const toggleConcept = (id: string) => (p: Params): Params => ({
  ...p,
  concepts: p.concepts.map((c) => (c.id === id ? { ...c, active: !c.active } : c)),
});
export const setConceptActive = (id: string, active: boolean) => (p: Params): Params => ({
  ...p,
  concepts: p.concepts.map((c) => (c.id === id ? { ...c, active } : c)),
});
export const toggleFullText = () => (p: Params): Params => ({ ...p, fullTextOnly: !p.fullTextOnly });
export const toggleHumans = () => (p: Params): Params => ({ ...p, humans: !p.humans });
