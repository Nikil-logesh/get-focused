/**
 * Get Focused — Supabase Client
 *
 * Hardcoded Supabase connection for developer data collection.
 * Credentials are embedded — end users cannot view or modify them.
 * Data is only sent if the user has granted consent.
 *
 * FIX: Always reads consent + userUuid from chrome.storage before every
 * insert. This is critical because MV3 service workers are ephemeral —
 * in-memory state resets every ~30s of idle. Never trust in-memory flags.
 */

const SupabaseClient = (() => {
  'use strict';
  const SUPABASE_URL = 'YOUR_SUPABASE_URL';
  const SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY';

  /**
   * Ensure a userUuid exists in storage. Returns it.
   */
  function ensureUserUuid() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['userUuid'], (result) => {
        if (result.userUuid) {
          resolve(result.userUuid);
        } else {
          const uuid = generateUuid();
          chrome.storage.local.set({ userUuid: uuid }, () => resolve(uuid));
        }
      });
    });
  }

  /**
   * Read consent from storage (always fresh, never cached in memory).
   */
  function getConsent() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['dataConsentGiven'], (result) => {
        resolve(result.dataConsentGiven === true);
      });
    });
  }

  /**
   * Initialize on startup — just ensures userUuid is created.
   */
  async function init() {
    await ensureUserUuid();
    const consent = await getConsent();
    return consent;
  }

  /**
   * isEnabled — reads from storage each time. Safe across service worker restarts.
   */
  async function isEnabled() {
    return await getConsent();
  }

  /**
   * Set consent. Persisted to storage.
   */
  function setConsent(granted) {
    chrome.storage.local.set({ dataConsentGiven: granted });
  }

  /**
   * Insert a session feature record.
   * Always re-reads consent and userUuid from storage before inserting.
   */
  async function insertSessionFeature(sessionId, features, prediction) {
    // Always read fresh from storage — never trust in-memory state
    const consent = await getConsent();
    if (!consent) {
      return { success: false, reason: 'No consent.' };
    }

    const userUuid = await ensureUserUuid();

    const record = {
      recorded_at: new Date().toISOString(),

      typing_speed_cps:        safeNum(features.typing_speed_cps),
      error_rate:               safeNum(features.error_rate),
      backspace_rate:           safeNum(features.backspace_rate),
      inter_key_interval_ms:   safeNum(features.inter_key_interval_ms),
      pause_avg_ms:             safeNum(features.pause_avg_ms),
      pause_std_ms:             safeNum(features.pause_std_ms),
      pause_to_type_ratio:      safeNum(features.pause_to_type_ratio),
      pause_increase_pct:       safeNum(features.pause_increase_pct),
      hold_time_avg_ms:         safeNum(features.hold_time_avg_ms),
      burst_length_avg:         safeNum(features.burst_length_avg),
      session_duration_min:     safeNum(features.session_duration_min),
      consecutive_hours_worked: safeNum(features.consecutive_hours_worked),
      rhythm_consistency:       safeNum(features.rhythm_consistency),
      keystroke_variability:    safeNum(features.keystroke_variability),
      
      speed_drop_pct:           safeNum(features.speed_drop_pct),
      error_increase_pct:       safeNum(features.error_increase_pct),
      fatigue_score_rule:       safeInt(features.fatigue_score_rule),
      productivity_loss_pct:    safeNum(features.productivity_loss_pct),

      fatigue_label:       prediction.fatigue_label || null
    };

    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/session_features`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(record)
      });

      if (!response.ok) {
        const err = await response.text();
        console.warn('[GetFocused] Supabase insert failed:', response.status, err);
        return { success: false, status: response.status, error: err };
      }

      console.log('[GetFocused] Supabase sync OK:', record.fatigue_label, '@', record.recorded_at);
      return { success: true };
    } catch (error) {
      console.warn('[GetFocused] Supabase network error:', error.message);
      return { success: false, error: error.message };
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────
  function safeNum(v) { const n = parseFloat(v); return isFinite(n) ? n : null; }
  function safeInt(v) { const n = parseInt(v);   return isFinite(n) ? n : null; }

  function generateUuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  return { init, isEnabled, setConsent, insertSessionFeature };

})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SupabaseClient;
}
