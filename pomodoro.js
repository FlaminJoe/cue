/**
 * pomodoro.js
 * ─────────────────
 * Cue — silnik timera Pomodoro.
 *
 * State machine: idle | focus | break | long_break | paused
 * Czas liczony z Date.now() (timer dokładny mimo background tab / refresh).
 * Stan persystowany w localStorage — przeżywa odświeżenie strony.
 * Wake Lock API — ekran nie gaśnie podczas focusu.
 *
 * Cykl: focus → break → focus → break → focus → break → focus → long_break → …
 *        (długa przerwa co `CYCLES_BEFORE_LONG` focusów).
 *
 * Sesje focus zapisywane są do `pomodoro_sessions` w Supabase po zakończeniu.
 *
 * Zależy od: window.CueDB (supabase.js) — soft dependency, działa też bez
 * Używany przez: app.js
 */

const Pomodoro = {
  FOCUS_SEC: 25 * 60,
  BREAK_SEC: 5 * 60,
  LONG_BREAK_SEC: 15 * 60,
  CYCLES_BEFORE_LONG: 4,
  STORAGE_KEY: 'cue_pomodoro_state',
  TICK_MS: 250,

  /**
   * state = null gdy idle.
   * state = {
   *   phase: 'focus'|'break'|'long_break'|'paused',
   *   prePausePhase?: 'focus'|'break'|'long_break',  // tylko gdy paused
   *   startedAtMs: number,            // unix ms gdy START tej fazy
   *   durationSec: number,            // długość tej fazy
   *   remainingSec?: number,          // tylko gdy paused — ile zostało w momencie pauzy
   *   todoId?: string|null,           // FK do todos
   *   label?: string|null,            // freestyle gdy bez to-do
   *   completedFocusCycles: number,   // liczba focusów ukończonych w bieżącej "ścieżce"
   * }
   */
  state: null,

  _tickInterval: null,
  _wakeLock: null,
  _handlers: { onTick: null, onPhaseEnd: null, onChange: null },

  // ─── Public API ──────────────────────────────────────

  init() {
    this._load();
    if (this.state && this.state.phase !== 'paused') {
      // Wznów tick po refreshu — jeśli czas już minął, _tick() obsłuży _onPhaseEnd
      this._startTick();
      this._requestWakeLock();
    }
  },

  on(event, fn) { this._handlers[event] = fn; },

  /** Aktualna liczba sekund pozostałych w fazie. 0 gdy idle. */
  remaining() {
    if (!this.state) return 0;
    if (this.state.phase === 'paused') return this.state.remainingSec || 0;
    const elapsed = Math.floor((Date.now() - this.state.startedAtMs) / 1000);
    return Math.max(0, this.state.durationSec - elapsed);
  },

  isActive() { return !!this.state; },
  isPaused() { return this.state?.phase === 'paused'; },
  isRunning() { return this.isActive() && !this.isPaused(); },

  /**
   * Startuje nowy cykl focus.
   * @param {object} opts { durationSec?, todoId?, label? }
   */
  start({ durationSec = this.FOCUS_SEC, todoId = null, label = null } = {}) {
    this.state = {
      phase: 'focus',
      startedAtMs: Date.now(),
      durationSec,
      todoId,
      label,
      completedFocusCycles: 0,
    };
    this._save();
    this._startTick();
    this._requestWakeLock();
    this._emitChange();
  },

  pause() {
    if (!this.isRunning()) return;
    this.state.remainingSec = this.remaining();
    this.state.prePausePhase = this.state.phase;
    this.state.phase = 'paused';
    this._save();
    this._stopTick();
    this._releaseWakeLock();
    this._emitChange();
  },

  resume() {
    if (!this.isPaused()) return;
    this.state.durationSec = this.state.remainingSec;
    this.state.startedAtMs = Date.now();
    this.state.phase = this.state.prePausePhase || 'focus';
    delete this.state.remainingSec;
    delete this.state.prePausePhase;
    this._save();
    this._startTick();
    this._requestWakeLock();
    this._emitChange();
  },

  /** Pełny stop — kasuje stan i przestaje tickać. Nie zapisuje sesji (uznajemy za przerwaną). */
  reset() {
    this._stopTick();
    this._releaseWakeLock();
    this.state = null;
    this._save();
    this._emitChange();
  },

  /** Pomiń aktualną fazę (np. skróć przerwę i wskocz w kolejny focus). */
  async skipPhase() {
    if (!this.state) return;
    await this._advancePhase({ countAsCompleted: false });
  },

  // ─── Internals ───────────────────────────────────────

  _startTick() {
    this._stopTick();
    this._tickInterval = setInterval(() => this._tick(), this.TICK_MS);
  },

  _stopTick() {
    if (this._tickInterval) { clearInterval(this._tickInterval); this._tickInterval = null; }
  },

  _tick() {
    if (!this.isRunning()) return;
    const left = this.remaining();
    if (this._handlers.onTick) this._handlers.onTick(this.state, left);
    if (left <= 0) this._advancePhase({ countAsCompleted: true });
  },

  async _advancePhase({ countAsCompleted }) {
    const finished = { ...this.state };
    this._stopTick();
    this._releaseWakeLock();

    // Zapisz sesję focus do bazy
    if (countAsCompleted && finished.phase === 'focus' && window.CueDB && window.__cueUserId) {
      try {
        await window.CueDB.PomodoroSessions.create(window.__cueUserId, {
          todoId: finished.todoId,
          label: finished.label,
          durationSec: finished.durationSec,
          completed: true,
        });
      } catch (e) { /* nieblokujące */ }
    }

    if (this._handlers.onPhaseEnd) this._handlers.onPhaseEnd(finished, countAsCompleted);

    const cycles = finished.phase === 'focus' && countAsCompleted
      ? finished.completedFocusCycles + 1
      : finished.completedFocusCycles;

    let nextPhase, nextDuration;
    if (finished.phase === 'focus') {
      const isLong = cycles > 0 && cycles % this.CYCLES_BEFORE_LONG === 0;
      nextPhase = isLong ? 'long_break' : 'break';
      nextDuration = isLong ? this.LONG_BREAK_SEC : this.BREAK_SEC;
    } else {
      nextPhase = 'focus';
      nextDuration = this.FOCUS_SEC;
    }

    this.state = {
      phase: nextPhase,
      startedAtMs: Date.now(),
      durationSec: nextDuration,
      todoId: finished.todoId,
      label: finished.label,
      completedFocusCycles: cycles,
    };
    this._save();
    this._startTick();
    if (nextPhase === 'focus') this._requestWakeLock();
    this._emitChange();
  },

  _save() {
    try {
      if (this.state) localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.state));
      else localStorage.removeItem(this.STORAGE_KEY);
    } catch {}
  },

  _load() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (raw) this.state = JSON.parse(raw);
    } catch { this.state = null; }
  },

  _emitChange() {
    if (this._handlers.onChange) this._handlers.onChange(this.state);
  },

  async _requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try { this._wakeLock = await navigator.wakeLock.request('screen'); }
    catch {}
  },

  _releaseWakeLock() {
    if (this._wakeLock) {
      try { this._wakeLock.release(); } catch {}
      this._wakeLock = null;
    }
  },
};

// Re-acquire wake lock po wróceniu do karty (Page Visibility) — przeglądarka go zwalnia w tle.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Pomodoro.isRunning()
        && Pomodoro.state.phase === 'focus' && !Pomodoro._wakeLock) {
      Pomodoro._requestWakeLock();
    }
  });
}

if (typeof window !== 'undefined') window.Pomodoro = Pomodoro;
