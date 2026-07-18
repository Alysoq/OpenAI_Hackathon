"""
server.py
----------
MaternaAI v2 backend server.
- Random Forest model for vital signs risk scoring
- Ollama for symptom chat assistant
- FastAPI for the REST API

Run:
    uvicorn server:app --host 0.0.0.0 --port 8000 --reload
"""

from fastapi import FastAPI, HTTPException, Depends, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from pydantic import BaseModel
from typing import Any, Dict, Optional
import sqlite3
import json
import secrets
import pickle
import numpy as np
import requests
from datetime import datetime, timedelta
import statistics
import base64
import os
import shutil
import subprocess
import tempfile

app = FastAPI(title="MaternaAI v2 Server")
security = HTTPBasic()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Credentials ───────────────────────────────────────────────────────────────
DOCTOR_USERNAME = "doctor"
DOCTOR_PASSWORD = "maternaai2024"

# ── Load Random Forest model ──────────────────────────────────────────────────
print("Loading Random Forest model...")
with open("maternal_rf_model.pkl", "rb") as f:
    rf_model = pickle.load(f)
with open("scaler.pkl", "rb") as f:
    scaler = pickle.load(f)
with open("label_encoder.pkl", "rb") as f:
    label_encoder = pickle.load(f)
with open("feature_cols.pkl", "rb") as f:
    feature_cols = pickle.load(f)
print(f"Model loaded. Features: {feature_cols}")

DB_PATH = "maternal_health.db"

# ── Database ──────────────────────────────────────────────────────────────────
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS readings (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id        TEXT NOT NULL,
            patient_name      TEXT NOT NULL,
            gestational_weeks INTEGER,
            timestamp         TEXT NOT NULL,
            heart_rate        REAL,
            spo2              REAL,
            temperature       REAL,
            hrv_rmssd         REAL,
            gsr               REAL,
            motion            REAL,
            ptt               REAL,
            systolic_bp       REAL,
            diastolic_bp      REAL,
            respiration       REAL,
            blood_sugar       REAL,
            fall_detected     INTEGER DEFAULT 0,
            risk_level        TEXT,
            risk_score        REAL,
            rf_confidence     REAL,
            risk_reasons      TEXT
        )
    """)
    # SQLite does not add new columns to an existing table through CREATE TABLE
    # IF NOT EXISTS, so migrate installations created before rf_confidence.
    columns = {
        row["name"] for row in conn.execute("PRAGMA table_info(readings)").fetchall()
    }
    if "rf_confidence" not in columns:
        conn.execute("ALTER TABLE readings ADD COLUMN rf_confidence REAL")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS conversations (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id   TEXT NOT NULL,
            timestamp    TEXT NOT NULL,
            user_message TEXT NOT NULL,
            ai_response  TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS patient_profiles (
            patient_id TEXT PRIMARY KEY,
            data_consent INTEGER NOT NULL DEFAULT 0,
            profile_json TEXT NOT NULL,
            conditions_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS weekly_summaries (
            patient_id TEXT NOT NULL,
            week_start TEXT NOT NULL,
            summary_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            PRIMARY KEY (patient_id, week_start)
        )
    """)
    conn.commit()
    conn.close()

init_db()

