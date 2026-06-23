/**
 * supabase.js
 * ─────────────────
 * Cue — warstwa danych. Obsługa Auth + CRUD na Supabase.
 *
 * Konwencja: aplikacja NIGDY nie odpytuje bazy bezpośrednio — wszystko przez te obiekty.
 * Zachowujemy frontowy kształt obiektów (z polem `ts` jako Number ms) dla kompatybilności z app.js;
 * mapowanie do/z kolumn snake_case dzieje się tu w warstwie.
 *
 * Zależy od: window.supabase (CDN @supabase/supabase-js, ładowane przed tym plikiem w index.html)
 * Używany przez: app.js (jako globalny window.CueDB)
 */

const SUPABASE_URL  = 'https://ekifvlwkxqxwswroispu.supabase.co';
const SUPABASE_ANON = 'sb_publishable_ZZAMyEMdaDlWBuwzB5thcA_krEzBbNC';

// Klient Supabase — singletton, dostępny przez całą aplikację.
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // przechwyt magic linka po przekierowaniu z emaila
    flowType: 'pkce',
  },
});

// ─────────────────────────────────────────────
//  MAPPERY (DB ↔ frontend)
// ─────────────────────────────────────────────

const toNote = r => r && ({
  id: r.id,
  title: r.title,
  titleAuto: r.title_auto !== false,    // true gdy Scribe nadał automatycznie
  body: r.body || '',
  folder: r.folder,
  tags: r.tags || [],
  pinned: !!r.pinned,
  ts: Date.parse(r.created_at),
});

const toTodo = r => r && ({
  id: r.id,
  text: r.text,
  done: !!r.done,
  due: r.due || '',
  priority: r.priority || null,         // 'low' | 'medium' | 'high' | null
  customFields: r.custom_fields || {},  // { [fieldId]: { kind, label, value } }
  ts: Date.parse(r.created_at),
});

const toShare = r => r && ({
  id: r.id,
  todoIds: r.todo_ids || [],
  title: r.title || '',
  revoked: !!r.revoked,
  expiresAt: r.expires_at,
  createdAt: r.created_at,
});

const toReminder = r => r && ({
  id: r.id,
  text: r.text,
  time: r.time,
  notified: !!r.notified,
});

const toPomodoro = r => r && ({
  id: r.id,
  todoId: r.todo_id,
  label: r.label,
  startedAt: r.started_at,
  durationSec: r.duration_sec,
  completed: !!r.completed,
});

// ─────────────────────────────────────────────
//  AUTH
// ─────────────────────────────────────────────

const Auth = {
  client: db.auth,

  async getUser() {
    const { data, error } = await db.auth.getUser();
    if (error) return null;
    return data.user || null;
  },

  async getSession() {
    const { data } = await db.auth.getSession();
    return data.session || null;
  },

  /**
   * Wysyła magic link na podany email.
   * Po kliknięciu w link użytkownik wraca pod `emailRedirectTo` ze ?code= w URL,
   * a `detectSessionInUrl: true` ustawia sesję automatycznie.
   */
  async signInWithEmail(email) {
    const { error } = await db.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) throw error;
  },

  async signOut() {
    const { error } = await db.auth.signOut();
    if (error) throw error;
  },

  onAuthChange(cb) {
    return db.auth.onAuthStateChange((event, session) => cb(event, session));
  },
};

// ─────────────────────────────────────────────
//  NOTES
// ─────────────────────────────────────────────

const Notes = {
  async getAll(userId) {
    const { data, error } = await db
      .from('notes')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(toNote);
  },

  async create(userId, { title, body, folder = 'inbox', tags = [], pinned = false, titleAuto = true }) {
    const { data, error } = await db
      .from('notes')
      .insert({ user_id: userId, title, body, folder, tags, pinned, title_auto: titleAuto })
      .select()
      .single();
    if (error) throw error;
    return toNote(data);
  },

  async update(id, userId, fields) {
    const allowed = ['title', 'body', 'folder', 'tags', 'pinned'];
    // mapowanie camelCase → snake_case
    if ('titleAuto' in fields) fields.title_auto = fields.titleAuto;
    allowed.push('title_auto');
    const payload = {};
    for (const k of allowed) if (k in fields) payload[k] = fields[k];
    const { data, error } = await db
      .from('notes')
      .update(payload)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();
    if (error) throw error;
    return toNote(data);
  },

  async delete(id, userId) {
    const { error } = await db.from('notes').delete().eq('id', id).eq('user_id', userId);
    if (error) throw error;
  },
};

// ─────────────────────────────────────────────
//  TODOS
// ─────────────────────────────────────────────

