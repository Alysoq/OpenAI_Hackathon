import Button from "../components/Button";
import React, { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { FileText, Save } from "lucide-react-native";
import DateOfBirthPicker from "../components/DateOfBirthPicker";
import ToggleButton from "../components/ToggleButton";
import {
  EMPTY_PROFILE,
  ProfileData,
  loadProfile,
  saveProfile,
} from "../storage/profileStorage";
import { createAndShareProfileReport } from "../utils/profileReport";
import { sampleSensorData } from "../data/sampleSensorData";
import { shareProfileReport } from "../api/maternaAPI";
import { loadChatRiskSignals } from "../storage/chatRiskStorage";
import { assessMaternalRisk } from "../utils/maternalRiskAssessment";

interface Props {
  theme: "dark" | "light";
  onResetOnboarding?: () => void;
}

export default function ProfileScreen({ theme, onResetOnboarding }: Props) {
  const dark = theme === "dark";
  const c = dark ? colors.dark : colors.light;
  const [profile, setProfile] = useState<ProfileData>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reportStatus, setReportStatus] = useState("");

  useEffect(() => {
    loadProfile().then((stored) => {
      setProfile(stored || EMPTY_PROFILE);
      setLoading(false);
    });
  }, []);

  function update<K extends keyof ProfileData>(key: K, value: ProfileData[K]) {
    setProfile((current) => ({
      ...current,
      [key]: value,
      ...(key === "pregnancyWeek"
        ? { pregnancyWeekRecordedAt: new Date().toISOString() }
        : {}),
    }));
  }

  async function persistProfile() {
    const now = new Date().toISOString();
    const next = {
      ...profile,
      pregnancyWeekRecordedAt:
        profile.pregnancyWeek && !profile.pregnancyWeekRecordedAt
          ? now
          : profile.pregnancyWeekRecordedAt,
      updatedAt: now,
    };
    await saveProfile(next);
    setProfile(next);
    return next;
  }

  async function handleSave() {
    await persistProfile();
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  async function resetOnboarding() {
    const next = { ...profile, dataConsent: false, healthHistoryCompleted: false };
    try {
      await AsyncStorage.removeItem("dataConsent");
      await saveProfile(next);
      setProfile(next);
    } finally {
      // This is a demo/testing control: always return to onboarding even if
      // storage is temporarily unavailable on the current device or web build.
      onResetOnboarding?.();
    }
  }

  async function handleReport() {
    const missingFields = [
      !profile.fullName.trim() && "Full name",
      !isCompleteDateOfBirth(profile.dateOfBirth) && "Date of birth",
      !profile.county.trim() && "County",
      !profile.age.trim() && "Age",
      !profile.pregnancyWeek.trim() && "Pregnancy week",
      !profile.emergencyContact.trim() && "Emergency contact",
    ].filter(Boolean) as string[];

    const age = Number(profile.age);
    const pregnancyWeek = Number(profile.pregnancyWeek);

    if (missingFields.length > 0) {
      const message = `Please complete: ${missingFields.join(", ")}.`;
      setReportStatus(message);
      Alert.alert("Profile incomplete", message);
      return;
    }

    if (!Number.isInteger(age) || age < 12 || age > 65) {
      const message = "Please enter a valid age before creating the PDF.";
      setReportStatus(message);
      Alert.alert("Check age", message);
      return;
    }

    if (
      !Number.isInteger(pregnancyWeek) ||
      pregnancyWeek < 1 ||
      pregnancyWeek > 42
    ) {
      const message = "Pregnancy week must be between 1 and 42.";
      setReportStatus(message);
      Alert.alert("Check pregnancy week", message);
      return;
    }

    setGeneratingReport(true);
    setReportStatus("");
    try {
      const savedProfile = await persistProfile();
      const chatSignals = await loadChatRiskSignals();
      const earlyRiskAssessment = assessMaternalRisk(savedProfile, chatSignals);
      if (savedProfile.shareWithDoctor) {
        const result = await shareProfileReport({
          patient_id: "patient_001",
          profile: savedProfile,
          bracelet: sampleSensorData.bracelet,
          vitals: sampleSensorData.vitals,
          risk: sampleSensorData.risk,
          earlyRiskAssessment,
          chatSignals,
        });
        setReportStatus(
          result
            ? "Report delivered to the linked doctor."
            : "PDF created on this device."
        );
      } else {
        setReportStatus(
          "PDF created locally. Turn on doctor sharing to deliver it to the dashboard."
        );
      }
      await createAndShareProfileReport(
        savedProfile,
        sampleSensorData,
        earlyRiskAssessment
      );
    } finally {
      setGeneratingReport(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.loading, { backgroundColor: c.background }]}>
        <ActivityIndicator color={c.accent} />
        <Text style={[styles.loadingText, { color: c.textMuted }]}>
          Loading profile...
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { backgroundColor: c.background }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={[styles.screenTitle, { color: c.accent }]}>MATERNA</Text>
          <Text style={[styles.pageLabel, { color: c.textMuted }]}>My Profile</Text>
          <Text style={[styles.pageDate, { color: c.textMuted }]}>
            {new Date().toLocaleDateString()}
          </Text>
        </View>

        <SectionHeader label="Personal" color={c.sectionHeader} />
        <Text style={[styles.requiredNote, { color: c.textMuted }]}>
          Fields marked * are required to create or send a PDF.
        </Text>
        <Field label="Full name *" value={profile.fullName} onChangeText={(value) => update("fullName", value)} placeholder="e.g. Maya Johnson" c={c} />
        <DateOfBirthPicker
          value={profile.dateOfBirth}
          onChange={(value) => update("dateOfBirth", value)}
          colors={c}
        />
        <Field label="County *" value={profile.county} onChangeText={(value) => update("county", value)} placeholder="e.g. Desha" c={c} />

        <View style={styles.row}>
          <Field label="Age *" value={profile.age} onChangeText={(value) => update("age", value)} placeholder="e.g. 28" keyboardType="numeric" c={c} style={styles.rowField} />
          <Field label="Pregnancy week *" value={profile.pregnancyWeek} onChangeText={(value) => update("pregnancyWeek", value)} placeholder="e.g. 28" keyboardType="numeric" c={c} style={styles.rowField} />
        </View>

        <View style={styles.row}>
          <Field label="Weight (lbs)" value={profile.weightLbs} onChangeText={(value) => update("weightLbs", value)} placeholder="145" keyboardType="numeric" c={c} style={styles.rowField} />
          <Field label="Height (ft)" value={profile.heightFt} onChangeText={(value) => update("heightFt", value)} placeholder="5" keyboardType="numeric" c={c} style={styles.rowField} />
          <Field label="In" value={profile.heightIn} onChangeText={(value) => update("heightIn", value)} placeholder="4" keyboardType="numeric" c={c} style={styles.smallRowField} />
        </View>

        <Field label="Previous pregnancies" value={profile.previousPregnancies} onChangeText={(value) => update("previousPregnancies", value)} placeholder="e.g. 1" keyboardType="numeric" c={c} />

        <SectionHeader label="Medical history" color={c.sectionHeader} />
        <ToggleRow label="History of miscarriage" value={profile.hasMiscarriage} onToggle={(value) => update("hasMiscarriage", value)} c={c} />
        <ToggleRow label="High blood pressure" value={profile.hasHighBP} onToggle={(value) => update("hasHighBP", value)} c={c} />
        <ToggleRow label="Diabetes" value={profile.hasDiabetes} onToggle={(value) => update("hasDiabetes", value)} c={c} />
        <ToggleRow label="Anemia" value={profile.hasAnemia} onToggle={(value) => update("hasAnemia", value)} c={c} />
        <ToggleRow label="Previous C-section" value={profile.hasCSection} onToggle={(value) => update("hasCSection", value)} c={c} />
        <Field label="Current medications" value={profile.medications} onChangeText={(value) => update("medications", value)} placeholder="List medications, or leave blank" multiline c={c} />

        <SectionHeader label="Emergency and care" color={c.sectionHeader} />
        <Field label="Emergency contact (name and phone) *" value={profile.emergencyContact} onChangeText={(value) => update("emergencyContact", value)} placeholder="e.g. John Smith, 501-555-0199" c={c} />
        <Field label="Preferred hospital or clinic" value={profile.preferredHospital} onChangeText={(value) => update("preferredHospital", value)} placeholder="e.g. UAMS Medical Center" c={c} />

        <View style={[styles.consentCard, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}>
          <View style={styles.consentText}>
            <Text style={[styles.consentTitle, { color: c.text }]}>Share with linked doctor</Text>
            <Text style={[styles.consentBody, { color: c.textMuted }]}>
              Allows the doctor dashboard in this demo to view your saved profile.
            </Text>
          </View>
          <ToggleButton
            isActive={profile.shareWithDoctor}
            onPress={() => update("shareWithDoctor", !profile.shareWithDoctor)}
            accessibilityLabel="Share with linked doctor"
            activeTrackColor={c.accent}
            inactiveTrackColor={c.switchTrackOff}
          />
        </View>

        <Button style={[styles.saveButton, { backgroundColor: c.accent }]} onPress={handleSave}>
          <Save size={18} color="#ffffff" />
          <Text style={styles.saveButtonText}>{saved ? "Profile saved" : "Save changes"}</Text>
        </Button>

        {reportStatus ? (
          <Text
            style={[
              styles.reportStatus,
              {
                color: reportStatus.startsWith("Report delivered")
                  ? "#22C55E"
                  : c.textMuted,
              },
            ]}
          >
            {reportStatus}
          </Text>
        ) : null}

        <Button
          style={[styles.reportButton, { borderColor: c.accent }]}
          onPress={handleReport}
          disabled={generatingReport}
        >
          {generatingReport ? <ActivityIndicator size="small" color={c.accent} /> : <FileText size={18} color={c.accent} />}
          <Text style={[styles.reportButtonText, { color: c.accent }]}>
            {generatingReport ? "Creating report..." : "Create and share PDF"}
          </Text>
        </Button>

        <Button style={[styles.resetButton, { borderColor: c.inputBorder }]} onPress={resetOnboarding}>
          <Text style={[styles.resetButtonText, { color: c.textMuted }]}>Reset Onboarding (Testing)</Text>
        </Button>

        {profile.updatedAt ? (
          <Text style={[styles.updatedText, { color: c.textMuted }]}>
            Last saved {new Date(profile.updatedAt).toLocaleString()}
          </Text>
        ) : null}

        <Text style={[styles.disclaimer, { color: c.textMuted }]}>
          Your profile is stored on this device. Doctor access is controlled by the sharing switch.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function SectionHeader({ label, color }: { label: string; color: string }) {
  return <Text style={[styles.sectionHeader, { color }]}>{label.toUpperCase()}</Text>;
}

function isCompleteDateOfBirth(value: string) {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return false;

  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date <= new Date()
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "numeric" | "phone-pad" | "email-address";
  multiline?: boolean;
  c: any;
  style?: object;
}

function Field({ label, value, onChangeText, placeholder, keyboardType = "default", multiline = false, c, style }: FieldProps) {
  return (
    <View style={[styles.fieldWrapper, style]}>
      <Text style={[styles.label, { color: c.textMuted }]}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          { backgroundColor: c.inputBg, borderColor: c.inputBorder, color: c.text },
          multiline && styles.multiline,
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c.placeholder}
        keyboardType={keyboardType}
        multiline={multiline}
      />
    </View>
  );
}

function ToggleRow({ label, value, onToggle, c }: { label: string; value: boolean; onToggle: (value: boolean) => void; c: any }) {
  return (
    <View style={[styles.toggleRow, { borderBottomColor: c.divider }]}>
      <Text style={[styles.toggleLabel, { color: c.text }]}>{label}</Text>
      <ToggleButton
        isActive={value}
        onPress={() => onToggle(!value)}
        accessibilityLabel={label}
        activeTrackColor={c.accent}
        inactiveTrackColor={c.switchTrackOff}
      />
    </View>
  );
}

function getColors(mode: "dark" | "light") {
  const isDark = mode === "dark";
  return {
    background: isDark ? "#0f1117" : "#f5f7fa",
    text: isDark ? "#f0f0f0" : "#1a1a1a",
    textMuted: isDark ? "#8a8fa8" : "#6b7280",
    accent: "#22C55E",
    sectionHeader: isDark ? "#22C55E" : "#16a34a",
    inputBg: isDark ? "#1c1f2e" : "#ffffff",
    inputBorder: isDark ? "#2e3347" : "#d1d5db",
    placeholder: isDark ? "#4a4f66" : "#9ca3af",
    divider: isDark ? "#1e2233" : "#e5e7eb",
    switchTrackOff: isDark ? "#2e3347" : "#d1d5db",
  };
}

const colors = { dark: getColors("dark"), light: getColors("light") };

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  loadingText: { fontSize: 13 },
  scroll: { padding: 20, paddingBottom: 48 },
  header: { marginBottom: 24, marginTop: 8 },
  screenTitle: { fontSize: 22, fontWeight: "800", letterSpacing: 4 },
  pageLabel: { fontSize: 14, marginTop: 2 },
  pageDate: { fontSize: 11, marginTop: 5 },
  sectionHeader: { fontSize: 11, fontWeight: "700", letterSpacing: 2, marginTop: 28, marginBottom: 12 },
  requiredNote: { fontSize: 10, lineHeight: 15, marginBottom: 12 },
  row: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  rowField: { flex: 1 },
  smallRowField: { flex: 0.65 },
  fieldWrapper: { marginBottom: 14 },
  label: { fontSize: 12, fontWeight: "600", marginBottom: 5 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15 },
  multiline: { height: 72, textAlignVertical: "top" },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 13, borderBottomWidth: 1 },
  toggleLabel: { fontSize: 15, flex: 1, paddingRight: 12 },
  consentCard: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 10, padding: 14, marginTop: 10 },
  consentText: { flex: 1, paddingRight: 12 },
  consentTitle: { fontSize: 14, fontWeight: "700" },
  consentBody: { fontSize: 11, lineHeight: 16, marginTop: 3 },
  saveButton: { flexDirection: "row", gap: 8, justifyContent: "center", marginTop: 24, borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  saveButtonText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
  reportButton: { flexDirection: "row", gap: 8, justifyContent: "center", marginTop: 10, borderWidth: 1, borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  reportButtonText: { fontSize: 14, fontWeight: "700" },
  resetButton: { borderWidth: 1, borderRadius: 10, paddingVertical: 12, alignItems: "center", marginTop: 10 },
  resetButtonText: { fontSize: 13, fontWeight: "700" },
  reportStatus: { fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: 10 },
  updatedText: { fontSize: 10, textAlign: "center", marginTop: 12 },
  disclaimer: { fontSize: 11, textAlign: "center", marginTop: 12, lineHeight: 16 },
});
