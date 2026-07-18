import Button from "../components/Button";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  SafeAreaView,
  ScrollView,
  View,
  Text,
  StyleSheet,
  } from "react-native";
import AnimatedWave from "../components/AnimatedWave";
import type { SensorData } from "../data/sampleSensorData";
import { Sparkles, Sun, Moon } from "lucide-react-native";
import { JOGGING_DEMO } from "../config/config";
import { getPatientHistory } from "../api/maternaAPI";

type HomeScreenProps = {
  theme: "dark" | "light";
  toggleTheme: () => void;
  onAskMaterna: () => void;
  patientId?: string;
};

type BandVitals = {
  heartRate: number;
  oxygen: number;
  temperature: number;
  systolic: number;
  diastolic: number;
  respiration: number;
  hrv: number;
};

const INITIAL_BAND_VITALS: BandVitals = {
  heartRate: 83,
  oxygen: 97,
  temperature: 98.6,
  systolic: 115,
  diastolic: 75,
  respiration: 16,
  hrv: 43,
};

type BandPhase = "resting" | "jogging" | "recovery";

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

function noisy(value: number, minimum: number, maximum: number, decimals = 0, amount = decimals ? 0.08 : 1) {
  const result = Math.max(minimum, Math.min(maximum, value + (Math.random() - 0.5) * amount * 2));
  return decimals ? Number(result.toFixed(decimals)) : Math.round(result);
}

function interpolate(start: number, end: number, progress: number) {
  return start + (end - start) * Math.max(0, Math.min(1, progress));
}

function getJoggingDemo(second: number): { vitals: BandVitals; phase: BandPhase } {
  const cycleSecond = second % 45;
  if (cycleSecond < 15) {
    return {
      phase: "resting",
      vitals: {
        heartRate: noisy(79, 76, 82, 0, 3), oxygen: noisy(97.5, 97, 98, 0, 0.5),
        temperature: noisy(98.55, 98.4, 98.7, 1, 0.15), systolic: noisy(114, 112, 116, 0, 2),
        diastolic: noisy(74, 72, 76, 0, 2), respiration: noisy(15, 14, 16), hrv: noisy(45, 42, 48, 0, 3),
      },
    };
  }

  if (cycleSecond < 35) {
    const progress = (cycleSecond - 15) / 19;
    return {
      phase: "jogging",
      vitals: {
        heartRate: noisy(interpolate(82, 100, progress), 82, 100),
        oxygen: noisy(96.5, 96, 97, 0, 0.5),
        temperature: noisy(interpolate(98.7, 99.8, progress), 98.4, 99.8, 1, 0.08),
        systolic: noisy(interpolate(116, 138, progress), 112, 138, 0, 1),
        diastolic: noisy(76, 74, 78),
        respiration: noisy(interpolate(16, 26, progress), 14, 26),
        hrv: noisy(interpolate(42, 28, progress), 28, 48),
      },
    };
  }

  const progress = (cycleSecond - 35) / 9;
  return {
    phase: "recovery",
    vitals: {
      heartRate: noisy(interpolate(100, 79, progress), 76, 100),
      oxygen: noisy(interpolate(96, 97.5, progress), 96, 98),
      temperature: noisy(interpolate(99.8, 98.55, progress), 98.4, 99.8, 1, 0.08),
      systolic: noisy(interpolate(138, 114, progress), 112, 138, 0, 1),
      diastolic: noisy(interpolate(76, 74, progress), 72, 78),
      respiration: noisy(interpolate(26, 15, progress), 14, 26),
      hrv: noisy(interpolate(28, 45, progress), 28, 48),
    },
  };
}

function dataFromBandVitals(values: BandVitals, phase: BandPhase = "resting"): SensorData {
  const color = "#22C55E";
  const status = "normal";
  const isJogging = phase === "jogging";

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
      level: "Green",
      message: isJogging ? "Active - Elevated Heart Rate Detected" : phase === "recovery" ? "Recovery" : "Resting",
      confidence: "97%",
      color,
      headline: isJogging ? "Healthy activity detected." : "Everything looks healthy.",
      description: isJogging
        ? "Your heart rate is elevated from exercise while your other readings remain in a healthy range."
        : "Materna is receiving stable, healthy readings from your connected wristband.",
      pattern: null,
      action: "No action needed",
    },
  };
}

function dataFromLiveReading(reading: LiveReading): SensorData {
  const level = (reading.risk_level || "LOW").toUpperCase();
  const data = dataFromBandVitals({
    heartRate: reading.heart_rate ?? 0,
    oxygen: reading.spo2 ?? 0,
    temperature: reading.temperature ?? 0,
    systolic: reading.systolic_bp ?? 0,
    diastolic: reading.diastolic_bp ?? 0,
    respiration: reading.respiration ?? 0,
    hrv: reading.hrv_rmssd ?? 0,
  });

  if (level === "HIGH" || level === "MEDIUM") {
    const isHigh = level === "HIGH";
    const color = isHigh ? "#EF4444" : "#EAB308";
    Object.values(data.vitals).forEach((vital) => {
      vital.status = isHigh ? "danger" : "warning";
    });
    data.risk = {
      ...data.risk,
      level: isHigh ? "Red" : "Yellow",
      message: isHigh ? "Urgent" : "Heads up",
      color,
      headline: isHigh ? "Your care team should review these readings now." : "Your readings need attention.",
      description: "Showing the latest risk assessment received from your wristband.",
      action: isHigh ? "Seek care immediately." : "Contact your care team today.",
    };
  }
  return data;
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
  patientId = "patient_001",
}: HomeScreenProps) {
  const isDark = theme === "dark";
  const [demoSecond, setDemoSecond] = useState(0);
  const [liveReading, setLiveReading] = useState<LiveReading | null>(null);
  const connectionPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!JOGGING_DEMO) return;
    const update = setInterval(() => setDemoSecond((second) => second + 1), 1000);
    return () => clearInterval(update);
  }, []);

  useEffect(() => {
    if (JOGGING_DEMO) return;
    let isMounted = true;
    const loadLatestReading = async () => {
      const readings = await getPatientHistory(patientId, 24);
      const latest = readings?.[readings.length - 1];
      if (isMounted && latest) setLiveReading(latest);
    };
    loadLatestReading();
    const update = setInterval(loadLatestReading, 5000);
    return () => {
      isMounted = false;
      clearInterval(update);
    };
  }, [patientId]);

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(connectionPulse, { toValue: 0.35, duration: 800, useNativeDriver: true }),
        Animated.timing(connectionPulse, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => {
      pulse.stop();
    };
  }, [connectionPulse]);

  const joggingDemo = getJoggingDemo(demoSecond);
  const data = JOGGING_DEMO
    ? dataFromBandVitals(joggingDemo.vitals, joggingDemo.phase)
    : liveReading ? dataFromLiveReading(liveReading) : dataFromBandVitals(INITIAL_BAND_VITALS);
  const braceletStatus = JOGGING_DEMO && joggingDemo.phase === "jogging"
    ? "Connected - Active"
    : "Connected";

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

  const riskCardBg = isDark ? "#101418" : "#FFFFFF";

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
              <Animated.View style={[styles.connectedDot, { backgroundColor: "#22C55E", opacity: connectionPulse }]} />
              <Text style={[styles.braceletText, { color: colors.mutedText }]}>{braceletStatus}</Text>
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
