import { motion } from 'framer-motion';
import { ArrowLeft, Check, ExternalLink } from 'lucide-react';
import { kindOfConcept } from '../data/match';
import { lastPeriod } from '../lib/typo';
import { Dispatch } from 'react';
import type { ConstraintKind, Params, Scenario, SearchResponse, StudyType } from '../data/types';
import type { Action, State } from '../state/machine';
import { QuestionRow } from '../components/Views';
import { ZeroHelp, zeroTitle } from '../components/ZeroHelp';
import { effTypes } from '../data/match';

/* Ничего не нашли: показываем состав запроса и то, что именно помешало.
   Врачу не нужно гадать, какой фильтр сузил поиск. */

const TYPE_NAME: Record<StudyType, string> = { sr: 'Систематические обзоры', ma: 'Метаанализы', rct: 'РКИ', cohort: 'Когорты' };

const MISSING_TITLE: Record<string, string> = {
  pmid: 'Публикацию с таким PMID не нашли',
  doi: 'Публикацию с таким DOI не нашли',
  title: 'Публикацию с таким названием не нашли',
  'author-year': 'Публикацию этого автора за этот год не нашли',
};

interface Line { id: string; text: string; blocker: boolean; kind?: ConstraintKind }

function pubmedLink(by: string | undefined, value: string): string {
  if (by === 'doi') return `https://doi.org/${value.replace(/^DOI\s*/, '')}`;
  if (by === 'title') return `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(`"${value}"[Title]`)}`;
  if (by === 'author-year') return `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(value)}`;
  return `https://pubmed.ncbi.nlm.nih.gov/${value.replace(/\D/g, '')}/`;
}

function composition(sc: Scenario, params: Params, response: SearchResponse | null): Line[] {
  const b = response?.blocker ?? null;
  const filters = b?.kind === 'filters';
  const lines: Line[] = [];
  params.concepts
    .filter((c) => c.active && c.role !== 'quote')
    .forEach((c) => lines.push({ id: c.id, text: c.role === 'must' ? `${c.label} в публикации` : c.label, blocker: b?.kind === 'concept' && b.id === c.id, kind: kindOfConcept(c) }));
  if (params.types.length > 0 && effTypes(params).length < 4) {
    const names = params.types.map((t) => sc.typeLabels?.[t] ?? TYPE_NAME[t]);
    lines.push({ id: 'types', text: names.join(', '), blocker: b?.id === 'types' || filters, kind: 'REQUIRED' });
  }
  if (params.period !== null) lines.push({ id: 'period', text: lastPeriod(params.period), blocker: b?.id === 'period' || filters, kind: params.periodKind });
  if (params.fullTextOnly) lines.push({ id: 'fulltext', text: 'Только с полным текстом', blocker: b?.id === 'fulltext' || filters, kind: params.fullTextKind });
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
  const by = state.plan?.known?.by;
  const lines: Line[] = missing ? [{ id: 'id', text: missing, blocker: true }] : composition(sc, params, response);

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
      <h1 id="empty-h" className="empty-title">{missing ? MISSING_TITLE[by ?? 'pmid'] : zeroTitle(response)}</h1>
      {!missing && response && <ZeroHelp sc={sc} params={params} response={response} dispatch={dispatch} tone="dark" />}
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
          Искали точно, шире и без необязательных условий: публикаций нет ни в одном случае. Обязательные условия не снимали
        </p>
      )}
      {missing && <p className="empty-tried">{by === 'title' ? 'Название' : by === 'author-year' ? 'Автор и год' : by === 'doi' ? 'DOI' : 'PMID'} проверили по записям PubMed, тематический поиск не запускали</p>}
      <div className="empty-actions">
        {missing ? (
          <>
            <button className="btn btn-primary" onClick={() => dispatch({ t: 'back' })}>
              Изменить запрос
            </button>
            <a className="btn btn-ghost" href={pubmedLink(by, missing)} target="_blank" rel="noopener noreferrer">
              {by === 'doi' ? 'Открыть по DOI' : by === 'pmid' ? 'Открыть в PubMed' : 'Искать в PubMed'} <ExternalLink size={18} aria-hidden />
            </a>
          </>
        ) : (
          <>
            <button className="btn btn-ghost" onClick={() => dispatch({ t: 'open-sheet' })}>
              Изменить условия
            </button>
            <button className="btn btn-quiet" onClick={() => dispatch({ t: 'back' })}>
              Изменить запрос
            </button>
          </>
        )}
      </div>
    </motion.section>
  );
}
