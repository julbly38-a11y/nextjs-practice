import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// "Вихідні чергування" — Вихідний/Робочий день, готова таблиця
// lpz.lpz_weekend_vs_weekday (не RPC-куб, лише 2 рядки на лікарню).

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const org = (searchParams.get("org") || "").trim();

  let query = getSupabaseAdmin()
    .schema("lpz")
    .from("lpz_weekend_vs_weekday")
    .select("day_type, cases, unique_patients, avg_bed_days, urgent_cases, deaths, letality_percent");
  if (org) query = query.eq("org_edrpou", org);

  const { data, error } = await query.order("day_type");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rows: data });
}
