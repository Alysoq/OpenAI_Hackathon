import Button from "../components/Button";
import React, { useEffect, useState } from "react";
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  StyleSheet,
  } from "react-native";
import AnimatedWave from "../components/AnimatedWave";
import { scenarios } from "../data/sampleSensorData";
import type { RiskLevel, SensorData } from "../data/sampleSensorData";
import { Sparkles, Sun, Moon } from "lucide-react-native";
import { DEMO_MODE } from "../config/config";
import { getPatientHistory } from "../api/maternaAPI";

type HomeScreenProps = {
  theme: "dark" | "light";
  toggleTheme: () => void;
  onAskMaterna: () => void;
  activeScenario: RiskLevel;
  onScenarioChange: (level: RiskLevel) => void;
  patientId: string;
};

type LiveReading = {
  heart_rate: number | null;
  spo2: number | null;
  temperature: number | null;
  systolic_bp: number | null;
  diastolic_bp: number | null;
  respiration: number | null;
  hrv_rmssd: number | null;
  risk_level: string | null;
};

const DEMO_NORMAL = {
  heart_rate: 88, spo2: 97, temperature: 98.6, systolic_bp: 118,
  diastolic_bp: 76, respiration: 16, hrv: 42,
};
const DEMO_HIGH = {
  heart_rate: 118, spo2: 91, temperature: 100.4, systolic_bp: 158,
  diastolic_bp: 102, respiration: 24, hrv: 21,
};

function interpolateDemoVitals(progress: number) {
  const p = Math.max(0, Math.min(1, progress));
  const value = (key: keyof typeof DEMO_NORMAL) =>
    DEMO_NORMAL[key] + (DEMO_HIGH[key] - DEMO_NORMAL[key]) * p;

  return {
    heartRate: Math.round(value("heart_rate")),
    oxygen: Math.round(value("spo2")),
    temperature: Number(value("temperature").toFixed(1)),
    systolic: Math.round(value("systolic_bp")),
    diastolic: Math.round(value("diastolic_bp")),
    respiration: Math.round(value("respiration")),
    hrv: Math.round(value("hrv")),
  };
}

function dataFromVitals(values: ReturnType<typeof interpolateDemoVitals>, riskLevel: "LOW" | "MEDIUM" | "HIGH"): SensorData {
  const isHigh = riskLevel === "HIGH";
  const isMedium = riskLevel === "MEDIUM";
  const color = isHigh ? "#EF4444" : isMedium ? "#EAB308" : "#22C55E";
  const status = isHigh ? "danger" : isMedium ? "warning" : "normal";

  return {
    bracelet: { connected: true, battery: 84, lastSynced: "just now" },
    mother: { name: "Maya", pregnancyWeek: 28 },
    vitals: {
      heartRate: { title: "Heart rate", value: String(values.heartRate), unit: "bpm", status },
      hrv: { title: "HRV", value: String(values.hrv), unit: "ms", status },
      bloodPressure: { title: "Blood pressure", value: `${values.systolic}/${values.diastolic}`, unit: "mmHg", status },
      oxygen: { title: "Oxygen SpO₂", value: String(values.oxygen), unit: "%", status },
      skinTemp: { title: "Skin temp", value: String(values.temperature), unit: "°F", status },
      respiration: { title: "Respiration", value: String(values.respiration), unit: "/min", status },
    },
    risk: {
      level: isHigh ? "Red" : isMedium ? "Yellow" : "Green",
      message: isHigh ? "Critical vitals" : isMedium ? "Vitals changing" : "All clear",
      confidence: isHigh ? "95%" : isMedium ? "88%" : "97%",
      color,
      headline: isHigh ? "Seek emergency care now." : isMedium ? "Vitals are trending upward." : "Everything looks healthy.",
      description: isHigh
        ? "Your blood pressure, heart rate, and oxygen level indicate a possible preeclampsia emergency."
        : isMedium
          ? "Your vitals are moving away from your normal range. Materna is monitoring the pattern closely."
          : "Materna sees stable vitals in your normal range.",
      pattern: isHigh ? "Severe hypertension + low oxygen" : null,
      action: isHigh ? "Seek emergency help immediately." : isMedium ? "Continue monitoring closely." : "No action needed",
    },
  };
}

