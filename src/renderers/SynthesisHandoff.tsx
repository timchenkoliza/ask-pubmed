import { motion } from 'framer-motion';
import { ArrowRight, Check } from 'lucide-react';
import { Dispatch } from 'react';
import { PubCard } from '../components/Card';
import { useResultCtx } from '../components/ResultContext';
import type { Scenario, SearchResponse } from '../data/types';
import type { Group } from '../lib/groups';
import { aspectGroups } from '../lib/groups';
import { nb, plural } from '../lib/typo';
import type { Action, State } from '../state/machine';
import { keyOfPub, payloadOf } from '../state/session';
import { MoreLink, RenderProps } from './shared';

/* Вывод и обзор — работа Deep Research, а не поиска. Ask PubMed ищет, ориентирует и показывает (Search → Navigate → Inspect);
   читает, сопоставляет, проверяет и сводит Deep Research (Read → Compare → Verify → Synthesize).
   Поэтому здесь нет автоматического ответа: есть корпус, его можно отметить и передать вместе со всем запросом. */

const CTA = { review: 'Сделать краткий обзор', conclusion: 'Сделать краткий обзор', compare: 'Сопоставить результаты в Deep Research' } as const;
const KIND = { REQUIRED: 'Обязательно', PREFERRED: 'Желательно', SEARCH_EXPANSION: 'Расширение' } as const;

export function SynthesisHandoff({ sc, response, state, dispatch, touch, animateIn }: RenderProps) {
  const groups: Group[] = aspectGroups(response.items, sc);
  const started = state.drStarted;
  let n = 0;
  return (
    <section className={`board board--synth${started ? ' is-merged' : ''}`} aria-label="Корпус для анализа">
      <ol className="dr-flow" aria-label="Что делает Ask PubMed и что делает Deep Research">
        <li className="dr-flow-here">
          <span className="dr-flow-who">Здесь</span>
          <span>Искать</span>
          <span>Ориентироваться</span>
          <span>Просматривать</span>
        </li>
        <li className="dr-flow-next">
          <span className="dr-flow-who">Deep Research</span>
          <span>Читать</span>
          <span>Сопоставлять</span>
          <span>Проверять</span>
          <span>Сводить</span>
        </li>
      </ol>

      <div className={`islands islands-${groups.length}`}>
        {groups.map((g, gi) => (
          <motion.section
            key={g.id}
            className={`island island--${gi}`}
            aria-labelledby={`isl-${g.id}`}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.05 + gi * 0.08, ease: [0.2, 0.7, 0.2, 1] }}
          >
            <header className="island-head">
              <h2 id={`isl-${g.id}`} className="island-title">{g.label}</h2>
              <span className="zone-count">{g.items.length}</span>
            </header>
            <motion.div layoutScroll className="island-cards">
              {g.items.map((p) => (
                <PubCard
                  key={p.id}
                  pub={p}
                  lang={state.lang[p.id]}
                  variant="mini"
                  dispatch={dispatch}
                  index={n++}
                  animateIn={animateIn}
                  moves={state.viewMoves}
                  touch={touch}
                  select={{ checked: state.selected.includes(p.id), onChange: () => dispatch({ t: 'toggle-select', id: p.id }) }}
                />
              ))}
            </motion.div>
          </motion.section>
        ))}
        <svg className="islands-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {groups.slice(0, 4).map((_, i) => {
            const c = [[25, 25], [75, 25], [25, 75], [75, 75]][i];
            return <line key={i} x1={c[0]} y1={c[1]} x2={50} y2={50} />;
          })}
        </svg>
      </div>
      <MoreLink response={response} />

      {started && <Transfer sc={sc} state={state} response={response} />}
      <Handoff sc={sc} state={state} dispatch={dispatch} response={response} />
    </section>
  );
}

