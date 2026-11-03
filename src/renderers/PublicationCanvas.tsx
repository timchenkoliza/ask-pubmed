import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, Bell, MessageSquare, ChevronDown, ChevronUp, Copy, ExternalLink, Search, SlidersHorizontal } from 'lucide-react';
import { Dispatch, Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { FtIcon, MorphTitle, TYPE_ONE } from '../components/Card';
import { FT_LONG, hasAbstract, searchableText } from '../lib/fulltext';
import { pubmedUrl } from '../data/compile';
import { bodyOf } from '../data/text';
import type { Pub } from '../data/types';
import { copyText } from '../hooks';
import type { Action, State } from '../state/machine';

/* Рабочая область одной публикации: выдачи нет, есть статья.
   Слева текст (abstract и полный текст), справа «Найти в статье» со списком совпадений. */

interface Section { key: string; title: string; text: string; lang: 'en' | 'ru' }
interface Match { n: number; section: string; sectionKey: string; start: number; end: number; snippet: [string, string, string] }

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Поиск по русскому тексту учитывает окончания: «дефицит железа» находит и «дефицита железа». */
function ruRegex(query: string): RegExp {
  const parts = query.split(/\s+/).map((w) => {
    if (!/^[а-яё]{5,}$/i.test(w)) return esc(w);
    return `${esc(w.slice(0, w.length >= 7 ? -2 : -1))}[а-яё]*`;
  });
  return new RegExp(`(?<![а-яё])${parts.join('\\s+')}`, 'gi');
}

const enRegex = (query: string): RegExp => new RegExp(esc(query).replace(/\s+/g, '\\s+'), 'gi');

function findAll(sections: Section[], q: string): Match[] {
  const query = q.trim();
  if (query.length < 2) return [];
  const cyr = /[а-яё]/i.test(query);
  const out: Match[] = [];
  for (const s of sections) {
    const re = s.lang === 'ru' && cyr ? ruRegex(query) : enRegex(query);
    let m: RegExpExecArray | null;
    while ((m = re.exec(s.text))) {
      const a = Math.max(0, m.index - 48);
      const b = Math.min(s.text.length, m.index + m[0].length + 56);
      out.push({
        n: out.length,
        section: s.title,
        sectionKey: s.key,
        start: m.index,
        end: m.index + m[0].length,
        snippet: [(a > 0 ? '…' : '') + s.text.slice(a, m.index), m[0], s.text.slice(m.index + m[0].length, b) + (b < s.text.length ? '…' : '')],
      });
      if (m[0].length === 0) re.lastIndex++;
    }
  }
  return out;
}

function Marked({ s, matches, active }: { s: Section; matches: Match[]; active: number }) {
  const mine = matches.filter((m) => m.sectionKey === s.key);
  if (!mine.length) return <>{s.text}</>;
  const parts: JSX.Element[] = [];
  let at = 0;
  mine.forEach((m) => {
    parts.push(<Fragment key={`t${m.n}`}>{s.text.slice(at, m.start)}</Fragment>);
    parts.push(
      <mark key={`m${m.n}`} data-m={m.n} className={m.n === active ? 'is-active' : ''}>
        {s.text.slice(m.start, m.end)}
      </mark>,
    );
    at = m.end;
  });
  parts.push(<Fragment key="end">{s.text.slice(at)}</Fragment>);
  return <>{parts}</>;
}

interface Props {
  pub: Pub;
  state: State;
  dispatch: Dispatch<Action>;
  /** Открыта из выдачи: показываем возврат. Если это единственная публикация задачи, возврат не нужен. */
  fromList: boolean;
  quoteId?: string;
  /** Задача «найди в этой статье»: что искать и как врач это сформулировал. */
  find?: { phrase?: string; terms: string[] };
  /** Как публикацию нашли: PMID, DOI, название, автор и год. */
  foundBy?: string;
  /** Тема поиска, из которого открыта статья: на неё тоже можно подписаться. */
  topic?: { id: string; title: string };
}

/** Строка подписки: переключатель с названием того, на что подписываемся. */
function SubRow({ kind, name, on, onToggle }: { kind: string; name: string; on: boolean; onToggle: () => void }) {
  return (
    <button className="switch-row sub-row" role="switch" aria-checked={on} onClick={onToggle}>
      <span className="switch-text">
        <span className="sub-kind">{kind}</span>
        <span className="switch-label sub-name">{name}</span>
      </span>
      <span className="switch" aria-hidden>
        <span className="switch-knob" />
      </span>
    </button>
  );
}

export function PublicationCanvas({ pub, state, dispatch, fromList, quoteId, find, foundBy, topic }: Props) {
  const reduced = !!useReducedMotion();
  const lang = state.lang[pub.id];
  const ru = lang === 'ru';
  const quote = quoteId ? pub.quotes?.find((q) => q.id === quoteId) : undefined;
  /* Что подставлено в поиск само: цитата или термин задачи. Оригинал ищем по английскому тексту, перевод — по русскому. */
  const auto = { en: quote?.text ?? find?.terms[0] ?? '', ru: quote?.textRu ?? find?.phrase ?? '' };
  const autoFor = (isRu: boolean) => (isRu ? auto.ru || auto.en : auto.en);
  const [q, setQ] = useState(() => autoFor(ru));
  const [active, setActive] = useState(0);
  const body = useMemo(() => bodyOf(pub), [pub]);

  useEffect(() => {
    setQ(autoFor(ru));
    setActive(0);
  }, [pub.id, quote?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Врач переключил язык: подставленный нами запрос переводим вместе с текстом, набранный им самим не трогаем. */
  const wasRu = useRef(ru);
  useEffect(() => {
    if (wasRu.current === ru) return;
    const from = autoFor(wasRu.current);
    wasRu.current = ru;
    setQ((cur) => (cur === from ? autoFor(ru) : cur));
    setActive(0);
  }, [ru]); // eslint-disable-line react-hooks/exhaustive-deps

  const canSearch = hasAbstract(pub);
  const inText = searchableText(pub);

  const sections: Section[] = useMemo(() => {
    const abs: Section = ru && pub.abstractRu ? { key: 'abs', title: 'Abstract', text: pub.abstractRu, lang: 'ru' } : { key: 'abs', title: 'Abstract', text: pub.abstract, lang: 'en' };
    return [abs, ...(body ?? []).map((b, i): Section => (ru && b.textRu ? { key: `b${i}`, title: b.title, text: b.textRu, lang: 'ru' } : { key: `b${i}`, title: b.title, text: b.text, lang: 'en' }))];
  }, [ru, pub.abstract, pub.abstractRu, body]);

  const matches = useMemo(() => (canSearch ? findAll(sections, q) : []), [sections, q, canSearch]);
  const inBody = matches.some((m) => m.sectionKey !== 'abs');
  const cur = matches.length ? Math.min(active, matches.length - 1) : 0;

  /* Прокрутка к текущему совпадению. */
  const first = useRef(true);
  useEffect(() => {
    if (!matches.length) return;
    const el = document.querySelector<HTMLElement>(`mark[data-m="${cur}"]`);
    if (!el) return;
    const delay = first.current ? 380 : 0;
    first.current = false;
    const t = setTimeout(() => el.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' }), delay);
    return () => clearTimeout(t);
  }, [cur, matches.length, q, reduced]);

  const step = (d: number) => matches.length && setActive((cur + d + matches.length) % matches.length);
  const title = ru ? pub.titleRu : pub.title;
  const absSection = sections[0];

  return (
    <motion.section
      className="pubcv"
      aria-labelledby="pub-h"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8, transition: { duration: 0.16 } }}
      transition={{ type: 'spring', stiffness: 200, damping: 26 }}
    >
      {fromList && (
        <button className="back-link back-link--dark" onClick={() => dispatch({ t: 'close-pub' })}>
          <ArrowLeft size={18} aria-hidden /> {state.pubFrom === 'pbz' ? 'Назад в ПБЗ' : state.pubFrom === 'dr' ? 'Назад в Deep Research' : 'К результатам'}
        </button>
      )}

      <div className="pubcv-grid">
        <article className="reader">
          <header className="reader-head">
          <div className="reader-top">
            <p className="reader-meta">
              <span>{TYPE_ONE[pub.type]}</span>
              <i aria-hidden>·</i>
              <span>{pub.year}</span>
              <i aria-hidden>·</i>
              <span>{pub.journal}</span>
            </p>
            <div className="seg seg--sm" role="group" aria-label="Язык текста">
              <button className="seg-btn" aria-pressed={!ru} onClick={() => ru && dispatch({ t: 'toggle-lang', id: pub.id, to: 'en' })}>
                Оригинал
              </button>
              <button className="seg-btn" aria-pressed={ru} onClick={() => !ru && dispatch({ t: 'toggle-lang', id: pub.id, to: 'ru' })}>
                Перевод
              </button>
            </div>
          </div>

          <h1 id="pub-h" className="reader-title">
            <MorphTitle text={title} lang={lang} animated />
          </h1>

          <p className="reader-ft" data-ft={pub.fullTextState}>
            <FtIcon state={pub.fullTextState} />
            {FT_LONG[pub.fullTextState]}
          </p>
          {foundBy && <p className="reader-found">Открыта по запросу: {foundBy}</p>}
          </header>

          <div className="reader-body">
          {canSearch ? (
            <section className="rsec" aria-labelledby="r-abs">
              <h2 id="r-abs" className="rsec-h">Abstract</h2>
              <p className="rsec-t" lang={absSection.lang}>
                <Marked s={absSection} matches={matches} active={cur} />
              </p>
              {ru && !pub.abstractRu && <p className="rsec-note">Перевод abstract для этой публикации пока недоступен</p>}
            </section>
          ) : (
            <p className="reader-na" role="note">У записи нет abstract. Доступны название, журнал, год и идентификаторы</p>
          )}

          {body ? (
            <>
              {ru && body.some((b) => !b.textRu) && <p className="rsec-note">Перевод полного текста пока недоступен, показан оригинал</p>}
              {body.map((b, i) => (
                <section className="rsec" key={b.title} aria-labelledby={`r-b${i}`}>
                  <h2 id={`r-b${i}`} className="rsec-h">{b.title}</h2>
                  <p className="rsec-t" lang={sections[i + 1].lang}>
                    <Marked s={sections[i + 1]} matches={matches} active={cur} />
                  </p>
                </section>
              ))}
            </>
          ) : canSearch ? (
            <p className="reader-na" role="note" data-ft={pub.fullTextState}>
              {pub.fullTextState === 'publisher-link'
                ? 'Полный текст есть только у издателя, поиск идёт по abstract'
                : pub.fullTextState === 'pmc-embargoed'
                  ? 'Полный текст в PubMed Central откроется позже, поиск идёт по abstract'
                  : 'Полного текста нет, поиск идёт по abstract'}
            </p>
          ) : null}
          </div>
        </article>

        <aside className="rail" aria-label="Работа со статьёй">
          <div className="rail-card rail-card--find">
            <label className="rail-label" htmlFor="find">Найти в статье</label>
            {find?.phrase && (
              <p className="find-ask">
                Вы просили: «{find.phrase}»{find.terms.length > 0 ? <> · ищем <b lang="en">{find.terms[0]}</b></> : null}
              </p>
            )}
            <div className="find">
              <Search size={18} aria-hidden />
              <input
                id="find"
                className="find-input"
                type="search"
                value={q}
                placeholder="Слово или фраза"
                disabled={!canSearch}
                onChange={(e) => {
                  setQ(e.target.value);
                  setActive(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    step(e.shiftKey ? -1 : 1);
                  }
                }}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div className="find-bar" role="status" aria-live="polite">
              <span className="find-count">
                {!canSearch ? 'Искать негде' : q.trim().length < 2 ? 'Введите хотя бы две буквы' : matches.length ? `${cur + 1} из ${matches.length}` : 'Совпадений нет'}
              </span>
              <span className="find-steps">
                <button className="icon-btn icon-btn--sm" aria-label="Предыдущее совпадение" disabled={!matches.length} onClick={() => step(-1)}>
                  <ChevronUp size={18} aria-hidden />
                </button>
                <button className="icon-btn icon-btn--sm" aria-label="Следующее совпадение" disabled={!matches.length} onClick={() => step(1)}>
                  <ChevronDown size={18} aria-hidden />
                </button>
              </span>
            </div>
            {canSearch && q.trim().length >= 2 && (
              <p className="find-where" data-where={matches.length ? (inBody ? 'fulltext' : 'abstract') : 'none'}>
                {matches.length
                  ? inBody
                    ? 'Найдено в полном тексте'
                    : 'Найдено в abstract'
                  : inText
                    ? 'В тексте статьи совпадений нет'
                    : 'В abstract совпадений нет'}
              </p>
            )}
            {!inText && (
              <p className="find-limit" role="note">
                {canSearch ? 'Полный текст недоступен для поиска. Ищем только в abstract' : 'Полный текст недоступен для поиска. Abstract в записи тоже нет'}
              </p>
            )}
            {quote && (
              <p className="find-quote">
                Точный фрагмент из раздела «{quote.source === 'abstract' ? 'Abstract' : quote.section}»
              </p>
            )}
            {matches.length > 0 && (
              <ul className="matches">
                {matches.slice(0, 12).map((m) => (
                  <li key={m.n}>
                    <button className={`match${m.n === cur ? ' is-on' : ''}`} onClick={() => setActive(m.n)}>
                      <span className="match-sec">{m.section}</span>
                      <span className="match-t">
                        {m.snippet[0]}
                        <b>{m.snippet[1]}</b>
                        {m.snippet[2]}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rail-card rail-card--ask">
            <p className="rail-label">Обсудить</p>
            <p className="rail-note">Задайте вопрос о статье в ПБЗ: ответ опирается на её текст, а вы остаётесь в этом же чате</p>
            <button className="btn btn-primary rail-ask" onClick={() => dispatch({ t: 'open-pbz', pubId: pub.id })}>
              <MessageSquare size={18} aria-hidden /> Спросить о статье в ПБЗ
            </button>
          </div>

          <div className="rail-card rail-card--src">
            <p className="rail-label">Источник</p>
            <dl className="src">
              <div><dt>Журнал</dt><dd>{pub.journal}</dd></div>
              <div><dt>Год</dt><dd>{pub.year}</dd></div>
              {pub.pmid && <div><dt>PMID</dt><dd>{pub.pmid}</dd></div>}
              {pub.doi && <div><dt>DOI</dt><dd>{pub.doi}</dd></div>}
            </dl>
            <div className="subs" role="group" aria-label="Подписка на первоисточник">
              <p className="subs-h">
                <Bell size={15} aria-hidden /> Подписаться на первоисточник
              </p>
              <SubRow kind="Журнал" name={pub.journal} on={state.subs.includes(`journal:${pub.journal}`)} onToggle={() => dispatch({ t: 'toggle-sub', key: `journal:${pub.journal}`, label: pub.journal })} />
              {topic && (
                <SubRow kind="Тема поиска" name={topic.title} on={state.subs.includes(`topic:${topic.id}`)} onToggle={() => dispatch({ t: 'toggle-sub', key: `topic:${topic.id}`, label: topic.title })} />
              )}
            </div>
            <div className="rail-links">
              <a className="link" href={pubmedUrl(pub.pmid ? `${pub.pmid}[pmid]` : `"${pub.title}"[Title]`)} target="_blank" rel="noopener noreferrer">
                Открыть в PubMed <ExternalLink size={16} aria-hidden />
              </a>
              {pub.fullTextState === 'pmc-full-text' && (
                <a className="link" href={`https://www.ncbi.nlm.nih.gov/pmc/?term=${encodeURIComponent(pub.title)}`} target="_blank" rel="noopener noreferrer">
                  Открыть в PubMed Central <ExternalLink size={16} aria-hidden />
                </a>
              )}
              {pub.fullTextState === 'publisher-link' && (
                <a className="link" href={pub.doi ? `https://doi.org/${pub.doi}` : pubmedUrl(`"${pub.title}"[Title]`)} target="_blank" rel="noopener noreferrer">
                  Открыть у издателя <ExternalLink size={16} aria-hidden />
                </a>
              )}
              {foundBy && (
                <button className="link link--btn" onClick={() => dispatch({ t: 'open-sheet' })}>
                  Как нашли <SlidersHorizontal size={16} aria-hidden />
                </button>
              )}
              <button
                className="link link--btn"
                onClick={async () => {
                  const ok = await copyText(pub.title);
                  dispatch({ t: 'toast', text: ok ? 'Название скопировано' : 'Не удалось скопировать' });
                }}
              >
                Копировать название <Copy size={16} aria-hidden />
              </button>
            </div>
          </div>
        </aside>
      </div>
    </motion.section>
  );
}
