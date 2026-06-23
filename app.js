/**
 * app.js
 * ─────────────────
 * Cue — główna logika aplikacji.
 * Stan, render, capture flow, Ask AI, voice, search, reminders check, PWA install, onboarding.
 *
 * Zależy od: Scribe (agents/scribe.js), Router (agents/router.js), CueDB (supabase.js)
 * Używany przez: index.html (jako ostatni skrypt, po wszystkich zależnościach)
 *
 * Flow startu (Etap 2 — auth-first):
 *   1. CueDB.Auth.getUser() → null → ekran logowania (magic link)
 *   2. User klika link w mailu → wraca → onAuthChange → ponowny boot
 *   3. Settings.get(userId) → api_key === null → ekran onboardingu klucza Claude API
 *   4. Migracja z localStorage `memo_v2` jeśli Supabase puste a localStorage ma dane
 *   5. Aplikacja
 */

// ─────────────────────────────────────────────
//  CONFIG
// ─────────────────────────────────────────────

const MODEL_SMART = 'claude-sonnet-4-6';
const LEGACY_STATE_KEY  = 'memo_v2';      // dane z czasów localStorage (migracja jednorazowa)
const LEGACY_API_KEY    = 'memo_api_key'; // klucz API z czasów localStorage

// ─────────────────────────────────────────────
//  STATE (w pamięci, synchronizowane z Supabase)
// ─────────────────────────────────────────────

let userId = null;
let apiKey = null;
let S = { notes: [], todos: [], reminders: [] };
let shareMode = false;
let selectedForShare = new Set();

// ─────────────────────────────────────────────
//  BOOTSTRAP
// ─────────────────────────────────────────────

async function bootstrap() {
  document.getElementById('capture-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); capture(); }
  });
  document.getElementById('capture-title').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('capture-input').focus(); }
  });
  // Capture-area startuje w trybie note → pokazuje pole tytułu
  document.querySelector('.capture-area').classList.add('type-note');
  registerSW();
  initPWAInstall();
  // Notification permission proszony explicit przy pierwszym reminderze/pomodoro,
  // nie cicho na starcie — mniej nachalnie.

  // Czekamy na INITIAL_SESSION event — sygnał że klient Supabase załadował sesję ze storage
  // i jest gotowy do query z poprawnym auth.uid(). Bez tego query mogą lecieć bez tokena
  // i RLS odda null zamiast danych.
  let initialFired = false;
  await new Promise(resolve => {
    CueDB.Auth.onAuthChange(async (event, session) => {
      if (event === 'INITIAL_SESSION') {
        initialFired = true;
        if (session?.user) onSignedIn(session.user);
        else showAuthScreen();
        resolve();
        return;
      }
      if (event === 'SIGNED_IN' && session?.user && userId !== session.user.id) {
        onSignedIn(session.user);
        return;
      }
      if (event === 'SIGNED_OUT') {
        onSignedOut();
      }
    });
    // Bezpiecznik: tylko jeśli INITIAL_SESSION naprawdę nie dotarł w 3s.
    setTimeout(() => {
      if (!initialFired) { showAuthScreen(); resolve(); }
    }, 3000);
  });
}

let _signInInFlight = false;

async function onSignedIn(user) {
  if (_signInInFlight) return;
  if (userId === user.id && apiKey) return; // już zalogowany i gotowy
  _signInInFlight = true;
  try {
    userId = user.id;
    window.__cueUserId = userId; // dla pomodoro.js (zapis sesji)
    hide('auth-screen');

    let settings;
    try { settings = await CueDB.Settings.get(userId); }
    catch (e) { showToast('Błąd Supabase: ' + e.message); return; }

    apiKey = settings.api_key || null;
    window.__cue = { userId, apiKey, settings, S }; // pomoc do debug w DevTools

    if (!apiKey) {
      show('onboarding');
      return;
    }

    await afterAuthReady();
  } finally {
    _signInInFlight = false;
  }
}

async function onSignedOut() {
  userId = null;
  window.__cueUserId = null;
  apiKey = null;
  S = { notes: [], todos: [], reminders: [] };
  hide('onboarding');
  showAuthScreen();
}

function showAuthScreen() {
  show('auth-screen');
  hide('onboarding');
  resetAuthCard();
}

/** Wywoływane gdy user jest zalogowany i ma klucz API. */
async function afterAuthReady() {
  hide('onboarding');
  renderGreeting();
  await loadFromCloud();
  await maybeMigrateFromLocalStorage();
  renderAll();
  initPomodoroUI();
  setInterval(checkReminders, 30000);
  checkReminders();
}

// ─────────────────────────────────────────────
//  AUTH UI
// ─────────────────────────────────────────────

async function sendMagicLink() {
  const email = document.getElementById('auth-email').value.trim();
  const errEl = document.getElementById('auth-error');
  errEl.style.display = 'none';
  if (!email || !email.includes('@')) {
    errEl.textContent = 'Wpisz poprawny email.';
    errEl.style.display = 'block';
    return;
  }
  try {
    await CueDB.Auth.signInWithEmail(email);
    document.getElementById('auth-sent-email').textContent = email;
    document.getElementById('auth-card-form').style.display = 'none';
    document.getElementById('auth-card-sent').style.display = 'block';
  } catch (e) {
    errEl.textContent = 'Nie udało się wysłać: ' + (e.message || 'nieznany błąd');
    errEl.style.display = 'block';
  }
}

function resetAuthCard() {
  document.getElementById('auth-card-form').style.display = 'block';
  document.getElementById('auth-card-sent').style.display = 'none';
  const errEl = document.getElementById('auth-error');
  if (errEl) errEl.style.display = 'none';
}

async function logout() {
  try {
    await CueDB.Auth.signOut();
    onSignedOut(); // bezpośrednio, bez polegania na evencie (Supabase czasem nie dispatcha)
  } catch (e) {
    showToast('Błąd wylogowania: ' + e.message);
  }
}

// ─────────────────────────────────────────────
//  DATA LOAD (z Supabase do pamięci)
// ─────────────────────────────────────────────

async function loadFromCloud() {
  try {
    const [notes, todos, reminders] = await Promise.all([
      CueDB.Notes.getAll(userId),
      CueDB.Todos.getAll(userId),
      CueDB.Reminders.getAll(userId),
    ]);
    S = { notes, todos, reminders };
  } catch (e) {
    showToast('Nie mogę załadować danych: ' + e.message);
    S = { notes: [], todos: [], reminders: [] };
  }
}

// ─────────────────────────────────────────────
//  MIGRACJA Z localStorage (jednorazowa)
// ─────────────────────────────────────────────

async function maybeMigrateFromLocalStorage() {
  const migratedKey = `cue_migrated_${userId}`;
  if (localStorage.getItem(migratedKey)) return;

  const raw = localStorage.getItem(LEGACY_STATE_KEY);
  if (!raw) {
    if (S.notes.length === 0 && S.todos.length === 0 && S.reminders.length === 0) {
      await seedNewUser();
    }
    localStorage.setItem(migratedKey, '1');
    return;
  }

  // Migrujemy tylko jeśli chmura jest pusta — nie nadpisujemy istniejących danych.
  if (S.notes.length > 0 || S.todos.length > 0 || S.reminders.length > 0) {
    localStorage.setItem(migratedKey, '1');
    return;
  }

  let legacy;
  try { legacy = JSON.parse(raw); } catch { return; }

  showToast('✦ Migruję dane z poprzedniej wersji…');
  try {
    for (const n of (legacy.notes || [])) {
      await CueDB.Notes.create(userId, {
        title: n.title, body: n.body, folder: n.folder, tags: n.tags, pinned: !!n.pinned,
      });
    }
    for (const t of (legacy.todos || [])) {
      await CueDB.Todos.create(userId, { text: t.text, done: !!t.done, due: t.due || null });
    }
    for (const r of (legacy.reminders || [])) {
      await CueDB.Reminders.create(userId, { text: r.text, time: r.time, notified: !!r.notified });
    }
    localStorage.setItem(migratedKey, '1');
    localStorage.removeItem(LEGACY_API_KEY);
    showToast('✓ Migracja zakończona');
    await loadFromCloud();
  } catch (e) {
    showToast('Migracja niepełna: ' + e.message);
  }
}

async function seedNewUser() {
  try {
    await CueDB.Notes.create(userId, {
      title: 'Witaj w Cue',
      body: 'Łap myśli na żywo — dotknij mikrofonu i powiedz, albo pisz poniżej. AI auto-taguje wszystko, żebyś nie musiał porządkować ręcznie.',
      folder: 'inbox', tags: ['inbox'], pinned: true,
    });
    await CueDB.Notes.create(userId, {
      title: 'Pierwsza notatka — pomysł studio',
      body: 'Możesz tu zapisać szybką myśl. Cue automatycznie zaproponuje folder i tagi.',
      folder: 'studio', tags: ['studio', 'ideas'], pinned: false,
    });
    await CueDB.Todos.create(userId, { text: 'Spróbuj dodać swoje pierwsze to-do', done: false });
    await loadFromCloud();
  } catch (e) { /* nieblokujące */ }
}

