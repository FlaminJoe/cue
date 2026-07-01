# Cue — charakterystyka aplikacji + brief dla grafika

> Dokument dla grafika tworzącego branding Cue. Część 1 to kontekst (kim/czym jest produkt), część 2 to konkretne zlecenie (co dostarczyć).

---

## CZĘŚĆ 1 — Charakterystyka aplikacji

### Co to jest Cue
Cue to **osobisty „ambient life assistant"** — aplikacja PWA, która łączy w jednym miejscu notatki, zadania (to-do), przypomnienia, timer Pomodoro i asystenta AI. Działa na telefonie i desktopie z poziomu przeglądarki (instalowalna jak natywna apka).

Docelowa wizja jest większa niż „kolejny notatnik": Cue ma być **obecny w wielu punktach życia użytkownika** (telefon, desktop, w przyszłości IoT/głos) — cichy, w tle, gotowy gdy go potrzebujesz, ale nie napraszający się. Metafora: nie aplikacja, którą „otwierasz i zamykasz", tylko **stała, spokojna obecność** — jak dobry asystent, który zna kontekst i podpowiada we właściwym momencie. Stąd nazwa *Cue* („sygnał, podpowiedź, znak").

### Dla kogo
Główny target: **osoby z ADHD, przebodźcowani profesjonaliści i twórcy.** Ludzie, którzy:
- mają dużo w głowie i potrzebują „drugiego mózgu" (second brain),
- są przytłoczeni typowymi, „krzykliwymi" narzędziami produktywności (Notion, Todoist potrafią przytłaczać),
- cenią spokój wizualny, ciepło, brak rozpraszaczy, brak agresywnych notyfikacji i gamifikacji.

### Osobowość marki (najważniejsze!)
Trzy słowa-klucze, wszystko ma z nich wynikać:

1. **Ciepły** — przyjazny, ludzki, „domowy". Nie zimny tech, nie korpo-SaaS. Bliżej ciepłego światła lampy niż neonu.
2. **Nierozpraszający / spokojny** — wycisza, nie podkręca. Brak jaskrawości, brak chaosu, dużo oddechu (whitespace). Ma obniżać kortyzol, nie podnosić.
3. **Inteligentny, ale dyskretny** — jest tam AI, jest technologia, ale schowana. Asystent, który szepcze podpowiedź, a nie krzyczy powiadomieniem.

**Czym Cue NIE jest:** nie jest „produktywnościowym beastmode", nie jest hustle-culture, nie jest zimnym, technicznym dashboardem, nie jest dziecinne ani zabawkowe. Unikać estetyki „startup-tech-blue", gradientów SaaS, ostrych kontrastów, clipartowych ilustracji.

### Kontekst nazwy
- Obecna nazwa: **Cue**. Zaczęło jako `me·mo`, ale to już porzucone — branding robimy pod **Cue**.
- Wymowa: ang. /kjuː/ (jak „kju"). Znaczenie: sygnał, podpowiedź, wskazówka, moment wejścia (jak „cue" dla aktora na scenie). To celowo subtelne i pozytywne.

### Istniejący kierunek wizualny (punkt wyjścia, NIE świętość)
W appce już funkcjonuje paleta i typografia — grafik może je przyjąć jako bazę, rozwinąć albo zaproponować lepsze, ale **kierunek „ciepły, papierowy, stonowany" musi zostać.**

**Paleta (obecna):**
- Tła: ciepłe kremowe/beżowe — `#f7f0e6`, `#f0e6d6`, `#e8dac8`
- Karty: `#faf5ee`
- Tekst: ciemny brąz `#2c2416` (nie czysta czerń!), pomocniczy `#5a4e3c`, wyciszony `#9a8c78`
- **Główny akcent: rdzawy pomarańcz `#c4764a`** (terakota — ciepły, ziemisty)
- Akcenty pomocnicze (do kategorii): zieleń `#6b8f6e`, błękit `#7090a8`, fiolet `#9080a0`, złoto `#c49a48`, czerwień `#b85040`

Charakter palety: **ziemista, papierowa, „terakotowo-kremowa"** — jak ciepłe światło, kartka papieru, glina. Zero zimnych bieli i czystych czerni.

**Typografia (obecna):**
- Nagłówki / logo: **Lora** (serif) — daje ciepło i charakter
- Interfejs: **DM Sans** (sans-serif) — czysty, czytelny
- Grafik może zaproponować inne, jeśli lepiej oddadzą charakter, ale para serif (osobowość) + sans (funkcja) sprawdza się i warto rozważyć jej utrzymanie.

**Istniejąca ikona (placeholder do zastąpienia/dopracowania):**
Obecnie `icon.svg` to „ciepła świecąca kula" w palecie Cue (zastąpiła literę „C"). Metafora światła/obecności jest dobrym tropem, ale ikona jest prowizoryczna — grafik ma stworzyć docelową.

