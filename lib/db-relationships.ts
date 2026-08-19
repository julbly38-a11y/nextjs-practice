// Довідник РЕАЛЬНИХ зв'язків (foreign key + перевірені текстові збіги без
// формального constraint) у Supabase-проєкті цього застосунку, схема lpz —
// той самий project ref, що й lib/api-connections.ts. Знято напряму з бази
// (pg_constraint, information_schema) через Supabase MCP, а не вгадано з
// назв полів. Показується в панелі "📖 Довідники" → "🔑 Зв'язки бази".
//
// Мета — НЕ "виконати" ці зв'язки автоматично (те, що саме має робити клік,
// завжди лишається вибором людини — див. "🔗 Зв'язки" в README), а мати
// готовий, звірений з базою список УСІХ ключів, яким можна прив'язати
// linkKey/linkKeys (CanvasElement) чи параметр liveBinding, коли знадобиться
// новий об'єкт чи новий крос-зв'язок — не передивляючись щоразу схему
// заново.
//
// wired: true — цей зв'язок УЖЕ проставлено як linkKey/linkKeys десь у
// конструкторі (app/page.tsx). usedByApp: false — таблиця/поле, якого
// зараз не торкається жоден API-роут чи пресет; сам зв'язок від цього не
// менш реальний, просто ще нема канвас-об'єкта, що показував би ці рядки.

export type DbRelationshipKind = "fk" | "soft";
export type DbRelationshipCategory = "entity" | "lookup" | "tenant-scope";

export type DbRelationship = {
  id: string;
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  kind: DbRelationshipKind;
  category: DbRelationshipCategory;
  usedByApp: boolean;
  wired: boolean;
  note?: string;
};

export const DB_RELATIONSHIP_KIND_LABELS: Record<DbRelationshipKind, string> = {
  fk: "формальний FOREIGN KEY у базі",
  soft: "текстовий/типовий збіг без формального constraint",
};

