import { Dispatch } from 'react';
import { effTypes } from '../data/match';
import type { Params, Scenario, SearchResponse } from '../data/types';
import type { Action } from '../state/machine';
import { lastPeriod, plural, withinPeriod } from '../lib/typo';

/* Что делать, когда публикаций нет. Один блок на пустом экране и в панели «Как искали»:
   причина названа словами, а каждое предложение проверено тестовым поиском (число публикаций настоящее). */

const pubs = (n: number) => `${n} ${plural(n, 'публикация', 'публикации', 'публикаций')}`;

/** Заголовок пустого экрана: коротко и по делу, без точки. */
export function zeroTitle(response: SearchResponse | null): string {
  const b = response?.blocker;
  if (b?.kind === 'concept') return `По значению «${b.label}» публикаций не нашли`;
  return 'С такими условиями публикаций не нашли';
}

/** Причина нуля одним-двумя предложениями. Что мешает, что это значит и что с этим делать. */
export function zeroReason(sc: Scenario, params: Params, response: SearchResponse): string {
  const b = response.blocker;
  const r = response.relax;
  if (b?.kind === 'concept') {
    const alt = response.alternatives.length > 0;
    return `Фильтры тут ни при чём: с этим значением публикаций нет при любых периоде, типах и полном тексте. ${alt ? 'Выберите другое значение термина, и поиск пойдёт заново' : 'Попробуйте переформулировать запрос'}`;
  }
  if (b?.kind === 'period' && r?.kind === 'period') {
    const now = params.period ? lastPeriod(params.period).toLowerCase() : 'выбранный период';
    return `Мешает период: ${now}. Если искать ${r.to === null ? 'за всё время' : withinPeriod(r.to)}, нашлось бы ${pubs(r.count)}`;
  }
  if (b?.kind === 'fulltext' && r) return `Мешает условие «только с полным текстом». Без него нашлось бы ${pubs(r.count)}`;
  if (b?.kind === 'types' && r) return `Мешает выбор типов исследований. По всем типам нашлось бы ${pubs(r.count)}`;
  if (b?.kind === 'filters' && r) {
    const on: string[] = [];
    if (params.period !== null) on.push(`период (${withinPeriod(params.period)})`);
    if (params.types.length > 0 && effTypes(params).length < 4) on.push('типы исследований');
    if (params.fullTextOnly) on.push('полный текст');
    return `Каждое условие по отдельности что-то оставляет, но вместе они исключают всё: ${on.join(', ')}. Без них нашлось бы ${pubs(r.count)}`;
  }
  void sc;
  return 'Ни одно ослабление условий не помогает: в этой теме публикаций под такой запрос нет. Измените запрос';
}

export function ZeroHelp({
  sc,
  params,
  response,
  dispatch,
  tone,
  showReason = true,
}: {
  sc: Scenario;
  params: Params;
  response: SearchResponse;
  dispatch: Dispatch<Action>;
  /** dark: пустой экран на тёмной сцене; light: панель «Как искали». */
  tone: 'dark' | 'light';
  showReason?: boolean;
}) {
  const relax = response.relax;
  const alts = response.alternatives;
  const ghost = tone === 'dark' ? 'btn btn-ghost' : 'btn btn-ghost-light';
  return (
    <div className={`zero zero--${tone}`} data-blocker={response.blocker?.kind ?? 'none'}>
      {showReason && <p className="zero-why">{zeroReason(sc, params, response)}</p>}
      {(relax || alts.length > 0) && (
        <div className="zero-acts">
          {relax && (
            <button className="btn btn-primary" onClick={() => dispatch({ t: 'relax' })}>
              {relax.label}{' '}
              <span className="zero-n">нашлось бы {relax.count}</span>
            </button>
          )}
          {alts.length > 0 && (
            <div className="zero-alts" role="group" aria-label="Другое значение термина">
              {alts.map((a, i) => (
                <button key={a.id} className={i === 0 && !relax ? 'btn btn-primary' : ghost} onClick={() => dispatch({ t: 'set-meaning', id: a.id })}>
                  {a.label}{' '}
                  <span className="zero-n">{a.hint}, {pubs(a.count)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
