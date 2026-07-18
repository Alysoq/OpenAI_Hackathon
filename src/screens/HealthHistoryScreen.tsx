import React, { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { EMPTY_PROFILE, loadProfile, saveProfile } from "../storage/profileStorage";
import { savePatientProfile } from "../api/maternaAPI";

const CONDITIONS = [
  ["hasDiabetes", "Diabetes"], ["hasGestationalDiabetes", "Gestational diabetes"],
  ["hasHighBP", "High blood pressure"], ["hasPreviousPreeclampsia", "Previous preeclampsia"],
  ["hasHeartCondition", "Heart condition"], ["hasThyroidDisorder", "Thyroid disorder"],
  ["hasAnemia", "Anemia"], ["hasObesity", "Obesity"],
] as const;

export default function HealthHistoryScreen({ consent, onComplete }: { consent: boolean; onComplete: () => void }) {
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  async function finish() {
    setSaving(true);
    const existing = (await loadProfile()) || EMPTY_PROFILE;
    const profile = { ...existing, ...answers, dataConsent: consent, healthHistoryCompleted: true, updatedAt: new Date().toISOString() };
    await saveProfile(profile);
    await savePatientProfile("patient_001", profile);
    setSaving(false);
    onComplete();
  }
  return <ScrollView contentContainerStyle={styles.screen}>
    <Text style={styles.brand}>MATERNA</Text>
    <Text style={styles.title}>Health history</Text>
    <Text style={styles.body}>Select any conditions you have had. This helps Materna personalize safety checks and is not a diagnosis.</Text>
    <View style={styles.card}>{CONDITIONS.map(([key, label]) => <View key={key} style={styles.row}>
      <Text style={styles.label}>{label}</Text><Switch value={answers[key] || false} onValueChange={(value) => setAnswers((current) => ({ ...current, [key]: value }))} trackColor={{ false: "#334155", true: "#22C55E" }} />
    </View>)}</View>
    <Pressable style={styles.button} onPress={finish} disabled={saving}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save health history</Text>}</Pressable>
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, padding: 24, justifyContent: "center", backgroundColor: "#05070A" }, brand: { color: "#22C55E", fontWeight: "900", letterSpacing: 3, fontSize: 14 }, title: { color: "#F8FAFC", fontSize: 27, fontWeight: "900", marginTop: 13 }, body: { color: "#CBD5E1", fontSize: 14, lineHeight: 21, marginTop: 11, marginBottom: 16 }, card: { backgroundColor: "#101418", borderColor: "#242B33", borderWidth: 1, borderRadius: 10, paddingHorizontal: 14 }, row: { minHeight: 55, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#242B33" }, label: { color: "#F8FAFC", fontSize: 14, fontWeight: "700" }, button: { backgroundColor: "#22C55E", borderRadius: 9, padding: 14, alignItems: "center", marginTop: 18 }, buttonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
});
