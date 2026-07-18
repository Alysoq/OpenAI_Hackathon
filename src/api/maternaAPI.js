import {
  BASE_HEADERS,
  DOCTOR_HEADERS,
  MATERNA_URL,
} from '../config/config';

const reportedApiIssues = new Set();
const MULTIPART_HEADERS = { "ngrok-skip-browser-warning": "true" };

function logApiIssueOnce(key, message) {
  if (reportedApiIssues.has(key)) return;
  reportedApiIssues.add(key);
  // console.log appears in the development terminal without opening an
  // intrusive Expo error overlay on the patient's phone.
  console.log(`[Materna API] ${message}`);
}

export const sendSensorData = async (patientId, patientName, weeks, sensors) => {
  try {
    const response = await fetch(`${MATERNA_URL}/ingest`, {
      method: 'POST',
      headers: BASE_HEADERS,
      body: JSON.stringify({
        patient_id:        patientId,
        patient_name:      patientName,
        gestational_weeks: weeks,
        timestamp:         new Date().toISOString(),
        sensors: {
          heart_rate:    sensors.heartRate,
          spo2:          sensors.spO2,
          temperature:   sensors.temperature,
          hrv_rmssd:     sensors.hrv,
          gsr:           sensors.gsr,
          motion:        sensors.motion,
          ptt:           sensors.ptt   || null,
          fall_detected: sensors.fall  || false
        }
      })
    });
    return await response.json();
  } catch (error) {
    logApiIssueOnce('sendSensorData', 'Sensor server is currently unavailable.');
    return null;
  }
};

export const savePatientProfile = async (patientId, profile) => {
  try {
    const response = await fetch(`${MATERNA_URL}/patient-profile`, {
      method: "POST",
      headers: BASE_HEADERS,
      body: JSON.stringify({
        patient_id: patientId,
        data_consent: profile.dataConsent === true,
        profile,
        conditions: {
          diabetes: profile.hasDiabetes,
          gestational_diabetes: profile.hasGestationalDiabetes,
          high_blood_pressure: profile.hasHighBP,
          previous_preeclampsia: profile.hasPreviousPreeclampsia,
          heart_condition: profile.hasHeartCondition,
          thyroid_disorder: profile.hasThyroidDisorder,
          anemia: profile.hasAnemia,
          obesity: profile.hasObesity,
        },
      }),
    });
    if (!response.ok) throw new Error(`Patient profile request failed with status ${response.status}`);
    return await response.json();
  } catch (error) {
    logApiIssueOnce("savePatientProfile", "Patient profile could not reach the server.");
    return null;
  }
};

