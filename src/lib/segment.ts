import type { SpanKind, SpanSpec } from '../data/types';

export interface Seg { text: string; kind: SpanKind | null }

/** Делит запрос на куски: смысловые части из сценария и обычный текст между ними. */
export function segmentQuery(query: string, spans: SpanSpec[]): Seg[] {
  const lower = query.toLowerCase();
  const hits: { start: number; end: number; kind: SpanKind }[] = [];
  for (const s of spans) {
    const i = lower.indexOf(s.text.toLowerCase());
    if (i >= 0) hits.push({ start: i, end: i + s.text.length, kind: s.kind });
  }
  hits.sort((a, b) => a.start - b.start);
  const clean: typeof hits = [];
  let last = 0;
  for (const h of hits) {
    if (h.start >= last) {
      clean.push(h);
      last = h.end;
    }
  }
  const out: Seg[] = [];
  let pos = 0;
  for (const h of clean) {
    if (h.start > pos) out.push({ text: query.slice(pos, h.start), kind: null });
    out.push({ text: query.slice(h.start, h.end), kind: h.kind });
    pos = h.end;
  }
  if (pos < query.length) out.push({ text: query.slice(pos), kind: null });
  return out;
}
