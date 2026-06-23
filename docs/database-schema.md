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
id            uuid PK
user_id       uuid FK → auth.users
text          text
done          boolean default false
due           timestamptz nullable
priority      text (enum: low|medium|high, nullable)   -- Etap 4
custom_fields jsonb default '{}'                       -- Etap 5, patrz niżej
created_at    timestamptz
updated_at    timestamptz
```
`custom_fields` — zamknięty katalog typów (`text`/`number`/`url`/`select`/`checkbox`), nie generyczny field-builder. Kształt:
```json
{ "<fieldId>": { "kind": "url", "label": "Brief", "value": "https://..." } }
```
`fieldId` generowany po stronie klienta (`crypto.randomUUID()`), żeby można mieć wiele pól tego samego `kind`.

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

**`shares`** ← Etap 5, link do udostępnienia zadań bez logowania
```sql
id          uuid PK            -- to jest token w URL: share.html?token=<id>
user_id     uuid FK → auth.users
todo_ids    uuid[]
title       text nullable      -- widoczny dla odbiorcy, np. "Plan projektu X"
revoked     boolean default false
expires_at  timestamptz default now() + 30 dni
created_at  timestamptz
```

## Row Level Security
Wszystkie tabele (włącznie z `shares`) mają RLS włączone. Każdy user widzi wyłącznie swoje rekordy (`auth.uid() = user_id`). Polityki: select/insert/update/delete dla każdej tabeli.

`shares` **nie ma** polityki dla roli `anon` — naiwna polityka typu `using (not revoked and expires_at > now())` pozwoliłaby każdemu z (publicznym) anon key wylistować wszystkie aktywne udostępnienia wszystkich userów bez znajomości tokenu, bo RLS filtruje wiersze po ich zawartości, nie po tym czy caller znał token. Publiczny odczyt idzie wyłącznie przez dwie funkcje `security definer` (patrz niżej), które przyjmują token jako parametr i zwracają tylko dopasowany wiersz.

## Funkcje publicznego dostępu (Etap 5)
- `get_share_meta(p_token uuid)` — zwraca `title`/`expires_at` udostępnienia, jeśli token jest aktywny i nie wygasł.
- `get_shared_todos(p_token uuid)` — zwraca zadania objęte udostępnieniem (tylko-do-odczytu).
- Obie `grant execute ... to anon, authenticated`, ale tabele `shares`/`todos` nie dostają żadnego nowego grantu/polityki — funkcje działają, bo właściciel tabeli (rola uruchamiająca `schema.sql`) jest domyślnie zwolniony z RLS.
- Wywoływane z `share.js` przez `CueDB.Shares.getPublic(token)` → `db.rpc(...)`.

## Triggery
- `handle_updated_at()` — auto-update kolumny `updated_at` przy każdym UPDATE
- `handle_new_user()` — tworzy rekord w `user_settings` przy rejestracji nowego usera

## Zmienne środowiskowe (DB)
| Zmienna | Plik | Wartość |
|---|---|---|
| `SUPABASE_URL` | `supabase.js` | `https://ekifvlwkxqxwswroispu.supabase.co` |
| `SUPABASE_ANON` | `supabase.js` | klucz `sb_publishable_...` (nowy format) |

W v2 (React+Vite) przejdzie do `.env.local` jako `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON`. Klucz Claude API **nigdy** nie trafi do `.env` frontendu — zostanie w Vercel Environment Variables, używany tylko przez API Route (v2).
