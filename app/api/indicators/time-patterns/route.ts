import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// Пікові навантаження по годині/дню тижня/місяцю — RPC
// public.lpz_time_pattern_cube (service_role).

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const bucket = searchParams.get("bucket") || "hour";

  const { data, error } = await getSupabaseAdmin().rpc("lpz_time_pattern_cube", {
    p_bucket: bucket,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rows: data });
}
