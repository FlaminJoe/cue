# Etap 4 — Follow-up

> Status: kod zrobiony na branchu `develop` (sesja 2026-05-29).
> Czeka na: migracja Supabase + smoke test + commit + merge + Vercel URL config.
> Przy następnej sesji Claude powinien przeczytać ten plik i [[project-cue]] memory.

---

## ✅ Co zostało zrobione w kodzie

- [x] Schema migracja: `notes.title_auto`, `todos.priority` (idempotentne `alter table`)
- [x] Warstwa CueDB: mappery + create/update dla nowych pól
- [x] Edycja notatek inline w sheet (tytuł, body, folder)
- [x] Opcjonalny tytuł notatki w capture (pusty → Scribe nadaje)
- [x] Karta notatki z auto-tytułem pokazuje tylko body (rozwiązuje problem usera)
- [x] Rebrand UI: "To-Do" → "Zadania" (tabela w DB nadal `todos`)
- [x] 3 priorytety zadań z kolorowym paskiem + pill
- [x] Filter zadań po priorytecie + sortowanie (priority → due → ts)
- [x] Edycja zadań i przypomnień (klik w wiersz lub ✎)
- [x] Pomodoro: floating widget w prawym górnym rogu (desktop), sticky bar (mobile)
- [x] Pomodoro Pop-out → Document Picture-in-Picture (Chrome/Edge 116+)
- [x] Settings sheet (⚙): zmiana API key, status powiadomień, info sync mobile, wyloguj
- [x] Bump cache SW: `cue-v2-etap4`
- [x] Aktualizacja `CLAUDE.md` + memory `project_cue`

---

## 🔲 TO-DO dla usera (kolejność)

### 1. Supabase — migracja schemy
- [ ] Otwórz Supabase Dashboard → SQL Editor
- [ ] Wklej całość `schema.sql` z `/Volumes/ADATA SE880/Claude/cue/schema.sql`
- [ ] Run
- [ ] Sprawdź czy nie ma błędów — istniejące dane bezpieczne (`add column if not exists`)

### 2. Smoke test lokalnie
Uruchom: `cd "/Volumes/ADATA SE880/Claude/cue" && python3 -m http.server 8765`
Otwórz: <http://localhost:8765>

**Notatki:**
- [ ] Dodaj notatkę bez tytułu → karta pokazuje tylko body (bez auto-tytułu)
- [ ] Dodaj notatkę z tytułem → karta eksponuje tytuł
- [ ] Otwórz starą notatkę → kliknij ✎ Edytuj → zmień tytuł/folder/body → Zapisz
- [ ] Wyczyść tytuł przy edycji → Scribe wygeneruje nowy

**Zadania:**
- [ ] Dodaj zadanie z priorytetem high → czerwony pasek z lewej + pill "Wysoki"
- [ ] Sprawdź sortowanie (high → medium → low → none)
- [ ] Filter chips: kliknij "Wysoki" → tylko high
- [ ] Edytuj istniejące zadanie (klik w tekst lub ✎) → zmień priorytet → Zapisz

**Przypomnienia:**
- [ ] Edytuj przypomnienie → zmień tekst i czas → Zapisz

**Pomodoro:**
- [ ] Powiększ okno >900px → kliknij 🍅 → start sesji
- [ ] Floating widget pojawia się w prawym górnym rogu
- [ ] Przeciągnij za `⋮⋮` → pozycja się zapisuje (odśwież → zostaje)
- [ ] Chrome/Edge: kliknij `⇱` → Pop-out otwiera prawdziwy always-on-top
- [ ] Zwiń okno przeglądarki <900px → widget znika, sticky bar wraca
- [ ] Zakończ sesję → check `pomodoro_sessions` w Supabase

**Settings:**
- [ ] ⚙ → zobacz zamaskowany klucz API
- [ ] Wpisz nowy klucz → Zaktualizuj → przetestuj Ask AI
- [ ] Status powiadomień widoczny

### 3. Commit + merge + deploy
- [ ] `cd "/Volumes/ADATA SE880/Claude/cue"`
- [ ] `git status` — sprawdź modyfikacje
- [ ] `git add -A`
- [ ] `git commit -m "feat: edit + priorities + PiP pomodoro (Etap 4)"`
- [ ] `git push origin develop`
- [ ] Merge `develop` → `main` (przez GitHub UI lub `git checkout main && git merge develop && git push`)
- [ ] Vercel auto-deploy odpali

### 4. Supabase — URL config dla produkcji
- [ ] Authentication → URL Configuration
- [ ] Site URL: zmień na `https://me-mo-personal-assistant.vercel.app`
- [ ] Redirect URLs: dodaj `https://me-mo-personal-assistant.vercel.app` i `https://me-mo-personal-assistant.vercel.app/**`
- [ ] (Zostaw też localhost dla devu)

### 5. Mobile sync
- [ ] Otwórz prod URL na telefonie
- [ ] Magic link na ten sam mail co lokalnie
- [ ] "Dodaj do ekranu głównego" w menu przeglądarki
- [ ] Sprawdź czy notatki/zadania/przypomnienia się synchronizują

### 6. (Opcjonalne, ale rekomendowane) Resend SMTP
- [ ] Authentication → Email Templates → SMTP Settings
- [ ] Skonfiguruj Resend (100 maili/dzień darmowe) — bez tego limit 2 maile/h Supabase blokuje normalne logowanie

---

## Decyzje projektowe z tej sesji

- **Tabela w bazie nadal `todos`** (UI = "Zadania"). Zmiana nazwy tabeli to ryzyko bez korzyści.
- **Pomodoro Pop-out** = Document Picture-in-Picture (Chrome/Edge 116+ only). Safari nie wspiera — floating widget zostaje jako fallback. Pełny systemowy always-on-top wymaga Tauri/Electron (v3 roadmap).
- **Stare auto-tytuły notatek** mają `title_auto = true` (default) → na karcie pokazuje się tylko body. Rozwiązuje problem zgłoszony w briefie.
- **Tytuł notatki przy capture** — input widoczny tylko gdy typ = 'note'. Pusty → Scribe.
- **Filter+sort zadań** — priority (high→none) → due (najbliższe) → ts (najnowsze).
- **Floating Pomodoro draggable** — pozycja zapisywana w `localStorage.cue_pomo_float_pos`.

---

## Co dalej (po Etapie 4)

- v2: React+Vite + Tailwind, Vercel API Route proxy dla Claude API, Sorter + Seeker agents
- v3: Stripe, desktop Tauri overlay z global hotkey i pełnym always-on-top
