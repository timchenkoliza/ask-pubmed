import { motion, useAnimationControls } from 'framer-motion';
import { AlignLeft, Clock, ExternalLink, FileText, FileX } from 'lucide-react';
import { Dispatch, useCallback, useEffect, useRef } from 'react';
import type { FullTextState, Pub, StudyType } from '../data/types';
import { FT_LABEL } from '../lib/fulltext';
import { useResultCtx } from './ResultContext';
import { WhyButton } from './Why';
import type { Action, Lang } from '../state/machine';

export const TYPE_ONE: Record<StudyType, string> = {
  sr: 'Систематический обзор',
  ma: 'Метаанализ',
  rct: 'РКИ',
  cohort: 'Когортное исследование',
};
export function FtIcon({ state, size = 16, label }: { state: FullTextState; size?: number; label?: string }) {
  const p = { size, 'aria-label': label, 'aria-hidden': label ? undefined : true } as const;
  switch (state) {
    case 'pmc-full-text':
      return <FileText {...p} />;
    case 'abstract-only':
      return <AlignLeft {...p} />;
    case 'publisher-link':
      return <ExternalLink {...p} />;
    case 'pmc-embargoed':
      return <Clock {...p} />;
    default:
      return <FileX {...p} />;
  }
}

export const TYPE_SHORT: Record<StudyType, string> = { sr: 'Обзор', ma: 'Метаанализ', rct: 'РКИ', cohort: 'Когорта' };

/* ─── Заголовок: EN ⇄ RU с покадровой сменой слов, без перезагрузки раскладки ─── */

