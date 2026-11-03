import { TRANSLATIONS, lastSentence } from './translations';
import type { Concept, FullTextState, Params, Pub, Scenario, ScenarioId, StudyType } from './types';

/* ──────────────────────────────────────────────────────────────────────────
   Локальный data layer прототипа.

   Все публикации, журналы, счётчики и выводы ниже подставные (demo: true).
   Реальных PMID и DOI здесь нет. Каждый журнал придуман для демонстрации.
   Интерфейс не показывает слово «demo»; замена на PubMed API делается
   подменой `SearchBackend` в backend.ts, схема данных остаётся той же.
   Единственные цифры из брифа: 27 · 8 · 5 для запроса кардиолога.
   ────────────────────────────────────────────────────────────────────────── */

export const NOW = new Date('2026-11-03T12:00:00+03:00');
export const NOW_YEAR = NOW.getFullYear();

let seq = 0;
function P(
  type: StudyType,
  year: number,
  fullText: boolean | FullTextState,
  title: string,
  titleRu: string,
  journal: string,
  fragment: string | null,
  abstract: string,
  mesh: string[],
  extra: Partial<Pub> = {},
): Pub {
  seq += 1;
  const fullTextState: FullTextState = fullText === true ? 'pmc-full-text' : fullText === false ? 'abstract-only' : fullText;
  /* У каждой публикации есть PMID из вымышленного диапазона 991xxxxx: передача в Deep Research и «Почему здесь» работают с настоящими полями. */
  /* Перевод abstract и предложения-доказательства: из `extra`, затем из таблицы переводов. Если предложение-доказательство
     — последнее предложение abstract, его перевод — последнее предложение перевода abstract. */
  const tr = TRANSLATIONS[title];
  const abstractRu = extra.abstractRu ?? tr?.abstract;
  const fragmentRu = extra.fragmentRu ?? tr?.fragment ?? (fragment && abstractRu && abstract.endsWith(fragment) ? lastSentence(abstractRu) : undefined);
  return { id: `demo-${seq}`, pmid: `991${String(seq).padStart(5, '0')}`, demo: true, title, titleRu, journal, year, type, fullTextState, fragment, abstract, mesh, ...extra, abstractRu, fragmentRu };
}

function C(c: Omit<Concept, 'active'> & { active?: boolean }): Concept {
  return { active: true, ...c };
}

/* ───────────── 1. Кардиолог ───────────── */

const cardioParams: Params = {
  concepts: [
    C({ id: 'hf', role: 'condition', label: 'Сердечная недостаточность', mapped: 'Heart Failure', mesh: ['Heart Failure'], tiab: ['heart failure', 'cardiac failure'] }),
    C({ id: 'id', role: 'exposure', label: 'Дефицит железа', mapped: 'Iron Deficiencies', mesh: ['Iron Deficiencies'], tiab: ['iron deficiency', 'iron deficient', 'ferritin', 'transferrin saturation'] }),
    C({ id: 'criteria', role: 'focus', label: 'Критерии диагностики', mapped: 'Diagnostic criteria', tiab: ['criteria', 'definition', 'threshold*', 'diagnos*'] }),
    C({ id: 'therapy', role: 'intervention', label: 'Лечение железом', hint: 'Критерий в контексте терапии', mapped: 'Iron; Ferric Compounds', mesh: ['Iron', 'Ferric Compounds'], tiab: ['intravenous iron', 'ferric carboxymaltose', 'iron supplementation'], active: false, optional: true, factor: 0.72 }),
    C({ id: 'outcomes', role: 'outcome', label: 'Смертность и осложнения', hint: 'Исходы лечения', mapped: 'Mortality; Treatment Outcome', mesh: ['Mortality', 'Treatment Outcome'], tiab: ['mortality', 'hospitali*', 'adverse'], active: false, optional: true, factor: 0.8 }),
  ],
  types: ['sr', 'ma', 'rct'],
  preferTypes: [],
  period: 5,
  periodKind: 'REQUIRED',
  fullTextOnly: false,
  fullTextKind: 'REQUIRED',
  humans: true,
};