const Todos = {
  async getAll(userId) {
    const { data, error } = await db
      .from('todos')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(toTodo);
  },

  async create(userId, { text, done = false, due = null, priority = null, customFields = {} }) {
    const { data, error } = await db
      .from('todos')
      .insert({ user_id: userId, text, done, due: due || null, priority, custom_fields: customFields })
      .select()
      .single();
    if (error) throw error;
    return toTodo(data);
  },

  async update(id, userId, fields) {
    const allowed = ['text', 'done', 'due', 'priority'];
    if ('customFields' in fields) fields.custom_fields = fields.customFields;
    allowed.push('custom_fields');
    const payload = {};
    for (const k of allowed) if (k in fields) payload[k] = fields[k] === '' ? null : fields[k];
    const { data, error } = await db
      .from('todos')
      .update(payload)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();
    if (error) throw error;
    return toTodo(data);
  },

  async delete(id, userId) {
    const { error } = await db.from('todos').delete().eq('id', id).eq('user_id', userId);
    if (error) throw error;
  },
};

// ─────────────────────────────────────────────
//  SHARES (Etap 5 — link do udostępnienia zadań, bez logowania)
// ─────────────────────────────────────────────

const Shares = {
  async listForUser(userId) {
    const { data, error } = await db
      .from('shares')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(toShare);
  },

  async create(userId, { todoIds, title = null }) {
    const { data, error } = await db
      .from('shares')
      .insert({ user_id: userId, todo_ids: todoIds, title })
      .select()
      .single();
    if (error) throw error;
    return toShare(data);
  },

  async revoke(id, userId) {
    const { error } = await db
      .from('shares')
      .update({ revoked: true })
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw error;
  },

  /** Publiczny odczyt — bez auth, przez security definer RPC. Patrz schema.sql sekcja 4. */
  async getPublic(token) {
    const [{ data: meta, error: e1 }, { data: todos, error: e2 }] = await Promise.all([
      db.rpc('get_share_meta', { p_token: token }),
      db.rpc('get_shared_todos', { p_token: token }),
    ]);
    if (e1 || e2 || !meta || !meta.length) return null;
    return {
      title: meta[0].title || '',
      expiresAt: meta[0].expires_at,
      todos: (todos || []).map(toTodo),
    };
  },
};

// ─────────────────────────────────────────────
//  REMINDERS
// ─────────────────────────────────────────────

const Reminders = {
  async getAll(userId) {
    const { data, error } = await db
      .from('reminders')
      .select('*')
      .eq('user_id', userId)
      .order('time', { ascending: true });
    if (error) throw error;
    return (data || []).map(toReminder);
  },

  async create(userId, { text, time, notified = false }) {
    const { data, error } = await db
      .from('reminders')
      .insert({ user_id: userId, text, time, notified })
      .select()
      .single();
    if (error) throw error;
    return toReminder(data);
  },

  async update(id, userId, fields) {
    const allowed = ['text', 'time', 'notified'];
    const payload = {};
    for (const k of allowed) if (k in fields) payload[k] = fields[k];
    const { data, error } = await db
      .from('reminders')
      .update(payload)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();
    if (error) throw error;
    return toReminder(data);
  },

  async delete(id, userId) {
    const { error } = await db.from('reminders').delete().eq('id', id).eq('user_id', userId);
    if (error) throw error;
  },
};

// ─────────────────────────────────────────────
//  SETTINGS
// ─────────────────────────────────────────────

const Settings = {
  async get(userId) {
    const { data, error } = await db
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data || { user_id: userId, api_key: null };
  },

  async setApiKey(userId, apiKey) {
    const { error } = await db
      .from('user_settings')
      .upsert({ user_id: userId, api_key: apiKey }, { onConflict: 'user_id' });
    if (error) throw error;
  },
};

// ─────────────────────────────────────────────
//  POMODORO SESSIONS (Etap 3)
// ─────────────────────────────────────────────

const PomodoroSessions = {
  async getAll(userId, { limit = 100 } = {}) {
    const { data, error } = await db
      .from('pomodoro_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []).map(toPomodoro);
  },

  async create(userId, { todoId = null, label = null, durationSec, completed }) {
    const { data, error } = await db
      .from('pomodoro_sessions')
      .insert({
        user_id: userId,
        todo_id: todoId,
        label,
        duration_sec: durationSec,
        completed,
      })
      .select()
      .single();
    if (error) throw error;
    return toPomodoro(data);
  },
};

// ─────────────────────────────────────────────
//  AGENT QUEUE (placeholder pod v2 agentów)
// ─────────────────────────────────────────────

const AgentQueue = {
  async push(userId, { from_agent, to_agent, payload }) {
    const { error } = await db.from('agent_queue').insert({
      user_id: userId, from_agent, to_agent, payload, status: 'pending',
    });
    if (error) throw error;
  },

  async pending(userId, toAgent) {
    const { data, error } = await db
      .from('agent_queue')
      .select('*')
      .eq('user_id', userId)
      .eq('to_agent', toAgent)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async markDone(id) {
    const { error } = await db.from('agent_queue').update({ status: 'done' }).eq('id', id);
    if (error) throw error;
  },
};

window.CueDB = { Auth, Notes, Todos, Shares, Reminders, Settings, PomodoroSessions, AgentQueue, _db: db };
