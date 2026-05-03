// content/collector.js
// CogniGuard — High-Accuracy Keystroke Feature Extraction
// Captures all 18 features with microsecond precision

'use strict';

// ════════════════════════════════════════════════════════════════════════════
// SESSION STATE
// ════════════════════════════════════════════════════════════════════════════

const SESSION = {
  // Timing
  sessionId:            crypto.randomUUID(),
  startTime:            performance.now(),
  navStartTime:         performance.timeOrigin,
  
  // Raw keystroke events
  events:               [],
  maxEvents:            10000,
  
  // Derived metrics (updated in real-time for efficiency)
  metrics: {
    keystrokeCount:     0,
    backspaceCount:     0,
    ikis:               [],    // All inter-keystroke intervals (ms)
    holds:              [],    // IKI < 200ms
    pauses:             [],    // IKI > 500ms
    bursts:             [],    // Burst lengths (consecutive keys < 300ms apart)
    lastKeystampMs:     0      // Last keystroke timestamp (ms)
  },
  
  // State flags
  focusState:           document.hasFocus(),
  passwordActive:       false,
  lastPasswordCheck:    0,
  passwordCooldown:     2000    // 2 second cooldown after password field
};

// ════════════════════════════════════════════════════════════════════════════
// PASSWORD FIELD DETECTION (CRITICAL FOR PRIVACY)
// ════════════════════════════════════════════════════════════════════════════

function isPasswordField(el) {
  if (!el || !el.tagName) return false;
  
  const type = (el.getAttribute('type') || '').toLowerCase();
  const auto = (el.getAttribute('autocomplete') || '').toLowerCase();
  const name = (el.getAttribute('name') || '').toLowerCase();
  const id   = (el.getAttribute('id') || '').toLowerCase();
  const plh  = (el.getAttribute('placeholder') || '').toLowerCase();
  
  return (
    type === 'password' ||
    type === 'hidden' ||
    type.includes('secret') ||
    auto.includes('password') ||
    auto.includes('current-password') ||
    auto.includes('new-password') ||
    auto.includes('cc-') ||                    // credit card
    auto.includes('csc') ||                    // CVV
    auto.includes('pin') ||
    name.includes('password') ||
    name.includes('passwd') ||
    name.includes('secret') ||
    name.includes('pin') ||
    name.includes('cvv') ||
    id.includes('password') ||
    id.includes('passwd') ||
    id.includes('secret') ||
    id.includes('pin') ||
    plh.includes('password') ||
    plh.includes('secret')
  );
}

// ════════════════════════════════════════════════════════════════════════════
// FOCUS & PASSWORD FIELD MONITORING
// ════════════════════════════════════════════════════════════════════════════

document.addEventListener('focusin', (e) => {
  if (isPasswordField(e.target)) {
    SESSION.passwordActive = true;
    SESSION.lastPasswordCheck = performance.now();
    // Hard block: don't capture anything in password field
  }
}, { capture: true, passive: true });

document.addEventListener('focusout', (e) => {
  // 2-second cooldown to prevent capturing password-adjacent keys
  setTimeout(() => {
    const active = document.activeElement;
    if (!isPasswordField(active)) {
      SESSION.passwordActive = false;
    }
  }, SESSION.passwordCooldown);
}, { capture: true, passive: true });

document.addEventListener('focus', () => {
  SESSION.focusState = true;
}, { capture: true, passive: true });

document.addEventListener('blur', () => {
  SESSION.focusState = false;
}, { capture: true, passive: true });

// ════════════════════════════════════════════════════════════════════════════
// KEYSTROKE EVENT CAPTURE (High-Precision)
// ════════════════════════════════════════════════════════════════════════════