const cardio: Scenario = {
  id: 'cardio',
  demo: true,
  specialty: 'Кардиолог',
  query:
    'Публикации в научных рецензируемых журналах за последние 5 лет, в которых бы содержалась информация о критериях дефицита железа у пациентов с сердечной недостаточностью',
  pubmedStyle: 'Criteria for iron deficiency in heart failure',
  title: 'Критерии дефицита железа при сердечной недостаточности',
  summary:
    'В найденных работах дефицит железа определяют по ферритину и насыщению трансферрина, а пороги и контекст терапии различаются.',
  spans: [
    { text: 'научных рецензируемых журналах', kind: 'constraint' },
    { text: 'за последние 5 лет', kind: 'constraint' },
    { text: 'критериях', kind: 'outcome' },
    { text: 'дефицита железа', kind: 'exposure' },
    { text: 'сердечной недостаточностью', kind: 'condition' },
    { text: 'сердечной недостаточности', kind: 'condition' },
    { text: 'только РКИ', kind: 'constraint' },
    { text: 'за последние 2 года', kind: 'constraint' },
    { text: 'ХСН', kind: 'condition' },
    { text: 'Железодефицит', kind: 'exposure' },
  ],
  baseParams: cardioParams,
  calibration: { total: 27, fullText: 8, reviews: 5 },
  typeLabels: { sr: 'Обзоры', ma: 'Метаанализы', rct: 'РКИ', cohort: 'Когорты' },
  ambiguity: {
    trigger: /железодефицит/i,
    question: 'Что вы имеете в виду',
    conceptId: 'id',
    options: [
      { id: 'any', label: 'Дефицит железа', hint: 'с анемией или без', mapped: 'Iron Deficiencies', mesh: ['Iron Deficiencies'], tiab: ['iron deficiency', 'ferritin', 'transferrin saturation'], factor: 1, confidence: 0.5 },
      { id: 'noanemia', label: 'Дефицит железа без анемии', hint: 'гемоглобин в норме', mapped: 'Iron Deficiencies', mesh: ['Iron Deficiencies'], tiab: ['iron deficiency without anemia', 'non-anemic iron deficiency'], factor: 0.7, confidence: 0.3, pick: /без\s+анеми/i },
      { id: 'ida', label: 'Железодефицитная анемия', hint: 'со сниженным гемоглобином', mapped: 'Anemia, Iron-Deficiency', mesh: ['Anemia, Iron-Deficiency'], tiab: ['iron deficiency anemia', 'iron-deficiency anaemia'], factor: 0.6, confidence: 0.3, pick: /железодефицитн\S*\s+анеми|анеми\S*\s+(?:вследствие|из-за|при)\s+дефицит/i },
    ],
  },
  shape: {
    kind: 'cluster',
    orbitBase: 20,
    masses: [
      { id: 'hf-a', bind: 'hf', tone: 'cold', x: 360, y: 395, rx: 210, ry: 172, rot: -18 },
      { id: 'hf-b', bind: 'hf', tone: 'cold2', x: 300, y: 330, rx: 140, ry: 118, rot: 24 },
      { id: 'id', bind: 'id', tone: 'warm', x: 545, y: 480, rx: 86, ry: 70, rot: 15 },
      { id: 'therapy', bind: 'therapy', tone: 'warm2', x: 610, y: 395, rx: 56, ry: 48, rot: -10 },
    ],
    glow: { bind: 'criteria', x: 478, y: 332, r: 118 },
    nodes: [{ bind: 'outcomes', x: 270, y: 530, r: 24 }],
  },
  pool: [
    P('sr', 2025, true, 'Diagnostic criteria for iron deficiency in heart failure: a systematic review', 'Диагностические критерии дефицита железа при сердечной недостаточности: систематический обзор', 'Meridian Journal of Cardiology', 'Serum ferritin and transferrin saturation were the markers most often used to define iron deficiency.', 'We reviewed studies that defined iron deficiency in adults with heart failure and compared the markers, thresholds and clinical settings used. Definitions varied between studies.', ['Heart Failure', 'Iron Deficiencies', 'Biomarkers'], { pmid: '99000101', doi: '10.5555/askpubmed.cardio.1', authors: ['Aldous R', 'Brenner T', 'Calloway S'] }),
    P('ma', 2024, true, 'Iron deficiency definitions and clinical outcomes in heart failure: a meta-analysis', 'Определения дефицита железа и клинические исходы при сердечной недостаточности: метаанализ', 'Northgate Clinical Reviews', 'Studies differed in the thresholds used to define iron deficiency.', 'This meta-analysis pooled studies that reported clinical outcomes by iron status in patients with heart failure and recorded how iron deficiency was defined in each.', ['Heart Failure', 'Iron Deficiencies', 'Meta-Analysis as Topic']),
    P('rct', 2023, 'publisher-link', 'Intravenous iron in iron-deficient patients with heart failure: a randomized controlled trial', 'Внутривенное железо у пациентов с сердечной недостаточностью и дефицитом железа: рандомизированное контролируемое исследование', 'Halden Medical Reports', null, 'Patients with heart failure and iron deficiency were randomly assigned to intravenous iron or control. Enrolment criteria are described in the methods.', ['Heart Failure', 'Iron Deficiencies', 'Randomized Controlled Trial'], { pmid: '99000103', doi: '10.5555/askpubmed.cardio.3' }),
    P('sr', 2022, false, 'Iron deficiency definitions in heart failure with reduced and preserved ejection fraction: a systematic review', 'Определения дефицита железа при сердечной недостаточности со сниженной и сохранённой фракцией выброса: систематический обзор', 'Lowmoor Evidence Synthesis', 'Definitions were compared between reduced and preserved ejection fraction populations.', 'We compared how iron deficiency was defined in studies of heart failure with reduced and with preserved ejection fraction.', ['Heart Failure', 'Iron Deficiencies', 'Stroke Volume'], { pmid: '99000104' }),
    P('ma', 2022, true, 'Ferritin and transferrin saturation thresholds in heart failure trials: a meta-analysis', 'Пороги ферритина и насыщения трансферрина в исследованиях при сердечной недостаточности: метаанализ', 'Corvale Heart Journal', 'Trials applied ferritin and transferrin saturation thresholds in different combinations.', 'We pooled trials in heart failure and extracted the ferritin and transferrin saturation thresholds used for enrolment.', ['Ferritins', 'Transferrin', 'Heart Failure']),
    P('rct', 2021, true, 'Screening for iron deficiency in outpatients with heart failure: a randomized controlled trial', 'Скрининг дефицита железа у амбулаторных пациентов с сердечной недостаточностью: рандомизированное контролируемое исследование', 'Brightwater Internal Medicine', 'Screening used the same laboratory markers in both study arms.', 'Outpatients with heart failure were randomized to a screening strategy for iron deficiency or usual care.', ['Heart Failure', 'Iron Deficiencies', 'Outpatients']),
    P('sr', 2021, 'metadata-only', 'Prevalence and definitions of iron deficiency in heart failure: a systematic review', 'Распространённость и определения дефицита железа при сердечной недостаточности: систематический обзор', 'Meridian Journal of Cardiology', null, '', ['Heart Failure', 'Iron Deficiencies', 'Prevalence'], { pmid: '99000107' }),
    P('sr', 2019, true, 'Iron deficiency in chronic heart failure: a systematic review of diagnostic approaches', 'Дефицит железа при хронической сердечной недостаточности: систематический обзор диагностических подходов', 'Northgate Clinical Reviews', null, 'A review of diagnostic approaches to iron deficiency in chronic heart failure.', ['Heart Failure', 'Iron Deficiencies']),
    P('ma', 2018, false, 'Diagnostic markers of iron deficiency in heart failure: a meta-analysis', 'Диагностические маркеры дефицита железа при сердечной недостаточности: метаанализ', 'Halden Medical Reports', null, 'A meta-analysis of markers used to diagnose iron deficiency in heart failure.', ['Heart Failure', 'Biomarkers']),
    P('cohort', 2023, true, 'Iron deficiency criteria and outcomes in a heart failure cohort: a cohort study', 'Критерии дефицита железа и исходы в когорте пациентов с сердечной недостаточностью: когортное исследование', 'Lowmoor Evidence Synthesis', 'Two sets of criteria were applied to the same cohort.', 'A cohort of patients with heart failure was classified by two sets of iron deficiency criteria and followed for clinical outcomes.', ['Heart Failure', 'Iron Deficiencies', 'Cohort Studies']),
    P('cohort', 2025, false, 'Iron status assessment during hospitalization for heart failure: a cohort study', 'Оценка обмена железа при госпитализации с сердечной недостаточностью: когортное исследование', 'Corvale Heart Journal', null, 'A cohort study of iron status assessment in patients hospitalized with heart failure.', ['Heart Failure', 'Hospitalization']),
    P('rct', 2020, true, 'Oral versus intravenous iron repletion in heart failure: a randomized controlled trial', 'Пероральное и внутривенное восполнение железа при сердечной недостаточности: рандомизированное контролируемое исследование', 'Brightwater Internal Medicine', null, 'Patients were randomized to oral or intravenous iron repletion.', ['Heart Failure', 'Iron']),
  ],
};

/* ───────────── 2. Врач общей практики ───────────── */

const gpParams: Params = {
  concepts: [
    C({ id: 'bleed', role: 'condition', label: 'Кровотечение из верхних отделов ЖКТ', mapped: 'Gastrointestinal Hemorrhage', mesh: ['Gastrointestinal Hemorrhage'], tiab: ['upper gastrointestinal bleeding', 'upper gastrointestinal hemorrhage'] }),
    C({ id: 'outpatient', role: 'exposure', label: 'Амбулаторное ведение', mapped: 'Ambulatory Care', mesh: ['Ambulatory Care', 'Patient Discharge'], tiab: ['outpatient*', 'early discharge', 'ambulatory', 'discharge*'] }),
    C({ id: 'gbs', role: 'must', label: 'GBS', hint: 'Шкала Глазго — Блэтчфорда', mapped: 'Glasgow-Blatchford Score', tiab: ['Glasgow-Blatchford', 'Glasgow Blatchford', 'GBS'], required: true, kind: 'REQUIRED', flag: 'mentionsGBS' }),
    C({ id: 'safety', role: 'outcome', label: 'Безопасность', hint: 'Смертность, осложнения, повторные обращения', mapped: 'Treatment Outcome; Mortality', mesh: ['Treatment Outcome', 'Mortality'], tiab: ['safety', 'mortality', 'adverse events', 'readmission', 'rebleeding'], optional: true, factor: 0.8 }),
  ],
  types: ['sr', 'ma', 'cohort'],
  preferTypes: ['ma', 'sr'],
  period: null,
  periodKind: 'REQUIRED',
  fullTextOnly: false,
  fullTextKind: 'REQUIRED',
  humans: true,
};

