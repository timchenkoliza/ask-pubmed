import { motion } from 'framer-motion';
import { ArrowUp, MessageSquare, Plus, Search, Telescope } from 'lucide-react';
import { Dispatch, FormEvent, Fragment, useEffect, useRef, useState } from 'react';
import { ModeBar } from '../components/ModeBar';
import { TYPE_ONE } from '../components/Card';
import type { Pub, Scenario, SearchResponse } from '../data/types';
import { PBZ_PROMPTS, PBZ_PROMPTS_ONE } from '../lib/pbz';
import { plural } from '../lib/typo';
import { pubById } from '../data/known';
import type { Action, PbzMsg, State } from '../state/machine';

/* ПБЗ: тот же тред, но вопрос-ответ по найденному, как в чате. Светлый интерфейс ПБЗ намеренно отличается от тёмной сцены поиска:
   врач видит, что режим сменился, и по полосе режимов, и по виду. Контекст (запрос, найденное, статья) переехал вместе с ним. */

function Cite({ n, pub, dispatch }: { n: number; pub?: Pub; dispatch: Dispatch<Action> }) {
  if (!pub) return <>[{n}]</>;
  return (
    <button className="cite" type="button" aria-label={`Источник ${n}: ${pub.title}. Открыть публикацию`} onClick={() => dispatch({ t: 'open-pub', id: pub.id })}>
      {n}
    </button>
  );
}

