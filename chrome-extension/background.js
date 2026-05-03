/**
 * Get Focused — Background Service Worker
 * 
 * Orchestrates feature computation, API communication, and state management.
 * Receives raw data from content scripts, computes features,
 * sends to Flask API for prediction, and manages alert/notification system.
 */

importScripts('libs/feature-engine.js');
importScripts('libs/supabase-client.js');

// ─── Constants ──────────────────────────────────────────────────────

const API_BASE = 'https://NIKILLOGESH.pythonanywhere.com';
const PREDICTION_ALARM = 'fatigue-prediction';
const PREDICTION_INTERVAL_MIN = 1; // Run prediction every 1 minute
const BASELINE_CALIBRATION_PERIOD_MS = 5 * 60 * 1000; // 5 minutes
const SESSION_HISTORY_MAX = 50;

// ─── State ──────────────────────────────────────────────────────────

let currentSession = {
  id: generateSessionId(),
  startTime: Date.now(),
  rawData: null,
  baseline: null,
  baselineCalibrated: false,
  baselineDataPoints: [],
  latestFeatures: null,
  latestPrediction: null,
  predictionHistory: [],
  isMonitoring: true,
  demoMode: false,
  demoData: null
};

function generateSessionId() {
  return 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
}

// ─── Message Handling ───────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'SESSION_DATA':
      handleSessionData(message.data, message.timestamp);
      sendResponse({ status: 'received' });
      break;

    case 'SESSION_START':
      handleSessionStart(message.timestamp);
      sendResponse({ status: 'ok' });
      break;

    case 'GET_DASHBOARD_DATA':
      sendResponse(getDashboardData());
      break;

    case 'TOGGLE_MONITORING':
      currentSession.isMonitoring = message.enabled;
      chrome.storage.local.set({ monitoringEnabled: message.enabled });
      // Forward to all content scripts
      broadcastToTabs({ type: 'TOGGLE_MONITORING', enabled: message.enabled });
      sendResponse({ status: 'ok', monitoring: message.enabled });
      break;

    case 'RESET_BASELINE':
      resetBaseline();
      sendResponse({ status: 'baseline_reset' });
      break;

    case 'LOAD_DEMO_DATA':
      loadDemoData();
      sendResponse({ status: 'demo_loaded' });
      break;

    case 'GET_SESSION_HISTORY':
      chrome.storage.local.get(['sessionHistory'], (result) => {
        sendResponse({ history: result.sessionHistory || [] });
      });
      return true; // async response

    default:
      sendResponse({ status: 'unknown_message_type' });
  }

  return true;
});

// ─── Raw Data Processing ────────────────────────────────────────────

function handleSessionData(features, timestamp) {
  if (!currentSession.isMonitoring) return;

  console.log(`[Get Focused] Background received features:`, features);

  currentSession.latestFeatures = features;

  chrome.storage.local.get(['user_baseline', 'baselineCalibrated'], (result) => {
    const baseline = result.user_baseline || null;
    const calibrated = result.baselineCalibrated || false;

    currentSession.baseline = baseline;
    currentSession.baselineCalibrated = calibrated;

    // Handle baseline calibration
    if (!calibrated) {
      calibrateBaseline(features, timestamp);
    }

    // Store latest features
    chrome.storage.local.set({
      latestFeatures: features,
      lastUpdateTime: timestamp
    });

    // Send to prediction API
    requestPrediction(features);
  });
}

// ─── Baseline Calibration ───────────────────────────────────────────

function calibrateBaseline(features, timestamp) {
  currentSession.baselineDataPoints.push({
    speed: features.typing_speed_cps,
    error: features.error_rate,
    pause: features.pause_avg_ms
  });

  if (currentSession.baselineDataPoints.length >= 3) {
    const points = currentSession.baselineDataPoints;
    const baseline = {
      typing_speed_cps: FeatureEngine.mean(points.map(p => p.speed)),
      error_rate: FeatureEngine.mean(points.map(p => p.error)),
      pause_avg_ms: FeatureEngine.mean(points.map(p => p.pause))
    };

    chrome.storage.local.set({
      user_baseline: baseline,
      baselineCalibrated: true
    });

    currentSession.baseline = baseline;
    currentSession.baselineCalibrated = true;
  }
}

function resetBaseline() {
  currentSession.baselineCalibrated = false;
  currentSession.baselineDataPoints = [];
  currentSession.baseline = null;
  chrome.storage.local.set({
    user_baseline: null,
    baselineCalibrated: false
  });
}