const gp: Scenario = {
  id: 'gp',
  demo: true,
  specialty: 'Врач общей практики',
  query:
    'Найди крупные исследования, в приоритете актуальные метаанализы и систематические обзоры, о безопасности амбулаторного ведения пациентов с кровотечением из верхних отделов ЖКТ; в публикациях должно быть упоминание GBS',
  pubmedStyle: 'Outpatient management of upper gastrointestinal bleeding Glasgow-Blatchford score safety',
  title: 'Безопасность амбулаторного ведения при кровотечении из верхних отделов ЖКТ',
  summary:
    'Амбулаторное ведение сопоставляют со стационарным по смертности, осложнениям и повторным обращениям, а шкалу GBS используют для отбора пациентов.',
  spans: [
    { text: 'метаанализы и систематические обзоры', kind: 'constraint' },
    { text: 'безопасности', kind: 'outcome' },
    { text: 'амбулаторного ведения', kind: 'exposure' },
    { text: 'кровотечением из верхних отделов ЖКТ', kind: 'condition' },
    { text: 'крупные исследования', kind: 'constraint' },
    { text: 'GBS', kind: 'must' },
  ],
  baseParams: gpParams,
  calibration: { total: 19, fullText: 11, reviews: 6 },
  typeLabels: { sr: 'Систематические обзоры', ma: 'Метаанализы', rct: 'РКИ', cohort: 'Крупные когорты' },
  deepResearch: {
    problem: 'Найденные исследования отвечают на разные части вопроса',
    action: 'Разобраться в исследованиях',
    started: 'Запрос, условия и публикации собраны для Deep Research',
  },
  shape: {
    kind: 'cluster',
    orbitBase: -10,
    masses: [
      { id: 'bleed-a', bind: 'bleed', tone: 'cold', x: 380, y: 405, rx: 196, ry: 160, rot: 12 },
      { id: 'bleed-b', bind: 'bleed', tone: 'lilac', x: 455, y: 340, rx: 120, ry: 98, rot: -20 },
      { id: 'outpatient', bind: 'outpatient', tone: 'warm', x: 548, y: 488, rx: 90, ry: 74, rot: 8 },
    ],
    glow: { bind: 'safety', x: 330, y: 300, r: 112 },
    ring: { bind: 'gbs', x: 296, y: 478, r: 44 },
  },
  pool: [
    P('ma', 2025, true, 'Outpatient management of upper gastrointestinal bleeding in low-risk patients: a systematic review and meta-analysis', 'Амбулаторное ведение кровотечения из верхних отделов ЖКТ у пациентов низкого риска: систематический обзор и метаанализ', 'Brightwater Gastroenterology Review', 'Patients were selected for outpatient care using the Glasgow-Blatchford Score.', 'We pooled studies that compared outpatient and inpatient management of upper gastrointestinal bleeding and recorded the risk score used to select patients.', ['Gastrointestinal Hemorrhage', 'Ambulatory Care', 'Meta-Analysis as Topic', 'Treatment Outcome'], { mentionsGBS: true }),
    P('sr', 2024, true, 'Glasgow-Blatchford Score for early discharge in upper gastrointestinal bleeding: a systematic review', 'Шкала Глазго — Блэтчфорда для ранней выписки при кровотечении из верхних отделов ЖКТ: систематический обзор', 'Northgate Clinical Reviews', 'The review recorded the score threshold used to define low risk in each study.', 'A systematic review of studies that used the Glasgow-Blatchford Score to select patients for early discharge.', ['Gastrointestinal Hemorrhage', 'Patient Discharge', 'Risk Assessment', 'Treatment Outcome'], { mentionsGBS: true }),
    P('cohort', 2024, true, 'Safety of outpatient care after upper gastrointestinal bleeding: a large multicentre cohort study', 'Безопасность амбулаторной помощи после кровотечения из верхних отделов ЖКТ: крупное многоцентровое когортное исследование', 'Halden Medical Reports', 'Outcomes included mortality, rebleeding and return visits.', 'A multicentre cohort of patients with upper gastrointestinal bleeding managed as outpatients and followed for adverse outcomes.', ['Gastrointestinal Hemorrhage', 'Ambulatory Care', 'Cohort Studies'], { mentionsGBS: true }),
    P('ma', 2023, 'pmc-embargoed', 'Rebleeding and mortality after early discharge in upper gastrointestinal bleeding: a meta-analysis', 'Повторное кровотечение и смертность после ранней выписки при кровотечении из верхних отделов ЖКТ: метаанализ', 'Lowmoor Evidence Synthesis', null, 'A meta-analysis of rebleeding and mortality after early discharge, with the Glasgow-Blatchford Score reported in the included studies.', ['Gastrointestinal Hemorrhage', 'Mortality', 'Patient Discharge'], { mentionsGBS: true, pmid: '99000204' }),
    P('sr', 2023, 'publisher-link', 'Risk scores for outpatient management of upper gastrointestinal bleeding: a systematic review', 'Шкалы риска для амбулаторного ведения кровотечения из верхних отделов ЖКТ: систематический обзор', 'Corvale Gastroenterology Journal', 'Several risk scores were compared, including the Glasgow-Blatchford Score.', 'This review compared risk scores proposed for selecting outpatient care in upper gastrointestinal bleeding.', ['Gastrointestinal Hemorrhage', 'Risk Assessment'], { mentionsGBS: true }),
    P('cohort', 2022, true, 'Thirty-day outcomes after emergency department discharge with upper gastrointestinal bleeding: a population-based cohort', 'Тридцатидневные исходы после выписки из приёмного отделения с кровотечением из верхних отделов ЖКТ: популяционная когорта', 'Brightwater Gastroenterology Review', 'Thirty-day mortality and return visits were reported separately.', 'A population-based cohort of patients discharged from the emergency department with upper gastrointestinal bleeding.', ['Gastrointestinal Hemorrhage', 'Emergency Service, Hospital', 'Patient Discharge', 'Treatment Outcome'], { mentionsGBS: true }),
    P('ma', 2021, true, 'Hospital admission versus outpatient care in upper gastrointestinal bleeding: a meta-analysis', 'Госпитализация и амбулаторная помощь при кровотечении из верхних отделов ЖКТ: метаанализ', 'Northgate Clinical Reviews', null, 'A meta-analysis comparing hospital admission with outpatient care.', ['Gastrointestinal Hemorrhage', 'Hospitalization'], { mentionsGBS: false }),
    P('sr', 2020, false, 'Management pathways for upper gastrointestinal bleeding: a systematic review', 'Маршруты ведения пациентов с кровотечением из верхних отделов ЖКТ: систематический обзор', 'Halden Medical Reports', null, 'A review of clinical pathways for upper gastrointestinal bleeding.', ['Gastrointestinal Hemorrhage', 'Critical Pathways'], { mentionsGBS: false }),
    P('cohort', 2019, true, 'Discharge from the emergency department with upper gastrointestinal bleeding: a cohort study', 'Выписка из приёмного отделения при кровотечении из верхних отделов ЖКТ: когортное исследование', 'Lowmoor Evidence Synthesis', null, 'A cohort study of early discharge after upper gastrointestinal bleeding.', ['Gastrointestinal Hemorrhage', 'Patient Discharge'], { mentionsGBS: true }),
    P('sr', 2026, true, 'Outpatient pathways for upper gastrointestinal bleeding: an updated systematic review', 'Амбулаторные маршруты при кровотечении из верхних отделов ЖКТ: обновлённый систематический обзор', 'Corvale Gastroenterology Journal', 'The update added studies that used the Glasgow-Blatchford Score for selection.', 'An update of a systematic review of outpatient pathways for upper gastrointestinal bleeding.', ['Gastrointestinal Hemorrhage', 'Ambulatory Care', 'Treatment Outcome'], { mentionsGBS: true }),
    P('ma', 2022, false, 'Early endoscopy and outpatient care in upper gastrointestinal bleeding: a meta-analysis', 'Ранняя эндоскопия и амбулаторная помощь при кровотечении из верхних отделов ЖКТ: метаанализ', 'Meridian Journal of Gastroenterology', null, 'A meta-analysis of studies that combined early endoscopy with outpatient care.', ['Gastrointestinal Hemorrhage', 'Endoscopy'], { mentionsGBS: false }),
  ],
};

/* ───────────── 3. Педиатр: маршрутизация ───────────── */

const pedsParams: Params = {
  concepts: [
    C({ id: 'arvi', role: 'condition', label: 'ОРВИ', mapped: 'Respiratory Tract Infections', mesh: ['Respiratory Tract Infections'], tiab: ['acute respiratory viral infection', 'ARVI', 'upper respiratory tract infection'] }),
    C({ id: 'kids', role: 'condition', label: 'Дети', mapped: 'Child; Infant', mesh: ['Child', 'Infant'], tiab: ['child*', 'pediatric*', 'paediatric*'] }),
    C({ id: 'treat', role: 'intervention', label: 'Лечение и профилактика', mapped: 'Therapeutics; Primary Prevention', mesh: ['Therapeutics', 'Primary Prevention'], tiab: ['treatment', 'prevention'], optional: true, factor: 0.7 }),
  ],
  types: ['sr', 'ma', 'rct'],
  preferTypes: [],
  period: 5,
  periodKind: 'REQUIRED',
  fullTextOnly: false,
  fullTextKind: 'REQUIRED',
  humans: true,
};

