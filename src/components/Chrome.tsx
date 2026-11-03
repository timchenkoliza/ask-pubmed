import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ChevronDown, Images, Lightbulb, RotateCcw, Shuffle } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { LOGO_WHITE_BETA } from '../lib/logo';
import { useEscape, useOutside } from '../hooks';

export interface ExampleItem { id: string; label: string; hint?: string; query: string; group: 'fixtures' | 'logic' | 'classic' }

export function TopBar(props: {
  canBack: boolean;
  onBack: () => void;
  examples: ExampleItem[];
  currentQuery: string;
  onPick: (e: ExampleItem) => void;
  canShake: boolean;
  onShake: () => void;
  onHint: () => void;
  onOnboarding: () => void;
  canResetView: boolean;
  onResetView: () => void;
  stateLine: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useOutside(ref, close, open);
  useEscape(close, open);

  return (
    <header className="topbar">
      <img className="logo" src={LOGO_WHITE_BETA} alt="Яндекс Мед β" height={22} />
      <div className="topbar-right">
        <AnimatePresence initial={false}>
          {props.canBack && (
            <motion.button
              key="back"
              className="btn btn-quiet"
              onClick={props.onBack}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.2 }}
            >
              <ArrowLeft size={18} aria-hidden /> Назад
            </motion.button>
          )}
        </AnimatePresence>
        <div className="menu-wrap" ref={ref}>
          <button className="btn btn-quiet" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            Примеры <ChevronDown size={18} aria-hidden />
          </button>
          <AnimatePresence>
            {open && (
              <motion.div
                className="pop pop--top"
                role="menu"
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.16 }}
              >
                <p className="pop-label">Вид и подсказки</p>
                <button
                  role="menuitem"
                  className="pop-item"
                  disabled={!props.canShake}
                  onClick={() => {
                    props.onShake();
                    setOpen(false);
                  }}
                >
                  <Shuffle size={18} aria-hidden /> Разложить иначе <kbd>V</kbd>
                </button>
                <button
                  role="menuitem"
                  className="pop-item"
                  disabled={!props.canResetView}
                  onClick={() => {
                    props.onResetView();
                    setOpen(false);
                  }}
                >
                  <RotateCcw size={18} aria-hidden /> Сбросить вид по умолчанию
                </button>
                <button
                  role="menuitem"
                  className="pop-item"
                  onClick={() => {
                    props.onHint();
                    setOpen(false);
                  }}
                >
                  <Lightbulb size={18} aria-hidden /> Показать подсказку снова
                </button>
                <button
                  role="menuitem"
                  className="pop-item"
                  onClick={() => {
                    props.onOnboarding();
                    setOpen(false);
                  }}
                >
                  <Images size={18} aria-hidden /> Показать примеры запросов
                </button>
                <div className="pop-sep" />
                {([['fixtures', 'Запросы'], ['logic', 'Логика поиска'], ['classic', 'Исходные запросы']] as const).map(([group, title], gi) => (
                  <div key={group}>
                    {gi > 0 && <div className="pop-sep" />}
                    <p className="pop-label">{title}</p>
                    {props.examples
                      .filter((e) => e.group === group)
                      .map((e) => (
                        <button
                          key={e.id}
                          role="menuitemradio"
                          aria-checked={e.query === props.currentQuery}
                          className={`pop-item${e.hint ? ' pop-item--hint' : ''}${e.query === props.currentQuery ? ' is-on' : ''}`}
                          onClick={() => {
                            props.onPick(e);
                            setOpen(false);
                          }}
                        >
                          <span className="pop-name">{e.label}</span>
                          {e.hint && (
                            <>
                              {' '}
                              <span className="pop-hint">{e.hint}</span>
                            </>
                          )}
                        </button>
                      ))}
                  </div>
                ))}
                <div className="pop-sep" />
                <p className="pop-state">{props.stateLine}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}

export function Toast({ toast }: { toast: { text: string; n: number } | null }) {
  return (
    <div className="toast-wrap" role="status" aria-live="polite">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.n}
            className="toast"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          >
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function StateTag({ line }: { line: string }) {
  return (
    <p className="state-tag" aria-hidden="true">
      {line}
    </p>
  );
}