// ─────────────────────────────────────────────
//  RENDER
// ─────────────────────────────────────────────

function renderGreeting() {
  const h = new Date().getHours();
  document.getElementById('greeting').textContent =
    h < 12 ? 'Dzień dobry ☀️' : h < 17 ? 'Dobre popołudnie ✦' : 'Dobry wieczór 🌙';
  document.getElementById('today-date').textContent =
    new Date().toLocaleDateString('pl-PL', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
}

function renderAll() {
  renderToday();
  renderNotes();
  renderTodos();
  renderReminders();
}

function renderToday() {
  const today = new Date().toDateString();
  const todayR = S.reminders.filter(r => new Date(r.time).toDateString() === today);
  document.getElementById('today-reminders').innerHTML =
    todayR.length ? todayR.map(reminderHTML).join('') :
    '<p style="font-size:14px;color:var(--ink3);padding:4px 0">Brak przypomnień na dziś</p>';

  const pending = sortTodos(S.todos.filter(t => !t.done)).slice(0,5);
  document.getElementById('today-todos').innerHTML =
    pending.length ? pending.map(todoHTML).join('') :
    '<p style="font-size:14px;color:var(--ink3);padding:4px 0">Wszystko czyste ✓</p>';

  const recent = [...S.notes].sort((a,b) => b.ts - a.ts).slice(0,3);
  document.getElementById('today-notes').innerHTML =
    recent.length ? recent.map(noteCardHTML).join('') :
    emptyHTML('📝','Jeszcze nic','Złap pierwszą myśl poniżej!');
}

const FOLDERS = ['all','work','studio','personal','ideas','inbox'];
let activeFolder = 'all';

function renderNotes() {
  document.getElementById('folder-filter').innerHTML = FOLDERS.map(f =>
    `<button class="folder-chip note-tag tag-${f==='all'?'inbox':f} ${activeFolder===f?'active':''}"
      onclick="filterFolder('${f}')">${f[0].toUpperCase()+f.slice(1)}</button>`
  ).join('');

  const filtered = activeFolder === 'all' ? S.notes : S.notes.filter(n => n.folder === activeFolder);
  const sorted = [...filtered].sort((a,b) => (b.pinned?1:0)-(a.pinned?1:0) || b.ts-a.ts);
  document.getElementById('notes-list').innerHTML =
    sorted.length ? sorted.map(noteCardHTML).join('') :
    emptyHTML('📂','Brak notatek','Złap myśl poniżej!');
}

function filterFolder(f) { activeFolder = f; renderNotes(); }

let activePriorityFilter = 'all';   // 'all' | 'high' | 'medium' | 'low' | 'none'

function renderPriorityFilter() {
  const counts = {
    all: S.todos.filter(t=>!t.done).length,
    high: S.todos.filter(t=>!t.done && t.priority==='high').length,
    medium: S.todos.filter(t=>!t.done && t.priority==='medium').length,
    low: S.todos.filter(t=>!t.done && t.priority==='low').length,
    none: S.todos.filter(t=>!t.done && !t.priority).length,
  };
  const chip = (key, label, dotClass) =>
    `<span class="priority-filter-chip ${activePriorityFilter===key?'active':''}" onclick="filterByPriority('${key}')">
      ${dotClass?`<span class="priority-dot ${dotClass}"></span>`:''}${label} ${counts[key]}
    </span>`;
  document.getElementById('priority-filter').innerHTML =
    chip('all','Wszystkie','') +
    chip('high','Wysoki','high') +
    chip('medium','Średni','medium') +
    chip('low','Niski','low') +
    chip('none','Bez priorytetu','');
}

function filterByPriority(key) {
  activePriorityFilter = key;
  renderTodos();
}

function renderTodos() {
  renderPriorityFilter();
  let pending = S.todos.filter(t => !t.done);
  const done  = S.todos.filter(t => t.done);
  if (activePriorityFilter === 'none') pending = pending.filter(t => !t.priority);
  else if (activePriorityFilter !== 'all') pending = pending.filter(t => t.priority === activePriorityFilter);

  const sortedPending = sortTodos(pending);
  let html = '';
  if (sortedPending.length) html += sortedPending.map(todoHTML).join('');
  else if (S.todos.filter(t=>!t.done).length) html += '<p style="text-align:center;color:var(--ink3);padding:24px;font-size:13px">Nic z tym priorytetem</p>';

  if (done.length) html += `<div class="section-label" style="margin-top:20px">Zrobione (${done.length})</div>` + sortTodos(done).map(todoHTML).join('');
  if (!S.todos.length) html = emptyHTML('✅','Pusta lista','Dodaj zadanie przyciskiem +');
  document.getElementById('todos-list').innerHTML = html;
}

// ─────────────────────────────────────────────
//  UDOSTĘPNIANIE (Etap 5) — link bez logowania, tylko-do-odczytu
// ─────────────────────────────────────────────

function toggleShareMode() {
  shareMode = !shareMode;
  selectedForShare = new Set();
  renderTodos();
  renderShareBar();
}

function toggleShareSelect(id) {
  if (selectedForShare.has(id)) selectedForShare.delete(id);
  else selectedForShare.add(id);
  renderTodos();
  renderShareBar();
}

function renderShareBar() {
  const bar = document.getElementById('share-bar');
  if (!shareMode) { bar.style.display = 'none'; bar.innerHTML = ''; return; }
  bar.style.display = 'flex';
  const n = selectedForShare.size;
  bar.innerHTML = `
    <button class="cancel-btn" onclick="toggleShareMode()">Anuluj</button>
    <button class="submit-btn" ${n===0?'disabled':''} onclick="openShareCreate()">Udostępnij (${n})</button>`;
}

function openShareCreate() {
  document.getElementById('sheet-share-title').textContent = 'Udostępnij zadania';
  document.getElementById('sheet-share-body').innerHTML = `
    <div class="form-row"><label class="form-label">Tytuł (opcjonalnie, widoczny dla odbiorcy)</label>
      <input class="form-input" id="share-title-input" placeholder="np. Plan projektu X" /></div>
    <button class="submit-btn" onclick="confirmCreateShare()">Generuj link</button>`;
  openSheet('sheet-share');
}

async function confirmCreateShare() {
  const title = document.getElementById('share-title-input').value.trim() || null;
  try {
    const share = await CueDB.Shares.create(userId, { todoIds: [...selectedForShare], title });
    toggleShareMode();
    showShareResult(share);
  } catch (e) { showToast('Błąd: ' + e.message); }
}

function showShareResult(share) {
  const url = `${location.origin}/share.html?token=${share.id}`;
  const expiry = new Date(share.expiresAt).toLocaleDateString('pl-PL', { day:'numeric', month:'long', year:'numeric' });
  document.getElementById('sheet-share-title').textContent = 'Link gotowy';
  document.getElementById('sheet-share-body').innerHTML = `
    <div class="form-row"><label class="form-label">Link dla odbiorcy</label>
      <input class="form-input" id="share-url-output" value="${esc(url)}" readonly onclick="this.select()" /></div>
    <button class="submit-btn" onclick="copyShareLink()">Kopiuj link</button>
    <div style="font-size:13px;color:var(--ink3);margin-top:10px">
      Wygasa: ${expiry}. Tylko-do-odczytu — odbiorca nie może niczego zmienić.</div>`;
  openSheet('sheet-share');
}

function copyShareLink() {
  const inp = document.getElementById('share-url-output');
  navigator.clipboard?.writeText(inp.value)
    .then(() => showToast('🔗 Skopiowano'))
    .catch(() => showToast('Nie udało się skopiować — zaznacz i Ctrl+C'));
}

function shareStatusLabel(s) {
  if (s.revoked) return 'Cofnięty';
  if (new Date(s.expiresAt) < new Date()) return 'Wygasł';
  return 'Aktywny';
}

function shareRowHTML(s) {
  const status = shareStatusLabel(s);
  const expiry = new Date(s.expiresAt).toLocaleDateString('pl-PL', { day:'numeric', month:'short' });
  return `<div class="share-row">
    <div style="flex:1;min-width:0">
      <div style="font-size:14px;color:var(--ink)">${esc(s.title || `${s.todoIds.length} zadań`)}</div>
      <div style="font-size:12px;color:var(--ink3)">${status} · do ${expiry}</div>
    </div>
    ${status==='Aktywny' ? `<button class="row-del" onclick="revokeShare('${s.id}')" title="Cofnij">Cofnij</button>` : ''}
  </div>`;
}

async function revokeShare(id) {
  try {
    await CueDB.Shares.revoke(id, userId);
    showToast('🔒 Link cofnięty');
    openSettings();
  } catch (e) { showToast('Błąd: ' + e.message); }
}

function renderReminders() {
  const sorted = [...S.reminders].sort((a,b) => new Date(a.time)-new Date(b.time));
  document.getElementById('reminders-list').innerHTML =
    sorted.length ? sorted.map(r => reminderHTML(r, true)).join('') :
    emptyHTML('🔔','Brak przypomnień','Dotknij +, by ustawić');
}

// ─────────────────────────────────────────────
//  HTML BUILDERS
// ─────────────────────────────────────────────

function noteCardHTML(n) {
  // Auto-tytuł (Scribe) ukrywamy w karcie — body niesie treść.
  // Ręczny tytuł użytkownika eksponujemy na górze, mocno.
  const titleHTML = n.titleAuto
    ? ''
    : `<div class="note-title">${esc(n.title)}</div>`;
  return `<div class="note-card ${n.pinned?'pinned':''}" onclick="openNote('${n.id}')">
    ${titleHTML}
    <div class="note-body">${esc(n.body)}</div>
    <div class="note-footer">
      <span class="note-tag tag-${n.folder||'inbox'}">${n.folder||'inbox'}</span>
      ${(n.tags||[]).filter(t=>t!==n.folder).map(t=>`<span class="note-tag tag-${t}">${t}</span>`).join('')}
      <span class="note-time">${ago(n.ts)}</span>
    </div>
  </div>`;
}

const PRIORITY_LABELS = { low: 'Niski', medium: 'Średni', high: 'Wysoki' };

// Zamknięty katalog typów customowych pól zadania — nie generyczny field-builder,
// żeby dodawanie pola było szybkie (klik, nie konfiguracja nowego typu).
const FIELD_KINDS = {
  text:     { label: 'Notatka',  icon: '📝' },
  number:   { label: 'Budżet',   icon: '💰' },
  url:      { label: 'Link',     icon: '🔗' },
  select:   { label: 'Status',   icon: '🏷️' },
  checkbox: { label: 'Checkbox', icon: '☑️' },
};
const STATUS_OPTIONS = ['Do zatwierdzenia', 'W trakcie', 'Zatwierdzone'];

function fieldPillHTML(f) {
  const info = FIELD_KINDS[f.kind];
  if (!info || f.value === '' || f.value == null) return '';
  if (f.kind === 'checkbox' && !f.value) return '';
  const display = f.kind === 'checkbox' ? (f.label || info.label) : (f.label ? `${f.label}: ${f.value}` : `${f.value}`);
  return `<span class="field-pill">${info.icon} ${esc(display)}</span>`;
}

function todoHTML(t) {
  const prClass = t.priority ? `priority-${t.priority}` : '';
  const pill = t.priority
    ? `<span class="priority-pill ${t.priority}">${PRIORITY_LABELS[t.priority]}</span>`
    : '';
  const due = t.due ? `<span class="todo-due">📅 ${fmtDT(t.due)}</span>` : '';
  const metaRow = (pill || due) ? `<div class="todo-meta-row">${pill}${due}</div>` : '';
  const fieldPills = Object.values(t.customFields || {}).map(fieldPillHTML).join('');
  const fieldsRow = fieldPills ? `<div class="todo-fields-row">${fieldPills}</div>` : '';

  if (shareMode) {
    const sel = selectedForShare.has(t.id);
    return `<div class="todo-item ${t.done?'done':''} ${prClass} share-mode ${sel?'share-selected':''}" onclick="toggleShareSelect('${t.id}')">
      <div class="share-check ${sel?'checked':''}">${sel?'✓':''}</div>
      <div style="flex:1;min-width:0">
        <div class="todo-text ${t.done?'done':''}">${esc(t.text)}</div>
        ${metaRow}
        ${fieldsRow}
      </div>
    </div>`;
  }

  return `<div class="todo-item ${t.done?'done':''} ${prClass}">
    <div class="todo-check ${t.done?'checked':''}" onclick="toggleTodo('${t.id}');event.stopPropagation()">${t.done?'✓':''}</div>
    <div style="flex:1;min-width:0" onclick="editTodo('${t.id}')">
      <div class="todo-text ${t.done?'done':''}">${esc(t.text)}</div>
      ${metaRow}
      ${fieldsRow}
    </div>
    <div class="row-actions">
      <button class="row-edit" onclick="editTodo('${t.id}');event.stopPropagation()" title="Edytuj">✎</button>
      <button class="row-del" onclick="deleteTodo('${t.id}');event.stopPropagation()" title="Usuń">✕</button>
    </div>
  </div>`;
}

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2, null: 3, undefined: 3 };

