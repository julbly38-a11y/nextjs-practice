import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// Загальнолікарняний КПІ-рядок — напряму з lpz.lpz_hospitalizations, через
// RPC public.lpz_hospital_summary (SECURITY DEFINER, той самий підхід, що й
// lpz_department_stats). Замінює зламаний v_hospital_summary (public) — той
// будується з v_case_metrics.discharge_status, яке ніде не заповнене, тому
// death_rate_pct/avg_age там завжди null. Опційний ?year= фільтрує по року
// admission_date; без нього — за весь час.

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const yearParam = searchParams.get("year");
  const targetYear = yearParam ? Number(yearParam) : null;
  const org = (searchParams.get("org") || "").trim();

  const { data, error } = await getSupabaseAdmin()
    .rpc("lpz_hospital_summary", { target_year: targetYear, p_org_edrpou: org || null })
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ summary: data });
}
