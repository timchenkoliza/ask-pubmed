import { RefObject, useEffect, useRef, useState } from 'react';

export type LayoutMode = 'mobile' | 'tablet' | 'desktop';

export const layoutOf = (w: number): LayoutMode => (w <= 640 ? 'mobile' : w < 1240 ? 'tablet' : 'desktop');

export function useViewport() {
  const read = () => ({ w: window.innerWidth, h: window.innerHeight });
  const [v, set] = useState(read);
  useEffect(() => {
    const on = () => set(read());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return v;
}

export function useEscape(cb: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const on = (e: KeyboardEvent) => e.key === 'Escape' && cb();
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [cb, active]);
}

export function useOutside(ref: RefObject<HTMLElement>, cb: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const on = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) cb();
    };
    window.addEventListener('pointerdown', on);
    return () => window.removeEventListener('pointerdown', on);
  }, [ref, cb, active]);
}

/** Копирование с запасным вариантом: выделяем текст, если буфер недоступен. */
export async function copyText(text: string, fallbackEl?: HTMLElement | null): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      if (fallbackEl) {
        const sel = window.getSelection();
        const r = document.createRange();
        r.selectNodeContents(fallbackEl);
        sel?.removeAllRanges();
        sel?.addRange(r);
      }
    } catch {
      /* без выделения */
    }
    return false;
  }
}

/** Сенсорный экран: перевод заголовка делаем свайпом, а не наведением. */
export function useCoarse(): boolean {
  const [v] = useState(() => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(pointer: coarse)').matches : false));
  return v;
}

/** Жест «встряхнуть» мышью: зажать кнопку и быстро поводить из стороны в сторону
    (три смены направления за 0,9 с). На сенсорных экранах работает подсказка и датчики. */
export function useShakeGesture(onShake: () => void, enabled: boolean) {
  const cb = useRef(onShake);
  cb.current = onShake;
  useEffect(() => {
    if (!enabled) return;
    let down = false;
    let st = { last: 0, dir: 0, turn: 0, stamps: [] as number[], fired: false, moved: 0 };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || e.button !== 0) return;
      if ((e.target as HTMLElement | null)?.closest('input,textarea,select,[contenteditable],.sheet,.pop')) return;
      down = true;
      st = { last: e.clientX, dir: 0, turn: e.clientX, stamps: [], fired: false, moved: 0 };
    };
    const onMove = (e: PointerEvent) => {
      if (!down) return;
      const d = e.clientX - st.last;
      if (Math.abs(d) < 2) return;
      st.moved += Math.abs(d);
      const nd = Math.sign(d);
      const now = performance.now();
      if (st.dir === 0) {
        st.dir = nd;
        st.turn = st.last;
      } else if (nd !== st.dir) {
        if (Math.abs(st.last - st.turn) >= 18) st.stamps.push(now);
        st.dir = nd;
        st.turn = st.last;
      }
      st.last = e.clientX;
      st.stamps = st.stamps.filter((t) => now - t < 900);
      if (!st.fired && st.stamps.length >= 3) {
        st.fired = true;
        cb.current();
      }
    };
    const onUp = () => {
      if (down && (st.fired || st.moved > 10)) {
        // Движение мышью не должно открыть карточку, на которой закончилось.
        const stop = (ev: Event) => {
          ev.stopPropagation();
          ev.preventDefault();
        };
        window.addEventListener('click', stop, { capture: true, once: true });
        setTimeout(() => window.removeEventListener('click', stop, true), 0);
      }
      down = false;
    };
    /* Браузер может начать перетаскивание выделенного текста или кнопки и оборвать жест. */
    const onDrag = (e: Event) => {
      if (down) e.preventDefault();
    };
    window.addEventListener('dragstart', onDrag, true);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('dragstart', onDrag, true);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [enabled]);
}
