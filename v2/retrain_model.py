"""Retrain MaternaAI's Random Forest using consented patient readings.

Run while the v2 server is running:
    python retrain_model.py

Set MATERNA_SERVER_URL for a remote server, if needed. The script downloads
only records from patients who explicitly opted into anonymized data sharing.
"""

import io
import os
import pickle

import numpy as np
import pandas as pd
import requests
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder, StandardScaler
from ucimlrepo import fetch_ucirepo

SERVER_URL = os.getenv("MATERNA_SERVER_URL", "http://localhost:8000")
DOCTOR_USERNAME = os.getenv("MATERNA_DOCTOR_USERNAME", "doctor")
DOCTOR_PASSWORD = os.getenv("MATERNA_DOCTOR_PASSWORD", "maternaai2024")
FEATURE_COLS = ["age", "heart_rate", "temperature", "systolic_bp", "diastolic_bp", "blood_sugar"]


def normalize_label(value):
    value = str(value).strip().lower().replace("_", " ")
    return {
        "high": "high risk", "high risk": "high risk",
        "medium": "mid risk", "mid": "mid risk", "mid risk": "mid risk",
        "low": "low risk", "low risk": "low risk",
    }.get(value, value)


def load_uci_data():
    dataset = fetch_ucirepo(id=863)
    frame = pd.concat([dataset.data.features, dataset.data.targets], axis=1)
    frame.columns = [column.strip().lower().replace(" ", "_") for column in frame.columns]
    frame = frame.rename(columns={
        "heartrate": "heart_rate", "bodytemp": "temperature",
        "systolicbp": "systolic_bp", "diastolicbp": "diastolic_bp",
        "bs": "blood_sugar", "risklevel": "risk_level",
    })
    frame["risk_level"] = frame["risk_level"].map(normalize_label)
    return frame[FEATURE_COLS + ["risk_level"]].dropna()


def load_consented_data():
    response = requests.get(
        f"{SERVER_URL.rstrip('/')}/export-training-data",
        auth=(DOCTOR_USERNAME, DOCTOR_PASSWORD),
        timeout=60,
    )
    response.raise_for_status()
    frame = pd.read_csv(io.StringIO(response.text))
    if frame.empty:
        return pd.DataFrame(columns=FEATURE_COLS + ["risk_level"])
    # Age is not exported to preserve the requested de-identified schema.
    # The production RF currently requires age, so consented records use 28,
    # the same neutral default used by server.py when age is unavailable.
    frame["age"] = 28.0
    frame["risk_level"] = frame["risk_level"].map(normalize_label)
    return frame[FEATURE_COLS + ["risk_level"]].dropna()


def main():
    original = load_uci_data()
    consented = load_consented_data()
    combined = pd.concat([original, consented], ignore_index=True).dropna()
    print(f"Original UCI readings: {len(original)}")
    print(f"Consented Materna readings: {len(consented)}")

    train, test = train_test_split(
        original, test_size=0.2, random_state=42, stratify=original["risk_level"]
    )
    training_data = pd.concat([train, consented], ignore_index=True)

    with open("maternal_rf_model.pkl", "rb") as model_file, \
         open("scaler.pkl", "rb") as scaler_file, \
         open("label_encoder.pkl", "rb") as encoder_file:
        old_model = pickle.load(model_file)
        old_scaler = pickle.load(scaler_file)
        old_encoder = pickle.load(encoder_file)

    old_predictions = old_encoder.inverse_transform(old_model.predict(old_scaler.transform(test[FEATURE_COLS])))
    old_accuracy = accuracy_score(test["risk_level"], old_predictions)

    encoder = LabelEncoder()
    y_train = encoder.fit_transform(training_data["risk_level"])
    scaler = StandardScaler()
    x_train = scaler.fit_transform(training_data[FEATURE_COLS].astype(np.float32))
    model = RandomForestClassifier(
        n_estimators=200, max_depth=10, min_samples_split=5,
        min_samples_leaf=2, class_weight="balanced", random_state=42, n_jobs=-1,
    )
    model.fit(x_train, y_train)
    new_predictions = encoder.inverse_transform(model.predict(scaler.transform(test[FEATURE_COLS].astype(np.float32))))
    new_accuracy = accuracy_score(test["risk_level"], new_predictions)

    with open("maternal_rf_model.pkl", "wb") as model_file:
        pickle.dump(model, model_file)
    with open("scaler.pkl", "wb") as scaler_file:
        pickle.dump(scaler, scaler_file)
    with open("label_encoder.pkl", "wb") as encoder_file:
        pickle.dump(encoder, encoder_file)
    with open("feature_cols.pkl", "wb") as columns_file:
        pickle.dump(FEATURE_COLS, columns_file)

    marker = requests.post(
        f"{SERVER_URL.rstrip('/')}/mark-retrained",
        auth=(DOCTOR_USERNAME, DOCTOR_PASSWORD),
        timeout=30,
    )
    marker.raise_for_status()
    print(f"Old model accuracy: {old_accuracy:.1%}")
    print(f"New model accuracy: {new_accuracy:.1%}")
    print("Model artifacts replaced. Restart the server to load the new model.")


if __name__ == "__main__":
    main()