# ── Auth ──────────────────────────────────────────────────────────────────────
def verify_doctor(credentials: HTTPBasicCredentials = Depends(security)):
    correct_username = secrets.compare_digest(
        credentials.username, DOCTOR_USERNAME)
    correct_password = secrets.compare_digest(
        credentials.password, DOCTOR_PASSWORD)
    if not (correct_username and correct_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return credentials.username

# ── Data models ───────────────────────────────────────────────────────────────
class SensorData(BaseModel):
    heart_rate:    float
    spo2:          float
    temperature:   float
    hrv_rmssd:     float
    gsr:           float
    motion:        float
    ptt:           Optional[float] = None
    systolic_bp:   Optional[float] = None
    diastolic_bp:  Optional[float] = None
    respiration:   Optional[float] = None
    blood_sugar:   Optional[float] = None
    fall_detected: bool = False

class ReadingPayload(BaseModel):
    patient_id:        str
    patient_name:      str
    gestational_weeks: Optional[int] = None
    timestamp:         str
    sensors:           SensorData

class AssistRequest(BaseModel):
    patient_id: str
    message:    str
    sensors:    Optional[SensorData] = None
    risk_level: Optional[str] = None

class PatientProfilePayload(BaseModel):
    patient_id: str
    data_consent: bool = False
    profile: Dict[str, Any]
    conditions: Dict[str, bool]

def get_patient_conditions(patient_id: Optional[str]) -> Dict[str, bool]:
    if not patient_id:
        return {}
    conn = get_db()
    row = conn.execute(
        "SELECT conditions_json FROM patient_profiles WHERE patient_id = ?",
        (patient_id,),
    ).fetchone()
    conn.close()
    return json.loads(row["conditions_json"]) if row else {}

# ── Random Forest risk scoring ────────────────────────────────────────────────
def score_risk_rf(sensors: SensorData, patient_id: str = None):
    reasons  = []
    score    = 0.0
    rf_confidence = None

    hr   = sensors.heart_rate
    spo2 = sensors.spo2
    temp = sensors.temperature
    sys  = sensors.systolic_bp
    dia  = sensors.diastolic_bp
    bs   = sensors.blood_sugar
    fall = sensors.fall_detected
    resp = sensors.respiration
    hrv  = sensors.hrv_rmssd
    conditions = get_patient_conditions(patient_id)

    if conditions.get("previous_preeclampsia"):
        reasons.append("Previous preeclampsia history: lower BP review threshold applied")
        if (sys and sys >= 130) or (dia and dia >= 85):
            reasons.append("Elevated BP with previous preeclampsia")
            score = max(score, 0.45)
    if conditions.get("high_blood_pressure") and ((sys and sys >= 135) or (dia and dia >= 88)):
        reasons.append("Elevated BP with hypertension history")
        score = max(score, 0.45)
    if conditions.get("heart_condition") and hr > 105:
        reasons.append("Elevated heart rate with cardiac history")
        score = max(score, 0.45)
    if conditions.get("gestational_diabetes") and bs and bs > 7.0:
        reasons.append("Elevated blood sugar with gestational diabetes history")
        score = max(score, 0.45)

    # ── Layer 1: Hard rules ───────────────────────────────────────────────────
    if fall:
        reasons.append("Fall detected")
        score = max(score, 0.95)
    if spo2 < 88:
        reasons.append(f"Critical SpO2: {spo2}%")
        score = max(score, 0.95)
    if temp > 39.0:
        reasons.append(f"High fever: {temp}°C")
        score = max(score, 0.90)
    if hr > 130:
        reasons.append(f"Tachycardia: {hr} bpm")
        score = max(score, 0.85)
    if sys and sys > 160:
        reasons.append(f"Severe hypertension: {sys:.0f} mmHg")
        score = max(score, 0.90)
    if sys and sys > 140:
        dia_str = f"{dia:.0f}" if dia else "?"
        reasons.append(f"High BP: {sys:.0f}/{dia_str} mmHg")
        score = max(score, 0.75)
    if spo2 < 92:
        reasons.append(f"Low SpO2: {spo2}%")
        score = max(score, 0.75)
    if hr > 120 and spo2 < 94:
        reasons.append("High HR + low SpO2 — preeclampsia pattern")
        score = max(score, 0.80)
    if temp > 38.0:
        reasons.append(f"Fever: {temp}°C — possible infection")
        score = max(score, 0.60)
    if hrv < 15:
        reasons.append(f"Very low HRV: {hrv}ms")
        score = max(score, 0.70)
    if resp and resp > 25:
        reasons.append(f"High respiration: {resp} breaths/min")
        score = max(score, 0.65)
    if bs and bs > 7.8:
        reasons.append(f"High blood sugar: {bs} mmol/L")
        score = max(score, 0.60)

    # ── Layer 2: Random Forest prediction ────────────────────────────────────
    try:
        age = 28  # default if not provided
        sys_val = sys if sys else 120.0
        dia_val = dia if dia else 80.0
        bs_val  = bs  if bs  else 5.0
        temp_f  = (temp * 9/5) + 32  # convert C to F for model

        features = np.array([[
            age, sys_val, dia_val, bs_val, temp_f, hr
        ]])
        features_scaled = scaler.transform(features)
        prediction      = rf_model.predict(features_scaled)[0]
        probabilities   = rf_model.predict_proba(features_scaled)[0]
        rf_label        = label_encoder.inverse_transform([prediction])[0]
        rf_confidence   = float(max(probabilities))

        reasons.append(
            f"RF model: {rf_label} ({rf_confidence*100:.0f}% confidence)")

        if rf_label == "high risk":
            score = max(score, 0.85)
        elif rf_label == "mid risk":
            score = max(score, 0.45)

    except Exception as e:
        reasons.append(f"RF model unavailable: {str(e)}")

    # ── Layer 3: Multi signal patterns ───────────────────────────────────────
    if sensors.gsr > 0.75 and temp > 37.8 and hr > 95:
        reasons.append("Dehydration pattern: elevated GSR + temp + HR")
        score = max(score, 0.55)
    if hr > 95 and hrv < 30 and (sensors.ptt and sensors.ptt < 290):
        reasons.append("Early preeclampsia signal: HR↑ + HRV↓ + PTT↓")
        score = max(score, 0.65)
    if sys and dia and sys > 130 and dia > 85 and hr > 95:
        reasons.append("Hypertension + tachycardia — preeclampsia watch")
        score = max(score, 0.70)

    # ── Layer 4: Rapid fluctuation detection ─────────────────────────────────
    if patient_id:
        conn = get_db()
        recent = conn.execute("""
            SELECT heart_rate, spo2, temperature, hrv_rmssd, systolic_bp
            FROM readings
            WHERE patient_id = ?
            ORDER BY timestamp DESC LIMIT 5
        """, (patient_id,)).fetchall()
        conn.close()

        if len(recent) >= 3:
            recent_hrs  = [r["heart_rate"]  for r in recent]
            recent_spo2 = [r["spo2"]        for r in recent]
            recent_sys  = [r["systolic_bp"] for r in recent
                          if r["systolic_bp"]]

            hr_swing  = max(recent_hrs)  - min(recent_hrs)
            spo2_swing = max(recent_spo2) - min(recent_spo2)

            if hr_swing > 20:
                reasons.append(
                    f"Rapid HR fluctuation: {hr_swing:.1f} bpm swing")
                score = max(score, 0.70)
            if spo2_swing > 4:
                reasons.append(
                    f"Rapid SpO2 fluctuation: {spo2_swing:.1f}% swing")
                score = max(score, 0.70)
            if recent_sys and len(recent_sys) >= 3:
                sys_swing = max(recent_sys) - min(recent_sys)
                if sys_swing > 15:
                    reasons.append(
                        f"Rapid BP fluctuation: {sys_swing:.1f} mmHg swing")
                    score = max(score, 0.65)

    # ── Final risk level ──────────────────────────────────────────────────────
    if score >= 0.70:
        level = "HIGH"
    elif score >= 0.35:
        level = "MEDIUM"
    else:
        level = "LOW"
        if not reasons:
            reasons.append("All vitals within normal range")

    return level, round(score, 3), reasons, rf_confidence

def average(values):
    return round(sum(values) / len(values), 2) if values else None

def build_longitudinal_analysis(patient_id: str) -> Dict[str, Any]:
    """Summarize patient trends from readings already persisted in SQLite."""
    conn = get_db()
    rows = conn.execute("""
        SELECT timestamp, gestational_weeks, heart_rate, systolic_bp,
               diastolic_bp, spo2, hrv_rmssd, risk_level, risk_score
        FROM readings WHERE patient_id = ? ORDER BY timestamp ASC
    """, (patient_id,)).fetchall()
    conn.close()
    readings = [dict(row) for row in rows]
    if not readings:
        return {"patient_id": patient_id, "week_by_week_averages": [], "detected_trends": [], "risk_pattern_history": []}

    weekly: Dict[str, Dict[str, list]] = {}
    daily: Dict[str, Dict[str, list]] = {}
    for row in readings:
        timestamp = datetime.fromisoformat(row["timestamp"].replace("Z", "+00:00"))
        week_key = timestamp.date().isoformat() if timestamp.weekday() == 0 else (timestamp - timedelta(days=timestamp.weekday())).date().isoformat()
        day_key = timestamp.date().isoformat()
        for bucket, key in ((weekly, week_key), (daily, day_key)):
            bucket.setdefault(key, {"heart_rate": [], "systolic_bp": [], "spo2": [], "hrv_rmssd": [], "gestational_weeks": []})
            for field in ("heart_rate", "systolic_bp", "spo2", "hrv_rmssd", "gestational_weeks"):
                if row[field] is not None:
                    bucket[key][field].append(row[field])

    week_by_week = [{
        "week_start": key,
        "gestational_week": round(average(values["gestational_weeks"]) or 0),
        "heart_rate": average(values["heart_rate"]),
        "blood_pressure": average(values["systolic_bp"]),
        "spo2": average(values["spo2"]),
        "hrv": average(values["hrv_rmssd"]),
    } for key, values in sorted(weekly.items())]

    recent_days = sorted(daily.items())[-7:]
    trends = []
    labels = {"heart_rate": "HR", "systolic_bp": "BP", "spo2": "SpO2", "hrv_rmssd": "HRV"}
    for field, label in labels.items():
        values = [(day, average(bucket[field])) for day, bucket in recent_days if average(bucket[field]) is not None]
        if len(values) < 4:
            continue
        direction = None
        run = 1
        for index in range(len(values) - 1, 0, -1):
            change = values[index][1] - values[index - 1][1]
            next_direction = "rising" if change > 0 else "falling" if change < 0 else None
            if direction is None:
                direction = next_direction
            if not direction or next_direction != direction:
                break
            run += 1
        if direction and run >= 4:
            trends.append(f"{label} has been {direction} consistently for {run} days")

    baseline = week_by_week[0]
    current = week_by_week[-1]
    baseline_label = f"week {baseline['gestational_week']} baseline" if baseline["gestational_week"] else "start-of-monitoring baseline"
    for field, label in (("heart_rate", "HR"), ("blood_pressure", "BP"), ("spo2", "SpO2"), ("hrv", "HRV")):
        if baseline.get(field) and current.get(field):
            percent = ((current[field] - baseline[field]) / baseline[field]) * 100
            if (field in {"heart_rate", "blood_pressure"} and percent >= 10) or (field in {"spo2", "hrv"} and percent <= -10):
                relation = "above" if percent > 0 else "below"
                trends.append(f"{label} {abs(percent):.0f}% {relation} {baseline_label}")

    risk_history = [{"timestamp": row["timestamp"], "risk_level": row["risk_level"], "risk_score": row["risk_score"]} for row in readings[-50:]]
    return {"patient_id": patient_id, "week_by_week_averages": week_by_week, "detected_trends": trends, "risk_pattern_history": risk_history}

def store_weekly_summary(patient_id: str, analysis: Dict[str, Any]):
    weeks = analysis["week_by_week_averages"]
    if not weeks:
        return
    summary = {"week": weeks[-1], "detected_trends": analysis["detected_trends"]}
    conn = get_db()
    conn.execute("""
        INSERT OR REPLACE INTO weekly_summaries (patient_id, week_start, summary_json, created_at)
        VALUES (?,?,?,?)
    """, (patient_id, weeks[-1]["week_start"], json.dumps(summary), datetime.utcnow().isoformat()))
    conn.commit()
    conn.close()

# ── Ollama symptom assistant ──────────────────────────────────────────────────
MATERNA_SYSTEM_PROMPT = """
You are MaternaAI, a warm and calm maternal health assistant for pregnant women in rural areas. You have access to the patient's live sensor data.

You are always watching for these dangerous pregnancy conditions:
Preeclampsia, Eclampsia, HELLP syndrome, Gestational diabetes, Preterm labor, Placental abruption, DVT, Pulmonary embolism, Cardiac event, Severe anemia, Sepsis, Dehydration, Cholestasis, Hyperemesis gravidarum, Thyroid disorders, UTI, Kidney infection, Stroke, Appendicitis.

This list is not exhaustive — use your full medical knowledge.

Rules:
- 3 sentences maximum
- Plain conversational text only, no bullets or headers
- Warm, calm, reassuring tone
- Never diagnose, only inform and suggest
- Always end with exactly one of: monitor at home / contact your doctor today / seek emergency help immediately
- If sensor data shows HIGH risk always say seek emergency help immediately
- Start with most likely common cause, then mention serious possibilities
- Never dismiss any symptom during pregnancy
"""

def ask_ollama(message: str, sensor_context: str) -> str:
    try:
        prompt = f"{message}.{sensor_context}"
        response = requests.post(
            "http://localhost:11434/api/chat",
            json={
                "model": "maternaai",
                "stream": False,
                "think": False,
                "options": {"temperature": 0.3, "num_predict": 800},
                "messages": [
                {"role": "system", "content": MATERNA_SYSTEM_PROMPT},
                {"role": "user",   "content": prompt}
                ],
            },
        )
        response.raise_for_status()
        result = response.json()
        return result["message"]["content"]
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Ollama error: {str(e)}"
        )

