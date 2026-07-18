import Button from "../components/Button";
import React, { useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Image,
} from "react-native";
import { Audio } from "expo-av";
import * as ImagePicker from "expo-image-picker";
import { analyzeImage, askAssistant, shareProfileReport, transcribeAudio } from "../api/maternaAPI";
import ChatBubble from "../components/ChatBubble";
import {
  loadChatRiskSignals,
  recordChatRiskSignal,
} from "../storage/chatRiskStorage";
import { loadProfile } from "../storage/profileStorage";
import { assessMaternalRisk } from "../utils/maternalRiskAssessment";
import { sampleSensorData } from "../data/sampleSensorData";

interface Props {
  theme: "dark" | "light";
  onClose: () => void;
  name: string;
  patientId?: string;
  currentSensors?: object | null;
  riskLevel?: string;
}

interface Message {
  id: string;
  from: "user" | "materna";
  text: string;
  alert?: boolean;
  type?: "text" | "voice" | "image";
  imageUri?: string;
}

export default function AIChatScreen({
  theme,
  onClose,
  name,
  patientId = "patient_maya",
  currentSensors = null,
  riskLevel = "stable",
}: Props) {
  const dark = theme === "dark";
  const c = dark ? colors.dark : colors.light;

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "0",
      from: "materna",
      text: `Hi ${name}! I'm Materna. Tell me how you're feeling or ask me anything about your pregnancy.`,
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);

  async function recordRiskAndShare(message: string) {
    const riskSignal = await recordChatRiskSignal(message);
    if (!riskSignal) return;
    const profile = await loadProfile();
    if (!profile?.shareWithDoctor) return;
    const chatSignals = await loadChatRiskSignals();
    await shareProfileReport({
      patient_id: patientId,
      profile,
      bracelet: sampleSensorData.bracelet,
      vitals: sampleSensorData.vitals,
      risk: sampleSensorData.risk,
      earlyRiskAssessment: assessMaternalRisk(profile, chatSignals),
      chatSignals,
    });
  }

  async function handleSend(message = input) {
    const trimmed = message.trim();
    if (!trimmed || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      from: "user",
      text: trimmed,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);
    await recordRiskAndShare(trimmed);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

    const apiReply = await askAssistant(
      patientId,
      trimmed,
      currentSensors,
      riskLevel
    );
    const botMsg: Message = {
      id: (Date.now() + 1).toString(),
      from: "materna",
      text: apiReply || "Unable to reach the Materna AI service. Check the ngrok connection and try again.",
      alert: !apiReply,
    };

    setIsLoading(false);
    setMessages((prev) => [...prev, botMsg]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }

  async function startRecording() {
    if (isLoading || isRecording) return;
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== "granted") {
        Alert.alert("Microphone access needed", "Allow microphone access to send a voice message.");
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      recordingRef.current = recording;
      setIsRecording(true);
    } catch {
      Alert.alert("Recording unavailable", "Unable to start voice recording on this device.");
    }
  }

  async function stopRecording() {
    const recording = recordingRef.current;
    if (!recording) return;
    recordingRef.current = null;
    setIsRecording(false);
    setIsLoading(true);
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      if (!uri) throw new Error("Recording file missing");
      const result = await transcribeAudio(patientId, uri, currentSensors, riskLevel);
      if (!result?.transcript || !result?.response) throw new Error("Voice service unavailable");
      await recordRiskAndShare(result.transcript);
      setMessages((current) => [
        ...current,
        { id: Date.now().toString(), from: "user", text: result.transcript, type: "voice" },
        { id: (Date.now() + 1).toString(), from: "materna", text: result.response },
      ]);
    } catch {
      setMessages((current) => [...current, {
        id: Date.now().toString(), from: "materna", alert: true,
        text: "Unable to transcribe the voice message. Check the Materna AI server connection and try again.",
      }]);
    } finally {
      setIsLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }

  async function takePhoto() {
    if (isLoading) return;
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== "granted") {
      Alert.alert("Camera access needed", "Allow camera access to send a photo to Materna.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    const imageUri = result.assets[0].uri;
    setMessages((current) => [...current, {
      id: Date.now().toString(), from: "user", text: "Photo shared", type: "image", imageUri,
    }]);
    setIsLoading(true);
    try {
      const analysis = await analyzeImage(patientId, imageUri, currentSensors, riskLevel);
      if (!analysis?.response) throw new Error("Image service unavailable");
      setMessages((current) => [...current, {
        id: (Date.now() + 1).toString(), from: "materna",
        text: `${analysis.description ? `Visible findings: ${analysis.description}\n\n` : ""}${analysis.response}`,
      }]);
    } catch {
      setMessages((current) => [...current, {
        id: (Date.now() + 1).toString(), from: "materna", alert: true,
        text: "Unable to analyze the photo. Check the Materna AI server connection and try again.",
      }]);
    } finally {
      setIsLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }

  return (
    <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: c.background }]}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
    >
      <View style={[styles.header, { borderBottomColor: c.divider }]}>
        <Button onPress={onClose} style={styles.backBtn}>
          <Text style={[styles.backText, { color: c.accent }]}>← Back</Text>
        </Button>
        <Text style={[styles.headerTitle, { color: c.accent }]}>Ask Materna</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.messages}
        keyboardShouldPersistTaps="handled"
      >
        {messages.map((msg) => (
          msg.type === "voice" || msg.type === "image" ? (
          <View key={msg.id} style={[styles.bubble, styles.userBubble, { backgroundColor: c.accent }]}>
            {msg.from === "materna" && (
              <Text style={[styles.senderLabel, { color: msg.alert ? c.alertText : c.textMuted }]}>
                {msg.alert ? "⚠️ Materna Alert" : "Materna"}
              </Text>
            )}
            {msg.type === "voice" && (
              <Text style={styles.multimodalLabel}>🎙 Voice message · transcribed</Text>
            )}
            {msg.type === "image" && msg.imageUri && (
              <>
                <Text style={styles.multimodalLabel}>📷 Photo shared</Text>
                <Image source={{ uri: msg.imageUri }} style={styles.imageThumbnail} />
              </>
            )}
            <Text
              style={[
                styles.bubbleText,
                { color: msg.from === "user" ? "#fff" : msg.alert ? c.alertText : c.text },
              ]}
            >
              {msg.text}
            </Text>
          </View>
          ) : (
          <ChatBubble
            key={msg.id}
            from={msg.from}
            text={msg.text}
            alert={msg.alert}
            colors={c}
          />
          )
        ))}
        {isLoading && (
          <ChatBubble from="materna" loading colors={c} />
        )}
      </ScrollView>

      <View
        style={[
          styles.inputRow,
          { borderTopColor: c.divider, backgroundColor: c.background },
        ]}
      >
        <TextInput
          style={[styles.textInput, { backgroundColor: c.inputBg, borderColor: c.inputBorder, color: c.text }]}
          value={input}
          onChangeText={setInput}
          placeholder="Describe a symptom or ask a question..."
          placeholderTextColor={c.placeholder}
          returnKeyType="send"
          onSubmitEditing={() => handleSend()}
          onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120)}
          multiline
        />
        <TouchableOpacity
          style={[styles.mediaBtn, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}
          onPress={takePhoto}
          disabled={isLoading || isRecording}
          accessibilityLabel="Take photo"
        >
          <Text style={styles.mediaBtnText}>📷</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.mediaBtn, { backgroundColor: isRecording ? "#ef4444" : c.inputBg, borderColor: isRecording ? "#ef4444" : c.inputBorder }]}
          onPressIn={startRecording}
          onPressOut={stopRecording}
          disabled={isLoading}
          accessibilityLabel="Hold to record voice message"
        >
          <Text style={styles.mediaBtnText}>{isRecording ? "⏺" : "🎙"}</Text>
        </TouchableOpacity>
        <Button
          style={[
            styles.sendBtn,
            {
              backgroundColor:
                input.trim() && !isLoading ? c.accent : c.inputBorder,
            },
          ]}
          onPress={() => handleSend()}
          disabled={!input.trim() || isLoading}
        >
          <Text style={styles.sendBtnText}>↑</Text>
        </Button>
      </View>
    </KeyboardAvoidingView>
  );
}

