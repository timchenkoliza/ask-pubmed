/* Композиция сцены под тип выдачи. Evidence Shape не одна и та же клякса на каждом экране:
   это пространственная метафора. Объекты доказательств перестраиваются между композициями
   пружиной, поэтому смена представления выглядит как движение, а не как смена экрана.
   Координаты в системе формы 800 × 800. */

export type SceneKind = 'none' | 'explore' | 'compact' | 'grouped' | 'compare' | 'quotes' | 'publication' | 'clarify' | 'empty' | 'synthesis';

export interface Composition {
  kind: SceneKind;
  /** Число объектов: публикации в сетке и компактном виде, строки текста в цитатах. */
  n: number;
  /** Размеры кластеров: группы доски или аспекты синтеза. */
  groups: number[];
  direct: number;
  onlyA: number;
  onlyB: number;
  /** Число найденных цитат: подсвеченные строки. */
  hot: number;
  /** Число вариантов уточнения. */
  options: number;
  /** Кластеры синтеза сведены вместе (исследование запущено). */
  merged: boolean;
}

export const NO_COMPOSITION: Composition = { kind: 'none', n: 0, groups: [], direct: 0, onlyA: 0, onlyB: 0, hot: 0, options: 0, merged: false };

export interface Dot { x: number; y: number; w: number; h: number; o: number; c: string; r?: number }
export interface Disc { x: number; y: number; r: number; o: number; tone: string }
export interface Link { x1: number; y1: number; x2: number; y2: number; o: number }
export interface Clone { x: number; y: number; s: number; o: number }
export interface Targets {
  dots: Dot[];
  discs: Disc[];
  links: Link[];
  clones: Clone[];
  mass: { x: number; y: number; s: number; r: number; o: number };
  orbitO: number;
}

export const N_DOTS = 16;
export const N_DISCS = 4;
export const N_LINKS = 12;
export const N_CLONES = 3;

const ICE = '#d9d8ff';
const COLD = '#8f91ff';
const LIL = '#bdbcff';
const WARM = '#ffa36b';
const YEL = '#ffd25e';
const TONES = [COLD, WARM, LIL, YEL];
const DISC_TONES = ['cold', 'warm', 'lilac', 'warm2'];

const frac = (v: number) => v - Math.floor(v);
const rnd = (i: number, k = 1) => frac(Math.sin(i * 127.1 + k * 311.7) * 43758.5453);

/** Место, где объект «живёт», когда он не нужен: из него он вырастает. */
function home(i: number): { x: number; y: number } {
  const t = i * 2.399963 + 0.4;
  const f = Math.sqrt((i + 0.6) / 12);
  return { x: 400 + Math.cos(t) * (70 + 250 * f) * 1.08, y: 400 + Math.sin(t) * (60 + 215 * f) * 0.9 };
}

const hiddenDot = (i: number): Dot => ({ ...home(i), w: 0, h: 0, o: 0, c: ICE });
const hiddenDisc = (i: number): Disc => ({ x: [250, 560, 290, 580][i], y: [310, 300, 570, 560][i], r: 0, o: 0, tone: DISC_TONES[i] });
const hiddenLink = (): Link => ({ x1: 400, y1: 400, x2: 400, y2: 400, o: 0 });

const dot = (x: number, y: number, size: number, o: number, c: string, h = size, r?: number): Dot => ({ x, y, w: size, h, o, c, r });

