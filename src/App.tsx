import { motion, useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { demoBackend } from './data/backend';
import { CLASSIC, FIXTURES, LOGIC, SCENARIO_MAP } from './data/scenarios';
import { Action, State, displayPhase, initialState, intentOf, isLanding, loadOnboardingSeen, loadPrefs, paramsOf, reducer, saveOnboardingSeen, savePrefs, viewOf } from './state/machine';
import { layoutOf, useCoarse, useShakeGesture, useViewport } from './hooks';
import { ShapeMode, geomKindFor, modeFor } from './lib/geom';
import { NO_COMPOSITION } from './lib/compose';
import { sceneFor } from './lib/scene';
import { canShake } from './lib/views';
import { plural } from './lib/typo';
import { EvidenceShape, SeedSrc } from './components/EvidenceShape';
import { StateTag, TopBar, Toast, ExampleItem } from './components/Chrome';
import { HomeView, SpanRect } from './components/Composer';
import { Results } from './components/Results';
import { Sheet } from './components/Sheet';
import { RouteView, SearchingView, UnrecognisedView } from './components/Views';
import { ClarificationCanvas } from './renderers/ClarificationCanvas';

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const EXAMPLES: ExampleItem[] = [
  ...FIXTURES.map((f) => ({ id: f.id, label: `${f.id} · ${f.label}`, query: f.query, group: 'fixtures' as const })),
  ...LOGIC.map((f) => ({ id: f.id, label: f.label, query: f.query, group: 'logic' as const })),
  ...CLASSIC.map((f) => ({ id: f.id, label: f.label, query: f.query, group: 'classic' as const })),
];

const SHEET_W = 436;

export default function App() {
  const [state, rawDispatch] = useReducer(reducer, initialState, (s): State => ({ ...s, prefs: loadPrefs(), onboarding: !loadOnboardingSeen() }));
  /* Открытие статьи запоминает, где врач был в выдаче: «Назад» возвращает ровно туда. */
  const dispatch = useCallback(
    (a: Action) => rawDispatch(a.t === 'open-pub' && a.scroll === undefined ? { ...a, scroll: window.scrollY } : a),
    [],
  );
  const reduced = !!useReducedMotion();
  const { w, h } = useViewport();
  const layout = layoutOf(w);
  const touch = useCoarse();

  const sc = state.scenarioId ? SCENARIO_MAP[state.scenarioId] : null;
  const params = sc ? paramsOf(state, sc.id) : null;
  const ph = displayPhase(state);
  const intent = intentOf(state);
  const rview = viewOf(state);

  const page =
    ph === 'idle' || ph === 'query-entered' || ph === 'semantic-parsing'
      ? 'home'
      : ph === 'ambiguous-term'
        ? 'ask'
        : ph === 'wrong-source'
          ? 'route'
          : ph === 'not-understood'
            ? 'unrecognised'
            : ph === 'searching'
              ? 'searching'
              : 'result';

  /* ─── Фазы автомата ─── */

  useEffect(() => {
    if (state.phase !== 'semantic-parsing') return;
    const t = setTimeout(() => dispatch({ t: 'parsed' }), reduced ? 250 : 1150);
    return () => clearTimeout(t);
  }, [state.phase, reduced]);

  /* Запрос к бэкенду. reqId защищает экран: ответ на устаревший запрос (врач нажал «Назад» или изменил условие) ничего не меняет. */
  useEffect(() => {
    if (state.phase !== 'searching' || !sc) return;
    let live = true;
    const reqId = state.reqId;
    const plan = { scenario: sc, params: paramsOf(state, sc.id), ambiguityId: state.ambiguityId, query: state.plan ?? undefined, sort: state.sort };
    Promise.all([demoBackend.search(plan), wait(reduced ? 200 : 1650)]).then(([response]) => {
      if (live) dispatch({ t: 'searched', response, reqId });
    });
    return () => {
      live = false;
    };
  }, [state.phase, state.reqId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (state.phase !== 'parameter-edited' || !sc) return;
    let live = true;
    const reqId = state.reqId;
    const plan = { scenario: sc, params: paramsOf(state, sc.id), ambiguityId: state.ambiguityId, query: state.plan ?? undefined, sort: state.sort };
    Promise.all([demoBackend.search(plan), wait(reduced ? 120 : 650)]).then(([response]) => {
      if (live) dispatch({ t: 'updated', response, reqId });
    });
    return () => {
      live = false;
    };
  }, [state.phase, state.reqId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!state.toast) return;
    const t = setTimeout(() => dispatch({ t: 'toast-clear' }), 3200);
    return () => clearTimeout(t);
  }, [state.toast?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Предпочтение вида: сохраняем и засчитываем остановку на представлении. */
  useEffect(() => {
    savePrefs(state.prefs);
  }, [state.prefs]);
  /* Обучение: после первого осмысленного действия больше не показывается. Меню может вернуть его. */
  useEffect(() => {
    if (!state.onboarding) saveOnboardingSeen(true);
  }, [state.onboarding]);
  useEffect(() => {
    if (page !== 'result' || state.viewMoves === 0) return;
    const t = setTimeout(() => dispatch({ t: 'settle' }), 3000);
    return () => clearTimeout(t);
  }, [page, state.viewMoves, rview]);

  /* Исследование запущено: сцена на мгновение оживает. */
  const [drPulse, setDrPulse] = useState(false);
  useEffect(() => {
    if (!state.drStarted) return;
    setDrPulse(true);
    const t = setTimeout(() => setDrPulse(false), 1650);
    return () => clearTimeout(t);
  }, [state.drStarted]);

  /* ─── Семена из слов запроса ─── */

  const [seeds, setSeeds] = useState<SeedSrc[]>([]);
  const [seedRun, setSeedRun] = useState(0);
  const onSpans = useCallback((rects: SpanRect[]) => {
    setSeeds(rects);
    setSeedRun((n) => n + 1);
  }, []);

  /* ─── Встряска: переложить найденное ─── */

  const response = state.response;
  const shakeable = page === 'result' && !!response?.items.length && canShake(intent);
  const shake = useCallback(() => dispatch({ t: 'cycle-view' }), []);
  const shakeRef = useRef(shake);
  shakeRef.current = shake;

  useShakeGesture(shake, shakeable && !touch);

  useEffect(() => {
    if (!shakeable) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.code !== 'KeyV' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      shakeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shakeable]);

  /* На телефоне с датчиками настоящая встряска работает так же. */
  useEffect(() => {
    if (!shakeable) return;
    let last = 0;
    let hits: number[] = [];
    let cool = 0;
    const on = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (!a) return;
      const m = Math.abs(a.x ?? 0) + Math.abs(a.y ?? 0) + Math.abs(a.z ?? 0);
      const now = performance.now();
      if (Math.abs(m - last) > 22) {
        hits = [...hits.filter((t) => now - t < 700), now];
        if (hits.length >= 3 && now - cool > 1200) {
          hits = [];
          cool = now;
          shakeRef.current();
        }
      }
      last = m;
    };
    try {
      window.addEventListener('devicemotion', on);
    } catch {
      /* датчики недоступны */
    }
    return () => window.removeEventListener('devicemotion', on);
  }, [shakeable]);

  const onHintUse = useCallback(async () => {
    try {
      const DM = (window as unknown as { DeviceMotionEvent?: { requestPermission?: () => Promise<string> } }).DeviceMotionEvent;
      if (DM && typeof DM.requestPermission === 'function') await DM.requestPermission();
    } catch {
      /* без разрешения работает кнопка и клавиша */
    }
    shakeRef.current();
  }, []);

  /* ─── Сцена ─── */

  const [hot, setHot] = useState(-1);
  useEffect(() => {
    if (page !== 'ask') setHot(-1);
  }, [page]);

  const composition = useMemo(() => {
    if (page === 'ask') return sceneFor('clarify', 'clarification', state, sc, null, false);
    if (page === 'unrecognised') return sceneFor('empty', 'recovery', state, null, null, false);
    if (page !== 'result') return NO_COMPOSITION;
    return sceneFor(intent, rview, state, sc, response, !!state.pub);
  }, [page, intent, rview, state.pub, response, state.drStarted, state.plan, state.grouping, sc]); // eslint-disable-line react-hooks/exhaustive-deps

  const mode: ShapeMode = drPulse ? 'search' : modeFor(ph);
  const geomKind = geomKindFor(ph);
  const sheetShift = layout === 'desktop' && state.sheetOpen && page === 'result';
  const shiftX = sheetShift ? -SHEET_W / 2 : 0;

  const flags = useMemo(() => {
    const f: string[] = [];
    const langs = Object.values(state.lang);
    if (langs.includes('ru')) f.push('translation-ru');
    else if (langs.length) f.push('translation-en');
    if (page === 'result' && response?.items.some((p) => p.fullTextState !== 'pmc-full-text') && intent === 'find-in-text') f.push('full-text-unavailable');
    return f;
  }, [state.lang, page, response, intent]);
  const stateLine = [ph, ...(page === 'result' || page === 'ask' ? [`${intent}/${rview}`] : []), ...flags].join(' · ');

  /* Объявление для скринридера: сколько нашли и в каком виде показано (раскладка меняется без перезагрузки). */
  const VIEW_NAME: Record<string, string> = {
    grid: 'карточками',
    grouped: 'по группам',
    compact: 'плотным списком',
    comparison: 'сравнением двух подходов',
    quotes: 'цитатами по исходам',
    publication: 'страницей публикации',
    evidence: 'отдельными аспектами',
    recovery: 'условиями запроса',
    clarification: 'вариантами уточнения',
  };
  const announce =
    page === 'result' && response
      ? intent === 'empty'
        ? response.state === 'known-publication-not-found'
          ? 'Публикацию с таким номером не нашли'
          : 'С такими условиями публикаций не нашли'
        : isLanding(state.plan)
          ? 'Открыта публикация'
          : `Найдено ${response.total} ${plural(response.total, 'публикация', 'публикации', 'публикаций')}. Показано ${VIEW_NAME[rview] ?? 'списком'}`
      : page === 'ask'
        ? 'Уточните, что вы имеете в виду'
        : '';

  const pick = (e: ExampleItem) => dispatch({ t: 'load', query: e.query });
  const goBack = () => dispatch({ t: 'back' });

  const colKind =
    page === 'ask' || page === 'unrecognised' || (page === 'result' && intent === 'empty')
      ? 'col--focus'
      : page === 'result'
        ? rview === 'publication' || state.pub
          ? 'col--read'
          : 'col--wide'
        : '';

  return (
    <div
      className={`app app--${layout} page-${page} intent-${page === 'result' ? intent : page === 'ask' ? 'clarify' : 'none'}`}
      data-job={state.plan?.job ?? ''}
      data-result-state={page === 'result' ? (response?.state ?? '') : page === 'ask' ? 'ambiguous-query' : ''}
      data-renderer={page === 'result' || page === 'ask' ? rview : ''}
      data-sort={state.sort}
      data-onboarding={state.onboarding && page === 'home' ? 'on' : 'off'}
    >
      <EvidenceShape
        w={w}
        h={h}
        layout={layout}
        mode={mode}
        geomKind={geomKind}
        route={ph === 'wrong-source'}
        scenario={ph === 'idle' || ph === 'query-entered' ? null : sc}
        params={params}
        changed={state.changed}
        jolt={state.jolt}
        seeds={seeds}
        seedRun={seedRun}
        shiftX={shiftX}
        routeLabels={sc?.route ? { a: sc.route.primaryLane, b: sc.route.secondaryLane } : null}
        composition={composition}
        pulse={state.jolt}
        hot={hot}
      />

      <TopBar
        canBack={page !== 'home'}
        onBack={goBack}
        examples={EXAMPLES}
        currentQuery={state.query}
        onPick={pick}
        canShake={shakeable}
        onShake={shake}
        onHint={() => dispatch({ t: 'reset-hint' })}
        onOnboarding={() => dispatch({ t: 'onboarding-show' })}
        canResetView={!!state.prefs.preferred}
        onResetView={() => dispatch({ t: 'pref-reset' })}
        stateLine={stateLine}
      />

      <motion.main
        className="main"
        initial={false}
        animate={{ paddingRight: sheetShift ? SHEET_W : 0 }}
        transition={reduced ? { duration: 0.01 } : { type: 'spring', stiffness: 170, damping: 28 }}
      >
        <div className={`col ${colKind}`}>
          {/* Без AnimatePresence: экран не должен ждать анимацию выхода. Карточки с общими layoutId
              иногда её не завершают, и «Назад» после встряски оставлял пустую страницу. */}
          <>
            {page === 'home' && <HomeView key="home" state={state} dispatch={dispatch} sc={sc} onSpans={onSpans} />}
            {page === 'ask' && <ClarificationCanvas key="ask" state={state} dispatch={dispatch} onHot={setHot} />}
            {page === 'route' && sc && <RouteView key="route" state={state} sc={sc} dispatch={dispatch} />}
            {page === 'unrecognised' && <UnrecognisedView key="unrecognised" state={state} dispatch={dispatch} />}
            {page === 'searching' && <SearchingView key="searching" query={state.query} onEdit={goBack} />}
            {page === 'result' && sc && params && response && (
              <motion.div
                key="result"
                className="result"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.2 } }}
              >
                <Results state={state} dispatch={dispatch} sc={sc} params={params} response={response} layout={layout} touch={touch} onHintUse={onHintUse} />
              </motion.div>
            )}
          </>
        </div>
      </motion.main>

      {sc && params && page === 'result' && (
        <Sheet open={state.sheetOpen} layout={layout} state={state} sc={sc} params={params} response={response} dispatch={dispatch} />
      )}

      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announce}
      </div>
      <Toast toast={state.toast} />
      {layout !== 'mobile' && <StateTag line={stateLine} />}
    </div>
  );
}

export type { State, Action };
