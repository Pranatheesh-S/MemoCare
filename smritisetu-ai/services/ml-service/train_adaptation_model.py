"""
SmritiSetu — Adaptive Difficulty ML Engine
------------------------------------------
Trains a classification neural network that maps patient session
performance to difficulty adaptation decisions (EASE/HOLD/INCREASE),
then exports it to TensorFlow Lite for on-device inference.

Based on engineering specification requiring:
- 5→16→8→3 neural network outputting logits for 3 classes
- Exact 5-D feature vector with per-patient baseline normalization
- L2 regularization, Adam optimizer, temperature scaling
- GroupKFold cross-validation with patient grouping
- Synthetic patient session generator for initial training
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Dict, List, Tuple, Optional

import numpy as np
import tensorflow as tf


class GroupKFoldWithShuffle:
    """Compatibility wrapper matching the expected GroupKFold semantics."""

    def __init__(self, n_splits: int = 5, shuffle: bool = True, random_state: int = 42):
        self.n_splits = n_splits
        self.shuffle = shuffle
        self.random_state = random_state

    def split(self, X: np.ndarray, y=None, groups=None):
        if groups is None:
            raise ValueError("groups must be provided for GroupKFoldWithShuffle")

        group_ids = np.unique(groups)
        if self.shuffle:
            rng = np.random.RandomState(self.random_state)
            group_ids = group_ids[rng.permutation(len(group_ids))]

        if len(group_ids) < self.n_splits:
            raise ValueError(
                f"n_splits={self.n_splits} cannot be greater than the number of groups={len(group_ids)}"
            )

        group_to_fold: Dict[object, int] = {}
        fold_sizes = np.full(self.n_splits, len(group_ids) // self.n_splits, dtype=int)
        fold_sizes[: len(group_ids) % self.n_splits] += 1

        start = 0
        for fold_idx, size in enumerate(fold_sizes):
            for group in group_ids[start : start + size]:
                group_to_fold[group] = fold_idx
            start += size

        group_fold_map = np.array([group_to_fold[group] for group in groups], dtype=int)

        for fold_idx in range(self.n_splits):
            val_mask = group_fold_map == fold_idx
            train_mask = ~val_mask
            yield np.where(train_mask)[0], np.where(val_mask)[0]

ROOT = Path(__file__).resolve().parent
ARTIFACT_DIR = ROOT / "models"
RN_ASSET_DIR = ROOT.parent.parent / "apps" / "patient-mobile" / "assets" / "models"
TFLITE_NAME = "adaptation_model.tflite"
METADATA_NAME = "adaptation_model_metadata.json"

# Ensure directories exist
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
RN_ASSET_DIR.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# 1. Synthetic patient session generator (per spec section 6)
# ---------------------------------------------------------------------------
def generate_synthetic_patient_sessions(
    n_patients: int = 100,
    min_sessions_per_patient: int = 20,
    max_sessions_per_patient: int = 100,
    seed: int = 42
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Generate synthetic patient session data for initial model training.

    Returns:
        X: Feature matrix of shape (n_sessions, 5)
        y: Label vector of shape (n_sessions,) with values 0=EASE, 1=HOLD, 2=INCREASE
        patient_groups: Array of patient IDs for GroupKFold
    """
    rng = np.random.default_rng(seed)

    all_sessions = []
    all_labels = []
    all_patient_ids = []

    # Generate patients with varying characteristics
    for patient_id in range(n_patients):
        # Patient-specific characteristics
        base_accuracy = rng.beta(2, 2)  # Centered around 0.5
        base_speed = rng.gamma(2, 2)    # Response time tendency
        base_hint_tendency = rng.beta(1, 3)  # Most patients use few hints
        consistency = rng.beta(2, 2)    # How consistent performance is

        n_sessions = rng.integers(min_sessions_per_patient, max_sessions_per_patient + 1)

        for session_idx in range(n_sessions):
            # Session performance with some variability around patient baseline
            accuracy = np.clip(rng.normal(base_accuracy, 0.1 * (1 - consistency)), 0, 1)

            # Response time: faster when doing well
            rt_factor = 1.0 - (accuracy - 0.5) * 0.5  # Faster when accuracy > 0.5
            response_time = np.clip(rng.gamma(2, base_speed * rt_factor / 2), 0.5, 10.0)

            # Hints used: more hints when struggling
            hint_factor = 1.0 + (0.5 - accuracy)  # More hints when accuracy < 0.5
            hints_used = np.clip(rng.poisson(base_hint_tendency * hint_factor * 3), 0, 10)

            # Attempts and correct attempts for derived metrics
            max_attempts = rng.integers(3, 8)
            attempts = rng.integers(1, max_attempts + 1)
            correct_attempts = np.clip(
                rng.binomial(attempts, accuracy), 0, attempts
            )

            # Whether completed (simplified)
            completed = rng.random() < (accuracy + 0.1)
            completed = bool(completed and not rng.random() < 0.1)  # Some randomness

            # Calculate derived metrics per spec
            hint_opportunities = max(attempts, 1)  # Simplified
            hint_rate = hints_used / hint_opportunities

            wrong_attempts = attempts - correct_attempts
            retry_actions = rng.integers(0, wrong_attempts + 1)  # Some retries
            presented_items = max(attempts, 1)
            error_retry_rate = (wrong_attempts + retry_actions) / presented_items

            completed_items = correct_attempts if completed else 0
            completion_ratio = completed_items / presented_items

            # Store raw session data for feature engineering
            session_data = {
                'patient_id': patient_id,
                'accuracy': accuracy,
                'response_time': response_time,
                'hints_used': hints_used,
                'attempts': attempts,
                'correct_attempts': correct_attempts,
                'completed': completed,
                'engagement_duration': rng.integers(30, 300),  # seconds
                'played_at': None,  # Not needed for synthetic data
                'abandoned': not completed and rng.random() < 0.2,
                'game_type': 'MEMORY_MATCH',  # Simplified
                'difficulty': rng.integers(1, 5)
            }

            all_sessions.append(session_data)
            all_patient_ids.append(patient_id)

            # Generate label using rule distillation (will be implemented later)
            # For now, use a placeholder based on accuracy
            if accuracy < 0.4:
                label = 0  # EASE
            elif accuracy > 0.7:
                label = 2  # INCREASE
            else:
                label = 1  # HOLD

            all_labels.append(label)

    # Convert to arrays for feature engineering
    X_raw = np.array([[
        s['accuracy'],
        s['response_time'],
        s['hints_used'],
        s['completed'],
        (s['attempts'] - s['correct_attempts']) / max(s['attempts'], 1)  # error rate placeholder
    ] for s in all_sessions], dtype=np.float32)

    y = np.array(all_labels, dtype=np.int32)
    patient_groups = np.array(all_patient_ids, dtype=np.int32)

    return X_raw, y, patient_groups, all_sessions


