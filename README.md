# Cue

Osobisty **ambient life assistant** — PWA (Progressive Web App) działająca w przeglądarce na telefonie i komputerze.

**Wizja:** inteligentny asystent obecny w wielu punktach (telefon, tablet, desktop, IoT). Użytkownik komunikuje się głosem lub tekstem, Cue pomaga pamiętać o obowiązkach, zdrowiu, celach i postępie. Nie odwraca uwagi — odzywa się tylko gdy trzeba.

**Stan v1:** PWA z notatkami, to-do, przypomnieniami, Ask AI i auto-tagowaniem (Claude Haiku). Trwa refactor i migracja na Supabase + auth.

## Stack
- Vanilla HTML/CSS/JS, design system (Lora + DM Sans, ciepła paleta kremowa)
- Claude API: `claude-sonnet-4-6` (Ask AI), `claude-haiku-4-5` (Scribe — tagowanie)
- Supabase Postgres + Auth + RLS *(podpinane w Etapie 2)*
- PWA: manifest + service worker, Web Speech API (`pl-PL`)
- Hosting: Vercel, auto-deploy z `main`

## Struktura
```
index.html              ← szkielet HTML, ładuje skrypty
styles.css              ← design system + komponenty
app.js                  ← główna logika
supabase.js             ← warstwa danych (placeholder w v1)
agents/
  router.js             ← intent detection (keyword-based)
  scribe.js             ← auto-tagowanie przez Claude Haiku
manifest.json           ← PWA config
sw.js                   ← service worker (offline/cache)
schema.sql              ← schemat Supabase (Etap 2)
CLAUDE.md               ← pełna dokumentacja dla Claude Code
```

## Lokalnie
```bash
python3 -m http.server 8000
# otwórz http://localhost:8000
```

Serwowanie statycznym serwerem wymagane — `file://` nie obsługuje service workera ani PWA.

## Branching
- `main` — produkcja (Vercel auto-deploy)
- `develop` — bieżąca praca
- `feature/*` — opcjonalnie

## Licencja
Projekt prywatny FlaminJoe Studio.
