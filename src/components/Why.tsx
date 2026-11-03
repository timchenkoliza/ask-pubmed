import { Info, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Pub } from '../data/types';
import { explain } from '../lib/why';
import { useResultCtx } from './ResultContext';

/* «Почему в выдаче»: подсказка у карточки, но только когда есть что объяснять.
   Публикация, подходящая под все условия, объяснений не требует. Отдельный знак нужен тем, что нашли иначе:
   по синонимам или без части пожеланий. Сам ярлык «По широким терминам» и есть кнопка. Содержимое берётся из provenance записи. */

const W = 340;

export function WhyButton({ pub, title, compact, tag }: { pub: Pub; title: string; compact?: boolean; tag?: string }) {
  const ctx = useResultCtx();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; sheet: boolean }>({ top: 0, left: 0, sheet: false });
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const data = ctx ? explain(pub, ctx.response, ctx.params, ctx.sc) : null;

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (vw <= 640) return setPos({ top: 0, left: 0, sheet: true });
    const left = Math.max(12, Math.min(r.left, vw - W - 12));
    const below = r.bottom + 8;
    const top = below + 300 > vh ? Math.max(12, r.top - 8 - 300) : below;
    setPos({ top, left, sheet: false });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    pop.current?.focus({ preventScroll: true });
    const close = () => {
      setOpen(false);
      btn.current?.focus({ preventScroll: true });
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (pop.current?.contains(t) || btn.current?.contains(t)) return;
      setOpen(false);
    };
    /* Всплывающая подсказка закрывается при заметной прокрутке страницы. Нижний лист на телефоне — нет:
       он закреплён на экране и не уезжает, а мелкие подвижки при касании не должны его закрывать. */
    const y0 = window.scrollY;
    const onScroll = () => {
      if (pos.sheet) return;
      if (Math.abs(window.scrollY - y0) > 24) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, pos.sheet]);

  if (!data || data.tier === 'exact') return null;

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={tag ? `tier-tag tier-tag--${data.tier} tier-tag--btn` : `why-btn${compact ? ' why-btn--icon' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${tag ?? 'Почему в выдаче'}: ${title}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        {tag ? (
          <>
            {tag}
            <Info size={14} aria-hidden />
          </>
        ) : (
          <Info size={compact ? 18 : 16} aria-hidden />
        )}
      </button>
      {open &&
        createPortal(
          <div
            ref={pop}
            tabIndex={-1}
            role="dialog"
            aria-label="Почему в выдаче"
            className={`why-pop${pos.sheet ? ' why-pop--sheet' : ''}`}
            style={pos.sheet ? undefined : { top: pos.top, left: pos.left, width: W }}
            data-tier={data.tier}
          >
            <div className="why-head">
              <h2 className="why-title">Почему в выдаче</h2>
              <button
                type="button"
                className="icon-btn icon-btn--sm"
                aria-label="Закрыть"
                onClick={() => {
                  setOpen(false);
                  btn.current?.focus({ preventScroll: true });
                }}
              >
                <X size={18} aria-hidden />
              </button>
            </div>
            <p className="why-lead">{data.headline}</p>
            {(data.concepts.length > 0 || data.missed.length > 0) && (
              <dl className="why-list">
                {data.concepts.length > 0 && (
                  <div>
                    <dt>Совпало с запросом</dt>
                    <dd>
                      <ul className="why-ul">
                        {data.concepts.map((c) => (
                          <li key={c.label}>
                            {c.label} <span className="why-how">— {c.how}</span>
                          </li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                )}
                {data.missed.length > 0 && (
                  <div>
                    <dt>Из пожеланий не нашли</dt>
                    <dd>{data.missed.join('; ')}</dd>
                  </div>
                )}
              </dl>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
