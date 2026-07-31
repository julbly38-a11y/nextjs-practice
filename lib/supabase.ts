import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Ліниво, а не одразу при завантаженні модуля — інакше Next.js падає під час
// білду ("Collecting page data" імпортує route.ts ще до рантайму) з
// "supabaseUrl is required.", якщо для цього деплою (напр. Preview без
// налаштованих env vars у Vercel) змінні середовища ще не задані, хоча сам
// білд узагалі не звертається до Supabase.
let supabaseClient: SupabaseClient | null = null;
let supabaseAdminClient: SupabaseClient | null = null;

// Клієнтський/публічний доступ (anon key) — для схеми public.
export function getSupabase(): SupabaseClient {
  if (!supabaseClient) {
    supabaseClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return supabaseClient;
}

// Лише для серверного коду (Route Handlers, Server Actions) — service_role
// key ніколи не потрапляє в браузер. Потрібен для схеми lpz: anon-роль не
// має GRANT на цю схему (свідомо, там є й чутливі таблиці на кшталт
// пацієнтів/госпіталізацій), RLS-політики розраховані на серверний доступ.
export function getSupabaseAdmin(): SupabaseClient {
  if (!supabaseAdminClient) {
    supabaseAdminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
  }
  return supabaseAdminClient;
}
