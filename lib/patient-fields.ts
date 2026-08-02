// Українські підписи для всіх полів lpz.lpz_patients — використовується
// панеллю "🏥 Пошук пацієнта" для побудови картки (список "Поле"/"Значення")
// з усіма даними знайденого пацієнта.

export const PATIENT_FIELD_LABELS: { key: string; label: string }[] = [
  { key: "full_name", label: "ПІБ" },
  { key: "last_name", label: "Прізвище" },
  { key: "first_name", label: "Ім'я" },
  { key: "middle_name", label: "По батькові" },
  { key: "gender", label: "Стать" },
  { key: "age", label: "Вік" },
  { key: "birthday", label: "Дата народження" },
  { key: "patient_id", label: "ID пацієнта" },
  { key: "org_edrpou", label: "ЛПЗ (ЄДРПОУ)" },
  { key: "tax_id", label: "ІПН" },
  { key: "unzr", label: "УНЗР" },
  { key: "phone", label: "Телефон" },
  { key: "email", label: "Email" },
  { key: "address", label: "Адреса" },
  { key: "oblast", label: "Область" },
  { key: "raion", label: "Район" },
  { key: "settlement_type", label: "Тип населеного пункту" },
  { key: "settlement_name", label: "Населений пункт" },
  { key: "street", label: "Вулиця" },
  { key: "city_of_birth", label: "Місто народження" },
  { key: "country_of_birth", label: "Країна народження" },
  { key: "resident", label: "Резидент" },
  { key: "is_preferential", label: "Пільговик" },
  { key: "foreigner_first_name", label: "Ім'я (іноземець)" },
  { key: "foreigner_last_name", label: "Прізвище (іноземець)" },
  { key: "declaration_status", label: "Статус декларації" },
  { key: "declaration_begin_date", label: "Початок декларації" },
  { key: "declaration_end_date", label: "Кінець декларації" },
  { key: "family_doctor_division_id", label: "Підрозділ сімейного лікаря" },
];

export type PatientRecord = Record<string, string | number | boolean | null>;

export function formatPatientFieldValue(value: string | number | boolean | null): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Так" : "Ні";
  return String(value);
}
