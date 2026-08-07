import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// Ординаторська (лікарі відділення) — 1:1 з /api/lpz-department-staff
// старого проекту (head-cabinet.js:loadStaff), лише інше джерело: напряму
// lpz.lpz_empl (схема lpz — лише сервер, service_role), фільтр за
// department (structure_id з lpz_departments).

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const department = (searchParams.get("department") || "").trim();

  if (!department) {
    return NextResponse.json({ error: "Не вказано відділення (department)" }, { status: 400 });
  }

  const { data, error } = await getSupabaseAdmin()
    .schema("lpz")
    .from("lpz_empl")
    .select("resource_id, last_name, first_name, middle_name, position_name")
    .eq("department_structure_id", department)
    .order("last_name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ staff: data });
}
