import { searchSync } from '../data/backend';
import { SCENARIO_MAP } from '../data/scenarios';
import type { Params, Scenario, SearchResponse } from '../data/types';
import { State, initialState, intentOf, paramsOf, reducer, viewOf } from '../state/machine';

/* Готовая выдача для превью на главной.
   Это тот же путь, что и у настоящего запроса: route → inferParams → pipeline → reducer.
   Ничего не нарисовано отдельно, превью показывает экран, который врач получит после «Найти». */

export interface Preview {
  state: State;
  sc: Scenario;
  params: Params;
  response: SearchResponse;
  intent: ReturnType<typeof intentOf>;
  view: ReturnType<typeof viewOf>;
}

const cache = new Map<string, Preview | null>();

export function previewFor(query: string): Preview | null {
  if (cache.has(query)) return cache.get(query)!;
  let out: Preview | null = null;
  try {
    let s = reducer({ ...initialState }, { t: 'load', query });
    s = reducer(s, { t: 'parsed' });
    if (s.phase === 'searching' && s.scenarioId) {
      const sc = SCENARIO_MAP[s.scenarioId];
      const response = searchSync({ scenario: sc, params: paramsOf(s, sc.id), ambiguityId: s.ambiguityId, query: s.plan ?? undefined, sort: s.sort });
      s = reducer(s, { t: 'searched', response, reqId: s.reqId });
      /* Экран показан «повторно»: карточки не выезжают, подсказка про встряску не мешает. */
      s = { ...s, returning: true, hintSeen: true, onboarding: false };
      if (s.response && (s.phase === 'result' || s.phase === 'too-narrow')) {
        out = { state: s, sc, params: paramsOf(s, sc.id), response: s.response, intent: intentOf(s), view: viewOf(s) };
      }
    }
  } catch {
    out = null;
  }
  cache.set(query, out);
  return out;
}