export const DB_RELATIONSHIPS: DbRelationship[] = [
  // ── Уже підключено в конструкторі ─────────────────────────────────────
  {
    id: "empl-department",
    fromTable: "lpz.lpz_empl",
    fromColumn: "department_structure_id",
    toTable: "lpz.lpz_departments",
    toColumn: "structure_id",
    kind: "fk",
    category: "entity",
    usedByApp: true,
    wired: true,
    note: "Ординаторська (рядок лікаря, linkKeys) ↔ Список відділень (рядок відділення, linkKey) ↔ Перебуває у відділенні (рядок пацієнта, linkKeys) — усі три об'єкти цього відділення тепер крос-підсвічуються між собою одним кліком. Для census structure_id береться не з колонки таблиці (її там нема, лише текстова inpatient_department_name), а з уже обраного при завантаженні staffSelectedDept — надійніше за текстовий збіг.",
  },
  {
    id: "hospitalization-doctors-empl",
    fromTable: "lpz.lpz_hospitalization_doctors",
    fromColumn: "doctor_id",
    toTable: "lpz.lpz_empl",
    toColumn: "resource_id",
    kind: "soft",
    category: "entity",
    usedByApp: true,
    wired: true,
    note: "Той самий простір UUID, перевірено join'ом на реальних даних — формального FK constraint на цю таблицю нема. Перебуває у відділенні ↔ Ординаторська (пацієнт ↔ його лікар).",
  },

  // ── Реальні FK, дані вже тягне застосунок, лінк ще НЕ проставлено ─────
  {
    id: "hospitalizations-patient",
    fromTable: "lpz.lpz_hospitalizations",
    fromColumn: "patient_id",
    toTable: "lpz.lpz_patients",
    toColumn: "patient_id",
    kind: "fk",
    category: "entity",
    usedByApp: true,
    wired: false,
    note: "Госпіталізація ↔ пацієнт. Зараз пацієнт на полотні — це картка ПОЛІВ (🏥 Пошук пацієнта), не рядок списку, тож linkKey нема куди причепити без нового об'єкта.",
  },
  {
    id: "hospitalizations-department",
    fromTable: "lpz.lpz_hospitalizations",
    fromColumn: "department_structure_id",
    toTable: "lpz.lpz_departments",
    toColumn: "structure_id",
    kind: "fk",
    category: "entity",
    usedByApp: true,
    wired: false,
    note: "Той самий structure_id, що вже підключений у empl-department вище — якщо колись з'явиться список госпіталізацій рядками, лінк одразу готовий.",
  },
  {
    id: "hospitalizations-doctor",
    fromTable: "lpz.lpz_hospitalizations",
    fromColumn: "doc_resource_id",
    toTable: "lpz.lpz_empl",
    toColumn: "resource_id",
    kind: "fk",
    category: "entity",
    usedByApp: true,
    wired: false,
    note: "Формальний FK є, але дані ненадійні: поле заповнене лише в ~4 з 2599 живих госпіталізацій (звідси й lpz_hospitalization_doctors вище — той самий зв'язок, інше джерело з повними даними).",
  },
  {
    id: "hospitalization-diagnoses-hospitalization",
    fromTable: "lpz.lpz_hospitalization_diagnoses",
    fromColumn: "id_case",
    toTable: "lpz.lpz_hospitalizations",
    toColumn: "id_case",
    kind: "fk",
    category: "entity",
    usedByApp: false,
    wired: false,
    note: "Діагноз ↔ КОНКРЕТНА госпіталізація (не пряма пара з пацієнтом — пацієнт виходить лише через hospitalizations.patient_id вище). Ця таблиця зараз узагалі не запитується жодним API-роутом — є лише агрегований lpz_diagnosis_cube (показники по МКХ-10, груповий підрахунок, без id_case). Щоб зв'язати конкретний діагноз із конкретним пацієнтом/лікарем рядками — треба новий API-роут і новий пресет.",
  },
  {
    id: "hospitalizations-icd-primary",
    fromTable: "lpz.lpz_hospitalizations",
    fromColumn: "icd_primary",
    toTable: "lpz.lpz_icd_diagnoses",
    toColumn: "code",
    kind: "soft",
    category: "entity",
    usedByApp: true,
    wired: true,
    note: "НАЙПРЯМІШИЙ шлях госпіталізація ↔ діагноз — колонка живе прямо на lpz_hospitalizations (не через окрему junction-таблицю), і саме по ній, найімовірніше, групує lpz_diagnosis_cube. Рядки \"Показники по діагнозу\" тепер несуть linkKey = icd_primary (крос-підсвітка/фільтр запрацюють одразу, щойно з'явиться другий об'єкт з тим самим кодом) — той самий код і далі читається напряму з content як 🩻 діагностичний вузол для set-icd. lpz_icd_diagnoses (код+назва) зараз ніде не запитується — назва діагнозу береться з окремого статичного МКХ-довідника (lib/indicators.ts).",
  },
  {
    id: "hospitalization-diagnoses-icd",
    fromTable: "lpz.lpz_hospitalization_diagnoses",
    fromColumn: "icd10_code",
    toTable: "lpz.lpz_icd_diagnoses",
    toColumn: "code",
    kind: "soft",
    category: "entity",
    usedByApp: false,
    wired: false,
    note: "Той самий МКХ-10 код, що й icd_primary вище, лише в таблиці ПОВНОГО списку діагнозів на випадок (не тільки основний) — icd10am_code/icd10am_name поруч виглядають як паралельна класифікація (ICD-10-AM), а не окремий зв'язок.",
  },
  {
    id: "hospitalizations-admit-source",
    fromTable: "lpz.lpz_hospitalizations",
    fromColumn: "admit_source_id",
    toTable: "lpz.lpz_dict_admit_source",
    toColumn: "id",
    kind: "soft",
    category: "lookup",
    usedByApp: true,
    wired: false,
    note: "Ані одне з трьох *_id-полів (admit_source_id/re_admission_id/discharge_disposition_id) не має формального FK — лише збіг за назвою й типом integer↔id.",
  },
  {
    id: "hospitalizations-re-admission",
    fromTable: "lpz.lpz_hospitalizations",
    fromColumn: "re_admission_id",
    toTable: "lpz.lpz_dict_re_admission",
    toColumn: "id",
    kind: "soft",
    category: "lookup",
    usedByApp: true,
    wired: false,
  },
  {
    id: "hospitalizations-discharge-disposition",
    fromTable: "lpz.lpz_hospitalizations",
    fromColumn: "discharge_disposition_id",
    toTable: "lpz.lpz_dict_discharge_disposition",
    toColumn: "id",
    kind: "soft",
    category: "lookup",
    usedByApp: true,
    wired: false,
  },

  // ── Реальні FK, таблиця/поле застосунок зараз НЕ запитує ──────────────
  {
    id: "departments-type",
    fromTable: "lpz.lpz_departments",
    fromColumn: "type_code",
    toTable: "lpz.lpz_department_types",
    toColumn: "code",
    kind: "fk",
    category: "lookup",
    usedByApp: false,
    wired: false,
    note: "/api/departments повертає type_code (видно в сирих даних), але конструктор його зараз нічим не показує й не використовує для зв'язків.",
  },
  {
    id: "empl-position",
    fromTable: "lpz.lpz_empl",
    fromColumn: "position_id",
    toTable: "lpz.lpz_helsi_positions",
    toColumn: "position_id",
    kind: "fk",
    category: "lookup",
    usedByApp: false,
    wired: false,
  },
  {
    id: "empl-professional-group",
    fromTable: "lpz.lpz_empl",
    fromColumn: "professional_group",
    toTable: "lpz.lpz_helsi_positions",
    toColumn: "position_id",
    kind: "fk",
    category: "lookup",
    usedByApp: false,
    wired: false,
  },
  {
    id: "empl-role",
    fromTable: "lpz.lpz_empl",
    fromColumn: "role",
    toTable: "lpz.lpz_roles",
    toColumn: "code",
    kind: "fk",
    category: "lookup",
    usedByApp: false,
    wired: false,
  },
  {
    id: "empl-specialities-empl",
    fromTable: "lpz.lpz_empl_specialities",
    fromColumn: "resource_id",
    toTable: "lpz.lpz_empl",
    toColumn: "resource_id",
    kind: "fk",
    category: "entity",
    usedByApp: false,
    wired: false,
    note: "Лікар ↔ спеціальності (junction-таблиця, лікар може мати кілька). Таблиця не запитується жодним API-роутом.",
  },
  {
    id: "empl-specialities-speciality",
    fromTable: "lpz.lpz_empl_specialities",
    fromColumn: "speciality_id",
    toTable: "lpz.lpz_helsi_specialities",
    toColumn: "speciality_id",
    kind: "fk",
    category: "lookup",
    usedByApp: false,
    wired: false,
  },
  {
    id: "helsi-positions-parent",
    fromTable: "lpz.lpz_helsi_positions",
    fromColumn: "parent",
    toTable: "lpz.lpz_helsi_positions",
    toColumn: "position_id",
    kind: "fk",
    category: "lookup",
    usedByApp: false,
    wired: false,
    note: "Самопосилання — ієрархія посад.",
  },
  {
    id: "admission-rejections-admitting-doc",
    fromTable: "lpz.lpz_admission_rejections",
    fromColumn: "admitting_doc_resource_id",
    toTable: "lpz.lpz_empl",
    toColumn: "resource_id",
    kind: "fk",
    category: "entity",
    usedByApp: false,
    wired: false,
    note: "Відмова у госпіталізації ↔ лікар, що приймав. Таблиця не запитується жодним API-роутом.",
  },
  {
    id: "admission-rejections-responsible-doc",
    fromTable: "lpz.lpz_admission_rejections",
    fromColumn: "responsible_doc_resource_id",
    toTable: "lpz.lpz_empl",
    toColumn: "resource_id",
    kind: "fk",
    category: "entity",
    usedByApp: false,
    wired: false,
  },
  {
    id: "episodes-doctor",
    fromTable: "lpz.lpz_episodes",
    fromColumn: "doc_resource_id",
    toTable: "lpz.lpz_empl",
    toColumn: "resource_id",
    kind: "fk",
    category: "entity",
    usedByApp: false,
    wired: false,
    note: "Таблиця не запитується жодним API-роутом.",
  },
  {
    id: "department-mappings-type",
    fromTable: "lpz.lpz_department_mappings",
    fromColumn: "type_code",
    toTable: "lpz.lpz_department_types",
    toColumn: "code",
    kind: "fk",
    category: "lookup",
    usedByApp: false,
    wired: false,
  },
  {
    id: "calendar-snapshot-position",
    fromTable: "lpz.lpz_calendar_snapshot",
    fromColumn: "position_id",
    toTable: "lpz.lpz_helsi_positions",
    toColumn: "position_id",
    kind: "fk",
    category: "lookup",
    usedByApp: false,
    wired: false,
    note: "Таблиця не запитується жодним API-роутом.",
  },
  {
    id: "calendar-snapshot-specialities-speciality",
    fromTable: "lpz.lpz_calendar_snapshot_specialities",
    fromColumn: "speciality_id",
    toTable: "lpz.lpz_helsi_specialities",
    toColumn: "speciality_id",
    kind: "fk",
    category: "lookup",
    usedByApp: false,
    wired: false,
  },
  {
    id: "calendar-snapshot-specialities-snapshot",
    fromTable: "lpz.lpz_calendar_snapshot_specialities",
    fromColumn: "org_edrpou, resource_id, snapshot_date",
    toTable: "lpz.lpz_calendar_snapshot",
    toColumn: "org_edrpou, resource_id, snapshot_date",
    kind: "fk",
    category: "entity",
    usedByApp: false,
    wired: false,
    note: "Складений (3-колонковий) ключ. Таблиця не запитується жодним API-роутом.",
  },

  // ── М'який (не-FK) зв'язок, ще не підключений ──────────────────────────
  {
    id: "hospitalization-doctors-department-name",
    fromTable: "lpz.lpz_hospitalization_doctors",
    fromColumn: "inpatient_department_name",
    toTable: "lpz.lpz_departments",
    toColumn: "name",
    kind: "soft",
    category: "entity",
    usedByApp: true,
    wired: false,
    note: "Текстова назва, не id — на відміну від doctor_id вище, тут нема гарантії 100% збігу написання. Обійдено інакше (див. empl-department): рядки census тепер несуть structure_id з уже обраного department, не з цієї текстової колонки — тож цей конкретний ризик реально не задіяний.",
  },

  // ── Межа лікарні (тенант) — окрема категорія, свідомо НЕ linkKey ──────
  {
    id: "tenant-scope",
    fromTable: "lpz.* (майже кожна таблиця схеми)",
    fromColumn: "org_edrpou",
    toTable: "lpz.lpz_organizations",
    toColumn: "edrpou",
    kind: "fk",
    category: "tenant-scope",
    usedByApp: true,
    wired: false,
    note: "Це не зв'язок для крос-підсвітки (лінкувало б УСІ рядки однієї лікарні між собою, без сенсу) — це межа тенанта, яку конструктор вже фільтрує через параметр ?org=<edrpou> активної лікарні (див. \"Активна лікарня й тема кольорів\" у README). Тут — для повноти картини бази.",
  },
];
