# Cue — architektura agentów

Projekt inspirowany `github.com/gnekt/My-Brain-Is-Full-Crew`, zaadaptowany do architektury cloud-native z Supabase zamiast lokalnych plików Obsidian.

## Zaimplementowane agenty (v1)

**Router** (`agents/router.js`)
- Wykrywa intent użytkownika na podstawie słów kluczowych (bez API call — szybko i bezpłatnie)
- Zwraca: `capture` | `todo` | `reminder` | `search` | `ask` | `unknown`
- Obsługuje polskie i angielskie słowa kluczowe
- W v2: można rozszerzyć o klasyfikację przez Claude API dla złożonych intentów
- **Status:** zdefiniowany, ale nie wpięty w capture flow — typ wybierany ręcznie chipem

**Scribe** (`agents/scribe.js`)
- Przetwarza surowy tekst (głos/klawiatura) w ustrukturyzowaną notatkę
- Wywołuje `claude-haiku-4-5-20251001` (szybki i tani — idealny do tagowania)
- Zwraca: `{ title, folder, tags }`
- Fallback: jeśli API call się nie uda, używa surowego tekstu jako tytułu i folderu `inbox`

## Planowane agenty (v2+)

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
- Aktywacja: async po dodaniu notatki, "co łączy X z Y?"

## Komunikacja między agentami
Tabela `agent_queue` w Supabase pełni rolę asynchronicznego message board.

```
Scribe → agent_queue { to_agent: 'sorter', payload: { note_id } }
Sorter → agent_queue { to_agent: 'connector', payload: { note_id } }
```

## Wzorzec kodu agenta
```js
const AgentName = {
  SYSTEM_PROMPT: `...`,
  async process(input, apiKey) { ... }
};
```
