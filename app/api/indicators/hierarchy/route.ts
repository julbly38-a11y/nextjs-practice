import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// Показники лікарня/напрямок/відділення з будь-якою часовою гранулярністю —
// RPC public.lpz_indicator_cube (service_role, SECURITY DEFINER).

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const level = searchParams.get("level") || "hospital";
  const grain = searchParams.get("grain");
  const direction = searchParams.get("direction");
  const department = searchParams.get("department");

  const { data, error } = await getSupabaseAdmin().rpc("lpz_indicator_cube", {
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