const peds: Scenario = {
  id: 'peds',
  demo: true,
  specialty: 'Педиатр',
  query: 'Действующие клинические рекомендации по ОРВИ у детей РФ',
  pubmedStyle: 'Acute respiratory viral infections in children',
  title: 'Научные публикации по ОРВИ у детей',
  summary: 'Работы сравнивают подходы к симптоматическому лечению и профилактике ОРВИ у детей.',
  spans: [
    { text: 'клинические рекомендации', kind: 'outcome' },
    { text: 'ОРВИ у детей', kind: 'condition' },
    { text: 'РФ', kind: 'constraint' },
    { text: 'Витамин D', kind: 'exposure' },
    { text: 'витамина D', kind: 'exposure' },
    { text: 'при ОРВИ у детей', kind: 'condition' },
    { text: 'только РКИ', kind: 'constraint' },
    { text: 'желательно РКИ', kind: 'constraint' },
    { text: 'за последние 5 лет', kind: 'constraint' },
  ],
  lexicon: [
    {
      trigger: /витамин\S*\s*d(?![a-zа-я])|холекальциферол|колекальциферол/i,
      concept: C({ id: 'vitd', role: 'exposure', label: 'Витамин D', hint: 'Колекальциферол', mapped: 'Vitamin D', mesh: ['Vitamin D', 'Cholecalciferol'], tiab: ['vitamin D', 'cholecalciferol', '25-hydroxyvitamin D'], kind: 'REQUIRED', meshOnly: true }),
    },
  ],
  baseParams: pedsParams,
  calibration: { total: 31, fullText: 12, reviews: 7 },
  typeLabels: { sr: 'Обзоры', ma: 'Метаанализы', rct: 'РКИ', cohort: 'Когорты' },
  route: {
    headline: 'Действующие клинические рекомендации РФ собраны в рубрикаторе, а не в PubMed',
    primary: 'Открыть рекомендации',
    secondary: 'Искать исследования в PubMed',
    primaryLane: 'Рекомендации РФ',
    secondaryLane: 'Научные публикации',
    handoff: 'Здесь откроется рубрикатор клинических рекомендаций. В прототипе переход не подключён',
    trigger: /клиническ\S*\s+рекомендац|рекомендаци\S*\s+(?:рф|минздрав)/i,
  },
  shape: {
    kind: 'routes',
    orbitBase: 40,
    masses: [
      { id: 'arvi', bind: 'arvi', tone: 'cold', x: 330, y: 400, rx: 170, ry: 140, rot: -10 },
      { id: 'kids', bind: 'kids', tone: 'cold2', x: 300, y: 340, rx: 110, ry: 92, rot: 20 },
      { id: 'treat', bind: 'treat', tone: 'warm', x: 520, y: 470, rx: 70, ry: 58, rot: 12 },
    ],
    glow: { bind: 'arvi', x: 470, y: 320, r: 96 },
  },
  pool: [
    P('sr', 2025, true, 'Symptomatic treatment of acute respiratory viral infections in children: a systematic review', 'Симптоматическое лечение острых респираторных вирусных инфекций у детей: систематический обзор', 'Ashford Paediatric Review', 'Interventions were grouped by the symptom they targeted.', 'We reviewed trials of symptomatic treatment of acute respiratory viral infections in children.', ['Respiratory Tract Infections', 'Child', 'Therapeutics']),
    P('ma', 2024, true, 'Preventive measures against respiratory viral infections in children: a meta-analysis', 'Профилактические меры против респираторных вирусных инфекций у детей: метаанализ', 'Northgate Clinical Reviews', 'Preventive measures were compared between studies of children in different settings.', 'A meta-analysis of studies on preventing respiratory viral infections in children.', ['Respiratory Tract Infections', 'Child', 'Primary Prevention']),
    P('rct', 2023, false, 'Nasal saline for acute respiratory viral infection in children: a randomized controlled trial', 'Назальный солевой раствор при острой респираторной вирусной инфекции у детей: рандомизированное контролируемое исследование', 'Halden Medical Reports', null, 'Children with acute respiratory viral infection were randomly assigned to nasal saline or control.', ['Respiratory Tract Infections', 'Child', 'Therapeutics']),
    P('cohort', 2022, true, 'Complications of acute respiratory viral infections in children: a cohort study', 'Осложнения острых респираторных вирусных инфекций у детей: когортное исследование', 'Ashford Paediatric Review', 'Complications were recorded during the follow-up period.', 'A cohort study of complications after acute respiratory viral infection in children.', ['Respiratory Tract Infections', 'Child', 'Cohort Studies']),
    P('sr', 2021, false, 'Antipyretic use in children with respiratory viral infections: a systematic review', 'Жаропонижающие средства у детей с респираторными вирусными инфекциями: систематический обзор', 'Lowmoor Evidence Synthesis', null, 'A systematic review of antipyretic use in children with respiratory viral infections.', ['Respiratory Tract Infections', 'Fever', 'Therapeutics', 'Child']),
    P('rct', 2024, true, 'Hand hygiene programmes in schools and respiratory infections in children: a randomized controlled trial', 'Программы гигиены рук в школах и респираторные инфекции у детей: рандомизированное контролируемое исследование', 'Brightwater Internal Medicine', null, 'Schools were randomized to a hand hygiene programme or usual practice.', ['Respiratory Tract Infections', 'Hand Hygiene', 'Primary Prevention']),
    P('ma', 2020, true, 'Zinc supplementation and respiratory infections in children: a meta-analysis', 'Добавки цинка и респираторные инфекции у детей: метаанализ', 'Corvale Paediatric Journal', null, 'A meta-analysis of zinc supplementation in children.', ['Respiratory Tract Infections', 'Zinc']),
    /* Записи без MeSH для витамина D (индексирование ещё не завершено): точный запрос их не видит, расширенный находит по словам в тексте. */
    P('ma', 2024, true, 'Cholecalciferol supplementation and acute respiratory infections in children: a meta-analysis', 'Добавки колекальциферола и острые респираторные инфекции у детей: метаанализ', 'Corvale Paediatric Journal', 'Studies differed in the dose of cholecalciferol and in the duration of follow-up.', 'A meta-analysis of studies of vitamin D supplementation in children with acute respiratory infections. Studies differed in the dose of cholecalciferol and in the duration of follow-up.', ['Respiratory Tract Infections', 'Child']),
    P('sr', 2023, false, 'Vitamin D status and acute respiratory viral infection in children: a systematic review', 'Статус витамина D и острая респираторная вирусная инфекция у детей: систематический обзор', 'Ashford Paediatric Review', null, 'A systematic review of studies that measured vitamin D status in children with acute respiratory viral infection.', ['Respiratory Tract Infections', 'Child']),
  ],
};


/* ───────────── 4. Акушер-гинеколог ───────────── */

const obParams: Params = {
  concepts: [
    C({ id: 'preg', role: 'condition', label: 'Беременность', mapped: 'Pregnancy; Pregnancy Complications', mesh: ['Pregnancy'], tiab: ['pregnan*', 'prenatal', 'antenatal', 'maternal'] }),
    C({ id: 'ssri', role: 'exposure', label: 'СИОЗС', hint: 'Селективные ингибиторы обратного захвата серотонина', mapped: 'Serotonin Uptake Inhibitors', mesh: ['Serotonin Uptake Inhibitors'], pa: ['Selective Serotonin Reuptake Inhibitors'], tiab: ['SSRI*', 'selective serotonin reuptake inhibitors', 'antidepressant*'] }),
    C({ id: 'fetal', role: 'outcome', label: 'Плод', mapped: 'Fetus; Prenatal Exposure Delayed Effects', mesh: ['Fetus', 'Prenatal Exposure Delayed Effects'], tiab: ['fetal', 'foetal'], optional: true, factor: 0.85 }),
    C({ id: 'neonate', role: 'outcome', label: 'Новорождённый', mapped: 'Infant, Newborn', mesh: ['Infant, Newborn'], tiab: ['neonat*', 'newborn'], optional: true, factor: 0.85 }),
    C({ id: 'malf', role: 'outcome', label: 'Врождённые пороки', mapped: 'Congenital Abnormalities', mesh: ['Congenital Abnormalities'], tiab: ['malformation*', 'congenital'], optional: true, factor: 0.8 }),
    C({ id: 'compl', role: 'outcome', label: 'Неонатальные осложнения', mapped: 'Infant, Newborn, Diseases', mesh: ['Infant, Newborn, Diseases'], tiab: ['neonatal complications', 'neonatal adaptation', 'adverse neonatal'], optional: true, factor: 0.85 }),
    C({ id: 'quotes', role: 'quote', label: 'Точные цитаты', hint: 'Нужен текст источника', mapped: 'Источник с доступным текстом', tiab: [], optional: true, active: false }),
  ],
  types: ['sr', 'ma', 'cohort'],
  preferTypes: [],
  period: 5,
  periodKind: 'REQUIRED',
  fullTextOnly: false,
  fullTextKind: 'REQUIRED',
  humans: true,
};

