import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { PubCard } from '../components/Card';
import { Comparison, splitComparison } from '../lib/groups';
import { plural } from '../lib/typo';
import { RenderProps } from './shared';

/* Сравнение: два объекта как якоря сверху, под ними публикации, где встречаются оба подхода.
   «Сравнивают напрямую» только те, где это отмечено в самих данных (directComparison); остальные — «упоминают оба».
   Работы об одном подходе лежат отдельно и свёрнуты. */

export function ComparisonCanvas({ sc, response, state, dispatch, layout, touch, animateIn }: RenderProps) {
  const cmp = splitComparison(response.items, sc);
  if (!cmp) return null;
  const { a, b, direct, both, together } = cmp;
  let n = 0;

  return (
    <section className="board board--compare" aria-label="Сравнение">
      <div className="anchors">
        <motion.div className="anchor anchor--a" initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ type: 'spring', stiffness: 170, damping: 22 }}>
          <span className="anchor-mark" aria-hidden>A</span>
          <span className="anchor-name">{a.label}</span>
        </motion.div>
        <div className="bridge" aria-hidden>
          <span className="bridge-line" />
          <span className="bridge-dot" />
          <span className="bridge-line" />
        </div>
        <motion.div className="anchor anchor--b" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ type: 'spring', stiffness: 170, damping: 22 }}>
          <span className="anchor-mark" aria-hidden>B</span>
          <span className="anchor-name">{b.label}</span>
        </motion.div>
      </div>

      <motion.section
        className="direct"
        aria-labelledby="direct-h"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12, duration: 0.5, ease: [0.2, 0.7, 0.2, 1] }}
      >
        <header className="direct-head">
          <h2 id="direct-h" className="direct-title">Публикации, где встречаются оба подхода</h2>
          <p className="direct-sub">
            {together.length} {plural(together.length, 'публикация', 'публикации', 'публикаций')}: упомянуты и {a.short ?? a.label.toLowerCase()}, и {b.short ?? b.label.toLowerCase()}. Совместное упоминание ещё не значит, что авторы их сравнивают
          </p>
        </header>

        {together.length === 0 && <p className="direct-empty">Работ, где упомянуты оба подхода, с такими условиями нет</p>}

        {direct.length > 0 ? (
          <div className="cmp-sub" data-zone="direct">
            <h3 className="cmp-sub-h">
              Сравнивают напрямую <span className="zone-count">{direct.length}</span>
            </h3>
            <motion.div layoutScroll className="cards-grid cards-grid--direct">
              {direct.map((p) => (
                <PubCard key={p.id} pub={p} lang={state.lang[p.id]} variant="direct" dispatch={dispatch} index={n++} animateIn={animateIn} moves={state.viewMoves} touch={touch} marks={[{ label: 'Прямое сравнение', tone: 'a' }]} />
              ))}
            </motion.div>
          </div>
        ) : (
          together.length > 0 && <p className="direct-empty" data-zone="no-direct">Прямых сравнений среди найденных нет: авторы упоминают оба подхода, но не сопоставляют их</p>
        )}

        {both.length > 0 && (
          <div className="cmp-sub" data-zone="both">
            <h3 className="cmp-sub-h">
              Упоминают оба подхода <span className="zone-count">{both.length}</span>
            </h3>
            <motion.div layoutScroll className="cards-grid cards-grid--direct">
              {both.map((p) => (
                <PubCard key={p.id} pub={p} lang={state.lang[p.id]} variant="direct" dispatch={dispatch} index={n++} animateIn={animateIn} moves={state.viewMoves} touch={touch} marks={[{ label: 'Оба упомянуты', tone: 'b' }]} />
              ))}
            </motion.div>
          </div>
        )}
      </motion.section>

      <OneSided cmp={cmp} state={state} dispatch={dispatch} layout={layout} touch={touch} start={together.length} />
    </section>
  );
}

export function OneSided({
  cmp,
  state,
  dispatch,
  layout,
  touch,
  start,
}: {
  cmp: Comparison;
  state: RenderProps['state'];
  dispatch: RenderProps['dispatch'];
  layout: RenderProps['layout'];
  touch: boolean;
  start: number;
}) {
  const { a, b, onlyA, onlyB } = cmp;
  const one = onlyA.length + onlyB.length;
  const open = state.oneSided;
  const mobile = layout === 'mobile';
  let n = start;
  if (one === 0) return null;
  return (
    <section className={`oneside${open ? ' is-open' : ''}`} aria-label="Работы об одном подходе">
      <button className="oneside-btn" aria-expanded={open} aria-controls="oneside-body" onClick={() => dispatch({ t: 'toggle-sided' })}>
        <span>Исследования только одного подхода</span>
        <span className="oneside-count">{one}</span>
        <motion.span style={{ display: 'inline-flex' }} animate={{ rotate: open ? 180 : 0 }}>
          <ChevronDown size={20} aria-hidden />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id="oneside-body"
            className="oneside-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.34, ease: [0.2, 0.7, 0.2, 1] }}
          >
            <div className="oneside-in">
              {[
                { e: a, list: onlyA },
                { e: b, list: onlyB },
              ]
                .filter((x) => x.list.length > 0)
                .map((x) => (
                  <div className="oneside-col" key={x.e.id}>
                    <h3 className="oneside-h">Только {x.e.short ?? x.e.label.toLowerCase()}</h3>
                    <div className="oneside-cards">
                      {x.list.map((p) => (
                        <PubCard
                          key={p.id}
                          pub={p}
                          lang={state.lang[p.id]}
                          variant="mini"
                          dispatch={dispatch}
                          index={n++}
                          animateIn={false}
                          moves={state.viewMoves}
                          touch={touch}
                          shared={false}
                          marks={[{ label: x.e.short ?? x.e.label, tone: x.e.id === a.id ? 'a' : 'b' }]}
                        />
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {!open && !mobile && <p className="oneside-note">Не сравнивают подходы напрямую и не смешиваются с основной зоной</p>}
    </section>
  );
}
