import { AnimatePresence, animate, motion } from 'framer-motion';
import { ExternalLink, Lock, SlidersHorizontal, X } from 'lucide-react';
import { Dispatch, ReactNode, RefObject, useEffect, useRef, useState } from 'react';
import { pubmedUrl } from '../data/compile';
import type { Params, Pub, ResultIntent, Scenario, SearchResponse } from '../data/types';
import type { Action, State } from '../state/machine';
import type { LayoutMode } from '../hooks';
import { nb } from '../lib/typo';
import { QuestionRow } from '../components/Views';

/* Общие части экранов выдачи. Сами экраны не делят между собой разметку:
   у каждого своя геометрия, здесь только шапка, подсказка и мелкие помощники. */

export interface RenderProps {
  sc: Scenario;
  state: State;
  dispatch: Dispatch<Action>;
  response: SearchResponse;
  layout: LayoutMode;
  touch: boolean;
  /** Первое появление выдачи: карточки выезжают по очереди. */
  animateIn: boolean;
}

export function Num({ value }: { value: number }) {
  const [txt, setTxt] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const c = animate(from.current, value, {
      duration: 0.7,
      ease: [0.2, 0.7, 0.2, 1],
      onUpdate: (v) => {
        from.current = v;
        setTxt(Math.round(v));
      },
    });
    return () => c.stop();
  }, [value]);
  return <>{txt}</>;
}

export type Fact = [number, string];

export function Strip({ items, busy }: { items: Fact[]; busy: boolean }) {
  return (
    <ul className={`strip${busy ? ' is-busy' : ''}`} aria-label="Что нашли" aria-busy={busy}>
      {items.map(([n, label], i) => (
        <li key={i}>
          <b className="strip-n"><Num value={n} /></b>
          <span className="strip-l">{label}</span>
        </li>
      ))}
    </ul>
  );
}

interface HeadProps {
  query: string;
  title: string;
  summary?: string;
  facts: Fact[];
  busy: boolean;
  params: Params | null;
  intent: ResultIntent;
  dispatch: Dispatch<Action>;
  children?: ReactNode;
}

/** Шапка выдачи: вопрос, заголовок, числа и «Как искали». Живёт на тёмной сцене. */
export function ResultHead({ query, title, summary, facts, busy, params, intent, dispatch, children }: HeadProps) {
  const must = params?.concepts.filter((c) => c.role === 'must' && c.active) ?? [];
  return (
    <header className={`head head--${intent}`} aria-labelledby="head-h">
      <QuestionRow query={query} onEdit={() => dispatch({ t: 'back' })} />
      <div className="head-body">
        <motion.h1
          id="head-h"
          className="head-title"
          key={title}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 170, damping: 22, delay: 0.04 }}
        >
          {nb(title)}
        </motion.h1>
        {summary && (
          <motion.p className="head-sum" key={summary} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.4 }}>
            {nb(summary)}
          </motion.p>
        )}
        {must.map((c) => (
          <p className="head-must" key={c.id}>
            <Lock size={16} aria-hidden /> {c.label} обязательно в публикации
          </p>
        ))}
        <div className="head-row">
          <Strip items={facts} busy={busy} />
          <div className="head-actions">
            {children}
            <button className="btn btn-ghost" onClick={() => dispatch({ t: 'open-sheet' })}>
              <SlidersHorizontal size={18} aria-hidden /> Как искали
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

/* ─── Подсказка: один раз ─── */

function PhoneShake() {
  return (
    <svg className="hint-phone" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="7" y="3" width="10" height="18" rx="2" />
      <path d="M11 18h2" />
      <path className="hint-wave hint-wave--l" d="M3.5 9.5c-.8 1.6-.8 3.4 0 5" />
      <path className="hint-wave hint-wave--r" d="M20.5 9.5c.8 1.6.8 3.4 0 5" />
    </svg>
  );
}

export function ShakeHint({ show, onUse, onClose }: { show: boolean; onUse: () => void; onClose: () => void }) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          className="hint"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3 }}
        >
          <button className="hint-main" onClick={onUse}>
            <PhoneShake />
            <span>Потрясите, чтобы разложить иначе</span>
          </button>
          <button className="icon-btn icon-btn--dark" aria-label="Скрыть подсказку" onClick={onClose}>
            <X size={18} aria-hidden />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ─── Горизонтальная лента на телефоне: номер карточки ─── */

export function useRailIndex(ref: RefObject<HTMLElement>, count: number, active: boolean) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    const on = () => {
      const kids = Array.from(el.children) as HTMLElement[];
      if (!kids.length) return;
      let best = 0;
      let dist = Infinity;
      kids.forEach((k, i) => {
        const d = Math.abs(k.offsetLeft - el.scrollLeft - el.offsetLeft);
        if (d < dist) {
          dist = d;
          best = i;
        }
      });
      setIdx(best);
    };
    on();
    el.addEventListener('scroll', on, { passive: true });
    return () => el.removeEventListener('scroll', on);
  }, [ref, count, active]);
  return idx;
}

export function MoreLink({ response }: { response: SearchResponse }) {
  const rest = response.total - response.items.length;
  if (rest <= 0) return null;
  return (
    <a className="more-link" href={pubmedUrl(response.queries.exact)} target="_blank" rel="noopener noreferrer">
      Остальные {rest} в PubMed <ExternalLink size={16} aria-hidden />
    </a>
  );
}

export const byId = (items: Pub[], id: string) => items.find((p) => p.id === id);
