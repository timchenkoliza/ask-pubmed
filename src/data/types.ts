// Типы слоя данных. Всё, что помечено `demo: true`, подставное и заменяется ответом PubMed API:
// интерфейс читает только эти типы и ничего не знает об источнике.

export type StudyType = 'sr' | 'ma' | 'rct' | 'cohort';
/** Период в годах; null: любой. Врач может написать «за 2 года», поэтому не только 1/3/5/10. */
export type Period = number | null;
export type ScenarioId = 'cardio' | 'gp' | 'peds' | 'ob' | 'endo';

/* ─────────────────────────────────────────────────────────────────────────────
   Продуктовый слой. Пять разных перечислений, они не смешиваются:
   Job (что врач хочет) → Strategy (как искали) → ResultState (что получилось)
   → Renderer (какой экран) → дальнейшее действие.
   ───────────────────────────────────────────────────────────────────────────── */

/** Задача врача. */
export type Job =
  | 'literature-search'
  | 'comparison-search'
  | 'known-publication'
  | 'find-in-text'
  | 'synthesis-request'
  | 'clarification-required';

/** Вариант поискового запроса. */
export type Strategy = 'exact' | 'broad' | 'fallback';

/** Состояние результата. `fallback-results` добавлен к списку из брифа: это явный случай «нашли только без желательных условий». */
export type ResultState =
  | 'exact-results'
  | 'broadened-results'
  | 'fallback-results'
  | 'zero-results'
  | 'ambiguous-query'
  | 'full-text-available'
  | 'abstract-only'
  | 'publisher-only'
  | 'known-publication-found'
  | 'known-publication-not-found';

/** Экран. Совпадает с ViewId: grid/compact — список, recovery — пустой результат, evidence — передача в Deep Research. */
export type Renderer = ViewId;

export type SortMode = 'relevance' | 'newest';

/** Вес условия в запросе. SEARCH_EXPANSION ставит система сама (синонимы, MeSH-расширение): врач его не писал. */
export type ConstraintKind = 'REQUIRED' | 'PREFERRED' | 'SEARCH_EXPANSION';

/** Что доступно по тексту публикации. */
export type FullTextState = 'pmc-full-text' | 'abstract-only' | 'publisher-link' | 'pmc-embargoed' | 'metadata-only';

/* ─────────────────────────────────────────────────────────────────────────────
   Экранное семейство (для CSS, сцены и геометрии). Выводится из Job и состояния,
   сама по себе ничего не решает.
   ───────────────────────────────────────────────────────────────────────────── */
export type ResultIntent = 'explore' | 'compare' | 'single-publication' | 'find-in-text' | 'clarify' | 'empty' | 'synthesis';

/** Допустимые представления одного и того же корпуса. */
export type ViewId = 'grid' | 'grouped' | 'compact' | 'comparison' | 'publication' | 'quotes' | 'clarification' | 'recovery' | 'evidence';
export type ExploreView = 'grid' | 'grouped' | 'compact';
export type Grouping = 'publicationType' | 'year' | 'fullText' | 'mesh';

export type ConceptRole = 'condition' | 'exposure' | 'intervention' | 'outcome' | 'focus' | 'must' | 'quote';
export type SpanKind = 'condition' | 'exposure' | 'outcome' | 'constraint' | 'must';

export interface Concept {
  id: string;
  role: ConceptRole;
  /** Формулировка для врача. */
  label: string;
  /** Короткая подпись при раскрытии, если нужна. */
  hint?: string;
  /** Как термин сопоставлен в PubMed: показывается только по hover / tap. */
  mapped: string;
  /** MeSH и Pharmacological Action: точное сопоставление (Exact). */
  mesh?: string[];
  pa?: string[];
  /** Свободные слова и синонимы для Title/Abstract: это SEARCH_EXPANSION, их добавляет система (Broad). */
  tiab: string[];
  active: boolean;
  /** Обязательное условие: снимается только после подтверждения. */
  required?: boolean;
  /** Можно добавить или убрать без пересборки. */
  optional?: boolean;
  /** Во сколько раз сужается выдача, когда параметр включён (demo). */
  factor?: number;
  /** Вес условия. Если не задан: REQUIRED, для исходов — PREFERRED. */
  kind?: ConstraintKind;
  /** Понятия одной группы объединяются через OR (например, несколько исходов). */
  group?: string;
  /** Условие проверяется по флагу публикации (упоминание в тексте), а не по Title/Abstract. */
  flag?: 'mentionsGBS';
  /** Точный поиск идёт только по MeSH: свежие публикации без индексации находит лишь расширенный поиск. */
  meshOnly?: boolean;
}

