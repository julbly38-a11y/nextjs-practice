import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// Повторні госпіталізації (30/90 днів) — RPC public.lpz_readmission_cube
// (service_role), той самий рівень/гранулярність, що й lpz_indicator_cube.

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const level = searchParams.get("level") || "hospital";
  const grain = searchParams.get("grain");
  const direction = searchParams.get("direction");
  const department = searchParams.get("department");

  const { data, error } = await getSupabaseAdmin().rpc("lpz_readmission_cube", {
    p_level: level,
    p_time_grain: grain || null,
    p_direction: direction || null,
    p_department: department || null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rows: data });
}