const ob: Scenario = {
  id: 'ob',
  demo: true,
  specialty: 'Акушер-гинеколог',
  query:
    'Какие риски для плода и новорождённого связаны с приёмом СИОЗС во время беременности? Найди систематические обзоры, метаанализы и крупные когортные исследования за последние 5 лет, приведи ссылки на публикации и точные цитаты из источников, подтверждающие выводы',
  pubmedStyle: 'SSRI pregnancy fetal risks neonatal outcomes systematic review meta-analysis',
  title: 'Риски СИОЗС при беременности для плода и новорождённого',
  titles: {
    'find-in-text': 'Цитаты о рисках СИОЗС при беременности',
    synthesis: 'Что известно о рисках СИОЗС при беременности',
  },
  summary:
    'Работы разделяют исходы для плода и новорождённого и сообщают врождённые пороки и неонатальные осложнения отдельно.',
  spans: [
    { text: 'риски для плода и новорождённого', kind: 'outcome' },
    { text: 'рисках СИОЗС для новорождённого', kind: 'outcome' },
    { text: 'новорождённого', kind: 'outcome' },
    { text: 'рисках СИОЗС', kind: 'exposure' },
    { text: 'СИОЗС', kind: 'exposure' },
    { text: 'беременности', kind: 'condition' },
    { text: 'систематические обзоры, метаанализы и крупные когортные исследования', kind: 'constraint' },
    { text: 'за последние 5 лет', kind: 'constraint' },
    { text: 'точные цитаты из источников', kind: 'constraint' },
    { text: 'точные цитаты', kind: 'constraint' },
    { text: 'современных исследований', kind: 'constraint' },
  ],
  baseParams: obParams,
  calibration: { total: 34, fullText: 14, reviews: 9 },
  typeLabels: { sr: 'Систематические обзоры', ma: 'Метаанализы', rct: 'РКИ', cohort: 'Крупные когорты' },
  quotesConcept: 'quotes',
  aspects: [
    { id: 'malf', label: 'Врождённые пороки' },
    { id: 'adapt', label: 'Неонатальная адаптация' },
    { id: 'compl', label: 'Неонатальные осложнения' },
    { id: 'fetal', label: 'Развитие плода' },
  ],
  deepResearch: {
    problem: 'Исследования отвечают на разные части вопроса и пока не сведены в один вывод',
    action: 'Сопоставить результаты',
    started: 'Запрос, условия и публикации собраны для Deep Research',
  },
  shape: {
    kind: 'nested',
    orbitBase: 8,
    masses: [
      { id: 'preg', bind: 'preg', tone: 'lilac', x: 400, y: 400, rx: 236, ry: 214, rot: 0 },
      { id: 'ssri', bind: 'ssri', tone: 'inner', x: 404, y: 412, rx: 128, ry: 112, rot: 12 },
    ],
    nodes: [
      { bind: 'fetal', x: 250, y: 330, r: 16 },
      { bind: 'neonate', x: 560, y: 300, r: 20 },
      { bind: 'malf', x: 290, y: 540, r: 14 },
      { bind: 'compl', x: 560, y: 520, r: 18 },
      { bind: 'quotes', x: 420, y: 230, r: 12 },
    ],
  },
  pool: [
    P('sr', 2025, true,
      'Antenatal exposure to selective serotonin reuptake inhibitors and neonatal outcomes: a systematic review',
      'Антенатальное воздействие СИОЗС и исходы у новорождённых: систематический обзор',
      'Ashford Perinatal Review',
      'Outcomes were reported separately for congenital malformations and neonatal complications.',
      'We reviewed studies of antenatal exposure to selective serotonin reuptake inhibitors and outcomes in newborns. Outcomes were reported separately for congenital malformations and neonatal complications.',
      ['Serotonin Uptake Inhibitors', 'Pregnancy', 'Infant, Newborn'],
      {
        aspect: 'malf',
        abstractRu: 'Мы изучили работы об антенатальном воздействии СИОЗС и исходах у новорождённых. Врождённые пороки и неонатальные осложнения указывали отдельно.',
        quotes: [
          { id: 'q-0a', text: 'Neonatal complications were reported separately from congenital malformations in all included studies.', textRu: 'Во всех включённых исследованиях неонатальные осложнения указывали отдельно от врождённых пороков.', section: 'Результаты', source: 'fulltext', group: 'compl' },
          { id: 'q-0b', text: 'Definitions of congenital malformation differed between studies, which limits direct comparison.', textRu: 'Определения врождённого порока различались между исследованиями, что ограничивает прямое сравнение.', section: 'Обсуждение', source: 'fulltext', group: 'malf' },
        ],
        body: [
          { title: 'Введение', text: 'Selective serotonin reuptake inhibitors are used to treat depression and anxiety during pregnancy. Clinicians and patients need to know which outcomes were studied in newborns and how they were recorded.', textRu: 'Селективные ингибиторы обратного захвата серотонина применяют для лечения депрессии и тревоги во время беременности. Врачам и пациенткам важно знать, какие исходы у новорождённых изучали и как их регистрировали.' },
          { title: 'Методы', text: 'We searched bibliographic databases for studies of antenatal exposure to selective serotonin reuptake inhibitors. Two reviewers screened records and extracted the outcomes reported for the newborn.', textRu: 'Мы искали в библиографических базах исследования антенатального воздействия селективных ингибиторов обратного захвата серотонина. Два рецензента отбирали записи и извлекали исходы, о которых сообщали для новорождённого.' },
          { title: 'Результаты', text: 'Neonatal complications were reported separately from congenital malformations in all included studies. Exposure was described by trimester in most reports.', textRu: 'Во всех включённых исследованиях неонатальные осложнения указывали отдельно от врождённых пороков. В большинстве работ воздействие описывали по триместрам.' },
          { title: 'Обсуждение', text: 'Definitions of congenital malformation differed between studies, which limits direct comparison. Future work should report outcomes in a common format.', textRu: 'Определения врождённого порока различались между исследованиями, что ограничивает прямое сравнение. В дальнейших работах исходы стоит описывать в едином формате.' },
        ],
      }),
    P('ma', 2024, true,
      'SSRI use in pregnancy and the risk of congenital malformations: a meta-analysis',
      'Приём СИОЗС при беременности и риск врождённых пороков: метаанализ',
      'Northgate Clinical Reviews',
      'Studies reported malformations by organ system and by timing of exposure.',
      'A meta-analysis of studies that reported congenital malformations after SSRI exposure in pregnancy. Studies reported malformations by organ system and by timing of exposure.',
      ['Serotonin Uptake Inhibitors', 'Congenital Abnormalities', 'Meta-Analysis as Topic'],
      {
        pmid: '99000402',
        doi: '10.5555/askpubmed.ob.2',
        aspect: 'malf',
        abstractRu: 'Метаанализ работ, в которых сообщали о врождённых пороках после приёма СИОЗС при беременности. Пороки описывали по системам органов и по срокам воздействия.',
        quotes: [
          { id: 'q-1a', text: 'Malformations were reported by organ system and by the timing of exposure.', textRu: 'О пороках сообщали по системам органов и по срокам воздействия.', section: 'Результаты', source: 'fulltext', group: 'malf' },
          { id: 'q-1b', text: 'Exposure in the first trimester was analysed separately from later exposure.', textRu: 'Воздействие в первом триместре анализировали отдельно от более позднего.', section: 'Обсуждение', source: 'fulltext', group: 'malf' },
        ],
        body: [
          { title: 'Введение', text: 'Congenital malformations are among the outcomes most often examined after exposure to medicines in pregnancy. This meta-analysis collects studies that reported them after exposure to SSRIs.', textRu: 'Врождённые пороки — один из исходов, которые чаще всего изучают после приёма лекарств при беременности. В этом метаанализе собраны исследования, где о них сообщали после воздействия СИОЗС.' },
          { title: 'Методы', text: 'We pooled studies that reported congenital malformations after SSRI exposure in pregnancy. The timing of exposure was extracted from each study.', textRu: 'Мы объединили исследования, в которых сообщали о врождённых пороках после воздействия СИОЗС при беременности. Срок воздействия извлекали из каждого исследования.' },
          { title: 'Результаты', text: 'Malformations were reported by organ system and by the timing of exposure. The number of studies reporting each organ system varied.', textRu: 'О пороках сообщали по системам органов и по срокам воздействия. Число исследований, где описана каждая система органов, различалось.' },
          { title: 'Обсуждение', text: 'Exposure in the first trimester was analysed separately from later exposure. Differences in how malformations were classified should be kept in mind when reading pooled estimates.', textRu: 'Воздействие в первом триместре анализировали отдельно от более позднего. Различия в классификации пороков стоит учитывать при чтении объединённых оценок.' },
        ],
      }),
    P('cohort', 2024, false,
      'Prenatal SSRI exposure and neonatal complications in a nationwide cohort',
      'Пренатальное воздействие СИОЗС и неонатальные осложнения в общенациональной когорте',
      'Halden Medical Reports',
      'Exposure was ascertained from prescription records during pregnancy.',
      'A nationwide cohort study of prenatal SSRI exposure and neonatal complications. Exposure was ascertained from prescription records during pregnancy.',
      ['Serotonin Uptake Inhibitors', 'Prenatal Exposure Delayed Effects', 'Cohort Studies'],
      {
        aspect: 'compl',
        abstractRu: 'Общенациональное когортное исследование пренатального воздействия СИОЗС и неонатальных осложнений. Воздействие определяли по записям о назначениях во время беременности.',
        quotes: [
          { id: 'q-2a', text: 'Exposure was ascertained from prescription records during pregnancy.', textRu: 'Воздействие определяли по записям о назначениях во время беременности.', section: 'Abstract', source: 'abstract', group: 'compl' },
        ],
      }),
    P('sr', 2024, false,
      'Pharmacological treatment of depression in pregnancy: a systematic review of fetal and neonatal outcomes',
      'Фармакологическое лечение депрессии при беременности: систематический обзор исходов для плода и новорождённого',
      'Lowmoor Evidence Synthesis',
      null,
      'This review covers pharmacological treatment of depression in pregnancy, mostly antidepressants, and outcomes for the fetus and the newborn.',
      ['Depression', 'Pregnancy', 'Fetus'],
      {
        aspect: 'fetal',
        abstractRu: 'Обзор охватывает фармакологическое лечение депрессии при беременности, главным образом антидепрессантами, и исходы для плода и новорождённого.',
      }),
    P('ma', 2023, true,
      'SSRI exposure in late pregnancy and neonatal adaptation: a meta-analysis',
      'Воздействие СИОЗС в конце беременности и неонатальная адаптация: метаанализ',
      'Corvale Perinatal Journal',
      'Timing of exposure was extracted from each included study.',
      'A meta-analysis of SSRI exposure in late pregnancy and neonatal adaptation. Timing of exposure was extracted from each included study.',
      ['Serotonin Uptake Inhibitors', 'Infant, Newborn'],
      {
        aspect: 'adapt',
        abstractRu: 'Метаанализ воздействия СИОЗС в конце беременности и неонатальной адаптации. Срок воздействия извлекали из каждого включённого исследования.',
        quotes: [
          { id: 'q-4a', text: 'The included studies recorded neonatal adaptation symptoms in different ways.', textRu: 'Во включённых исследованиях симптомы неонатальной адаптации регистрировали по-разному.', section: 'Результаты', source: 'fulltext', group: 'adapt' },
        ],
        body: [
          { title: 'Введение', text: 'Newborns exposed to SSRIs late in pregnancy are observed for a period after birth. Reports describe this period under several names.', textRu: 'За новорождёнными, которые получали СИОЗС в конце беременности, наблюдают некоторое время после рождения. В работах этот период называют по-разному.' },
          { title: 'Методы', text: 'A meta-analysis of SSRI exposure in late pregnancy and neonatal adaptation. Timing of exposure was extracted from each included study.', textRu: 'Метаанализ воздействия СИОЗС в конце беременности и неонатальной адаптации. Срок воздействия извлекали из каждого включённого исследования.' },
          { title: 'Результаты', text: 'The included studies recorded neonatal adaptation symptoms in different ways. Some reported individual symptoms, others reported a combined outcome.', textRu: 'Во включённых исследованиях симптомы неонатальной адаптации регистрировали по-разному. В одних работах сообщали об отдельных симптомах, в других — об объединённом исходе.' },
          { title: 'Обсуждение', text: 'A common definition of neonatal adaptation would make future comparisons easier.', textRu: 'Единое определение неонатальной адаптации облегчило бы будущие сравнения.' },
        ],
      }),
    P('cohort', 2022, true,
      'Selective serotonin reuptake inhibitors in pregnancy and neonatal adaptation: a population-based cohort',
      'СИОЗС при беременности и неонатальная адаптация: популяционная когорта',
      'Ashford Perinatal Review',
      'Neonatal outcomes were compared with those of unexposed pregnancies.',
      'A population-based cohort of pregnancies exposed and unexposed to SSRIs. Neonatal outcomes were compared with those of unexposed pregnancies.',
      ['Serotonin Uptake Inhibitors', 'Pregnancy', 'Cohort Studies'],
      {
        aspect: 'adapt',
        abstractRu: 'Популяционная когорта беременностей с воздействием СИОЗС и без него. Неонатальные исходы сравнивали с исходами беременностей без воздействия.',
        quotes: [
          { id: 'q-5a', text: 'Neonatal outcomes were compared with those of unexposed pregnancies.', textRu: 'Неонатальные исходы сравнивали с исходами беременностей без воздействия.', section: 'Методы', source: 'fulltext', group: 'adapt' },
          { id: 'q-5b', text: 'Neonatal complications were recorded during the first 28 days after birth.', textRu: 'Неонатальные осложнения регистрировали в течение первых 28 дней после рождения.', section: 'Результаты', source: 'fulltext', group: 'compl' },
        ],
        body: [
          { title: 'Введение', text: 'Population registers make it possible to follow many pregnancies and their newborns over time.', textRu: 'Популяционные регистры позволяют проследить за множеством беременностей и их новорождёнными во времени.' },
          { title: 'Методы', text: 'Pregnancies exposed to SSRIs were identified from prescription records. Neonatal outcomes were compared with those of unexposed pregnancies.', textRu: 'Беременности с воздействием СИОЗС выявляли по записям о назначениях. Неонатальные исходы сравнивали с исходами беременностей без воздействия.' },
          { title: 'Результаты', text: 'Neonatal complications were recorded during the first 28 days after birth. Outcomes were reported for exposed and unexposed groups side by side.', textRu: 'Неонатальные осложнения регистрировали в течение первых 28 дней после рождения. Исходы приводили для групп с воздействием и без него рядом.' },
          { title: 'Обсуждение', text: 'The authors discuss how prescription records may differ from actual use during pregnancy.', textRu: 'Авторы обсуждают, чем записи о назначениях могут отличаться от фактического приёма во время беременности.' },
        ],
      }),
    P('sr', 2022, false,
      'Antidepressant use during pregnancy and fetal development: a systematic review',
      'Приём антидепрессантов при беременности и развитие плода: систематический обзор',
      'Northgate Clinical Reviews',
      'Studies of fetal development were grouped by the class of antidepressant.',
      'A systematic review of antidepressant use during pregnancy and fetal development. Studies of fetal development were grouped by the class of antidepressant.',
      ['Antidepressive Agents', 'Fetal Development'],
      {
        aspect: 'fetal',
        abstractRu: 'Систематический обзор приёма антидепрессантов при беременности и развития плода. Исследования развития плода сгруппировали по классу антидепрессанта.',
        quotes: [
          { id: 'q-6a', text: 'Studies of fetal development were grouped by the class of antidepressant.', textRu: 'Исследования развития плода сгруппировали по классу антидепрессанта.', section: 'Abstract', source: 'abstract', group: 'fetal' },
        ],
      }),
    P('cohort', 2021, false,
      'Maternal SSRI treatment and perinatal outcomes: a registry-based cohort study',
      'Лечение матери СИОЗС и перинатальные исходы: регистровое когортное исследование',
      'Brightwater Internal Medicine',
      'Registry records of prescriptions and births were linked.',
      'A registry-based cohort study of maternal SSRI treatment and perinatal outcomes. Registry records of prescriptions and births were linked.',
      ['Serotonin Uptake Inhibitors', 'Perinatal Care'],
      {
        aspect: 'compl',
        abstractRu: 'Регистровое когортное исследование лечения матери СИОЗС и перинатальных исходов. Записи о назначениях и родах связали между собой.',
        quotes: [
          { id: 'q-7a', text: 'Registry records of prescriptions and births were linked.', textRu: 'Записи о назначениях и родах связали между собой.', section: 'Abstract', source: 'abstract', group: 'compl' },
        ],
      }),
    P('ma', 2020, true,
      'First-trimester SSRI exposure and congenital heart defects: a meta-analysis',
      'Воздействие СИОЗС в первом триместре и врождённые пороки сердца: метаанализ',
      'Halden Medical Reports',
      null,
      'A meta-analysis of first-trimester SSRI exposure.',
      ['Serotonin Uptake Inhibitors', 'Heart Defects, Congenital'],
      { aspect: 'malf', abstractRu: 'Метаанализ воздействия СИОЗС в первом триместре.' }),
    P('sr', 2019, true,
      'Perinatal outcomes after antenatal SSRI exposure: a systematic review',
      'Перинатальные исходы после антенатального воздействия СИОЗС: систематический обзор',
      'Lowmoor Evidence Synthesis',
      null,
      'A systematic review of perinatal outcomes after antenatal SSRI exposure.',
      ['Serotonin Uptake Inhibitors', 'Perinatal Care'],
      { aspect: 'compl', abstractRu: 'Систематический обзор перинатальных исходов после антенатального воздействия СИОЗС.' }),
  ],
};

