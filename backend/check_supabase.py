import requests
SUPABASE_URL = 'YOUR_SUPABASE_URL'
SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY'

headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json'
}

r = requests.get(
    f'{SUPABASE_URL}/rest/v1/session_features?order=recorded_at.desc&limit=10',
    headers=headers
)

print(f'Status: {r.status_code}')
rows = r.json()
print(f'Total rows: {len(rows)}')
print()

for i, row in enumerate(rows, 1):
    print(f'--- Row {i} ---')
    print(f'  session_id       : {row.get("session_id")}')
    print(f'  user_uuid        : {row.get("user_uuid")}')
    print(f'  recorded_at      : {row.get("recorded_at")}')
    print(f'  typing_speed_cps : {row.get("typing_speed_cps")}')
    print(f'  error_rate       : {row.get("error_rate")}')
    print(f'  fatigue_label    : {row.get("fatigue_label")}')
    print(f'  confidence       : {row.get("confidence")}')
    print(f'  prediction_source: {row.get("prediction_source")}')
    print()