document.addEventListener('keydown', (e) => {
  // ┌─ SAFETY CHECKS ────────────────────────────────────────────┐
  if (SESSION.passwordActive)     return;  // HARD BLOCK
  if (!document.hasFocus())       return;  // Tab not focused
  if (isModifierKey(e.key))       return;  // Shift, Ctrl, Alt, etc.
  if (e.repeat)                   return;  // OS key repeat
  // └────────────────────────────────────────────────────────────┘
  
  const now = performance.now();
  
  // Determine key type (minimal, non-identifying)
  let keyType = 'normal';
  if (e.key === 'Backspace')     keyType = 'backspace';
  else if (e.key === 'Tab')      keyType = 'tab';
  else if (e.key === 'Enter')    keyType = 'enter';
  else if (e.key === ' ')        keyType = 'space';
  else if (e.key === 'Delete')   keyType = 'delete';
  
  // Record event (NO key characters stored)
  const evt = {
    ts:     now,           // High-precision timestamp (microseconds)
    type:   keyType,
    shift:  e.shiftKey,
    ctrl:   e.ctrlKey,
    alt:    e.altKey
  };
  
  SESSION.events.push(evt);
  SESSION.metrics.keystrokeCount++;
  if (keyType === 'backspace') SESSION.metrics.backspaceCount++;
  
  // Maintain circular buffer (prevent memory leak)
  if (SESSION.events.length > SESSION.maxEvents) {
    SESSION.events.shift();
  }
  
  // ┌─ UPDATE INTER-KEYSTROKE INTERVALS ────────────────────────┐
  if (SESSION.metrics.keystrokeCount >= 2) {
    const prevEvt = SESSION.events[SESSION.events.length - 2];
    const iki = now - prevEvt.ts;  // milliseconds
    
    // Sanity: realistic keystroke timing 0-5000ms
    if (iki > 0 && iki < 5000) {
      SESSION.metrics.ikis.push(iki);
      
      // Categorize IKI
      if (iki < 200)  {
        SESSION.metrics.holds.push(iki);
      }
      if (iki > 500)  {
        SESSION.metrics.pauses.push(iki);
      }
      
      // Burst detection (consecutive keys < 300ms apart)
      if (SESSION.metrics.bursts.length === 0) {
        SESSION.metrics.bursts.push(1);
      } else {
        const lastBurstIdx = SESSION.metrics.bursts.length - 1;
        if (iki < 300) {
          SESSION.metrics.bursts[lastBurstIdx]++;
        } else {
          SESSION.metrics.bursts.push(1);  // New burst
        }
      }
    }
  }
  
  SESSION.metrics.lastKeystampMs = now;
  
}, { capture: true, passive: true });

// ────────────────────────────────────────────────────────────────────────────
// Helper: Check if key is a modifier (not content)
// ────────────────────────────────────────────────────────────────────────────
function isModifierKey(key) {
  return [
    'Control', 'Shift', 'Alt', 'Meta',
    'Process', 'AltGraph', 'OS', 'Super'
  ].includes(key);
}

// ════════════════════════════════════════════════════════════════════════════
// FEATURE COMPUTATION ENGINE (All 18 Features)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Extract all 18 features from session metrics
 * Returns object with all features ready for scoring
 */
