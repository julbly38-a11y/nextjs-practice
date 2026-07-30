import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Клієнтський/публічний доступ (anon key) — для схеми public.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Лише для серверного коду (Route Handlers, Server Actions) — service_role
// key ніколи не потрапляє в браузер. Потрібен для схеми lpz: anon-роль не
// має GRANT на цю схему (свідомо, там є й чутливі таблиці на кшталт
// пацієнтів/госпіталізацій), RLS-політики розраховані на серверний доступ.
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
