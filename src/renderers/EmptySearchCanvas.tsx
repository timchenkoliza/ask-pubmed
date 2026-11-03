import { motion } from 'framer-motion';
import { ArrowLeft, Check, ExternalLink } from 'lucide-react';
import { kindOfConcept } from '../data/match';
import { lastPeriod } from '../lib/typo';
import { Dispatch } from 'react';
import type { ConstraintKind, Params, Scenario, SearchResponse, StudyType } from '../data/types';
import type { Action, State } from '../state/machine';
import { QuestionRow } from '../components/Views';

/* Ничего не нашли: показываем состав запроса и то, что именно помешало.
   Врачу не нужно гадать, какой фильтр сузил поиск. */

const TYPE_NAME: Record<StudyType, string> = { sr: 'Систематические обзоры', ma: 'Метаанализы', rct: 'РКИ', cohort: 'Когорты' };

const STRAT = { exact: 'точный', broad: 'расширенный', fallback: 'запасной' } as const;

interface Line { id: string; text: string; blocker: boolean; kind?: ConstraintKind }

function composition(sc: Scenario, params: Params, response: SearchResponse | null): Line[] {
  const kind = response?.relax?.kind;
  const lines: Line[] = [];
  params.concepts
    .filter((c) => c.active && c.role !== 'quote')
    .forEach((c) => lines.push({ id: c.id, text: c.role === 'must' ? `${c.label} в публикации` : c.label, blocker: false, kind: kindOfConcept(c) }));
  if (params.types.length < 4) {
    const names = params.types.map((t) => sc.typeLabels?.[t] ?? TYPE_NAME[t]);
    lines.push({ id: 'types', text: names.join(', '), blocker: kind === 'types', kind: 'REQUIRED' });
  }
  if (params.period !== null) lines.push({ id: 'period', text: lastPeriod(params.period), blocker: kind === 'period', kind: params.periodKind });
  if (params.fullTextOnly) lines.push({ id: 'fulltext', text: 'Только с полным текстом', blocker: kind === 'fulltext', kind: params.fullTextKind });
  return lines;
}

export function EmptySearchCanvas({
  state,
  sc,
  params,
  response,
  dispatch,
}: {
  state: State;
  sc: Scenario;
  params: Params;
  response: SearchResponse | null;
  dispatch: Dispatch<Action>;
}) {
  const missing = response?.state === 'known-publication-not-found' ? state.plan?.known?.value : undefined;
  const lines: Line[] = missing ? [{ id: 'id', text: missing, blocker: true }] : composition(sc, params, response);
  const relax = response?.relax;
  const noRelax = !!missing || !relax || !lines.some((l) => l.blocker);

  return (
    <motion.section
      className="empty"
      aria-labelledby="empty-h"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', stiffness: 200, damping: 26 }}
    >
      <QuestionRow query={state.query} onEdit={() => dispatch({ t: 'back' })} dim />
      <h1 id="empty-h" className="empty-title">{missing ? 'Публикацию с таким номером не нашли' : 'С такими условиями публикаций не нашли'}</h1>
      <ul className="comp" aria-label="Состав запроса">
        {lines.map((l, i) => (
          <motion.li
            key={l.id}
            className={`comp-row${l.blocker ? ' is-blocker' : ''}`}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.12 + i * 0.07, type: 'spring', stiffness: 220, damping: 24 }}
          >
            <span className="comp-text">{l.text}</span>
            {l.kind && <span className={`kind kind--${l.kind === 'REQUIRED' ? 'req' : 'pref'}`}>{l.kind === 'REQUIRED' ? 'Обязательно' : 'Желательно'}</span>}
            <span className="comp-mark" role="img" aria-label={l.blocker ? (missing ? 'Не найдено' : 'Мешает поиску') : 'Выполнено'}>
              {l.blocker ? <ArrowLeft size={20} aria-hidden /> : <Check size={20} aria-hidden />}
            </span>
          </motion.li>
        ))}
      </ul>
      {!missing && response && response.executed.length > 0 && (
        <p className="empty-tried" data-tried={response.executed.map((e) => `${e.strategy}:${e.count}`).join(',')}>
          Проверили три варианта запроса: {response.executed.map((e) => `${STRAT[e.strategy]} — ${e.count}`).join(', ')}. Обязательные условия не снимали
        </p>
      )}
      {missing && <p className="empty-tried">Номер проверен по записям PubMed, тематический поиск не запускали</p>}
      <div className="empty-actions">
        {!noRelax && relax && (
          <button className="btn btn-primary" onClick={() => dispatch({ t: 'relax' })}>
            {relax.label}
          </button>
        )}
        {missing ? (
          <>
            <button className="btn btn-primary" onClick={() => dispatch({ t: 'back' })}>
              Изменить запрос
            </button>
            <a className="btn btn-ghost" href={missing.startsWith('PMID') ? `https://pubmed.ncbi.nlm.nih.gov/${missing.replace(/\D/g, '')}/` : `https://doi.org/${missing.replace(/^DOI\s*/, '')}`} target="_blank" rel="noopener noreferrer">
              {missing.startsWith('PMID') ? 'Открыть в PubMed' : 'Открыть по DOI'} <ExternalLink size={18} aria-hidden />
            </a>
          </>
        ) : (
          <button className="btn btn-ghost" onClick={() => dispatch({ t: 'open-sheet' })}>
            Изменить условия
          </button>
        )}
      </div>
    </motion.section>
  );
}