function sortTodos(arr) {
  return [...arr].sort((a, b) => {
    const ap = PRIORITY_ORDER[a.priority];
    const bp = PRIORITY_ORDER[b.priority];
    if (ap !== bp) return ap - bp;
    // następnie due (najbliższy najwyżej)
    if (a.due && b.due) return new Date(a.due) - new Date(b.due);
    if (a.due && !b.due) return -1;
    if (!a.due && b.due) return 1;
    return b.ts - a.ts;
  });
}

function reminderHTML(r, showActions=false) {
  const past = new Date(r.time) < new Date();
  const actions = showActions ? `
    <div class="row-actions">
      <button class="row-edit" onclick="editReminder('${r.id}')" title="Edytuj">✎</button>
      <button class="row-del" onclick="deleteReminder('${r.id}')" title="Usuń">✕</button>
    </div>` : '';
  return `<div class="reminder-item ${past?'past':''}">
    <div style="font-size:18px">${past?'✓':'🔔'}</div>
    <div style="flex:1;min-width:0">
      <div class="reminder-text">${esc(r.text)}</div>
      <div class="reminder-time">${fmtDT(r.time)}</div>
    </div>
    ${actions}
  </div>`;
}

function emptyHTML(icon,title,sub) {
  return `<div class="empty"><div class="empty-icon">${icon}</div><div class="empty-title">${title}</div><div class="empty-sub">${sub}</div></div>`;
}

// ─────────────────────────────────────────────
//  CAPTURE
// ─────────────────────────────────────────────

let captureType = 'note';

function setType(t, el) {
  captureType = t;
  document.querySelectorAll('.type-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  const hints = {
    note:'tytuł opcjonalny · pisz · ↑ aby zapisać',
    todo:'wpisz zadanie · ↑ aby dodać (priorytet potem)',
    reminder:'wpisz przypomnienie · ↑ aby dodać (czas potem)'
  };
  document.getElementById('capture-hint').textContent = hints[t];
  document.getElementById('capture-input').placeholder =
    t==='note' ? 'Złap myśl…' : t==='todo' ? 'Co zrobić?' : 'Przypomnij mi…';
  // Pole tytułu widoczne tylko gdy typ = note
  const area = document.querySelector('.capture-area');
  area.classList.toggle('type-note', t === 'note');
  if (t !== 'note') document.getElementById('capture-title').value = '';
}

async function capture() {
  if (!userId) { showToast('Sesja wygasła — zaloguj się ponownie'); return; }
  const inp = document.getElementById('capture-input');
  const titleInp = document.getElementById('capture-title');
  const text = inp.value.trim();
  const manualTitle = (titleInp.value || '').trim();
  if (!text) return;
  inp.value = ''; titleInp.value = ''; autoResize(inp);

  if (captureType === 'todo') {
    try {
      const t = await CueDB.Todos.create(userId, { text });
      S.todos.unshift(t);
      renderAll(); showToast('✓ Dodane');
    } catch (e) { showToast('Błąd: ' + e.message); }
    return;
  }

  if (captureType === 'reminder') {
    openAddSheet('reminder', text); return;
  }

  // Notatka — Scribe tagowanie (Haiku). Tytuł ręczny ma pierwszeństwo.
  showToast('✦ Zapisuję…');
  const tagged = await Scribe.process(text, apiKey || '');
  const finalTitle = manualTitle || tagged.title;
  const titleAuto = !manualTitle;
  try {
    const n = await CueDB.Notes.create(userId, {
      title: finalTitle, body: text, folder: tagged.folder, tags: tagged.tags,
      pinned: false, titleAuto,
    });
    S.notes.unshift(n);
    renderAll(); showToast(`📂 Zapisane → ${n.folder}`);
  } catch (e) { showToast('Błąd: ' + e.message); }
}

// ─────────────────────────────────────────────
//  NOTE DETAIL
// ─────────────────────────────────────────────

function openNote(id) {
  const n = S.notes.find(x => x.id===id); if (!n) return;
  renderNoteView(n);
  openSheet('sheet-note');
}

function renderNoteView(n) {
  const titleLabel = n.titleAuto
    ? `<div class="note-detail-title" style="color:var(--ink2);font-style:italic">${esc(n.title)}<span class="note-title-auto">AI</span></div>`
    : `<div class="note-detail-title">${esc(n.title)}</div>`;
  document.getElementById('sheet-note-body').innerHTML = `
    ${titleLabel}
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <span class="note-tag tag-${n.folder}">${n.folder}</span>
      <span style="font-size:12px;color:var(--ink3)">${ago(n.ts)}</span>
    </div>
    <div class="note-detail-body">${esc(n.body)}</div>
    <div class="note-actions">
      <button class="note-action-btn" onclick="editNote('${n.id}')">✎ Edytuj</button>
      <button class="note-action-btn" onclick="togglePin('${n.id}')">📌 ${n.pinned?'Odepnij':'Przypnij'}</button>
      <button class="note-action-btn" onclick="aiSummarise('${n.id}')">✦ Podsumuj</button>
      <button class="note-action-btn danger" onclick="deleteNote('${n.id}')">🗑 Usuń</button>
    </div>
    <div id="note-ai-area" style="margin-top:14px"></div>`;
}