function loadDemoData() {
  currentSession.demoMode = true;
  currentSession.demoData = {
    startTime: Date.now() - (45 * 60 * 1000),
    baseline: { typing_speed_cps: 6.2, error_rate: 0.02, pause_avg_ms: 150 },
    latestFeatures: {
      typing_speed_cps: 5.8, typing_speed_wpm: 70, error_rate: 0.04, pause_avg_ms: 180,
      rhythm_consistency: 0.85, hold_time_avg_ms: 85, burst_length_avg: 10.5,
      session_duration_min: 45, consecutive_hours_worked: 0.75, inter_key_interval_ms: 140,
      productivity_loss_pct: 12.5, fatigue_score_rule: 28, speed_drop_pct: 6.4,
      error_increase_pct: 100, pause_increase_pct: 20
    },
    latestPrediction: { fatigue_label: 'mild_fatigue', confidence: 0.76, source: 'ml_model' },
    predictionHistory: [
      { fatigue_label: 'normal', timestamp: Date.now() - 40 * 60000 },
      { fatigue_label: 'normal', timestamp: Date.now() - 30 * 60000 },
      { fatigue_label: 'normal', timestamp: Date.now() - 20 * 60000 },
      { fatigue_label: 'mild_fatigue', timestamp: Date.now() - 10 * 60000 },
      { fatigue_label: 'mild_fatigue', timestamp: Date.now() - 5 * 60000 }
    ]
  };

  currentSession.demoExpiresAt = Date.now() + (2 * 60 * 1000); // Expires exactly 2 minutes from click
}

// ─── Prediction API ─────────────────────────────────────────────────

async function requestPrediction(features) {
  const modelFeatures = FeatureEngine.extractModelFeatures(features);

  try {
    const response = await fetch(`${API_BASE}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(modelFeatures)
    });

    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}`);
    }

    const prediction = await response.json();
    handlePrediction(prediction, features);
  } catch (error) {
    // API unavailable — fall back to rule-based prediction
    const fallbackPrediction = ruleFallback(features);
    handlePrediction(fallbackPrediction, features);
  }
}

/**
 * Rule-based fallback when the Flask API is unavailable.
 */
function ruleFallback(features) {
  const score = features.fatigue_score_rule;
  let label = 'normal';
  let confidence = 0.6;

  if (score >= 50) {
    label = 'fatigue';
    confidence = Math.min(0.5 + (score / 200), 0.95);
  } else if (score >= 25) {
    label = 'mild_fatigue';
    confidence = Math.min(0.5 + (score / 200), 0.85);
  } else {
    confidence = Math.min(0.6 + ((50 - score) / 100), 0.95);
  }

  return {
    fatigue_label: label,
    confidence: parseFloat(confidence.toFixed(3)),
    source: 'rule_based'
  };
}

// ─── Prediction Handling ────────────────────────────────────────────

function handlePrediction(prediction, features) {
  currentSession.latestPrediction = {
    ...prediction,
    timestamp: Date.now()
  };

  // Add to prediction history (keep last 30)
  currentSession.predictionHistory.push(currentSession.latestPrediction);
  if (currentSession.predictionHistory.length > 30) {
    currentSession.predictionHistory.shift();
  }

  // Store for dashboard
  chrome.storage.local.set({
    latestPrediction: currentSession.latestPrediction,
    predictionHistory: currentSession.predictionHistory,
    latestFeatures: features
  });

  // Sync to Supabase if enabled
  syncToSupabase(features, prediction);

  // Update badge
  updateBadge(prediction.fatigue_label);

  // Trigger notification if fatigued
  if (prediction.fatigue_label === 'fatigue') {
    showFatigueNotification(prediction, features);
  } else if (prediction.fatigue_label === 'mild_fatigue') {
    showMildFatigueNotification(prediction, features);
  }
}

// ─── Badge ──────────────────────────────────────────────────────────

function updateBadge(label) {
  const badgeConfig = {
    normal: { text: '', color: '#4a7c59' },
    mild_fatigue: { text: '!', color: '#c4841d' },
    fatigue: { text: '!!', color: '#a63d40' }
  };

  const config = badgeConfig[label] || badgeConfig.normal;
  chrome.action.setBadgeText({ text: config.text });
  chrome.action.setBadgeBackgroundColor({ color: config.color });
}

// ─── Notifications ──────────────────────────────────────────────────

let lastNotificationTime = 0;
const NOTIFICATION_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between notifications

function showFatigueNotification(prediction, features) {
  const now = Date.now();
  if (now - lastNotificationTime < NOTIFICATION_COOLDOWN_MS) return;
  lastNotificationTime = now;

  chrome.notifications.create('fatigue-alert-' + now, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Get Focused — Fatigue Detected',
    message: `Productivity has decreased by ${features.productivity_loss_pct}%. Consider taking a short break to restore focus.`,
    priority: 2,
    requireInteraction: true
  });
}

function showMildFatigueNotification(prediction, features) {
  const now = Date.now();
  if (now - lastNotificationTime < NOTIFICATION_COOLDOWN_MS) return;
  lastNotificationTime = now;

  chrome.notifications.create('mild-fatigue-alert-' + now, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Get Focused — Early Fatigue Signs',
    message: `Typing patterns suggest early fatigue. Speed has dropped by ${features.speed_drop_pct}%.`,
    priority: 1
  });
}