function dataFromLiveReading(reading: LiveReading): SensorData {
  const riskLevel = (reading.risk_level || "LOW").toUpperCase();
  return dataFromVitals({
    heartRate: reading.heart_rate ?? 0,
    oxygen: reading.spo2 ?? 0,
    temperature: reading.temperature ?? 0,
    systolic: reading.systolic_bp ?? 0,
    diastolic: reading.diastolic_bp ?? 0,
    respiration: reading.respiration ?? 0,
    hrv: reading.hrv_rmssd ?? 0,
  }, riskLevel === "HIGH" ? "HIGH" : riskLevel === "MEDIUM" ? "MEDIUM" : "LOW");
}

function VitalCard({
  title, value, unit, theme, status,
}: {
  title: string; value: string; unit: string;
  theme: "dark" | "light"; status: string;
}) {
  const isDark = theme === "dark";
  const cardBg = isDark ? "#101418" : "#FFFFFF";
  const border = isDark ? "#242B33" : "#E2E8F0";
  const textColor = isDark ? "#F8FAFC" : "#0F172A";
  const mutedColor = isDark ? "#94A3B8" : "#64748B";
  const dotColor =
    status === "danger" ? "#EF4444" :
    status === "warning" ? "#EAB308" : "#22C55E";

  return (
    <View style={[vitalStyles.card, { backgroundColor: cardBg, borderColor: border }]}>
      <View style={vitalStyles.cardTop}>
        <Text style={[vitalStyles.title, { color: mutedColor }]}>{title}</Text>
        <View style={[vitalStyles.dot, { backgroundColor: dotColor }]} />
      </View>
      <View style={vitalStyles.valueRow}>
        <Text style={[vitalStyles.value, { color: textColor }]}>{value}</Text>
        <Text style={[vitalStyles.unit, { color: mutedColor }]}> {unit}</Text>
      </View>
      <AnimatedWave color={dotColor} />
    </View>
  );
}

const vitalStyles = StyleSheet.create({
  card: { flex: 1, borderWidth: 1, borderRadius: 16, padding: 14, margin: 5 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 12, fontWeight: "600" },
  dot: { width: 8, height: 8, borderRadius: 4 },
  valueRow: { flexDirection: "row", alignItems: "baseline", marginTop: 6 },
  value: { fontSize: 26, fontWeight: "900" },
  unit: { fontSize: 12 },
});

