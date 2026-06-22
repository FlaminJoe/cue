# Cue — schemat bazy danych (Supabase)

> Źródło prawdy: `schema.sql` w root repo (idempotentny, można puścić ponownie). Ten plik to opis/referencja, nie kopiuj do niego zmian bez aktualizacji `schema.sql`.

## Tabele

**`notes`**
```sql
id          uuid PK
user_id     uuid FK → auth.users
title       text
title_auto  boolean default true   -- Etap 4: true = wygenerowany przez Scribe, false = wpisany przez usera
body        text
folder      text (enum: work|studio|personal|ideas|inbox)
tags        text[]
pinned      boolean default false
created_at  timestamptz
updated_at  timestamptz
```

**`todos`**
```sql
id          uuid PK
user_id     uuid FK → auth.users
text        text
done        boolean default false
due         timestamptz nullable
priority    text (enum: low|medium|high, nullable)   -- Etap 4
created_at  timestamptz
updated_at  timestamptz
```

**`reminders`**
```sql
id          uuid PK
user_id     uuid FK → auth.users
text        text
time        timestamptz
notified    boolean default false
created_at  timestamptz
```

**`user_settings`**
```sql
user_id     uuid PK FK → auth.users
api_key     text        ← klucz Claude API użytkownika, per-user
created_at  timestamptz
updated_at  timestamptz
```

**`agent_queue`** ← przygotowana pod v2 agentów (Sorter/Connector)
```sql
id          uuid PK
user_id     uuid FK → auth.users
from_agent  text
to_agent    text
payload     jsonb
status      text (enum: pending|processing|done|failed)
created_at  timestamptz
```

**`pomodoro_sessions`** ← Etap 3
```sql
id            uuid PK
user_id       uuid FK → auth.users
todo_id       uuid FK → todos, nullable
label         text nullable
started_at    timestamptz
duration_sec  integer
completed     boolean default false
created_at    timestamptz
```

## Row Level Security
Wszystkie tabele mają RLS włączone. Każdy user widzi wyłącznie swoje rekordy (`auth.uid() = user_id`). Polityki: select/insert/update/delete dla każdej tabeli.

## Triggery
- `handle_updated_at()` — auto-update kolumny `updated_at` przy każdym UPDATE
- `handle_new_user()` — tworzy rekord w `user_settings` przy rejestracji nowego usera

## Zmienne środowiskowe (DB)
| Zmienna | Plik | Wartość |
|---|---|---|
| `SUPABASE_URL` | `supabase.js` | `https://ekifvlwkxqxwswroispu.supabase.co` |
| `SUPABASE_ANON` | `supabase.js` | klucz `sb_publishable_...` (nowy format) |

W v2 (React+Vite) przejdzie do `.env.local` jako `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON`. Klucz Claude API **nigdy** nie trafi do `.env` frontendu — zostanie w Vercel Environment Variables, używany tylko przez API Route (v2).