def build_sensor_context(sensors: Optional[SensorData], risk_level: Optional[str]) -> str:
    if not sensors:
        return ""
    bp_str = ""
    resp_str = ""
    if sensors.systolic_bp and sensors.diastolic_bp:
        bp_str = (f"blood pressure {sensors.systolic_bp:.0f}/"
                  f"{sensors.diastolic_bp:.0f} mmHg, ")
    if sensors.respiration:
        resp_str = f"respiration {sensors.respiration} breaths/min, "
    return (
        " Current sensor readings: "
        f"heart rate {sensors.heart_rate} bpm, "
        f"SpO2 {sensors.spo2}%, "
        f"temperature {sensors.temperature}°C, "
        f"HRV {sensors.hrv_rmssd}ms, "
        f"{bp_str}{resp_str}risk level: {risk_level or 'unknown'}."
    )

def save_conversation(patient_id: str, message: str, response: str):
    conn = get_db()
    conn.execute("""
        INSERT INTO conversations
        (patient_id, timestamp, user_message, ai_response)
        VALUES (?,?,?,?)
    """, (patient_id, datetime.utcnow().isoformat(), message, response))
    conn.commit()
    conn.close()

def respond_to_patient(patient_id: str, message: str,
                       sensors: Optional[SensorData], risk_level: Optional[str]) -> str:
    response = ask_ollama(message, build_sensor_context(sensors, risk_level))
    save_conversation(patient_id, message, response)
    return response