/* ───────────── 5. Диеногест и КОК: прямое сравнение ───────────── */

const endoParams: Params = {
  concepts: [
    C({ id: 'endo', role: 'condition', label: 'Эндометриоз', mapped: 'Endometriosis', mesh: ['Endometriosis'], tiab: ['endometriosis', 'endometrioma'] }),
    C({ id: 'dienogest', role: 'exposure', label: 'Диеногест', mapped: 'Dienogest', mesh: ['Dienogest'], tiab: ['dienogest'] }),
    C({ id: 'coc', role: 'exposure', label: 'Комбинированные оральные контрацептивы', mapped: 'Contraceptives, Oral, Combined', mesh: ['Contraceptives, Oral, Combined'], tiab: ['combined oral contraceptive*', 'COC'] }),
    C({ id: 'efficacy', role: 'outcome', label: 'Эффективность', hint: 'Боль и рецидивы', mapped: 'Treatment Outcome', mesh: ['Treatment Outcome'], tiab: ['efficacy', 'effectiveness', 'pain', 'recurrence'], optional: true, factor: 0.85 }),
  ],
  types: ['sr', 'ma', 'rct', 'cohort'],
  preferTypes: [],
  period: 5,
  periodKind: 'REQUIRED',
  fullTextOnly: false,
  fullTextKind: 'REQUIRED',
  humans: true,
};

