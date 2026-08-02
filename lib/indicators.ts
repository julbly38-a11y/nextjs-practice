// Довідник показників ЛСМД (для прив'язки даних до карток) — перенесено з
// розділу README "Довідник показників ЛСМД" в структуровані дані, щоб панель
// "Показники" в конструкторі могла їх шукати/показувати без парсингу маркдауну.

export type IndicatorRow = {
  code: string;
  nameUk: string;
  formula?: string;
};

export type IndicatorSection = {
  title: string;
  source?: string;
  rows: IndicatorRow[];
};

export const INDICATOR_SECTIONS: IndicatorSection[] = [
  {
    title: "1. Базові прапорці",
    source: "v_case_metrics",
    rows: [
      { code: "f_death", nameUk: "Ознака смерті", formula: "(discharge_status = 'Помер')::integer" },
      { code: "f_improved", nameUk: "Ознака поліпшення", formula: "(discharge_status = 'З поліпшенням')::integer" },
      { code: "f_nochange", nameUk: "Ознака відсутності змін", formula: "(discharge_status = 'Без змін')::integer" },
      { code: "f_worse", nameUk: "Ознака погіршення", formula: "(discharge_status = 'З погіршенням')::integer" },
      { code: "f_transferred", nameUk: "Ознака переведення", formula: "(discharge_status LIKE '%Переведений%')::integer" },
      { code: "f_urgent", nameUk: "Ознака екстреної госпіталізації", formula: "(admission_type = 'Екстренна')::integer" },
      { code: "f_planned", nameUk: "Ознака планової госпіталізації", formula: "(admission_type = 'Планова')::integer" },
      { code: "f_referral", nameUk: "Ознака наявності направлення", formula: "(referral IS NOT NULL AND referral <> '')::integer" },
      { code: "f_operation", nameUk: "Ознака проведення операції", formula: "(operation_id IS NOT NULL)::integer" },
      { code: "f_urgent_operation", nameUk: "Ознака екстреної операції", formula: "(admission_type = 'Екстренна' AND operation_id IS NOT NULL)::integer" },
      { code: "f_female", nameUk: "Жіноча стать", formula: "(gender = 'Ж')::integer" },
      { code: "f_male", nameUk: "Чоловіча стать", formula: "(gender = 'Ч')::integer" },
      { code: "patient_age", nameUk: "Вік пацієнта", formula: "EXTRACT(year FROM age(admission_date_d, birth_date_d))::integer" },
      { code: "f_child", nameUk: "Дитина", formula: "(patient_age < 18)::integer" },
      { code: "f_elderly", nameUk: "Особа похилого віку", formula: "(patient_age >= 60)::integer" },
      { code: "age_group", nameUk: "Вікова група", formula: "CASE WHEN patient_age<18 THEN '0-17' WHEN <=39 THEN '18-39' WHEN <=59 THEN '40-59' WHEN <=74 THEN '60-74' ELSE '75+' END" },
      { code: "f_night", nameUk: "Ознака нічної госпіталізації", formula: "(shift_time = 'нічне')::integer" },
      { code: "shift_time", nameUk: "Час доби госпіталізації (денне/нічне)", formula: "CASE WHEN admission_time::time >= '22:00' OR < '07:00' THEN 'нічне' ELSE 'денне' END" },
      { code: "day_type", nameUk: "Тип дня (будній/вихідний)", formula: "CASE WHEN EXTRACT(DOW FROM admission_date_d) IN (0,6) THEN 'вихідний' ELSE 'будній' END" },
      { code: "f_urgent_death", nameUk: "Смерть при екстреній госпіталізації", formula: "(admission_type='Екстренна' AND discharge_status='Помер')::integer" },
      { code: "f_planned_death", nameUk: "Смерть при плановій госпіталізації", formula: "(admission_type='Планова' AND discharge_status='Помер')::integer" },
      { code: "f_urgent_transfer", nameUk: "Переведення при екстреній госпіталізації", formula: "(admission_type='Екстренна' AND discharge_status LIKE '%Переведений%')::integer" },
      { code: "bed_days", nameUk: "Кількість ліжко-днів", formula: "length_of_stay" },
      { code: "length_of_stay", nameUk: "Тривалість перебування (днів)", formula: "(discharge_date_d - admission_date_d)::int" },
    ],
  },
  {
    title: "2. Госпітальні показники",
    source: "v_hospital_summary",
    rows: [
      { code: "total_cases", nameUk: "Загальна кількість випадків", formula: "COUNT(*)" },
      { code: "unique_patients", nameUk: "Кількість унікальних пацієнтів", formula: "COUNT(DISTINCT patient_id)" },
      { code: "total_bed_days", nameUk: "Загальна кількість ліжко-днів", formula: "SUM(bed_days)" },
      { code: "avg_bed_days", nameUk: "Середня кількість ліжко-днів", formula: "ROUND(AVG(bed_days), 1)" },
      { code: "avg_age", nameUk: "Середній вік", formula: "ROUND(AVG(patient_age), 1)" },
      { code: "death_rate_pct", nameUk: "Відсоток летальності", formula: "ROUND(100.0 * SUM(f_death) / COUNT(*), 2)" },
      { code: "urgent_pct", nameUk: "Відсоток екстрених госпіталізацій", formula: "ROUND(100.0 * SUM(f_urgent) / COUNT(*), 2)" },
      { code: "surgical_activity_pct", nameUk: "Відсоток хірургічної активності", formula: "ROUND(100.0 * SUM(f_operation) / COUNT(*), 2)" },
      { code: "percentage", nameUk: "Відсоток (загальна формула)", formula: "ROUND(100.0 * числитель::numeric / знаменник::numeric, 2)" },
      { code: "deaths", nameUk: "Смерті", formula: "SUM(f_death)" },
      { code: "operations", nameUk: "Операції", formula: "SUM(f_operation)" },
      { code: "transferred", nameUk: "Переведені", formula: "SUM(f_transferred)" },
      { code: "worse", nameUk: "З погіршенням", formula: "SUM(f_worse)" },
      { code: "urgent", nameUk: "Екстрені", formula: "SUM(f_urgent)" },
      { code: "planned", nameUk: "Планові", formula: "SUM(f_planned)" },
    ],
  },
  {
    title: "3. Показники відділень",
    source: "v_department_stats, group by discharge_department",
    rows: [
      { code: "total_cases", nameUk: "Загальна кількість випадків" },
      { code: "unique_patients", nameUk: "Унікальні пацієнти" },
      { code: "avg_bed_days", nameUk: "Середня к-ть ліжко-днів" },
      { code: "max_bed_days", nameUk: "Максимальна к-ть ліжко-днів" },
      { code: "deaths", nameUk: "Смерті" },
      { code: "death_rate_pct", nameUk: "Відсоток летальності" },
      { code: "urgent", nameUk: "Екстрені" },
      { code: "urgent_pct", nameUk: "Відсоток екстрених" },
      { code: "operations", nameUk: "Операції" },
      { code: "surgical_activity_pct", nameUk: "Відсоток хірургічної активності" },
      { code: "avg_age", nameUk: "Середній вік" },
      { code: "women", nameUk: "Жінки" },
      { code: "men", nameUk: "Чоловіки" },
      { code: "children", nameUk: "Діти" },
      { code: "elderly", nameUk: "Особи похилого віку" },
      { code: "with_referral", nameUk: "З направленням" },
      { code: "improved", nameUk: "З поліпшенням" },
      { code: "nochange", nameUk: "Без змін" },
    ],
  },
  {
    title: "4. Повторні госпіталізації",
    source: "v_readmissions / v_readmission_metrics",
    rows: [
      { code: "next_admission", nameUk: "Дата наступної госпіталізації", formula: "LEAD(admission_date_d) OVER (PARTITION BY patient_id ORDER BY admission_date_d)" },
      { code: "next_icd", nameUk: "Діагноз наступної госпіталізації", formula: "LEAD(icd_primary) OVER (PARTITION BY patient_id ORDER BY admission_date_d)" },
      { code: "days_to_readmission", nameUk: "Днів до повторної госпіталізації", formula: "next_admission - discharge_date_d" },
      { code: "readmit_30d", nameUk: "Повторна госпіталізація протягом 30 днів", formula: "(days_to_readmission BETWEEN 0 AND 30)::integer" },
      { code: "readmit_90d", nameUk: "Повторна госпіталізація протягом 90 днів", formula: "(days_to_readmission BETWEEN 0 AND 90)::integer" },
      { code: "same_diagnosis", nameUk: "Той самий діагноз при повторній госпіталізації", formula: "(next_icd = icd_primary)::integer" },
      { code: "total_with_followup", nameUk: "Загальна кількість випадків з подальшим спостереженням", formula: "COUNT(*) (з v_readmissions)" },
      { code: "readmit_30d_pct", nameUk: "Відсоток повторних госпіталізацій за 30 днів", formula: "ROUND(100.0 * SUM(readmit_30d)/COUNT(*), 2)" },
      { code: "readmit_90d_pct", nameUk: "Відсоток повторних госпіталізацій за 90 днів", formula: "ROUND(100.0 * SUM(readmit_90d)/COUNT(*), 2)" },
      { code: "same_dx_30d", nameUk: "Той самий діагноз у межах 30-денної повторної госпіталізації", formula: "SUM(CASE WHEN readmit_30d=1 AND same_diagnosis=1 THEN 1 ELSE 0 END)" },
    ],
  },
  {
    title: "5. Ургентні показники",
    source: "v_urgency_stats, group by hosp_type",
    rows: [
      { code: "total_cases", nameUk: "Загальна кількість випадків" },
      { code: "deaths", nameUk: "Смерті" },
      { code: "death_rate_pct", nameUk: "Відсоток летальності" },
      { code: "operations", nameUk: "Операції" },
      { code: "surgery_pct", nameUk: "Відсоток хірургічної активності" },
      { code: "avg_bed_days", nameUk: "Середня к-ть ліжко-днів" },
      { code: "transferred", nameUk: "Переведені" },
      { code: "worse", nameUk: "З погіршенням" },
    ],
  },
  {
    title: "6. Діагнози",
    source: "v_diagnosis_stats, group by icd_primary",
    rows: [
      { code: "cases", nameUk: "Випадки" },
      { code: "patients", nameUk: "Пацієнти" },
      { code: "deaths", nameUk: "Смерті" },
      { code: "death_rate_pct", nameUk: "Відсоток летальності" },
      { code: "operations", nameUk: "Операції" },
      { code: "surgery_pct", nameUk: "Відсоток хірургічної активності" },
      { code: "avg_bed_days", nameUk: "Середня к-ть ліжко-днів" },
      { code: "avg_age", nameUk: "Середній вік" },
      { code: "women", nameUk: "Жінки" },
      { code: "men", nameUk: "Чоловіки" },
    ],
  },
  {
    title: "7. Пікові навантаження — v_peak_by_hour",
    source: "group by EXTRACT(hour FROM admission_ts)",
    rows: [
      { code: "admissions", nameUk: "Госпіталізації" },
      { code: "urgent", nameUk: "Екстрені" },
      { code: "planned", nameUk: "Планові" },
    ],
  },
  {
    title: "7. Пікові навантаження — v_peak_by_weekday",
    source: "group by EXTRACT(DOW FROM admission_date_d), 0=нд, 6=сб",
    rows: [
      { code: "admissions", nameUk: "Госпіталізації" },
      { code: "urgent", nameUk: "Екстрені" },
      { code: "night_admissions", nameUk: "Нічні госпіталізації" },
    ],
  },
  {
    title: "7. Пікові навантаження — v_peak_by_month",
    source: "group by EXTRACT(month FROM admission_date_d)",
    rows: [
      { code: "admissions", nameUk: "Госпіталізації" },
      { code: "deaths", nameUk: "Смерті" },
      { code: "operations", nameUk: "Операції" },
    ],
  },
  {
    title: "8. Географія",
    source: "v_region_stats, group by region",
    rows: [
      { code: "patients", nameUk: "Пацієнти" },
      { code: "unique_patients", nameUk: "Унікальні пацієнти" },
      { code: "cities", nameUk: "Міста", formula: "array_agg(DISTINCT city_name)" },
      { code: "women", nameUk: "Жінки" },
      { code: "men", nameUk: "Чоловіки" },
      { code: "avg_age", nameUk: "Середній вік" },
    ],
  },
  {
    title: "9. Пацієнти",
    source: "v_patient_stats, group by gender, age_group",
    rows: [
      { code: "cases", nameUk: "Випадки" },
      { code: "unique_patients", nameUk: "Унікальні пацієнти" },
      { code: "deaths", nameUk: "Смерті" },
      { code: "death_rate_pct", nameUk: "Відсоток летальності" },
      { code: "avg_bed_days", nameUk: "Середня к-ть ліжко-днів" },
      { code: "operations", nameUk: "Операції" },
    ],
  },
  {
    title: "10. Шаблони формул",
    source: "загальні правила розрахунку",
    rows: [
      { code: "percentage", nameUk: "Відсоток", formula: "ROUND(100.0 * числитель::numeric / знаменник::numeric, 2)" },
      { code: "average", nameUk: "Середнє значення", formula: "ROUND(AVG(column), 1)" },
      { code: "flag", nameUk: "Прапорець (0/1)", formula: "(умова)::integer" },
      { code: "unique_count", nameUk: "Кількість унікальних значень", formula: "COUNT(DISTINCT column)" },
      { code: "sum_of_flags", nameUk: "Сума прапорців", formula: "SUM(flag)" },
      { code: "LEAD", nameUk: "Наступний запис (window function)", formula: "LEAD(column) OVER (PARTITION BY patient_id ORDER BY date)" },
      { code: "LAG", nameUk: "Попередній запис (window function)", formula: "LAG(column) OVER (PARTITION BY patient_id ORDER BY date)" },
      { code: "ROW_NUMBER", nameUk: "Номер рядка в групі (window function)", formula: "ROW_NUMBER() OVER (PARTITION BY group ORDER BY metric DESC)" },
      { code: "SUM_OVER", nameUk: "Накопичувальна сума (window function)", formula: "SUM(column) OVER (PARTITION BY group ORDER BY date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)" },
    ],
  },
  {
    title: "11. Materialized Views",
    source: "кешовані, оновлюються щоночі о 02:00 через pg_cron",
    rows: [
      { code: "mv_daily_stats", nameUk: "v_case_metrics по днях (~2265 рядків)", formula: "GROUP BY admission_date_d" },
      { code: "mv_dept_stats", nameUk: "v_department_stats (20 рядків)" },
      { code: "mv_doctor_full", nameUk: "лікар + його статистика (868 рядків)" },
      { code: "mv_icd_usage", nameUk: "icd_10 + COUNT(випадків) (19824 рядки)" },
    ],
  },
  {
    title: "13. Важливі фільтри для точності",
    rows: [
      { code: "f_treating_placeholder", nameUk: "Плейсхолдер \"Лікується\" — discharge_date = admission + 10 днів, не реальна виписка", formula: "WHERE discharge_status <> 'Лікується'" },
      { code: "readmission_window", nameUk: "Коректні повторні госпіталізації", formula: "WHERE days_to_readmission >= 0 AND days_to_readmission <= 365" },
      { code: "avg_bed_days_real", nameUk: "Реальне середнє ліжко-день (без 'Лікується')", formula: "WHERE discharge_status <> 'Лікується'" },
    ],
  },
];
