import { MotionConfig } from 'framer-motion';
import { ChevronLeft, ChevronRight, FileSearch, Scale, Search, X } from 'lucide-react';
import type { KeyboardEvent, ReactNode } from 'react';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FIXTURES, LOGIC } from '../data/scenarios';
import { Results } from './Results';
import { Preview, previewFor } from '../lib/preview';

/* Блок примеров на главной: три частые задачи врача.
   В превью — настоящий экран выдачи (тот же Results на тех же готовых данных), уменьшенный и неактивный.
   Раскладка превью считается по размеру окна внутри собственного фрейма, поэтому
   на телефоне в нём остаётся телефонная раскладка, а на компьютере — компьютерная. */

const byId = (id: string) => [...FIXTURES, ...LOGIC].find((f) => f.id === id)!;

interface Job {
  id: string;
  title: string;
  caption: string;
  icon: typeof Search;
  query: string;
  /** С какого места экрана начинать превью: на компьютере и на телефоне. Без значения — с самого верха. */
  from: { wide?: string; narrow?: string };
}

export const JOBS: Job[] = [
  { id: 'search', title: 'Найти исследования', caption: 'Опишите тему и важные условия поиска', icon: Search, query: byId('A').query, from: { wide: '.strip', narrow: '.head-title' } },
  { id: 'compare', title: 'Сравнить подходы', caption: 'Найдём публикации, где их сравнивают напрямую', icon: Scale, query: byId('C').query, from: { wide: '.anchors', narrow: '.head-title' } },
  { id: 'article', title: 'Найти в статье', caption: 'Укажите PMID, DOI или название публикации', icon: FileSearch, query: byId('L7').query, from: {} },
];

const noop = () => {};
/** Превью не отвечает на нажатия и не получает фокус. React 18 не знает атрибут inert, поэтому передаём его строкой. */
const INERT = { inert: '' } as Record<string, string>;

/* ─── Фрейм превью ─── */

const collectCss = (): string =>
  Array.from(document.querySelectorAll('style'))
    .map((s) => s.textContent ?? '')
    .join('\n');

/** Страница внутри iframe: те же стили, что у приложения. Содержимое подключается порталом. */
function Frame({ vw, vh, scale, from, children }: { vw: number; vh: number; scale: number; from?: string; children: ReactNode }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const inline = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<Document | null>(null);
  const [failed, setFailed] = useState(false);
  const srcDoc = useMemo(() => `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>html,body{overflow:hidden}</style><style>${collectCss()}</style></head><body></body></html>`, []);

  const attach = useCallback(() => {
    try {
      const d = ref.current?.contentDocument;
      if (d?.body) setDoc(d);
      else setFailed(true);
    } catch {
      setFailed(true);
    }
  }, []);

  /* Если фрейм не подключился за секунду (песочница), рисуем то же самое прямо в странице. */
  useEffect(() => {
    if (doc) return;
    const t = setTimeout(() => setFailed(true), 1200);
    return () => clearTimeout(t);
  }, [doc]);

  /* Превью начинается с нужного места экрана: у выдачи — с первых карточек, а не с шапки. */
  useEffect(() => {
    if (!doc) return;
    const win = doc.defaultView;
    const run = () => {
      const el = from ? doc.querySelector<HTMLElement>(from) : null;
      win?.scrollTo(0, el ? Math.max(0, Math.round(el.getBoundingClientRect().top + (win.scrollY || 0) - 14)) : 0);
    };
    run();
    const t = setTimeout(run, 120);
    return () => clearTimeout(t);
  }, [doc, from, children]);

  /* Запасной путь: то же превью прямо в странице, начало — тем же способом. */
  const fallback = failed && !doc;
  useEffect(() => {
    const box = inline.current;
    if (!fallback || !box) return;
    const run = () => {
      const el = from ? box.querySelector<HTMLElement>(from) : null;
      box.scrollTop = el ? Math.max(0, Math.round((el.getBoundingClientRect().top - box.getBoundingClientRect().top) / scale + box.scrollTop - 14)) : 0;
    };
    run();
    const t = setTimeout(run, 120);
    return () => clearTimeout(t);
  }, [fallback, from, children, scale]);

  const style = { width: vw, height: vh, transform: `scale(${scale})` } as const;
  if (fallback) {
    return (
      <div className="sc-inline" ref={inline} style={style}>
        {children}
      </div>
    );
  }
  return (
    <>
      <iframe ref={ref} className="sc-frame" title="Пример выдачи" srcDoc={srcDoc} onLoad={attach} tabIndex={-1} style={style} />
      {doc && createPortal(children, doc.body)}
    </>
  );
}

/* ─── Превью одной задачи ─── */

