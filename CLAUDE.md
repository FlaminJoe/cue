# Cue — Project Documentation
> Last updated: 2026-05-29 | Status: Active development | Version: 1.0-etap4

---

## ⚡ Status implementacji (po Etapie 4, 2026-05-29)

**Etap 4 (edycja + tasks + always-on-top Pomodoro) zrobiony na branchu `develop`:**
- Edycja notatek inline (tytuł, body, folder) w bottom sheet — `editNote`/`saveNote`
- Opcjonalny tytuł notatki przy capture; jeśli puste → Scribe generuje (flag `title_auto` w DB)
- Karty notatek nie pokazują autogen tytułu (tylko body) — ręczny tytuł jest eksponowany
- Rebrand UI: "To-Do" → "Zadania" wszędzie (tabela `todos` w DB bez zmian)
- 3 priorytety zadań (low/medium/high) z kolorowym paskiem z lewej i pill-em
- Filter zadań po priorytecie + sortowanie (priority → due → ts)
- Edycja zadań i przypomnień w tym samym sheet (tryb `editingTodoId`/`editingReminderId`)
- Pomodoro: floating widget w prawym górnym rogu na desktopie (draggable), sticky bar na mobile
- Pomodoro Pop-out → Document Picture-in-Picture API (Chrome/Edge 116+) — realny always-on-top
- Settings sheet zastąpił sam ⏻: zmiana API key, status powiadomień, instrukcja sync mobile, wyloguj
- Migracja schema: `notes.title_auto` boolean, `todos.priority` enum (idempotentne w `schema.sql`)

**Co działa od Etapu 3:**

**Co działa już teraz (w branchu `develop`):**
- Monolit `index.html` rozbity na: `styles.css`, `app.js`, `supabase.js` (placeholder), `agents/router.js`, `agents/scribe.js`
- Rebrand `me·mo` → `Cue` (title, manifest, copy w UI, README, localized PL)
- Scribe używa `claude-haiku-4-5-20251001` (było: sonnet-4-20250514 — overkill na tagowanie)
- Ask AI i Summarise używają `claude-sonnet-4-6` (było: sonnet-4-20250514)
- Voice rozpoznawanie: `pl-PL` (było: `en-GB`)
- localStorage keys zachowane (`memo_v2`, `memo_api_key`) dla kompatybilności wstecz — migracja do Supabase w Etapie 2

**Co jest TYLKO zaplanowane (placeholder/brak w kodzie):**
- Supabase (klient, auth, RLS, tabele) — `supabase.js` to placeholder zwracający puste obietnice
- `schema.sql` — pusty (TODO Etap 2)
- Auth flow (magic link, Google OAuth)
- Pomodoro timer (Etap 3)
- Edycja notatek/todo/przypomnień
- Router agent wpięty w UI (na razie typ wybierany ręcznie chipem — Router gotowy do v2)

**Najbliższe etapy:**
1. **Etap 2 — Supabase**: schema, RLS, auth, migracja z localStorage
2. **Etap 3 — Pomodoro**: sticky top bar z odliczaniem, pływający widget, powiązanie z to-do, Wake Lock + Notifications + Page Visibility, zapis sesji do `pomodoro_sessions`

---

## 1. Czym jest Cue

Cue to osobisty ambient life assistant — PWA (Progressive Web App) działająca w przeglądarce na telefonie i komputerze. Projekt zaczął się jako `me·mo`, prosty notatnik z AI, ale wizja rozrosła się do czegoś większego.

**Docelowa wizja (długoterminowa):**
Inteligentny asystent życiowy obecny w wielu punktach — telefon, tablet, smart ekrany w domu, samochód, urządzenia IoT. Użytkownik komunikuje się z nim głosem lub tekstem, a Cue pomaga pamiętać o obowiązkach, zdrowiu, celach i postępie w ich realizacji. Nie odwraca uwagi — jest obecny w tle i odzywa się gdy trzeba.

**Stan bieżący (v1):**
Działająca PWA z notatkami, to-do, przypomnieniami i pytaniami do AI. Właśnie migrujemy z localStorage na Supabase i dodajemy auth.

---

## 2. Stack technologiczny

