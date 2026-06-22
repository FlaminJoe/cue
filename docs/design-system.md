# Cue — design system

## Paleta kolorów
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

## Typografia
- **Nagłówki / logo:** Lora (serif), wagi 400/500/600
- **Interfejs / treść:** DM Sans (sans-serif), wagi 300/400/500
- Oba fonty z Google Fonts CDN

## Komponenty
- **Note card** — zaokrąglone rogi (18px), cień, złoty trójkąt dla przypiętych
- **Bottom sheets** — modalne okna wyjeżdżające od dołu, animacja `slideUp`
- **Capture bar** — sticky na dole, blur backdrop
- **Toast notifications** — centrycznie na dole, auto-hide po 2.5s
- **Nav tabs** — poziomy scroll, aktywny tab podkreślony akcentem

## Foldery / tagi — kolory
```
work      → zielony   (#6b8f6e)
studio    → akcent    (#c4764a)
personal  → fioletowy (#9080a0)
ideas     → złoty     (#c49a48)
inbox     → niebieski (#7090a8)
```

## Pomodoro — strategia "always on top" (Etap 4, rozwiązane)
Trzypoziomowa strategia, decydowana automatycznie:
1. **Sticky top bar** — mobile (`max-width: 899px` lub `pointer: coarse`)
2. **Floating widget** w prawym górnym rogu — desktop, draggable, pozycja w localStorage
3. **Pop-out → Document Picture-in-Picture** — Chrome/Edge 116+, prawdziwy always-on-top na poziomie OS

Implementacja w `app.js` (`renderPomoBar` / `renderPomoFloat` / `renderPomoPiP`). Silnik (`pomodoro.js`) bez zmian — czysta warstwa prezentacji. Fallback dla niewspierających PiP: floating widget zostaje. Dla v3 nadal otwarty pomysł osobnej apki Tauri (pełne systemowe always-on-top + global hotkey).
