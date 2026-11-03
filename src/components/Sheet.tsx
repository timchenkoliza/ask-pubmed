import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import { ArrowLeft, Braces, Check, ChevronDown, Copy, ExternalLink, Lock, LockOpen, Plus, X } from 'lucide-react';
import { Dispatch, KeyboardEvent as ReactKeyboardEvent, useEffect, useRef, useState } from 'react';
import { pubmedUrl } from '../data/compile';
import { kindOfConcept } from '../data/match';
import { JOB_NAME } from '../data/router';
import type { ConstraintKind, Concept, Params, Period, QueryVariants, Scenario, SearchResponse, StudyType } from '../data/types';
import { Action, State, clearPriority, isLanding, setConceptActive, setFullTextKind, setPeriod, setPeriodKind, toggleConcept, toggleFullText, toggleHumans, toggleType } from '../state/machine';
import { TYPE_NAME } from '../data/match';
import { copyText, useEscape, LayoutMode } from '../hooks';
import { periodLabel, plural } from '../lib/typo';

/* «Как искали»: уровень 2 (параметры) и уровень 3 («Запрос PubMed»). */

const PERIODS: { v: Period; label: string }[] = [
  { v: 1, label: '1 год' },
  { v: 3, label: '3 года' },
  { v: 5, label: '5 лет' },
  { v: 10, label: '10 лет' },
  { v: null, label: 'Любой' },
];

const DEFAULT_TYPES: Record<StudyType, string> = { sr: 'Обзоры', ma: 'Метаанализы', rct: 'РКИ', cohort: 'Когорты' };

const GROUP: Record<string, string> = {
  condition: 'Состояние',
  exposure: 'Фактор или вмешательство',
  intervention: 'Вмешательство',
  focus: 'Что выясняем',
  outcome: 'Исход',
};
const GROUP_BY_ID: Record<string, string> = { kids: 'Популяция' };

const VARIANTS: { id: keyof QueryVariants; label: string; hint: string }[] = [
  { id: 'exact', label: 'Точный', hint: 'Понятия по MeSH и основной формулировке, плюс все условия: обязательные и желательные' },
  { id: 'broad', label: 'Расширенный', hint: 'Те же условия, но понятия ещё и по синонимам в названии и abstract' },
  { id: 'fallback', label: 'Запасной', hint: 'Только понятия и обязательные условия, желательные сняты' },
];

const KIND_LABEL: Record<ConstraintKind, string> = { REQUIRED: 'Обязательно', PREFERRED: 'Желательно', SEARCH_EXPANSION: 'Расширение' };

function Kind({ kind }: { kind: ConstraintKind }) {
  return <span className={`kind kind--${kind === 'REQUIRED' ? 'req' : 'pref'}`}>{KIND_LABEL[kind]}</span>;
}

/** Переключатель веса условия: «Обязательно» нельзя снять случайно, а «Желательно» не отсекает публикации. */
function KindSwitch({ label, value, onChange }: { label: string; value: ConstraintKind; onChange: (k: 'REQUIRED' | 'PREFERRED') => void }) {
  return (
    <div className="seg seg--sm kindsw" role="group" aria-label={label}>
      {(['REQUIRED', 'PREFERRED'] as const).map((k) => (
        <button key={k} type="button" className="seg-btn" aria-pressed={value === k} onClick={() => value !== k && onChange(k)}>
          {KIND_LABEL[k]}
        </button>
      ))}
    </div>
  );
}

function highlight(q: string) {
  return q.split(/(\[[^\]]+\]|\bAND\b|\bOR\b|\bNOT\b)/g).map((part, i) => {
    if (/^\[[^\]]+\]$/.test(part)) return <span key={i} className="q-tag">{part}</span>;
    if (/^(AND|OR|NOT)$/.test(part)) return <span key={i} className="q-op">{part}</span>;
    return <span key={i}>{part}</span>;
  });
}

interface Props {
  open: boolean;
  layout: LayoutMode;
  state: State;
  sc: Scenario;
  params: Params;
  response: SearchResponse | null;
  dispatch: Dispatch<Action>;
}

function Check01({ on }: { on: boolean }) {
  return on ? <Check size={16} aria-hidden /> : <Plus size={16} aria-hidden />;
}

function Switch({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: () => void }) {
  return (
    <button className="switch-row" role="switch" aria-checked={on} onClick={onChange}>
      <span className="switch-text">
        <span className="switch-label">{label}</span>
        {hint && <span className="switch-hint">{hint}</span>}
      </span>
      <span className="switch" aria-hidden>
        <span className="switch-knob" />
      </span>
    </button>
  );
}