/** Что именно передано: видно, что врачу ничего не нужно набирать заново. */
function Transfer({ sc, state, response }: { sc: Scenario; state: State; response: SearchResponse }) {
  const ctx = useResultCtx();
  if (!ctx) return null;
  const pl = payloadOf(state, sc, ctx.params, response);
  const rows: { h: string; chips: string[]; kinds?: string[] }[] = [
    { h: 'Понятия', chips: pl.concepts.map((c) => c.label), kinds: pl.concepts.map((c) => c.kind) },
    { h: 'Условия', chips: pl.constraints.map((c) => c.label), kinds: pl.constraints.map((c) => c.kind) },
  ];
  const shown = (pl.selectedPmids.length ? pl.selectedPmids : pl.currentCorpusPmids).slice(0, 6);
  const rest = (pl.selectedPmids.length || pl.currentCorpusPmids.length) - shown.length;
  return (
    <motion.section
      className="transfer"
      aria-label="Что передано в Deep Research"
      data-payload={JSON.stringify(pl)}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 170, damping: 24 }}
    >
      <div className="transfer-cols">
        <div className="transfer-col transfer-col--q">
          <h3 className="transfer-h">Запрос</h3>
          <p className="transfer-q">{pl.originalQuery}</p>
        </div>
        {rows.map((r, ri) => (
          <div key={r.h} className="transfer-col">
            <h3 className="transfer-h">{r.h}</h3>
            <ul className="transfer-chips">
              {r.chips.map((c, i) => (
                <motion.li
                  key={c}
                  initial={{ opacity: 0, x: -28 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.08 + ri * 0.12 + i * 0.05, type: 'spring', stiffness: 210, damping: 24 }}
                >
                  <span className={`kind kind--${r.kinds?.[i] === 'REQUIRED' ? 'req' : 'pref'}`}>{KIND[(r.kinds?.[i] ?? 'REQUIRED') as keyof typeof KIND]}</span> {c}
                </motion.li>
              ))}
            </ul>
          </div>
        ))}
        <div className="transfer-col">
          <h3 className="transfer-h">Публикации</h3>
          <p className="transfer-n">
            <b>{pl.currentCorpusPmids.length}</b> {plural(pl.currentCorpusPmids.length, 'публикация', 'публикации', 'публикаций')} в корпусе
            {pl.selectedPmids.length > 0 && <>, из них отмечено <b>{pl.selectedPmids.length}</b></>}
          </p>
          <p className="transfer-ids" aria-label="Номера публикаций">
            {shown.join(', ')}
            {rest > 0 ? ` и ещё ${rest}` : ''}
          </p>
        </div>
      </div>
      <div className="transfer-dest" aria-hidden>
        <ArrowRight size={20} />
        <span>Deep Research</span>
      </div>
    </motion.section>
  );
}

/** Передача работы дальше: что не сведено и что можно сделать. Кнопка зависит от того, о чём просил врач. */
export function Handoff({ sc, state, dispatch, response }: { sc: Scenario; state: State; dispatch: Dispatch<Action>; response: SearchResponse }) {
  const ctx = useResultCtx();
  const dr = sc.deepResearch;
  const started = state.drStarted;
  const mode = state.plan?.drMode ?? 'review';
  const corpus = response.items;
  const pl = ctx ? payloadOf(state, sc, ctx.params, response) : null;
  const allOn = corpus.length > 0 && state.selected.length === corpus.length;
  return (
    <motion.aside
      className={`handoff${started ? ' is-started' : ''}`}
      aria-label="Дальнейшая работа с исследованиями"
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35, type: 'spring', stiffness: 180, damping: 24 }}
    >
      <div className="handoff-main">
        <p className="handoff-text">
          {started ? (
            <>
              <Check size={20} aria-hidden /> {dr?.started ?? 'Запрос и корпус переданы в Deep Research'}
            </>
          ) : (
            nb(dr?.problem ?? 'Публикации найдены и разложены, но не сведены в один вывод. Сводить их — работа Deep Research')
          )}
        </p>
        {pl && !started && (
          <p className="handoff-pass">
            Передадим запрос, {pl.concepts.length} {plural(pl.concepts.length, 'понятие', 'понятия', 'понятий')}, {pl.constraints.length} {plural(pl.constraints.length, 'условие', 'условия', 'условий')} и {state.selected.length ? `${state.selected.length} отмеченных из ${corpus.length}` : `все ${corpus.length}`} {plural(state.selected.length || corpus.length, 'публикацию', 'публикации', 'публикаций')}
          </p>
        )}
      </div>
      {!started && (
        <div className="handoff-acts">
          <button className="btn btn-ghost" onClick={() => dispatch({ t: 'select-all', ids: allOn ? [] : corpus.map((p) => p.id) })}>
            {allOn ? 'Снять отметки' : 'Отметить все'}
          </button>
          <button className="btn btn-primary" onClick={() => dispatch({ t: 'dr-start' })} data-mode={mode}>
            {CTA[mode]}
          </button>
        </div>
      )}
    </motion.aside>
  );
}

export { keyOfPub };