export function MorphTitle({ text, lang, animated }: { text: string; lang: Lang | undefined; animated: boolean }) {
  const ru = lang === 'ru';
  if (!animated || !lang) return <span lang={ru ? 'ru' : 'en'}>{text}</span>;
  const words = text.split(' ');
  return (
    <span lang={ru ? 'ru' : 'en'} key={lang}>
      {/* Слова остаются обычным текстом: диктор читает заголовок как есть, текст выделяется и копируется без дублей.
          aria-label на span без роли запрещён, поэтому второй копии заголовка для диктора нет. */}
      {words.map((w, i) => (
        <span key={i}>
          <motion.span
            style={{ display: 'inline-block' }}
            initial={{ opacity: 0, filter: 'blur(6px)', y: 5 }}
            animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
            transition={{ delay: Math.min(i, 24) * 0.02, duration: 0.32, ease: 'easeOut' }}
          >
            {w}
          </motion.span>
          {i < words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </span>
  );
}

/** Слова одним куском, как в MorphTitle, но без анимации: нужен для невидимой «подложки», чтобы она переносилась так же, как видимый текст. */
function StaticWords({ text }: { text: string }) {
  const words = text.split(' ');
  return (
    <>
      {words.map((w, i) => (
        <span key={i}>
          <span style={{ display: 'inline-block' }}>{w}</span>
          {i < words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </>
  );
}

/** Текст на двух языках в одной ячейке сетки. Видим один, второй невидим, но занимает место:
    высоту задаёт более длинный вариант, поэтому перевод не меняет размер карточки и не двигает соседей. */
export function BiText({ en, ru, lang, animated = true, quote = false }: { en: string; ru: string; lang: Lang | undefined; animated?: boolean; quote?: boolean }) {
  const isRu = lang === 'ru';
  const q = (open: boolean, inRu: boolean) =>
    quote ? (
      <span aria-hidden className="qmark">
        {inRu ? (open ? '«' : '»') : open ? '“' : '”'}
      </span>
    ) : null;
  return (
    <span className="bi">
      <span className="bi-ghost" aria-hidden lang="en">
        {q(true, false)}
        <StaticWords text={en} />
        {q(false, false)}
      </span>
      <span className="bi-ghost" aria-hidden lang="ru">
        {q(true, true)}
        <StaticWords text={ru} />
        {q(false, true)}
      </span>
      <span className="bi-live">
        {q(true, isRu)}
        <MorphTitle text={isRu ? ru : en} lang={lang} animated={animated} />
        {q(false, isRu)}
      </span>
    </span>
  );
}

/** Маленький переключатель EN / RU: по наведению раскрывается в пару, на сенсорных экранах всегда виден. */
export function LangToggle({ lang, onToggle, label }: { lang: Lang | undefined; onToggle: () => void; label: string }) {
  const ru = lang === 'ru';
  return (
    <button
      className="lang"
      type="button"
      aria-label={`EN RU. ${label}: ${ru ? 'показать оригинал' : 'перевести на русский'}`}
      aria-pressed={ru}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <span className="lang-in">
        <span className={ru ? '' : 'on'}>EN</span> <span className={ru ? 'on' : ''}>RU</span>
      </span>
    </button>
  );
}

export type CardVariant = 'grid' | 'board' | 'direct' | 'mini' | 'compact';

export interface CardProps {
  pub: Pub;
  lang: Lang | undefined;
  variant: CardVariant;
  dispatch: Dispatch<Action>;
  index: number;
  /** Первое появление выдачи: карточки выезжают по очереди. После встряски они только перемещаются. */
  animateIn: boolean;
  /** Сколько раз врач переложил найденное: каждая карточка слегка «встряхивается». */
  moves: number;
  /** Общий layoutId: карточка переезжает между представлениями. */
  shared?: boolean;
  touch: boolean;
  marks?: { label: string; tone: 'a' | 'b' }[];
  className?: string;
  /** Отметка «в корпус для анализа»: нужна на экране передачи в Deep Research. */
  select?: { checked: boolean; onChange: () => void };
}

export function PubCard({ pub, lang, variant, dispatch, index, animateIn, moves, shared = true, touch, marks, className, select }: CardProps) {
  const ru = lang === 'ru';
  const tilt = useAnimationControls();
  const seen = useRef(moves);
  const text = ru ? pub.titleRu : pub.title;

  const toggle = useCallback(() => dispatch({ t: 'toggle-lang', id: pub.id }), [dispatch, pub.id]);
  const open = useCallback(() => dispatch({ t: 'open-pub', id: pub.id }), [dispatch, pub.id]);

  useEffect(() => {
    if (seen.current === moves) return;
    seen.current = moves;
    const k = index % 2 ? 1 : -1;
    tilt.start({ rotate: [0, 1.7 * k, -1 * k, 0], transition: { duration: 0.58, ease: 'easeOut' } });
  }, [moves, index, tilt]);

  const ft = FT_LABEL[pub.fullTextState];
  const lead = pub.fragment;
  /* Публикации, найденные не точным поиском, помечены: врач видит, что они стоят ниже по причине, а не случайно. */
  const tier = useResultCtx()?.response.prov[pub.id]?.tier;
  const tierLabel = tier === 'broad' ? 'По широким терминам' : tier === 'fallback' ? 'Не все пожелания' : null;

  /* Без заголовка зоны над карточками (сетка, плотный список) карточка — заголовок второго уровня. */
  const Heading = variant === 'grid' || variant === 'compact' ? motion.h2 : motion.h3;
  const title = (
    <Heading
      className={`card-title${touch ? ' is-swipe' : ''}`}
      drag={touch ? 'x' : false}
      dragSnapToOrigin
      dragElastic={0.32}
      dragDirectionLock
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={(_, info) => {
        if (touch && Math.abs(info.offset.x) > 44) toggle();
      }}
      onTap={() => touch && open()}
    >
      {variant === 'compact' ? <MorphTitle text={text} lang={lang} animated /> : <BiText en={pub.title} ru={pub.titleRu} lang={lang} />}
    </Heading>
  );

  const body =
    variant === 'compact' ? (
      <>
        <span className="row-year">{pub.year}</span>
        {title}
        <span className="row-journal">{pub.journal}</span>
        <span className="row-type">{TYPE_SHORT[pub.type]}</span>
        <span className="row-ft" title={ft}>
          <FtIcon state={pub.fullTextState} label={ft} />
          <WhyButton pub={pub} title={text} compact />
        </span>
        <LangToggle lang={lang} onToggle={toggle} label="Название" />
      </>
    ) : (
      <>
        <div className="card-top">
          <p className="card-meta">
            {variant === 'mini' ? (
              <span>
                {TYPE_ONE[pub.type]} <i aria-hidden>·</i> {pub.year}
              </span>
            ) : (
              <>
                <span className="card-type">{TYPE_ONE[pub.type]}</span>
                <span className="card-journal">
                  {pub.year} <i aria-hidden>·</i> {pub.journal}
                </span>
              </>
            )}
          </p>
          <span className="card-acts">
            {select && (
              <label className="pick">
                <input type="checkbox" checked={select.checked} onChange={select.onChange} aria-label={`В корпус для анализа: ${text}`} />
                <span className="pick-box" aria-hidden />
              </label>
            )}
            {variant === 'mini' && <WhyButton pub={pub} title={text} compact />}
            <LangToggle lang={lang} onToggle={toggle} label="Название" />
          </span>
        </div>
        {title}
        {tierLabel && variant !== 'mini' && <span className={`tier-tag tier-tag--${tier}`}>{tierLabel}</span>}
        {variant !== 'mini' && (
          <div className="card-foot">
            <p className="card-ft" data-ft={pub.fullTextState}>
              <FtIcon state={pub.fullTextState} />
              {ft}
            </p>
            <WhyButton pub={pub} title={text} />
          </div>
        )}
        {marks && marks.length > 0 && (
          <p className="card-marks">
            {marks.map((m) => (
              <span key={m.label} className={`mark mark--${m.tone}`}>
                {m.label}
              </span>
            ))}
          </p>
        )}
        {lead && variant !== 'mini' && variant !== 'board' && (
          <p className="card-frag">
            <BiText en={lead} ru={pub.fragmentRu ?? lead} lang={lang} />
          </p>
        )}
      </>
    );

  return (
    <motion.article
      layout="position"
      layoutId={shared ? `pub-${pub.id}` : undefined}
      className={`card card--${variant}${className ? ` ${className}` : ''}`}
      data-tier={tier}
      initial={animateIn ? { opacity: 0, y: 22 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        layout: { type: 'spring', stiffness: 190, damping: 25, mass: 1 },
        opacity: { duration: 0.3, delay: animateIn ? Math.min(index, 9) * 0.05 : 0 },
        y: { type: 'spring', stiffness: 200, damping: 24, delay: animateIn ? Math.min(index, 9) * 0.05 : 0 },
      }}
    >
      <button
        className="card-hit"
        type="button"
        aria-label={`${text}. Открыть публикацию`}
        onClick={open}
        onKeyDown={(e) => {
          if (e.code === 'KeyT' && !e.metaKey && !e.ctrlKey && !e.altKey) {
            e.preventDefault();
            toggle();
          }
        }}
      />
      <motion.div className="card-tilt" animate={tilt}>
        {body}
      </motion.div>
    </motion.article>
  );
}