export default function HomeScreen({
  theme,
  toggleTheme,
  onAskMaterna,
  activeScenario,
  onScenarioChange,
  patientId,
}: HomeScreenProps) {
  const isDark = theme === "dark";
  const [demoProgress, setDemoProgress] = useState(0);
  const [liveReading, setLiveReading] = useState<LiveReading | null>(null);

  useEffect(() => {
    if (!DEMO_MODE) return;

    // Eight seconds of stable readings, followed by 15 seconds of changes.
    // Transition values update every two seconds and finish exactly at HIGH risk.
    let transitionInterval: ReturnType<typeof setInterval> | undefined;
    let finishTransition: ReturnType<typeof setTimeout> | undefined;
    const transitionStart = setTimeout(() => {
      const startedAt = Date.now();
      const updateProgress = () => {
        setDemoProgress(Math.min((Date.now() - startedAt) / 15000, 1));
      };
      updateProgress();
      transitionInterval = setInterval(updateProgress, 2000);
      finishTransition = setTimeout(() => {
        setDemoProgress(1);
        if (transitionInterval) clearInterval(transitionInterval);
      }, 15000);
    }, 8000);

    return () => {
      clearTimeout(transitionStart);
      if (transitionInterval) clearInterval(transitionInterval);
      if (finishTransition) clearTimeout(finishTransition);
    };
  }, []);

  useEffect(() => {
    if (DEMO_MODE) return;

    let isMounted = true;
    const loadLatestReading = async () => {
      const readings = await getPatientHistory(patientId, 24);
      const latest = readings?.[readings.length - 1];
      if (isMounted && latest) setLiveReading(latest);
    };

    loadLatestReading();
    const interval = setInterval(loadLatestReading, 5000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [patientId]);

  const demoRiskLevel = demoProgress >= 1 ? "HIGH" : demoProgress > 0 ? "MEDIUM" : "LOW";
  const data = DEMO_MODE
    ? dataFromVitals(interpolateDemoVitals(demoProgress), demoRiskLevel)
    : liveReading ? dataFromLiveReading(liveReading) : scenarios[activeScenario];

  const colors = {
    background: isDark ? "#05070A" : "#F8FAFC",
    card: isDark ? "#101418" : "#FFFFFF",
    border: isDark ? "#242B33" : "#E2E8F0",
    text: isDark ? "#F8FAFC" : "#0F172A",
    mutedText: isDark ? "#94A3B8" : "#64748B",
    softText: isDark ? "#CBD5E1" : "#475569",
  };

  const riskColor = data.risk.color;
  const vitals = data.vitals;

  const riskCardBg =
    activeScenario === "Red" ? (isDark ? "#1a0505" : "#fff5f5") :
    activeScenario === "Yellow" ? (isDark ? "#1a1505" : "#fffbeb") :
    (isDark ? "#101418" : "#FFFFFF");

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>

          {/* Top row — bracelet status + theme toggle */}
          <View style={styles.topRow}>
            <View style={styles.braceletStatus}>
              <View style={[styles.connectedDot, { backgroundColor: "#22C55E" }]} />
              <Text style={[styles.braceletText, { color: colors.mutedText }]}>
            {DEMO_MODE ? "Demo vitals · local only" : `Bracelet connected · ${data.bracelet.lastSynced}`}
              </Text>
            </View>
            <Button
              onPress={toggleTheme}
              style={[styles.themeButton, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              {isDark ? <Sun size={14} color={colors.text} /> : <Moon size={14} color={colors.text} />}
              <Text style={[styles.themeButtonText, { color: colors.text }]}>
                {isDark ? "Light" : "Dark"}
              </Text>
            </Button>
          </View>

          {/* Brand row */}
          <View style={styles.brandRow}>
            <View style={[styles.brandDot, { backgroundColor: riskColor }]} />
            <Text style={[styles.brand, { color: colors.text }]}>MATERNA</Text>
            <Text style={[styles.week, { color: colors.mutedText }]}>
              {data.mother.name} · Week {data.mother.pregnancyWeek}
            </Text>
          </View>

          {/* Scenario controls only apply outside the self-running local demo. */}
          {!DEMO_MODE && (
            <View style={styles.dotSwitcher}>
              {(["Green", "Yellow", "Red"] as RiskLevel[]).map((level) => (
                <Button
                  key={level}
                  onPress={() => onScenarioChange(level)}
                  style={[
                    styles.switcherDot,
                    {
                      backgroundColor: scenarios[level].risk.color,
                      width: activeScenario === level ? 28 : 10,
                      opacity: activeScenario === level ? 1 : 0.4,
                    },
                  ]}
                />
              ))}
            </View>
          )}

          {DEMO_MODE && demoRiskLevel === "HIGH" && (
            <View style={styles.criticalAlert}>
              <Text style={styles.criticalAlertText}>
                ⚠️ Critical vitals detected — possible preeclampsia. Seek emergency help immediately.
              </Text>
            </View>
          )}

          {/* Risk card */}
          <View style={[
            styles.statusCard,
            { backgroundColor: riskCardBg, borderColor: colors.border, borderLeftColor: riskColor },
          ]}>
            <View style={styles.statusTopRow}>
              <View style={[styles.statusPill, { backgroundColor: riskColor + "22", borderColor: riskColor }]}>
                <View style={[styles.statusDot, { backgroundColor: riskColor }]} />
                <Text style={[styles.statusText, { color: riskColor }]}>
                  {data.risk.message}
                </Text>
              </View>
              <Text style={[styles.confidence, { color: colors.mutedText }]}>
                AI confidence {data.risk.confidence}
              </Text>
            </View>

            <Text style={[styles.heroTitle, { color: colors.text }]}>{data.risk.headline}</Text>
            <Text style={[styles.heroBody, { color: colors.softText }]}>{data.risk.description}</Text>

            {data.risk.pattern && (
              <View style={[styles.patternRow, { borderColor: colors.border }]}>
                <View style={[styles.patternBadge, { borderColor: riskColor }]}>
                  <Text style={[styles.patternLabel, { color: riskColor }]}>PATTERN</Text>
                </View>
                <Text style={[styles.patternText, { color: riskColor }]}>{data.risk.pattern}</Text>
              </View>
            )}

            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <Text style={[styles.smallLabel, { color: colors.mutedText }]}>WHAT HAPPENS</Text>
            <Text style={[styles.actionText, { color: colors.text }]}>{data.risk.action}</Text>
          </View>

          {/* Vitals header + Ask Materna on same row */}
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>What the band is sensing</Text>
            <Button
              onPress={onAskMaterna}
              style={[styles.askButtonInline, {
                backgroundColor: isDark ? "#19231E" : "#DCFCE7",
                borderColor: riskColor,
              }]}
            >
              <Sparkles size={13} color={riskColor} />
              <Text style={[styles.askButtonInlineText, { color: colors.text }]}>Ask Materna</Text>
            </Button>
          </View>

          {/* Vitals 2-column grid */}
          <View style={styles.vitalsRow}>
            <View style={styles.vitalsCol}>
              <VitalCard title={vitals.heartRate.title} value={vitals.heartRate.value} unit={vitals.heartRate.unit} theme={theme} status={vitals.heartRate.status} />
              <VitalCard title={vitals.bloodPressure.title} value={vitals.bloodPressure.value} unit={vitals.bloodPressure.unit} theme={theme} status={vitals.bloodPressure.status} />
              <VitalCard title={vitals.skinTemp.title} value={vitals.skinTemp.value} unit={vitals.skinTemp.unit} theme={theme} status={vitals.skinTemp.status} />
            </View>
            <View style={styles.vitalsCol}>
              <VitalCard title={vitals.hrv.title} value={vitals.hrv.value} unit={vitals.hrv.unit} theme={theme} status={vitals.hrv.status} />
              <VitalCard title={vitals.oxygen.title} value={vitals.oxygen.value} unit={vitals.oxygen.unit} theme={theme} status={vitals.oxygen.status} />
              <VitalCard title={vitals.respiration.title} value={vitals.respiration.value} unit={vitals.respiration.unit} theme={theme} status={vitals.respiration.status} />
            </View>
          </View>

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scrollContent: { flexGrow: 1, alignItems: "center" },
  content: { width: "100%", maxWidth: 430, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 20 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  braceletStatus: { flexDirection: "row", alignItems: "center", gap: 6 },
  connectedDot: { width: 7, height: 7, borderRadius: 99 },
  braceletText: { fontSize: 11 },
  themeButton: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  themeButtonText: { fontSize: 11, fontWeight: "700" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  brandDot: { width: 10, height: 10, borderRadius: 99 },
  brand: { fontSize: 14, fontWeight: "900", letterSpacing: 2, fontFamily: "Qika-Bold" },
  week: { fontSize: 12, marginLeft: 4 },
  dotSwitcher: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 },
  switcherDot: { height: 10, borderRadius: 5 },
  criticalAlert: { backgroundColor: "#7F1D1D", borderColor: "#EF4444", borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12 },
  criticalAlertText: { color: "#FEE2E2", fontSize: 13, fontWeight: "800", lineHeight: 19 },
  statusCard: { borderWidth: 1, borderLeftWidth: 4, borderRadius: 18, padding: 16, marginBottom: 16 },
  statusTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  statusPill: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 99 },
  statusText: { fontSize: 12, fontWeight: "800" },
  confidence: { fontSize: 10 },
  heroTitle: { fontSize: 22, lineHeight: 28, fontWeight: "900", marginBottom: 10 },
  heroBody: { fontSize: 13, lineHeight: 20 },
  patternRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, paddingTop: 12, borderTopWidth: 1 },
  patternBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  patternLabel: { fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  patternText: { fontSize: 12, fontWeight: "700", fontFamily: "monospace", flex: 1 },
  divider: { height: 1, marginVertical: 14 },
  smallLabel: { fontSize: 10, letterSpacing: 2, marginBottom: 4 },
  actionText: { fontSize: 13, fontWeight: "700" },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  sectionTitle: { fontSize: 14, fontWeight: "900" },
  askButtonInline: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  askButtonInlineText: { fontSize: 12, fontWeight: "700" },
  vitalsRow: { flexDirection: "row", marginHorizontal: -5 },
  vitalsCol: { flex: 1 },
});