def parse_uploaded_sensors(sensors_json: Optional[str]) -> Optional[SensorData]:
    if not sensors_json:
        return None
    try:
        return SensorData(**json.loads(sensors_json))
    except Exception as error:
        raise HTTPException(status_code=422, detail=f"Invalid sensor data: {error}")

def transcribe_uploaded_audio(audio: UploadFile) -> str:
    """Transcribe uploads with SpeechRecognition's Google Web Speech backend.

    Expo commonly records M4A files, so ffmpeg converts non-WAV audio to WAV
    before SpeechRecognition opens it. ffmpeg is only needed for those formats.
    """
    try:
        import speech_recognition as sr
    except ImportError as error:
        raise HTTPException(status_code=503, detail="SpeechRecognition is not installed.") from error

    suffix = os.path.splitext(audio.filename or "recording.m4a")[1] or ".m4a"
    with tempfile.TemporaryDirectory() as temp_dir:
        source_path = os.path.join(temp_dir, f"upload{suffix}")
        wav_path = os.path.join(temp_dir, "recording.wav")
        with open(source_path, "wb") as output:
            output.write(audio.file.read())
        input_path = source_path
        if suffix.lower() not in {".wav", ".aiff", ".aif", ".flac"}:
            try:
                ffmpeg = shutil.which("ffmpeg")
                if not ffmpeg:
                    import imageio_ffmpeg
                    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
                subprocess.run(
                    [ffmpeg, "-y", "-i", source_path, wav_path],
                    check=True, capture_output=True,
                )
            except (ImportError, FileNotFoundError, subprocess.CalledProcessError) as error:
                raise HTTPException(
                    status_code=503,
                    detail="Audio conversion requires ffmpeg or imageio-ffmpeg on the server.",
                ) from error
            input_path = wav_path
        recognizer = sr.Recognizer()
        try:
            with sr.AudioFile(input_path) as source:
                audio_data = recognizer.record(source)
            return recognizer.recognize_google(audio_data)
        except sr.UnknownValueError as error:
            raise HTTPException(status_code=422, detail="Speech could not be understood.") from error
        except sr.RequestError as error:
            raise HTTPException(status_code=503, detail=f"Speech recognition unavailable: {error}") from error