async function extractAllFeatures(baseline) {
  const m = SESSION.metrics;
  const duration_sec = getSessionDuration();
  
  // ──────────────────────────────────────────────────────────────
  // 1-4: CORE TYPING FEATURES
  // ──────────────────────────────────────────────────────────────
  
  const typing_speed_cps = computeTypingSpeed(m, duration_sec);
  const error_rate       = computeErrorRate(m);
  const backspace_rate   = error_rate;  // Same as error_rate
  const inter_key_interval_ms = computeIKI(m);
  
  // ──────────────────────────────────────────────────────────────
  // 5-8: PAUSE & HOLD FEATURES
  // ──────────────────────────────────────────────────────────────
  
  const pause_avg_ms     = computePauseAvg(m, inter_key_interval_ms);
  const pause_std_ms     = computePauseStd(m);
  const hold_time_avg_ms = computeHoldTime(m, inter_key_interval_ms);
  const burst_length_avg = computeBurstLength(m);
  
  // ──────────────────────────────────────────────────────────────
  // 9-11: RHYTHM & CONSISTENCY FEATURES
  // ──────────────────────────────────────────────────────────────
  
  const rhythm_consistency   = computeRhythmConsistency(m);
  const keystroke_variability = computeKeystrokeVariability(m);
  const pause_to_type_ratio  = computePauseToTypeRatio(m);
  
  // ──────────────────────────────────────────────────────────────
  // 12-13: SESSION CONTEXT
  // ──────────────────────────────────────────────────────────────
  
  const session_duration_min = duration_sec / 60;
  const now = new Date();
  const consecutive_hours_worked = Math.min(16, (now.getHours() + now.getMinutes()/60));
  
  // ──────────────────────────────────────────────────────────────
  // 14-18: DEVIATION FEATURES (baseline-relative)
  // ──────────────────────────────────────────────────────────────
  
  let speed_drop_pct      = 0;
  let error_increase_pct  = 0;
  let pause_increase_pct  = 0;
  let fatigue_score_rule  = 0;
  let productivity_loss_pct = 0;
  
  if (baseline) {
    speed_drop_pct = computeSpeedDropPct(typing_speed_cps, baseline.typing_speed_cps);
    error_increase_pct = computeErrorIncreasePerc(error_rate, baseline.error_rate);
    pause_increase_pct = computePauseIncreasePerc(pause_avg_ms, baseline.pause_avg_ms);
    fatigue_score_rule = computeFatigueScore(speed_drop_pct, error_increase_pct, pause_increase_pct);
    productivity_loss_pct = computeProductivityLoss(speed_drop_pct, error_increase_pct, pause_increase_pct);
  }
  
  // ──────────────────────────────────────────────────────────────
  // ASSEMBLE FEATURE OBJECT
  // ──────────────────────────────────────────────────────────────
  
  const features = {
    // Core typing (4)
    typing_speed_cps:        round(typing_speed_cps, 3),
    error_rate:              round(error_rate, 4),
    backspace_rate:          round(backspace_rate, 4),
    inter_key_interval_ms:   round(inter_key_interval_ms, 1),
    
    // Pause & hold (4)
    pause_avg_ms:            round(pause_avg_ms, 1),
    pause_std_ms:            round(pause_std_ms, 1),
    hold_time_avg_ms:        round(hold_time_avg_ms, 1),
    burst_length_avg:        round(burst_length_avg, 2),
    
    // Rhythm (3)
    rhythm_consistency:      round(rhythm_consistency, 4),
    keystroke_variability:   round(keystroke_variability, 4),
    pause_to_type_ratio:     round(pause_to_type_ratio, 4),
    
    // Context (2)
    session_duration_min:    round(session_duration_min, 2),
    consecutive_hours_worked: round(consecutive_hours_worked, 2),
    
    // Deviations (5)
    speed_drop_pct:          round(speed_drop_pct, 2),
    error_increase_pct:      round(error_increase_pct, 2),
    pause_increase_pct:      round(pause_increase_pct, 2),
    fatigue_score_rule:      round(fatigue_score_rule, 4),
    productivity_loss_pct:   round(productivity_loss_pct, 2),
    
    // Safety flags
    password_field_active:   false
  };
  
  return features;
}

// ════════════════════════════════════════════════════════════════════════════
// FEATURE COMPUTATION FUNCTIONS (18 functions)
// ════════════════════════════════════════════════════════════════════════════

function computeTypingSpeed(m, duration_sec) {
  // Exclude backspaces from count
  const netKeys = m.keystrokeCount - m.backspaceCount;
  if (duration_sec < 1) return 0;
  const cps = netKeys / duration_sec;
  return Math.min(10, Math.max(0.1, cps));
}

function computeErrorRate(m) {
  if (m.keystrokeCount === 0) return 0;
  const rate = m.backspaceCount / m.keystrokeCount;
  return Math.min(0.8, rate);
}

function computeIKI(m) {
  const ikis = m.ikis.filter(iki => iki > 0 && iki < 5000);
  if (ikis.length === 0) return 200;  // Default if no data
  const sum = ikis.reduce((a, b) => a + b, 0);
  return sum / ikis.length;
}

function computePauseAvg(m, defaultIKI) {
  if (m.pauses.length === 0) {
    return Math.max(100, defaultIKI * 1.2);
  }
  const sum = m.pauses.reduce((a, b) => a + b, 0);
  const avg = sum / m.pauses.length;
  return Math.min(3000, Math.max(100, avg));
}

function computePauseStd(m) {
  if (m.pauses.length < 2) return 0;
  const mean = computePauseAvg(m, 200);
  const sumSqDev = m.pauses.reduce((sum, p) => sum + (p - mean) ** 2, 0);
  const variance = sumSqDev / m.pauses.length;
  return Math.sqrt(variance);
}

function computeHoldTime(m, defaultIKI) {
  if (m.holds.length === 0) {
    return Math.max(20, defaultIKI * 0.6);
  }
  const sum = m.holds.reduce((a, b) => a + b, 0);
  const avg = sum / m.holds.length;
  return Math.min(200, Math.max(20, avg));
}

