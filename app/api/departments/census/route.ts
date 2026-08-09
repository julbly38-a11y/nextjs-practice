import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// "Перебуває у відділенні" (реальні дані) — 1:1 за смислом з utils.js:
// loadCensus у старому проекті, лише джерело інше: lpz.lpz_hospitalization_
// doctors, WHERE discharge_date IS NULL (ще не виписані). На відміну від
// lpz_hospitalizations.doc_resource_id (заповнений лише в 4 з 2599 живих
// госпіталізацій — непридатно), тут doctor_id заповнений у ВСІХ 1221 живих
// записах — саме цей doctor_id і є "ключем зв'язку" з Ординаторською
// (lpz_empl.resource_id, той самий простір UUID).

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const department = (searchParams.get("department") || "").trim();

  if (!department) {
    return NextResponse.json({ error: "Не вказано відділення (department)" }, { status: 400 });
  }

  const { data, error } = await getSupabaseAdmin()
    .schema("lpz")
    .from("lpz_hospitalization_doctors")
    .select("patient_name, admission_date, doctor_id, doctor_name")
    .is("discharge_date", null)
    .ilike("inpatient_department_name", `%${department}%`)
    .order("admission_date");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ patients: data });
}
