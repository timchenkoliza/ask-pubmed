import { motion } from 'framer-motion';
import { FileText } from 'lucide-react';
import { BiText, FtIcon, LangToggle } from '../components/Card';
import { noQuoteReason } from '../lib/fulltext';
import type { Pub, PubQuote } from '../data/types';
import { QuoteCardData, quoteBoard } from '../lib/groups';
import { plural } from '../lib/typo';
import type { Lang } from '../state/machine';
import { RenderProps } from './shared';

/* Цитаты: главным объектом становится точный фрагмент, а не карточка статьи.
   Фрагменты собраны по исходам; рядом с каждым видно, откуда он: из abstract или из полного текста. */

const open = (q: PubQuote, pub: Pub, lang: Lang | undefined) => ({ t: 'open-pub' as const, id: pub.id, quote: q.id, lang });

function QuoteCard({ data, state, dispatch, animateIn, i }: { data: QuoteCardData; i: number; animateIn: boolean } & Pick<RenderProps, 'state' | 'dispatch'>) {
  const { quote: q, pub } = data;
  const key = `q:${q.id}`;
  const lang = state.lang[key];
  const fromAbstract = q.source === 'abstract';
  return (
    <motion.article
      className="qcard"
      initial={animateIn ? { opacity: 0, y: 18 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(i, 8) * 0.05, type: 'spring', stiffness: 200, damping: 24 }}
    >
      <p className="qcard-quote">
        <BiText en={q.text} ru={q.textRu} lang={lang} quote />
      </p>
      <div className="qcard-src">
        <span className={`src-tag ${fromAbstract ? 'src-tag--abs' : 'src-tag--ft'}`}>
          {fromAbstract ? <>Из abstract</> : <><FileText size={14} aria-hidden /> Полный текст · {q.section}</>}
        </span>
        <LangToggle lang={lang} onToggle={() => dispatch({ t: 'toggle-lang', id: key })} label="Цитата" />
      </div>
      <p className="qcard-art">
        <b>
          <BiText en={pub.title} ru={pub.titleRu} lang={lang} />
        </b>
        <span>{pub.journal}, {pub.year}</span>
      </p>
      <div className="qcard-act">
        <button className="btn btn-ghost-light btn-sm" onClick={() => dispatch(open(q, pub, lang))}>
          {fromAbstract ? 'Открыть в abstract' : 'Открыть в тексте'}
        </button>
      </div>
    </motion.article>
  );
}

export function QuoteBoard({ sc, response, state, dispatch, animateIn }: RenderProps) {
  const board = quoteBoard(response.items, sc);
  let n = 0;
  return (
    <section className="board board--quotes" aria-label="Цитаты">
      {board.groups.map((g, gi) => (
        <motion.section
          key={g.id}
          className="qband"
          aria-labelledby={`qb-${g.id}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.45, delay: gi * 0.07 }}
        >
          <header className="qband-head">
            <h2 id={`qb-${g.id}`} className="qband-title">{g.label}</h2>
            <span className="qband-count">
              {g.cards.length} {plural(g.cards.length, 'фрагмент', 'фрагмента', 'фрагментов')}
            </span>
          </header>
          <div className="masonry">
            {g.cards.map((c) => (
              <QuoteCard key={c.quote.id} data={c} i={n++} animateIn={animateIn} state={state} dispatch={dispatch} />
            ))}
          </div>
        </motion.section>
      ))}

      {board.noText.length > 0 && (
        <section className="qnone" aria-labelledby="qnone-h">
          <h2 id="qnone-h" className="qnone-title">Цитат нет: текст недоступен для поиска</h2>
          <ul className="qnone-list">
            {board.noText.map((p) => (
              <li key={p.id} data-ft={p.fullTextState}>
                <span className="qnone-t">{state.lang[p.id] === 'ru' ? p.titleRu : p.title}</span>
                <span className="qnone-n">
                  <FtIcon state={p.fullTextState} size={14} /> {noQuoteReason(p) ?? 'Подходящих фрагментов в тексте не нашли'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
