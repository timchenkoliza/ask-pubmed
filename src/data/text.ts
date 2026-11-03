import type { BodySection, Pub } from './types';

/** Текст статьи по разделам. У публикаций без полного текста его нет.
    Для демо-публикаций без написанного вручную текста собираем нейтральный каркас из abstract. */
export function bodyOf(pub: Pub): BodySection[] | null {
  if (pub.fullTextState !== 'pmc-full-text') return null;
  if (pub.body) return pub.body;
  const topic = pub.mesh.slice(0, 2).join(' and ').toLowerCase();
  const first = pub.abstract.split(/(?<=\.)\s+/)[0] ?? pub.abstract;
  return [
    { title: 'Введение', text: `This article addresses ${topic}. The authors describe the clinical setting and the question they set out to answer.` },
    { title: 'Методы', text: `The authors describe the sources, the selection of studies and the data extracted for ${(pub.mesh[0] ?? 'the topic').toLowerCase()}.` },
    { title: 'Результаты', text: pub.fragment ?? first },
    { title: 'Обсуждение', text: 'Definitions, populations and settings differed between the included reports, and the authors discuss how this affects comparison.' },
  ];
}
