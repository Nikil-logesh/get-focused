/**
 * Get Focused — Full Dashboard Controller
 */

(function () {
  'use strict';

  const GAUGE_ARC = 251;
  let el = {};
  let isMonitoring = true;
  let refreshTimer = null;

  // ── Init ──────────────────────────────────────────────────────────
  function init() {
    el = {
      toggleBtn:      document.getElementById('btn-toggle'),
      toggleDot:      document.getElementById('toggle-dot'),
      toggleLabel:    document.getElementById('toggle-label'),
      sessionDur:     document.getElementById('session-duration'),
      apiStatus:      document.getElementById('api-status'),
      syncStatus:     document.getElementById('sync-status'),
      statusCard:     document.getElementById('status-card'),
      statusDot:      document.getElementById('status-dot'),
      statusText:     document.getElementById('status-text'),
      confBadge:      document.getElementById('confidence-badge'),
      sourceBadge:    document.getElementById('prediction-source'),
      gaugeFill:      document.getElementById('gauge-fill'),
      gaugeScore:     document.getElementById('gauge-score'),
      segNormal:      document.getElementById('seg-normal'),
      segMild:        document.getElementById('seg-mild'),
      segHigh:        document.getElementById('seg-high'),
      donutCanvas:    document.getElementById('donut-canvas'),
      distNormal:     document.getElementById('dist-normal'),
      distMild:       document.getElementById('dist-mild'),
      distFatigue:    document.getElementById('dist-fatigue'),
      prodVal:        document.getElementById('prod-val'),
      prodBar:        document.getElementById('prod-bar'),
      valSpeed:       document.getElementById('val-speed'),
      valWpm:         document.getElementById('val-wpm'),
      valErrors:      document.getElementById('val-errors'),
      valPauses:      document.getElementById('val-pauses'),
      valRhythm:      document.getElementById('val-rhythm'),
      valHold:        document.getElementById('val-hold'),
      valBurst:       document.getElementById('val-burst'),
      valMouseSpeed:  document.getElementById('val-mouse-speed'),
      valIdle:        document.getElementById('val-idle'),
      valFocus:       document.getElementById('val-focus'),
      valClicks:      document.getElementById('val-clicks'),
      valPath:        document.getElementById('val-path'),
      valSessionMin:  document.getElementById('val-session-min'),
      valHours:       document.getElementById('val-hours'),
      valIki:         document.getElementById('val-iki'),
      deltaSpeed:     document.getElementById('delta-speed'),
      deltaErrors:    document.getElementById('delta-errors'),
      deltaPauses:    document.getElementById('delta-pauses'),
      trendCanvas:    document.getElementById('trend-canvas'),
      trendEmpty:     document.getElementById('trend-empty'),
      baselineMsg:    document.getElementById('baseline-status-msg'),
      blSpeed:        document.getElementById('bl-speed'),
      blError:        document.getElementById('bl-error'),
      blPause:        document.getElementById('bl-pause'),
      btnResetBl:     document.getElementById('btn-reset-baseline'),
      linkSettings:   document.getElementById('link-settings')
    };

    // Nav
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        const sec = link.dataset.section;
        document.getElementById('section-' + sec).scrollIntoView({ behavior: 'smooth' });
      });
    });

    el.toggleBtn.addEventListener('click', toggleMonitoring);
    el.btnResetBl.addEventListener('click', resetBaseline);
    el.linkSettings.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
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

    chrome.storage.local.get(['apiStatus', 'lastSupabaseSync'], (r) => {
      // API pill
      if (el.apiStatus) {
        if (r.apiStatus === 'connected') {
          el.apiStatus.textContent = 'API: Connected';
          el.apiStatus.className = 'api-pill connected';
        } else {
          el.apiStatus.textContent = 'API: Disconnected';
          el.apiStatus.className = 'api-pill disconnected';
        }
      }
      // Sync pill
      if (el.syncStatus) {
        if (r.lastSupabaseSync) {
          const ago = Math.round((Date.now() - r.lastSupabaseSync) / 1000);
          el.syncStatus.textContent = `Sync: ${ago}s ago`;
          el.syncStatus.className = 'sync-pill synced';
        } else {
          el.syncStatus.textContent = 'Sync: —';
          el.syncStatus.className = 'sync-pill';
        }
      }
    });
  }

  // ── Render ────────────────────────────────────────────────────────
  function render(data) {
    isMonitoring = data.isMonitoring;
    el.toggleDot.className    = 'tdot' + (isMonitoring ? ' active' : '');
    el.toggleLabel.textContent = isMonitoring ? 'Monitoring ON' : 'Monitoring OFF';

    // Session timer
    if (data.sessionStart) {
      const e = Date.now() - data.sessionStart;
      const h = Math.floor(e / 3600000), m = Math.floor((e % 3600000) / 60000), s = Math.floor((e % 60000) / 1000);
      el.sessionDur.textContent = h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
    }

    renderStatus(data.latestPrediction);
    renderFeatures(data.latestFeatures);
    renderDonut(data.predictionHistory || []);
    renderTrend(data.predictionHistory || []);
    renderBaseline(data.baseline, data.baselineCalibrated);
  }

  function renderStatus(p) {
    if (!p) return;
    const lbl = p.fatigue_label || 'normal';
    el.statusDot.className    = 'sdot ' + lbl;
    el.statusText.textContent = formatLabel(lbl);
    el.statusCard.className   = 'ov-card status-card ' + lbl;
    el.confBadge.textContent  = ((p.confidence || 0) * 100).toFixed(0) + '% confidence';
    el.sourcebadge = p.source || 'unknown';
    el.sourceBadge.textContent = p.source === 'ml_model' ? 'ML Model' : 'Rule-based';
    el.segNormal.classList.toggle('active', lbl === 'normal');
    el.segMild.classList.toggle('active',   lbl === 'mild_fatigue');
    el.segHigh.classList.toggle('active',   lbl === 'fatigue');
  }

  function renderFeatures(f) {
    if (!f) return;

    // Gauge
    const score = Math.max(0, Math.min(100, f.fatigue_score_rule || 0));
    const filled = (score / 100) * GAUGE_ARC;
    el.gaugeFill.setAttribute('stroke-dasharray', `${filled} ${GAUGE_ARC}`);
    const col = score >= 50 ? '#ff4d4f' : score >= 25 ? '#ffb020' : '#7000FF';
    el.gaugeFill.setAttribute('stroke', col);
    el.gaugeScore.textContent = score;
    el.gaugeScore.style.color = col;

    // Productivity
    const loss = Math.max(0, Math.min(100, f.productivity_loss_pct || 0));
    el.prodVal.textContent = loss.toFixed(1);
    el.prodBar.style.width = loss + '%';
    el.prodBar.style.background = loss >= 40 ? '#ff4d4f' : loss >= 20 ? '#ffb020' : '#7000FF';

    // Metrics
    el.valSpeed.textContent = sf(f.typing_speed_cps, 2);
    el.valWpm.textContent   = f.typing_speed_wpm ? Math.round(f.typing_speed_wpm) : Math.round((f.typing_speed_cps || 0) * 12);
    el.valErrors.textContent = sf(f.error_rate * 100, 1);
    el.valPauses.textContent = sf(f.pause_avg_ms, 0);
    el.valRhythm.textContent = sf(f.rhythm_consistency, 2);
    el.valHold.textContent   = sf(f.hold_time_avg_ms, 0);
    el.valBurst.textContent  = sf(f.burst_length_avg, 1);
    el.valMouseSpeed.textContent = '—';
    el.valIdle.textContent   = '—';
    el.valFocus.textContent  = '—';
    el.valClicks.textContent = '—';
    el.valPath.textContent   = '—';
    el.valSessionMin.textContent = sf(f.session_duration_min, 0);
    el.valHours.textContent  = sf(f.consecutive_hours_worked, 1);
    el.valIki.textContent    = sf(f.inter_key_interval_ms, 0);

    // Deltas
    setDelta(el.deltaSpeed,  f.speed_drop_pct);
    setDelta(el.deltaErrors, f.error_increase_pct);
    setDelta(el.deltaPauses, f.pause_increase_pct);
  }

  function setDelta(el, pct) {
    if (typeof pct !== 'number' || isNaN(pct)) { el.textContent = ''; el.className = 'm-delta'; return; }
    el.textContent = (pct > 0 ? '+' : '') + pct.toFixed(1) + '% vs baseline';
    el.className   = 'm-delta ' + (pct > 0 ? 'up' : 'down');
  }

  // ── Donut ─────────────────────────────────────────────────────────
  function renderDonut(history) {
    const canvas = el.donutCanvas;
    const dpr = window.devicePixelRatio || 1;
    const size = 120;
    canvas.width  = size * dpr; canvas.height = size * dpr;
    canvas.style.width = size + 'px'; canvas.style.height = size + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const cx = size / 2, cy = size / 2, R = 48, inner = 30;
    ctx.clearRect(0, 0, size, size);

    const counts = { normal: 0, mild_fatigue: 0, fatigue: 0 };
    history.forEach(p => { const l = p.fatigue_label || 'normal'; counts[l]++; });
    const total = history.length || 1;

    el.distNormal.textContent  = history.length ? Math.round(counts.normal / total * 100) + '%' : '—';
    el.distMild.textContent    = history.length ? Math.round(counts.mild_fatigue / total * 100) + '%' : '—';
    el.distFatigue.textContent = history.length ? Math.round(counts.fatigue / total * 100) + '%' : '—';

    const segs = [
      { key: 'normal',       color: '#7000FF', count: counts.normal },
      { key: 'mild_fatigue', color: '#ffb020', count: counts.mild_fatigue },
      { key: 'fatigue',      color: '#ff4d4f', count: counts.fatigue }
    ];

    if (history.length === 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.arc(cx, cy, inner, 0, Math.PI * 2, true);
      ctx.fillStyle = '#e4e7ec'; ctx.fill();
    } else {
      let angle = -Math.PI / 2;
      segs.forEach(seg => {
        if (!seg.count) return;
        const slice = (seg.count / total) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx, cy, R, angle, angle + slice);
        ctx.arc(cx, cy, inner, angle + slice, angle, true);
        ctx.closePath();
        ctx.fillStyle = seg.color; ctx.fill();
        angle += slice;
      });
    }
    ctx.beginPath();
    ctx.arc(cx, cy, inner - 2, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill();
  }

  // ── Trend ─────────────────────────────────────────────────────────
  function renderTrend(history) {
    const canvas = el.trendCanvas;
    if (!history || history.length < 2) {
      el.trendEmpty.style.display = 'flex';
      return;
    }
    el.trendEmpty.style.display = 'none';

    const dpr = window.devicePixelRatio || 1;
    canvas.width  = canvas.clientWidth  * dpr;
    canvas.height = canvas.clientHeight * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const W = canvas.clientWidth, H = canvas.clientHeight;
    const pad = { top: 12, right: 12, bottom: 24, left: 44 };
    const pW = W - pad.left - pad.right, pH = H - pad.top - pad.bottom;

    ctx.clearRect(0, 0, W, H);

    const data = history.map(p => {
      const l = p.fatigue_label || 'normal';
      return l === 'fatigue' ? 2 : l === 'mild_fatigue' ? 1 : 0;
    });
    const stepX = pW / (data.length - 1);
    const colors = ['#7000FF', '#ffb020', '#ff4d4f'];

    // Grid
    ['Normal', 'Mild', 'High'].forEach((lbl, i) => {
      const y = pad.top + pH - (i / 2) * pH;
      ctx.strokeStyle = '#e4e7ec'; ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + pW, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#9497a1'; ctx.font = '10px Inter, sans-serif'; ctx.textAlign = 'right';
      ctx.fillText(lbl, pad.left - 6, y + 4);
    });

    // Fill
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + pH);
    grad.addColorStop(0, 'rgba(112,0,255,0.15)');
    grad.addColorStop(1, 'rgba(112,0,255,0)');
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = pad.left + i * stepX, y = pad.top + pH - (v / 2) * pH;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.lineTo(pad.left + (data.length - 1) * stepX, pad.top + pH);
    ctx.lineTo(pad.left, pad.top + pH);
    ctx.closePath(); ctx.fillStyle = grad; ctx.fill();

    // Line
    ctx.beginPath();
    ctx.strokeStyle = '#7000FF'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
    data.forEach((v, i) => {
      const x = pad.left + i * stepX, y = pad.top + pH - (v / 2) * pH;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }); ctx.stroke();

    // Dots
    data.forEach((v, i) => {
      const x = pad.left + i * stepX, y = pad.top + pH - (v / 2) * pH;
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = colors[v]; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    });
  }

  // ── Baseline ──────────────────────────────────────────────────────
  function renderBaseline(baseline, calibrated) {
    if (!calibrated || !baseline) {
      el.baselineMsg.textContent = 'Calibrating — work normally for 5 minutes.';
      el.blSpeed.textContent = '—'; el.blError.textContent = '—'; el.blPause.textContent = '—';
    } else {
      el.baselineMsg.textContent = 'Baseline established.';
      el.blSpeed.textContent = sf(baseline.typing_speed_cps, 2);
      el.blError.textContent = sf(baseline.error_rate * 100, 1);
      el.blPause.textContent = sf(baseline.pause_avg_ms, 0);
    }
  }

  // ── Controls ──────────────────────────────────────────────────────
  function toggleMonitoring() {
    const next = !isMonitoring;
    chrome.runtime.sendMessage({ type: 'TOGGLE_MONITORING', enabled: next }, () => {
      isMonitoring = next;
      if (el.toggleDot) el.toggleDot.className = 'tdot' + (next ? ' active' : '');
      if (el.toggleLabel) el.toggleLabel.textContent = next ? 'Monitoring ON' : 'Monitoring OFF';
    });
  }
  function resetBaseline() {
    chrome.runtime.sendMessage({ type: 'RESET_BASELINE' }, () => {
      el.baselineMsg.textContent = 'Baseline reset. Recalibrating...';
      el.blSpeed.textContent = '—'; el.blError.textContent = '—'; el.blPause.textContent = '—';
    });
  }

  // ── Utils ─────────────────────────────────────────────────────────
  function pad(n) { return String(n).padStart(2, '0'); }
  function sf(v, d) { const n = parseFloat(v); return isFinite(n) ? n.toFixed(d) : '—'; }
  function formatLabel(l) {
    return { normal: 'Normal', mild_fatigue: 'Mild Fatigue', fatigue: 'Fatigue Detected' }[l] || 'Unknown';
  }

  window.addEventListener('unload', () => { if (refreshTimer) clearInterval(refreshTimer); });
  document.addEventListener('DOMContentLoaded', init);
})();
