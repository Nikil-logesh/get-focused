"""
Quick script to force-set consent in chrome storage via the Flask API
and push a real test row to Supabase from the backend side.
"""

import requests
import json
from datetime import datetime, timezone
SUPABASE_URL = 'YOUR_SUPABASE_URL'
SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY'

headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal'
}

# Simulate what the extension sends after a real session
real_session_record = {
    'session_id': 'real_session_' + str(int(datetime.now(tz=timezone.utc).timestamp())),
    'user_uuid': 'dev-user-nikil-00000000000',
    'recorded_at': datetime.now(tz=timezone.utc).isoformat(),
    'typing_speed_cps': 3.8,
    'error_rate': 0.09,
    'backspace_rate': 0.07,
    'inter_key_interval_ms': 215.0,
    'pause_avg_ms': 2200.0,
    'pause_std_ms': 750.0,
    'pause_to_type_ratio': 0.28,
    'pause_increase_pct': 18.0,
    'hold_time_avg_ms': 108.0,
    'burst_length_avg': 5.8,
    'session_duration_min': 35.0,
    'consecutive_hours_worked': 2.0,
    'rhythm_consistency': 0.66,
    'keystroke_variability': 70.0,
    'mouse_speed_avg_px_s': 310.0,
    'mouse_click_count': 18,
    'mouse_idle_ratio': 0.32,
    'mouse_path_efficiency': 0.58,
    'focus_switch_count': 7,
    'speed_drop_pct': 22.0,
    'fatigue_score_rule': 35,
    'productivity_loss_pct': 21.0,
    'fatigue_label': 'mild_fatigue',
    'confidence': 0.78,
    'prediction_source': 'ml_model'
}

print("Inserting real session record to Supabase...")
r = requests.post(
    f'{SUPABASE_URL}/rest/v1/session_features',
    headers=headers,
    json=real_session_record
)
print(f'Status: {r.status_code}')
if r.status_code in (200, 201):
    print('Insert successful.')
else:
    print(f'Error: {r.text}')

print()
print("Fetching all rows now...")
r2 = requests.get(
    f'{SUPABASE_URL}/rest/v1/session_features?order=recorded_at.desc&limit=10',
    headers=headers
)
rows = r2.json()
print(f'Total rows: {len(rows)}')
print()
for i, row in enumerate(rows, 1):
    print(f'  [{i}] {row.get("recorded_at")} | {row.get("user_uuid")} | speed={row.get("typing_speed_cps")} cps | label={row.get("fatigue_label")} | conf={row.get("confidence")}')
