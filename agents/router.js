/**
 * agents/router.js
 * ─────────────────
 * Router agent — wykrywa intent użytkownika na podstawie słów kluczowych.
 * Nie wywołuje API (szybko i bezpłatnie). Polskie i angielskie keywordy.
 *
 * Zależy od: niczego
 * Używany przez: app.js (capture flow w v2 — obecnie typ wybierany ręcznie chipem)
 *
 * Zwraca jeden z: 'capture' | 'todo' | 'reminder' | 'search' | 'ask' | 'pomodoro' | 'unknown'
 */

const Router = {
  PATTERNS: {
    pomodoro: [
      /^\s*(pomodoro|pomidor|skup|focus|timer)\b/i,
      /\b(start (focus|pomodoro|timer))\b/i,
    ],
    reminder: [
      /^\s*(przypomnij|reminder|remind me|przypominaj)\b/i,
      /\b(za \d+\s*(min|minut|godz|godzin|h)\b)/i,
      /\b(o \d{1,2}[:.]\d{2}\b)/i,
      /\b(jutro|dziś wieczorem|tomorrow|tonight)\b/i,
    ],
    todo: [
      /^\s*(todo|zrób|zrobic|zrobić|dokończ|task)\b/i,
      /^\s*[-•]\s/,
      /\b(do zrobienia|na liście|na liscie)\b/i,
    ],
    search: [
      /^\s*(znajdź|znajdz|find|search|szukaj|pokaż|pokaz|show me)\b/i,
    ],
    ask: [
      /\?$/,
      /^\s*(jak|kiedy|dlaczego|co\b|kto|gdzie|why|how|what|when|who|where)\b/i,
      /^\s*(podsumuj|streść|summari[sz]e|summary)\b/i,
    ],
  },

  /**
   * Wykrywa intent z tekstu.
   * @param {string} text - surowy input użytkownika
   * @returns {string} jeden z intentów lub 'capture' (default)
   */
  detect(text) {
    if (!text || typeof text !== 'string') return 'unknown';
    const t = text.trim();
    if (!t) return 'unknown';

    for (const [intent, patterns] of Object.entries(this.PATTERNS)) {
      if (patterns.some(re => re.test(t))) return intent;
    }
    return 'capture';
  },
};

if (typeof window !== 'undefined') window.Router = Router;
