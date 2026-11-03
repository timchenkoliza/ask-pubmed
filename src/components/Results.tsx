import { LayoutGroup } from 'framer-motion';
import { ArrowDownWideNarrow, Info } from 'lucide-react';
import { Dispatch, useEffect, useLayoutEffect, useMemo } from 'react';
import { CLASSIC, FIXTURES } from '../data/scenarios';
import { pubById } from '../data/known';
import type { Params, Pub, ResultIntent, Scenario, SearchResponse, SortMode } from '../data/types';
import type { LayoutMode } from '../hooks';
import { Action, State, intentOf, isLanding, viewOf } from '../state/machine';
import { canShake } from '../lib/views';
import { quoteBoard, splitComparison, topQuotedPub } from '../lib/groups';
import { lcFirst, plural } from '../lib/typo';
import { conceptsOf } from '../state/session';
import { ClarificationCanvas } from '../renderers/ClarificationCanvas';
import { ComparisonCanvas } from '../renderers/ComparisonCanvas';
import { EmptySearchCanvas } from '../renderers/EmptySearchCanvas';
import { CompactLedger, ExploreGrid } from '../renderers/ExploreGrid';
import { GroupedBoard } from '../renderers/GroupedBoard';
import { PublicationCanvas } from '../renderers/PublicationCanvas';
import { QuoteBoard } from '../renderers/QuoteBoard';
import { SynthesisHandoff } from '../renderers/SynthesisHandoff';
import { Fact, RenderProps, ResultHead, ShakeHint } from '../renderers/shared';
import { ResultCtx } from './ResultContext';

/* Выбор экрана по задаче и текущему представлению.
   Каждый тип выдачи имеет собственный компонент с собственной геометрией.
   Над списком — честная подпись того, чем он получен: точным, расширенным или запасным поиском. */

interface Props {
  state: State;
  dispatch: Dispatch<Action>;
  sc: Scenario;
  params: Params;
  response: SearchResponse;
  layout: LayoutMode;
  touch: boolean;
  onHintUse: () => void;
}

function factsFor(intent: ResultIntent, sc: Scenario, r: SearchResponse): Fact[] {
  if (intent === 'compare') {
    const c = splitComparison(r.items, sc);
    if (c) {
      return [
        [c.together.length, 'упоминают оба подхода'],
        [c.direct.length, 'сравнивают напрямую'],
        [c.onlyA.length, `только ${c.a.short ?? c.a.label.toLowerCase()}`],
        [c.onlyB.length, `только ${c.b.short ?? c.b.label.toLowerCase()}`],
      ];
    }
  }
  if (intent === 'find-in-text') {
    const b = quoteBoard(r.items, sc);
    const ft = b.groups.flatMap((g) => g.cards).filter((c) => c.quote.source === 'fulltext').length;
    return [
      [b.total, plural(b.total, 'цитата', 'цитаты', 'цитат')],
      [b.pubs, `${plural(b.pubs, 'публикация', 'публикации', 'публикаций')} с цитатами`],
      [ft, 'из полного текста'],
    ];
  }
  return [
    [r.total, plural(r.total, 'публикация', 'публикации', 'публикаций')],
    [r.fullText, 'с полным текстом'],
    [r.reviews, plural(r.reviews, 'обзор', 'обзора', 'обзоров')],
  ];
}

const summaryFor = (intent: ResultIntent, sc: Scenario, original: boolean): string | undefined =>
  intent === 'find-in-text'
    ? 'Каждая цитата — точный фрагмент статьи. Фрагменты из abstract и из полного текста помечены отдельно'
    : original && intent !== 'synthesis'
      ? sc.summary
      : undefined;

/** Заголовок для запросов, которых нет среди готовых сценариев, собирается из понятий самого запроса. */
function titleFor(intent: ResultIntent, sc: Scenario, params: Params, original: boolean): string {
  if (original) return sc.titles?.[intent] ?? sc.title;
  const core = conceptsOf(params).filter((c) => c.kind === 'REQUIRED').map((c) => lcFirst(c.label));
  if (intent === 'synthesis') return `Корпус для анализа: ${core.join(', ')}`;
  if (intent === 'compare') return sc.titles?.compare ?? sc.title;
  return core.length ? `Публикации: ${core.join(', ')}` : sc.title;
}

