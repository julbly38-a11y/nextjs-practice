import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// Пошук лікаря (public.mv_doctor_full — materialized view з профілем +
// статистикою випадків) лише на сервері через service_role: view не має
// GRANT на anon/authenticated (на відміну від v_hospital_summary).

const NUMERIC_ID_RE = /^[0-9]+$/;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  const org = (searchParams.get("org") || "").trim();

  if (q.length < 2) {
    return NextResponse.json({ error: "Введіть щонайменше 2 символи для пошуку" }, { status: 400 });
  }

  const safeQ = q.replace(/[,()]/g, "");

  let query = getSupabaseAdmin().from("mv_doctor_full").select("*");
  query = NUMERIC_ID_RE.test(safeQ)
    ? query.eq("doctor_id", safeQ)
    : query.ilike("full_name", `%${safeQ}%`);
  if (org) query = query.eq("org_edrpou", org);

  const { data, error } = await query.limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ doctors: data });
}
