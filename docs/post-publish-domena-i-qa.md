# Cue — po publikacji: domena (lh.pl → Vercel) + QA Etapu 5

> Instrukcja do wykonania PO kupieniu custom domeny na lh.pl. Dwa niezależne bloki — można robić równolegle.
> Stan kodu na moment pisania: Etap 5 (custom pola zadań + share linki) jest na `main` i zdeployowany, schemat w bazie wgrany. Brakuje tylko: (a) brandowanej domeny zamiast `me-mo-...vercel.app`, (b) przeklikania E2E.

---

## A. Podłączenie domeny z lh.pl do Vercela

Załóżmy że kupiona domena to `cue.pl` (podmień na faktyczną). lh.pl jest tylko **rejestratorem** — hosting zostaje na Vercelu, lh.pl służy wyłącznie do ustawienia DNS.

### A1. Dodaj domenę w Vercelu
1. Vercel → projekt Cue → **Settings → Domains**.
2. Wpisz `cue.pl`, **Add**. Dodaj też `www.cue.pl` (Vercel zwykle proponuje redirect `www` → apex lub odwrotnie — zostaw domyślny).
3. Vercel pokaże wymagane rekordy DNS. Zapisz je — wartości potwierdź na ekranie Vercela, bo bywają aktualizowane. Na dziś standard to:
   - **Apex `cue.pl`** → rekord **A** na `76.76.21.21`
   - **`www.cue.pl`** → rekord **CNAME** na `cname.vercel-dns.com`

### A2. Ustaw DNS w panelu lh.pl
1. Panel lh.pl → domena `cue.pl` → **strefa DNS / edycja rekordów DNS**.
2. Dodaj rekordy dokładnie takie, jakie pokazał Vercel:
   - `A` | host `@` (lub puste/`cue.pl`) | wartość `76.76.21.21`
   - `CNAME` | host `www` | wartość `cname.vercel-dns.com`
3. Jeśli istnieją stare rekordy `A`/`CNAME` dla `@` i `www` wskazujące na hosting lh.pl — **usuń je** (inaczej będzie konflikt).
4. Zapisz. Propagacja DNS: zwykle minuty, czasem do kilku godzin.

### A3. Poczekaj na weryfikację + SSL
- W Vercel → Settings → Domains status zmieni się na **Valid Configuration**, a certyfikat SSL (Let's Encrypt) wystawi się automatycznie. Nic nie trzeba klikać.
- Sprawdź: `https://cue.pl` i `https://www.cue.pl` ładują appkę z kłódką (https).

### A4. ⚠️ KRYTYCZNE — zaktualizuj Supabase Auth (inaczej logowanie magic-link przestanie działać)
Magic linki prowadzą na URL skonfigurowany w Supabase. Po zmianie domeny trzeba go dopisać:
1. Supabase → projekt Cue → **Authentication → URL Configuration**.
2. **Site URL** → zmień na `https://cue.pl`.
3. **Redirect URLs** → dodaj `https://cue.pl/**` oraz `https://www.cue.pl/**`. Stary `https://me-mo-...vercel.app/**` możesz na razie zostawić (nie szkodzi), usuniesz po potwierdzeniu że nowa domena działa.
4. Zapisz. Przetestuj logowanie magic-linkiem na nowej domenie (patrz QA niżej).

### A5. Drobiazgi po zmianie domeny
- `manifest.json` używa `start_url: "/"` (względny) — **nie wymaga zmian**, PWA zadziała na nowej domenie.
- Service worker (`sw.js`) jest per-origin — na nowej domenie zainstaluje się od nowa, OK.
- Jeśli gdzieś w kodzie/README są zaszyte absolutne linki do `me-mo-...vercel.app` — podmień (szybki sweep: `grep -rn "me-mo" .`). Linki **share** (`share.html?token=...`) są względne, więc generują się już z nowej domeny automatycznie.
- Zaktualizuj `project_cue.md` w pamięci: otwarty wątek „rebranding adresu produkcyjnego" → zamknięty, nowa domena = `cue.pl`.

---

## B. QA Etapu 5 — przeklikać na żywej appce (incognito tam gdzie wskazane)

Wykonaj na produkcji (`https://cue.pl` po podpięciu, albo na obecnym `me-mo-...vercel.app` jeśli domena jeszcze nie gotowa). Zaloguj się magic-linkiem na własny email.

### B1. Custom pola zadań
1. Zakładka **Zadania** → dodaj nowe zadanie (lub edytuj istniejące) → w arkuszu kliknij **„+ Dodaj pole"**.
2. Sprawdź każdy z 5 typów (dodaj po jednym do testowego zadania):
   - [ ] **tekst/notatka** — wpisz tekst, zapisuje się i pokazuje na karcie zadania
   - [ ] **liczba (budżet)** — przyjmuje liczbę
   - [ ] **URL/link** — zapisuje się, na karcie jest klikalnym linkiem
   - [ ] **status (select)** — można wybrać jedną z 3 presetowych opcji
   - [ ] **checkbox** — przełącza się i stan się utrzymuje po odświeżeniu
3. [ ] Odśwież stronę → pola i wartości **przetrwały** (są w bazie, nie tylko w UI).
4. [ ] Usuń jedno pole → znika z zadania po zapisie.

### B2. Udostępnianie linkiem (read-only, bez logowania)
1. W widoku **Zadania** wejdź w tryb **„🔗"** → zaznacz 1–2 zadania → wygeneruj link `share.html?token=...`.
2. Skopiuj link, otwórz w **oknie incognito** (kluczowe — symuluje odbiorcę bez konta):
   - [ ] Strona ładuje się **bez proszenia o logowanie**.
   - [ ] Widać tylko udostępnione zadania (nie całą listę), **tylko do odczytu** — brak edycji/usuwania.
   - [ ] Custom pola dodane w B1 są widoczne i poprawnie sformatowane (link klikalny, status/checkbox czytelne).
3. [ ] Settings → **„Udostępnione linki"** → link jest na liście. Kliknij **cofnij/odwołaj**.
4. [ ] Odśwież incognito → link **już nie działa** (odwołany).

### B3. Smoke test reszty (że nic nie padło przy okazji)
- [ ] Notatki: dodaj/edytuj/usuń.
- [ ] Przypomnienie: ustaw i sprawdź że przychodzi.
- [ ] Pomodoro: start + pop-out (Picture-in-Picture).
- [ ] Ask AI: jedno zapytanie zwraca odpowiedź.
- [ ] (po zmianie domeny) magic-link logowanie działa na `cue.pl`.

### Jak raportować
Jeśli coś nie przejdzie — zanotuj: który krok, co się stało vs. czego oczekiwano, czy jest błąd w konsoli przeglądarki (F12 → Console). To wystarczy do diagnozy.
