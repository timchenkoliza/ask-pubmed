import type { Params, ShapeSpec, SpanKind, StudyType } from '../data/types';
import type { Phase } from '../state/machine';

/* Геометрия Evidence Shape: SVG рисуется в системе 800 × 800,
   слой формы позиционируется в контейнере по `shapeGeom`. */

export type ShapeMode = 'ambient' | 'assemble' | 'search' | 'calm';
export type GeomKind = 'front' | 'calm';

export interface Geom { cx: number; cy: number; size: number; scale: number }

export function modeFor(phase: Phase): ShapeMode {
  switch (phase) {
    case 'idle':
    case 'query-entered':
    case 'ambiguous-term':
      return 'ambient';
    case 'semantic-parsing':
    case 'wrong-source':
      return 'assemble';
    case 'searching':
      return 'search';
    default:
      return 'calm';
  }
}

export const geomKindFor = (phase: Phase): GeomKind =>
  phase === 'result' || phase === 'search-details-open' || phase === 'parameter-edited' || phase === 'results-updated' || phase === 'too-narrow' || phase === 'not-understood'
    ? 'calm'
    : 'front';

export function shapeGeom(w: number, h: number, mobile: boolean, kind: GeomKind, shiftX = 0): Geom {
  if (mobile) {
    const size = Math.min(w * 1.55, h * 0.66, 660);
    return kind === 'front'
      ? { cx: w / 2, cy: h * 0.29, size, scale: 1 }
      : { cx: w / 2, cy: h * 0.16, size, scale: 1.22 };
  }
  const size = Math.min(h * 1.02, 900, w * 0.92);
  return kind === 'front'
    ? { cx: w / 2 + shiftX, cy: h * 0.33, size, scale: 1 }
    : { cx: w / 2 + shiftX, cy: h * 0.25, size, scale: 1.16 };
}

/* ─── Орбита ограничений ─── */

export type OrbitKind = StudyType | 'period' | 'fulltext';
export interface OrbitDot { key: string; kind: OrbitKind; x: number; y: number; size: number }

const SLOT: Record<OrbitKind, number> = { sr: 0, ma: 1, rct: 2, cohort: 3, period: 4, fulltext: 5 };
/** Радиус орбиты растёт с периодом: чем шире период, тем дальше точка. */
const periodR = (p: number | null): number => (p === null ? 1.2 : p <= 5 ? 0.72 + 0.056 * p : Math.min(1.14, 1 + 0.02 * (p - 5)));

export function orbitDots(params: Params | null, base: number): OrbitDot[] {
  const kinds: OrbitKind[] = [];
  if (!params) {
    kinds.push('sr', 'ma', 'rct', 'period', 'fulltext');
  } else {
    (['sr', 'ma', 'rct', 'cohort'] as StudyType[]).forEach((t) => params.types.includes(t) && kinds.push(t));
    if (params.period !== null) kinds.push('period');
    if (params.fullTextOnly) kinds.push('fulltext');
  }
  const r = 288 * (params ? periodR(params.period) : 1);
  return kinds.map((kind) => {
    const a = ((base + SLOT[kind] * 58) * Math.PI) / 180;
    return {
      key: kind,
      kind,
      x: 400 + r * Math.cos(a),
      y: 400 + r * Math.sin(a) * 0.9,
      size: kind === 'period' ? 11 : kind === 'ma' ? 9 : 8,
    };
  });
}

/* Куда летят «семена» из слов запроса. */
export function anchorFor(kind: SpanKind, spec: ShapeSpec, orbit: OrbitDot[], used: { n: number }): { x: number; y: number } {
  const first = (tones: string[]) => spec.masses.find((m) => tones.includes(m.tone));
  switch (kind) {
    case 'condition': {
      const m = first(['cold', 'lilac']) ?? spec.masses[0];
      return { x: m.x, y: m.y };
    }
    case 'exposure': {
      const m = first(['warm', 'inner']) ?? spec.masses[spec.masses.length - 1];
      return { x: m.x, y: m.y };
    }
    case 'outcome': {
      if (spec.glow) return { x: spec.glow.x, y: spec.glow.y };
      if (spec.nodes?.length) return { x: spec.nodes[0].x, y: spec.nodes[0].y };
      return { x: 400, y: 400 };
    }
    case 'must': {
      if (spec.ring) return { x: spec.ring.x, y: spec.ring.y };
      return { x: 400, y: 400 };
    }
    case 'constraint': {
      const d = orbit[used.n % Math.max(1, orbit.length)] ?? { x: 400, y: 120 };
      used.n += 1;
      return { x: d.x, y: d.y };
    }
  }
}

export const toContainer = (g: Geom, p: { x: number; y: number }) => ({
  x: g.cx + ((p.x - 400) / 800) * g.size * g.scale,
  y: g.cy + ((p.y - 400) / 800) * g.size * g.scale,
});
