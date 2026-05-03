# Get Focused — Cognitive Fatigue Detection System

A real-time cognitive fatigue detection browser extension that monitors typing and mouse behavior patterns to predict fatigue levels and provide actionable feedback.

## Project Structure

```
extension/
├── chrome-extension/           # Browser Extension (Chrome / Edge)
│   ├── manifest.json           # Extension manifest (MV3)
│   ├── content.js              # Privacy-safe data collection
│   ├── background.js           # Service worker (orchestration)
│   ├── popup.html/css/js       # Dashboard UI
│   ├── options.html/css/js     # Settings page
│   ├── libs/
│   │   └── feature-engine.js   # Feature computation library
│   └── icons/                  # Extension icons
│
├── backend/                    # Flask Backend API
│   ├── app.py                  # API server (port 5050)
│   ├── model_runner.py         # Random Forest model (scikit-learn)
│   ├── requirements.txt        # Python dependencies
│   └── model/                  # Trained model storage
│
└── README.md
```

## Setup

### 1. Backend (Flask API)

```bash
cd backend
pip install -r requirements.txt
python app.py
```

The server starts on `http://localhost:5050`. On first run, it generates a synthetic dataset (45,000 samples) and trains a Random Forest classifier automatically.

### 2. Browser Extension

1. Open Chrome or Edge
2. Navigate to `chrome://extensions/` (or `edge://extensions/`)
3. Enable **Developer mode**
4. Click **Load unpacked**
5. Select the `chrome-extension/` folder

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | API health check and model status |
| POST | `/predict` | Predict fatigue from 22 behavioral features |
| GET | `/model/info` | Model metadata and feature importance |
| POST | `/model/retrain` | Retrain model with new or synthetic data |

### Prediction Input (22 Features)

```json
{
  "typing_speed_cps": 4.2,
  "error_rate": 0.08,
  "backspace_rate": 0.06,
  "inter_key_interval_ms": 230,
  "pause_avg_ms": 2100,
  "pause_std_ms": 800,
  "pause_to_type_ratio": 0.25,
  "pause_increase_pct": 15.0,
  "hold_time_avg_ms": 110,
  "burst_length_avg": 6.0,
  "session_duration_min": 45.0,
  "consecutive_hours_worked": 2.5,
  "rhythm_consistency": 0.72,
  "keystroke_variability": 65.0,
  "mouse_speed_avg_px_s": 320,
  "mouse_click_count": 25,
  "mouse_idle_ratio": 0.3,
  "mouse_path_efficiency": 0.65,
  "focus_switch_count": 5,
  "speed_drop_pct": 12.0,
  "fatigue_score_rule": 30,
  "productivity_loss_pct": 18.0
}
```

### Prediction Output

```json
{
  "fatigue_label": "mild_fatigue",
  "confidence": 0.82,
  "probabilities": {
    "normal": 0.12,
    "mild_fatigue": 0.82,
    "fatigue": 0.06
  },
  "source": "ml_model",
  "recommendations": [
    "Early signs of fatigue detected. A short 5-minute break may help."
  ]
}
```

## Privacy

- No actual key characters are captured
- Password fields are excluded from data collection
- Only timing-based metadata is used
- No URLs, form data, or personal identifiers are stored
- All processing runs locally

## Machine Learning Model

The classifier replicates the provided RapidMiner process using scikit-learn:

- Algorithm: Random Forest (100 trees, max depth 10)
- Criterion: Entropy (approximating gain_ratio)
- Split: 70% train / 30% test
- Labels: `normal`, `mild_fatigue`, `fatigue`

When the Flask API is unavailable, the extension falls back to a rule-based scoring system using speed deviation, error rate increase, and pause increase metrics.

## Technology Stack

- **Extension**: HTML, CSS, JavaScript (Manifest V3)
- **Backend**: Python, Flask, scikit-learn
- **Model**: Random Forest classifier (joblib persistence)
- **Storage**: chrome.storage.local (extension), Supabase (optional, stub)
