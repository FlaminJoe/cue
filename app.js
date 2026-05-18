/**
 * app.js
 * ─────────────────
 * Cue — główna logika aplikacji.
 * Stan, render, capture flow, Ask AI, voice, search, reminders check, PWA install, onboarding.
 *
 * Zależy od: Scribe (agents/scribe.js), Router (agents/router.js), CueDB (supabase.js — placeholder w Etapie 1)
 * Używany przez: index.html (jako ostatni skrypt, po wszystkich zależnościach)
 *
 * Stan v1.0 (Etap 1 refactoru):
 *   - persistencja: localStorage (klucze `memo_v2` + `memo_api_key` — kompatybilność wstecz)
 *   - auth: brak (Etap 2)
 *   - Pomodoro: brak (Etap 3)
 */

// ─────────────────────────────────────────────
//  CONFIG
// ─────────────────────────────────────────────

const MODEL_SMART = 'claude-sonnet-4-6';
const SK = 'memo_v2';         // localStorage key dla state (zachowane dla kompatybilności wstecz)
const AK = 'memo_api_key';    // localStorage key dla Claude API key

// ─────────────────────────────────────────────
//  STATE & PERSISTENCE
// ─────────────────────────────────────────────

let S = { notes: [], todos: [], reminders: [] };

function save() {
  try { localStorage.setItem(SK, JSON.stringify(S)); } catch(e) {}
}

