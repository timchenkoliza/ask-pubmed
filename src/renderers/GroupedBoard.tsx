import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { PubCard } from '../components/Card';
import type { Grouping, Pub, StudyType } from '../data/types';
import { groupBy } from '../lib/groups';
import { MoreLink, RenderProps } from './shared';

/* Доска: группы существуют как отдельные зоны со своей геометрией.
   Первая зона (то, что врач просил в приоритете) занимает всю ширину,
   остальные лежат рядом друг с другом. Слово «группировка» врачу не показываем. */

interface Props extends RenderProps {
  items?: Pub[];
  grouping?: Grouping;
  priority?: StudyType[];
  tail?: ReactNode;
  showMore?: boolean;
}

export function GroupedBoard({ response, sc, state, dispatch, touch, animateIn, items, grouping, priority, tail, showMore = true }: Props) {
  const list = items ?? response.items;
  const groups = groupBy(list, grouping ?? state.grouping ?? state.plan?.grouping ?? 'publicationType', sc, priority ?? state.plan?.priority);
  const many = groups.length >= 3;
  let n = 0;
  return (
    <section className={`board board--zones zones-${Math.min(groups.length, 3)}`} aria-label="Публикации по зонам">
      {groups.map((g, gi) => {
        const lead = many ? gi === 0 : groups.length === 1;
        const last = many && gi === groups.length - 1 && (groups.length - 1) % 2 === 1;
        return (
          <motion.section
            key={g.id}
            className={`zone${lead ? ' zone--lead' : ''}${last ? ' zone--last' : ''}`}
            aria-labelledby={`zone-${g.id}`}
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.05 + gi * 0.06, ease: [0.2, 0.7, 0.2, 1] }}
          >
            <header className="zone-head">
              <h2 id={`zone-${g.id}`} className="zone-title">{g.label}</h2>
              <span className="zone-count" aria-label={`Публикаций: ${g.items.length}`}>{g.items.length}</span>
            </header>
            <motion.div layoutScroll className="zone-cards">
              {g.items.map((p) => (
                <PubCard
                  key={p.id}
                  pub={p}
                  lang={state.lang[p.id]}
                  variant="board"
                  dispatch={dispatch}
                  index={n++}
                  animateIn={animateIn}
                  moves={state.viewMoves}
                  touch={touch}
                />
              ))}
            </motion.div>
          </motion.section>
        );
      })}
      {tail}
      {showMore && <MoreLink response={response} />}
    </section>
  );
}