function Mini({ p, mobile }: { p: Preview; mobile: boolean }) {
  const layout = mobile ? 'mobile' : 'desktop';
  return (
    <MotionConfig reducedMotion="always">
      <div
        key={p.state.query}
        className={`app app--${layout} page-result intent-${p.intent} pv`}
        data-renderer={p.view}
        data-job={p.state.plan?.job ?? ''}
        data-result-state={p.response.state}
      >
        <div className="stage" aria-hidden />
        <main className="main">
          <div className={`col ${p.view === 'publication' ? 'col--read' : 'col--wide'}`}>
            <div className="result">
              <Results state={p.state} dispatch={noop} sc={p.sc} params={p.params} response={p.response} layout={layout} touch={mobile} onHintUse={noop} />
            </div>
          </div>
        </main>
      </div>
    </MotionConfig>
  );
}

/* ─── Блок ─── */

interface Props {
  onFill: (query: string) => void;
  onClose: () => void;
}

export function Showcase({ onFill, onClose }: Props) {
  const uid = useId();
  const [idx, setIdx] = useState(0);
  const job = JOBS[idx];
  const preview = useMemo(() => previewFor(job.query), [job.query]);

  /* Размер сцены: ширина по контейнеру, высота по экрану. От ширины зависит, какую раскладку показать в превью. */
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 760, h: 360 });
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const mobile = size.w < 560;
  const vw = mobile ? 440 : 1240;
  const scale = size.w / vw;
  const vh = Math.ceil(size.h / scale);

  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const go = (n: number, focus = false) => {
    const next = (n + JOBS.length) % JOBS.length;
    setIdx(next);
    if (focus) tabs.current[next]?.focus();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      go(idx + 1, true);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      go(idx - 1, true);
    } else if (e.key === 'Home') {
      e.preventDefault();
      go(0, true);
    } else if (e.key === 'End') {
      e.preventDefault();
      go(JOBS.length - 1, true);
    }
  };

  /* Активная карточка видна и в горизонтальной ленте на телефоне. */
  useEffect(() => {
    const el = tabs.current[idx];
    const strip = el?.parentElement;
    if (!el || !strip || strip.scrollWidth <= strip.clientWidth) return;
    strip.scrollTo({ left: el.offsetLeft - (strip.clientWidth - el.offsetWidth) / 2, behavior: 'auto' });
  }, [idx]);

  const tabId = (i: number) => `${uid}-tab-${i}`;
  const panelId = `${uid}-panel`;

  return (
    <section className="sc" aria-labelledby={`${uid}-h`} data-testid="onboarding" data-job={job.id}>
      <div className="sc-top">
        <h2 id={`${uid}-h`} className="sc-label">Примеры запросов</h2>
        <div className="sc-nav">
          <button type="button" className="sc-ico" aria-label="Предыдущий пример" onClick={() => go(idx - 1)}>
            <ChevronLeft size={22} aria-hidden />
          </button>
          <button type="button" className="sc-ico" aria-label="Следующий пример" onClick={() => go(idx + 1)}>
            <ChevronRight size={22} aria-hidden />
          </button>
          <span className="sc-sep" aria-hidden />
          <button type="button" className="sc-ico" aria-label="Скрыть примеры" onClick={onClose}>
            <X size={20} aria-hidden />
          </button>
        </div>
      </div>

      <div id={panelId} role="tabpanel" aria-labelledby={tabId(idx)} className="sc-panel">
        <div className="sc-stage" ref={box} aria-hidden>
          <div className="sc-view" {...INERT}>
            {preview && (
              <Frame vw={vw} vh={vh} scale={scale} from={mobile ? job.from.narrow : job.from.wide}>
                <Mini key={job.id} p={preview} mobile={mobile} />
              </Frame>
            )}
          </div>
        </div>
        <div className="sc-bar">
          <p className="sc-q">
            <span className="sr-only">Пример запроса: </span>
            «{job.query}»
          </p>
          <button type="button" className="btn btn-ghost sc-fill" onClick={() => onFill(job.query)}>
            Подставить пример
          </button>
        </div>
      </div>

      <div className="sc-cards" role="tablist" aria-label="Задачи" onKeyDown={onKeyDown}>
        {JOBS.map((j, i) => (
          <button
            key={j.id}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            id={tabId(i)}
            type="button"
            role="tab"
            aria-selected={i === idx}
            aria-controls={panelId}
            tabIndex={i === idx ? 0 : -1}
            className="sc-card"
            onClick={() => setIdx(i)}
          >
            <span className="sc-card-ico" aria-hidden>
              <j.icon size={18} />
            </span>
            <span className="sc-card-t">{j.title}</span>
            <span className="sc-card-s">{j.caption}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
