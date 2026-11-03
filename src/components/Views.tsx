import { motion } from 'framer-motion';
import { ArrowUpRight, Check, Pencil } from 'lucide-react';
import type { Dispatch } from 'react';
import type { Scenario } from '../data/types';
import type { Action, State } from '../state/machine';
import { nb } from '../lib/typo';
import { FIXTURES } from '../data/scenarios';

/* Вспомогательные экраны: уточнение, маршрутизация, ожидание поиска. */

export function QuestionRow({ query, onEdit, dim }: { query: string; onEdit: () => void; dim?: boolean }) {
  return (
    <button className={`qrow${dim ? ' is-dim' : ''}`} onClick={onEdit}>
      <span className="qrow-text">{query}</span>
      <span className="qrow-edit">Изменить</span>
    </button>
  );
}

export function RouteView({ state, sc, dispatch }: { state: State; sc: Scenario; dispatch: Dispatch<Action> }) {
  const r = sc.route!;
  return (
    <motion.section
      className="route"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ type: 'spring', stiffness: 200, damping: 26, delay: 0.25 }}
      aria-labelledby="route-h"
    >
      <QuestionRow query={state.query} onEdit={() => dispatch({ t: 'back' })} />
      <div className="route-body">
        <h2 id="route-h" className="route-title">{nb(r.headline)}</h2>
        <div className="route-actions">
          <button className="btn btn-primary" onClick={() => dispatch({ t: 'route-open' })}>
            {r.primary} <ArrowUpRight size={18} aria-hidden />
          </button>
          <button className="btn btn-ghost" onClick={() => dispatch({ t: 'route-pubmed' })}>
            {r.secondary}
          </button>
        </div>
        {state.handoff && (
          <motion.p className="route-done" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
            <Check size={18} aria-hidden /> {r.handoff}
          </motion.p>
        )}
      </div>
    </motion.section>
  );
}

export function SearchingView({ query, onEdit }: { query: string; onEdit: () => void }) {
  return (
    <motion.section
      className="searching"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <QuestionRow query={query} onEdit={onEdit} dim />
      <motion.p className="caption-search" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} role="status">
        Ищем публикации
      </motion.p>
    </motion.section>
  );
}

/** Ни одно понятие запроса не распознано. Вопроса из одного варианта нет: говорим как есть и показываем, что умеем искать. */
export function UnrecognisedView({ state, dispatch }: { state: State; dispatch: Dispatch<Action> }) {
  const samples = FIXTURES.filter((f) => ['A', 'B', 'C', 'H'].includes(f.id));
  return (
    <motion.section
      className="unrec"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 26, delay: 0.1 }}
      aria-labelledby="unrec-h"
    >
      <QuestionRow query={state.query} onEdit={() => dispatch({ t: 'back' })} />
      <div className="unrec-body">
        <h1 id="unrec-h" className="route-title">{nb('В запросе не нашли понятий, по которым можно искать')}</h1>
        <p className="unrec-text">
          Здесь разбираются запросы о состояниях, препаратах, исходах и ограничениях по типу исследований и годам. Уточните, что именно искать, или начните с примера.
        </p>
        <div className="route-actions">
          <button className="btn btn-primary" onClick={() => dispatch({ t: 'back' })}>
            <Pencil size={18} aria-hidden /> Изменить запрос
          </button>
        </div>
        <ul className="unrec-list" aria-label="Примеры запросов">
          {samples.map((f) => (
            <li key={f.id}>
              <button className="chip chip--light" onClick={() => dispatch({ t: 'load', query: f.query })}>
                {f.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </motion.section>
  );
}
