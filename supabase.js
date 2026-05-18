/**
 * supabase.js
 * ─────────────────
 * Warstwa danych Cue — obsługa Auth + CRUD na Supabase.
 *
 * STATUS: PLACEHOLDER (Etap 1 refactoru).
 * W Etapie 2 podpinamy realnego klienta @supabase/supabase-js (już załadowany przez CDN w index.html)
 * + RLS-owane tabele z schema.sql.
 *
 * Konwencja: aplikacja NIGDY nie odpytuje bazy bezpośrednio — wszystko przez te obiekty.
 *
 * Zależy od: window.supabase (CDN @supabase/supabase-js, ładowane przed tym plikiem)
 * Używany przez: app.js
 */

const SUPABASE_URL  = 'https://ekifvlwkxqxwswroispu.supabase.co';
const SUPABASE_ANON = ''; // TODO Etap 2 — wkleić anon key z Supabase Dashboard

// W Etapie 1 klient nie jest jeszcze inicjalizowany — placeholdery zwracają wartości jak
// dotychczasowy localStorage state. W Etapie 2: const db = window.supabase.createClient(URL, ANON);
let db = null;

const Auth = {
  /** Aktualny user lub null. W Etapie 1 zawsze null (brak auth). */
  async getUser() { return null; },
  async signInWithEmail(email) { throw new Error('Auth: not implemented (Etap 2)'); },
  async signOut() { throw new Error('Auth: not implemented (Etap 2)'); },
  onAuthChange(cb) { /* noop */ },
};

const Notes = {
  async getAll(userId) { return []; },
  async create(userId, { title, body, folder, tags, pinned = false }) { return null; },
  async update(id, userId, fields) { return null; },
  async delete(id, userId) { return null; },
};

const Todos = {
  async getAll(userId) { return []; },
  async create(userId, { text, done = false, due = null }) { return null; },
  async update(id, userId, fields) { return null; },
  async delete(id, userId) { return null; },
};

const Reminders = {
  async getAll(userId) { return []; },
  async create(userId, { text, time, notified = false }) { return null; },
  async update(id, userId, fields) { return null; },
  async delete(id, userId) { return null; },
};

const Settings = {
  async get(userId) { return { api_key: null }; },
  async setApiKey(userId, apiKey) { return null; },
};

const PomodoroSessions = {
  async getAll(userId) { return []; },
  async create(userId, { todo_id = null, duration_sec, completed }) { return null; },
};

const AgentQueue = {
  async push(userId, { from_agent, to_agent, payload }) { return null; },
  async pending(userId, toAgent) { return []; },
  async markDone(id) { return null; },
};

if (typeof window !== 'undefined') {
  window.CueDB = { Auth, Notes, Todos, Reminders, Settings, PomodoroSessions, AgentQueue };
}