| Warstwa | Technologia | Uwagi |
|---|---|---|
| Frontend | Vanilla HTML/CSS/JS | Plan migracji na React+Vite w v2 |
| CSS | Własny design system | Ciepła paleta kremowa, Lora + DM Sans |
| AI | Claude API (Anthropic) | claude-sonnet-4-6 (pytania), claude-haiku-4-5 (tagowanie) |
| Baza danych | Supabase (Postgres) | Region: Europe (Frankfurt) |
| Auth | Supabase Auth | Magic link + Google OAuth (planowane) |
| Hosting | Vercel | Auto-deploy z GitHub branch `main` |
| PWA | manifest.json + sw.js | Offline support, instalowalna |
| Voice | Web Speech API | Język: pl-PL |

---

## 3. Repozytorium i deployment

- **GitHub:** `https://github.com/FlaminJoe/cue`
- **Vercel:** sprawdź aktualny URL w panelu Vercel (po rename repo)
- **Supabase Project URL:** `https://ekifvlwkxqxwswroispu.supabase.co`
- **Supabase Region:** Europe (Frankfurt)

### Branching strategy
```
main      ← produkcja (= co jest na Vercelu, auto-deploy)
develop   ← bieżąca praca
feature/* ← nowe funkcje (opcjonalnie)
```
**Zasada:** pracuj na `develop`, merguj do `main` gdy coś działa.

---

## 4. Struktura plików (aktualna)

```
/
├── index.html          ← szkielet HTML, importuje wszystkie skrypty
├── styles.css          ← cały CSS (design tokens + komponenty)
├── app.js              ← główna logika aplikacji
├── supabase.js         ← warstwa danych (Auth, Notes, Todos, Reminders, Settings)
├── agents/
│   ├── scribe.js       ← agent: auto-tagowanie notatek przez Claude API
│   └── router.js       ← agent: wykrywanie intentu (notatka/todo/reminder)
├── manifest.json       ← konfiguracja PWA
├── sw.js               ← service worker (offline/cache)
├── schema.sql          ← schemat bazy danych Supabase
├── docs/
│   ├── supabase-setup.md
│   └── git-instrukcja.md
└── README.md
```

**Kolejność ładowania skryptów w index.html (ważne!):**
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
<script src="supabase.js"></script>
<script src="agents/scribe.js"></script>
<script src="agents/router.js"></script>
<script src="app.js"></script>
```

---

## 5. Baza danych — schemat Supabase

### Tabele

**`notes`**
```sql
id          uuid PK
user_id     uuid FK → auth.users
title       text
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
api_key     text        ← klucz Claude API użytkownika
created_at  timestamptz
updated_at  timestamptz
```

**`agent_queue`** ← przygotowana pod v2 agentów
```sql
id          uuid PK
user_id     uuid FK → auth.users
from_agent  text
to_agent    text
payload     jsonb
status      text (enum: pending|processing|done|failed)
created_at  timestamptz
```

### Row Level Security
Wszystkie tabele mają RLS włączone. Każdy user widzi wyłącznie swoje rekordy (`auth.uid() = user_id`). Polityki: select/insert/update/delete dla każdej tabeli.

### Triggery
- `handle_updated_at()` — auto-update kolumny `updated_at` przy każdym UPDATE
- `handle_new_user()` — tworzy rekord w `user_settings` przy rejestracji nowego usera

---

## 6. Architektura agentów

Projekt inspirowany `My-Brain-Is-Full-Crew` (github.com/gnekt/My-Brain-Is-Full-Crew), zaadaptowany do architektury cloud-native z Supabase zamiast lokalnych plików Obsidian.

### Zaimplementowane agenty (v1)

**Router** (`agents/router.js`)
- Wykrywa intent użytkownika na podstawie słów kluczowych (bez API call — szybko i bezpłatnie)
- Zwraca: `capture` | `todo` | `reminder` | `search` | `ask` | `unknown`
- Obsługuje polskie i angielskie słowa kluczowe
- W v2: można rozszerzyć o klasyfikację przez Claude API dla złożonych intentów

**Scribe** (`agents/scribe.js`)
- Przetwarza surowy tekst (głos/klawiatura) w ustrukturyzowaną notatkę
- Wywołuje `claude-haiku-4-5` (szybki i tani — idealny do tagowania)
- Zwraca: `{ title, folder, tags }`
- Fallback: jeśli API call się nie uda, używa surowego tekstu jako tytułu i folderu `inbox`

### Planowane agenty (v2)

**Sorter**
- Kategoryzuje notatki wg systemu PARA (Projects/Areas/Resources/Archive)
- Wyciąga to-do i przypomnienia z surowego tekstu automatycznie
- Aktywacja: po każdym capture przez Scribe, codziennie o ustalonej godzinie
- Używa: `agent_queue` w Supabase jako message board

**Seeker**
- Wyszukiwanie semantyczne + pełnotekstowe po notatkach
- v2a: Supabase `tsvector` (full-text search, bez embeddings)
- v2b: `pgvector` (semantic search, wymaga generowania embeddings)
- Aktywacja: pytania w trybie pytajnym, "znajdź", "pokaż mi"

**Connector**
- Szuka ukrytych powiązań między notatkami
- Wymaga: `pgvector` włączone w Supabase, tabela `note_links`
- Przy każdym nowym zapisie notatki → generuje embedding → szuka N najbliższych sąsiadów → zapisuje powiązania
- Model embeddingów: `text-embedding-3-small` (OpenAI) lub natywny Claude
- Aktywacja: async po dodaniu notatki, "co łączy X z Y?"

### Komunikacja między agentami
Tabela `agent_queue` w Supabase pełni rolę asynchronicznego message board (odpowiednik `agent-messages.md` z oryginalnego projektu).

```
Scribe → agent_queue { to_agent: 'sorter', payload: { note_id } }
Sorter → agent_queue { to_agent: 'connector', payload: { note_id } }
```

---

## 7. Auth — przepływ użytkownika

```
Pierwsze wejście
    ↓
