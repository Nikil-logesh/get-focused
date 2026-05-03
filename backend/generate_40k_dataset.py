import requests
import json
import numpy as np
import time

SUPABASE_URL = 'YOUR_SUPABASE_URL'
SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY'

headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal'
}

def generate_batch(batch_size, class_name):
    data = []
    for _ in range(batch_size):
        if class_name == 'normal':
            row = {
                'typing_speed_cps': np.random.normal(6.5, 0.8),
                'error_rate': max(0, np.random.normal(0.02, 0.01)),
                'backspace_rate': max(0, np.random.normal(0.03, 0.01)),
                'pause_avg_ms': max(50, np.random.normal(150, 30)),
                'pause_std_ms': max(10, np.random.normal(50, 15)),
                'hold_time_avg_ms': max(30, np.random.normal(80, 10)),
                'burst_length_avg': max(5, np.random.normal(12, 3)),
                'inter_key_interval_ms': max(50, np.random.normal(120, 20)),
                'rhythm_consistency': min(1.0, max(0, np.random.normal(0.9, 0.05))),
                'keystroke_variability': max(0, np.random.normal(0.1, 0.05)),
                'speed_drop_pct': max(0, np.random.normal(0.02, 0.02)),
                'error_increase_pct': max(0, np.random.normal(0.01, 0.01)),
                'pause_increase_pct': max(0, np.random.normal(0.05, 0.02)),
                'fatigue_score_rule': max(0, int(np.random.normal(10, 5))),
                'productivity_loss_pct': max(0, np.random.normal(0.0, 0.02)),
                'session_duration_min': max(1, np.random.normal(20, 10)),
                'consecutive_hours_worked': max(0, np.random.normal(0.5, 0.3)),
                'pause_to_type_ratio': max(0, np.random.normal(0.2, 0.05)),
                'fatigue_label': 'normal'
            }
        elif class_name == 'mild_fatigue':
            row = {
                'typing_speed_cps': np.random.normal(4.5, 0.8),
                'error_rate': max(0, np.random.normal(0.06, 0.02)),
                'backspace_rate': max(0, np.random.normal(0.07, 0.02)),
                'pause_avg_ms': max(50, np.random.normal(300, 50)),
                'pause_std_ms': max(10, np.random.normal(120, 30)),
                'hold_time_avg_ms': max(30, np.random.normal(100, 15)),
                'burst_length_avg': max(2, np.random.normal(8, 2)),
                'inter_key_interval_ms': max(50, np.random.normal(180, 30)),
                'rhythm_consistency': min(1.0, max(0, np.random.normal(0.7, 0.1))),
                'keystroke_variability': max(0, np.random.normal(0.3, 0.1)),
                'speed_drop_pct': max(0, np.random.normal(0.15, 0.05)),
                'error_increase_pct': max(0, np.random.normal(0.20, 0.08)),
                'pause_increase_pct': max(0, np.random.normal(0.25, 0.1)),
                'fatigue_score_rule': max(0, int(np.random.normal(40, 10))),
                'productivity_loss_pct': max(0, np.random.normal(0.20, 0.1)),
                'session_duration_min': max(1, np.random.normal(60, 20)),
                'consecutive_hours_worked': max(0, np.random.normal(2.5, 1.0)),
                'pause_to_type_ratio': max(0, np.random.normal(0.5, 0.15)),
                'fatigue_label': 'mild_fatigue'
            }
        else: # fatigue
            row = {
                'typing_speed_cps': np.random.normal(3.0, 0.7),
                'error_rate': max(0, np.random.normal(0.12, 0.04)),
                'backspace_rate': max(0, np.random.normal(0.15, 0.04)),
                'pause_avg_ms': max(50, np.random.normal(550, 100)),
                'pause_std_ms': max(10, np.random.normal(250, 50)),
                'hold_time_avg_ms': max(30, np.random.normal(130, 20)),
                'burst_length_avg': max(1, np.random.normal(4, 1.5)),
                'inter_key_interval_ms': max(50, np.random.normal(250, 40)),
                'rhythm_consistency': min(1.0, max(0, np.random.normal(0.4, 0.15))),
                'keystroke_variability': max(0, np.random.normal(0.6, 0.15)),
                'speed_drop_pct': max(0, np.random.normal(0.35, 0.1)),
                'error_increase_pct': max(0, np.random.normal(0.50, 0.15)),
                'pause_increase_pct': max(0, np.random.normal(0.60, 0.2)),
                'fatigue_score_rule': max(0, int(np.random.normal(80, 15))),
                'productivity_loss_pct': max(0, np.random.normal(0.45, 0.15)),
                'session_duration_min': max(1, np.random.normal(120, 30)),
                'consecutive_hours_worked': max(0, np.random.normal(4.5, 1.5)),
                'pause_to_type_ratio': max(0, np.random.normal(1.0, 0.3)),
                'fatigue_label': 'fatigue'
            }
        data.append(row)
    return data

def main():
    np.random.seed(42)
    # 40k rows: 16k normal, 14k mild_fatigue, 10k fatigue
    plan = [
        ('normal', 16),
        ('mild_fatigue', 14),
        ('fatigue', 10)
    ]
    
    total_inserted = 0
    url = f'{SUPABASE_URL}/rest/v1/session_features'
    
    print("Starting insert...")
    for cls, k in plan:
        for i in range(k):
            # insert 1000 at a time
            batch = generate_batch(1000, cls)
            res = requests.post(url, headers=headers, json=batch)
            if res.status_code in [200, 201]:
                total_inserted += 1000
                print(f"Inserted {total_inserted}/40000 ({cls})")
            else:
                print("Error inserting:", res.status_code, res.text)
            time.sleep(0.5)

if __name__ == '__main__':
    main()