// ─── Session Management ─────────────────────────────────────────────

function handleSessionStart(timestamp) {
  // Save previous session to history if it had data
  if (currentSession.latestFeatures) {
    saveSessionToHistory();
  }
}

function saveSessionToHistory() {
  chrome.storage.local.get(['sessionHistory'], (result) => {
    const history = result.sessionHistory || [];
    history.push({
      id: currentSession.id,
      startTime: currentSession.startTime,
      endTime: Date.now(),
      lastPrediction: currentSession.latestPrediction,
      lastFeatures: currentSession.latestFeatures
        ? {
            typing_speed_cps: currentSession.latestFeatures.typing_speed_cps,
            error_rate: currentSession.latestFeatures.error_rate,
            productivity_loss_pct: currentSession.latestFeatures.productivity_loss_pct,
            fatigue_score_rule: currentSession.latestFeatures.fatigue_score_rule
          }
        : null
    });

    // Keep last N sessions
    while (history.length > SESSION_HISTORY_MAX) {
      history.shift();
    }

    chrome.storage.local.set({ sessionHistory: history });
  });
}

// ─── Dashboard Data ─────────────────────────────────────────────────

function getDashboardData() {
  if (currentSession.demoMode && currentSession.demoData) {
    if (Date.now() > currentSession.demoExpiresAt) {
      currentSession.demoMode = false;
      currentSession.demoData = null;
    } else {
      return {
        sessionId: 'demo_session',
        sessionStart: currentSession.demoData.startTime,
        isMonitoring: true,
        baselineCalibrated: true,
        baseline: currentSession.demoData.baseline,
        latestFeatures: currentSession.demoData.latestFeatures,
        latestPrediction: currentSession.demoData.latestPrediction,
        predictionHistory: currentSession.demoData.predictionHistory
      };
    }
  }
  return {
    sessionId: currentSession.id,
    sessionStart: currentSession.startTime,
    isMonitoring: currentSession.isMonitoring,
    baselineCalibrated: currentSession.baselineCalibrated,
    baseline: currentSession.baseline,
    latestFeatures: currentSession.latestFeatures,
    latestPrediction: currentSession.latestPrediction,
    predictionHistory: currentSession.predictionHistory
  };
}

// ─── Utilities ──────────────────────────────────────────────────────

async function broadcastToTabs(message) {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    try {
      chrome.tabs.sendMessage(tab.id, message);
    } catch (e) {
      // Tab may not have content script
    }
  }
}

// ─── API Health Check ───────────────────────────────────────────────

async function checkApiHealth() {
  try {
    const response = await fetch(`${API_BASE}/health`, { method: 'GET' });
    const data = await response.json();
    chrome.storage.local.set({ apiStatus: data.status === 'ok' ? 'connected' : 'error' });
  } catch (e) {
    chrome.storage.local.set({ apiStatus: 'disconnected' });
  }
}

// ─── Alarms ─────────────────────────────────────────────────────────

chrome.alarms.create('health-check', { periodInMinutes: 2 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'health-check') {
    checkApiHealth();
  }
});

// ─── Extension Install/Update ───────────────────────────────────────

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install' || details.reason === 'update') {
    chrome.storage.local.set({
      monitoringEnabled: true,
      baselineCalibrated: true,
      user_baseline: currentSession.baseline,
      sessionHistory: [],
      predictionHistory: currentSession.predictionHistory,
      latestPrediction: currentSession.latestPrediction,
      latestFeatures: currentSession.latestFeatures,
      dataConsentGiven: false
    });
    checkApiHealth();
    if (details.reason === 'install') {
      // Open options page on first install so user can give consent
      chrome.tabs.create({ url: 'consent.html' });
    }
  }
});

// Initial health check
checkApiHealth();

// Initialize Supabase client (reads consent from storage)
SupabaseClient.init().then((hasConsent) => {
  if (hasConsent) {
    console.log('[Get Focused] Data sharing consent given. Sync active.');
  }
});

// Re-initialize Supabase when consent changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.dataConsentGiven) {
    SupabaseClient.setConsent(changes.dataConsentGiven.newValue === true);
  }
});

// ─── Supabase Sync ──────────────────────────────────────────────────

async function syncToSupabase(features, prediction) {
  try {
    // insertSessionFeature reads consent from storage internally
    const result = await SupabaseClient.insertSessionFeature(
      currentSession.id,
      features,
      prediction
    );

    if (result.success) {
      chrome.storage.local.set({ lastSupabaseSync: Date.now() });
    }
  } catch (e) {
    console.warn('[GetFocused] Data sync failed:', e.message);
  }
}
