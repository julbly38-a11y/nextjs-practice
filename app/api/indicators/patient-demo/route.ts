import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// Демографія пацієнтів (стать × вікова група) — RPC
// public.lpz_patient_demo_cube (service_role).

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const grain = searchParams.get("grain");
  const org = searchParams.get("org");

  const { data, error } = await getSupabaseAdmin().rpc("lpz_patient_demo_cube", {
    p_time_grain: grain || null,
    p_org_edrpou: org || null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rows: data });
}