/* ─── Подпись над списком ─── */

function Notice({ response, dispatch, tail }: { response: SearchResponse; dispatch: Dispatch<Action>; tail: boolean }) {
  const tiers = { exact: 0, broad: 0, fallback: 0 };
  response.items.forEach((p) => (tiers[response.prov[p.id]?.tier ?? 'exact'] += 1));
  const rest = tiers.broad + tiers.fallback;

  if (response.state === 'broadened-results') {
    return (
      <aside className="notice notice--broad" data-notice="broadened" aria-label="Как получена выдача">
        <Info size={20} aria-hidden />
        <div className="notice-body">
          <p className="notice-t">По точной формулировке ничего не нашли. Показываем результаты по более широким терминам.</p>
          {response.widened.length > 0 && (
            <ul className="notice-l">
              {response.widened.slice(0, 3).map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          <button className="link-btn" onClick={() => dispatch({ t: 'open-sheet' })}>
            Что изменилось в запросе
          </button>
        </div>
      </aside>
    );
  }
  if (response.state === 'fallback-results') {
    return (
      <aside className="notice notice--fallback" data-notice="fallback" aria-label="Как получена выдача">
        <Info size={20} aria-hidden />
        <div className="notice-body">
          <p className="notice-t">
            По всем условиям ничего не нашли. Показываем результаты
            {response.dropped.length > 0 ? (
              <>
                {' '}без {response.dropped.length > 1 ? 'желательных условий' : 'желательного условия'} {response.dropped.map((d) => `«${d.label.replace(/^В приоритете:\s*/, '')}»`).join(', ')}
              </>
            ) : (
              ' по обязательным условиям'
            )}
            .
          </p>
          <p className="notice-s">Обязательные условия остались на месте</p>
          <button className="link-btn" onClick={() => dispatch({ t: 'open-sheet' })}>
            Что изменилось в запросе
          </button>
        </div>
      </aside>
    );
  }
  if (tail && response.state === 'exact-results' && tiers.exact > 0 && rest > 0) {
    return (
      <p className="notice-tail" data-notice="tail">
        <Info size={16} aria-hidden /> Первые {tiers.exact} подходят под все условия запроса. Ещё {rest}{' '}
        {tiers.broad > 0 && tiers.fallback > 0 ? 'найдены по более широким терминам или подходят не под все пожелания' : tiers.broad > 0 ? 'найдены по более широким терминам' : 'подходят под обязательные условия, но не под все пожелания'} и стоят ниже
      </p>
    );
  }
  return null;
}

const SORTS: { id: SortMode; label: string }[] = [
  { id: 'relevance', label: 'По релевантности' },
  { id: 'newest', label: 'Сначала новые' },
];

function SortBar({ sort, count, tiered, dispatch }: { sort: SortMode; count: number; tiered: boolean; dispatch: Dispatch<Action> }) {
  if (count < 2) return null;
  return (
    <div className="sortbar" role="group" aria-label="Порядок публикаций">
      <ArrowDownWideNarrow size={18} aria-hidden />
      {SORTS.map((s) => (
        <button key={s.id} type="button" className="sort-btn" aria-pressed={sort === s.id} onClick={() => dispatch({ t: 'sort', sort: s.id })}>
          {s.label}
        </button>
      ))}
      {sort === 'newest' && tiered && <span className="sort-note">Внутри каждой группы публикации идут от новых к старым</span>}
    </div>
  );
}

export function Results({ state, dispatch, sc, params, response, layout, touch, onHintUse }: Props) {
  const intent = intentOf(state);
  const view = viewOf(state);
  const busy = state.phase === 'parameter-edited';
  const original = useMemo(() => [...FIXTURES, ...CLASSIC].some((f) => f.query.trim() === state.query.trim()), [state.query]);
  const ctx = useMemo(() => ({ response, params, sc }), [response, params, sc]);

  /* Открытая публикация: это новая рабочая область, начинаем сверху. */
  useEffect(() => {
    if (state.pub) window.scrollTo({ top: 0 });
  }, [state.pub?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* «Назад» из статьи возвращает на то же место выдачи. */
  useLayoutEffect(() => {
    if (state.pub || !state.returning || state.returnScroll === null) return;
    const y = state.returnScroll;
    const id = requestAnimationFrame(() => window.scrollTo({ top: y }));
    return () => cancelAnimationFrame(id);
  }, [state.pub, state.returning]); // eslint-disable-line react-hooks/exhaustive-deps

  if (intent === 'empty') {
    return <EmptySearchCanvas state={state} sc={sc} params={params} response={response} dispatch={dispatch} />;
  }

  const common: RenderProps = { sc, state, dispatch, response, layout, touch, animateIn: state.viewMoves === 0 && !state.returning };

  /* Одна публикация: выдачи нет. */
  const open: Pub | undefined = state.pub ? [...response.items, ...sc.pool].find((p) => p.id === state.pub!.id) ?? pubById(state.pub.id)?.pub : undefined;
  const landing = isLanding(state.plan);
  if (landing || open || view === 'publication') {
    const pub = open ?? (landing ? response.items[0] : topQuotedPub(response.items));
    if (pub) {
      return (
        <ResultCtx.Provider value={ctx}>
          <PublicationCanvas
            key={pub.id}
            pub={pub}
            state={state}
            dispatch={dispatch}
            fromList={!!open && !landing}
            quoteId={open ? state.pub?.quote : undefined}
            find={landing && state.plan?.find ? { phrase: state.plan.find.phrase, terms: state.plan.find.terms } : undefined}
            foundBy={landing ? state.plan?.known?.value : undefined}
          />
        </ResultCtx.Provider>
      );
    }
  }

  let board: JSX.Element;
  switch (view) {
    case 'compact':
      board = <CompactLedger {...common} />;
      break;
    case 'grouped':
      board = <GroupedBoard {...common} items={undefined} showMore />;
      break;
    case 'comparison':
      board = <ComparisonCanvas {...common} />;
      break;
    case 'quotes':
      board = <QuoteBoard {...common} />;
      break;
    case 'evidence':
      board = <SynthesisHandoff {...common} />;
      break;
    default:
      board = <ExploreGrid {...common} />;
  }
  const title = titleFor(intent, sc, params, original);
  const showSort = view !== 'quotes' && response.items.length > 1;
  return (
    <ResultCtx.Provider value={ctx}>
      <LayoutGroup id="results">
        <ResultHead
          query={state.query}
          title={title}
          summary={summaryFor(intent, sc, original)}
          facts={factsFor(intent, sc, response)}
          busy={busy}
          params={params}
          intent={intent}
          dispatch={dispatch}
        >
          <ShakeHint show={!state.hintSeen && canShake(intent) && response.items.length > 0} onUse={onHintUse} onClose={() => dispatch({ t: 'hint-seen' })} />
        </ResultHead>
        {state.plan?.quotesUnavailable && (intent === 'explore' || intent === 'compare' || intent === 'synthesis') && (
          <aside className="notice notice--info" data-notice="quotes-unavailable" aria-label="Про цитаты">
            <Info size={20} aria-hidden />
            <div className="notice-body">
              <p className="notice-t">Цитат по этой теме нет</p>
              <p className="notice-s">Показываем публикации. Чтобы найти фрагмент в одной статье, укажите её PMID, DOI или название</p>
            </div>
          </aside>
        )}
        {state.plan?.compareUnavailable && intent === 'explore' && !state.plan.quotesUnavailable && (
          <aside className="notice notice--info" data-notice="compare-unavailable" aria-label="Про сравнение">
            <Info size={20} aria-hidden />
            <div className="notice-body">
              <p className="notice-t">Сравнения по этой теме нет</p>
              <p className="notice-s">Показываем публикации. Сравнение двух подходов в прототипе есть только для диеногеста и комбинированных оральных контрацептивов при эндометриозе</p>
            </div>
          </aside>
        )}
        <Notice response={response} dispatch={dispatch} tail={intent === 'explore' && view !== 'grouped' && state.sort === 'relevance'} />
        {showSort && <SortBar sort={state.sort} count={response.items.length} tiered={new Set(response.items.map((p) => response.prov[p.id]?.tier ?? 'exact')).size > 1} dispatch={dispatch} />}
        <div className={busy ? 'board-wrap is-busy' : 'board-wrap'}>{board}</div>
      </LayoutGroup>
    </ResultCtx.Provider>
  );
}

export { ClarificationCanvas };
