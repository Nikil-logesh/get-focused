/**
 * Feature Engineering Library for Get Focused
 * Converts raw keyboard and optimally throttled mouse data into accurate features.
 */

const FeatureEngine = (() => {

  function mean(arr) {
    if (!arr || arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  function stdDev(arr) {
    if (!arr || arr.length < 2) return 0;
    const m = mean(arr);
    const variance = arr.reduce((sum, v) => sum + Math.pow(v - m, 2), 0) / (arr.length - 1);
    return Math.sqrt(variance);
  }

  function interKeyIntervals(timestamps) {
    if (!timestamps || timestamps.length < 2) return [];
    const intervals = [];
    for (let i = 1; i < timestamps.length; i++) {
      intervals.push(timestamps[i] - timestamps[i - 1]);
    }
    return intervals;
  }

  function detectPauses(intervals, threshold = 2000) {
    return intervals.filter(iv => iv >= threshold);
  }

  function computeBursts(intervals, threshold = 500) {
    const bursts = [];
    let currentBurstLength = 1;
    for (let i = 0; i < intervals.length; i++) {
      if (intervals[i] < threshold) {
        currentBurstLength++;
      } else {
        if (currentBurstLength > 1) {
          bursts.push(currentBurstLength);
        }
        currentBurstLength = 1;
      }
    }
    if (currentBurstLength > 1) {
      bursts.push(currentBurstLength);
    }
    return bursts;
  }

  // --- MOUSE TRACKING ---
  function mouseSpeed(positions) {
    if (!positions || positions.length < 2) return 0;
    let totalDistance = 0;
    let totalTime = 0;
    for (let i = 1; i < positions.length; i++) {
      const dx = positions[i].x - positions[i - 1].x;
      const dy = positions[i].y - positions[i - 1].y;
      totalDistance += Math.sqrt(dx * dx + dy * dy);
      totalTime += (positions[i].timestamp - positions[i - 1].timestamp);
    }
    if (totalTime <= 0) return 0;
    return (totalDistance / totalTime) * 1000; // px/s
  }

  function mousePathEfficiency(positions) {
    if (!positions || positions.length < 2) return 1;
    const first = positions[0];
    const last = positions[positions.length - 1];
    const straightLine = Math.sqrt(
      Math.pow(last.x - first.x, 2) + Math.pow(last.y - first.y, 2)
    );
    let totalPath = 0;
    for (let i = 1; i < positions.length; i++) {
      const dx = positions[i].x - positions[i - 1].x;
      const dy = positions[i].y - positions[i - 1].y;
      totalPath += Math.sqrt(dx * dx + dy * dy);
    }
    if (totalPath <= 0) return 1;
    return Math.min(straightLine / totalPath, 1);
  }

  function mouseIdleRatio(positions, totalDurationMs) {
    if (!positions || positions.length < 2 || totalDurationMs <= 0) return 1;
    let idleTime = 0;
    const idleThreshold = 3000;
    for (let i = 1; i < positions.length; i++) {
      const dt = positions[i].timestamp - positions[i - 1].timestamp;
      if (dt > idleThreshold) {
        idleTime += dt;
      }
    }
    return Math.min(idleTime / totalDurationMs, 1);
  }

  function computeFeatures(rawData, baseline) {
    const {
      keystrokeTimestamps = [],
      holdTimes = [],
      backspaceCount = 0,
      totalKeystrokes = 0,
      mousePositions = [],
      clickCount = 0,
      focusSwitchCount = 0,
      sessionStartTime = Date.now(),
      currentTime = Date.now(),
      intervalDurationMs = null,
      consecutiveHoursWorked = 0
    } = rawData;

    const sessionDurationMs = currentTime - sessionStartTime;
    const durationMs = intervalDurationMs || sessionDurationMs;
    const durationSec = durationMs / 1000;
    const durationMin = sessionDurationMs / 60000;

    // ── Core Typing Features ──
    const cps = durationSec > 0 ? totalKeystrokes / durationSec : 0;
    const errorRate = totalKeystrokes > 0 ? backspaceCount / totalKeystrokes : 0;
    
    const intervals = interKeyIntervals(keystrokeTimestamps);
    const ikiMs = mean(intervals);
    const variability = stdDev(intervals);
    const rhythm = ikiMs > 0 ? Math.max(0, 1 - (variability / ikiMs)) : 1;

    const pauses = detectPauses(intervals);
    const pauseAvgMs = mean(pauses);
    const pauseStdMs = stdDev(pauses);

    const holdTimeAvgMs = mean(holdTimes);

    const bursts = computeBursts(intervals);
    const burstLengthAvg = mean(bursts);

    // ── Context Features ──
    const typingTime = intervals.filter(iv => iv < 2000).reduce((a, b) => a + b, 0);
    const pauseTime = pauses.reduce((a, b) => a + b, 0);
    const pauseToTypeRatio = typingTime > 0 ? pauseTime / typingTime : 0;

    // ── Optimized Mouse Features ──
    const mouseSpeedAvg = mouseSpeed(mousePositions);
    const mouseIdle = mouseIdleRatio(mousePositions, durationMs);
    const mousePathEff = mousePathEfficiency(mousePositions);

    // ── Deviation Features ──
    const baselineSpeed = baseline ? baseline.speed : cps;
    const baselineError = baseline ? baseline.error : errorRate;
    const baselinePause = baseline ? baseline.pause : pauseAvgMs;

    const speedDropPct = baselineSpeed > 0 ? ((baselineSpeed - cps) / baselineSpeed) * 100 : 0;
    const errorIncreasePct = baselineError > 0 ? ((errorRate - baselineError) / baselineError) * 100 : 0;
    const pauseIncreasePct = baselinePause > 0 ? ((pauseAvgMs - baselinePause) / baselinePause) * 100 : 0;

    const fatigueScoreRule = Math.min(100, Math.round(
      (Math.max(0, speedDropPct) * 0.4) +
      (Math.max(0, errorIncreasePct) * 0.35) +
      (Math.max(0, pauseIncreasePct) * 0.25)
    ));

    const prodLoss = Math.min(100, Math.max(0, (speedDropPct * 0.6) + (errorIncreasePct * 0.4)));

    return {
      typing_speed_cps: parseFloat(cps.toFixed(3)),
      error_rate: parseFloat(errorRate.toFixed(4)),
      backspace_rate: parseFloat(errorRate.toFixed(4)), 
      pause_avg_ms: parseFloat(pauseAvgMs.toFixed(2)),
      pause_std_ms: parseFloat(pauseStdMs.toFixed(2)),
      hold_time_avg_ms: parseFloat(holdTimeAvgMs.toFixed(2)),
      burst_length_avg: parseFloat(burstLengthAvg.toFixed(2)),
      inter_key_interval_ms: parseFloat(ikiMs.toFixed(2)),
      rhythm_consistency: parseFloat(rhythm.toFixed(4)),
      keystroke_variability: parseFloat(variability.toFixed(2)),
      
      mouse_speed_avg_px_s: parseFloat(mouseSpeedAvg.toFixed(2)),
      mouse_click_count: clickCount,
      mouse_idle_ratio: parseFloat(mouseIdle.toFixed(4)),
      mouse_path_efficiency: parseFloat(mousePathEff.toFixed(4)),
      focus_switch_count: focusSwitchCount,

      speed_drop_pct: parseFloat(speedDropPct.toFixed(2)),
      error_increase_pct: parseFloat(errorIncreasePct.toFixed(2)),
      pause_increase_pct: parseFloat(pauseIncreasePct.toFixed(2)),
      fatigue_score_rule: fatigueScoreRule,
      productivity_loss_pct: parseFloat(prodLoss.toFixed(2)),
      
      session_duration_min: parseFloat(durationMin.toFixed(2)),
      consecutive_hours_worked: parseFloat(consecutiveHoursWorked.toFixed(2)),
      pause_to_type_ratio: parseFloat(pauseToTypeRatio.toFixed(4))
    };
  }

  function extractModelFeatures(features) {
    return {
      typing_speed_cps: features.typing_speed_cps,
      error_rate: features.error_rate,
      backspace_rate: features.backspace_rate,
      pause_avg_ms: features.pause_avg_ms,
      pause_std_ms: features.pause_std_ms,
      hold_time_avg_ms: features.hold_time_avg_ms,
      burst_length_avg: features.burst_length_avg,
      inter_key_interval_ms: features.inter_key_interval_ms,
      rhythm_consistency: features.rhythm_consistency,
      keystroke_variability: features.keystroke_variability,

      speed_drop_pct: features.speed_drop_pct,
      error_increase_pct: features.error_increase_pct,
      pause_increase_pct: features.pause_increase_pct,
      fatigue_score_rule: features.fatigue_score_rule,
      productivity_loss_pct: features.productivity_loss_pct,
      
      session_duration_min: features.session_duration_min,
      consecutive_hours_worked: features.consecutive_hours_worked,
      pause_to_type_ratio: features.pause_to_type_ratio
    };
  }

  return {
    mean,
    computeFeatures,
    extractModelFeatures
  };

})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FeatureEngine;
}
