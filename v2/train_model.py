"""
train_model.py
---------------
Trains a Random Forest model on the UCI Maternal Health Risk dataset.
Saves the trained model to maternal_rf_model.pkl for use in server.py

Run:
    python train_model.py

Output:
    maternal_rf_model.pkl  → trained model
    scaler.pkl             → data normalizer
"""

import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.metrics import classification_report, accuracy_score
import pickle
from ucimlrepo import fetch_ucirepo

# ── 1. Download UCI Maternal Health Risk dataset ───────────────────────────────
print("Downloading UCI Maternal Health Risk dataset...")
dataset = fetch_ucirepo(id=863)
X = dataset.data.features
y = dataset.data.targets
df = pd.concat([X, y], axis=1)
print(f"Downloaded: {len(df)} patients, {len(df.columns)} features")
print(f"Columns: {list(df.columns)}")

# ── 2. Clean and prepare ───────────────────────────────────────────────────────
df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]
df = df.dropna()

# Rename columns to match our sensor names
rename_map = {
    "heartrate":  "heart_rate",
    "bodytemp":   "temperature",
    "systolicbp": "systolic_bp",
    "diastolicbp":"diastolic_bp",
    "bs":         "blood_sugar",
    "risklevel":  "risk_level",
}
df = df.rename(columns=rename_map)

print(f"\nRisk distribution:")
print(df["risk_level"].value_counts())

# ── 3. Encode labels ───────────────────────────────────────────────────────────
le = LabelEncoder()
df["risk_encoded"] = le.fit_transform(df["risk_level"])
print(f"\nLabel encoding: {dict(zip(le.classes_, le.transform(le.classes_)))}")

# ── 4. Features ────────────────────────────────────────────────────────────────
feature_cols = [
    "age",
    "heart_rate",
    "temperature",
    "systolic_bp",
    "diastolic_bp",
    "blood_sugar"
]

X = df[feature_cols].values.astype(np.float32)
y = df["risk_encoded"].values.astype(np.int64)

# ── 5. Normalize ───────────────────────────────────────────────────────────────
scaler = StandardScaler()
X = scaler.fit_transform(X)

# ── 6. Train test split ────────────────────────────────────────────────────────
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)
print(f"\nTrain: {len(X_train)} samples, Test: {len(X_test)} samples")

# ── 7. Train Random Forest ─────────────────────────────────────────────────────
print("\nTraining Random Forest...")
model = RandomForestClassifier(
    n_estimators=200,      # 200 decision trees
    max_depth=10,          # max depth per tree
    min_samples_split=5,
    min_samples_leaf=2,
    class_weight="balanced", # handles class imbalance
    random_state=42,
    n_jobs=-1              # use all CPU cores
)
model.fit(X_train, y_train)

# ── 8. Evaluate ────────────────────────────────────────────────────────────────
y_pred = model.predict(X_test)
accuracy = accuracy_score(y_test, y_pred)
print(f"\nAccuracy: {accuracy * 100:.1f}%")
print("\nClassification Report:")
print(classification_report(y_test, y_pred, target_names=le.classes_))

# Feature importance
importances = model.feature_importances_
print("\nFeature importances:")
for feat, imp in sorted(zip(feature_cols, importances),
                         key=lambda x: x[1], reverse=True):
    print(f"  {feat:<15} {imp:.3f}")

# ── 9. Save model ──────────────────────────────────────────────────────────────
with open("maternal_rf_model.pkl", "wb") as f:
    pickle.dump(model, f)

with open("scaler.pkl", "wb") as f:
    pickle.dump(scaler, f)

with open("label_encoder.pkl", "wb") as f:
    pickle.dump(le, f)

with open("feature_cols.pkl", "wb") as f:
    pickle.dump(feature_cols, f)

print("\nModel saved to maternal_rf_model.pkl")
print("Scaler saved to scaler.pkl")
print("Label encoder saved to label_encoder.pkl")
print("Feature columns saved to feature_cols.pkl")
print("\nDone! Run server.py to start the API.")