export interface Params {
  concepts: Concept[];
  /** Допустимые типы исследований: всегда REQUIRED. */
  types: StudyType[];
  /** Типы «в приоритете»: PREFERRED, входят в Exact и Broad, снимаются в Fallback. */
  preferTypes: StudyType[];
  period: Period;
  /** Вес периода по формулировке: «за последние 5 лет» — REQUIRED, «желательно свежие» — PREFERRED. */
  periodKind: 'REQUIRED' | 'PREFERRED';
  fullTextOnly: boolean;
  fullTextKind: 'REQUIRED' | 'PREFERRED';
  humans: boolean;
}

/** Точная цитата. Для abstract-цитаты текст обязан входить в `abstract` публикации. */
export interface PubQuote {
  id: string;
  text: string;
  textRu: string;
  /** Раздел статьи на русском: «Результаты», «Обсуждение» и так далее. */
  section: string;
  source: 'abstract' | 'fulltext';
  /** Исход (id аспекта сценария), по которому цитаты собираются на доске. */
  group: string;
}

export interface BodySection {
  title: string;
  text: string;
  /** Перевод раздела на русский. Без него в режиме «Перевод» показываем оригинал и говорим об этом. */
  textRu?: string;
}

export interface Pub {
  id: string;
  demo: true;
  title: string;
  titleRu: string;
  journal: string;
  year: number;
  type: StudyType;
  /** Что доступно по тексту. Заменяет прежний флаг fullText. */
  fullTextState: FullTextState;
  mentionsGBS?: boolean;
  /** Одно предложение-доказательство. null: цитировать нечего. */
  fragment: string | null;
  /** Пустая строка: abstract недоступен (metadata-only). */
  abstract: string;
  mesh: string[];
  /** Какие объекты сравнения упомянуты в публикации (id сущностей сценария). */
  entities?: string[];
  /** Явная отметка: работа сравнивает два подхода напрямую. Без неё совместное упоминание прямым сравнением не считается. */
  directComparison?: boolean;
  /** К какому аспекту вопроса относится работа (id аспекта сценария). */
  aspect?: string;
  quotes?: PubQuote[];
  /** Текст статьи по разделам: есть только у публикаций с полным текстом в PMC. */
  body?: BodySection[];
  abstractRu?: string;
  /** Перевод одного предложения-доказательства `fragment`: карточка в режиме «Перевод» переводится целиком. */
  fragmentRu?: string;
  /** Идентификаторы. В локальных данных заполнены у нескольких публикаций номерами из зарезервированного диапазона,
      которых нет в PubMed (99 000 000 и выше), и тестовым префиксом DOI 10.5555. Из PubMed API приходят настоящие. */
  pmid?: string;
  doi?: string;
  authors?: string[];
}

export interface SpanSpec { text: string; kind: SpanKind }

export interface MassSpec {
  id: string;
  bind: string;
  tone: 'cold' | 'cold2' | 'warm' | 'warm2' | 'lilac' | 'inner' | 'soft';
  x: number; y: number; rx: number; ry: number; rot: number;
}
export interface ShapeSpec {
  kind: 'cluster' | 'nested' | 'routes';
  masses: MassSpec[];
  glow?: { bind: string; x: number; y: number; r: number };
  ring?: { bind: string; x: number; y: number; r: number };
  nodes?: { bind: string; x: number; y: number; r: number }[];
  /** Обороты орбиты ограничений. */
  orbitBase: number;
}

/** Кандидат значения неоднозначного термина. */
export interface TermCandidate {
  id: string;
  label: string;
  hint: string;
  mapped: string;
  mesh: string[];
  tiab: string[];
  factor: number;
  /** Насколько кандидат вероятен для такой формулировки: 0..1. */
  confidence: number;
  /** Формулировка, которая однозначно выбирает именно этого кандидата. */
  pick?: RegExp;
}

export interface Ambiguity {
  /** Слово, которое может значить разное. */
  trigger: RegExp;
  question: string;
  conceptId: string;
  options: TermCandidate[];
}

export interface RouteInfo {
  headline: string;
  primary: string;
  secondary: string;
  primaryLane: string;
  secondaryLane: string;
  handoff: string;
  /** Когда предлагать другой источник: только если врач просит именно рекомендации. */
  trigger: RegExp;
}

export interface Entity {
  id: string;
  label: string;
  short?: string;
  pattern: RegExp;
}

