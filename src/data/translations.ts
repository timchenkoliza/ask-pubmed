/* Перевод текстов публикаций прототипа на русский.
   Ключ — английское название публикации. Для abstract и «предложения-доказательства» (`fragment`) перевод хранится отдельно,
   чтобы карточка, абзац abstract и раздел «Результаты» в режиме «Перевод» говорили одно и то же.
   Если предложение-доказательство — последнее предложение abstract, его перевод берётся из перевода abstract (см. `lastSentence`). */

export interface PubText { abstract?: string; fragment?: string }

export const lastSentence = (s: string): string => {
  const parts = s.trim().split(/(?<=[.!?])\s+/);
  return parts[parts.length - 1] ?? s;
};

export const firstSentence = (s: string): string => s.trim().split(/(?<=[.!?])\s+/)[0] ?? s;

export const TRANSLATIONS: Record<string, PubText> = {
  /* Кардиология */
  'Diagnostic criteria for iron deficiency in heart failure: a systematic review': {
    abstract: 'Мы изучили работы, в которых определяли дефицит железа у взрослых с сердечной недостаточностью, и сравнили маркеры, пороговые значения и клинические условия. Определения различались между исследованиями.',
    fragment: 'Чаще всего дефицит железа определяли по сывороточному ферритину и насыщению трансферрина.',
  },
  'Iron deficiency definitions and clinical outcomes in heart failure: a meta-analysis': {
    abstract: 'В метаанализ вошли исследования, в которых сообщали о клинических исходах в зависимости от обмена железа у пациентов с сердечной недостаточностью и указывали, как определяли дефицит железа.',
    fragment: 'Пороговые значения для определения дефицита железа в исследованиях различались.',
  },
  'Intravenous iron in iron-deficient patients with heart failure: a randomized controlled trial': {
    abstract: 'Пациентов с сердечной недостаточностью и дефицитом железа случайным образом распределили на внутривенное железо или контроль. Критерии включения описаны в разделе «Методы».',
  },
  'Iron deficiency definitions in heart failure with reduced and preserved ejection fraction: a systematic review': {
    abstract: 'Мы сравнили, как определяли дефицит железа в исследованиях сердечной недостаточности со сниженной и с сохранённой фракцией выброса.',
    fragment: 'Определения сравнивали между популяциями со сниженной и сохранённой фракцией выброса.',
  },
  'Ferritin and transferrin saturation thresholds in heart failure trials: a meta-analysis': {
    abstract: 'Мы объединили исследования при сердечной недостаточности и извлекли пороговые значения ферритина и насыщения трансферрина, которые использовали при включении пациентов.',
    fragment: 'В исследованиях применяли пороги ферритина и насыщения трансферрина в разных сочетаниях.',
  },
  'Screening for iron deficiency in outpatients with heart failure: a randomized controlled trial': {
    abstract: 'Амбулаторных пациентов с сердечной недостаточностью случайным образом распределили на стратегию скрининга дефицита железа или обычную помощь.',
    fragment: 'В обеих группах для скрининга использовали одни и те же лабораторные маркеры.',
  },
  'Iron deficiency in chronic heart failure: a systematic review of diagnostic approaches': {
    abstract: 'Обзор диагностических подходов к дефициту железа при хронической сердечной недостаточности.',
  },
  'Diagnostic markers of iron deficiency in heart failure: a meta-analysis': {
    abstract: 'Метаанализ маркеров, которые используют для диагностики дефицита железа при сердечной недостаточности.',
  },
  'Iron deficiency criteria and outcomes in a heart failure cohort: a cohort study': {
    abstract: 'Когорту пациентов с сердечной недостаточностью разделили по двум наборам критериев дефицита железа и наблюдали за клиническими исходами.',
    fragment: 'К одной и той же когорте применили два набора критериев.',
  },
  'Iron status assessment during hospitalization for heart failure: a cohort study': {
    abstract: 'Когортное исследование оценки обмена железа у пациентов, госпитализированных с сердечной недостаточностью.',
  },
  'Oral versus intravenous iron repletion in heart failure: a randomized controlled trial': {
    abstract: 'Пациентов случайным образом распределили на пероральное или внутривенное восполнение железа.',
  },

  /* Терапия: кровотечение из верхних отделов ЖКТ */
  'Outpatient management of upper gastrointestinal bleeding in low-risk patients: a systematic review and meta-analysis': {
    abstract: 'Мы объединили исследования, в которых сравнивали амбулаторное и стационарное ведение кровотечения из верхних отделов ЖКТ и фиксировали шкалу риска, по которой отбирали пациентов.',
    fragment: 'Пациентов для амбулаторной помощи отбирали по шкале Глазго — Блэтчфорда.',
  },
  'Glasgow-Blatchford Score for early discharge in upper gastrointestinal bleeding: a systematic review': {
    abstract: 'Систематический обзор исследований, в которых по шкале Глазго — Блэтчфорда отбирали пациентов для ранней выписки.',
    fragment: 'В обзоре для каждого исследования указан порог шкалы, по которому определяли низкий риск.',
  },
  'Safety of outpatient care after upper gastrointestinal bleeding: a large multicentre cohort study': {
    abstract: 'Многоцентровая когорта пациентов с кровотечением из верхних отделов ЖКТ, которых вели амбулаторно и наблюдали на предмет неблагоприятных исходов.',
    fragment: 'Среди исходов были смертность, повторное кровотечение и повторные обращения.',
  },
  'Rebleeding and mortality after early discharge in upper gastrointestinal bleeding: a meta-analysis': {
    abstract: 'Метаанализ повторных кровотечений и смертности после ранней выписки; во включённых исследованиях указана шкала Глазго — Блэтчфорда.',
  },
  'Risk scores for outpatient management of upper gastrointestinal bleeding: a systematic review': {
    abstract: 'В обзоре сравнили шкалы риска, предложенные для отбора пациентов на амбулаторную помощь при кровотечении из верхних отделов ЖКТ.',
    fragment: 'Сравнили несколько шкал риска, в том числе шкалу Глазго — Блэтчфорда.',
  },
  'Thirty-day outcomes after emergency department discharge with upper gastrointestinal bleeding: a population-based cohort': {
    abstract: 'Популяционная когорта пациентов, выписанных из приёмного отделения с кровотечением из верхних отделов ЖКТ.',
    fragment: 'Тридцатидневную смертность и повторные обращения указывали отдельно.',
  },
  'Hospital admission versus outpatient care in upper gastrointestinal bleeding: a meta-analysis': {
    abstract: 'Метаанализ, в котором сравнили госпитализацию с амбулаторной помощью.',
  },
  'Management pathways for upper gastrointestinal bleeding: a systematic review': {
    abstract: 'Обзор клинических маршрутов ведения при кровотечении из верхних отделов ЖКТ.',
  },
  'Discharge from the emergency department with upper gastrointestinal bleeding: a cohort study': {
    abstract: 'Когортное исследование ранней выписки после кровотечения из верхних отделов ЖКТ.',
  },
  'Outpatient pathways for upper gastrointestinal bleeding: an updated systematic review': {
    abstract: 'Обновление систематического обзора амбулаторных маршрутов при кровотечении из верхних отделов ЖКТ.',
    fragment: 'В обновление добавили исследования, в которых для отбора использовали шкалу Глазго — Блэтчфорда.',
  },
  'Early endoscopy and outpatient care in upper gastrointestinal bleeding: a meta-analysis': {
    abstract: 'Метаанализ исследований, в которых раннюю эндоскопию сочетали с амбулаторной помощью.',
  },

  /* Педиатрия: ОРВИ у детей */
  'Symptomatic treatment of acute respiratory viral infections in children: a systematic review': {
    abstract: 'Мы изучили исследования симптоматического лечения острых респираторных вирусных инфекций у детей.',
    fragment: 'Вмешательства сгруппировали по симптому, на который они направлены.',
  },
  'Preventive measures against respiratory viral infections in children: a meta-analysis': {
    abstract: 'Метаанализ исследований профилактики респираторных вирусных инфекций у детей.',
    fragment: 'Профилактические меры сравнивали между исследованиями детей в разных условиях.',
  },
  'Nasal saline for acute respiratory viral infection in children: a randomized controlled trial': {
    abstract: 'Детей с острой респираторной вирусной инфекцией случайным образом распределили на назальный солевой раствор или контроль.',
  },
  'Complications of acute respiratory viral infections in children: a cohort study': {
    abstract: 'Когортное исследование осложнений после острой респираторной вирусной инфекции у детей.',
    fragment: 'Осложнения регистрировали в период наблюдения.',
  },
  'Antipyretic use in children with respiratory viral infections: a systematic review': {
    abstract: 'Систематический обзор применения жаропонижающих средств у детей с респираторными вирусными инфекциями.',
  },
  'Hand hygiene programmes in schools and respiratory infections in children: a randomized controlled trial': {
    abstract: 'Школы случайным образом распределили на программу гигиены рук или обычную практику.',
  },
  'Zinc supplementation and respiratory infections in children: a meta-analysis': {
    abstract: 'Метаанализ исследований добавок цинка у детей.',
  },
  'Cholecalciferol supplementation and acute respiratory infections in children: a meta-analysis': {
    abstract: 'Метаанализ исследований добавок витамина D у детей с острыми респираторными инфекциями. Исследования различались по дозе колекальциферола и длительности наблюдения.',
  },
  'Vitamin D status and acute respiratory viral infection in children: a systematic review': {
    abstract: 'Систематический обзор исследований, в которых измеряли статус витамина D у детей с острой респираторной вирусной инфекцией.',
  },
};
