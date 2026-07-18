import Button from "../components/Button";
import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Platform,
} from "react-native";
import { sampleSensorData } from "../data/sampleSensorData";

interface Props {
  theme: "dark" | "light";
}

export default function VitalsScreen({ theme }: Props) {
  const dark = theme === "dark";
  const c = dark ? colors.dark : colors.light;

  const { bracelet, vitals, risk } = sampleSensorData;

  const [refreshed, setRefreshed] = useState(false);
  const [pairing, setPairing] = useState(false);
  const [paired, setPaired] = useState(true);

  function handleRefresh() {
    setRefreshed(true);
    setTimeout(() => setRefreshed(false), 2500);
  }

  function handlePair() {
    setPairing(true);
    setTimeout(() => {
      setPairing(false);
      setPaired(true);
    }, 2000);
  }

  const vitalsList = [
    {
      title: "Heart Rate",
      value: vitals.heartRate.value,
      unit: vitals.heartRate.unit,
      normal: "60–100 bpm",
      status: "normal",
    },
    {
      title: "HRV",
      value: vitals.hrv.value,
      unit: vitals.hrv.unit,
      normal: "50–100 ms",
      status: "normal",
    },
    {
      title: "Blood Pressure",
      value: vitals.bloodPressure.value,
      unit: vitals.bloodPressure.unit,
      normal: "< 140/90 mmHg",
      status: "normal",
    },
    {
      title: "Oxygen SpO₂",
      value: vitals.oxygen.value,
      unit: vitals.oxygen.unit,
      normal: "95–100%",
      status: "normal",
    },
    {
      title: "Skin Temperature",
      value: vitals.skinTemp.value,
      unit: vitals.skinTemp.unit,
      normal: "97–99°F",
      status: "normal",
    },
    {
      title: "Respiration",
      value: vitals.respiration.value,
      unit: vitals.respiration.unit,
      normal: "12–20 /min",
      status: "normal",
    },
  ];

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={[styles.scroll, { backgroundColor: c.background }]}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.screenTitle, { color: c.accent }]}>MATERNA</Text>
        <Text style={[styles.pageLabel, { color: c.textMuted }]}>Vitals</Text>
      </View>

      {/* Bracelet status card */}
      <View style={[styles.braceletCard, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
        <View style={styles.braceletRow}>
          <View style={styles.braceletLeft}>
            <View style={[styles.dot, { backgroundColor: paired ? "#4ade80" : "#f87171" }]} />
            <Text style={[styles.braceletStatus, { color: c.text }]}>
              {paired ? "Bracelet connected" : "Bracelet not connected"}
            </Text>
          </View>
          <Text style={[styles.battery, { color: c.textMuted }]}>
            🔋 {bracelet.battery}%
          </Text>
        </View>
        <Text style={[styles.lastSynced, { color: c.textMuted }]}>
          Last synced: {refreshed ? "just now" : bracelet.lastSynced}
        </Text>

        {/* Buttons */}
        <View style={styles.buttonRow}>
          <Button
            style={[styles.actionBtn, { backgroundColor: c.accent }]}
            onPress={handleRefresh}
            activeOpacity={0.8}
          >
            <Text style={styles.actionBtnText}>
              {refreshed ? "✓ Refreshed" : "↻  Refresh readings"}
            </Text>
          </Button>

          <Button
            style={[styles.actionBtn, { backgroundColor: c.secondaryBtn }]}
            onPress={handlePair}
            activeOpacity={0.8}
          >
            <Text style={[styles.actionBtnText, { color: c.text }]}>
              {pairing ? "Pairing..." : paired ? "Re-pair bracelet" : "Pair bracelet"}
            </Text>
          </Button>
        </View>
      </View>

      {/* Risk summary */}
      <View style={[styles.riskCard, { backgroundColor: c.card, borderColor: "#4ade80", borderWidth: 1 }]}>
        <View style={styles.riskTop}>
          <View style={[styles.riskBadge, { backgroundColor: "#4ade8022" }]}>
            <Text style={styles.riskBadgeText}>● {risk.level} · {risk.message}</Text>
          </View>
          <Text style={[styles.confidence, { color: c.textMuted }]}>
            AI confidence {risk.confidence}
          </Text>
        </View>
        <Text style={[styles.riskHeadline, { color: c.text }]}>{risk.headline}</Text>
        <Text style={[styles.riskDescription, { color: c.textMuted }]}>{risk.description}</Text>
      </View>

      {/* Vitals list */}
      <Text style={[styles.sectionLabel, { color: c.textMuted }]}>SENSOR READINGS</Text>

      {vitalsList.map((v) => (
        <View key={v.title} style={[styles.vitalRow, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
          <View style={styles.vitalLeft}>
            <Text style={[styles.vitalTitle, { color: c.textMuted }]}>{v.title}</Text>
            <View style={styles.vitalValueRow}>
              <Text style={[styles.vitalValue, { color: c.text }]}>{v.value}</Text>
              <Text style={[styles.vitalUnit, { color: c.textMuted }]}> {v.unit}</Text>
            </View>
          </View>
          <View style={styles.vitalRight}>
            <View style={[styles.normalBadge, { backgroundColor: "#4ade8018" }]}>
              <Text style={styles.normalText}>● Normal</Text>
            </View>
            <Text style={[styles.normalRange, { color: c.textMuted }]}>{v.normal}</Text>
          </View>
        </View>
      ))}

      <Text style={[styles.disclaimer, { color: c.textMuted }]}>
        Readings are updated every 2 minutes via your Materna bracelet.
      </Text>
    </ScrollView>
  );
}

// ── Colors ────────────────────────────────────────────────────────────────────

function getColors(mode: "dark" | "light") {
  const isDark = mode === "dark";
  return {
    background: isDark ? "#0f1117" : "#f5f7fa",
    text: isDark ? "#f0f0f0" : "#1a1a1a",
    textMuted: isDark ? "#8a8fa8" : "#6b7280",
    accent: "#22C55E",
    card: isDark ? "#1c1f2e" : "#ffffff",
    cardBorder: isDark ? "#2e3347" : "#e5e7eb",
    secondaryBtn: isDark ? "#2e3347" : "#e5e7eb",
  };
}

const colors = { dark: getColors("dark"), light: getColors("light") };

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 48 },
  header: { marginBottom: 24, marginTop: 8 },
  screenTitle: { fontSize: 22, fontWeight: "800", letterSpacing: 4 },
  pageLabel: { fontSize: 14, marginTop: 2, letterSpacing: 0.5 },
  braceletCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  braceletRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  braceletLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  braceletStatus: { fontSize: 15, fontWeight: "600" },
  battery: { fontSize: 13 },
  lastSynced: { fontSize: 12, marginBottom: 14 },
  buttonRow: { flexDirection: "row", gap: 10 },
  actionBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  actionBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  riskCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  riskTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  riskBadge: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  riskBadgeText: { color: "#4ade80", fontSize: 13, fontWeight: "600" },
  confidence: { fontSize: 12 },
  riskHeadline: { fontSize: 20, fontWeight: "800", marginBottom: 6 },
  riskDescription: { fontSize: 14, lineHeight: 20 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    marginBottom: 12,
  },
  vitalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  vitalLeft: {},
  vitalTitle: { fontSize: 12, fontWeight: "600", marginBottom: 4 },
  vitalValueRow: { flexDirection: "row", alignItems: "baseline" },
  vitalValue: { fontSize: 26, fontWeight: "800" },
  vitalUnit: { fontSize: 13 },
  vitalRight: { alignItems: "flex-end" },
  normalBadge: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 4,
  },
  normalText: { color: "#4ade80", fontSize: 12, fontWeight: "600" },
  normalRange: { fontSize: 11 },
  disclaimer: { fontSize: 11, textAlign: "center", marginTop: 8, lineHeight: 16 },
});
