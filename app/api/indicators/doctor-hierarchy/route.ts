import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// Обсягові показники лікаря (з опційним напрямком/відділенням/гранулярністю
// часу) — RPC public.lpz_doctor_indicator_cube (service_role).

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const grain = searchParams.get("grain");
  const doctorId = searchParams.get("doctorId");
  const direction = searchParams.get("direction");
  const department = searchParams.get("department");

  const { data, error } = await getSupabaseAdmin().rpc("lpz_doctor_indicator_cube", {
    p_time_grain: grain || null,
    p_doctor_id: doctorId || null,
    p_direction: direction || null,
    p_department: department || null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rows: data });
}