function Answer({ m, pubs, lang, dispatch }: { m: PbzMsg; pubs: Pub[]; lang: State['lang']; dispatch: Dispatch<Action> }) {
  const parts = m.text.split(/(\[\d+\])/g);
  return (
    <div className="msg msg--ai" data-msg="assistant">
      <p className="msg-who">
        ПБЗ <span className="msg-tag">Демо-ответ по найденному</span>
      </p>
      <p className="msg-text">
        {parts.map((p, i) => {
          const k = /^\[(\d+)\]$/.exec(p);
          return k ? <Cite key={i} n={+k[1]} pub={pubs[+k[1] - 1]} dispatch={dispatch} /> : <Fragment key={i}>{p}</Fragment>;
        })}
      </p>
      {pubs.length > 0 && (
        <div className="msg-src">
          <p className="msg-src-h">Источники</p>
          <ol className="msg-src-list">
            {pubs.map((p, i) => (
              <li key={p.id}>
                <button type="button" className="src-row" onClick={() => dispatch({ t: 'open-pub', id: p.id })}>
                  <span className="src-n">{i + 1}</span>
                  <span className="src-t">
                    <span className="src-title">{lang[p.id] === 'ru' ? p.titleRu : p.title}</span>
                    <span className="src-meta">
                      {TYPE_ONE[p.type]} · {p.year} · {p.journal}
                      {p.pmid ? ` · PMID ${p.pmid}` : ''}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

export function PbzCanvas({ state, sc, response, dispatch }: { state: State; sc: Scenario; response: SearchResponse; dispatch: Dispatch<Action> }) {
  const th = state.pbz!;
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const items = response.items;
  const one: Pub | null = th.pubId ? [...items, ...sc.pool].find((p) => p.id === th.pubId) ?? pubById(th.pubId)?.pub ?? null : null;
  const byId = (id: string) => [...items, ...sc.pool].find((p) => p.id === id) ?? pubById(id)?.pub;
  const prompts = one ? PBZ_PROMPTS_ONE : PBZ_PROMPTS;
  const picked = state.selected.length;
  const last = th.msgs.length;

  useEffect(() => {
    if (last > 0) endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [last]);

  const send = (text: string) => {
    if (!text.trim()) return;
    dispatch({ t: 'pbz-ask', text });
    setDraft('');
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send(draft);
  };

  return (
    <motion.section className="surf" aria-labelledby="pbz-h" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 26 }}>
      <ModeBar state={state} dispatch={dispatch} />
      <div className="pbz">
        <aside className="pbz-side" aria-label="Чаты">
          <button className="pbz-new" type="button" disabled>
            <Plus size={18} aria-hidden /> Новый чат
          </button>
          <p className="pbz-side-h">Сегодня</p>
          <p className="pbz-chat is-on" aria-current="true">
            {state.query}
          </p>
        </aside>

        <div className="pbz-main">
          <h1 id="pbz-h" className="pbz-title">
            ПБЗ
            <span className="pbz-sub">Продолжаем разговор о найденном</span>
          </h1>

          <div className="pbz-thread" role="log" aria-label="Диалог с ПБЗ">
            <div className="ctx" data-ctx={one ? 'article' : 'search'}>
              <span className="ctx-ic" aria-hidden>
                <Search size={18} />
              </span>
              <div className="ctx-body">
                <p className="ctx-h">{one ? 'Статья из Спросить PubMed' : 'Найдено в Спросить PubMed'}</p>
                <p className="ctx-t">{one ? one.title : state.query}</p>
                <p className="ctx-m">
                  {one
                    ? `${TYPE_ONE[one.type]} · ${one.year} · ${one.journal}`
                    : `${items.length} ${plural(items.length, 'публикация', 'публикации', 'публикаций')}${picked ? `, отмечено ${picked}` : ''}. Ответы будут опираться на них`}
                </p>
              </div>
              <button className="btn btn-ghost-light ctx-open" type="button" onClick={() => dispatch({ t: 'to-surface', to: 'agent' })}>
                {one ? 'К статье' : 'К найденному'}
              </button>
            </div>

            {th.msgs.length === 0 ? (
              <div className="pbz-hello">
                <p className="pbz-hello-t">Что спросить о {one ? 'статье' : 'найденном'}</p>
                <div className="chips" role="group" aria-label="Примеры вопросов">
                  {prompts.map((p) => (
                    <button key={p} className="chip chip--light" type="button" onClick={() => send(p)}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              th.msgs.map((m) =>
                m.role === 'user' ? (
                  <div key={m.id} className="msg msg--user" data-msg="user">
                    <p className="msg-text">{m.text}</p>
                  </div>
                ) : (
                  <Answer key={m.id} m={m} pubs={m.sources.map(byId).filter((p): p is Pub => !!p)} lang={state.lang} dispatch={dispatch} />
                ),
              )
            )}

            {th.msgs.length > 0 && (
              <div className="pbz-next" role="group" aria-label="Что дальше">
                <p className="pbz-next-t">Ответ опирается только на найденные публикации</p>
                <div className="pbz-next-acts">
                  <button className="btn btn-ghost-light" type="button" onClick={() => dispatch({ t: 'to-surface', to: 'agent' })}>
                    <Search size={18} aria-hidden /> Искать ещё в PubMed
                  </button>
                  <button className="btn btn-ghost-light" type="button" onClick={() => dispatch({ t: 'to-surface', to: 'dr' })}>
                    <Telescope size={18} aria-hidden /> Углубиться в Deep Research
                  </button>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form className="pbz-composer" onSubmit={onSubmit}>
            <label className="sr-only" htmlFor="pbz-q">
              Вопрос
            </label>
            <textarea
              id="pbz-q"
              className="pbz-input"
              rows={2}
              value={draft}
              placeholder="Задавайте медицинские вопросы…"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send(draft);
                }
              }}
            />
            <div className="pbz-bar">
              <div className="seg seg--sm" role="group" aria-label="Длина ответа">
                <button type="button" className="seg-btn" aria-pressed={th.short} onClick={() => dispatch({ t: 'pbz-short', short: true })}>
                  Короткий ответ
                </button>
                <button type="button" className="seg-btn" aria-pressed={!th.short} onClick={() => dispatch({ t: 'pbz-short', short: false })}>
                  Полный ответ
                </button>
              </div>
              <button className="chip chip--light pbz-tool" type="button" onClick={() => dispatch({ t: 'to-surface', to: 'agent' })} title="Вернуться к поиску публикаций">
                <MessageSquare size={16} aria-hidden /> Спросить PubMed
              </button>
              <button className="icon-btn pbz-send" type="submit" aria-label="Отправить" disabled={!draft.trim()}>
                <ArrowUp size={20} aria-hidden />
              </button>
            </div>
          </form>
        </div>
      </div>
    </motion.section>
  );
}
