import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// "Нічні чергування" — День/Ніч, готова таблиця lpz.lpz_night_vs_day_admissions
// (не RPC-куб, лише 2 рядки на лікарню — рахувати наживо непотрібно).

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const org = (searchParams.get("org") || "").trim();

  let query = getSupabaseAdmin()
    .schema("lpz")
    .from("lpz_night_vs_day_admissions")
    .select("time_period, cases, unique_patients, avg_bed_days, urgent_cases, deaths, letality_percent");
  if (org) query = query.eq("org_edrpou", org);

  const { data, error } = await query.order("time_period");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rows: data });
}