function getColors(mode: "dark" | "light") {
  const isDark = mode === "dark";
  return {
    background: isDark ? "#0f1117" : "#f5f7fa",
    text: isDark ? "#f0f0f0" : "#1a1a1a",
    textMuted: isDark ? "#8a8fa8" : "#6b7280",
    accent: "#6c63ff",
    botBubble: isDark ? "#1c1f2e" : "#ffffff",
    inputBg: isDark ? "#1c1f2e" : "#ffffff",
    inputBorder: isDark ? "#2e3347" : "#d1d5db",
    placeholder: isDark ? "#4a4f66" : "#9ca3af",
    divider: isDark ? "#1e2233" : "#e5e7eb",
    alertBg: isDark ? "#2a1a1a" : "#fff5f5",
    alertBorder: "#ff4444",
    alertText: "#ff6b6b",
  };
}

const colors = { dark: getColors("dark"), light: getColors("light") };

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    paddingTop: Platform.OS === "ios" ? 54 : 40,
  },
  backBtn: { width: 60 },
  backText: { fontSize: 15, fontWeight: "600" },
  headerTitle: { fontSize: 16, fontWeight: "800", letterSpacing: 2 },
  messages: { padding: 16, paddingBottom: 24 },
  bubble: {
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    maxWidth: "85%",
  },
  userBubble: { alignSelf: "flex-end", borderBottomRightRadius: 4 },
  botBubble: { alignSelf: "flex-start", borderBottomLeftRadius: 4 },
  senderLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 1, marginBottom: 4 },
  multimodalLabel: { color: "#ffffff", fontSize: 10, fontWeight: "700", marginBottom: 6 },
  imageThumbnail: { width: 180, height: 135, borderRadius: 9, marginBottom: 7, backgroundColor: "#d1d5db" },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 12,
    borderTopWidth: 1,
    paddingBottom: Platform.OS === "ios" ? 26 : 18,
    marginBottom: Platform.OS === "ios" ? 6 : 8,
    gap: 8,
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  mediaBtn: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  mediaBtnText: { fontSize: 17 },
  sendBtnText: { color: "#fff", fontSize: 18, fontWeight: "700" },
});