---

## CZĘŚĆ 2 — Brief / zlecenie

### Cel
Stworzyć **spójny system identyfikacji wizualnej Cue**, który komunikuje: ciepło, spokój, dyskretną inteligencję. Branding będzie używany w aplikacji webowej/PWA, na stronie, w komunikacji i (docelowo) w wersji SaaS.

### Zakres dostaw (deliverables)
1. **Logo**
   - Wersja podstawowa (logotyp: słowo „Cue" + ewentualny znak graficzny)
   - Wersja znaku/symbolu (sam sygnet — do ikony apki, favicona, avatara)
   - Warianty: poziomy, kwadratowy, monochromatyczny (1 kolor), w negatywie (na ciemnym tle)
   - Pliki: SVG (wektor, priorytet — apka jest webowa) + PNG w kilku rozmiarach
2. **Ikona aplikacji (PWA / app icon)** — KLUCZOWE technicznie:
   - Musi działać jako **maskable icon** (bezpieczny margines, bo systemy przycinają do koła/squircle)
   - Potrzebne rozmiary: `favicon` (SVG + 32px), `apple-touch-icon` (180px), `icon-192.png`, `icon-512.png`
   - Czytelna w bardzo małej skali (16–32px) — symbol musi być prosty
3. **System kolorów** — finalna paleta (może rozwinąć obecną): kolory główne, akcent, neutralne, kolory funkcyjne (sukces/uwaga/błąd), z kodami HEX. Najlepiej z myślą o trybie jasnym (i ew. notatka jak to przełożyć na dark mode w przyszłości).
4. **Typografia** — para fontów (nagłówki + interfejs), z fallbackami; najlepiej dostępne na Google Fonts (apka ładuje fonty z CDN — licencja webfont obowiązkowa).
5. **Mini brand guide (1–3 strony)** — jak używać logo (marginesy, czego nie robić), paleta, typografia, „ton wizualny" w 2–3 zdaniach. Nie trzeba opasłego brandbooka — zwięźle i praktycznie.
6. **(opcjonalnie, mile widziane):** szablon **OG image / social preview** (1200×630) do udostępniania linków, oraz prosty zestaw 4–6 ikonek w stylu marki (notatka, zadanie, przypomnienie, pomodoro, AI).

### Wymagania techniczne / ograniczenia
- **Format wektorowy (SVG) priorytetem** — produkt jest webowy, branding musi skalować się ostro od favicona po duży ekran.
- Logo i ikona muszą być czytelne w **monochromie** i w **bardzo małej skali**.
- Kolory podawać w **HEX** (apka to CSS — `--accent: #c4764a` itd.).
- Fonty: preferowane darmowe / open-source z webfont licencją (Google Fonts idealnie), bo ładujemy z CDN.
- Apka jest **light-mode-first** na ciepłym kremowym tle — branding musi działać na takim tle (nie projektować logo zakładając białe `#ffffff` tło).

### Ton wizualny — do's & don'ts
**Tak:** ciepłe światło, papier, glina, terakota, miękkie kształty, zaokrąglenia, oddech/whitespace, organiczność, subtelność, „handcrafted but clean".
**Nie:** zimny niebieski tech, neon, ostre kontrasty, korpo-gradienty SaaS, clipart, gamifikacja, jaskrawość, chaos, „brutalist", przeładowanie.

### Inspiracje / mood (kierunek, nie do kopiowania)
- Estetyka „calm tech" / „slow productivity" — aplikacje, które wyciszają (np. klimaty Things 3 w spokoju, ale cieplejsze; Stoic; Bear w nastroju papieru).
- Ciepłe, ziemiste palety: terakota, ochra, krem, glina.
- Metafora światła / sygnału / obecności (nazwa „Cue") — coś, co delikatnie „świeci" lub „wskazuje moment", bez krzyku.

### Informacje praktyczne
- Marka: **Cue** (wymowa /kju/). Twórca: FlaminJoe Studio.
- Domena docelowa: w trakcie wyboru (kandydaci: `heycue.pl` / `getcue.pl` / `mycue.pl`).
- Pliki źródłowe: poprosić o edytowalne źródła (np. `.fig` / `.ai` / `.svg`) oprócz eksportów.
- Kontekst biznesowy: na teraz narzędzie osobiste, docelowo potencjalny SaaS — branding ma „udźwignąć" przejście od osobistej apki do produktu, więc raczej dojrzały i ponadczasowy niż modny-na-sezon.
