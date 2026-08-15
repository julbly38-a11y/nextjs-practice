import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// Показники по діагнозу (МКХ-10, icd_primary) — RPC public.lpz_diagnosis_cube
// (service_role).

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const grain = searchParams.get("grain");
  const icd = searchParams.get("icd");
  const limit = Number(searchParams.get("limit")) || 20;
  const org = searchParams.get("org");
  const shift = searchParams.get("shift");

  const { data, error } = await getSupabaseAdmin().rpc("lpz_diagnosis_cube", {
    p_time_grain: grain || null,
    p_icd: icd || null,
    p_limit: limit,
    p_org_edrpou: org || null,
    p_shift: shift || null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rows: data });
}