const EDITABLE_FOLDERS = ['work', 'studio', 'personal', 'ideas', 'inbox'];

function editNote(id) {
  const n = S.notes.find(x => x.id===id); if (!n) return;
  const folderChips = EDITABLE_FOLDERS.map(f =>
    `<span class="folder-select-chip note-tag tag-${f} ${n.folder===f?'active':''}"
      onclick="pickNoteFolder(this,'${f}')">${f[0].toUpperCase()+f.slice(1)}</span>`
  ).join('');

  document.getElementById('sheet-note-body').innerHTML = `
    <input class="edit-title" id="edit-note-title" placeholder="Tytuł (puste = AI wygeneruje)" value="${esc(n.titleAuto ? '' : n.title)}" />
    <div class="form-label">Folder</div>
    <div class="folder-select" id="edit-note-folder-row" data-folder="${n.folder}">${folderChips}</div>
    <div class="form-label">Treść</div>
    <textarea class="edit-body" id="edit-note-body">${esc(n.body)}</textarea>
    <div class="edit-actions">
      <button class="cancel-btn" onclick="cancelEditNote('${id}')">Anuluj</button>
      <button class="submit-btn" onclick="saveNote('${id}')">Zapisz</button>
    </div>`;
}

function pickNoteFolder(el, folder) {
  const row = document.getElementById('edit-note-folder-row');
  row.querySelectorAll('.folder-select-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  row.dataset.folder = folder;
}

function cancelEditNote(id) {
  const n = S.notes.find(x => x.id===id); if (!n) return;
  renderNoteView(n);
}

async function saveNote(id) {
  const n = S.notes.find(x => x.id===id); if (!n) return;
  const titleInput = document.getElementById('edit-note-title').value.trim();
  const body = document.getElementById('edit-note-body').value.trim();
  const folder = document.getElementById('edit-note-folder-row').dataset.folder || n.folder;

  if (!body) { showToast('Treść nie może być pusta'); return; }

  // Jeśli user wyczyścił tytuł → re-generujemy przez Scribe (przy zapisie)
  let finalTitle = titleInput;
  let titleAuto = false;
  if (!titleInput) {
    const tagged = await Scribe.process(body, apiKey || '');
    finalTitle = tagged.title;
    titleAuto = true;
  }

  try {
    const updated = await CueDB.Notes.update(id, userId, {
      title: finalTitle, body, folder, titleAuto,
    });
    Object.assign(n, updated);
    renderAll();
    renderNoteView(n);
    showToast('✓ Zapisane');
  } catch (e) { showToast('Błąd: ' + e.message); }
}

async function aiSummarise(id) {
  const n = S.notes.find(x => x.id===id); if (!n) return;
  const el = document.getElementById('note-ai-area');
  if (!apiKey || apiKey === 'skipped') {
    el.innerHTML = '<div class="ai-response">Dodaj klucz API, żeby używać funkcji AI.</div>'; return;
  }
  el.innerHTML = '<div class="ai-response ai-loading">✦ Podsumowuję…</div>';
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'x-api-key':apiKey,
        'anthropic-version':'2023-06-01',
        'anthropic-dangerous-direct-browser-access':'true'
      },
      body: JSON.stringify({
        model: MODEL_SMART,
        max_tokens: 300,
        messages:[{ role:'user', content:`Krótko podsumuj tę notatkę i zaproponuj 1-2 konkretne następne kroki jeśli to ma sens. Bądź zwięzły. Odpowiadaj po polsku.\n\nNotatka: "${n.body}"` }]
      })
    });
    const d = await res.json();
    if (d.error) throw new Error(d.error.message);
    el.innerHTML = `<div class="ai-response">${esc(d.content[0].text)}</div>`;
  } catch(e) { el.innerHTML = `<div class="ai-response">Błąd AI: ${e.message}</div>`; }
}

async function togglePin(id) {
  const n = S.notes.find(x=>x.id===id); if(!n) return;
  try {
    const updated = await CueDB.Notes.update(id, userId, { pinned: !n.pinned });
    Object.assign(n, updated);
    renderAll(); closeSheet('sheet-note');
    showToast(n.pinned ? '📌 Przypięte' : 'Odpięte');
  } catch (e) { showToast('Błąd: ' + e.message); }
}

async function deleteNote(id) {
  if (!confirm('Usunąć tę notatkę?')) return;
  try {
    await CueDB.Notes.delete(id, userId);
    S.notes = S.notes.filter(x=>x.id!==id);
    renderAll(); closeSheet('sheet-note'); showToast('🗑 Usunięte');
  } catch (e) { showToast('Błąd: ' + e.message); }
}

// ─────────────────────────────────────────────
//  ADD SHEETS
// ─────────────────────────────────────────────

let editingTodoId = null;
let editingReminderId = null;
let selectedPriority = null;
let todoFields = []; // [{ id, kind, label, value }] — customowe pola edytowanego/nowego zadania

function fieldRowHTML(f) {
  const info = FIELD_KINDS[f.kind];
  let valueInput;
  if (f.kind === 'checkbox') {
    valueInput = `<input type="checkbox" class="field-checkbox" ${f.value ? 'checked' : ''}
      onchange="setTodoFieldValue('${f.id}', this.checked)" />`;
  } else if (f.kind === 'select') {
    valueInput = `<select class="form-input field-value-input" onchange="setTodoFieldValue('${f.id}', this.value)">
      <option value="">—</option>
      ${STATUS_OPTIONS.map(o => `<option value="${esc(o)}" ${f.value===o?'selected':''}>${esc(o)}</option>`).join('')}
    </select>`;
  } else {
    const type = f.kind === 'number' ? 'number' : f.kind === 'url' ? 'url' : 'text';
    valueInput = `<input class="form-input field-value-input" type="${type}" placeholder="Wartość"
      value="${esc(f.value)}" oninput="setTodoFieldValue('${f.id}', this.value)" />`;
  }
  return `<div class="field-row">
    <span class="field-kind-icon" title="${info.label}">${info.icon}</span>
    <input class="form-input field-label-input" placeholder="Etykieta (np. ${info.label})"
      value="${esc(f.label)}" oninput="setTodoFieldLabel('${f.id}', this.value)" />
    ${valueInput}
    <button class="field-remove" onclick="removeTodoField('${f.id}')" title="Usuń pole">✕</button>
  </div>`;
}

function addFieldPickerHTML() {
  return `<div class="field-picker">
    ${Object.entries(FIELD_KINDS).map(([key, info]) =>
      `<button class="field-add-btn" onclick="addTodoField('${key}')">+ ${info.icon} ${info.label}</button>`
    ).join('')}
  </div>`;
}

function todoFieldsBoxHTML() {
  return todoFields.map(fieldRowHTML).join('') + addFieldPickerHTML();
}

function renderTodoFieldsBox() {
  const box = document.getElementById('todo-fields-box');
  if (box) box.innerHTML = todoFieldsBoxHTML();
}

function addTodoField(kind) {
  todoFields.push({ id: crypto.randomUUID(), kind, label: '', value: kind === 'checkbox' ? false : '' });
  renderTodoFieldsBox();
}

function removeTodoField(id) {
  todoFields = todoFields.filter(f => f.id !== id);
  renderTodoFieldsBox();
}

function setTodoFieldLabel(id, val) {
  const f = todoFields.find(x => x.id === id);
  if (f) f.label = val;
}

function setTodoFieldValue(id, val) {
  const f = todoFields.find(x => x.id === id);
  if (f) f.value = val;
}

function serializeTodoFields() {
  const out = {};
  for (const f of todoFields) out[f.id] = { kind: f.kind, label: (f.label || '').trim(), value: f.value };
  return out;
}

function prioritySelectHTML() {
  const opt = (key, label) =>
    `<span class="priority-select-chip ${key} ${selectedPriority===key?'active':''}"
      onclick="pickPriority(this,'${key}')">
      ${key==='none' ? '—' : `<span class="priority-dot ${key}"></span>`}${label}
    </span>`;
  return `
    <div class="priority-select">
      ${opt('none','Brak')}
      ${opt('low','Niski')}
      ${opt('medium','Średni')}
      ${opt('high','Wysoki')}
    </div>`;
}

function pickPriority(el, key) {
  selectedPriority = key === 'none' ? null : key;
  el.parentElement.querySelectorAll('.priority-select-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
}

function dueLocalInputValue(iso) {
  if (!iso) return '';
  // datetime-local oczekuje "YYYY-MM-DDTHH:mm" w lokalnej strefie czasowej
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off*60000).toISOString().slice(0,16);
}

