import { Dispatch } from 'react';
import type { Action, State, Surface } from '../state/machine';

/* Один тред, три режима. Полоса показывает, где врач сейчас, и даёт перейти в любой режим в один клик.
   Переходы только по нажатию: поиск не превращается в ПБЗ или Deep Research сам. */

const MODES: { id: Surface; name: string }[] = [
  { id: 'agent', name: 'Спросить PubMed' },
  { id: 'pbz', name: 'ПБЗ' },
  { id: 'dr', name: 'Deep Research' },
];

export function ModeBar({ state, dispatch }: { state: State; dispatch: Dispatch<Action> }) {
  return (
    <nav className="modebar" aria-label="Режим работы в этом чате">
      {MODES.map((m) => {
        const on = state.surface === m.id;
        const seen = state.visited.includes(m.id);
        return (
          <button
            key={m.id}
            type="button"
            className={`modebar-btn${on ? ' is-on' : ''}${seen ? ' is-seen' : ''}`}
            aria-current={on ? 'page' : undefined}
            onClick={() => !on && dispatch({ t: 'to-surface', to: m.id })}
          >
            {m.name}
          </button>
        );
      })}
    </nav>
  );
}