export function Sheet({ open, layout, state, sc, params, response, dispatch }: Props) {
  const close = () => dispatch({ t: 'close-sheet' });
  useEscape(close, open);
  const drag = useDragControls();
  const bodyRef = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLElement>(null);
  const [variant, setVariant] = useState<keyof QueryVariants>('exact');
  const [openFact, setOpenFact] = useState<string | null>(null);

  /* Фокус уходит в панель, а при закрытии возвращается на кнопку, которой её открыли (WCAG 2.4.3). */
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) {
      opener.current = document.activeElement instanceof HTMLElement && !root.current?.contains(document.activeElement) ? document.activeElement : opener.current;
      root.current?.focus({ preventScroll: true });
      return;
    }
    const el = opener.current;
    opener.current = null;
    if (el && document.contains(el)) el.focus({ preventScroll: true });
  }, [open]);
  /* На телефоне панель модальная: Tab не выходит за её пределы. */
  const trap = (e: ReactKeyboardEvent) => {
    if (layout === 'desktop' || e.key !== 'Tab' || !root.current) return;
    const items = [...root.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input, [tabindex]:not([tabindex="-1"])')].filter((n) => n.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === root.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };
  useEffect(() => {
    if (!open) setVariant('exact');
  }, [open]);

  const edit = (patch: (p: Params) => Params, kind: string, id: string) => dispatch({ t: 'edit', patch, change: { kind, id } });
  const mobile = layout === 'mobile';

  const facts = params.concepts.filter((c) => !c.optional && c.role !== 'must' && c.role !== 'quote');
  const extras = params.concepts.filter((c) => c.optional);
  const gbs: Concept | undefined = params.concepts.find((c) => c.role === 'must');
  const typeLabel = (t: StudyType) => sc.typeLabels?.[t] ?? DEFAULT_TYPES[t];
  const total = response?.total ?? 0;

  const landing = isLanding(state.plan);
  const executed = response?.executed ?? [];
  const tabs = VARIANTS.filter((v) => executed.some((e) => e.strategy === v.id)).map((v) => (landing ? { ...v, label: 'По номеру', hint: 'Прямой запрос к записи PubMed, без тематического поиска' } : v));
  const shownTabs = tabs.length ? tabs : VARIANTS.slice(0, 1);
  const variantNow = shownTabs.some((v) => v.id === variant) ? variant : shownTabs[0].id;

  const rawBtn = (
    <button className="btn btn-ghost-light" onClick={() => dispatch({ t: 'raw', open: true })}>
      <Braces size={18} aria-hidden /> Запрос PubMed
    </button>
  );

  const content = state.rawOpen ? (
    <div className="raw">
      <button className="back-link" onClick={() => dispatch({ t: 'raw', open: false })}>
        <ArrowLeft size={18} aria-hidden /> К параметрам
      </button>
      <h3 className="sec-label">Запрос PubMed</h3>
      <div className="seg" role="tablist" aria-label="Вариант запроса">
        {shownTabs.map((v) => (
          <button key={v.id} role="tab" aria-selected={variantNow === v.id} className="seg-btn" onClick={() => setVariant(v.id)}>
            {v.label}
          </button>
        ))}
      </div>
      <p className="raw-hint">{shownTabs.find((v) => v.id === variantNow)!.hint}</p>
      <pre className="code" tabIndex={0} id="raw-code" aria-label="Текст запроса PubMed">
        {response ? highlight(response.queries[variantNow]) : null}
      </pre>
      <div className="raw-actions">
        <button
          className="btn btn-ghost-light"
          onClick={async () => {
            if (!response) return;
            const ok = await copyText(response.queries[variantNow], document.getElementById('raw-code'));
            dispatch({ t: 'toast', text: ok ? 'Запрос скопирован' : 'Запрос выделен, скопируйте его вручную' });
          }}
        >
          <Copy size={18} aria-hidden /> Копировать
        </button>
        {response && (
          <a className="btn btn-ghost-light" href={pubmedUrl(response.queries[variantNow])} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={18} aria-hidden /> Открыть в PubMed
          </a>
        )}
      </div>
    </div>
  ) : (
    <>
      <section className="sec">
        <h3 className="sec-label">Как поняли запрос</h3>
        <p className="sheet-job" data-job={state.plan?.job}>
          <b>{JOB_NAME[state.plan?.job ?? 'literature-search']}</b>
          {landing && state.plan?.known ? <> · {state.plan.known.value}</> : null}
          {state.ambiguityId ? <> · значение уточнено: {facts.find((c) => c.id === sc.ambiguity?.conceptId)?.label}</> : null}
        </p>
        {landing ? (
          <p className="sheet-note">Публикацию нашли по идентификатору, тематический поиск не запускали. Условия запроса к ней не применяются</p>
        ) : (
        <dl className="facts">
          {facts.map((c) => {
            const isOpen = openFact === c.id;
            return (
              <div key={c.id} className={`fact${c.active ? '' : ' is-off'}`}>
                <dt>{GROUP_BY_ID[c.id] ?? GROUP[c.role] ?? 'Параметр'}</dt>
                <dd>
                  <button className="fact-btn" aria-expanded={isOpen} onClick={() => setOpenFact(isOpen ? null : c.id)}>
                    <span className="fact-val">{c.label}</span>
                    <ChevronDown size={16} aria-hidden className={isOpen ? 'flip' : ''} />
                  </button>
                  <Kind kind={kindOfConcept(c)} />
                  {c.hint && <span className="fact-hint">{c.hint}</span>}
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.span
                        className="fact-map"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <span>В PubMed: {c.mapped}</span>
                      </motion.span>
                    )}
                  </AnimatePresence>
                </dd>
              </div>
            );
          })}
        </dl>
        )}
      </section>

      {!landing && gbs && (
        <section className="sec">
          <h3 className="sec-label">Обязательное условие</h3>
          <div className={`must${gbs.active ? '' : ' is-off'}`}>
            <span className="must-ic">{gbs.active ? <Lock size={20} aria-hidden /> : <LockOpen size={20} aria-hidden />}</span>
            <span className="must-text">
              <span className="must-title">{gbs.active ? `${gbs.label} обязательно` : `${gbs.label} не обязательно`}</span>
              {gbs.hint && <span className="must-hint">{gbs.hint}</span>}
            </span>
            {gbs.active ? (
              !state.confirmGbs && (
                <button className="link-btn" onClick={() => dispatch({ t: 'ask-gbs' })}>
                  Убрать
                </button>
              )
            ) : (
              <button className="link-btn" onClick={() => edit(setConceptActive(gbs.id, true), 'concept', gbs.id)}>
                Вернуть
              </button>
            )}
          </div>
          <AnimatePresence initial={false}>
            {gbs.active && state.confirmGbs && (
              <motion.div
                className="confirm"
                role="alertdialog"
                aria-label="Убрать обязательное условие"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.24 }}
              >
                <div className="confirm-in">
                  <p className="confirm-text">Без GBS поиск станет шире</p>
                  <div className="confirm-actions">
                    <button className="btn btn-primary" onClick={() => dispatch({ t: 'keep-gbs' })}>
                      Оставить GBS
                    </button>
                    <button className="btn btn-ghost-light" onClick={() => edit(setConceptActive(gbs.id, false), 'concept', gbs.id)}>
                      Искать шире
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      )}

      {!landing && extras.length > 0 && (
        <section className="sec">
          <h3 className="sec-label">Уточнения</h3>
          <div className="chips" role="group" aria-label="Уточнения запроса">
            {extras.map((c) => (
              <button
                key={c.id}
                className="chip chip--light"
                aria-pressed={c.active}
                onClick={() => edit(toggleConcept(c.id), 'concept', c.id)}
                title={c.hint}
              >
                <Check01 on={c.active} /> {c.label}
                {c.active && <span className="chip-kind">{kindOfConcept(c) === 'REQUIRED' ? 'обязательно' : 'желательно'}</span>}
              </button>
            ))}
          </div>
        </section>
      )}

      {!landing && <><section className="sec">
        <h3 className="sec-label">Типы исследований</h3>
        <div className="chips" role="group" aria-label="Типы исследований">
          {(['sr', 'ma', 'rct', 'cohort'] as StudyType[]).map((t) => (
            <button key={t} className="chip chip--light" aria-pressed={params.types.includes(t)} onClick={() => edit(toggleType(t), 'type', t)}>
              <Check01 on={params.types.includes(t)} /> {typeLabel(t)}
            </button>
          ))}
        </div>
        {params.preferTypes.length > 0 && (
          <p className="prio">
            <Kind kind="PREFERRED" /> В приоритете: {params.preferTypes.map((t) => typeLabel(t)).join(', ')}
            <button className="link-btn" onClick={() => edit(clearPriority(), 'priority', 'prefer-types')}>
              Убрать приоритет
            </button>
          </p>
        )}
      </section>

      <section className="sec">
        <h3 className="sec-label">Период публикации</h3>
        <div className="chips" role="radiogroup" aria-label="Период публикации">
          {(PERIODS.some((o) => o.v === params.period) ? PERIODS : [...PERIODS.slice(0, -1), { v: params.period, label: periodLabel(params.period) }, PERIODS[PERIODS.length - 1]].sort((x, y) => (x.v ?? 99) - (y.v ?? 99))).map((o) => (
            <button
              key={String(o.v)}
              role="radio"
              aria-checked={params.period === o.v}
              className="chip chip--light"
              onClick={() => params.period !== o.v && edit(setPeriod(o.v), 'period', 'period')}
            >
              {params.period === o.v && <Check size={16} aria-hidden />} {o.label}
            </button>
          ))}
        </div>
        {params.period !== null && <KindSwitch label="Вес условия «Период»" value={params.periodKind} onChange={(k) => edit(setPeriodKind(k), 'period-kind', 'period')} />}
      </section>

      <section className="sec sec--tight">
        <Switch label="Только с полным текстом" on={params.fullTextOnly} onChange={() => edit(toggleFullText(), 'fulltext', 'fulltext')} />
        {params.fullTextOnly && <KindSwitch label="Вес условия «Полный текст»" value={params.fullTextKind} onChange={(k) => edit(setFullTextKind(k), 'fulltext-kind', 'fulltext')} />}
        <Switch label="Только исследования на людях" on={params.humans} onChange={() => edit(toggleHumans(), 'humans', 'humans')} />
      </section></>}

      {executed.length > 0 && (
        <section className="sec" aria-labelledby="strat-h">
          <h3 className="sec-label" id="strat-h">Как искали</h3>
          <ol className="strat" data-executed={executed.map((e) => e.strategy).join(',')}>
            {executed.map((e) => {
              const v = shownTabs.find((x) => x.id === e.strategy) ?? VARIANTS.find((x) => x.id === e.strategy)!;
              return (
                <li key={e.strategy} className={`strat-row strat-row--${e.strategy}`}>
                  <span className="strat-name">{v.label}</span>
                  <span className="strat-n">{e.count}</span>
                  <span className="strat-hint">{v.hint}</span>
                  {e.dropped.length > 0 && <span className="strat-drop">Сняли: {e.dropped.map((d) => d.label).join(', ')}</span>}
                </li>
              );
            })}
          </ol>
          {response && !landing && <p className="strat-merge">Результаты запросов объединены: одна публикация показана один раз. Записей до объединения {response.mergedFrom}, публикаций {response.items.length}</p>}
        </section>
      )}
      {layout !== 'desktop' && <section className="sec">{rawBtn}</section>}
    </>
  );

  const sheet = (
    <motion.section
      key="sheet"
      ref={root as never}
      tabIndex={-1}
      className={`sheet sheet--${layout}`}
      role="dialog"
      aria-modal={layout !== 'desktop'}
      aria-label="Как искали"
      onKeyDown={trap}
      initial={mobile ? { y: '100%' } : { opacity: 0, x: 28 }}
      animate={mobile ? { y: 0 } : { opacity: 1, x: 0 }}
      exit={mobile ? { y: '100%' } : { opacity: 0, x: 28 }}
      transition={{ type: 'spring', stiffness: 300, damping: 34 }}
      drag={mobile ? 'y' : false}
      dragListener={false}
      dragControls={drag}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0, bottom: 0.5 }}
      onDragEnd={(_, i) => {
        if (i.offset.y > 110 || i.velocity.y > 600) close();
      }}
    >
      {mobile && <div className="sheet-grab" onPointerDown={(e) => drag.start(e)} aria-hidden><span /></div>}
      <div className="sheet-head" onPointerDown={(e) => mobile && drag.start(e)}>
        <div>
          <h2 className="sheet-title">Как искали</h2>
          <p className="sheet-sub">Меняйте параметры — результаты обновятся</p>
        </div>
        <button className="icon-btn" aria-label="Закрыть" onClick={close} onPointerDown={(e) => e.stopPropagation()}>
          <X size={20} aria-hidden />
        </button>
      </div>
      <div className="sheet-body" ref={bodyRef}>{content}</div>
      {(layout !== 'desktop' || !state.rawOpen) && <div className="sheet-foot">
        {!state.rawOpen && layout === 'desktop' && rawBtn}
        {layout !== 'desktop' && (
          total > 0 ? (
            <button className="btn btn-primary" onClick={close}>
              Показать {total} {plural(total, 'публикацию', 'публикации', 'публикаций')}
            </button>
          ) : response?.relax ? (
            <button className="btn btn-primary" onClick={() => dispatch({ t: 'relax' })}>
              {response.relax.label}
            </button>
          ) : null
        )}
      </div>}
    </motion.section>
  );

  return (
    <>
      <AnimatePresence>
        {open && layout !== 'desktop' && (
          <motion.div
            key="scrim"
            className="scrim"
            onClick={close}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>{open && sheet}</AnimatePresence>
    </>
  );
}