export function compose(c: Composition, mobile: boolean): Targets {
  const dots: Dot[] = Array.from({ length: N_DOTS }, (_, i) => hiddenDot(i));
  const discs: Disc[] = Array.from({ length: N_DISCS }, (_, i) => hiddenDisc(i));
  const links: Link[] = Array.from({ length: N_LINKS }, hiddenLink);
  const clones: Clone[] = Array.from({ length: N_CLONES }, () => ({ x: 0, y: 0, s: 1, o: 0 }));
  let mass = { x: 0, y: 0, s: 1, r: 0, o: 1 };
  let orbitO = 1;

  switch (c.kind) {
    case 'explore': {
      /* Несколько независимых объектов свободно распределены по полю. */
      const n = Math.min(c.n, N_DOTS);
      for (let i = 0; i < n; i++) {
        const p = home(i);
        dots[i] = dot(p.x, p.y, 14 + (i % 3) * 3, 0.9, i % 3 === 0 ? COLD : ICE, 19 + (i % 3) * 4, 3);
      }
      mass = { x: 0, y: 0, s: 0.82, r: -6, o: 0.55 };
      orbitO = 0.55;
      break;
    }
    case 'compact': {
      /* Тесный ряд: каждая публикация — одна строка. */
      const n = Math.min(c.n, N_DOTS);
      for (let i = 0; i < n; i++) {
        dots[i] = dot(400 + ((i * 29) % 5 - 2) * 8, 250 + i * (300 / Math.max(n, 2)), 120 + ((i * 41) % 4) * 36, 0.6, ICE, 11);
      }
      mass = { x: 0, y: 0, s: 0.7, r: 0, o: 0.32 };
      orbitO = 0.4;
      break;
    }
    case 'grouped': {
      /* Объекты притягиваются в кластеры: по одному на группу доски. */
      const centers = [[250, 330], [570, 310], [290, 570], [590, 560]];
      let d = 0;
      c.groups.slice(0, 4).forEach((g, k) => {
        const [cx, cy] = centers[k];
        discs[k] = { x: cx, y: cy, r: 64 + 11 * Math.min(g, 6), o: 0.6, tone: DISC_TONES[k] };
        for (let j = 0; j < Math.min(g, 6) && d < N_DOTS; j++, d++) {
          const a = j * 2.4 + k;
          const r = 20 + 17 * Math.sqrt(j);
          dots[d] = dot(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 15, 0.95, TONES[k]);
        }
      });
      mass = { x: 0, y: 0, s: 0.6, r: 0, o: 0.22 };
      orbitO = 0.4;
      break;
    }
    case 'compare': {
      /* Два крупных притягивателя A и B, публикации с обоими объектами между ними. */
      discs[0] = { x: 175, y: 410, r: 158, o: 0.9, tone: 'warm' };
      discs[1] = { x: 625, y: 410, r: 158, o: 0.9, tone: 'lilac' };
      const m = Math.min(c.direct, 8);
      for (let j = 0; j < m; j++) {
        const x = 300 + (200 * (j + 0.5)) / Math.max(m, 1);
        const y = 400 + Math.sin(j * 1.9) * 46;
        dots[j] = dot(x, y, 20, 1, YEL);
        if (j < 6) {
          links[j * 2] = { x1: 175, y1: 410, x2: x, y2: y, o: 0.3 };
          links[j * 2 + 1] = { x1: 625, y1: 410, x2: x, y2: y, o: 0.3 };
        }
      }
      let d = m;
      for (let j = 0; j < Math.min(c.onlyA, 3) && d < N_DOTS; j++, d++) dots[d] = dot(120 + rnd(j, 2) * 110, 330 + j * 62, 12, 0.9, WARM);
      for (let j = 0; j < Math.min(c.onlyB, 3) && d < N_DOTS; j++, d++) dots[d] = dot(580 + rnd(j, 3) * 110, 330 + j * 62, 12, 0.9, LIL);
      mass = { x: 0, y: 0, s: 0.74, r: 0, o: 0.26 };
      orbitO = 0.3;
      break;
    }
    case 'quotes': {
      /* Публикация распадается на строки текста; найденные фрагменты подсвечены. */
      const rows = 14;
      const hot = new Set<number>();
      const q = Math.min(Math.max(c.hot, 1), rows);
      for (let k = 0; k < q; k++) hot.add(Math.round(((k + 0.5) * rows) / q - 0.5));
      for (let i = 0; i < rows; i++) {
        const on = hot.has(i);
        const w = 150 + ((i * 53) % 7) * 34;
        dots[i] = dot(400 + ((i * 37) % 5 - 2) * 20, 238 + i * 23, w, on ? 1 : 0.26, on ? YEL : ICE, on ? 13 : 9);
      }
      mass = { x: 0, y: 0, s: 0.46, r: 0, o: 0.12 };
      orbitO = 0.25;
      break;
    }
    case 'publication': {
      mass = { x: 0, y: 0, s: 0.92, r: 0, o: 0.5 };
      orbitO = 0.35;
      break;
    }
    case 'clarify': {
      /* Одна форма разделяется на два-три возможных значения. */
      const n = Math.min(Math.max(c.options, 2), N_CLONES);
      for (let i = 0; i < n; i++) clones[i] = { x: (i - (n - 1) / 2) * 232, y: 28, s: 0.46, o: 1 };
      mass = { x: 0, y: 0, s: 1, r: 0, o: 0 };
      orbitO = 0;
      break;
    }
    case 'empty': {
      /* Собранная композиция распадается: осколки уходят к краю и бледнеют. */
      for (let i = 0; i < 12; i++) {
        const a = i * 2.4 + 1;
        const r = 250 + (i % 4) * 32;
        dots[i] = dot(400 + Math.cos(a) * r * 1.1, 400 + Math.sin(a) * r * 0.9, 6 + (i % 3) * 3, 0.42, ICE);
      }
      mass = { x: 0, y: 24, s: 0.56, r: 16, o: 0.3 };
      orbitO = 0.25;
      break;
    }
    case 'synthesis': {
      /* Несколько кластеров существуют отдельно и ещё не сведены в вывод. */
      const apart = [[240, 320], [560, 310], [260, 570], [570, 560]];
      const near = [[345, 380], [455, 380], [345, 480], [455, 480]];
      const centers = c.merged ? near : apart;
      let d = 0;
      c.groups.slice(0, 4).forEach((g, k) => {
        const [cx, cy] = centers[k];
        discs[k] = { x: cx, y: cy, r: c.merged ? 56 : 74, o: 0.55, tone: DISC_TONES[k] };
        for (let j = 0; j < Math.min(g, 4) && d < N_DOTS; j++, d++) {
          const a = j * 2.2 + k * 0.7;
          const r = 16 + 15 * Math.sqrt(j);
          dots[d] = dot(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 14, 0.95, TONES[k]);
        }
      });
      if (c.merged) {
        const k = Math.min(c.groups.length, 4);
        for (let i = 0; i < k; i++) {
          const [x1, y1] = centers[i];
          const [x2, y2] = centers[(i + 1) % k];
          if (k > 1) links[i] = { x1, y1, x2, y2, o: 0.55 };
        }
      }
      mass = { x: 0, y: 0, s: 0.6, r: 0, o: 0.18 };
      orbitO = 0.3;
      break;
    }
    case 'none':
      break;
  }

  if (mobile) {
    const sx = 0.62;
    const X = (x: number) => 400 + (x - 400) * sx;
    dots.forEach((d) => {
      d.x = X(d.x);
      d.w *= 0.85;
    });
    discs.forEach((d) => {
      d.x = X(d.x);
      d.r *= 0.8;
    });
    links.forEach((l) => {
      l.x1 = X(l.x1);
      l.x2 = X(l.x2);
    });
    clones.forEach((cl) => {
      cl.x *= 0.5;
      cl.s *= 0.85;
    });
  }

  return { dots, discs, links, clones, mass, orbitO };
}
