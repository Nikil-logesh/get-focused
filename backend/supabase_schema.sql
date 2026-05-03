-- Get Focused — Supabase Table Schema
-- Contains ONLY the highly-predictive features requested for the ML dataset.

CREATE TABLE IF NOT EXISTS session_features (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Core Typing Features
  typing_speed_cps REAL,
  error_rate REAL,
  backspace_rate REAL,
  pause_avg_ms REAL,
  pause_std_ms REAL,
  hold_time_avg_ms REAL,
  burst_length_avg REAL,
  inter_key_interval_ms REAL,
  rhythm_consistency REAL,
  keystroke_variability REAL,

  -- Deviation Features
  speed_drop_pct REAL,
  error_increase_pct REAL,
  pause_increase_pct REAL,
  fatigue_score_rule INTEGER,
  productivity_loss_pct REAL,

  -- Context Features
  session_duration_min REAL,
  consecutive_hours_worked REAL,
  pause_to_type_ratio REAL,

  -- Target (Label)
  fatigue_label TEXT
);

-- Note: We removed user_id and session_id as requested (they hold no predictive value).
-- Therefore, this table is completely anonymous and perfect for direct export to RapidMiner.

ALTER TABLE session_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous inserts"
  ON session_features
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Indexes for fast querying when training
CREATE INDEX idx_session_features_time ON session_features (recorded_at);
CREATE INDEX idx_session_features_label ON session_features (fatigue_label);