def analyze_uploaded_image(image: UploadFile) -> str:
    image_bytes = image.file.read()
    if not image_bytes:
        raise HTTPException(status_code=422, detail="Image upload is empty.")
    try:
        result = requests.post(
            "http://localhost:11434/api/chat",
            json={
                "model": "llava",
                "stream": False,
                "messages": [{
                    "role": "user",
                    "content": "Describe only visible skin or physical findings relevant to maternal health, such as swelling, rash, color changes, or injury. Do not diagnose.",
                    "images": [base64.b64encode(image_bytes).decode("utf-8")],
                }],
            },
            timeout=90,
        )
        result.raise_for_status()
        return result.json()["message"]["content"]
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Image analysis error: {error}") from error

# ── API endpoints ─────────────────────────────────────────────────────────────
@app.get("/")
def health_check():
    return {"status": "running", "service": "MaternaAI v2 Server"}

@app.post("/ingest")
def ingest_reading(payload: ReadingPayload):
    risk_level, risk_score, reasons, rf_confidence = score_risk_rf(
        payload.sensors, payload.patient_id)

    conn = get_db()
    cursor = conn.execute("""
        INSERT INTO readings
        (patient_id, patient_name, gestational_weeks, timestamp,
         heart_rate, spo2, temperature, hrv_rmssd, gsr, motion, ptt,
         systolic_bp, diastolic_bp, respiration, blood_sugar,
         fall_detected, risk_level, risk_score, rf_confidence, risk_reasons)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    """, (
        payload.patient_id, payload.patient_name,
        payload.gestational_weeks, payload.timestamp,
        payload.sensors.heart_rate, payload.sensors.spo2,
        payload.sensors.temperature, payload.sensors.hrv_rmssd,
        payload.sensors.gsr, payload.sensors.motion, payload.sensors.ptt,
        payload.sensors.systolic_bp, payload.sensors.diastolic_bp,
        payload.sensors.respiration, payload.sensors.blood_sugar,
        int(payload.sensors.fall_detected),
        risk_level, risk_score, rf_confidence, json.dumps(reasons)
    ))
    conn.commit()
    conn.close()

    longitudinal = build_longitudinal_analysis(payload.patient_id)
    trend_warnings = longitudinal["detected_trends"]
    if trend_warnings:
        reasons.extend(trend_warnings)
        risk_score = max(risk_score, 0.45)
        if risk_score >= 0.70:
            risk_level = "HIGH"
        elif risk_score >= 0.35:
            risk_level = "MEDIUM"
        conn = get_db()
        conn.execute(
            "UPDATE readings SET risk_level = ?, risk_score = ?, risk_reasons = ? WHERE id = ?",
            (risk_level, risk_score, json.dumps(reasons), cursor.lastrowid),
        )
        conn.commit()
        conn.close()
    store_weekly_summary(payload.patient_id, longitudinal)

    return {
        "status":     "received",
        "patient_id": payload.patient_id,
        "risk_level": risk_level,
        "risk_score": risk_score,
        "rf_confidence": rf_confidence,
        "reasons":    reasons
    }

