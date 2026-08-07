// Українські підписи для полів "Пошуку лікаря" (public.mv_doctor_full) та
// "Пошуку відділення" (RPC public.lpz_department_stats, рахує напряму з
// lpz.lpz_hospitalizations — v_department_stats порожній через баг у
// v_case_metrics.discharge_department) — панель "Складні об'єкти", ті самі
// картки "Поле"/"Значення", що й lib/patient-fields.ts для пацієнта.

export const DOCTOR_FIELD_LABELS: { key: string; label: string }[] = [
  { key: "full_name", label: "ПІБ" },
  { key: "position", label: "Посада" },
  { key: "specialization", label: "Спеціальність" },
  { key: "category", label: "Категорія" },
  { key: "dept_name", label: "Відділення" },
  { key: "block", label: "Блок" },
  { key: "total_cases", label: "Усього випадків" },
  { key: "unique_patients", label: "Унікальних пацієнтів" },
  { key: "night_cases", label: "Нічних випадків" },
  { key: "weekend_cases", label: "Вихідних випадків" },
  { key: "deaths", label: "Летальних випадків" },
  { key: "improved", label: "З поліпшенням" },
  { key: "avg_los", label: "Сер. тривалість (днів)" },
  { key: "first_case", label: "Перший випадок" },
  { key: "last_case", label: "Останній випадок" },
];

export const DEPARTMENT_STAT_FIELD_LABELS: { key: string; label: string }[] = [
  { key: "department_name", label: "Відділення" },
  { key: "total_cases", label: "Усього випадків" },
  { key: "unique_patients", label: "Унікальних пацієнтів" },
  { key: "deaths", label: "Летальних випадків" },
  { key: "death_rate_pct", label: "Летальність (%)" },
  { key: "avg_bed_days", label: "Сер. ліжко-днів" },
  { key: "avg_age", label: "Сер. вік" },
];

export type LpzEntityRecord = Record<string, string | number | boolean | null>;

export function formatLpzFieldValue(value: string | number | boolean | null): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Так" : "Ні";
  return String(value);
}
