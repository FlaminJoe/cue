-- ================================================
-- Cue - Supabase schema (Etap 2 + Etap 4 migration)
-- ================================================
-- Uruchomienie:  Supabase Dashboard → SQL Editor → wklej całość → Run.
-- Idempotentne - można puścić ponownie (drop if exists / add column if not exists).
-- Etap 4 dodaje todos.priority - bez utraty istniejących danych.
-- ================================================

-- == 1. TABELE ==================================

create table if not exists public.notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  title_auto  boolean not null default true,    -- true = wygenerowany przez Scribe, false = wpisany przez usera
  body        text not null default '',
  folder      text not null default 'inbox'
              check (folder in ('work','studio','personal','ideas','inbox')),
  tags        text[] not null default '{}',
  pinned      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- Migracja inline (Etap 4): wszystkie istniejące tytuły zakładamy że to autogen Scribe
alter table public.notes add column if not exists title_auto boolean not null default true;
create index if not exists notes_user_id_idx on public.notes(user_id);
create index if not exists notes_created_at_idx on public.notes(created_at desc);

create table if not exists public.todos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  text        text not null,
  done        boolean not null default false,
  due         timestamptz,
  priority    text check (priority in ('low','medium','high')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- Migracja inline dla istniejących baz (priority dodane w Etapie 4)
alter table public.todos add column if not exists priority text;
-- Migracja inline: customowe pola zadania (Etap 5) - kształt patrz docs/database-schema.md
alter table public.todos add column if not exists custom_fields jsonb not null default '{}';
do $check$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'todos_priority_check'
  ) then
    alter table public.todos
      add constraint todos_priority_check check (priority in ('low','medium','high'));
  end if;
end $check$;
create index if not exists todos_user_id_idx on public.todos(user_id);
create index if not exists todos_priority_idx on public.todos(priority);

create table if not exists public.reminders (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  text        text not null,
  time        timestamptz not null,
  notified    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists reminders_user_id_idx on public.reminders(user_id);
create index if not exists reminders_time_idx on public.reminders(time);

create table if not exists public.user_settings (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  api_key     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.agent_queue (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  from_agent  text not null,
  to_agent    text not null,
  payload     jsonb not null default '{}',
  status      text not null default 'pending'
              check (status in ('pending','processing','done','failed')),
  created_at  timestamptz not null default now()
);
create index if not exists agent_queue_user_id_idx on public.agent_queue(user_id);
create index if not exists agent_queue_status_idx on public.agent_queue(status);

create table if not exists public.pomodoro_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  todo_id       uuid references public.todos(id) on delete set null,
  label         text,                          -- gdy sesja nie jest przypięta do to-do
  started_at    timestamptz not null default now(),
  duration_sec  integer not null,
  completed     boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists pomodoro_sessions_user_id_idx on public.pomodoro_sessions(user_id);
create index if not exists pomodoro_sessions_started_at_idx on public.pomodoro_sessions(started_at desc);

-- Udostępnianie zadań przez link (Etap 5) - `id` jest tokenem w URL (share.html?token=...).
-- Publiczny odczyt NIE idzie przez RLS policy na tej tabeli (patrz sekcja 4) - żeby uniknąć
-- sytuacji, w której ktokolwiek z anon key mógłby wylistować wszystkie aktywne udostępnienia
-- bez znajomości tokenu. Idzie wyłącznie przez security definer function.
create table if not exists public.shares (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  todo_ids    uuid[] not null default '{}',
  title       text,
  revoked     boolean not null default false,
  expires_at  timestamptz not null default (now() + interval '30 days'),
  created_at  timestamptz not null default now()
);
create index if not exists shares_user_id_idx on public.shares(user_id);

-- == 2. RLS =====================================

alter table public.notes              enable row level security;
alter table public.todos              enable row level security;
alter table public.reminders          enable row level security;
alter table public.user_settings      enable row level security;
alter table public.agent_queue        enable row level security;
alter table public.pomodoro_sessions  enable row level security;
alter table public.shares             enable row level security;

-- Polityki: user widzi/edytuje tylko swoje rekordy
do $rls$
declare
  t text;
begin
  for t in
    select unnest(array[
      'notes','todos','reminders','user_settings','agent_queue','pomodoro_sessions','shares'
    ])
  loop
    execute format('drop policy if exists %I on public.%I', t||'_select', t);
    execute format('drop policy if exists %I on public.%I', t||'_insert', t);
    execute format('drop policy if exists %I on public.%I', t||'_update', t);
    execute format('drop policy if exists %I on public.%I', t||'_delete', t);

    execute format(
      'create policy %I on public.%I for select using (auth.uid() = user_id)',
      t||'_select', t
    );
    execute format(
      'create policy %I on public.%I for insert with check (auth.uid() = user_id)',
      t||'_insert', t
    );
    execute format(
      'create policy %I on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t||'_update', t
    );
    execute format(
      'create policy %I on public.%I for delete using (auth.uid() = user_id)',
      t||'_delete', t
    );
  end loop;
end $rls$;

-- == 3. TRIGGERY ================================

-- 3a. updated_at auto-bump
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $updatedat$
begin
  new.updated_at = now();
  return new;
end $updatedat$;

drop trigger if exists notes_updated_at        on public.notes;
drop trigger if exists todos_updated_at        on public.todos;
drop trigger if exists user_settings_updated_at on public.user_settings;

create trigger notes_updated_at
  before update on public.notes
  for each row execute function public.handle_updated_at();

create trigger todos_updated_at
  before update on public.todos
  for each row execute function public.handle_updated_at();

create trigger user_settings_updated_at
  before update on public.user_settings
  for each row execute function public.handle_updated_at();

-- 3b. Auto-utworzenie wiersza w user_settings przy rejestracji
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $newuser$
begin
  insert into public.user_settings (user_id) values (new.id)
    on conflict (user_id) do nothing;
  return new;
end $newuser$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- == 4. PUBLICZNY ODCZYT UDOSTEPNIEN (Etap 5) ===

-- Jedyna droga, którą anonimowy odbiorca linku (share.html?token=...) dostaje dane.
-- Zwracają tylko wiersz dopasowany do podanego tokenu - nie ma query path, który
-- ujawni dane bez znajomości tokenu (w przeciwieństwie do RLS policy z `to anon`).
-- Działa bez FORCE ROW LEVEL SECURITY, bo funkcja jest tworzona przez właściciela
-- tabel (rola uruchamiająca ten skrypt), a właściciel tabeli jest domyślnie
-- zwolniony z RLS.

create or replace function public.get_share_meta(p_token uuid)
returns table (title text, expires_at timestamptz)
language sql
security definer
set search_path = public
as $sharemeta$
  select s.title, s.expires_at
  from public.shares s
  where s.id = p_token and not s.revoked and s.expires_at > now();
$sharemeta$;

create or replace function public.get_shared_todos(p_token uuid)
returns table (
  id uuid, text text, done boolean, due timestamptz, priority text,
  custom_fields jsonb, created_at timestamptz
)
language sql
security definer
set search_path = public
as $sharedtodos$
  select t.id, t.text, t.done, t.due, t.priority, t.custom_fields, t.created_at
  from public.todos t
  join public.shares s on s.user_id = t.user_id and t.id = any(s.todo_ids)
  where s.id = p_token and not s.revoked and s.expires_at > now();
$sharedtodos$;

grant execute on function public.get_share_meta(uuid)    to anon, authenticated;
grant execute on function public.get_shared_todos(uuid)  to anon, authenticated;
