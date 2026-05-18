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

// ─────────────────────────────────────────────
//  BOOTSTRAP
// ─────────────────────────────────────────────

async function bootstrap() {
  document.getElementById('capture-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); capture(); }
  });
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

  const pending = S.todos.filter(t => !t.done).slice(0,5);
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

function renderTodos() {
  const pending = S.todos.filter(t => !t.done);
  const done    = S.todos.filter(t => t.done);
  let html = '';
  if (pending.length) html += pending.map(todoHTML).join('');
  if (done.length)    html += `<div class="section-label" style="margin-top:20px">Zrobione (${done.length})</div>` + done.map(todoHTML).join('');
  if (!S.todos.length) html = emptyHTML('✅','Pusta lista','Dodaj to-do przyciskiem +');
  document.getElementById('todos-list').innerHTML = html;
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
  return `<div class="note-card ${n.pinned?'pinned':''}" onclick="openNote('${n.id}')">
    <div class="note-title">${esc(n.title)}</div>
    <div class="note-body">${esc(n.body)}</div>
    <div class="note-footer">
      <span class="note-tag tag-${n.folder||'inbox'}">${n.folder||'inbox'}</span>
      ${(n.tags||[]).filter(t=>t!==n.folder).map(t=>`<span class="note-tag tag-${t}">${t}</span>`).join('')}
      <span class="note-time">${ago(n.ts)}</span>
    </div>
  </div>`;
}

function todoHTML(t) {
  return `<div class="todo-item ${t.done?'done':''}" onclick="toggleTodo('${t.id}')">
    <div class="todo-check ${t.done?'checked':''}" onclick="toggleTodo('${t.id}');event.stopPropagation()">${t.done?'✓':''}</div>
    <div style="flex:1">
      <div class="todo-text ${t.done?'done':''}">${esc(t.text)}</div>
      ${t.due?`<div class="todo-due">📅 ${fmtDT(t.due)}</div>`:''}
    </div>
    <button class="row-del" onclick="deleteTodo('${t.id}');event.stopPropagation()">✕</button>
  </div>`;
}

function reminderHTML(r, showDel=false) {
  const past = new Date(r.time) < new Date();
  return `<div class="reminder-item ${past?'past':''}">
    <div style="font-size:18px">${past?'✓':'🔔'}</div>
    <div style="flex:1">
      <div class="reminder-text">${esc(r.text)}</div>
      <div class="reminder-time">${fmtDT(r.time)}</div>
    </div>
    ${showDel?`<button class="row-del" onclick="deleteReminder('${r.id}')">✕</button>`:''}
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
    note:'dotknij mikrofonu albo pisz · ↑ aby zapisać',
    todo:'wpisz zadanie · ↑ aby dodać',
    reminder:'wpisz przypomnienie · ↑ aby dodać (czas potem)'
  };
  document.getElementById('capture-hint').textContent = hints[t];
  document.getElementById('capture-input').placeholder =
    t==='note' ? 'Złap myśl…' : t==='todo' ? 'Co zrobić?' : 'Przypomnij mi…';
}

async function capture() {
  if (!userId) { showToast('Sesja wygasła — zaloguj się ponownie'); return; }
  const inp = document.getElementById('capture-input');
  const text = inp.value.trim();
  if (!text) return;
  inp.value = ''; autoResize(inp);

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

  // Notatka — Scribe tagowanie (Haiku)
  showToast('✦ Zapisuję…');
  const tagged = await Scribe.process(text, apiKey || '');
  try {
    const n = await CueDB.Notes.create(userId, {
      title: tagged.title, body: text, folder: tagged.folder, tags: tagged.tags, pinned: false,
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
  document.getElementById('sheet-note-body').innerHTML = `
    <div class="note-detail-title">${esc(n.title)}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <span class="note-tag tag-${n.folder}">${n.folder}</span>
      <span style="font-size:12px;color:var(--ink3)">${ago(n.ts)}</span>
    </div>
    <div class="note-detail-body">${esc(n.body)}</div>
    <div class="note-actions">
      <button class="note-action-btn" onclick="togglePin('${id}')">📌 ${n.pinned?'Odepnij':'Przypnij'}</button>
      <button class="note-action-btn" onclick="aiSummarise('${id}')">✦ Podsumuj</button>
      <button class="note-action-btn danger" onclick="deleteNote('${id}')">🗑 Usuń</button>
    </div>
    <div id="note-ai-area" style="margin-top:14px"></div>`;
  openSheet('sheet-note');
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

function openAddSheet(type, prefill='') {
  const title = document.getElementById('sheet-add-title');
  const body  = document.getElementById('sheet-add-body');

  if (type === 'todo') {
    title.textContent = 'Nowe to-do';
    body.innerHTML = `
      <div class="form-row"><label class="form-label">Zadanie</label>
        <input class="form-input" id="add-todo-text" placeholder="Co zrobić?" value="${esc(prefill)}" /></div>
      <div class="form-row"><label class="form-label">Termin (opcjonalnie)</label>
        <input class="form-input" id="add-todo-due" type="datetime-local" /></div>
      <button class="submit-btn" onclick="addTodo()">Dodaj to-do</button>`;
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

async function addTodo() {
  const text = document.getElementById('add-todo-text').value.trim();
  if (!text) { showToast('Wpisz zadanie'); return; }
  const dueRaw = document.getElementById('add-todo-due').value || null;
  const due = dueRaw ? new Date(dueRaw).toISOString() : null;
  try {
    const t = await CueDB.Todos.create(userId, { text, due });
    S.todos.unshift(t);
    renderAll(); closeSheet('sheet-add'); showToast('✓ Dodane');
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
let pomoSelectedTodoId = null;

const POMO_PHASE_LABELS = {
  focus: 'Focus',
  break: 'Przerwa',
  long_break: 'Długa przerwa',
  paused: 'Pauza',
};

function initPomodoroUI() {
  Pomodoro.on('onTick', (state, left) => renderPomoBar(state, left));
  Pomodoro.on('onChange', state => {
    if (state) renderPomoBar(state, Pomodoro.remaining());
    else hidePomoBar();
  });
  Pomodoro.on('onPhaseEnd', (finished, completed) => onPomodoroPhaseEnd(finished, completed));
  Pomodoro.init();
  if (Pomodoro.isActive()) renderPomoBar(Pomodoro.state, Pomodoro.remaining());
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

function openPomodoroSheet() {
  pomoSelectedDurationSec = 25 * 60;
  pomoSelectedTodoId = null;
  const labelInp = document.getElementById('pomo-label-input');
  if (labelInp) labelInp.value = '';

  document.querySelectorAll('.pomo-duration-chip').forEach(c => c.classList.remove('active'));
  const defaultChip = document.querySelector('.pomo-duration-chip[data-sec="1500"]');
  if (defaultChip) defaultChip.classList.add('active');

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
  const labelInp = document.getElementById('pomo-label-input');
  const label = labelInp ? labelInp.value.trim() || null : null;
  Pomodoro.start({
    durationSec: pomoSelectedDurationSec,
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