@app.post("/patient-profile")
def save_patient_profile(payload: PatientProfilePayload):
    conn = get_db()
    conn.execute("""
        INSERT OR REPLACE INTO patient_profiles
        (patient_id, data_consent, profile_json, conditions_json, updated_at)
        VALUES (?,?,?,?,?)
    """, (
        payload.patient_id,
        int(payload.data_consent),
        json.dumps(payload.profile),
        json.dumps(payload.conditions),
        datetime.utcnow().isoformat(),
    ))
    conn.commit()
    conn.close()
    return {"success": True, "patient_id": payload.patient_id, "data_consent": payload.data_consent}

@app.get("/patient-trends/{patient_id}")
def get_patient_trends(patient_id: str,
                       username: str = Depends(verify_doctor)):
    analysis = build_longitudinal_analysis(patient_id)
    conn = get_db()
    summaries = conn.execute("""
        SELECT week_start, summary_json, created_at FROM weekly_summaries
        WHERE patient_id = ? ORDER BY week_start ASC
    """, (patient_id,)).fetchall()
    conn.close()
    analysis["weekly_summaries"] = [
        {"week_start": row["week_start"], "summary": json.loads(row["summary_json"]), "created_at": row["created_at"]}
        for row in summaries
    ]
    return analysis

@app.get("/patients")
def get_patients(username: str = Depends(verify_doctor)):
    conn = get_db()
    rows = conn.execute("""
        SELECT r.*
        FROM readings r
        INNER JOIN (
            SELECT patient_id, MAX(timestamp) as latest
            FROM readings GROUP BY patient_id
        ) latest ON r.patient_id = latest.patient_id
                    AND r.timestamp = latest.latest
    """).fetchall()
    conn.close()

    patients = []
    for row in rows:
        patients.append({
            "patient_id":        row["patient_id"],
            "patient_name":      row["patient_name"],
            "gestational_weeks": row["gestational_weeks"],
            "timestamp":         row["timestamp"],
            "heart_rate":        row["heart_rate"],
            "spo2":              row["spo2"],
            "temperature":       row["temperature"],
            "hrv_rmssd":         row["hrv_rmssd"],
            "systolic_bp":       row["systolic_bp"],
            "diastolic_bp":      row["diastolic_bp"],
            "respiration":       row["respiration"],
            "risk_level":        row["risk_level"],
            "risk_score":        row["risk_score"],
            "risk_reasons":      json.loads(row["risk_reasons"] or "[]"),
        })

    return {"patients": patients, "count": len(patients)}

