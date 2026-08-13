import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await getSupabaseAdmin()
    .schema("lpz")
    .from("lpz_organizations")
    .select("edrpou, name, short_name, display_name, tagline, logo_url")
    .order("display_name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ organizations: data });
}
