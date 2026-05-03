/**
 * Get Focused — Popup Controller
 */

(function () {
  'use strict';

  let el = {};
  let refreshTimer = null;
  let isMonitoring = true;

  // ── Init ──────────────────────────────────────────────────────────
  function init() {
    el = {
      toggleBtn:   document.getElementById('btn-toggle'),
      toggleKnob:  document.getElementById('toggle-knob'),
      statusDot:   document.getElementById('status-dot'),
      statusText:  document.getElementById('status-text'),
      confText:    document.getElementById('confidence-text'),
      sessionDur:  document.getElementById('session-duration'),
      donutCanvas: document.getElementById('donut-canvas'),
      donutScore:  document.getElementById('donut-score'),
      pctNormal:   document.getElementById('pct-normal'),
      pctMild:     document.getElementById('pct-mild'),
      pctFatigue:  document.getElementById('pct-fatigue'),
      statSpeed:   document.getElementById('stat-speed'),
      statError:   document.getElementById('stat-error'),
      statProd:    document.getElementById('stat-prod'),
      btnDashboard:document.getElementById('btn-dashboard'),
      btnReset:    document.getElementById('btn-reset'),
      apiStatus:   document.getElementById('api-status'),
      linkSettings:document.getElementById('link-settings')
    };

    el.btnDashboard.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
    });
    el.linkSettings.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });
    el.toggleBtn.addEventListener('click', toggleMonitoring);
    el.btnReset.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'RESET_BASELINE' });
    });

    loadData();
    refreshTimer = setInterval(loadData, 5000);
  }

  // ── Data ──────────────────────────────────────────────────────────
  function loadData() {
    chrome.runtime.sendMessage({ type: 'GET_DASHBOARD_DATA' }, (res) => {
      if (chrome.runtime.lastError || !res) return;
      render(res);
    });
    chrome.storage.local.get(['apiStatus'], (r) => {
      if (el.apiStatus) {
        if (r.apiStatus === 'connected') {
          el.apiStatus.className = 'api-indicator connected';
          el.apiStatus.innerHTML = '<span class="api-dot"></span>API Connected';
        } else {
          el.apiStatus.className = 'api-indicator disconnected';
          el.apiStatus.innerHTML = '<span class="api-dot"></span>API Disconnected';
        }
      }
    });
  }

  // ── Render ────────────────────────────────────────────────────────
  function render(data) {
    // Monitoring toggle
    isMonitoring = data.isMonitoring;
    if (el.toggleBtn) el.toggleBtn.className = 'toggle-switch' + (isMonitoring ? ' active' : '');

    // Session timer
    if (data.sessionStart) {
      const e = Date.now() - data.sessionStart;
      const m = Math.floor(e / 60000), s = Math.floor((e % 60000) / 1000);
      el.sessionDur.textContent = pad(m) + ':' + pad(s);
    }

    // Status
    const p = data.latestPrediction;
    if (p) {
      const lbl = p.fatigue_label || 'normal';
      el.statusDot.className  = 'sdot ' + lbl;
      el.statusText.textContent = formatLabel(lbl);
      el.confText.textContent = ((p.confidence || 0) * 100).toFixed(0) + '% conf.';
    }

    // Stats
    if (data.latestFeatures) {
      const f = data.latestFeatures;
      const wpm = f.typing_speed_wpm || Math.round((f.typing_speed_cps || 0) * 12);
      el.statSpeed.textContent = wpm;
      el.statError.textContent = ((f.error_rate || 0) * 100).toFixed(1) + '%';
      el.statProd.textContent  = (f.productivity_loss_pct || 0).toFixed(1) + '%';
    }

    // Donut chart
    const hist = data.predictionHistory || [];
    const score = data.latestFeatures ? (data.latestFeatures.fatigue_score_rule || 0) : 0;
    drawDonut(hist, score);
  }

  // ── Donut Chart ───────────────────────────────────────────────────
  function drawDonut(history, score) {
    const canvas = el.donutCanvas;
    const dpr    = window.devicePixelRatio || 1;
    const size   = 100;
    canvas.width  = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width  = size + 'px';
    canvas.style.height = size + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const cx = size / 2, cy = size / 2, r = 40, inner = 28;
    ctx.clearRect(0, 0, size, size);

    let counts = { normal: 0, mild_fatigue: 0, fatigue: 0 };
    history.forEach(p => {
      const l = p.fatigue_label || 'normal';
      counts[l] = (counts[l] || 0) + 1;
    });
    const total = history.length || 1;
    const segments = [
      { key: 'normal',       color: '#10b981', count: counts.normal },
      { key: 'mild_fatigue', color: '#f59e0b', count: counts.mild_fatigue },
      { key: 'fatigue',      color: '#ef4444', count: counts.fatigue }
    ];

    el.pctNormal.textContent  = history.length ? Math.round(counts.normal / total * 100) + '%' : '—';
    el.pctMild.textContent    = history.length ? Math.round(counts.mild_fatigue / total * 100) + '%' : '—';
    el.pctFatigue.textContent = history.length ? Math.round(counts.fatigue / total * 100) + '%' : '—';

    if (history.length === 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.arc(cx, cy, inner, 0, Math.PI * 2, true);
      ctx.fillStyle = '#f3f4f6';
      ctx.fill();
    } else {
      let startAngle = -Math.PI / 2;
      segments.forEach(seg => {
        if (seg.count === 0) return;
        const slice = (seg.count / total) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, startAngle, startAngle + slice);
        ctx.arc(cx, cy, inner, startAngle + slice, startAngle, true);
        ctx.closePath();
        ctx.fillStyle = seg.color;
        ctx.fill();
        startAngle += slice;
      });
      ctx.beginPath();
      ctx.arc(cx, cy, inner - 2, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }

    const clamp = Math.max(0, Math.min(100, score));
    el.donutScore.textContent = clamp;
    el.donutScore.style.color = clamp >= 50 ? '#ef4444' : clamp >= 25 ? '#f59e0b' : '#10b981';
  }

  // ── Controls ──────────────────────────────────────────────────────
  function toggleMonitoring() {
    const next = !isMonitoring;
    chrome.runtime.sendMessage({ type: 'TOGGLE_MONITORING', enabled: next }, () => {
      isMonitoring = next;
      if (el.toggleBtn) el.toggleBtn.className = 'toggle-switch' + (next ? ' active' : '');
    });
  }

  // ── Utils ─────────────────────────────────────────────────────────
  function pad(n) { return String(n).padStart(2, '0'); }
  function formatLabel(l) {
    return { normal: 'Normal', mild_fatigue: 'Mild Fatigue', fatigue: 'Fatigue' }[l] || 'Unknown';
  }

  window.addEventListener('unload', () => { if (refreshTimer) clearInterval(refreshTimer); });
  document.addEventListener('DOMContentLoaded', init);
})();