const endo: Scenario = {
  id: 'endo',
  demo: true,
  specialty: 'Гинеколог',
  query: 'Сравни эффективность диеногеста и комбинированных оральных контрацептивов при эндометриозе',
  pubmedStyle: 'Dienogest versus combined oral contraceptives endometriosis efficacy',
  title: 'Диеногест и КОК при эндометриозе',
  summary: 'Публикации, в которых диеногест и комбинированные оральные контрацептивы сравнивают напрямую, показаны отдельно от работ об одном подходе.',
  spans: [
    { text: 'эффективность', kind: 'outcome' },
    { text: 'диеногеста', kind: 'exposure' },
    { text: 'Диеногест', kind: 'exposure' },
    { text: 'комбинированных оральных контрацептивов', kind: 'exposure' },
    { text: 'КОК', kind: 'exposure' },
    { text: 'эндометриозе', kind: 'condition' },
  ],
  baseParams: endoParams,
  typeLabels: { sr: 'Систематические обзоры', ma: 'Метаанализы', rct: 'РКИ', cohort: 'Когорты' },
  entities: [
    { id: 'dienogest', label: 'Диеногест', pattern: /диеногест\S*/i },
    { id: 'coc', label: 'Комбинированные оральные контрацептивы', short: 'КОК', pattern: /комбинированн\S*\s+оральн\S*\s+контрацептив\S*|(?:^|[^а-яёa-z])кок(?![а-яёa-z])/i },
  ],
  compareIds: ['dienogest', 'coc'],
  shape: {
    kind: 'cluster',
    orbitBase: 14,
    masses: [
      { id: 'endo-a', bind: 'endo', tone: 'cold', x: 400, y: 392, rx: 206, ry: 168, rot: 8 },
      { id: 'dien', bind: 'dienogest', tone: 'warm', x: 262, y: 440, rx: 98, ry: 82, rot: -10 },
      { id: 'coc', bind: 'coc', tone: 'lilac', x: 548, y: 440, rx: 104, ry: 86, rot: 12 },
    ],
    glow: { bind: 'efficacy', x: 404, y: 300, r: 104 },
  },
  pool: [
    P('rct', 2025, true,
      'Dienogest versus combined oral contraceptives for endometriosis-associated pain: a randomized controlled trial',
      'Диеногест и комбинированные оральные контрацептивы при боли, связанной с эндометриозом: рандомизированное контролируемое исследование',
      'Halden Medical Reports',
      'Pain was assessed on the same scale in both groups.',
      'Women with endometriosis-associated pain were randomly assigned to dienogest or a combined oral contraceptive. Pain was assessed on the same scale in both groups.',
      ['Endometriosis', 'Dienogest', 'Contraceptives, Oral, Combined', 'Treatment Outcome'],
      { entities: ['dienogest', 'coc'], directComparison: true, abstractRu: 'Женщин с болью, связанной с эндометриозом, случайным образом распределили на диеногест или комбинированный оральный контрацептив. Боль оценивали по одной шкале в обеих группах.' }),
    P('ma', 2024, true,
      'Dienogest compared with combined oral contraceptives in endometriosis: a systematic review and meta-analysis',
      'Диеногест в сравнении с комбинированными оральными контрацептивами при эндометриозе: систематический обзор и метаанализ',
      'Northgate Clinical Reviews',
      'Only trials with a direct comparison of the two treatments were pooled.',
      'We pooled trials that directly compared dienogest with combined oral contraceptives in women with endometriosis. Only trials with a direct comparison of the two treatments were pooled.',
      ['Endometriosis', 'Dienogest', 'Meta-Analysis as Topic', 'Contraceptives, Oral, Combined', 'Treatment Outcome'],
      { entities: ['dienogest', 'coc'], directComparison: true, abstractRu: 'Мы объединили исследования, в которых диеногест напрямую сравнивали с комбинированными оральными контрацептивами у женщин с эндометриозом. В анализ вошли только работы с прямым сравнением двух видов лечения.' }),
    P('sr', 2023, false,
      'Hormonal treatments for endometriosis-associated pain: a systematic review comparing dienogest and combined oral contraceptives',
      'Гормональное лечение боли при эндометриозе: систематический обзор, сравнивающий диеногест и комбинированные оральные контрацептивы',
      'Lowmoor Evidence Synthesis',
      null,
      'A systematic review of hormonal treatments for endometriosis-associated pain, with a separate section on dienogest and combined oral contraceptives.',
      ['Endometriosis', 'Hormones', 'Contraceptives, Oral, Combined'],
      { entities: ['dienogest', 'coc'], directComparison: false, abstractRu: 'Систематический обзор гормонального лечения боли при эндометриозе с отдельным разделом о диеногесте и комбинированных оральных контрацептивах.' }),
    P('rct', 2022, true,
      'Dienogest and a continuous combined oral contraceptive after surgery for endometrioma: a randomized controlled trial',
      'Диеногест и непрерывный приём комбинированного орального контрацептива после операции по поводу эндометриомы: рандомизированное контролируемое исследование',
      'Lowmoor Evidence Synthesis',
      'Treatment started within four weeks after surgery in both groups.',
      'Women who had surgery for endometrioma were randomly assigned to dienogest or a continuous combined oral contraceptive. Treatment started within four weeks after surgery in both groups.',
      ['Endometriosis', 'Dienogest', 'Postoperative Care', 'Contraceptives, Oral, Combined', 'Treatment Outcome'],
      { entities: ['dienogest', 'coc'], directComparison: true, abstractRu: 'Женщин после операции по поводу эндометриомы случайным образом распределили на диеногест или непрерывный приём комбинированного орального контрацептива. В обеих группах лечение начинали в течение четырёх недель после операции.' }),
    P('cohort', 2024, false,
      'Dienogest and combined oral contraceptives in routine care of endometriosis: a comparative cohort study',
      'Диеногест и комбинированные оральные контрацептивы в рутинной помощи при эндометриозе: сравнительное когортное исследование',
      'Corvale Perinatal Journal',
      null,
      'A comparative cohort study of women with endometriosis who received dienogest or a combined oral contraceptive in routine care.',
      ['Endometriosis', 'Cohort Studies'],
      { entities: ['dienogest', 'coc'], directComparison: true, abstractRu: 'Сравнительное когортное исследование женщин с эндометриозом, получавших диеногест или комбинированный оральный контрацептив в рутинной помощи.' }),
    P('rct', 2021, false,
      'Patient-reported outcomes with dienogest or a combined oral contraceptive in endometriosis: a randomized controlled trial',
      'Исходы, о которых сообщают пациентки, при приёме диеногеста или комбинированного орального контрацептива при эндометриозе: рандомизированное контролируемое исследование',
      'Brightwater Internal Medicine',
      null,
      'A randomized trial that collected patient-reported outcomes in two treatment groups.',
      ['Endometriosis', 'Patient Reported Outcome Measures'],
      { entities: ['dienogest', 'coc'], directComparison: true, abstractRu: 'Рандомизированное исследование, в котором собирали исходы, о которых сообщают пациентки, в двух группах лечения.' }),

    P('ma', 2025, true,
      'Dienogest for endometriosis-associated pain: a meta-analysis',
      'Диеногест при боли, связанной с эндометриозом: метаанализ',
      'Corvale Perinatal Journal',
      'Included trials used different pain scales.',
      'A meta-analysis of trials of dienogest in women with endometriosis-associated pain. Included trials used different pain scales.',
      ['Endometriosis', 'Dienogest', 'Meta-Analysis as Topic'],
      { entities: ['dienogest'], abstractRu: 'Метаанализ исследований диеногеста у женщин с болью, связанной с эндометриозом. В исследованиях использовали разные шкалы боли.' }),
    P('rct', 2023, false,
      'Long-term dienogest treatment in endometriosis: a randomized controlled trial',
      'Длительное лечение диеногестом при эндометриозе: рандомизированное контролируемое исследование',
      'Halden Medical Reports',
      null,
      'A randomized trial of long-term dienogest treatment.',
      ['Endometriosis', 'Dienogest'],
      { entities: ['dienogest'], abstractRu: 'Рандомизированное исследование длительного лечения диеногестом.' }),
    P('sr', 2022, true,
      'Adverse effects of dienogest in women with endometriosis: a systematic review',
      'Нежелательные явления диеногеста у женщин с эндометриозом: систематический обзор',
      'Meridian Journal of Gastroenterology',
      'Adverse effects were grouped by organ system.',
      'A systematic review of adverse effects reported in women with endometriosis who received dienogest. Adverse effects were grouped by organ system.',
      ['Endometriosis', 'Dienogest', 'Drug-Related Side Effects and Adverse Reactions'],
      { entities: ['dienogest'], abstractRu: 'Систематический обзор нежелательных явлений у женщин с эндометриозом, получавших диеногест. Нежелательные явления сгруппировали по системам органов.' }),

    P('ma', 2024, false,
      'Combined oral contraceptives for dysmenorrhea in endometriosis: a meta-analysis',
      'Комбинированные оральные контрацептивы при дисменорее у женщин с эндометриозом: метаанализ',
      'Ashford Perinatal Review',
      null,
      'A meta-analysis of trials of combined oral contraceptives for dysmenorrhea in women with endometriosis.',
      ['Endometriosis', 'Contraceptives, Oral, Combined', 'Dysmenorrhea'],
      { entities: ['coc'], abstractRu: 'Метаанализ исследований комбинированных оральных контрацептивов при дисменорее у женщин с эндометриозом.' }),
    P('rct', 2021, true,
      'Continuous versus cyclic combined oral contraceptive regimens in endometriosis: a randomized controlled trial',
      'Непрерывный и циклический режимы комбинированных оральных контрацептивов при эндометриозе: рандомизированное контролируемое исследование',
      'Brightwater Internal Medicine',
      'Both regimens used the same preparation.',
      'Women with endometriosis were randomly assigned to a continuous or a cyclic regimen of a combined oral contraceptive. Both regimens used the same preparation.',
      ['Endometriosis', 'Contraceptives, Oral, Combined'],
      { entities: ['coc'], abstractRu: 'Женщин с эндометриозом случайным образом распределили на непрерывный или циклический режим комбинированного орального контрацептива. В обоих режимах использовали один препарат.' }),
    P('sr', 2023, true,
      'Combined oral contraceptives and recurrence of endometrioma after surgery: a systematic review',
      'Комбинированные оральные контрацептивы и рецидив эндометриомы после операции: систематический обзор',
      'Northgate Clinical Reviews',
      'Follow-up periods differed between the included studies.',
      'A systematic review of combined oral contraceptives after surgery for endometrioma. Follow-up periods differed between the included studies.',
      ['Endometriosis', 'Contraceptives, Oral, Combined', 'Recurrence'],
      { entities: ['coc'], abstractRu: 'Систематический обзор применения комбинированных оральных контрацептивов после операции по поводу эндометриомы. Сроки наблюдения в исследованиях различались.' }),
  ],
};