function computeBurstLength(m) {
  if (m.bursts.length === 0) return 1;
  const sum = m.bursts.reduce((a, b) => a + b, 0);
  const avg = sum / m.bursts.length;
  return Math.min(20, Math.max(1, avg));
}

function computeRhythmConsistency(m) {
  const ikis = m.ikis.filter(iki => iki > 0 && iki < 5000);
  if (ikis.length < 2) return 0.5;
  
  const mean = ikis.reduce((a, b) => a + b, 0) / ikis.length;
  const sumSqDev = ikis.reduce((sum, x) => sum + (x - mean) ** 2, 0);
  const std = Math.sqrt(sumSqDev / ikis.length);
  const cv = mean > 0 ? std / mean : 1;
  
  return Math.max(0, 1 - cv);
}

function computeKeystrokeVariability(m) {
  const ikis = m.ikis.filter(iki => iki > 0 && iki < 5000);
  if (ikis.length < 2) return 0.1;
  
  const mean = ikis.reduce((a, b) => a + b, 0) / ikis.length;
  const sumSqDev = ikis.reduce((sum, x) => sum + (x - mean) ** 2, 0);
  const std = Math.sqrt(sumSqDev / ikis.length);
  
  return Math.min(1, std / 1000);
}

function computePauseToTypeRatio(m) {
  if (m.keystrokeCount === 0) return 0;
  const ratio = m.pauses.length / m.keystrokeCount;
  return Math.min(5, Math.max(0, ratio));
}

function computeSpeedDropPct(current, baseline) {
  if (baseline === 0) return 0;
  const drop = ((baseline - current) / baseline) * 100;
  return Math.min(100, Math.max(-50, drop));
}

function computeErrorIncreasePerc(current, baseline) {
  const base = baseline > 0 ? baseline : 0.01;
  const inc = ((current - base) / base) * 100;
  return Math.min(500, Math.max(-100, inc));
}

function computePauseIncreasePerc(current, baseline) {
  const base = baseline > 0 ? baseline : 100;
  const inc = ((current - base) / base) * 100;
  return Math.min(500, Math.max(-100, inc));
}

function computeFatigueScore(speedDrop, errorInc, pauseInc) {
  const score = 
    0.40 * (speedDrop / 70) +
    0.35 * (errorInc / 500) +
    0.25 * (pauseInc / 500);
  
  return Math.max(0, Math.min(1, score));
}

function computeProductivityLoss(speedDrop, errorInc, pauseInc) {
  const loss = 
    0.45 * speedDrop +
    0.35 * errorInc * 0.1 +
    0.20 * pauseInc * 0.1;
  
  return Math.max(0, Math.min(100, loss));
}

// ════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ════════════════════════════════════════════════════════════════════════════

function getSessionDuration() {
  return (performance.now() - SESSION.startTime) / 1000;  // seconds
}

function round(num, decimals) {
  return parseFloat(num.toFixed(decimals));
}

// ════════════════════════════════════════════════════════════════════════════
// MONITORING LOOP (60-second windows)
// ════════════════════════════════════════════════════════════════════════════

async function startMonitoring() {
  // Load baseline if exists
  const stored = await chrome.storage.local.get('user_baseline');
  const baseline = stored.user_baseline || null;
  
  setInterval(async () => {
    // Skip if insufficient data or in password field
    if (SESSION.passwordActive || SESSION.metrics.keystrokeCount < 10) {
      return;
    }
    
    // Extract all 18 features
    const features = await extractAllFeatures(baseline);
    
    // Validate all features
    for (const [key, value] of Object.entries(features)) {
      if (typeof value === 'number' && (!isFinite(value) || isNaN(value))) {
        features[key] = 0;
      }
    }
    
    // Send to service worker
    try {
      chrome.runtime.sendMessage({
        type: 'SESSION_DATA',
        data: features,
        timestamp: Date.now(),
        sessionId: SESSION.sessionId
      });
    } catch (err) {
      // Extension might not be listening
      console.debug('CogniGuard: Extension not ready', err.message);
    }
    
    // Reset for next window
    SESSION.events = [];
    SESSION.metrics = {
      keystrokeCount: 0,
      backspaceCount: 0,
      ikis: [],
      holds: [],
      pauses: [],
      bursts: [],
      lastKeystampMs: 0
    };
    SESSION.startTime = performance.now();
    
  }, 60000);  // 60 second windows
}

// Start monitoring when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startMonitoring);
} else {
  startMonitoring();
}
