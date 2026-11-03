import { lcFirst } from '../lib/typo';
import { firstSentence } from './translations';
import type { BodySection, Pub } from './types';

/** Текст статьи по разделам. У публикаций без полного текста его нет.
    Для демо-публикаций без написанного вручную текста собираем нейтральный каркас из abstract: на английском и на русском. */
export function bodyOf(pub: Pub): BodySection[] | null {
  if (pub.fullTextState !== 'pmc-full-text') return null;
  if (pub.body) return pub.body;
  const topic = pub.mesh.slice(0, 2).join(' and ').toLowerCase();
  const first = pub.abstract.split(/(?<=\.)\s+/)[0] ?? pub.abstract;
  const topicRu = lcFirst(pub.titleRu.split(':')[0].trim());
  const resultsRu = pub.fragmentRu ?? (pub.abstractRu ? firstSentence(pub.abstractRu) : undefined);
  const hasRu = !!pub.abstractRu;
  return [
    {
      title: 'Введение',
      text: `This article addresses ${topic}. The authors describe the clinical setting and the question they set out to answer.`,
      textRu: hasRu ? `Статья посвящена теме: ${topicRu}. Авторы описывают клиническую ситуацию и вопрос, на который искали ответ.` : undefined,
    },
    {
      title: 'Методы',
      text: `The authors describe the sources, the selection of studies and the data extracted for ${(pub.mesh[0] ?? 'the topic').toLowerCase()}.`,
      textRu: hasRu ? 'Авторы описывают источники, отбор исследований и данные, которые из них извлекали.' : undefined,
    },
    { title: 'Результаты', text: pub.fragment ?? first, textRu: resultsRu },
    {
      title: 'Обсуждение',
      text: 'Definitions, populations and settings differed between the included reports, and the authors discuss how this affects comparison.',
      textRu: hasRu ? 'Определения, популяции и условия различались между включёнными работами, и авторы обсуждают, как это влияет на сравнение.' : undefined,
    },
  ];
}
