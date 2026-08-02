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
  getTokenUrl?: string; // де взяти ключ/токен
  whereToAdd?: string; // куди його вписати (файл або сторінка налаштувань)
};

// Project ref цього застосунку в Supabase — підставлений у посилання нижче,
// щоб вести одразу на потрібний проєкт, а не на загальну сторінку логіну.
const SUPABASE_PROJECT_REF = "ubjnztanehqlsrqphdqy";

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
    getTokenUrl: `https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}/settings/api`,
    whereToAdd: "Вписати в .env.local у корені проєкту (для Vercel — Project → Settings → Environment Variables)",
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
    getTokenUrl: `https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}/settings/api`,
    whereToAdd: "Вписати в .env.local (лише сервер!) або у Vercel → Project → Settings → Environment Variables — ніколи в NEXT_PUBLIC_*",
  },
  {
    id: "direct-postgres",
    title: "Пряме підключення до Postgres",
    scope: "tooling",
    status: "available",
    description:
      "Підключення напряму по connection string (host db.<project-ref>.supabase.co або через connection pooler) — для міграцій, psql, ORM (Drizzle/Prisma), важких SQL-запитів в обхід PostgREST.",
    example: `psql "postgresql://postgres:[PASSWORD]@db.${SUPABASE_PROJECT_REF}.supabase.co:5432/postgres"`,
    note: "Пароль бази — окремо в Supabase Dashboard → Settings → Database. У цьому репозиторії не зберігається і не повинен зберігатись.",
    getTokenUrl: `https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}/settings/database`,
    whereToAdd: "Пароль — лише в локальний .env (DATABASE_URL) або менеджер паролів; не в git",
  },
  {
    id: "graphql",
    title: "GraphQL API",
    scope: "client-safe",
    status: "available",
    description:
      "Розширення pg_graphql — доступ до тих самих таблиць і тих самих RLS-політик, що й REST, але GraphQL-запитами. Автоматично доступне на кожному проєкті Supabase, у конструкторі поки не використовується.",
    example: `POST https://${SUPABASE_PROJECT_REF}.supabase.co/graphql/v1`,
    getTokenUrl: `https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}/settings/api`,
    whereToAdd: "Той самий anon-ключ, що й для Публічного API вище — окремого токена не потрібно",
  },
  {
    id: "management-api",
    title: "Management API / MCP",
    scope: "tooling",
    status: "used",
    description:
      "Адміністрування самого проєкту (не даних): список таблиць, міграції, edge functions, логи, advisors. Потребує особистого access-токена, а не ключа проєкту. Саме через це зараз працює Supabase MCP-сервер у Claude Code.",
    note: `Project ref цього застосунку: ${SUPABASE_PROJECT_REF}.`,
    getTokenUrl: "https://supabase.com/dashboard/account/tokens",
    whereToAdd: "Токен вписується в конфігурацію MCP-сервера (не в цей репозиторій) або в SUPABASE_ACCESS_TOKEN для Supabase CLI",
  },
  {
    id: "storage-auth-realtime",
    title: "Storage / Auth / Realtime API",
    scope: "client-safe",
    status: "available",
    description:
      "Три додаткові API на тому ж anon/service ключі: Storage (файли), Auth (реєстрація/логін користувачів), Realtime (підписка на зміни в таблицях через WebSocket). Жодне зараз не задіяне в конструкторі — кандидати на майбутнє: напр. Realtime для живого оновлення списку відділень, Storage для зображень у картках.",
    getTokenUrl: `https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}/settings/api`,
    whereToAdd: "Той самий anon/service ключ, що й вище — окремого токена не потрібно",
  },
];
