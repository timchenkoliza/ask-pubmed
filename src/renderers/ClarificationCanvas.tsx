import { motion } from 'framer-motion';
import { Dispatch } from 'react';
import type { Action, State } from '../state/machine';

/* Уточнение: очень пустой экран. Никакой выдачи, только вопрос и варианты.
   Форма сцены разделяется на столько частей, сколько вариантов; наведение подсвечивает свою. */

const LETTER = ['A', 'B', 'C', 'D'];

export function ClarificationCanvas({ state, dispatch, onHot }: { state: State; dispatch: Dispatch<Action>; onHot: (i: number) => void }) {
  const choices = state.askChoices ?? [];
  return (
    <motion.section
      className="clarify"
      aria-labelledby="clarify-h"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', stiffness: 220, damping: 26 }}
    >
      <h1 id="clarify-h" className="clarify-title">Что вы имеете в виду</h1>
      <div className="clarify-list" role="group" aria-labelledby="clarify-h" onMouseLeave={() => onHot(-1)}>
        {choices.map((c, i) => (
          <motion.button
            key={c.id}
            className="clarify-opt"
            onClick={() => dispatch({ t: 'pick-choice', id: c.id })}
            onMouseEnter={() => onHot(i)}
            onFocus={() => onHot(i)}
            onBlur={() => onHot(-1)}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 + i * 0.07, type: 'spring', stiffness: 220, damping: 24 }}
          >
            <span className="clarify-letter" aria-hidden>{LETTER[i]}</span>
            <span className="clarify-label">{c.label}</span>
            <span className="clarify-hint">{c.hint}</span>
          </motion.button>
        ))}
      </div>
      <button className="clarify-self" onClick={() => dispatch({ t: 'back' })}>
        Уточнить самому
      </button>
    </motion.section>
  );
}