function openAddSheet(type, prefill='') {
  editingTodoId = null;
  editingReminderId = null;
  selectedPriority = null;
  todoFields = [];
  const title = document.getElementById('sheet-add-title');
  const body  = document.getElementById('sheet-add-body');

  if (type === 'todo') {
    title.textContent = 'Nowe zadanie';
    body.innerHTML = `
      <div class="form-row"><label class="form-label">Zadanie</label>
        <input class="form-input" id="add-todo-text" placeholder="Co zrobić?" value="${esc(prefill)}" /></div>
      <div class="form-row"><label class="form-label">Priorytet</label>
        ${prioritySelectHTML()}</div>
      <div class="form-row"><label class="form-label">Termin (opcjonalnie)</label>
        <input class="form-input" id="add-todo-due" type="datetime-local" /></div>
      <div class="form-row"><label class="form-label">Dodatkowe pola</label>
        <div id="todo-fields-box">${todoFieldsBoxHTML()}</div></div>
      <button class="submit-btn" onclick="addTodo()">Dodaj zadanie</button>`;
    openSheet('sheet-add');
    setTimeout(() => document.getElementById('add-todo-text').focus(), 300);
  }

  if (type === 'reminder') {
    title.textContent = 'Nowe przypomnienie';
    body.innerHTML = `
      <div class="form-row"><label class="form-label">Przypomnienie</label>
        <input class="form-input" id="add-rem-text" placeholder="Przypomnij mi…" value="${esc(prefill)}" /></div>
      <div class="form-row"><label class="form-label">Kiedy</label>
        <input class="form-input" id="add-rem-time" type="datetime-local" /></div>
      <button class="submit-btn" onclick="addReminder()">Ustaw przypomnienie</button>`;
    openSheet('sheet-add');
    setTimeout(() => document.getElementById('add-rem-text').focus(), 300);
  }
}

function editTodo(id) {
  const t = S.todos.find(x => x.id===id); if (!t) return;
  editingTodoId = id;
  selectedPriority = t.priority || null;
  todoFields = Object.entries(t.customFields || {}).map(([fid, f]) => ({ id: fid, kind: f.kind, label: f.label || '', value: f.value }));
  const title = document.getElementById('sheet-add-title');
  const body  = document.getElementById('sheet-add-body');
  title.textContent = 'Edytuj zadanie';
  body.innerHTML = `
    <div class="form-row"><label class="form-label">Zadanie</label>
      <input class="form-input" id="add-todo-text" value="${esc(t.text)}" /></div>
    <div class="form-row"><label class="form-label">Priorytet</label>
      ${prioritySelectHTML()}</div>
    <div class="form-row"><label class="form-label">Termin (opcjonalnie)</label>
      <input class="form-input" id="add-todo-due" type="datetime-local" value="${dueLocalInputValue(t.due)}" /></div>
    <div class="form-row"><label class="form-label">Dodatkowe pola</label>
      <div id="todo-fields-box">${todoFieldsBoxHTML()}</div></div>
    <div class="edit-actions">
      <button class="cancel-btn" onclick="closeSheet('sheet-add')">Anuluj</button>
      <button class="submit-btn" onclick="saveTodo()">Zapisz</button>
    </div>`;
  openSheet('sheet-add');
}

function editReminder(id) {
  const r = S.reminders.find(x => x.id===id); if (!r) return;
  editingReminderId = id;
  const title = document.getElementById('sheet-add-title');
  const body  = document.getElementById('sheet-add-body');
  title.textContent = 'Edytuj przypomnienie';
  body.innerHTML = `
    <div class="form-row"><label class="form-label">Przypomnienie</label>
      <input class="form-input" id="add-rem-text" value="${esc(r.text)}" /></div>
    <div class="form-row"><label class="form-label">Kiedy</label>
      <input class="form-input" id="add-rem-time" type="datetime-local" value="${dueLocalInputValue(r.time)}" /></div>
    <div class="edit-actions">
      <button class="cancel-btn" onclick="closeSheet('sheet-add')">Anuluj</button>
      <button class="submit-btn" onclick="saveReminder()">Zapisz</button>
    </div>`;
  openSheet('sheet-add');
}

async function addTodo() {
  const text = document.getElementById('add-todo-text').value.trim();
  if (!text) { showToast('Wpisz zadanie'); return; }
  const dueRaw = document.getElementById('add-todo-due').value || null;
  const due = dueRaw ? new Date(dueRaw).toISOString() : null;
  try {
    const t = await CueDB.Todos.create(userId, { text, due, priority: selectedPriority, customFields: serializeTodoFields() });
    S.todos.unshift(t);
    renderAll(); closeSheet('sheet-add'); showToast('✓ Dodane');
  } catch (e) { showToast('Błąd: ' + e.message); }
}

async function saveTodo() {
  if (!editingTodoId) return;
  const t = S.todos.find(x => x.id===editingTodoId); if (!t) return;
  const text = document.getElementById('add-todo-text').value.trim();
  if (!text) { showToast('Wpisz zadanie'); return; }
  const dueRaw = document.getElementById('add-todo-due').value || null;
  const due = dueRaw ? new Date(dueRaw).toISOString() : null;
  try {
    const updated = await CueDB.Todos.update(editingTodoId, userId, { text, due, priority: selectedPriority, customFields: serializeTodoFields() });
    Object.assign(t, updated);
    renderAll(); closeSheet('sheet-add'); showToast('✓ Zapisane');
  } catch (e) { showToast('Błąd: ' + e.message); }
}

async function addReminder() {
  const text = document.getElementById('add-rem-text').value.trim();
  const time = document.getElementById('add-rem-time').value;
  if (!text || !time) { showToast('Wypełnij oba pola'); return; }
  const iso = new Date(time).toISOString();
  try {
    const r = await CueDB.Reminders.create(userId, { text, time: iso });
    S.reminders.push(r);
    renderAll(); closeSheet('sheet-add'); showToast('🔔 Ustawione');
    if (Notify.supported() && Notify.state === 'default') Notify.request();
  } catch (e) { showToast('Błąd: ' + e.message); }
}

async function saveReminder() {
  if (!editingReminderId) return;
  const r = S.reminders.find(x => x.id===editingReminderId); if (!r) return;
  const text = document.getElementById('add-rem-text').value.trim();
  const time = document.getElementById('add-rem-time').value;
  if (!text || !time) { showToast('Wypełnij oba pola'); return; }
  const iso = new Date(time).toISOString();
  try {
    // Jeśli czas zmieniony i wcześniej notified=true → reset notified, żeby nowe powiadomienie zadziałało.
    const fields = { text, time: iso };
    if (iso !== r.time && r.notified) fields.notified = false;
    const updated = await CueDB.Reminders.update(editingReminderId, userId, fields);
    Object.assign(r, updated);
    renderAll(); closeSheet('sheet-add'); showToast('✓ Zapisane');
  } catch (e) { showToast('Błąd: ' + e.message); }
}

async function toggleTodo(id) {
  const t = S.todos.find(x=>x.id===id); if(!t) return;
  try {
    const updated = await CueDB.Todos.update(id, userId, { done: !t.done });
    Object.assign(t, updated);
    renderAll();
  } catch (e) { showToast('Błąd: ' + e.message); }
}

async function deleteTodo(id) {
  try {
    await CueDB.Todos.delete(id, userId);
    S.todos = S.todos.filter(x=>x.id!==id);
    renderAll();
  } catch (e) { showToast('Błąd: ' + e.message); }
}

async function deleteReminder(id) {
  try {
    await CueDB.Reminders.delete(id, userId);
    S.reminders = S.reminders.filter(x=>x.id!==id);
    renderAll();
  } catch (e) { showToast('Błąd: ' + e.message); }
}

// ─────────────────────────────────────────────
//  REMINDERS CHECK
// ─────────────────────────────────────────────

async function checkReminders() {
  if (!userId) return;
  const now = new Date();
  for (const r of S.reminders) {
    if (!r.notified && new Date(r.time) <= now) {
      r.notified = true;
      try { await CueDB.Reminders.update(r.id, userId, { notified: true }); } catch {}
      showToast('🔔 ' + r.text);
      Notify.show('Cue — przypomnienie', { body: r.text, tag: 'cue-reminder' });
      renderAll();
    }
  }
}

// ─────────────────────────────────────────────
//  AI ASK
// ─────────────────────────────────────────────

function buildContext() {
  const notes = S.notes.slice(0,40).map(n=>`[${n.folder}] ${n.title}: ${n.body.slice(0,250)}`).join('\n');
  const todos  = S.todos.filter(t=>!t.done).map(t=>`- ${t.text}`).join('\n');
  return `Notatki użytkownika:\n${notes}\n\nNiezrobione to-do:\n${todos}`;
}

