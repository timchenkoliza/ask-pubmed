import { motion, useReducedMotion } from 'framer-motion';
import { Check, Loader2, MessageSquare, Search } from 'lucide-react';
import { Dispatch, KeyboardEvent, useEffect, useRef, useState } from 'react';
import { ModeBar } from '../components/ModeBar';
import { TYPE_ONE } from '../components/Card';
import type { Scenario, SearchResponse } from '../data/types';
import { DR_MODES, modeOf, resultOf, stepsOf } from '../lib/dr';
import { plural } from '../lib/typo';
import type { Action, State } from '../state/machine';
import { payloadOf } from '../state/session';
import type { Params } from '../data/types';

/* Deep Research: следующий экран после «Сделать краткий обзор». Три состояния одного экрана: план, ход, результат.
   План собран из того, что передано из поиска; врач видит, что именно будет делаться, прежде чем это начнётся. */

const KIND = { REQUIRED: 'Обязательно', PREFERRED: 'Желательно', SEARCH_EXPANSION: 'Расширение' } as const;

export function DeepResearchCanvas({ state, sc, params, response, dispatch }: { state: State; sc: Scenario; params: Params; response: SearchResponse; dispatch: Dispatch<Action> }) {
  const dr = state.dr!;
  const reduced = !!useReducedMotion();
  const mode = modeOf(dr.mode);
  const items = response.items;
  const corpus = state.selected.length ? items.filter((p) => state.selected.includes(p.id)) : items;
  const steps = stepsOf(dr.mode, corpus, dr.web);
  const pl = payloadOf(state, sc, params, response);
  const [step, setStep] = useState(0);

  /* Ход исследования: шаги отмечаются по очереди и сами приводят к результату. */
  useEffect(() => {
    if (dr.stage !== 'running') return;
    let i = 0;
    setStep(0);
    let t: ReturnType<typeof setTimeout>;
    const gap = reduced ? 250 : 1100;
    const tick = () => {
      i += 1;
      setStep(i);
      t = setTimeout(i >= steps.length ? () => dispatch({ t: 'dr-done' }) : tick, i >= steps.length ? (reduced ? 200 : 700) : gap);
    };
    t = setTimeout(tick, gap);
    return () => clearTimeout(t);
  }, [dr.stage]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Этап сменился по кнопке: фокус на заголовок раздела нового этапа. */
  const firstStage = useRef(true);
  useEffect(() => {
    if (firstStage.current) {
      firstStage.current = false;
      return;
    }
    const t = requestAnimationFrame(() => {
      const h = document.querySelector<HTMLElement>('.dr .dr-sec .dr-h2');
      if (h) {
        h.tabIndex = -1;
        h.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(t);
  }, [dr.stage]);

  /* Переключатель из трёх вариантов: стрелки двигают выбор, как в обычной группе радиокнопок. */
  const onModeKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const fwd = e.key === 'ArrowRight' || e.key === 'ArrowDown';
    if (!fwd && e.key !== 'ArrowLeft' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const i = DR_MODES.findIndex((m) => m.id === dr.mode);
    const next = DR_MODES[(i + (fwd ? 1 : DR_MODES.length - 1)) % DR_MODES.length];
    dispatch({ t: 'dr-set', patch: { mode: next.id } });
    requestAnimationFrame(() => document.getElementById(`dr-mode-${next.id}`)?.focus());
  };

  const res = dr.stage === 'done' ? resultOf(sc, corpus) : null;

  return (
    <motion.section className="surf" aria-labelledby="dr-h" data-stage={dr.stage} data-payload={JSON.stringify(pl)} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 26 }}>
      <ModeBar state={state} dispatch={dispatch} />
      <div className="dr">
        <header className="dr-head">
          <p className="dr-eyebrow">Deep Research · {dr.stage === 'plan' ? 'план исследования' : dr.stage === 'running' ? 'ход исследования' : 'результат'}</p>
          <h1 id="dr-h" className="dr-title">
            {sc.title}
          </h1>
          <p className="dr-from">
            Передано из Спросить PubMed: запрос, {pl.concepts.length} {plural(pl.concepts.length, 'понятие', 'понятия', 'понятий')}, {pl.constraints.length} {plural(pl.constraints.length, 'условие', 'условия', 'условий')} и {corpus.length} {plural(corpus.length, 'публикация', 'публикации', 'публикаций')}
          </p>
        </header>

        {dr.stage === 'plan' && (
          <>
            <section className="dr-sec" aria-labelledby="dr-in">
              <h2 id="dr-in" className="dr-h2">Что передали</h2>
              <p className="dr-q">{state.query}</p>
              <ul className="dr-chips">
                {[...pl.concepts, ...pl.constraints].map((c) => (
                  <li key={c.id}>
                    <span className={`kind kind--${c.kind === 'REQUIRED' ? 'req' : 'pref'}`}>{KIND[c.kind]}</span> {c.label}
                  </li>
                ))}
              </ul>
            </section>

            <section className="dr-sec" aria-labelledby="dr-mode">
              <h2 id="dr-mode" className="dr-h2">Что получить</h2>
              <div className="dr-modes" role="radiogroup" aria-labelledby="dr-mode" onKeyDown={onModeKey}>
                {DR_MODES.map((m) => (
                  <button key={m.id} id={`dr-mode-${m.id}`} type="button" role="radio" aria-checked={dr.mode === m.id} tabIndex={dr.mode === m.id ? 0 : -1} className="dr-mode" onClick={() => dispatch({ t: 'dr-set', patch: { mode: m.id } })}>
                    <span className="dr-mode-n">{m.name}</span>
                    <span className="dr-mode-t">{m.text}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="dr-sec" aria-labelledby="dr-src">
              <h2 id="dr-src" className="dr-h2">Где искать</h2>
              <ul className="dr-srcs">
                <li><Check size={16} aria-hidden /> PubMed и PMC: {corpus.length} {plural(corpus.length, 'публикация', 'публикации', 'публикаций')} из вашего поиска, остальное допоищем сами</li>
                <li><Check size={16} aria-hidden /> Источники Яндекс Мед: клинические рекомендации и справочники</li>
              </ul>
              <button className="switch-row" role="switch" aria-checked={dr.web} onClick={() => dispatch({ t: 'dr-set', patch: { web: !dr.web } })}>
                <span className="switch-text">
                  <span className="switch-label">Искать ещё и в интернете</span>
                  <span className="switch-hint">Ответ станет шире, но менее строгим по источникам</span>
                </span>
                <span className="switch" aria-hidden><span className="switch-knob" /></span>
              </button>
            </section>

            <section className="dr-sec" aria-labelledby="dr-plan">
              <h2 id="dr-plan" className="dr-h2">План</h2>
              <ol className="dr-steps">
                {steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </section>

            <div className="dr-acts dr-acts--sticky">
              <button className="btn btn-primary" onClick={() => dispatch({ t: 'dr-run' })}>
                Начать исследование
              </button>
              <button className="btn btn-ghost-light" onClick={() => dispatch({ t: 'to-surface', to: 'agent' })}>
                Вернуться к найденному
              </button>
            </div>
            <p className="dr-note">Найденное сохранится: вернуться к нему можно в любой момент</p>
          </>
        )}

        {dr.stage === 'running' && (
          <section className="dr-sec" aria-labelledby="dr-run">
            <h2 id="dr-run" className="dr-h2">{mode.name}</h2>
            <p className="sr-only" role="status">
              {step < steps.length ? `Сейчас: ${steps[step]}` : 'Собираем результат'}
            </p>
            <ol className="dr-steps dr-steps--run">
              {steps.map((s, i) => (
                <li key={s} className={i < step ? 'is-done' : i === step ? 'is-now' : ''}>
                  <span className="dr-mark" aria-hidden>{i < step ? <Check size={16} /> : i === step ? <Loader2 size={16} className="spin" /> : null}</span>
                  <span>
                    {s}
                    <span className="sr-only">{i < step ? ', готово' : i === step ? ', идёт сейчас' : ', в очереди'}</span>
                  </span>
                </li>
              ))}
            </ol>
            <div className="dr-bar" aria-hidden><span style={{ width: `${Math.min(100, (step / steps.length) * 100)}%` }} /></div>
            <div className="dr-acts">
              <button className="btn btn-ghost-light" onClick={() => dispatch({ t: 'to-surface', to: 'agent' })}>
                Вернуться к найденному
              </button>
            </div>
          </section>
        )}

        {res && (
          <>
            <section className="dr-sec" aria-labelledby="dr-res">
              <h2 id="dr-res" className="dr-h2">{mode.name}</h2>
              <p className="dr-tag">Демо: текст собран из найденных публикаций, Deep Research не подключён</p>
              <p className="dr-sum">{res.summary}</p>
              {res.points.length > 0 && (
                <ul className="dr-points">
                  {res.points.map((p, i) => (
                    <li key={p.pub.id}>
                      {p.text} <button className="cite" type="button" aria-label={`Источник ${i + 1}: ${p.pub.title}. Открыть публикацию`} onClick={() => dispatch({ t: 'open-pub', id: p.pub.id })}>{i + 1}</button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="dr-sec" aria-labelledby="dr-lit">
              <h2 id="dr-lit" className="dr-h2">Источники</h2>
              <ol className="msg-src-list">
                {res.points.map((p, i) => (
                  <li key={p.pub.id}>
                    <button type="button" className="src-row" onClick={() => dispatch({ t: 'open-pub', id: p.pub.id })}>
                      <span className="src-n">{i + 1}</span>
                      <span className="src-t">
                        <span className="src-title">{p.pub.title}</span>
                        <span className="src-meta">{TYPE_ONE[p.pub.type]} · {p.pub.year} · {p.pub.journal}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </section>
            <div className="dr-acts">
              <button className="btn btn-primary" onClick={() => dispatch({ t: 'to-surface', to: 'pbz' })}>
                <MessageSquare size={18} aria-hidden /> Обсудить результат в ПБЗ
              </button>
              <button className="btn btn-ghost-light" onClick={() => dispatch({ t: 'to-surface', to: 'agent' })}>
                <Search size={18} aria-hidden /> Вернуться к найденному
              </button>
            </div>
            <p className="dr-note">Результат остаётся в этом чате рядом с поиском</p>
          </>
        )}
      </div>
    </motion.section>
  );
}
