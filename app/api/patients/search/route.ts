import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// Пошук пацієнта (схема lpz) лише на сервері через service_role — ключ
// ніколи не потрапляє в браузер. Повертає ПОВНИЙ запис (усі поля), тому
// пошук обов'язковий (мінімум 2 символи) — щоб не було випадкового дампу
// всієї таблиці (77 000+ записів) при порожньому запиті.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();

  if (q.length < 2) {
    return NextResponse.json({ error: "Введіть щонайменше 2 символи для пошуку" }, { status: 400 });
  }

  // Прибираємо кому/дужки — спецсимволи синтаксису фільтрів PostgREST,
  // щоб довільний ввід користувача не міг вплинути на структуру запиту.
  const safeQ = q.replace(/[,()]/g, "");

  let query = getSupabaseAdmin().schema("lpz").from("lpz_patients").select("*");
  query = UUID_RE.test(safeQ)
    ? query.eq("patient_id", safeQ)
    : query.or(`full_name.ilike.%${safeQ}%,tax_id.ilike.%${safeQ}%`);

  const { data, error } = await query.limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ patients: data });
}
