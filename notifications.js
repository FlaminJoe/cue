/**
 * notifications.js
 * ─────────────────
 * Cue — system powiadomień.
 * Wrapper na Web Notification API z explicit promptem, fallbackiem i instrukcją gdy denied.
 *
 * Zależy od: niczego (Notification API z window)
 * Używany przez: app.js (reminders, pomodoro)
 */

const Notify = {
  /** 'granted' | 'denied' | 'default' | 'unsupported' */
  get state() {
    if (!this.supported()) return 'unsupported';
    return Notification.permission;
  },

  supported() {
    return typeof Notification !== 'undefined';
  },

  /**
   * Prosi o permission. Zwraca finalny state.
   * Bezpieczna do wielokrotnego wywołania — Notification.requestPermission()
   * w nowoczesnych przeglądarkach od razu zwraca obecny stan jeśli już zdecydowano.
   */
  async request() {
    if (!this.supported()) return 'unsupported';
    if (Notification.permission !== 'default') return Notification.permission;
    try {
      const result = await Notification.requestPermission();
      return result;
    } catch {
      return Notification.permission;
    }
  },

  /**
   * Pokazuje powiadomienie. Cicho ignoruje gdy permission ≠ 'granted'.
   * Caller powinien sam decydować o fallbacku (toast w UI itp).
   */
  show(title, options = {}) {
    if (this.state !== 'granted') return false;
    try {
      const n = new Notification(title, {
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        ...options,
      });
      // Kliknięcie powiadomienia → focus karty
      n.onclick = () => {
        try { window.focus(); n.close(); } catch {}
      };
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Krótka, opisowa wskazówka jak włączyć powiadomienia po wcześniejszym 'denied'.
   * Zwraca string do pokazania userowi w toaście / modalu.
   */
  howToReenable() {
    return 'Powiadomienia są zablokowane. Włącz: ikona kłódki w pasku adresu → Ustawienia witryny → Powiadomienia → Zezwól. Potem odśwież.';
  },
};

if (typeof window !== 'undefined') window.Notify = Notify;
