import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .schema("lpz")
    .from("lpz_departments")
    .select("structure_id, org_edrpou, name, type_code, direction, block, beds")
    .order("org_edrpou")
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ departments: data });
}