async function callAI(question, targetId) {
  const el = document.getElementById(targetId);

  if (!apiKey || apiKey === 'skipped') {
    el.style.display = 'block';
    el.className = 'ai-response';
    el.textContent = 'Brak klucza API. Dodaj klucz w ustawieniach, żeby włączyć funkcje AI.';
    return;
  }

  el.style.display = 'block'; el.className = 'ai-response ai-loading'; el.textContent = 'Myślę…';
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'x-api-key': apiKey,
        'anthropic-version':'2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: MODEL_SMART,
        max_tokens: 700,
        system:`Jesteś ciepłym, praktycznym asystentem osobistym pomagającym użytkownikowi zrozumieć jego notatki i myśli. Bądź zwięzły i konkretny. Użytkownik ma ADHD — pisz jasno i strukturalnie. Odpowiadaj po polsku.\n\n${buildContext()}`,
        messages:[{ role:'user', content:question }]
      })
    });
    const d = await res.json();
    if (d.error) throw new Error(d.error.message);
    el.className = 'ai-response'; el.textContent = d.content[0].text;
  } catch(e) { el.className = 'ai-response'; el.textContent = 'Nie mogę połączyć się z AI: ' + e.message; }
}

function runAsk() {
  const q = document.getElementById('ai-query').value.trim(); if(!q) return;
  callAI(q, 'ai-response');
}

function quickAsk(btn, q) {
  document.getElementById('ai-query').value = q;
  switchView('ask', document.querySelectorAll('.nav-tab')[4]);
  callAI(q, 'ai-response');
}

function openAISheet() {
  document.getElementById('sheet-ai-input').value = '';
  document.getElementById('sheet-ai-response').style.display = 'none';
  openSheet('sheet-ai');
  setTimeout(() => document.getElementById('sheet-ai-input').focus(), 300);
}

function runSheetAI() {
  const q = document.getElementById('sheet-ai-input').value.trim(); if(!q) return;
  callAI(q, 'sheet-ai-response');
}

// ─────────────────────────────────────────────
//  SEARCH
// ─────────────────────────────────────────────

function openSearch() {
  openSheet('sheet-search');
  document.getElementById('search-input').value = '';
  document.getElementById('search-results').innerHTML = '';
  setTimeout(() => document.getElementById('search-input').focus(), 300);
}

function liveSearch() {
  const q = document.getElementById('search-input').value.toLowerCase().trim();
  const el = document.getElementById('search-results');
  if (!q) { el.innerHTML = ''; return; }
  const hits = S.notes.filter(n =>
    n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q) || (n.tags||[]).join(' ').includes(q)
  );
  el.innerHTML = hits.length ? hits.map(noteCardHTML).join('') :
    '<p style="text-align:center;color:var(--ink3);padding:24px;font-size:14px">Nic nie znalazłem</p>';
}

// ─────────────────────────────────────────────
//  VOICE
// ─────────────────────────────────────────────

let recognition = null, listening = false;

function toggleVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { showToast('Głos nie wspierany w tej przeglądarce'); return; }
  if (listening) { recognition?.stop(); return; }
  recognition = new SR();
  recognition.lang = 'pl-PL'; recognition.continuous = false; recognition.interimResults = true;
  recognition.onstart = () => {
    listening = true;
    document.getElementById('voice-btn').classList.add('listening');
    document.getElementById('voice-btn').textContent = '⏹';
    document.getElementById('capture-hint').textContent = 'Słucham… mów teraz';
  };
  recognition.onresult = e => {
    const t = Array.from(e.results).map(r=>r[0].transcript).join('');
    document.getElementById('capture-input').value = t;
    autoResize(document.getElementById('capture-input'));
  };
  recognition.onend = () => {
    listening = false;
    document.getElementById('voice-btn').classList.remove('listening');
    document.getElementById('voice-btn').textContent = '🎙️';
    document.getElementById('capture-hint').textContent = 'dotknij mikrofonu · pisz · ↑ aby zapisać';
  };
  recognition.onerror = () => { recognition.onend(); showToast('Błąd głosu — spróbuj ponownie'); };
  recognition.start();
}

// ─────────────────────────────────────────────
//  POMODORO
// ─────────────────────────────────────────────

let pomoSelectedDurationSec = 25 * 60;
let pomoSelectedBreakSec = 5 * 60;
let pomoSelectedTodoId = null;

const POMO_PHASE_LABELS = {
  focus: 'Focus',
  break: 'Przerwa',
  long_break: 'Długa przerwa',
  paused: 'Pauza',
};

function initPomodoroUI() {
  Pomodoro.on('onTick', (state, left) => renderPomoAll(state, left));
  Pomodoro.on('onChange', state => {
    if (state) renderPomoAll(state, Pomodoro.remaining());
    else hidePomoAll();
  });
  Pomodoro.on('onPhaseEnd', (finished, completed) => onPomodoroPhaseEnd(finished, completed));
  Pomodoro.init();
  initPomoFloatDrag();
  if (Pomodoro.isActive()) renderPomoAll(Pomodoro.state, Pomodoro.remaining());
}

function renderPomoAll(state, leftSec) {
  renderPomoBar(state, leftSec);
  renderPomoFloat(state, leftSec);
  renderPomoPiP(state, leftSec);
}
function hidePomoAll() {
  hidePomoBar();
  hidePomoFloat();
  closePomoPiP();
}

function renderPomoBar(state, leftSec) {
  const bar = document.getElementById('pomo-bar');
  bar.classList.add('active');
  bar.classList.remove('phase-break', 'phase-long_break');

  const realPhase = state.phase === 'paused' ? state.prePausePhase : state.phase;
  if (realPhase === 'break') bar.classList.add('phase-break');
  else if (realPhase === 'long_break') bar.classList.add('phase-long_break');

  const mm = String(Math.floor(leftSec / 60)).padStart(2, '0');
  const ss = String(leftSec % 60).padStart(2, '0');
  document.getElementById('pomo-time').textContent = `${mm}:${ss}`;

  document.getElementById('pomo-phase').textContent =
    POMO_PHASE_LABELS[state.phase] || POMO_PHASE_LABELS[realPhase] || 'Focus';

  let label = state.label || '';
  if (state.todoId) {
    const todo = S.todos.find(t => t.id === state.todoId);
    if (todo) label = todo.text;
  }
  document.getElementById('pomo-label').textContent = label || '—';

  const pct = state.durationSec > 0 ? (1 - leftSec / state.durationSec) * 100 : 0;
  document.getElementById('pomo-progress').style.width = pct + '%';

  document.getElementById('pomo-toggle').textContent = Pomodoro.isPaused() ? '▶' : '⏸';
}

function hidePomoBar() {
  document.getElementById('pomo-bar').classList.remove('active');
}

// ── Floating widget (desktop) ──────────────────────────────
function renderPomoFloat(state, leftSec) {
  const el = document.getElementById('pomo-float');
  el.classList.add('active');
  el.classList.remove('phase-break', 'phase-long_break');
  const realPhase = state.phase === 'paused' ? state.prePausePhase : state.phase;
  if (realPhase === 'break') el.classList.add('phase-break');
  else if (realPhase === 'long_break') el.classList.add('phase-long_break');

  const mm = String(Math.floor(leftSec / 60)).padStart(2, '0');
  const ss = String(leftSec % 60).padStart(2, '0');
  document.getElementById('pomo-float-time').textContent = `${mm}:${ss}`;
  document.getElementById('pomo-float-phase').textContent =
    POMO_PHASE_LABELS[state.phase] || POMO_PHASE_LABELS[realPhase] || 'Focus';

  let label = state.label || '';
  if (state.todoId) {
    const todo = S.todos.find(t => t.id === state.todoId);
    if (todo) label = todo.text;
  }
  document.getElementById('pomo-float-label').textContent = label || '—';

  const pct = state.durationSec > 0 ? (1 - leftSec / state.durationSec) * 100 : 0;
  document.getElementById('pomo-float-progress').style.width = pct + '%';
  document.getElementById('pomo-float-toggle').textContent = Pomodoro.isPaused() ? '▶' : '⏸';

  // PiP button widoczny tylko w wspierających przeglądarkach
  const pipBtn = document.getElementById('pomo-float-pip');
  if (!('documentPictureInPicture' in window)) pipBtn.style.display = 'none';
}
function hidePomoFloat() {
  document.getElementById('pomo-float').classList.remove('active');
}

// ── Draggable floating widget ──────────────────────────────
const POMO_FLOAT_POS_KEY = 'cue_pomo_float_pos';

