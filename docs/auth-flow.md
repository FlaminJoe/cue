# Cue — przepływ autoryzacji

```
Pierwsze wejście
    ↓
Ekran logowania (magic link email lub Google OAuth — Google planowane)
    ↓
Email z linkiem → klik → przekierowanie na app URL
    ↓
Sprawdzenie user_settings.api_key
    ↓ (brak klucza)
Ekran onboardingu → wpisz klucz Claude API → zapisz do user_settings
    ↓
Główna aplikacja
```

**Konfiguracja Supabase (Authentication → URL Configuration):**
- Site URL: produkcyjny URL Vercela
- Redirect URLs: musi zawierać ten sam URL (+ `/**`)

**Klucz Claude API:**
- Przechowywany w `user_settings.api_key` w Supabase (nie localStorage)
- Chroniony przez RLS — user widzi tylko swój klucz
- Wartość `'skip'` oznacza że user pominął onboarding AI
- Można zmienić w Settings sheet w aplikacji (Etap 4)
