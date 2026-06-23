/**
 * share.js
 * ─────────────────
 * Cue — publiczny, tylko-do-odczytu widok udostępnionego planu zadań.
 * Nie wymaga logowania. Odbiorca linku nie może niczego zmienić/usunąć.
 *
 * Świadomie nie importuje app.js (cała appka jest auth-gated) — kilka prostych
 * helperów jest tu zduplikowanych, żeby ta strona została mała i niezależna.
 *
 * Zależy od: CueDB.Shares.getPublic (supabase.js)
 * Używany przez: share.html
 */

const FIELD_KINDS = {
  text:     { label: 'Notatka',  icon: '📝' },
  number:   { label: 'Budżet',   icon: '💰' },
  url:      { label: 'Link',     icon: '🔗' },
  select:   { label: 'Status',   icon: '🏷️' },
  checkbox: { label: 'Checkbox', icon: '☑️' },
};

const PRIORITY_LABELS = { low: 'Niski', medium: 'Średni', high: 'Wysoki' };

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtDT(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('pl-PL',{day:'numeric',month:'short'}) + ' · ' +
    d.toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'});
}

function fieldPillHTML(f) {
  const info = FIELD_KINDS[f.kind];
  if (!info || f.value === '' || f.value == null) return '';
  if (f.kind === 'checkbox' && !f.value) return '';
  if (f.kind === 'url') {
    const label = f.label ? esc(f.label) : 'Link';
    return `<a class="field-pill" href="${esc(f.value)}" target="_blank" rel="noopener noreferrer">${info.icon} ${label}</a>`;
  }
  const display = f.kind === 'checkbox' ? (f.label || info.label) : (f.label ? `${f.label}: ${f.value}` : `${f.value}`);
  return `<span class="field-pill">${info.icon} ${esc(display)}</span>`;
}

function sharedTodoHTML(t) {
  const prClass = t.priority ? `priority-${t.priority}` : '';
  const pill = t.priority
    ? `<span class="priority-pill ${t.priority}">${PRIORITY_LABELS[t.priority]}</span>`
    : '';
  const due = t.due ? `<span class="todo-due">📅 ${fmtDT(t.due)}</span>` : '';
  const metaRow = (pill || due) ? `<div class="todo-meta-row">${pill}${due}</div>` : '';
  const fieldPills = Object.values(t.customFields || {}).map(fieldPillHTML).join('');
  const fieldsRow = fieldPills ? `<div class="todo-fields-row">${fieldPills}</div>` : '';
  return `<div class="todo-item ${t.done?'done':''} ${prClass}">
    <div class="todo-check ${t.done?'checked':''}">${t.done?'✓':''}</div>
    <div style="flex:1;min-width:0">
      <div class="todo-text ${t.done?'done':''}">${esc(t.text)}</div>
      ${metaRow}
      ${fieldsRow}
    </div>
  </div>`;
}

function showShareError() {
  document.getElementById('share-title').textContent = 'Link niedostępny';
  document.getElementById('share-expiry').textContent = '';
  document.getElementById('share-todos-list').innerHTML =
    '<p style="text-align:center;color:var(--ink3);padding:24px;font-size:13px">Ten link wygasł albo został cofnięty.</p>';
}

function renderShareView(data) {
  document.getElementById('share-title').textContent = data.title || 'Cue — udostępniony plan';
  const expiry = new Date(data.expiresAt).toLocaleDateString('pl-PL', { day:'numeric', month:'long', year:'numeric' });
  document.getElementById('share-expiry').textContent = `Wygasa: ${expiry} · tylko do odczytu`;
  document.getElementById('share-todos-list').innerHTML = data.todos.length
    ? data.todos.map(sharedTodoHTML).join('')
    : '<p style="text-align:center;color:var(--ink3);padding:24px;font-size:13px">Brak zadań w tym udostępnieniu.</p>';
}

async function bootShare() {
  const token = new URLSearchParams(location.search).get('token');
  if (!token) return showShareError();
  try {
    const data = await CueDB.Shares.getPublic(token);
    if (!data) return showShareError();
    renderShareView(data);
  } catch {
    showShareError();
  }
}

document.addEventListener('DOMContentLoaded', bootShare);