function load() {
  try {
    const d = localStorage.getItem(SK);
    if (d) { S = JSON.parse(d); return; }
  } catch(e) {}
  // Seed pierwsza wizyta
  const now = Date.now();
  S = {
    notes: [
      { id: uid(), title: 'Witaj w Cue', body: 'Łap myśli na żywo — dotknij mikrofonu i powiedz, albo pisz poniżej. AI auto-taguje wszystko, żebyś nie musiał porządkować ręcznie.', folder: 'inbox', tags: ['inbox'], pinned: true, ts: now - 60000 },
      { id: uid(), title: 'Studio pomysł — animowane mapy', body: 'Można zaoferować animowane mapy zasięgu (SVG) jako upsell dla klientów lokalnych. Mexbruk to potencjalny szablon.', folder: 'studio', tags: ['studio', 'ideas'], pinned: false, ts: now - 3600000 },
      { id: uid(), title: 'Sprawdzić body doubling', body: 'Coś o body doubling jako technice pomocniczej dla ADHD przy inicjacji zadań. Focusmate — wirtualny co-working.', folder: 'personal', tags: ['personal', 'adhd'], pinned: false, ts: now - 86400000 },
    ],
    todos: [
      { id: uid(), text: 'Domknąć feedback Mexbruk', done: false, due: '', ts: now },
      { id: uid(), text: 'Wysłać fakturę za ostatni projekt', done: false, due: '', ts: now - 3600000 },
    ],
    reminders: [
      { id: uid(), text: 'Sprawdzić maila — odpowiedź od klienta', time: fTime(1), notified: false },
      { id: uid(), text: 'Zrób porządną przerwę', time: fTime(3), notified: false },
    ]
  };
  save();
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function fTime(h) { const d = new Date(); d.setHours(d.getHours()+h); return d.toISOString(); }

// ─────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────

function init() {
  load();
  renderGreeting();
  renderAll();
  registerSW();
  initPWAInstall();
  requestNotifPermission();
  setInterval(checkReminders, 30000);
  checkReminders();
  checkOnboarding();
}

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

// ─────────────────────────────────────────────
//  TODAY
// ─────────────────────────────────────────────

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

// ─────────────────────────────────────────────
//  NOTES
// ─────────────────────────────────────────────

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

// ─────────────────────────────────────────────
//  TODOS
// ─────────────────────────────────────────────

function renderTodos() {
  const pending = S.todos.filter(t => !t.done);
  const done    = S.todos.filter(t => t.done);
  let html = '';
  if (pending.length) html += pending.map(todoHTML).join('');
  if (done.length)    html += `<div class="section-label" style="margin-top:20px">Zrobione (${done.length})</div>` + done.map(todoHTML).join('');
  if (!S.todos.length) html = emptyHTML('✅','Pusta lista','Dodaj to-do przyciskiem +');
  document.getElementById('todos-list').innerHTML = html;
}

// ─────────────────────────────────────────────
//  REMINDERS
// ─────────────────────────────────────────────

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
  const inp = document.getElementById('capture-input');
  const text = inp.value.trim();
  if (!text) return;
  inp.value = ''; autoResize(inp);

  if (captureType === 'todo') {
    S.todos.unshift({ id: uid(), text, done: false, due: '', ts: Date.now() });
    save(); renderAll(); showToast('✓ Dodane'); return;
  }

  if (captureType === 'reminder') {
    openAddSheet('reminder', text); return;
  }

  // Note — Scribe tagowanie (Haiku)
  showToast('✦ Zapisuję…');
  const { title, folder, tags } = await Scribe.process(text, getAPIKey());

  S.notes.unshift({ id:uid(), title, body:text, folder, tags, pinned:false, ts:Date.now() });
  save(); renderAll(); showToast(`📂 Zapisane → ${folder}`);
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
  const key = getAPIKey();
  if (!key || key === 'skipped') {
    el.innerHTML = '<div class="ai-response">Dodaj klucz API, żeby używać funkcji AI.</div>'; return;
  }
  el.innerHTML = '<div class="ai-response ai-loading">✦ Podsumowuję…</div>';
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'x-api-key':key,
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

function togglePin(id) {
  const n = S.notes.find(x=>x.id===id); if(!n) return;
  n.pinned = !n.pinned; save(); renderAll(); closeSheet('sheet-note');
  showToast(n.pinned ? '📌 Przypięte' : 'Odpięte');
}

function deleteNote(id) {
  if (!confirm('Usunąć tę notatkę?')) return;
  S.notes = S.notes.filter(x=>x.id!==id);
  save(); renderAll(); closeSheet('sheet-note'); showToast('🗑 Usunięte');
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

function addTodo() {
  const text = document.getElementById('add-todo-text').value.trim();
  if (!text) { showToast('Wpisz zadanie'); return; }
  const due = document.getElementById('add-todo-due').value || '';
  S.todos.unshift({ id:uid(), text, done:false, due, ts:Date.now() });
  save(); renderAll(); closeSheet('sheet-add'); showToast('✓ Dodane');
}

function addReminder() {
  const text = document.getElementById('add-rem-text').value.trim();
  const time = document.getElementById('add-rem-time').value;
  if (!text || !time) { showToast('Wypełnij oba pola'); return; }
  S.reminders.push({ id:uid(), text, time:new Date(time).toISOString(), notified:false });
  save(); renderAll(); closeSheet('sheet-add'); showToast('🔔 Ustawione');
}

function toggleTodo(id) {
  const t = S.todos.find(x=>x.id===id); if(!t) return;
  t.done = !t.done; save(); renderAll();
}
function deleteTodo(id)     { S.todos     = S.todos.filter(x=>x.id!==id); save(); renderAll(); }
function deleteReminder(id) { S.reminders = S.reminders.filter(x=>x.id!==id); save(); renderAll(); }

// ─────────────────────────────────────────────
//  REMINDERS CHECK
// ─────────────────────────────────────────────

function requestNotifPermission() {
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
}

function checkReminders() {
  const now = new Date();
  S.reminders.forEach(r => {
    if (!r.notified && new Date(r.time) <= now) {
      r.notified = true; save();
      showToast('🔔 ' + r.text);
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Cue', { body: r.text });
      }
      renderAll();
    }
  });
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
  const key = getAPIKey();

  if (!key || key === 'skipped') {
    el.style.display = 'block';
    el.className = 'ai-response';
    el.textContent = 'Brak klucza API. Dotknij ✦ w prawym górnym i dodaj klucz, żeby włączyć funkcje AI.';
    return;
  }

  el.style.display = 'block'; el.className = 'ai-response ai-loading'; el.textContent = 'Myślę…';
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'x-api-key': key,
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
//  API KEY
// ─────────────────────────────────────────────

function getAPIKey() {
  return localStorage.getItem(AK) || '';
}

function saveAPIKey() {
  const key = document.getElementById('ob-key-input').value.trim();
  if (!key.startsWith('sk-ant-')) { showToast('Klucz nie wygląda poprawnie — sprawdź'); return; }
  localStorage.setItem(AK, key);
  document.getElementById('onboarding').classList.add('hidden');
  showToast('✓ Klucz zapisany — gotowe!');
}

function skipAPIKey() {
  localStorage.setItem(AK, 'skipped');
  document.getElementById('onboarding').classList.add('hidden');
  showToast('Działamy bez AI — klucz dodasz w ustawieniach');
}

function checkOnboarding() {
  const key = getAPIKey();
  if (!key) {
    document.getElementById('onboarding').classList.remove('hidden');
  }
}

// ─────────────────────────────────────────────
//  PWA
// ─────────────────────────────────────────────

let deferredInstall = null;

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
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

function bootstrap() {
  document.getElementById('capture-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); capture(); }
  });
  init();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
