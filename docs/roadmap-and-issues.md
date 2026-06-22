# Cue — roadmap i znane problemy

## Znane problemy i ograniczenia

### Bezpieczeństwo
- **Klucz Claude API eksponowany w przeglądarce** — najważniejszy problem do rozwiązania w v2. Klucz jest w `user_settings` w Supabase (lepiej niż localStorage), ale nadal trafia do frontendu i jest widoczny w network tab. Rozwiązanie: Vercel API Route jako proxy (`/api/chat.js`) — klucz zostaje na serwerze.
- Anon key Supabase jest w kodzie `supabase.js` — to jest OK i akceptowalne dla kluczy publicznych Supabase (nowy format `sb_publishable_...`), chronione przez RLS.

### Funkcjonalne
- **Push notifications** — działają tylko na HTTPS z przyznanym permission. Na iOS Safari ograniczone (wymaga iOS 16.4+, instalacji PWA).
- **Voice input** — `pl-PL` hardcoded. Nie ma ustawień języka.
- **Kontekst AI** — Ask AI bierze max 40 notatek. Przy dużej bazie notatek starsze znikają z kontekstu.
- **Offline** — service worker cachuje statyczne zasoby, ale dane wymagają połączenia (Supabase).
- **Router agent** zdefiniowany ale nie wpięty w capture flow (typ wybierany ręcznie chipem).
- **Brak Resend SMTP** — limit Supabase built-in 2-4 maile/dobę blokuje logowanie wielu osób naraz. Workaround dev: Dashboard → Authentication → Users → Send magic link (omija limit klient-side).

### Techniczne
- **Vanilla JS bez bundlera** — brak tree-shakingu, minifikacji, TypeScript. Wystarczające dla v1, ogranicza skalowalność kodu.
- **Brak testów** — zero unit/integration testów.
- **Brak error boundaries** — błąd w jednej funkcji może crashować całą aplikację.
- **Pomodoro PiP** — Chrome/Edge 116+ only. Safari nie wspiera Document PiP — float widget jako fallback.
- **Wake Lock API** — Chrome/Edge tak, Safari częściowo, Firefox za flagą.

## Roadmap

### v1.5 — Drobne ulepszenia (✅ zrobione w Etapie 4)
- [x] Edycja notatek/to-do/przypomnień inline
- [x] Timer Pomodoro — pływający widget + PiP pop-out
- [x] Migracja na nowe klucze Supabase (`sb_publishable_...`)
- [x] Ustawienia użytkownika (zmiana klucza API)
- [ ] Język voice (na razie hardcoded pl-PL)

### v2 — Właściwa architektura
- [ ] **React + Vite** — refactor całego frontendu
- [ ] **Tailwind CSS** — zastąpienie własnego CSS
- [ ] **Vercel API Route** jako proxy dla Claude API (klucz bezpieczny po stronie serwera)
- [ ] **Sorter agent** — PARA kategoryzacja, wyciąganie zadań z tekstu
- [ ] **Seeker agent** — full-text search przez Supabase `tsvector`
- [ ] **Google OAuth** — pełna konfiguracja
- [ ] **Tagi własne** — user może definiować własne tagi

### v2.5 — Semantic intelligence
- [ ] **pgvector** w Supabase — embeddings dla notatek
- [ ] **Connector agent** — powiązania semantyczne, tabela `note_links`
- [ ] **Seeker v2** — semantic search zamiast full-text
- [ ] **Daily digest** — poranne podsumowanie dnia przez AI

### v3 — Publiczny launch
- [ ] **Monetyzacja** — Stripe, 99/199 PLN/miesiąc
- [ ] **Onboarding flow** dla nowych userów
- [ ] **Multi-device sync polish** — backend już działa przez Supabase
- [ ] **Desktop overlay** — Tauri/Electron, prawdziwe always-on-top + global hotkey
- [ ] **Mobile app** — wrapper PWA lub React Native

## Zasoby i inspiracje
- `github.com/gnekt/My-Brain-Is-Full-Crew` — wzorzec architektury agentów
- `github.com/maun11/claude-blog-engine`, `github.com/OthmanAdi/skill-deck`, `github.com/rampstackco/claude-skills` — wzorce Claude Code skills
- Blair Enns — Win Without Pitching; Chris Do / The Futur — filozofia/strategia agencji (kontekst biznesowy właściciela, nie samego produktu)