Ekran logowania (magic link email lub Google OAuth)
    ↓
Email z linkiem → klik → przekierowanie na app URL
    ↓
Sprawdzenie user_settings.api_key
    ↓ (brak klucza)
Ekran onboardingu → wpisz klucz Claude API → zapisz do user_settings
    ↓
Główna aplikacja
```

**Ważna konfiguracja Supabase:**
- Authentication → URL Configuration → Site URL: nowy URL Vercela (sprawdź w panelu)
- Redirect URLs musi zawierać ten sam URL

**Klucz Claude API:**
- Przechowywany w `user_settings.api_key` w Supabase (nie localStorage!)
- Chroniony przez RLS — user widzi tylko swój klucz
- Wartość `'skip'` oznacza że user pominął onboarding AI

---

## 8. Design system

### Paleta kolorów
```css
--bg:      #f7f0e6   /* ciepłe kremowe tło */
--bg2:     #f0e6d6
--bg3:     #e8dac8
--card:    #faf5ee   /* karty/komponenty */
--ink:     #2c2416   /* główny tekst */
--ink2:    #5a4e3c
--ink3:    #9a8c78   /* muted/placeholder */
--accent:  #c4764a   /* główny akcent (rdzawy pomarańcz) */
--green:   #6b8f6e
--blue:    #7090a8
--purple:  #9080a0
--gold:    #c49a48
--red:     #b85040
```

### Typografia
- **Nagłówki / logo:** Lora (serif), wagi 400/500/600
- **Interfejs / treść:** DM Sans (sans-serif), wagi 300/400/500
- Oba fonty z Google Fonts CDN

### Komponenty
- **Note card** — zaokrąglone rogi (18px), cień, złoty trójkąt dla przypiętych
- **Bottom sheets** — modalne okna wyjeżdżające od dołu, animacja `slideUp`
- **Capture bar** — sticky na dole, blur backdrop
- **Toast notifications** — centrycznie na dole, auto-hide po 2.5s
- **Nav tabs** — poziomy scroll, aktywny tab podkreślony akcentem

### Foldery / tagi — kolory
```
work      → zielony  (#6b8f6e)
studio    → akcent   (#c4764a)
personal  → fioletowy (#9080a0)
ideas     → złoty    (#c49a48)
inbox     → niebieski (#7090a8)
```

---

## 9. Funkcje — stan implementacji

| Funkcja | Status | Uwagi |
|---|---|---|
| Capture tekst | ✅ działa | przez Router → Scribe |
| Capture głos | ✅ działa | Web Speech API, pl-PL |
| Auto-tagowanie AI | ✅ działa | Scribe agent, Haiku |
| Notatki — widok | ✅ działa | filtrowanie po folderach |
| Notatki — detail | ✅ działa | bottom sheet |
| Notatki — pin | ✅ działa | |
| Notatki — delete | ✅ działa | |
| Notatki — edit | ✅ działa | Etap 4 — inline w sheet |
| Notatki — opcjonalny tytuł | ✅ działa | Etap 4 — `title_auto` flag |
| Summarise notatki | ✅ działa | Sonnet |
| Zadania — widok | ✅ działa | pending + done, filter po priority |
| Zadania — toggle | ✅ działa | |
| Zadania — delete | ✅ działa | |
| Zadania — due date | ✅ działa | |
| Zadania — edit | ✅ działa | Etap 4 |
| Zadania — priorytet | ✅ działa | Etap 4 — low/medium/high |
| Przypomnienia | ✅ działa | co-minutowy check |
| Przypomnienia — edit | ✅ działa | Etap 4 |
| Push notifications | ⚠️ częściowe | wymaga HTTPS + permission |
| Ask AI | ✅ działa | max 40 notatek w kontekście |
| Szybkie prompty | ✅ działa | 4 gotowe pytania |
| Search (full-text) | ✅ działa | client-side filter |
| Search (semantic) | ❌ brak | planowane v2 (pgvector) |
| Auth (magic link) | ✅ zaimplementowane | wymaga uruchomienia schema.sql |
| Auth (Google) | ⚠️ szkielet | wymaga konfiguracji w Supabase |
| Supabase storage | ✅ zaimplementowane | wymaga uruchomienia schema.sql |
| PWA manifest | ✅ działa | |
| Service worker | ✅ działa | |

---

## 10. Znane problemy i ograniczenia

### Bezpieczeństwo
- **Klucz Claude API eksponowany w przeglądarce** — najważniejszy problem do rozwiązania w v2. Klucz jest w `user_settings` w Supabase (lepiej niż localStorage), ale nadal trafia do frontendu i jest widoczny w network tab. Rozwiązanie: Vercel API Route jako proxy (`/api/chat.js`) — klucz zostaje na serwerze.
- Anon key Supabase jest w kodzie `supabase.js` — to jest OK i akceptowalne dla kluczy publicznych Supabase, chronione przez RLS.

### Funkcjonalne
- **Edycja notatek/todo/przypomnień** — nie ma. Można tylko usunąć i stworzyć od nowa.
- **Supabase anon key** — projekt używa legacy JWT key (`eyJ...`). Supabase wprowadza nowe klucze `sb_publishable_...`. Migracja zalecana przed November 2025 (deadline na legacy keys).
- **Push notifications** — działają tylko na HTTPS z przyznanym permission. Na iOS Safari ograniczone.
- **Voice input** — `pl-PL` hardcoded. Nie ma ustawień języka.
- **Kontekst AI** — Ask AI bierze max 40 notatek. Przy dużej bazie notatek starsze znikają z kontekstu.
- **Offline** — service worker cachuje statyczne zasoby, ale dane wymagają połączenia (Supabase).

### Techniczne
- **Vanilla JS bez bundlera** — brak tree-shakingu, minifikacji, TypeScript. Wystarczające dla v1, ale ogranicza skalowalność kodu.
- **Brak testów** — zero unit/integration testów.
- **Brak error boundaries** — błąd w jednej funkcji może crashować całą aplikację.

---

## 11. Roadmap

### v1.5 — Drobne ulepszenia
- [x] Edycja notatek inline ✅ Etap 4
- [x] Edycja to-do i przypomnień ✅ Etap 4
- [x] Timer Pomodoro — pływający widget w rogu ✅ Etap 4 (+ PiP pop-out)
- [x] Migracja na nowe klucze Supabase (`sb_publishable_...`) ✅ Etap 2
- [x] Ustawienia użytkownika (zmiana klucza API) ✅ Etap 4
- [ ] Język voice (na razie hardcoded pl-PL)

### v2 — Właściwa architektura
- [ ] **React + Vite** — refactor całego frontendu
- [ ] **Tailwind CSS** — zastąpienie własnego CSS
- [ ] **Vercel API Route** jako proxy dla Claude API (klucz bezpieczny po stronie serwera)
- [ ] **Sorter agent** — PARA kategoryzacja, wyciąganie zadań z tekstu
- [ ] **Seeker agent** — full-text search przez Supabase `tsvector`
- [ ] **Google OAuth** — pełna konfiguracja
- [ ] **Edycja wszystkich elementów**
- [ ] **Tagi własne** — user może definiować własne tagi

### v2.5 — Semantic intelligence
- [ ] **pgvector** w Supabase — embeddings dla notatek
- [ ] **Connector agent** — powiązania semantyczne między notatkami, tabela `note_links`
- [ ] **Seeker v2** — semantic search zamiast full-text
- [ ] **Daily digest** — poranne podsumowanie dnia przez AI

### v3 — Publiczny launch
- [ ] **Monetyzacja** — Stripe, 99/199 PLN/miesiąc (lub EUR equivalent)
- [ ] **Onboarding flow** — dla nowych userów
- [ ] **Multi-device sync** — już działa przez Supabase, ale wymaga polishingu UI
- [ ] **Desktop overlay** — osobna aplikacja Tauri/Electron z "always on top" (timer, quick capture)
- [ ] **Mobile app** — wrapper PWA lub React Native

---

## 12. Pomodoro timer — decyzja projektowa (rozwiązane w Etapie 4)

Użytkownik chciał timer Pomodoro z funkcją "always on top".

**Rozwiązanie (Etap 4):** trzypoziomowa strategia, decydowana automatycznie:

1. **Sticky top bar** — mobile (`max-width: 899px` lub `pointer: coarse`)
2. **Floating widget w prawym górnym rogu** — desktop, draggable, pozycja zapisywana w localStorage
3. **Pop-out → Document Picture-in-Picture** — Chrome/Edge 116+, prawdziwy always-on-top na poziomie OS

Implementacja w `app.js` (`renderPomoBar` / `renderPomoFloat` / `renderPomoPiP`).
Silnik (`pomodoro.js`) bez zmian — to czysta warstwa prezentacji.

**Fallback dla niewspierających PiP:** floating widget zostaje. Dla v3 nadal otwarty pomysł osobnej apki Tauri (full systemowe always-on-top + global hotkey).

---

## 13. Konwencje kodu

### Nazewnictwo
- Funkcje: `camelCase` — `captureNote()`, `renderTodayView()`
- Pliki: `kebab-case` — `supabase.js`, `scribe.js`
- CSS klasy: `kebab-case` — `.note-card`, `.capture-bar`
- CSS zmienne: `--kebab-case` — `--accent`, `--ink2`

### Komentarze
Każdy plik zaczyna się od bloku dokumentacyjnego:
```js
/**
 * nazwa-pliku.js
 * ─────────────────
 * Krótki opis
 * Zależy od: ...
 * Używany przez: ...
 */
```

### Agenty
Każdy agent to obiekt z metodą `process()` lub `route()`:
```js
const AgentName = {
  SYSTEM_PROMPT: `...`,
  async process(input, apiKey) { ... }
};
```

### Supabase
Wszystkie operacje na bazie przez obiekty w `supabase.js`:
```js
Notes.getAll(userId)
Notes.create(userId, { title, body, folder, tags })
Notes.update(id, userId, fields)
Notes.delete(id, userId)
```
Nigdy bezpośrednio `db.from('notes')` w `app.js`.

---

## 14. Zmienne środowiskowe

Projekt nie używa `.env` w v1 (vanilla JS bez bundlera). Konfiguracja jest w plikach:

| Zmienna | Plik | Wartość |
|---|---|---|
| `SUPABASE_URL` | `supabase.js` | `https://ekifvlwkxqxwswroispu.supabase.co` |
| `SUPABASE_ANON` | `supabase.js` | `eyJhbGci...` (legacy JWT anon key) |
| `MODEL_SMART` | `app.js` | `claude-sonnet-4-6` |
| `MODEL_FAST` | `agents/scribe.js` | `claude-haiku-4-5-20251001` |

**W v2 (React+Vite)** konfiguracja przejdzie do `.env.local`:
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON=...
```
Klucz Claude API **nigdy** nie trafi do `.env` frontendu — zostanie w Vercel Environment Variables i będzie używany tylko przez API Route.

---

## 15. Kontekst biznesowy

- **Właściciel:** Flamin Joe (FlaminJoe na GitHub)
- **Studio:** Flamin Joe Studio — agencja kreatywno-marketingowa, Toruń/Lubicz
- **Cel projektu:** Narzędzie osobiste, potencjalnie SaaS w v3
- **Użytkownik docelowy:** Osoby z ADHD, przebodźcowani profesjonaliści, twórcy
- **Pozycjonowanie:** "Ciepły, nierozpraszający second brain który żyje w Twoim życiu"
- **Planowany pricing (v3):** 99/199 PLN/miesiąc, 30-day trial

---

## 16. Zasoby i inspiracje

- `github.com/gnekt/My-Brain-Is-Full-Crew` — wzorzec architektury agentów
- `github.com/maun11/claude-blog-engine` — referencyjna implementacja Claude Code skills
- `github.com/OthmanAdi/skill-deck` — skill deck pattern
- `github.com/rampstackco/claude-skills` — claude skills pattern
- Blair Enns — Win Without Pitching (filozofia pozycjonowania)
- Chris Do / The Futur — strategia agencji
