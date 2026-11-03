import type { ResultIntent, Scenario, SearchResponse, ViewId } from '../data/types';
import { NO_COMPOSITION, Composition } from './compose';
import { aspectGroups, groupBy, quoteBoard, splitComparison } from './groups';
import type { State } from '../state/machine';

/* Что должна изображать сцена: тип выдачи и представление превращаются в композицию объектов. */

const base = (c: Partial<Composition>): Composition => ({ ...NO_COMPOSITION, ...c });

export function sceneFor(intent: ResultIntent, view: ViewId, state: State, sc: Scenario | null, response: SearchResponse | null, pubOpen: boolean): Composition {
  if (intent === 'clarify') return base({ kind: 'clarify', options: state.askChoices?.length ?? 3 });
  if (intent === 'empty') return base({ kind: 'empty' });
  if (!sc || !response) return NO_COMPOSITION;
  const items = response.items;
  if (pubOpen || intent === 'single-publication' || view === 'publication') return base({ kind: 'publication', n: 1 });

  switch (view) {
    case 'grid':
      return base({ kind: 'explore', n: items.length });
    case 'compact':
      return base({ kind: 'compact', n: items.length });
    case 'grouped': {
      const groups = groupBy(items, state.grouping ?? state.plan?.grouping ?? 'publicationType', sc, state.plan?.priority).map((g) => g.items.length);
      return base({ kind: 'grouped', n: items.length, groups });
    }
    case 'comparison': {
      const cmp = splitComparison(items, sc);
      return base({ kind: 'compare', direct: cmp?.together.length ?? 0, onlyA: cmp?.onlyA.length ?? 0, onlyB: cmp?.onlyB.length ?? 0 });
    }
    case 'quotes': {
      const b = quoteBoard(items, sc);
      return base({ kind: 'quotes', n: b.pubs, hot: b.total });
    }
    case 'evidence':
      return base({ kind: 'synthesis', groups: aspectGroups(items, sc).map((g) => g.items.length), merged: state.drStarted });
    default:
      return NO_COMPOSITION;
  }
}
