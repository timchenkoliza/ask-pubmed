import { createContext, useContext } from 'react';
import type { Params, Scenario, SearchResponse } from '../data/types';

/* Текущая выдача для карточек: из неё «Почему здесь» берёт происхождение публикации. */
export interface ResultCtxValue { response: SearchResponse; params: Params; sc: Scenario }
export const ResultCtx = createContext<ResultCtxValue | null>(null);
export const useResultCtx = () => useContext(ResultCtx);
