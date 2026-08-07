import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// Реальна статистика по відділеннях — напряму з lpz.lpz_hospitalizations
// (лише сервер, service_role), через RPC public.lpz_department_stats
// (SECURITY DEFINER-функція, бо anon/authenticated не мають GRANT на схему
// lpz). Замінює зламаний v_department_stats (public) — той будується з
// v_case_metrics.discharge_department, яке ніде не заповнене.

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();

  const { data, error } = await getSupabaseAdmin().rpc("lpz_department_stats", {
    search_query: q || null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ departments: data });
}