export interface Aspect { id: string; label: string }

/** Термин, который врач может упомянуть сверх базового набора понятий сценария. */
export interface LexiconEntry { trigger: RegExp; concept: Concept }

export interface Scenario {
  id: ScenarioId;
  demo: true;
  specialty: string;
  query: string;
  /** Исходная формулировка врача в PubMed-стиле. */
  pubmedStyle: string;
  title: string;
  summary: string;
  spans: SpanSpec[];
  baseParams: Params;
  pool: Pub[];
  /** Счётчики исходного запроса. Без калибровки показываем ровно то, что нашли. */
  calibration?: { total: number; fullText: number; reviews: number };
  /** Другие заголовки для других типов выдачи. */
  titles?: Partial<Record<ResultIntent, string>>;
  entities?: Entity[];
  /** Пара объектов сравнения (id сущностей). */
  compareIds?: [string, string];
  /** Аспекты вопроса: из них складываются цитаты и кластеры синтеза. */
  aspects?: Aspect[];
  typeLabels?: Partial<Record<StudyType, string>>;
  deepResearch?: { problem: string; action: string; started: string };
  route?: RouteInfo;
  /** Для маршрутизации: что показывать после выбора PubMed. */
  afterRoute?: { title: string; summary: string };
  ambiguity?: Ambiguity;
  /** Дополнительные понятия, которые подключаются по словам запроса. */
  lexicon?: LexiconEntry[];
  shape: ShapeSpec;
  /** Цитаты показываются только пока включено условие `quotes`. */
  quotesConcept?: string;
}

/* ─────────────────────────────────────────────────────────────────────────────
   План запроса: результат маршрутизации.
   ───────────────────────────────────────────────────────────────────────────── */

export type KnownBy = 'pmid' | 'doi' | 'title' | 'author-year';

export interface KnownRef {
  by: KnownBy;
  /** Как врач назвал: «PMID 99000101», «DOI 10.5555/…», название, «Aldous 2025». */
  value: string;
  /** Найденная публикация. Если пусто, это known-publication-not-found. */
  pubId?: string;
}

export interface FindSpec {
  /** publication: искать внутри одной статьи; corpus: собрать цитаты из найденных публикаций. */
  scope: 'publication' | 'corpus';
  /** Фраза врача на русском, например «дефицит железа». */
  phrase?: string;
  /** Что реально искать в тексте (английские термины из словаря понятий). */
  terms: string[];
}

export interface QueryPlan {
  job: Job;
  /** Экранное семейство, выводится из job. */
  intent: ResultIntent;
  scenarioId: ScenarioId | null;
  /** Предпочтение вида из слов запроса: не отдельный смысл, а то, как врач хочет видеть тот же корпус. */
  view?: ExploreView;
  grouping?: Grouping;
  /** Типы исследований, которые врач просил показать первыми. */
  priority?: StudyType[];
  sort?: SortMode;
  known?: KnownRef;
  find?: FindSpec;
  /** Врач просил цитаты по найденным публикациям, но для этой темы в данных прототипа нет извлечённых фрагментов: показываем обычную выдачу и говорим об этом. */
  quotesUnavailable?: boolean;
  /** Врач просил сравнить, но сравнение двух подходов в данных прототипа есть только для эндометриоза: показываем обычную выдачу и говорим об этом. */
  compareUnavailable?: boolean;
  /** В запросе больше одной темы прототипа: выдачу не подбираем, говорим, какие темы встретились. */
  collision?: { ids: ScenarioId[]; names: string[] };
  /** В запросе несколько идентификаторов (PMID, DOI): за один раз открывается одна публикация. */
  manyIds?: string[];
  /** Какой режим передачи в Deep Research подходит формулировке. */
  drMode?: 'review' | 'compare' | 'conclusion';
}

/* ─────────────────────────────────────────────────────────────────────────────
   Поиск: варианты запросов, слияние, происхождение, ранжирование.
   ───────────────────────────────────────────────────────────────────────────── */

export interface QueryVariants { exact: string; broad: string; fallback: string }

export interface SearchPlan {
  scenario: Scenario;
  params: Params;
  ambiguityId?: string;
  query?: QueryPlan;
  sort?: SortMode;
}