@app.get("/history/{patient_id}")
def get_history(patient_id: str, hours: int = 24,
                username: str = Depends(verify_doctor)):
    since = (datetime.utcnow() - timedelta(hours=hours)).isoformat()
    conn  = get_db()
    rows  = conn.execute("""
        SELECT timestamp, heart_rate, spo2, temperature,
               hrv_rmssd, systolic_bp, diastolic_bp,
               respiration, risk_level, risk_score
        FROM readings
        WHERE patient_id = ? AND timestamp > ?
        ORDER BY timestamp ASC
    """, (patient_id, since)).fetchall()
    conn.close()

    return {
        "patient_id": patient_id,
        "hours":      hours,
        "readings":   [dict(r) for r in rows]
    }

@app.get("/evals/{patient_id}")
def get_patient_evals(patient_id: str,
                      username: str = Depends(verify_doctor)):
    seven_days_ago = (datetime.utcnow() - timedelta(days=7)).isoformat()
    one_day_ago = (datetime.utcnow() - timedelta(hours=24)).isoformat()
    conn = get_db()

    summary = conn.execute("""
        SELECT
            AVG(rf_confidence) AS average_rf_confidence,
            COUNT(*) AS total_readings,
            SUM(CASE WHEN risk_level = 'HIGH' THEN 1 ELSE 0 END) AS high_risk_readings,
            SUM(CASE WHEN risk_level = 'MEDIUM' THEN 1 ELSE 0 END) AS medium_risk_readings,
            SUM(CASE WHEN risk_level = 'LOW' THEN 1 ELSE 0 END) AS low_risk_readings
        FROM readings
        WHERE patient_id = ? AND timestamp >= ?
    """, (patient_id, seven_days_ago)).fetchone()
    uncertain = conn.execute("""
        SELECT timestamp, risk_score, risk_level, risk_reasons
        FROM readings
        WHERE patient_id = ? AND timestamp >= ?
          AND risk_score BETWEEN 0.60 AND 0.75
        ORDER BY timestamp DESC
    """, (patient_id, seven_days_ago)).fetchall()
    trend = conn.execute("""
        SELECT timestamp, risk_score, risk_level, rf_confidence
        FROM readings
        WHERE patient_id = ?
        ORDER BY timestamp DESC LIMIT 50
    """, (patient_id,)).fetchall()
    low_confidence = conn.execute("""
        SELECT EXISTS(
            SELECT 1 FROM readings
            WHERE patient_id = ? AND timestamp >= ? AND rf_confidence < 0.70
        ) AS has_low_confidence
    """, (patient_id, one_day_ago)).fetchone()["has_low_confidence"]
    conn.close()

    return {
        "patient_id": patient_id,
        "average_rf_confidence": summary["average_rf_confidence"],
        "total_readings": summary["total_readings"],
        "high_risk_readings": summary["high_risk_readings"] or 0,
        "medium_risk_readings": summary["medium_risk_readings"] or 0,
        "low_risk_readings": summary["low_risk_readings"] or 0,
        "uncertain_readings": [
            {
                "timestamp": row["timestamp"],
                "risk_score": row["risk_score"],
                "risk_level": row["risk_level"],
                "reasons": json.loads(row["risk_reasons"] or "[]"),
            }
            for row in uncertain
        ],
        "confidence_trend": [dict(row) for row in reversed(trend)],
        "has_low_confidence_last_24h": bool(low_confidence),
    }