# ---------------------------------------------------------------------------
# 2. Feature engineering pipeline
# ---------------------------------------------------------------------------
def compute_median_mad(values: np.ndarray) -> Tuple[float, float]:
    """
    Compute median and MAD (Median Absolute Deviation) for robust normalization.

    Returns:
        median: median value
        mad: median absolute deviation
    """
    median = np.median(values)
    mad = np.median(np.abs(values - median))
    # Handle case where MAD is zero (all values identical)
    if mad == 0:
        mad = 1e-8
    return median, mad


def z_score_mad(value: float, median: float, mad: float) -> float:
    """
    Compute robust z-score using MAD: (value - median) / (1.4826 * MAD)
    The factor 1.4826 makes MADconsistent with standard deviation for normal distribution.
    """
    return (value - median) / (1.4826 * mad)


def engineer_features_per_patient(
    sessions: List[Dict]
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Engineer the exact 5-D feature vector per spec using per-patient baseline normalization.

    Args:
        sessions: List of session dictionaries for a single patient

    Returns:
        features: Array of shape (n_sessions, 5) with the 5-D feature vector
        valid_mask: Boolean array indicating which sessions have valid features
    """
    if len(sessions) == 0:
        return np.array([]), np.array([])

    # Extract raw values for baseline computation
    accuracies = np.array([s['accuracy'] for s in sessions if s['accuracy'] is not None])
    response_times = np.array([s['response_time'] for s in sessions if s['response_time'] > 0])
    hint_rates = np.array([
        s['hints_used'] / max(s.get('hint_opportunities', s.get('attempts', 1)), 1)
        for s in sessions
        if s.get('hints_used', 0) >= 0 and s.get('attempts', 0) > 0
    ])
    error_retry_rates = np.array([
        (s.get('wrong_attempts', 0) + s.get('retry_actions', 0)) /
        max(s.get('presented_items', s.get('attempts', 1)), 1)
        for s in sessions
        if s.get('presented_items', s.get('attempts', 0)) > 0
    ])
    completion_ratios = np.array([
        s.get('completed_items', s.get('correct_attempts', 0)) /
        max(s.get('presented_items', s.get('attempts', 1)), 1)
        for s in sessions
        if s.get('presented_items', s.get('attempts', 0)) > 0
    ])

    # Compute per-patient baselines using median/MAD
    acc_median, acc_mad = compute_median_mad(accuracies) if len(accuracies) > 0 else (0.5, 0.1)
    rt_median, rt_mad = compute_median_mad(response_times) if len(response_times) > 0 else (5.0, 2.0)
    hint_rate_median, hint_rate_mad = compute_median_mad(hint_rates) if len(hint_rates) > 0 else (0.5, 0.2)
    error_retry_median, error_retry_mad = compute_median_mad(error_retry_rates) if len(error_retry_rates) > 0 else (0.3, 0.2)
    completion_median, completion_mad = compute_median_mad(completion_ratios) if len(completion_ratios) > 0 else (0.7, 0.2)

    features = []
    valid_mask = []

    for session in sessions:
        # f1 = 2*accuracy - 1
        acc = session.get('accuracy', 0.5)
        f1 = 2.0 * acc - 1.0

        # f2 = -(1/5)*clip(z_MAD(RT), -5, 5)
        rt = session.get('response_time', 0.0)
        if rt > 0:
            z_rt = z_score_mad(rt, rt_median, rt_mad)
            f2 = -(1.0/5.0) * np.clip(z_rt, -5.0, 5.0)
        else:
            f2 = 0.0  # Neutral when no response time

        # f3 = -(1/5)*clip(z_MAD(hintRate), -5, 5)
        hints_used = session.get('hints_used', 0)
        hint_opportunities = max(session.get('hint_opportunities', session.get('attempts', 1)), 1)
        hint_rate = hints_used / hint_opportunities if hint_opportunities > 0 else 0.0
        if hint_opportunities > 0:
            z_hint_rate = z_score_mad(hint_rate, hint_rate_median, hint_rate_mad)
            f3 = -(1.0/5.0) * np.clip(z_hint_rate, -5.0, 5.0)
        else:
            f3 = 0.0

        # f4 = -(1/5)*clip(z_MAD(errorRetry), -5, 5)
        wrong_attempts = session.get('wrong_attempts', 0)
        retry_actions = session.get('retry_actions', 0)
        presented_items = max(session.get('presented_items', session.get('attempts', 1)), 1)
        error_retry = (wrong_attempts + retry_actions) / presented_items if presented_items > 0 else 0.0
        if presented_items > 0:
            z_error_retry = z_score_mad(error_retry, error_retry_median, error_retry_mad)
            f4 = -(1.0/5.0) * np.clip(z_error_retry, -5.0, 5.0)
        else:
            f4 = 0.0

        # f5 = (1/5)*clip(z_MAD(completion), -5, 5)
        completed_items = session.get('completed_items', session.get('correct_attempts', 0) if session.get('completed', False) else 0)
        presented_items = max(session.get('presented_items', session.get('attempts', 1)), 1)
        completion = completed_items / presented_items if presented_items > 0 else 0.0
        if presented_items > 0:
            z_completion = z_score_mad(completion, completion_median, completion_mad)
            f5 = (1.0/5.0) * np.clip(z_completion, -5.0, 5.0)
        else:
            f5 = 0.0

        features.append([f1, f2, f3, f4, f5])
        # Mark as valid if we have at least some meaningful data
        valid_mask.append(
            session.get('accuracy') is not None and
            session.get('attempts', 0) > 0
        )

    return np.array(features, dtype=np.float32), np.array(valid_mask, dtype=bool)


def process_all_sessions_for_features(
    all_sessions: List[Dict]
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Process all sessions to compute features with per-patient baselines.

    Returns:
        X_features: Feature matrix of shape (n_valid_sessions, 5)
        y_labels: Label array of shape (n_valid_sessions,)
        patient_groups: Patient ID array of shape (n_valid_sessions,)
    """
    # Group sessions by patient
    patients_sessions: Dict[int, List[Dict]] = {}
    for session in all_sessions:
        pid = session.get('patient_id', 0)
        if pid not in patients_sessions:
            patients_sessions[pid] = []
        patients_sessions[pid].append(session)

    all_features = []
    all_labels = []
    all_patient_groups = []

    # Process each patient separately for baseline normalization
    for patient_id, sessions in patients_sessions.items():
        features, valid_mask = engineer_features_per_patient(sessions)

        if len(features) > 0:
            # Get labels for valid sessions
            session_labels = [
                0 if s.get('accuracy', 0.5) < 0.4 else
                2 if s.get('accuracy', 0.5) > 0.7 else
                1
                for i, s in enumerate(sessions) if valid_mask[i]
            ]

            all_features.extend(features)
            all_labels.extend(session_labels)
            all_patient_groups.extend([patient_id] * len(features))

    return (
        np.array(all_features, dtype=np.float32),
        np.array(all_labels, dtype=np.int32),
        np.array(all_patient_groups, dtype=np.int32)
    )


# ---------------------------------------------------------------------------
# 3. Model building function
# ---------------------------------------------------------------------------
def build_classification_model() -> tf.keras.Model:
    """
    Build the 5→16→8→3 neural network as specified:
    - Input: 5 features
    - Hidden layer 1: 16 units with ReLU
    - Hidden layer 2: 8 units with ReLU
    - Output: 3 units (logits for EASE/HOLD/INCREASE)
    - L2 regularization (1e-4) on both dense layers
    """
    model = tf.keras.Sequential([
        tf.keras.layers.Input(shape=(5,), name='features'),
        tf.keras.layers.Dense(
            16,
            activation='relu',
            kernel_regularizer=tf.keras.regularizers.l2(1e-4),
            name='dense_1'
        ),
        tf.keras.layers.Dense(
            8,
            activation='relu',
            kernel_regularizer=tf.keras.regularizers.l2(1e-4),
            name='dense_2'
        ),
        tf.keras.layers.Dense(
            3,
            activation='linear',  # Logits - no activation
            name='logits'
        )
    ])

    # Compile with specified optimizer and loss
    optimizer = tf.keras.optimizers.Adam(
        learning_rate=1e-3,
        beta_1=0.9,
        beta_2=0.999
    )

    model.compile(
        optimizer=optimizer,
        loss=tf.keras.losses.SparseCategoricalCrossentropy(from_logits=True),
        metrics=['accuracy']
    )

    return model


# ---------------------------------------------------------------------------
# 4. Temperature scaling
# ---------------------------------------------------------------------------
class TemperatureScaling(tf.keras.Model):
    """
    Temperature scaling for model calibration (Guo et al., 2017)
    """
    def __init__(self, model: tf.keras.Model):
        super().__init__()
        self.model = model
        self.temperature = tf.Variable(
            initial_value=1.0,
            trainable=True,
            dtype=tf.float32
        )

    def call(self, inputs, training=None):
        logits = self.model(inputs, training=training)
        return logits / self.temperature


def train_with_temperature_scaling(
    model: tf.keras.Model,
    X_train: np.ndarray,
    y_train: np.ndarray,
    X_val: np.ndarray,
    y_val: np.ndarray
) -> Tuple[tf.keras.Model, float]:
    """
    Train model with temperature scaling on validation set.

    Returns:
        calibrated_model: Model with temperature scaling layer
        optimal_temperature: Found optimal temperature value
    """
    # Create temperature scaled model
    temp_model = TemperatureScaling(model)

    # Compile temperature scaled model
    temp_model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=1e-3),
        loss=tf.keras.losses.SparseCategoricalCrossentropy(from_logits=True),
        metrics=['accuracy']
    )

    # Train the base model first (as temperature scaling doesn't affect fitting)
    print("Training base model...")
    model.fit(
        X_train, y_train,
        validation_data=(X_val, y_val),
        epochs=20,
        batch_size=64,
        verbose=1
    )

    # Now optimize temperature on validation set
    print("Optimizing temperature scaling...")
    val_logits = model.predict(X_val, verbose=0)

    # Define temperature loss (negative log likelihood)
    def temperature_loss(temp):
        scaled_logits = val_logits / temp
        loss = tf.keras.losses.sparse_categorical_crossentropy(
            y_val, scaled_logits, from_logits=True
        )
        return tf.reduce_mean(loss)

    # Find optimal temperature using simple search
    temperatures = np.linspace(0.5, 3.0, 50)
    losses = []

    for temp in temperatures:
        loss = temperature_loss(temp)
        losses.append(loss.numpy() if hasattr(loss, 'numpy') else loss)

    optimal_temp = temperatures[np.argmin(losses)]
    print(f"Optimal temperature: {optimal_temp:.3f}")

    # Set the temperature in the model
    temp_model.temperature.assign(optimal_temp)

    return temp_model, optimal_temp


