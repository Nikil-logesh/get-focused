/**
 * Get Focused — Options Page Controller
 *
 * Loads/saves settings from chrome.storage.local.
 * Handles data consent toggle, export, and clear functionality.
 * Supabase is managed internally — no user-facing config.
 */

(function () {
  'use strict';

  const DEFAULT_SETTINGS = {
    collectionIntervalSec: 60,
    baselineCalibrationMin: 5,
    notifyFatigue: true,
    notifyMild: true,
    notificationCooldownMin: 5
  };

  const el = {
    interval: document.getElementById('input-interval'),
    baselinePeriod: document.getElementById('input-baseline-period'),
    notifFatigue: document.getElementById('chk-notif-fatigue'),
    notifMild: document.getElementById('chk-notif-mild'),
    notifCooldown: document.getElementById('input-notif-cooldown'),
    consent: document.getElementById('chk-consent'),
    btnExport: document.getElementById('btn-export'),
    btnClear: document.getElementById('btn-clear'),
    btnDemoData: document.getElementById('btn-demo-data'),
    btnSave: document.getElementById('btn-save'),
    saveStatus: document.getElementById('save-status')
  };

  // ─── Load Settings ──────────────────────────────────────────────

  function loadSettings() {
    chrome.storage.local.get(['settings', 'dataConsentGiven'], (result) => {
      const settings = { ...DEFAULT_SETTINGS, ...(result.settings || {}) };

      el.interval.value = settings.collectionIntervalSec;
      el.baselinePeriod.value = settings.baselineCalibrationMin;
      el.notifFatigue.checked = settings.notifyFatigue;
      el.notifMild.checked = settings.notifyMild;
      el.notifCooldown.value = settings.notificationCooldownMin;
      el.consent.checked = result.dataConsentGiven === true;
    });
  }

  // ─── Save Settings ─────────────────────────────────────────────

  function saveSettings() {
    const settings = {
      collectionIntervalSec: parseInt(el.interval.value) || 60,
      baselineCalibrationMin: parseInt(el.baselinePeriod.value) || 5,
      notifyFatigue: el.notifFatigue.checked,
      notifyMild: el.notifMild.checked,
      notificationCooldownMin: parseInt(el.notifCooldown.value) || 5
    };

    const consentGiven = el.consent.checked;

    chrome.storage.local.set({
      settings: settings,
      dataConsentGiven: consentGiven
    }, () => {
      el.saveStatus.textContent = 'Settings saved.';
      setTimeout(() => { el.saveStatus.textContent = ''; }, 3000);
    });
  }

  // ─── Export Data ────────────────────────────────────────────────

  function exportData() {
    chrome.storage.local.get(null, (data) => {
      const exportPayload = {
        exportDate: new Date().toISOString(),
        sessionHistory: data.sessionHistory || [],
        predictionHistory: data.predictionHistory || [],
        baseline: data.baseline || null,
        settings: data.settings || DEFAULT_SETTINGS
      };

      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
        type: 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'get-focused-export-' + Date.now() + '.json';
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  // ─── Clear Data ─────────────────────────────────────────────────

  function clearData() {
    if (!confirm('This will delete all stored sessions, baselines, and prediction history. This action cannot be undone. Continue?')) {
      return;
    }

    chrome.storage.local.remove([
      'sessionHistory', 'predictionHistory', 'baseline',
      'baselineCalibrated', 'latestFeatures', 'latestPrediction',
      'lastUpdateTime'
    ], () => {
      el.saveStatus.textContent = 'All data cleared.';
      setTimeout(() => { el.saveStatus.textContent = ''; }, 3000);
    });
  }

  // ─── Event Binding ──────────────────────────────────────────────

  el.btnSave.addEventListener('click', saveSettings);
  el.btnExport.addEventListener('click', exportData);
  el.btnClear.addEventListener('click', clearData);
  if (el.btnDemoData) {
    el.btnDemoData.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'LOAD_DEMO_DATA' }, () => {
        el.saveStatus.textContent = 'Demo data loaded.';
        setTimeout(() => { el.saveStatus.textContent = ''; }, 3000);
      });
    });
  }

  // ─── Init ───────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', loadSettings);

})();