/** Откуда взялась публикация в выдаче. Это реальное поле данных, а не подпись на карточке. */
export interface Provenance {
  /** Ключ слияния: pmid, иначе doi, иначе внутренний id. Одна публикация попадает в выдачу один раз. */
  key: string;
  /** Все варианты поиска, которые вернули публикацию. */
  foundBy: Strategy[];
  /** Первый вариант, который её вернул: определяет ярус ранжирования. */
  tier: Strategy;
  /** Понятия запроса, найденные в публикации (id). */
  matchedConcepts: string[];
  /** Выполненные REQUIRED-условия (id понятий, 'types', 'period', 'fulltext'). */
  matchedRequired: string[];
  matchedPreferred: string[];
  missedPreferred: string[];
  /** Позиция в выдаче каждого варианта до слияния (1 — первая). */
  pubmedRankByQuery: Partial<Record<Strategy, number>>;
  /** Как найдено каждое понятие: MeSH, свободные слова, флаг текста, слова из запроса. */
  via: Record<string, 'mesh' | 'tiab' | 'text' | 'flag'>;
  /** Какие слова Title/Abstract сработали (для расширенного поиска). */
  terms: Record<string, string[]>;
}

export interface Dropped { id: string; label: string }

export interface ExecutedVariant {
  strategy: Strategy;
  query: string;
  count: number;
  ids: string[];
  /** Желательные условия, снятые в этом варианте. */
  dropped: Dropped[];
}

export interface SearchResponse {
  total: number;
  fullText: number;
  reviews: number;
  /** Слитая выдача в порядке показа. */
  items: Pub[];
  queries: QueryVariants;
  /** Что ослабить, если ничего не нашли. Только то, что проверено тестовым поиском. */
  relax: Relax | null;
  /** Что именно привело к нулю: фильтр, их сочетание или значение понятия. Только то, что проверено тестовым поиском. */
  blocker: Blocker | null;
  /** Другие значения неоднозначного термина, при которых публикации есть (только при нуле). */
  alternatives: Alternative[];

  state: ResultState;
  /** Какой вариант дал ведущие результаты. */
  lead: Strategy | null;
  executed: ExecutedVariant[];
  prov: Record<string, Provenance>;
  /** Желательные условия, которые пришлось снять (Fallback). */
  dropped: Dropped[];
  /** Что расширил Broad, человеческим языком. */
  widened: string[];
  /** Сколько вернул каждый вариант до слияния. */
  counts: Record<Strategy, number>;
  /** Сколько записей было до удаления дублей. */
  mergedFrom: number;
  sort: SortMode;
}

/** Что именно ослабить: одно условие или все фильтры сразу. `count` — сколько публикаций нашёл тестовый поиск. */
export type Relax =
  | { kind: 'period'; label: string; to: Period; count: number }
  | { kind: 'fulltext'; label: string; count: number }
  | { kind: 'types'; label: string; count: number }
  | { kind: 'filters'; label: string; count: number };

/** Причина нуля. `concept`: мешает значение понятия, фильтры не помогут ни по одному. */
export type Blocker =
  | { kind: 'concept'; id: string; label: string }
  | { kind: 'period' | 'fulltext' | 'types'; id: 'period' | 'fulltext' | 'types'; label: string }
  | { kind: 'filters'; id: 'filters'; label: string };

export interface Alternative { id: string; label: string; hint: string; count: number }

export interface SearchBackend {
  search(plan: SearchPlan): Promise<SearchResponse>;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Сессия поиска и передача в Deep Research.
   ───────────────────────────────────────────────────────────────────────────── */

export interface SearchSession {
  originalQuery: string;
  job: Job;
  concepts: { id: string; label: string; kind: ConstraintKind; active: boolean }[];
  constraints: { id: string; label: string; kind: ConstraintKind }[];
  searchVariants: QueryVariants | null;
  executedVariants: ExecutedVariant[];
  mergedResults: string[];
  selectedSort: SortMode;
  selectedLayout: ViewId;
  selectedPublication: string | null;
  ambiguityResolution: string | null;
}

export interface DeepResearchPayload {
  originalQuery: string;
  concepts: { id: string; label: string; kind: ConstraintKind }[];
  constraints: { id: string; label: string; kind: ConstraintKind }[];
  /** Отмеченные врачом публикации (PMID, а если его нет — внутренний id). */
  selectedPmids: string[];
  /** Весь текущий корпус выдачи. */
  currentCorpusPmids: string[];
  mode: 'review' | 'compare' | 'conclusion';
  /** Задача врача, с которой собран корпус. */
  job: Job;
  /** Как получен корпус: точный, расширенный или запасной поиск, и чем закончился. */
  resultState: SearchResponse['state'];
  /** Запрос PubMed, по которому получен корпус. */
  pubmedQuery: string;
}
