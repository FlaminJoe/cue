/**
 * agents/scribe.js
 * ─────────────────
 * Scribe agent — auto-tagowanie surowej notatki przez Claude Haiku.
 * Zwraca ustrukturyzowaną notatkę: { title, folder, tags }.
 * Fallback: jeśli API call zawiedzie, używa surowego tekstu jako tytułu i folderu 'inbox'.
 *
 * Zależy od: Claude API (claude-haiku-4-5)
 * Używany przez: app.js (capture flow)
 */

const Scribe = {
  MODEL: 'claude-haiku-4-5-20251001',
  MAX_TOKENS: 200,

  SYSTEM_PROMPT:
    'You tag personal notes. Respond ONLY with valid JSON, no markdown, no commentary. ' +
    'Schema: {"title":"max 8 word title summarising the note","folder":"work|studio|personal|ideas|inbox","tags":["1-3 short lowercase tags"]}',

  /**
   * Przetwarza surowy tekst w ustrukturyzowaną notatkę.
   * @param {string} text - surowa treść (z głosu lub klawiatury)
   * @param {string} apiKey - klucz Claude API
   * @returns {Promise<{title: string, folder: string, tags: string[]}>}
   */
  async process(text, apiKey) {
    const fallback = {
      title: text.slice(0, 60),
      folder: 'inbox',
      tags: ['inbox'],
    };

    if (!apiKey || apiKey === 'skipped') return fallback;

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: this.MODEL,
          max_tokens: this.MAX_TOKENS,
          system: this.SYSTEM_PROMPT,
          messages: [{ role: 'user', content: `Note:\n"${text}"` }],
        }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error.message);

      const raw = data.content[0].text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(raw);

      return {
        title: parsed.title || fallback.title,
        folder: parsed.folder || fallback.folder,
        tags: Array.isArray(parsed.tags) && parsed.tags.length ? parsed.tags : fallback.tags,
      };
    } catch (e) {
      console.warn('Scribe: tagowanie nieudane, używam fallbacku', e);
      return fallback;
    }
  },
};

if (typeof window !== 'undefined') window.Scribe = Scribe;
