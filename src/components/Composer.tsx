import { motion } from 'framer-motion';
import { ArrowUp, ListChecks, MessageSquareText, Share2 } from 'lucide-react';
import { Dispatch, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { FIXTURES, LOGIC } from '../data/scenarios';
import type { Scenario, SpanKind } from '../data/types';
import type { Action, State } from '../state/machine';
import { segmentQuery } from '../lib/segment';

export interface SpanRect { kind: SpanKind; x: number; y: number }

interface Props {
  state: State;
  dispatch: Dispatch<Action>;
  sc: Scenario | null;
  onSpans: (r: SpanRect[]) => void;
}

const KIND_NAME: Record<SpanKind, string> = {
  condition: 'состояние',
  exposure: 'фактор',
  outcome: 'исход',
  constraint: 'ограничение',
  must: 'обязательное условие',
};

/* Первый запуск: три коротких пункта, у каждого — настоящий пример, который проходит весь путь поиска. */
const TOUR = [
  {
    id: 'words',
    icon: MessageSquareText,
    title: 'Ищите PubMed своими словами',
    text: 'Опишите вопрос так, как задали бы коллеге: состояние, вмешательство, ограничения. Синтаксис запроса не нужен',
    example: FIXTURES.find((f) => f.id === 'A')!,
  },
  {
    id: 'understood',
    icon: ListChecks,
    title: 'Вы увидите, как мы поняли запрос',
    text: 'Понятия, обязательные и желательные условия — в «Как искали». Их можно поправить, не начиная заново',
    example: LOGIC.find((f) => f.id === 'L2')!,
  },
  {
    id: 'deep',
    icon: Share2,
    title: 'Сложный вывод — отдельный режим',
    text: 'Здесь ищем и показываем публикации. Сопоставить и свести их в вывод поможет Deep Research — запрос и корпус передадим туда',
    example: FIXTURES.find((f) => f.id === 'H')!,
  },
] as const;

export function HomeView({ state, dispatch, sc, onSpans }: Props) {
  const parsing = state.phase === 'semantic-parsing';
  const ta = useRef<HTMLTextAreaElement>(null);
  const spanEls = useRef<(HTMLElement | null)[]>([]);

  /* Поле растёт вместе с текстом, но не больше половины экрана. */
  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, Math.round(window.innerHeight * 0.42))}px`;
  }, [state.query, parsing]);

  const segs = useMemo(() => (sc && parsing ? segmentQuery(state.query, sc.spans) : []), [sc, parsing, state.query]);

  /* Положение смысловых частей нужно сцене: от них летят «семена» к форме. */
  useLayoutEffect(() => {
    if (!parsing) return;
    const out: SpanRect[] = [];
    segs.forEach((s, i) => {
      const el = spanEls.current[i];
      if (!s.kind || !el) return;
      const r = el.getClientRects()[0] ?? el.getBoundingClientRect();
      out.push({ kind: s.kind, x: r.left + r.width / 2, y: r.top + r.height / 2 });
    });
    if (!out.length && sc) {
      const box = ta.current?.parentElement?.getBoundingClientRect();
      const cx = box ? box.left + box.width / 2 : window.innerWidth / 2;
      const cy = box ? box.top + box.height / 2 : window.innerHeight * 0.7;
      sc.spans.forEach((s) => out.push({ kind: s.kind, x: cx, y: cy }));
    }
    onSpans(out);
  }, [parsing]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = () => dispatch({ t: 'submit' });
  const ready = state.query.trim().length > 0;

  return (
    <motion.section
      className={`home${parsing ? ' is-parsing' : ''}`}
      initial={parsing ? { opacity: 0 } : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10, transition: { duration: 0.22 } }}
      transition={{ type: 'spring', stiffness: 200, damping: 26 }}
    >
      <div className="home-head">
        <h1 className="home-title">Спросить PubMed</h1>
        <p className="home-sub">Опишите вопрос своими словами — соберём поиск и покажем, что нашли</p>
      </div>

      <div className="composer" data-parsing={parsing}>
        {parsing ? (
          <p className="composer-parse" aria-label="Запрос разобран на части">
            {segs.map((s, i) =>
              s.kind ? (
                <motion.span
                  key={i}
                  ref={(el) => {
                    spanEls.current[i] = el;
                  }}
                  className={`part part--${s.kind}`}
                  title={KIND_NAME[s.kind]}
                  initial={{ opacity: 0.55 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.08 + i * 0.07 }}
                >
                  {s.text}
                </motion.span>
              ) : (
                <span key={i} className="part-rest">{s.text}</span>
              ),
            )}
            {!segs.length && <span>{state.query}</span>}
          </p>
        ) : (
          <>
            <label htmlFor="q" className="sr-only">Вопрос</label>
            <textarea
              id="q"
              ref={ta}
              className="composer-input"
              rows={2}
              placeholder="Что нужно найти? Опишите своими словами"
              value={state.query}
              onChange={(e) => dispatch({ t: 'type', query: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  if (ready) submit();
                }
              }}
            />
            <div className="composer-bar">
              <button className="btn btn-primary" onClick={submit} disabled={!ready}>
                Найти <ArrowUp size={18} aria-hidden />
              </button>
            </div>
          </>
        )}
      </div>

      {state.onboarding && !parsing && (
        <section className="onboard" aria-labelledby="onboard-h" data-testid="onboarding">
          <h2 id="onboard-h" className="sr-only">Как это работает</h2>
          <ol className="onboard-list">
            {TOUR.map((t) => (
              <li key={t.id} className="onboard-item">
                <span className="onboard-ico" aria-hidden>
                  <t.icon size={20} />
                </span>
                <div className="onboard-body">
                  <h3 className="onboard-t">{t.title}</h3>
                  <p className="onboard-s">{t.text}</p>
                  <button
                    className="onboard-ex"
                    type="button"
                    aria-pressed={state.query === t.example.query}
                    onClick={() => dispatch({ t: 'type', query: t.example.query })}
                  >
                    {t.example.query}
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <div className="onboard-acts">
            {ready ? (
              <button className="btn btn-primary" type="button" onClick={() => dispatch({ t: 'onboarding-done' })}>
                Понятно
              </button>
            ) : (
              <button className="btn btn-primary" type="button" onClick={() => dispatch({ t: 'load', query: TOUR[0].example.query })}>
                Попробовать
              </button>
            )}
            {!ready && (
              <button className="link-btn" type="button" onClick={() => dispatch({ t: 'onboarding-done' })}>
                Понятно
              </button>
            )}
          </div>
        </section>
      )}

      {!state.onboarding && <div className="examples" aria-label="Примеры запросов">
        <span className="examples-label">Примеры</span>
        <div className="examples-row">
          {FIXTURES.map((f) => (
            <button
              key={f.id}
              className="chip"
              aria-pressed={state.query === f.query}
              onClick={() => dispatch({ t: 'type', query: f.query })}
              disabled={parsing}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>}
    </motion.section>
  );
}
