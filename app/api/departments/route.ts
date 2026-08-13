import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const org = (searchParams.get("org") || "").trim();

  let query = getSupabaseAdmin()
    .schema("lpz")
    .from("lpz_departments")
    .select("structure_id, org_edrpou, name, type_code, direction, block, beds");
  if (org) query = query.eq("org_edrpou", org);
  const { data, error } = await query.order("org_edrpou").order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ departments: data });
}