export const askAssistant = async (patientId, message, currentSensors, riskLevel) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);

  try {
    const response = await fetch(`${MATERNA_URL}/assist`, {
      method: 'POST',
      headers: BASE_HEADERS,
      signal: controller.signal,
      body: JSON.stringify({
        patient_id: patientId,
        message:    message,
        risk_level: riskLevel,
        sensors: currentSensors ? {
          heart_rate:  currentSensors.heartRate,
          spo2:        currentSensors.spO2,
          temperature: currentSensors.temperature,
          hrv_rmssd:   currentSensors.hrv,
          gsr:         currentSensors.gsr,
          motion:      currentSensors.motion
        } : null
      })
    });

    if (!response.ok) {
      throw new Error(`Assistant request failed with status ${response.status}`);
    }

    const result = await response.json();
    return result.response || result.reply || result.message || null;
  } catch (error) {
    if (error?.name === 'AbortError') {
      logApiIssueOnce('askAssistant-timeout', 'Assistant request timed out.');
    } else {
      logApiIssueOnce('askAssistant', 'Assistant server is currently unavailable.');
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

function appendMultimodalContext(formData, patientId, currentSensors, riskLevel) {
  formData.append("patient_id", patientId);
  formData.append("risk_level", riskLevel || "unknown");
  if (currentSensors) {
    formData.append("sensors_json", JSON.stringify({
      heart_rate: currentSensors.heartRate,
      spo2: currentSensors.spO2,
      temperature: currentSensors.temperature,
      hrv_rmssd: currentSensors.hrv,
      gsr: currentSensors.gsr,
      motion: currentSensors.motion,
      ptt: currentSensors.ptt || null,
      systolic_bp: currentSensors.systolicBp || null,
      diastolic_bp: currentSensors.diastolicBp || null,
      respiration: currentSensors.respiration || null,
      blood_sugar: currentSensors.bloodSugar || null,
      fall_detected: currentSensors.fall || false,
    }));
  }
}

export const transcribeAudio = async (patientId, audioUri, currentSensors, riskLevel) => {
  const url = `${MATERNA_URL}/transcribe`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);
  try {
    console.log("[Materna API] transcribeAudio audio URI", audioUri);
    console.log("[Materna API] transcribeAudio request", { url, patientId, audioUri, riskLevel });
    const formData = new FormData();
    formData.append("audio", {
      uri: audioUri,
      name: "recording.m4a",
      type: "audio/m4a",
    });
    appendMultimodalContext(formData, patientId, currentSensors, riskLevel);
    const response = await fetch(url, {
      method: "POST",
      headers: MULTIPART_HEADERS,
      body: formData,
      signal: controller.signal,
    });
    const responseText = await response.text();
    console.log("[Materna API] transcribeAudio response", {
      url,
      status: response.status,
      ok: response.ok,
      body: responseText,
    });
    if (!response.ok) throw new Error(`Transcription request failed with status ${response.status}: ${responseText}`);
    return JSON.parse(responseText);
  } catch (error) {
    const message = error?.message || String(error);
    console.log("[Materna API] transcribeAudio error", {
      url,
      message,
      error: String(error),
    });
    logApiIssueOnce("transcribeAudio", "Voice transcription service is currently unavailable.");
    return { error: message };
  } finally {
    clearTimeout(timeout);
  }
};

export const analyzeImage = async (patientId, imageUri, currentSensors, riskLevel, file = {}) => {
  const url = `${MATERNA_URL}/analyze-image`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);
  try {
    console.log("[Materna API] analyzeImage request", { url, patientId, imageUri, riskLevel });
    const formData = new FormData();
    formData.append("image", {
      uri: imageUri,
      name: file.name || "materna-photo.jpg",
      type: file.type || "image/jpeg",
    });
    appendMultimodalContext(formData, patientId, currentSensors, riskLevel);
    const response = await fetch(url, {
      method: "POST",
      headers: MULTIPART_HEADERS,
      body: formData,
      signal: controller.signal,
    });
    const responseText = await response.text();
    console.log("[Materna API] analyzeImage response", {
      url,
      status: response.status,
      ok: response.ok,
      body: responseText,
    });
    if (!response.ok) throw new Error(`Image analysis request failed with status ${response.status}: ${responseText}`);
    return JSON.parse(responseText);
  } catch (error) {
    console.log("[Materna API] analyzeImage error", {
      url,
      message: error?.message || String(error),
      error: String(error),
    });
    logApiIssueOnce("analyzeImage", "Image analysis service is currently unavailable.");
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

export const getAllPatients = async () => {
  try {
    const response = await fetch(`${MATERNA_URL}/patients`, {
      method:  'GET',
      headers: DOCTOR_HEADERS
    });
    const result = await response.json();
    return result.patients;
  } catch (error) {
    logApiIssueOnce('getAllPatients', 'Patient list could not be refreshed.');
    return [];
  }
};

export const getPatientHistory = async (patientId, hours = 24) => {
  try {
    const response = await fetch(
      `${MATERNA_URL}/history/${patientId}?hours=${hours}`, {
      method:  'GET',
      headers: DOCTOR_HEADERS
    });
    const result = await response.json();
    return result.readings;
  } catch (error) {
    logApiIssueOnce('getPatientHistory', 'Patient history could not be refreshed.');
    return [];
  }
};

export const getPatientEvals = async (patientId) => {
  try {
    const response = await fetch(`${MATERNA_URL}/evals/${patientId}`, {
      method: 'GET',
      headers: DOCTOR_HEADERS,
    });
    if (!response.ok) {
      throw new Error(`Evaluation request failed with status ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    logApiIssueOnce('getPatientEvals', 'Model evaluation data could not be refreshed.');
    return null;
  }
};

export const getPatientConversations = async (patientId) => {
  try {
    const response = await fetch(
      `${MATERNA_URL}/conversations/${patientId}`, {
      method:  'GET',
      headers: DOCTOR_HEADERS
    });
    const result = await response.json();
    return result.conversations;
  } catch (error) {
    logApiIssueOnce('getPatientConversations', 'Patient conversations could not be refreshed.');
    return [];
  }
};

export const shareProfileReport = async (report) => {
  try {
    const response = await fetch(`${MATERNA_URL}/reports`, {
      method: 'POST',
      headers: BASE_HEADERS,
      body: JSON.stringify(report)
    });

    if (!response.ok) {
      throw new Error(`Report upload failed with status ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    logApiIssueOnce('shareProfileReport', 'Profile report could not reach the doctor server.');
    return null;
  }
};

export const getSharedReports = async () => {
  try {
    const response = await fetch(`${MATERNA_URL}/reports`, {
      method: 'GET',
      headers: DOCTOR_HEADERS
    });

    if (!response.ok) {
      throw new Error(`Report request failed with status ${response.status}`);
    }

    const result = await response.json();
    return result.reports || [];
  } catch (error) {
    // The doctor dashboard polls this endpoint. A temporarily offline server
    // should not repeatedly surface the same development error to the user.
    return null;
  }
};

export const sendEmergencyAlert = async (alert) => {
  try {
    const response = await fetch(`${MATERNA_URL}/emergency-alerts`, {
      method: 'POST',
      headers: BASE_HEADERS,
      body: JSON.stringify(alert)
    });
    if (response.ok) return await response.json();

    if (response.status === 404) {
      const fallbackResponse = await fetch(`${MATERNA_URL}/assist`, {
        method: 'POST',
        headers: BASE_HEADERS,
        body: JSON.stringify({
          patient_id: alert.patient_id,
          message: `[MATERNA_EMERGENCY]${JSON.stringify({
            patient_name: alert.patient_name,
            pregnancy_week: alert.pregnancy_week,
            location: alert.location,
            activated_at: new Date().toISOString()
          })}`,
          risk_level: 'RED',
          sensors: null
        })
      });
      if (!fallbackResponse.ok) return null;
      return { success: true, fallback: 'conversation' };
    }

    return null;
  } catch {
    return null;
  }
};

export const getEmergencyAlerts = async () => {
  try {
    const response = await fetch(`${MATERNA_URL}/emergency-alerts`, {
      method: 'GET',
      headers: DOCTOR_HEADERS
    });
    if (response.ok) {
      const result = await response.json();
      return result.alerts || [];
    }

    if (response.status === 404) {
      const fallbackResponse = await fetch(
        `${MATERNA_URL}/conversations/patient_001`,
        {
          method: 'GET',
          headers: DOCTOR_HEADERS
        }
      );
      if (!fallbackResponse.ok) return null;
      const result = await fallbackResponse.json();
      const now = Date.now();
      return (result.conversations || [])
        .filter((item) =>
          item.user_message?.startsWith('[MATERNA_EMERGENCY]')
        )
        .map((item) => {
          const raw = item.user_message.replace('[MATERNA_EMERGENCY]', '');
          let details = {};
          try {
            details = JSON.parse(raw);
          } catch {
            details = {};
          }
          return {
            id: `conversation-emergency-${item.timestamp}`,
            patient_id: 'patient_001',
            patient_name: details.patient_name || 'Maya Johnson',
            pregnancy_week: details.pregnancy_week || null,
            location: details.location || 'Location unavailable',
            created_at: details.activated_at || item.timestamp,
            status: 'active',
            source: 'conversation'
          };
        })
        .filter((item) => {
          const createdAt = new Date(item.created_at).getTime();
          return Number.isFinite(createdAt) && now - createdAt < 60 * 60 * 1000;
        });
    }

    return null;
  } catch {
    return null;
  }
};

export const acknowledgeEmergencyAlert = async (alertId) => {
  try {
    const response = await fetch(
      `${MATERNA_URL}/emergency-alerts/${alertId}/acknowledge`,
      {
        method: 'POST',
        headers: DOCTOR_HEADERS
      }
    );
    return response.ok;
  } catch {
    return false;
  }
};
