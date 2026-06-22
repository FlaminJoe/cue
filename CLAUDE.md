# Cue — Project Documentation
> Stan: aktywny, działający na produkcji. Pełna historia decyzji i otwarte wątki: pamięć `project_cue.md`.
> Szczegóły poniżej rozbite na pliki w `docs/` — czytaj je tylko gdy zadanie dotyczy danego obszaru, nie wczytuj wszystkich naraz.

## Czym jest Cue

Osobisty ambient life assistant — PWA (notatki, to-do, przypomnienia, Pomodoro, Ask AI). Docelowa wizja: asystent obecny w wielu punktach (telefon, desktop, IoT), głos+tekst, ciepły i nierozpraszający — "second brain" dla ADHD/przebodźcowanych profesjonalistów. Zaczęło się jako `me·mo`.

## Stack

| Warstwa | Technologia |
|---|---|
| Frontend | Vanilla HTML/CSS/JS (plan: React+Vite w v2) |
| Baza danych | Supabase (Postgres), region Frankfurt |
| Auth | Supabase Auth — magic link (Google OAuth planowane) |
| AI | Claude API — `claude-sonnet-4-6` (Ask AI), `claude-haiku-4-5-20251001` (Scribe/tagowanie) |
| Hosting | Vercel, auto-deploy z `main` |
| Voice | Web Speech API (`pl-PL`) |
| PWA | `manifest.json` + `sw.js`, Document Picture-in-Picture API dla Pomodoro pop-out |

## Repo i deployment

- **GitHub:** `github.com/FlaminJoe/cue`
- **Vercel:** domena `.vercel.app` (stała, nie zmienia się przy rename projektu)
- **Branching:** pracuj na `develop`, merguj do `main` gdy działa — Vercel auto-deploy z `main`
- **Supabase:** `https://ekifvlwkxqxwswroispu.supabase.co` (Frankfurt)

## Struktura plików

```
/
├── index.html, styles.css, app.js     ← UI i logika główna
├── supabase.js                        ← warstwa danych (Notes/Todos/Reminders/Settings) — nigdy nie wywołuj db.from() poza tym plikiem
├── pomodoro.js                        ← silnik timera, czysta separacja od UI
├── notifications.js                   ← Notify wrapper
├── agents/{router,scribe}.js          ← agenci v1 — patrz docs/agents-architecture.md
├── manifest.json, sw.js               ← PWA
├── schema.sql                         ← schemat DB, źródło prawdy — patrz docs/database-schema.md
└── docs/                              ← referencje szczegółowe (czytaj na żądanie)
    ├── database-schema.md             ← tabele, RLS, triggery
    ├── agents-architecture.md         ← Router/Scribe (v1) + Sorter/Seeker/Connector (planowane)
    ├── design-system.md               ← paleta, typografia, komponenty, strategia Pomodoro always-on-top
    ├── auth-flow.md                   ← przepływ logowania + konfiguracja Supabase URL
    └── roadmap-and-issues.md          ← znane problemy + roadmap v1.5-v3
```

## Stan implementacji — gdzie szukać

Tabela feature-by-feature i to co jest TYLKO planowane vs. zaimplementowane: **nie trzymamy jej tu** żeby nie się dezaktualizowała przy każdej zmianie — sprawdź `git log --oneline -15` i pamięć `project_cue.md` (ma datowane sekcje "Stan na ..."). Jeśli kod i pamięć się rozjeżdżają, kod wygrywa — zaktualizuj pamięć, nie zgaduj.

## Konwencje kodu

- Funkcje `camelCase`, pliki `kebab-case`, CSS zmienne `--kebab-case`
- Każdy plik JS: blok dokumentacyjny na górze (nazwa, krótki opis, zależności)
- Agent = obiekt z metodą `process()`/`route()` — wzorzec w `docs/agents-architecture.md`
- Wszystkie operacje DB przez `supabase.js` (`Notes.*`, `Todos.*`, ...), nigdy bezpośrednio `db.from()` w `app.js`
- Branching: `develop` → merge do `main` gdy działa

## Kontekst biznesowy

Narzędzie osobiste FlaminJoe (Toruń/Lubicz), potencjalny SaaS w v3 (Stripe, 99/199 PLN/mies). Target: ADHD, przebodźcowani profesjonaliści, twórcy. Pozycjonowanie: "ciepły, nierozpraszający second brain".

## Jak wrócić do projektu po przerwie

1. `cd "/Volumes/ADATA SE880/Claude/cue"` → `git status` && `git log --oneline -10`
2. Sprawdź pamięć `project_cue.md` — ma aktualny stan i otwarte wątki
3. Lokalne uruchomienie: `python3 -m http.server 8765` → `http://localhost:8765`
4. Logowanie: magic link na własny email LUB Dashboard → Authentication → Users → Send magic link
