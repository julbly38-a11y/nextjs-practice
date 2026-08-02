// Довідник способів підключення до Supabase — усі варіанти API, якими
// користуються в роботі над цим проєктом (і суміжними: hospital-analytics,
// MCP-сервер у Claude Code). Показується в панелі "🔌 Підключення до бази".
//
// Це ДОВІДНИК, а не форма введення секретів: реальні ключі й паролі живуть
// лише в env-змінних (.env.local / Vercel), сюди не потрапляють.

export type ConnectionScope = "client-safe" | "server-only" | "tooling";

export type ApiConnectionVariant = {
  id: string;
  title: string;
  scope: ConnectionScope;
  status: "used" | "available";
  description: string;
  envVars?: string[];
  example?: string;
  note?: string;
};

export const SCOPE_LABELS: Record<ConnectionScope, string> = {
  "client-safe": "Безпечно в браузері",
  "server-only": "Лише на сервері",
  tooling: "Інструменти/DevOps",
};

export const API_CONNECTION_VARIANTS: ApiConnectionVariant[] = [
  {
    id: "public-api",
    title: "Публічний API (anon / publishable key)",
    scope: "client-safe",
    status: "used",
    description:
      "PostgREST-доступ через supabase-js з публічним (anon/publishable) ключем — безпечно викликати прямо в браузері, доступ до даних обмежується RLS-політиками на рівні Postgres, а не самим ключем.",
    envVars: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    example: "getSupabase().from('table').select('*')",
    note: "У цьому проєкті: lib/supabase.ts → getSupabase(). Схемі lpz анонний ключ недоступний (немає GRANT) — там чутливі дані пацієнтів.",
  },
  {
    id: "service-role",
    title: "Service role (admin) API",
    scope: "server-only",
    status: "used",
    description:
      "Той самий REST-доступ, але з admin-ключем service_role — повністю обходить RLS. Використовувати ЛИШЕ в серверному коді (Route Handlers, Server Actions), ніколи в клієнтських компонентах чи в цій панелі.",
    envVars: ["SUPABASE_SERVICE_KEY"],
    example: "getSupabaseAdmin().schema('lpz').from('lpz_departments').select(...)",
    note: "У цьому проєкті: lib/supabase.ts → getSupabaseAdmin(), викликається лише з app/api/departments/route.ts.",
  },
  {
    id: "direct-postgres",
    title: "Пряме підключення до Postgres",
    scope: "tooling",
    status: "available",
    description:
      "Підключення напряму по connection string (host db.<project-ref>.supabase.co або через connection pooler) — для міграцій, psql, ORM (Drizzle/Prisma), важких SQL-запитів в обхід PostgREST.",
    example: 'psql "postgresql://postgres:[PASSWORD]@db.<project-ref>.supabase.co:5432/postgres"',
    note: "Пароль бази — окремо в Supabase Dashboard → Settings → Database. У цьому репозиторії не зберігається і не повинен зберігатись.",
  },
  {
    id: "graphql",
    title: "GraphQL API",
    scope: "client-safe",
    status: "available",
    description:
      "Розширення pg_graphql — доступ до тих самих таблиць і тих самих RLS-політик, що й REST, але GraphQL-запитами. Автоматично доступне на кожному проєкті Supabase, у конструкторі поки не використовується.",
    example: "POST https://<project-ref>.supabase.co/graphql/v1",
  },
  {
    id: "management-api",
    title: "Management API / MCP",
    scope: "tooling",
    status: "used",
    description:
      "Адміністрування самого проєкту (не даних): список таблиць, міграції, edge functions, логи, advisors. Потребує особистого access-токена, а не ключа проєкту. Саме через це зараз працює Supabase MCP-сервер у Claude Code.",
    note: "Project ref цього застосунку: ubjnztanehqlsrqphdqy.",
  },
  {
    id: "storage-auth-realtime",
    title: "Storage / Auth / Realtime API",
    scope: "client-safe",
    status: "available",
    description:
      "Три додаткові API на тому ж anon/service ключі: Storage (файли), Auth (реєстрація/логін користувачів), Realtime (підписка на зміни в таблицях через WebSocket). Жодне зараз не задіяне в конструкторі — кандидати на майбутнє: напр. Realtime для живого оновлення списку відділень, Storage для зображень у картках.",
  },
];
