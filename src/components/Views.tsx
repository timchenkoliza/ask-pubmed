import { motion } from 'framer-motion';
import { ArrowUpRight, Check, Pencil } from 'lucide-react';
import type { Dispatch } from 'react';
import type { Scenario, ScenarioId } from '../data/types';
import type { Action, State } from '../state/machine';
import { nb } from '../lib/typo';
import { FIXTURES, LOGIC, TOPIC_NAME } from '../data/scenarios';

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

/* Экран «не поняли». Причин четыре, и текст у каждой свой: сказать «не нашли понятий» про запрос, у которого есть понятия, нечестно. */
type UnrecKind = 'many-ids' | 'collision' | 'foreign' | 'symbols';

const unrecKind = (state: State): UnrecKind => {
  if (state.plan?.manyIds) return 'many-ids';
  if (state.plan?.collision) return 'collision';
  return (state.query.match(/[a-zа-яё]{2,}/gi) ?? []).length ? 'foreign' : 'symbols';
};

/** По одному запросу-образцу на каждую тему прототипа. */
const topicSample = (id: ScenarioId): string => {
  const pick = (fid: string) => [...FIXTURES, ...LOGIC].find((f) => f.id === fid)!.query;
  return { cardio: pick('A'), gp: pick('B'), peds: pick('L1'), ob: pick('H'), endo: pick('C') }[id];
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const joinNames = (a: string[]) => (a.length > 1 ? `${a.slice(0, -1).join(', ')} и ${a[a.length - 1]}` : a[0] ?? '');

/** Запрос не превратился в поиск. Вопроса из одного варианта нет: говорим, почему, и показываем, что делать дальше. */
export function UnrecognisedView({ state, dispatch }: { state: State; dispatch: Dispatch<Action> }) {
  const kind = unrecKind(state);
  const collision = state.plan?.collision;
  const ids = state.plan?.manyIds ?? [];
  const all = Object.keys(TOPIC_NAME) as ScenarioId[];
  const samples = FIXTURES.filter((f) => ['A', 'B', 'C', 'H'].includes(f.id));

  const head =
    kind === 'many-ids'
      ? 'В запросе несколько номеров публикаций'
      : kind === 'collision'
        ? 'В запросе сразу несколько тем'
        : kind === 'foreign'
          ? 'Этой темы в прототипе нет'
          : 'В запросе нет слов, по которым можно искать';
  const text =
    kind === 'many-ids'
      ? 'За один раз открывается одна публикация. Выберите, какую открыть сейчас'
      : kind === 'collision'
        ? `Нашли: ${joinNames(collision?.names ?? [])}. Публикаций на их стыке в прототипе нет, а выдача по одной теме вместо двух ответила бы на другой вопрос. Выберите, с какой начать`
        : kind === 'foreign'
          ? `В прототипе пять тем: ${joinNames(all.map((id) => TOPIC_NAME[id]))}. Выберите одну из них или перепишите запрос`
          : 'Напишите словами, что вы ищете: состояние, препарат, исход. Ограничения по типу исследований и годам можно добавить в том же запросе';

  const chips: { key: string; label: string; query: string }[] =
    kind === 'many-ids'
      ? ids.slice(0, 6).map((id) => ({ key: id, label: `Открыть ${id}`, query: id }))
      : kind === 'collision'
        ? (collision?.ids ?? []).map((id) => ({ key: id, label: cap(TOPIC_NAME[id]), query: topicSample(id) }))
        : kind === 'foreign'
          ? all.map((id) => ({ key: id, label: cap(TOPIC_NAME[id]), query: topicSample(id) }))
          : samples.map((f) => ({ key: f.id, label: f.label, query: f.query }));

  return (
    <motion.section
      className="unrec"
      data-unrec={kind}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 26, delay: 0.1 }}
      aria-labelledby="unrec-h"
    >
      <QuestionRow query={state.query} onEdit={() => dispatch({ t: 'back' })} />
      <div className="unrec-body">
        <h1 id="unrec-h" className="route-title">{nb(head)}</h1>
        <p className="unrec-text">{text}</p>
        <div className="route-actions">
          <button className="btn btn-primary" onClick={() => dispatch({ t: 'back' })}>
            <Pencil size={18} aria-hidden /> Изменить запрос
          </button>
        </div>
        <ul className="unrec-list" aria-label={kind === 'many-ids' ? 'Номера из запроса' : 'Примеры запросов'}>
          {chips.map((c) => (
            <li key={c.key}>
              <button className="chip chip--light" onClick={() => dispatch({ t: 'load', query: c.query })}>
                {c.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </motion.section>
  );
}
