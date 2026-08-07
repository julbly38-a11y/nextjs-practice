import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// Загальнолікарняний КПІ-рядок — один рядок, view v_hospital_summary
// (схема public). Хоча GRANT SELECT формально є в anon, реальні рядки
// звідти видно лише під service_role — базові таблиці, на яких стоїть
// view, мають RLS, і anon під ним бачить 0 рядків (агрегати виходять
// нульові/null замість реальних чисел). Тому тут теж service_role.

export async function GET() {
  const { data, error } = await getSupabaseAdmin().from("v_hospital_summary").select("*").single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ summary: data });
}