@app.post("/assist")
def ai_assist(request: AssistRequest):
    ai_response = respond_to_patient(
        request.patient_id, request.message, request.sensors, request.risk_level
    )

    return {
        "status":     "success",
        "response":   ai_response,
        "patient_id": request.patient_id
    }

@app.post("/transcribe")
def transcribe_and_assist(
    audio: UploadFile = File(...),
    patient_id: str = Form(...),
    risk_level: Optional[str] = Form(None),
    sensors_json: Optional[str] = Form(None),
):
    transcript = transcribe_uploaded_audio(audio)
    response = respond_to_patient(
        patient_id, transcript, parse_uploaded_sensors(sensors_json), risk_level
    )
    return {
        "patient_id": patient_id,
        "transcript": transcript,
        "response": response,
    }

@app.post("/analyze-image")
def analyze_image_and_assist(
    image: UploadFile = File(...),
    patient_id: str = Form(...),
    risk_level: Optional[str] = Form(None),
    sensors_json: Optional[str] = Form(None),
):
    description = analyze_uploaded_image(image)
    message = f"The patient shared an image. Visible findings: {description}"
    response = respond_to_patient(
        patient_id, message, parse_uploaded_sensors(sensors_json), risk_level
    )
    return {
        "patient_id": patient_id,
        "description": description,
        "response": response,
    }

@app.get("/conversations/{patient_id}")
def get_conversations(patient_id: str,
                      username: str = Depends(verify_doctor)):
    conn = get_db()
    rows = conn.execute("""
        SELECT timestamp, user_message, ai_response
        FROM conversations
        WHERE patient_id = ?
        ORDER BY timestamp DESC LIMIT 20
    """, (patient_id,)).fetchall()
    conn.close()

    return {
        "patient_id":    patient_id,
        "conversations": [dict(r) for r in rows]
    }
