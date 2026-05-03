"""
Get Focused — Flask Backend API

Local prediction server running on port 5050.
Accepts behavioral feature data from the browser extension
and returns fatigue classification predictions.

Endpoints:
  GET  /health              - API health and model status
  POST /predict             - Predict fatigue from features
  GET  /model/info          - Model metadata and feature importance
  POST /model/retrain       - Retrain model (optional)
"""

import os
import sys
import logging
from datetime import datetime, timezone

from flask import Flask, request, jsonify
from flask_cors import CORS

from model_runner import (
    load_model, predict, train_model,
    get_feature_importance, MODEL_FEATURES
)

# ─── Configuration ──────────────────────────────────────────────────

app = Flask(__name__)
CORS(app, origins=[
    'chrome-extension://*',
    'http://localhost:*',
    'http://127.0.0.1:*'
])

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger('get_focused')

# ─── Model Loading ──────────────────────────────────────────────────

model = None
model_loaded_at = None

def ensure_model():
    global model, model_loaded_at
    if model is None:
        logger.info("Loading fatigue prediction model...")
        model = load_model()
        model_loaded_at = datetime.now(tz=timezone.utc).isoformat()
        logger.info("Model loaded successfully.")
    return model

# ─── Routes ─────────────────────────────────────────────────────────

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    try:
        ensure_model()
        return jsonify({
            'status': 'ok',
            'model_loaded': True,
            'model_loaded_at': model_loaded_at,
            'timestamp': datetime.now(tz=timezone.utc).isoformat()
        }), 200
    except Exception as e:
        return jsonify({
            'status': 'error',
            'model_loaded': False,
            'error': str(e)
        }), 500


@app.route('/predict', methods=['POST'])
def predict_fatigue():
    """
    Predict fatigue level from behavioral features.
    
    Request body: JSON with 22 feature values.
    Response: {
        fatigue_label: str,
        confidence: float,
        probabilities: dict,
        source: str,
        recommendations: list
    }
    """
    try:
        data = request.get_json(force=True)
        if not data:
            return jsonify({'error': 'Request body must be JSON with feature values.'}), 400

        # Validate required features
        missing = [f for f in MODEL_FEATURES if f not in data]
        if missing:
            return jsonify({
                'error': f'Missing features: {", ".join(missing)}',
                'required_features': MODEL_FEATURES
            }), 400

        m = ensure_model()
        result = predict(m, data)

        # Add contextual recommendations
        result['recommendations'] = generate_recommendations(
            result['fatigue_label'], data
        )

        return jsonify(result), 200

    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.exception("Prediction error")
        return jsonify({'error': f'Prediction failed: {str(e)}'}), 500


@app.route('/model/info', methods=['GET'])
def model_info():
    """Return model metadata and feature importance."""
    try:
        m = ensure_model()
        importance = get_feature_importance(m)
        return jsonify({
            'model_type': 'RandomForestClassifier',
            'n_estimators': 100,
            'max_depth': 10,
            'features': MODEL_FEATURES,
            'feature_count': len(MODEL_FEATURES),
            'labels': ['normal', 'mild_fatigue', 'fatigue'],
            'feature_importance': importance,
            'loaded_at': model_loaded_at
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/model/retrain', methods=['POST'])
def retrain():
    """
    Retrain the model, optionally with provided data.
    Without data, re-generates synthetic dataset.
    """
    global model, model_loaded_at
    try:
        import pandas as pd

        data = request.get_json(silent=True)
        dataset = None

        if data and 'records' in data:
            dataset = pd.DataFrame(data['records'])
            if 'fatigue_label' not in dataset.columns:
                return jsonify({'error': 'Training data must include fatigue_label column.'}), 400

        new_model, accuracy, report = train_model(dataset=dataset, save=True)
        model = new_model
        model_loaded_at = datetime.now(tz=timezone.utc).isoformat()

        return jsonify({
            'status': 'retrained',
            'accuracy': accuracy,
            'timestamp': model_loaded_at
        }), 200

    except Exception as e:
        logger.exception("Retrain error")
        return jsonify({'error': f'Retrain failed: {str(e)}'}), 500


# ─── Recommendations ───────────────────────────────────────────────

def generate_recommendations(label, features):
    """Generate actionable recommendations based on prediction and features."""
    recs = []

    if label == 'fatigue':
        recs.append('Productivity has decreased significantly. A 10 to 15 minute break is recommended.')
        if features.get('consecutive_hours_worked', 0) > 4:
            recs.append(f'You have been working for {features["consecutive_hours_worked"]:.1f} hours continuously. Consider stepping away.')
        if features.get('mouse_idle_ratio', 0) > 0.5:
            recs.append('Extended idle periods detected. Physical movement may help restore focus.')

    elif label == 'mild_fatigue':
        recs.append('Early signs of fatigue detected. A short 5-minute break may help.')
        if features.get('error_rate', 0) > 0.15:
            recs.append('Error rate is elevated. Consider slowing down and reviewing your work.')
        if features.get('rhythm_consistency', 1) < 0.5:
            recs.append('Typing rhythm has become irregular. This may indicate declining attention.')

    else:
        recs.append('Performance metrics are within normal range.')

    return recs


# ─── Entry Point ───────────────────────────────────────────────────

if __name__ == '__main__':
    logger.info("Starting Get Focused API server on port 5050...")
    ensure_model()
    app.run(host='127.0.0.1', port=5050, debug=False)