function initPomoFloatDrag() {
  const el = document.getElementById('pomo-float');
  const handle = document.getElementById('pomo-float-drag');
  if (!el || !handle) return;

  // Restore zapamiętanej pozycji
  try {
    const saved = JSON.parse(localStorage.getItem(POMO_FLOAT_POS_KEY) || 'null');
    if (saved && typeof saved.top === 'number' && typeof saved.right === 'number') {
      el.style.top = saved.top + 'px';
      el.style.right = saved.right + 'px';
    }
  } catch {}

  let dragging = false, startX = 0, startY = 0, startTop = 0, startRight = 0;

  const onDown = (clientX, clientY) => {
    dragging = true;
    const rect = el.getBoundingClientRect();
    startX = clientX;
    startY = clientY;
    startTop = rect.top;
    startRight = window.innerWidth - rect.right;
    el.style.transition = 'none';
  };
  const onMove = (clientX, clientY) => {
    if (!dragging) return;
    const dx = clientX - startX;
    const dy = clientY - startY;
    const newTop = Math.max(8, Math.min(window.innerHeight - 80, startTop + dy));
    const newRight = Math.max(8, Math.min(window.innerWidth - 100, startRight - dx));
    el.style.top = newTop + 'px';
    el.style.right = newRight + 'px';
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    el.style.transition = '';
    const rect = el.getBoundingClientRect();
    try {
      localStorage.setItem(POMO_FLOAT_POS_KEY, JSON.stringify({
        top: rect.top,
        right: window.innerWidth - rect.right,
      }));
    } catch {}
  };

  handle.addEventListener('mousedown', e => { e.preventDefault(); onDown(e.clientX, e.clientY); });
  document.addEventListener('mousemove', e => onMove(e.clientX, e.clientY));
  document.addEventListener('mouseup', onUp);

  handle.addEventListener('touchstart', e => {
    if (e.touches.length === 1) { e.preventDefault(); onDown(e.touches[0].clientX, e.touches[0].clientY); }
  }, { passive: false });
  document.addEventListener('touchmove', e => {
    if (e.touches.length === 1) onMove(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
  document.addEventListener('touchend', onUp);
}

// ── Document Picture-in-Picture (Chrome/Edge ≥ 116) ────────
let pipWindow = null;

async function popOutPomodoro() {
  if (!('documentPictureInPicture' in window)) {
    showToast('Twoja przeglądarka nie wspiera Pop-out (Chrome/Edge 116+)');
    return;
  }
  if (pipWindow) { try { pipWindow.focus(); } catch {} return; }
  try {
    pipWindow = await window.documentPictureInPicture.requestWindow({ width: 280, height: 140 });
  } catch (e) {
    showToast('Nie udało się otworzyć Pop-out: ' + e.message);
    return;
  }

  // Kopia CSS z głównego okna
  document.querySelectorAll('link[rel="stylesheet"], style').forEach(node => {
    pipWindow.document.head.appendChild(node.cloneNode(true));
  });

  // Minimalistyczny markup w PiP
  pipWindow.document.body.style.margin = '0';
  pipWindow.document.body.innerHTML = `
    <div id="pip-root" style="
      display:flex;flex-direction:column;height:100vh;
      background:linear-gradient(135deg,#c4764a,#e09b6e);color:white;
      font-family:'DM Sans',sans-serif;
    ">
      <div style="padding:8px 14px 0;">
        <div id="pip-time" style="font-family:'Lora',serif;font-size:38px;font-weight:500;letter-spacing:-0.5px;line-height:1.1">25:00</div>
        <div id="pip-phase" style="font-size:10px;font-weight:500;letter-spacing:1.5px;text-transform:uppercase;opacity:0.85;margin-top:2px">Focus</div>
        <div id="pip-label" style="font-size:13px;opacity:0.92;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">—</div>
      </div>
      <div style="display:flex;gap:6px;padding:8px 12px 4px;margin-top:auto">
        <button id="pip-toggle" style="flex:1;height:30px;border:none;border-radius:8px;background:rgba(255,255,255,0.22);color:white;font-size:13px;cursor:pointer">⏸</button>
        <button id="pip-skip" style="flex:1;height:30px;border:none;border-radius:8px;background:rgba(255,255,255,0.22);color:white;font-size:13px;cursor:pointer">⏭</button>
        <button id="pip-stop" style="flex:1;height:30px;border:none;border-radius:8px;background:rgba(255,255,255,0.22);color:white;font-size:13px;cursor:pointer">✕</button>
      </div>
      <div style="height:3px;background:rgba(255,255,255,0.18)"><div id="pip-progress" style="height:100%;background:rgba(255,255,255,0.85);width:0%;transition:width 0.5s linear"></div></div>
    </div>`;

  pipWindow.document.getElementById('pip-toggle').onclick = () => togglePomodoro();
  pipWindow.document.getElementById('pip-skip').onclick = () => skipPomodoroPhase();
  pipWindow.document.getElementById('pip-stop').onclick = () => stopPomodoro();

  pipWindow.addEventListener('pagehide', () => { pipWindow = null; });

  // Pierwszy render
  if (Pomodoro.isActive()) renderPomoPiP(Pomodoro.state, Pomodoro.remaining());
}

function renderPomoPiP(state, leftSec) {
  if (!pipWindow) return;
  try {
    const root = pipWindow.document.getElementById('pip-root');
    const realPhase = state.phase === 'paused' ? state.prePausePhase : state.phase;
    const bg = realPhase === 'focus'
      ? 'linear-gradient(135deg,#c4764a,#e09b6e)'
      : 'linear-gradient(135deg,#6b8f6e,#8caa8c)';
    root.style.background = bg;

    const mm = String(Math.floor(leftSec / 60)).padStart(2, '0');
    const ss = String(leftSec % 60).padStart(2, '0');
    pipWindow.document.getElementById('pip-time').textContent = `${mm}:${ss}`;
    pipWindow.document.getElementById('pip-phase').textContent =
      POMO_PHASE_LABELS[state.phase] || POMO_PHASE_LABELS[realPhase] || 'Focus';

    let label = state.label || '';
    if (state.todoId) {
      const todo = S.todos.find(t => t.id === state.todoId);
      if (todo) label = todo.text;
    }
    pipWindow.document.getElementById('pip-label').textContent = label || '—';

    pipWindow.document.getElementById('pip-toggle').textContent = Pomodoro.isPaused() ? '▶' : '⏸';
    const pct = state.durationSec > 0 ? (1 - leftSec / state.durationSec) * 100 : 0;
    pipWindow.document.getElementById('pip-progress').style.width = pct + '%';

    // Zmień tytuł karty PiP → widać czas w pasku tytułu okna
    pipWindow.document.title = `${mm}:${ss} · Cue`;
  } catch {}
}

function closePomoPiP() {
  if (pipWindow) {
    try { pipWindow.close(); } catch {}
    pipWindow = null;
  }
}

function openPomodoroSheet() {
  pomoSelectedDurationSec = 25 * 60;
  pomoSelectedBreakSec = 5 * 60;
  pomoSelectedTodoId = null;
  const labelInp = document.getElementById('pomo-label-input');
  if (labelInp) labelInp.value = '';

  document.querySelectorAll('.pomo-duration-chip').forEach(c => c.classList.remove('active'));
  const defaultChip = document.querySelector('.pomo-duration-chip[data-sec="1500"]');
  if (defaultChip) defaultChip.classList.add('active');

  document.querySelectorAll('.pomo-break-chip').forEach(c => c.classList.remove('active'));
  const defaultBreakChip = document.querySelector('.pomo-break-chip[data-sec="300"]');
  if (defaultBreakChip) defaultBreakChip.classList.add('active');

  const focusCustom = document.getElementById('pomo-focus-custom');
  if (focusCustom) focusCustom.value = '';
  const breakCustom = document.getElementById('pomo-break-custom');
  if (breakCustom) breakCustom.value = '';

  const pending = S.todos.filter(t => !t.done);
  const list = document.getElementById('pomo-todo-list');
  list.innerHTML = pending.length
    ? pending.map(t =>
        `<div class="pomo-todo-option" data-id="${t.id}" onclick="setPomoTodo(this,'${t.id}')">${esc(t.text)}</div>`
      ).join('')
    : '<div class="pomo-todo-empty">Brak otwartych to-do</div>';

  const hint = document.getElementById('pomo-notif-hint');
  hint.style.display = Notify.supported() && Notify.state !== 'granted' ? 'block' : 'none';

  openSheet('sheet-pomodoro');
}

function setPomoDuration(el, sec) {
  pomoSelectedDurationSec = sec;
  document.querySelectorAll('.pomo-duration-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  const custom = document.getElementById('pomo-focus-custom');
  if (custom) custom.value = '';
}

function setPomoBreak(el, sec) {
  pomoSelectedBreakSec = sec;
  document.querySelectorAll('.pomo-break-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  const custom = document.getElementById('pomo-break-custom');
  if (custom) custom.value = '';
}

function setPomoCustomDuration(el) {
  const min = parseInt(el.value);
  if (!min || min < 1) return;
  pomoSelectedDurationSec = min * 60;
  document.querySelectorAll('.pomo-duration-chip').forEach(c => c.classList.remove('active'));
}

function setPomoCustomBreak(el) {
  const min = parseInt(el.value);
  if (!min || min < 1) return;
  pomoSelectedBreakSec = min * 60;
  document.querySelectorAll('.pomo-break-chip').forEach(c => c.classList.remove('active'));
}

function setPomoTodo(el, id) {
  if (pomoSelectedTodoId === id) {
    pomoSelectedTodoId = null;
    el.classList.remove('active');
    return;
  }
  pomoSelectedTodoId = id;
  document.querySelectorAll('.pomo-todo-option').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
}

async function requestNotifsExplicit() {
  const state = await Notify.request();
  if (state === 'granted') {
    showToast('✓ Powiadomienia włączone');
    document.getElementById('pomo-notif-hint').style.display = 'none';
  } else if (state === 'denied') {
    showToast(Notify.howToReenable());
  } else if (state === 'unsupported') {
    showToast('Powiadomienia nie wspierane w tej przeglądarce');
  }
}

function startPomodoro() {
  if (Pomodoro.isActive()) {
    if (!confirm('Timer już działa. Zatrzymać i zacząć nowy?')) return;
    Pomodoro.reset();
  }
  const labelInp = document.getElementById('pomo-label-input');
  const label = labelInp ? labelInp.value.trim() || null : null;
  Pomodoro.start({
    durationSec: pomoSelectedDurationSec,
    breakSec: pomoSelectedBreakSec,
    todoId: pomoSelectedTodoId,
    label: pomoSelectedTodoId ? null : label,
  });
  closeSheet('sheet-pomodoro');
  showToast('🍅 Focus rozpoczęty');
  if (Notify.supported() && Notify.state === 'default') Notify.request();
}

function togglePomodoro() {
  if (Pomodoro.isPaused()) Pomodoro.resume();
  else Pomodoro.pause();
}

function skipPomodoroPhase() {
  Pomodoro.skipPhase();
}

function stopPomodoro() {
  if (!confirm('Zakończyć sesję? Postęp tej fazy nie zostanie zapisany.')) return;
  Pomodoro.reset();
}

function onPomodoroPhaseEnd(finished, wasCompleted) {
  if (!wasCompleted) return;
  const phaseLabel = finished.phase === 'focus'
    ? 'Sesja focus skończona'
    : finished.phase === 'long_break'
      ? 'Długa przerwa skończona'
      : 'Przerwa skończona';
  const body = finished.phase === 'focus'
    ? 'Czas na przerwę. Wstań, napij się wody.'
    : 'Wracaj do focus.';
  Notify.show(phaseLabel, { body, tag: 'cue-pomodoro' });
  showToast('✦ ' + phaseLabel);
  playChirp();
}

function playChirp() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    const t0 = ctx.currentTime;
    gain.gain.setValueAtTime(0.001, t0);
    gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.45);
    osc.start(t0);
    osc.stop(t0 + 0.5);
    setTimeout(() => ctx.close(), 600);
  } catch {}
}

// ─────────────────────────────────────────────
//  SETTINGS SHEET
// ─────────────────────────────────────────────

function maskKey(k) {
  if (!k || k === 'skipped') return '—';
  if (k.length < 16) return '••••';
  return k.slice(0, 10) + '…' + k.slice(-6);
}

async function openSettings() {
  const body = document.getElementById('sheet-settings-body');
  const installedAsPWA = window.matchMedia('(display-mode: standalone)').matches;
  const notifState = Notify.state;
  const notifLabel = {
    granted: '✓ włączone',
    denied: '✕ zablokowane',
    default: '… nieaktywne (poprosimy gdy potrzebne)',
    unsupported: '— niewspierane w tej przeglądarce',
  }[notifState];

  let shareRows = '<div style="font-size:13px;color:var(--ink3)">Brak udostępnień.</div>';
  try {
    const shares = await CueDB.Shares.listForUser(userId);
    if (shares.length) shareRows = shares.map(shareRowHTML).join('');
  } catch (e) { showToast('Błąd: ' + e.message); }

  body.innerHTML = `
    <div class="settings-section">
      <div class="settings-section-title">Klucz Claude API</div>
      <div class="settings-api-current">${maskKey(apiKey)}</div>
      <input class="form-input" id="settings-key-input" type="password"
        placeholder="sk-ant-api03-…" autocomplete="off" />
      <button class="submit-btn" onclick="updateApiKey()" style="margin-top:10px">Zaktualizuj klucz</button>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">Powiadomienia</div>
      <div style="font-size:14px;color:var(--ink2);margin-bottom:8px">${notifLabel}</div>
      ${notifState !== 'granted' && notifState !== 'unsupported'
        ? `<button class="submit-btn" onclick="requestNotifsExplicit()" style="margin-top:0">Włącz powiadomienia</button>`
        : ''}
    </div>

    <div class="settings-section">
      <div class="settings-section-title">Synchronizacja na telefon</div>
      <div style="font-size:14px;color:var(--ink2);line-height:1.6">
        Zaloguj się na telefonie tym samym mailem — magic link. Wszystkie notatki, zadania
        i przypomnienia synchronizują się automatycznie (Supabase + RLS).
        ${installedAsPWA
          ? '<br><br>✓ Cue jest zainstalowane jako PWA.'
          : '<br><br>💡 Na telefonie kliknij <em>"Dodaj do ekranu głównego"</em> w menu przeglądarki.'}
      </div>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">Udostępnione linki</div>
      ${shareRows}
    </div>

    <div class="settings-section">
      <div class="settings-section-title">Konto</div>
      <button class="settings-danger" onclick="logout()">Wyloguj się</button>
    </div>
  `;
  openSheet('sheet-settings');
}

async function updateApiKey() {
  const inp = document.getElementById('settings-key-input');
  const key = (inp.value || '').trim();
  if (!key) { showToast('Wpisz klucz lub wpisz "skipped" by wyłączyć AI'); return; }
  if (key !== 'skipped' && !key.startsWith('sk-ant-')) {
    showToast('Klucz nie wygląda poprawnie — sprawdź'); return;
  }
  try {
    await CueDB.Settings.setApiKey(userId, key);
    apiKey = key;
    closeSheet('sheet-settings');
    showToast(key === 'skipped' ? 'AI wyłączone' : '✓ Klucz zaktualizowany');
  } catch (e) { showToast('Błąd: ' + e.message); }
}

// ─────────────────────────────────────────────
//  API KEY (przechowywany w Supabase user_settings)
// ─────────────────────────────────────────────

async function saveAPIKey() {
  const key = document.getElementById('ob-key-input').value.trim();
  if (!key.startsWith('sk-ant-')) { showToast('Klucz nie wygląda poprawnie — sprawdź'); return; }
  try {
    await CueDB.Settings.setApiKey(userId, key);
    apiKey = key;
    hide('onboarding');
    showToast('✓ Klucz zapisany — gotowe!');
    await afterAuthReady();
  } catch (e) { showToast('Błąd zapisu klucza: ' + e.message); }
}

async function skipAPIKey() {
  try {
    await CueDB.Settings.setApiKey(userId, 'skipped');
    apiKey = 'skipped';
    hide('onboarding');
    showToast('Działamy bez AI — klucz dodasz w ustawieniach');
    await afterAuthReady();
  } catch (e) { showToast('Błąd: ' + e.message); }
}

// ─────────────────────────────────────────────
//  PWA
// ─────────────────────────────────────────────

let deferredInstall = null;

function registerSW() {
  // W dev (localhost) NIE rejestrujemy SW — cache'uje skrypty i blokuje zmiany.
  // Dodatkowo wyrejestrowujemy istniejące, na wypadek gdy zostały z wcześniejszej sesji.
  const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (!('serviceWorker' in navigator)) return;

  if (isLocal) {
    navigator.serviceWorker.getRegistrations().then(regs => {
      regs.forEach(r => r.unregister());
    }).catch(() => {});
    return;
  }

  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

function initPWAInstall() {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); deferredInstall = e;
    document.getElementById('install-banner').classList.add('visible');
  });
  window.addEventListener('appinstalled', () => {
    document.getElementById('install-banner').classList.remove('visible');
    showToast('✓ Cue zainstalowane!');
  });
}

function installApp() {
  if (deferredInstall) { deferredInstall.prompt(); deferredInstall = null; }
}

// ─────────────────────────────────────────────
//  UTILS
// ─────────────────────────────────────────────

function switchView(name, btn) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('view-'+name).classList.add('active');
  if (btn) btn.classList.add('active');
}

function openSheet(id)  { document.getElementById(id).classList.add('open'); }
function closeSheet(id) { document.getElementById(id).classList.remove('open'); }

function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }

function showToast(msg) {
  const t = document.getElementById('toast'); t.textContent = msg;
  t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2400);
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function ago(ts) {
  const s = Math.floor((Date.now()-ts)/1000);
  if (s < 60) return 'przed chwilą';
  if (s < 3600) return Math.floor(s/60)+'m temu';
  if (s < 86400) return Math.floor(s/3600)+'g temu';
  return Math.floor(s/86400)+'d temu';
}

function fmtDT(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('pl-PL',{day:'numeric',month:'short'}) + ' · ' +
    d.toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'});
}

// ─────────────────────────────────────────────
//  STARTUP
// ─────────────────────────────────────────────

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