# ---------------------------------------------------------------------------
# 5. Export functions
# ---------------------------------------------------------------------------
def export_tflite(model: tf.keras.Model, destination: Path) -> bytes:
    """Export model to TensorFlow Lite format."""
    converter = tf.lite.TFLiteConverter.from_keras_model(model)
    converter.optimizations = [tf.lite.Optimize.DEFAULT]  # quantize for size/speed
    tflite_model = converter.convert()
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(tflite_model)
    return tflite_model


def save_metadata(metadata: Dict, destination: Path):
    """Save model metadata to JSON file."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    with open(destination, 'w') as f:
        json.dump(metadata, f, indent=2)


def sanity_check_keras(model: tf.keras.Model) -> None:
    """Perform sanity checks on the Keras model."""
    print("\n=== Keras Model Sanity Check ===")

    # Test case 1: Strong performance (should favor INCREASE)
    strong_perf = np.array([[0.9, 0.2, 0.1, 0.9, 0.8]], dtype=np.float32)  # high acc, fast RT, low hints, high completion
    prediction = model.predict(strong_perf, verbose=0)
    predicted_class = np.argmax(tf.nn.softmax(prediction[0]))
    print(f"Strong performance input: {strong_perf.tolist()}")
    print(f"Predicted logits: {prediction.tolist()}")
    print(f"Predicted probabilities: {tf.nn.softmax(prediction[0]).numpy().tolist()}")
    print(f"Predicted class: {predicted_class} (0=EASE, 1=HOLD, 2=INCREASE)")

    # Test case 2: Poor performance (should favor EASE)
    poor_perf = np.array([[0.3, 0.8, 0.9, 0.2, -0.5]], dtype=np.float32)  # low acc, slow RT, high hints, low completion
    prediction = model.predict(poor_perf, verbose=0)
    predicted_class = np.argmax(tf.nn.softmax(prediction[0]))
    print(f"\nPoor performance input: {poor_perf.tolist()}")
    print(f"Predicted logits: {prediction.tolist()}")
    print(f"Predicted probabilities: {tf.nn.softmax(prediction[0]).numpy().tolist()}")
    print(f"Predicted class: {predicted_class} (0=EASE, 1=HOLD, 2=INCREASE)")

    # Test case 3: Medium performance (should favor HOLD)
    medium_perf = np.array([[0.5, 0.5, 0.5, 0.5, 0.0]], dtype=np.float32)  # medium everything
    prediction = model.predict(medium_perf, verbose=0)
    predicted_class = np.argmax(tf.nn.softmax(prediction[0]))
    print(f"\nMedium performance input: {medium_perf.tolist()}")
    print(f"Predicted logits: {prediction.tolist()}")
    print(f"Predicted probabilities: {tf.nn.softmax(prediction[0]).numpy().tolist()}")
    print(f"Predicted class: {predicted_class} (0=EASE, 1=HOLD, 2=INCREASE)")


def sanity_check_tflite(tflite_model: bytes) -> None:
    """Perform sanity checks on the TFLite model."""
    print("\n=== TFLite Model Sanity Check ===")

    interpreter = tf.lite.Interpreter(model_content=tflite_model)
    interpreter.allocate_tensors()
    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()
    print(f"TFLite input shape: {input_details[0]['shape']}, dtype: {input_details[0]['dtype']}")
    print(f"TFLite output shape: {output_details[0]['shape']}, dtype: {output_details[0]['dtype']}")

    # Test same cases as Keras
    test_cases = [
        ("Strong performance", np.array([[0.9, 0.2, 0.1, 0.9, 0.8]], dtype=np.float32)),
        ("Poor performance", np.array([[0.3, 0.8, 0.9, 0.2, -0.5]], dtype=np.float32)),
        ("Medium performance", np.array([[0.5, 0.5, 0.5, 0.5, 0.0]], dtype=np.float32))
    ]

    for name, input_data in test_cases:
        interpreter.set_tensor(input_details[0]['index'], input_data)
        interpreter.invoke()
        output = interpreter.get_tensor(output_details[0]['index'])
        probabilities = tf.nn.softmax(output[0]).numpy()
        predicted_class = np.argmax(probabilities)
        print(f"{name}:")
        print(f"  Logits: {output.tolist()}")
        print(f"  Probabilities: {probabilities.tolist()}")
        print(f"  Predicted class: {predicted_class} (0=EASE, 1=HOLD, 2=INCREASE)")


# ---------------------------------------------------------------------------
# 6. Main training function
# ---------------------------------------------------------------------------
def main() -> None:
    print("Starting SmritiSetu Adaptive Difficulty ML Engine training...")
    print("=" * 60)

    # Step 1: Generate synthetic patient sessions (per spec section 6)
    print("Step 1: Generating synthetic patient session data...")
    X_raw, y_labels, patient_groups, all_sessions = generate_synthetic_patient_sessions(
        n_patients=120,
        min_sessions_per_patient=25,
        max_sessions_per_patient=80,
        seed=42
    )
    print(f"Generated {len(all_sessions)} sessions from {len(np.unique(patient_groups))} patients")

    # Step 2: Engineer features with per-patient baseline normalization
    print("\nStep 2: Engineering features with per-patient baseline normalization...")
    X_features, y_processed, groups_processed = process_all_sessions_for_features(all_sessions)
    print(f"Engineered {X_features.shape[0]} valid feature vectors")
    print(f"Feature matrix shape: {X_features.shape}")
    print(f"Label distribution: {np.bincount(y_processed)} (EASE, HOLD, INCREASE)")

    # Step 3: Split data using patient-grouped validation while remaining compatible
    # with the installed scikit-learn version (GroupKFold in this version does not
    # accept the shuffle/random_state kwargs used in the original spec).
    print("\nStep 3: Creating train/validation split with patient grouping...")
    gkf = GroupKFoldWithShuffle(n_splits=5, shuffle=True, random_state=42)

    # Use first split for train/validation
    train_idx, val_idx = next(gkf.split(X_features, y_processed, groups_processed))

    X_train, X_val = X_features[train_idx], X_features[val_idx]
    y_train, y_val = y_processed[train_idx], y_processed[val_idx]
    groups_train, groups_val = groups_processed[train_idx], groups_processed[val_idx]

    print(f"Training set: {X_train.shape[0]} samples")
    print(f"Validation set: {X_val.shape[0]} samples")
    print(f"Training label distribution: {np.bincount(y_train)}")
    print(f"Validation label distribution: {np.bincount(y_val)}")

    # Step 4: Build and train the model
    print("\nStep 4: Building and training the classification model...")
    model = build_classification_model()
    print("Model architecture:")
    model.summary()

    # Step 5: Train with temperature scaling
    print("\nStep 5: Training model with temperature scaling...")
    calibrated_model, optimal_temperature = train_with_temperature_scaling(
        model, X_train, y_train, X_val, y_val
    )

    # Step 6: Export model and metadata
    print("\nStep 6: Exporting model and saving metadata...")

    # Export TFLite model (using base model for export, temp scaling handled in service)
    artifact_path = ARTIFACT_DIR / TFLITE_NAME
    tflite_model = export_tflite(model, artifact_path)
    print(f"Saved TFLite model to {artifact_path} ({len(tflite_model)} bytes)")

    # Copy to React Native assets directory
    rn_path = RN_ASSET_DIR / TFLITE_NAME
    shutil.copy2(artifact_path, rn_path)
    print(f"Copied to {rn_path}")

    # Save metadata
    metadata = {
        "model_type": "adaptive_difficulty_classifier",
        "architecture": "5→16→8→3",
        "input_features": [
            "f1 = 2*accuracy - 1",
            "f2 = -(1/5)*clip(z_MAD(RT), -5, 5)",
            "f3 = -(1/5)*clip(z_MAD(hintRate), -5, 5)",
            "f4 = -(1/5)*clip(z_MAD(errorRetry), -5, 5)",
            "f5 = (1/5)*clip(z_MAD(completion), -5, 5)"
        ],
        "output_classes": ["EASE", "HOLD", "INCREASE"],
        "label_mapping": {0: "EASE", 1: "HOLD", 2: "INCREASE"},
        "optimal_temperature": float(optimal_temperature),
        "training_config": {
            "optimizer": "Adam",
            "learning_rate": 1e-3,
            "beta_1": 0.9,
            "beta_2": 0.999,
            "loss": "SparseCategoricalCrossentropy(from_logits=True)",
            "l2_regularization": 1e-4
        },
        "data_info": {
            "n_patients": len(np.unique(groups_processed)),
            "n_sessions": len(all_sessions),
            "n_features": X_features.shape[1],
            "validation_split": "GroupKFold(n_splits=5)"
        }
    }

    metadata_path = ARTIFACT_DIR / METADATA_NAME
    save_metadata(metadata, metadata_path)
    print(f"Saved metadata to {metadata_path}")

    # Step 7: Sanity checks
    print("\nStep 7: Performing sanity checks...")
    sanity_check_keras(model)
    sanity_check_tflite(tflite_model)

    print("\n" + "=" * 60)
    print("Training completed successfully!")
    print(f"Model exported to: {artifact_path}")
    print(f"Optimal temperature: {optimal_temperature:.3f}")


if __name__ == "__main__":
    main()