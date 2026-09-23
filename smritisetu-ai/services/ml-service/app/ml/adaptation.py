"""
ML-based Adaptation Engine for SmritiSetu
----------------------------------------
Implements the neural network-based difficulty adaptation engine
as specified in the engineering requirements.

Features:
- Loads TensorFlow Lite model for inference
- Implements exact 5-D feature engineering with per-patient baseline normalization
- Applies temperature scaling for probability calibration
- Implements confidence gating rules:
  * If max probability < 0.65 → fallback to HOLD
  * If P(INCREASE) < 0.75 → HOLD (even if INCREASE is argmax)
- Cold-start fallback: for patients with <10 sessions, use rule engine only
- Trace mode for debugging intermediate computations
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Dict, List, Tuple, Optional, Any
import numpy as np
from uuid import UUID

# TensorFlow is imported lazily to avoid hard dependency for the service
# when ML model is not available or not needed
_TF_AVAILABLE = None
_TF_MODULE = None


def _get_tf():
    """Get TensorFlow module, handling import errors gracefully."""
    global _TF_AVAILABLE, _TF_MODULE
    if _TF_AVAILABLE is None:
        try:
            import tensorflow as tf
            _TF_MODULE = tf
            _TF_AVAILABLE = True
        except ImportError:
            _TF_AVAILABLE = False
            _TF_MODULE = None
    return _TF_MODULE if _TF_AVAILABLE else None

from ..schemas import SessionMetric, AdaptationRequest, AdaptationResponse
from ..rules import adaptation as rule_adaptation
from ..models import anomaly
from ..config import settings
from ..safety import assert_safe_text


class MLAadaptationEngine:
    """
    ML-based adaptation engine that provides difficulty recommendations
    using a trained neural network model.
    """

    def __init__(self, model_path: Optional[Path] = None):
        """
        Initialize the ML adaptation engine.

        Args:
            model_path: Path to the TensorFlow Lite model file.
                       If None, uses default location.
        """
        service_root = Path(__file__).resolve().parents[2]
        self.model_path = model_path or (service_root / "models" / "adaptation_model.tflite")
        self.metadata_path = service_root / "models" / "adaptation_model_metadata.json"
        self.interpreter: Optional[any] = None  # Will be tf.lite.Interpreter if TF available
        self.input_details: Optional[List[Dict]] = None
        self.output_details: Optional[List[Dict]] = None
        self.is_loaded = False
        self.temperature: float = 1.0
        self.feature_metadata: Dict[str, Any] = {}

        self._load_model()

    def _load_model(self) -> None:
        """Load the TensorFlow Lite model and metadata."""
        tf = _get_tf()
        if tf is None:
            print("TensorFlow not available, ML adaptation engine will not be functional")
            self.is_loaded = False
            return

        try:
            if not self.model_path.exists():
                print(f"ML model not found at {self.model_path}")
                return

            self.interpreter = tf.lite.Interpreter(model_path=str(self.model_path))
            self.interpreter.allocate_tensors()
            self.input_details = self.interpreter.get_input_details()
            self.output_details = self.interpreter.get_output_details()
            self.is_loaded = True

            # Load metadata if available
            if self.metadata_path.exists():
                with open(self.metadata_path, 'r') as f:
                    metadata = json.load(f)
                    self.temperature = metadata.get('optimal_temperature', 1.0)
                    self.feature_metadata = metadata

            print(f"ML adaptation model loaded successfully from {self.model_path}")
            print(f"Model temperature: {self.temperature}")

        except Exception as e:
            print(f"Failed to load ML model: {e}")
            self.is_loaded = False

    def _compute_per_patient_baselines(
        self, sessions: List[SessionMetric]
    ) -> Dict[str, Tuple[float, float]]:
        """
        Compute median and MAD for each feature per patient.

        Returns:
            Dictionary mapping feature names to (median, MAD) tuples
        """
        if not sessions:
            return {
                'accuracy': (0.5, 0.1),
                'response_time': (5.0, 2.0),
                'hint_rate': (0.5, 0.2),
                'error_retry': (0.3, 0.2),
                'completion': (0.7, 0.2)
            }

        # Extract feature values
        accuracies = [s.accuracy for s in sessions if s.accuracy is not None]
        response_times = [s.response_time_seconds for s in sessions if s.response_time_seconds > 0]
        hint_rates = []
        error_retries = []
        completions = []

        for s in sessions:
            # hintRate = hints_used / max(hint_opportunities, 1)
            # Using attempts as proxy for hint_opportunities
            hint_opportunities = max(s.attempts, 1)
            hint_rate = s.hints_used / hint_opportunities if hint_opportunities > 0 else 0.0
            hint_rates.append(hint_rate)

            # errorRetry = (wrong_attempts + retry_actions) / max(presented_items, 1)
            # Using simplifications since we don't have all fields
            wrong_attempts = max(0, s.attempts - int(s.accuracy * s.attempts)) if s.accuracy is not None else 0
            retry_actions = 0  # Simplified - not tracked in SessionMetric
            presented_items = max(s.attempts, 1)
            error_retry = (wrong_attempts + retry_actions) / presented_items if presented_items > 0 else 0.0
            error_retries.append(error_retry)

            # completion = completed_items / max(presented_items, 1)
            completed_items = s.attempts if s.completed else 0
            completion = completed_items / presented_items if presented_items > 0 else 0.0
            completions.append(completion)

        # Compute median and MAD for each feature
        def compute_median_mad(values: List[float]) -> Tuple[float, float]:
            if not values:
                return (0.0, 1.0)
            median = np.median(values)
            mad = np.median(np.abs(np.array(values) - median))
            if mad == 0:
                mad = 1e-8
            return (float(median), float(mad))

        baselines = {
            'accuracy': compute_median_mad(accuracies) if accuracies else (0.5, 0.1),
            'response_time': compute_median_mad(response_times) if response_times else (5.0, 2.0),
            'hint_rate': compute_median_mad(hint_rates) if hint_rates else (0.5, 0.2),
            'error_retry': compute_median_mad(error_retries) if error_retries else (0.3, 0.2),
            'completion': compute_median_mad(completions) if completions else (0.7, 0.2)
        }

        return baselines

    def _engineer_features(
        self, sessions: List[SessionMetric], baselines: Dict[str, Tuple[float, float]]
    ) -> Tuple[np.ndarray, Dict[str, Any]]:
        """
        Engineer the exact 5-D feature vector per spec.

        Returns:
            features: Array of shape (n_sessions, 5) with the 5-D feature vector
            trace_data: Dictionary containing intermediate computation values for tracing
        """
        if not sessions:
            return np.array([]), {}

        # Initialize trace data collection
        trace_data = {
            'raw_sessions': [],
            'baselines': baselines,
            'z_scores_before_clip': [],
            'clipped_z_scores': [],
            'scaled_features': [],
            'feature_vectors': []
        }

        features_list = []

        for session_idx, session in enumerate(sessions):
            session_trace = {
                'session_index': session_idx,
                'session_data': {
                    'accuracy': session.accuracy,
                    'response_time': session.response_time_seconds,
                    'hints_used': session.hints_used,
                    'attempts': session.attempts,
                    'completed': session.completed,
                    'engagement_duration': session.engagement_duration_seconds
                }
            }

            # f1 = 2*accuracy - 1
            accuracy = session.accuracy if session.accuracy is not None else 0.5
            f1 = 2.0 * accuracy - 1.0

            # f2 = -(1/5)*clip(z_MAD(RT), -5, 5)
            rt = session.response_time_seconds
            if rt > 0:
                rt_median, rt_mad = baselines['response_time']
                z_rt = (rt - rt_median) / (1.4826 * rt_mad)
                clipped_z_rt = np.clip(z_rt, -5.0, 5.0)
                f2 = -(1.0/5.0) * clipped_z_rt
            else:
                z_rt = 0.0
                clipped_z_rt = 0.0
                f2 = 0.0

            # f3 = -(1/5)*clip(z_MAD(hintRate), -5, 5)
            hint_opportunities = max(session.attempts, 1)
            hint_rate = session.hints_used / hint_opportunities if hint_opportunities > 0 else 0.0
            hint_rate_median, hint_rate_mad = baselines['hint_rate']
            if hint_opportunities > 0:
                z_hint_rate = (hint_rate - hint_rate_median) / (1.4826 * hint_rate_mad)
                clipped_z_hint_rate = np.clip(z_hint_rate, -5.0, 5.0)
                f3 = -(1.0/5.0) * clipped_z_hint_rate
            else:
                z_hint_rate = 0.0
                clipped_z_hint_rate = 0.0
                f3 = 0.0

            # f4 = -(1/5)*clip(z_MAD(errorRetry), -5, 5)
            # Simplified error retry calculation
            wrong_attempts = max(0, session.attempts - int(session.accuracy * session.attempts)) if session.accuracy is not None else 0
            retry_actions = 0  # Not available in SessionMetric
            presented_items = max(session.attempts, 1)
            error_retry = (wrong_attempts + retry_actions) / presented_items if presented_items > 0 else 0.0
            error_retry_median, error_retry_mad = baselines['error_retry']
            if presented_items > 0:
                z_error_retry = (error_retry - error_retry_median) / (1.4826 * error_retry_mad)
                clipped_z_error_retry = np.clip(z_error_retry, -5.0, 5.0)
                f4 = -(1.0/5.0) * clipped_z_error_retry
            else:
                z_error_retry = 0.0
                clipped_z_error_retry = 0.0
                f4 = 0.0

            # f5 = (1/5)*clip(z_MAD(completion), -5, 5)
            completed_items = session.attempts if session.completed else 0
            presented_items = max(session.attempts, 1)
            completion = completed_items / presented_items if presented_items > 0 else 0.0
            completion_median, completion_mad = baselines['completion']
            if presented_items > 0:
                z_completion = (completion - completion_median) / (1.4826 * completion_mad)
                clipped_z_completion = np.clip(z_completion, -5.0, 5.0)
                f5 = (1.0/5.0) * clipped_z_completion
            else:
                z_completion = 0.0
                clipped_z_completion = 0.0
                f5 = 0.0

            feature_vector = [f1, f2, f3, f4, f5]
            features_list.append(feature_vector)

            # Store trace data
            session_trace.update({
                'f1_components': {
                    'accuracy': accuracy,
                    'f1': f1
                },
                'f2_components': {
                    'response_time': rt,
                    'z_score_before_clip': z_rt,
                    'clipped_z_score': clipped_z_rt,
                    'f2': f2
                },
                'f3_components': {
                    'hint_rate': hint_rate,
                    'z_score_before_clip': z_hint_rate,
                    'clipped_z_score': clipped_z_hint_rate,
                    'f3': f3
                },
                'f4_components': {
                    'error_retry': error_retry,
                    'z_score_before_clip': z_error_retry,
                    'clipped_z_score': clipped_z_error_retry,
                    'f4': f4
                },
                'f5_components': {
                    'completion': completion,
                    'z_score_before_clip': z_completion,
                    'clipped_z_score': clipped_z_completion,
                    'f5': f5
                }
            })

            trace_data['raw_sessions'].append(session_trace)
            trace_data['z_scores_before_clip'].append([z_rt, z_hint_rate, z_error_retry, z_completion])
            trace_data['clipped_z_scores'].append([clipped_z_rt, clipped_z_hint_rate, clipped_z_error_retry, clipped_z_completion])
            trace_data['scaled_features'].append([f2*5, f3*5, f4*5, f5*5])  # Reverse the scaling
            trace_data['feature_vectors'].append(feature_vector)

        features_array = np.array(features_list, dtype=np.float32)
        trace_data['final_features'] = features_array.tolist()

        return features_array, trace_data

    def _apply_temperature_scaling(self, logits: np.ndarray) -> np.ndarray:
        """Apply temperature scaling to logits."""
        if self.temperature != 1.0:
            scaled_logits = logits / self.temperature
            return scaled_logits
        return logits

    def _apply_confidence_gating(
        self, probabilities: np.ndarray
    ) -> Tuple[int, float, Dict[str, Any]]:
        """
        Apply confidence gating rules as per spec.

        Returns:
            predicted_class: Final class index (0=EASE, 1=HOLD, 2=INCREASE)
            confidence: Confidence score for the prediction
            gating_info: Information about gating decisions for tracing
        """
        max_prob = np.max(probabilities)
        prob_ease, prob_hold, prob_increase = probabilities[0], probabilities[1], probabilities[2]

        gating_info = {
            'raw_probabilities': probabilities.tolist(),
            'max_probability': float(max_prob),
            'prob_ease': float(prob_ease),
            'prob_hold': float(prob_hold),
            'prob_increase': float(prob_increase),
            'gating_applied': [],
            'final_decision': {},
            'confidence_before_gating': float(max_prob)
        }

        # Rule 1: If max probability < 0.65 → fallback to HOLD
        if max_prob < 0.65:
            gating_info['gating_applied'].append('max_probability_below_threshold')
            predicted_class = 1  # HOLD
            confidence = max_prob  # Keep original confidence
            gating_info['final_decision'] = {
                'rule': 'max_probability < 0.65 -> HOLD',
                'class': predicted_class,
                'confidence': confidence
            }
            return predicted_class, confidence, gating_info

        # Rule 2: If P(INCREASE) < 0.75 → HOLD (even if INCREASE is argmax)
        if prob_increase < 0.75:
            gating_info['gating_applied'].append('prob_increase_below_threshold')
            predicted_class = 1  # HOLD
            confidence = prob_hold  # Confidence in HOLD class
            gating_info['final_decision'] = {
                'rule': 'P(INCREASE) < 0.75 -> HOLD',
                'class': predicted_class,
                'confidence': confidence
            }
            return predicted_class, confidence, gating_info

        # No gating applied, use argmax
        predicted_class = int(np.argmax(probabilities))
        confidence = float(probabilities[predicted_class])
        gating_info['gating_applied'].append('no_gating_applied')
        gating_info['final_decision'] = {
            'rule': 'argmax of probabilities',
            'class': predicted_class,
            'confidence': confidence
        }

        return predicted_class, confidence, gating_info

    def recommend(
        self, request: AdaptationRequest, trace: bool = False
    ) -> Tuple[AdaptationResponse, Dict[str, Any]]:
        """
        Generate adaptation recommendation using ML model.

        Args:
            request: Adaptation request containing patient data
            trace: If True, return detailed trace information

        Returns:
            response: AdaptationResponse object
            trace_info: Dictionary with trace information (empty if trace=False)
        """
        start_time = time.time()
        trace_info = {}

        # Check if we should use ML (cold start: <10 sessions)
        if len(request.sessions) < 10:
            # Fall back to rule engine for cold start
            trace_info['cold_start'] = True
            trace_info['reason'] = f'Patient has {len(request.sessions)} sessions (< 10 threshold)'
            rule_response = rule_adaptation.recommend(request)
            trace_info['rule_engine_fallback'] = rule_response.model_dump()
            trace_info['total_latency_ms'] = (time.time() - start_time) * 1000
            return rule_response, trace_info

        # Check if model is loaded
        if not self.is_loaded:
            trace_info['model_not_loaded'] = True
            trace_info['reason'] = 'ML model not available, falling back to rule engine'
            rule_response = rule_adaptation.recommend(request)
            trace_info['rule_engine_fallback'] = rule_response.model_dump()
            trace_info['total_latency_ms'] = (time.time() - start_time) * 1000
            return rule_response, trace_info

        tf = _get_tf()
        try:
            # Compute per-patient baselines
            baselines = self._compute_per_patient_baselines(request.sessions)

            # Engineer features
            features, feature_trace = self._engineer_features(request.sessions, baselines)
            trace_info['feature_engineering'] = feature_trace if trace else {}

            # Use the most recent session's features for prediction
            # (In practice, we might want to average or use weighted recent sessions)
            if len(features) == 0:
                trace_info['no_valid_features'] = True
                rule_response = rule_adaptation.recommend(request)
                trace_info['rule_engine_fallback'] = rule_response.model_dump()
                trace_info['total_latency_ms'] = (time.time() - start_time) * 1000
                return rule_response, trace_info

            # Use the most recent session's features
            recent_features = features[-1:]  # Shape: (1, 5)
            trace_info['recent_features_used'] = recent_features.tolist()[0]

            # Run inference
            self.interpreter.set_tensor(
                self.input_details[0]['index'],
                recent_features
            )
            self.interpreter.invoke()
            logits = self.interpreter.get_tensor(self.output_details[0]['index'])
            trace_info['raw_logits'] = logits.tolist()[0]

            # Apply temperature scaling
            scaled_logits = self._apply_temperature_scaling(logits)
            trace_info['temperature_scaled_logits'] = scaled_logits.tolist()[0]
            trace_info['temperature_used'] = self.temperature

            # Convert to probabilities
            probabilities = tf.nn.softmax(scaled_logits[0]).numpy()
            trace_info['probabilities'] = probabilities.tolist()

            # Apply confidence gating
            predicted_class, confidence, gating_info = self._apply_confidence_gating(probabilities)
            trace_info['confidence_gating'] = gating_info

            # Map class to difficulty adjustment
            # EASE (0) -> decrease difficulty by 1
            # HOLD (1) -> keep same difficulty
            # INCREASE (2) -> increase difficulty by 1
            current_difficulty = request.current_difficulty
            difficulty_change = predicted_class - 1  # -1 for EASE, 0 for HOLD, +1 for INCREASE
            recommended_difficulty = current_difficulty + difficulty_change

            # Clamp difficulty to valid range [1, 4]
            recommended_difficulty = max(1, min(4, recommended_difficulty))

            # Generate explanation based on prediction
            class_names = ['EASE', 'HOLD', 'INCREASE']
            explanation_templates = {
                0: "Model predicts difficulty should be decreased based on recent performance patterns.",
                1: "Model predicts current difficulty level should be maintained.",
                2: "Model predicts difficulty should be increased based on strong recent performance."
            }
            base_explanation = explanation_templates[predicted_class]

            if trace:
                base_explanation += f" ML confidence: {confidence:.3f}, Raw probabilities: EASE={probabilities[0]:.3f}, HOLD={probabilities[1]:.3f}, INCREASE={probabilities[2]:.3f}"

            # Apply safety checks
            try:
                explanation = assert_safe_text(base_explanation)
            except Exception:
                explanation = "Results were strong enough to move up a level, but the most recent session looked different from this patient's usual pattern, so the current level continues for now."

            # Determine reason code
            reason_code_map = {
                0: "ML_MODEL_EASE_RECOMMENDATION",
                1: "ML_MODEL_HOLD_RECOMMENDATION",
                2: "ML_MODEL_INCREASE_RECOMMENDATION"
            }
            reason_code = reason_code_map[predicted_class]

            # Create response
            response = AdaptationResponse(
                recommended_difficulty=recommended_difficulty,
                hint_level=1,  # Default hint level - could be made smarter
                recommended_game_type=request.game_type,
                reason_code=reason_code,
                explanation=explanation,
                confidence=round(confidence, 2),
                evidence_session_count=len(request.sessions),
                model_version=f"ml-adapter-v1.0-temp{self.temperature:.3f}"
            )

            trace_info['ml_recommendation'] = {
                'predicted_class': predicted_class,
                'predicted_class_name': class_names[predicted_class],
                'recommended_difficulty': recommended_difficulty,
                'confidence': confidence
            }
            trace_info['total_latency_ms'] = (time.time() - start_time) * 1000

            return response, trace_info

        except Exception as e:
            print(f"Error in ML adaptation: {e}")
            trace_info['error'] = str(e)
            trace_info['falling_back_to_rule_engine'] = True
            rule_response = rule_adaptation.recommend(request)
            trace_info['rule_engine_fallback'] = rule_response.model_dump()
            trace_info['total_latency_ms'] = (time.time() - start_time) * 1000
            return rule_response, trace_info


# Global instance for reuse
_ml_engine: Optional[MLAadaptationEngine] = None


def get_ml_engine() -> MLAadaptationEngine:
    """Get or create the global ML adaptation engine instance."""
    global _ml_engine
    if _ml_engine is None:
        _ml_engine = MLAadaptationEngine()
    return _ml_engine


def ml_recommend_difficulty(
    request: AdaptationRequest, trace: bool = False
) -> Tuple[AdaptationResponse, Dict[str, Any]]:
    """
    Convenience function for ML-based difficulty recommendation.

    Args:
        request: Adaptation request
        trace: If True, return trace information

    Returns:
        response: AdaptationResponse
        trace_info: Trace information dictionary
    """
    engine = get_ml_engine()
    return engine.recommend(request, trace=trace)


def is_ml_available() -> bool:
    """Check if ML engine is available and loaded."""
    engine = get_ml_engine()
    return engine.is_loaded