export const SCENARIOS: Scenario[] = [cardio, gp, peds, ob, endo];
export const SCENARIO_MAP: Record<ScenarioId, Scenario> = { cardio, gp, peds, ob, endo };

/* ───────────── Примеры: восемь формулировок, по одной на тип выдачи ───────────── */

export interface Fixture { id: string; label: string; query: string; scenario: ScenarioId }

const EXACT_TITLE = ob.pool[1].title;

export const FIXTURES: Fixture[] = [
  { id: 'A', label: 'Критерии дефицита железа', scenario: 'cardio', query: 'Публикации о критериях дефицита железа при сердечной недостаточности' },
  { id: 'B', label: 'Амбулаторное ведение при кровотечении', scenario: 'gp', query: gp.query },
  { id: 'C', label: 'Диеногест и КОК', scenario: 'endo', query: endo.query },
  { id: 'D', label: 'Цитаты о СИОЗС', scenario: 'ob', query: 'Найди точные цитаты о рисках СИОЗС для новорождённого во время беременности' },
  { id: 'E', label: 'Статья по названию', scenario: 'ob', query: EXACT_TITLE },
  { id: 'F', label: 'Неоднозначный термин', scenario: 'cardio', query: 'Железодефицит при ХСН: какие критерии используют' },
  { id: 'G', label: 'Слишком узкий запрос', scenario: 'cardio', query: 'Критерии дефицита железа при сердечной недостаточности, только РКИ за последние 2 года' },
  { id: 'H', label: 'Риски СИОЗС: что известно', scenario: 'ob', query: 'Что из современных исследований следует о рисках СИОЗС во время беременности' },
];

/** Исходные сценарии из первого брифа: остаются в меню «Примеры». */
/** Примеры логики поиска: что происходит, когда точный запрос ничего не находит, когда ищут по номеру и когда просят вывод. */
export const LOGIC: Fixture[] = [
  { id: 'L1', label: 'Точный поиск пуст, расширенный находит', scenario: 'peds', query: 'Витамин D при ОРВИ у детей' },
  { id: 'L2', label: 'Желательное условие снято', scenario: 'peds', query: 'Витамин D при ОРВИ у детей, желательно РКИ' },
  { id: 'L3', label: 'Обязательное условие, ноль публикаций', scenario: 'peds', query: 'Витамин D при ОРВИ у детей, только РКИ за последние 5 лет' },
  { id: 'L4', label: 'PMID найден', scenario: 'cardio', query: 'PMID 99000101' },
  { id: 'L5', label: 'PMID не найден', scenario: 'cardio', query: 'PMID 12345678' },
  { id: 'L6', label: 'DOI', scenario: 'ob', query: 'DOI 10.5555/askpubmed.ob.2' },
  { id: 'L7', label: 'PMID и место в тексте', scenario: 'cardio', query: 'Найди PMID 99000101 и покажи, где авторы определяют дефицит железа' },
  { id: 'L8', label: 'В приоритете метаанализы', scenario: 'gp', query: 'Амбулаторное ведение кровотечения из верхних отделов ЖКТ по шкале GBS, в приоритете метаанализы и обзоры, по годам' },
  { id: 'L9', label: 'Сделать обзор литературы', scenario: 'ob', query: 'Сделай краткий обзор литературы по СИОЗС при беременности' },
];
export const CLASSIC: Fixture[] = [
  { id: 'cardio', label: 'Кардиолог: исходный запрос', scenario: 'cardio', query: cardio.query },
  { id: 'peds', label: 'Педиатр: рекомендации РФ', scenario: 'peds', query: peds.query },
  { id: 'ob', label: 'Акушер-гинеколог: исходный запрос', scenario: 'ob', query: ob.query },
];

/** Подбор сценария по свободному тексту. null: запрос не распознан. */
export function matchQuery(text: string): ScenarioId | null {
  const t = text.toLowerCase();
  for (const s of SCENARIOS) if (t.trim() === s.query.toLowerCase().trim()) return s.id;
  if (/эндометриоз|диеногест|контрацептив/.test(t)) return 'endo';
  if (/железодефицит|желез/.test(t) && /сердеч|хсн|недостаточн/.test(t)) return 'cardio';
  if (/жкт|кровотеч|gbs|блэтч/.test(t)) return 'gp';
  if (/орви|клиническ\S*\s+рекомендац|у\s+детей|педиатр/.test(t)) return 'peds';
  if (/сиозс|беремен|плод|новорожд/.test(t)) return 'ob';
  return null;
}

export const cloneParams = (p: Params): Params => ({
  ...p,
  concepts: p.concepts.map((c) => ({ ...c })),
  types: [...p.types],
  preferTypes: [...p.preferTypes],
});
