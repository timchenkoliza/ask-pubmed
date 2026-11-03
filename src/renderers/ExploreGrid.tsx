import { motion } from 'framer-motion';
import { useRef } from 'react';
import { PubCard } from '../components/Card';
import { MoreLink, RenderProps, useRailIndex } from './shared';

/* Поиск литературы по умолчанию: независимые карточки в сетке на 2–3 колонки.
   На телефоне: одна основная карточка и следующая, выглядывающая справа. */

export function ExploreGrid({ response, state, dispatch, layout, touch, animateIn }: RenderProps) {
  const items = response.items;
  const rail = useRef<HTMLDivElement>(null);
  const mobile = layout === 'mobile';
  const idx = useRailIndex(rail, items.length, mobile);
  return (
    <section className="board board--grid" aria-label="Публикации">
      <motion.div layoutScroll ref={rail} className="cards-grid">
        {items.map((p, i) => (
          <PubCard key={p.id} pub={p} lang={state.lang[p.id]} variant="grid" dispatch={dispatch} index={i} animateIn={animateIn} moves={state.viewMoves} touch={touch} />
        ))}
      </motion.div>
      {mobile && items.length > 1 && (
        <p className="rail-count" aria-live="polite">
          {idx + 1} из {items.length}
        </p>
      )}
      <MoreLink response={response} />
    </section>
  );
}

/* Тот же корпус, плотнее: одна строка на публикацию. */
export function CompactLedger({ response, state, dispatch, touch, animateIn }: RenderProps) {
  const items = response.items;
  return (
    <section className="board board--ledger" aria-label="Публикации, плотный вид">
      <div className="ledger-head" aria-hidden>
        <span>Год</span>
        <span>Название</span>
        <span>Журнал</span>
        <span>Тип</span>
        <span>Текст</span>
        <span />
      </div>
      <div className="ledger">
        {items.map((p, i) => (
          <PubCard key={p.id} pub={p} lang={state.lang[p.id]} variant="compact" dispatch={dispatch} index={i} animateIn={animateIn} moves={state.viewMoves} touch={touch} />
        ))}
      </div>
      <MoreLink response={response} />
    </section>
  );
}
