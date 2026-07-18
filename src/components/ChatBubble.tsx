import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

type BubbleColors = {
  accent: string;
  botBubble: string;
  text: string;
  textMuted: string;
  alertBg: string;
  alertBorder: string;
  alertText: string;
};

type ChatBubbleProps = {
  from: "user" | "materna";
  text?: string;
  alert?: boolean;
  loading?: boolean;
  colors: BubbleColors;
};

/** A themed chat-message bubble for Materna and patient messages. */
export default function ChatBubble({
  from,
  text,
  alert = false,
  loading = false,
  colors,
}: ChatBubbleProps) {
  const isUser = from === "user";
  const backgroundColor = isUser
    ? colors.accent
    : alert
      ? colors.alertBg
      : colors.botBubble;

  return (
    <View
      style={[
        styles.bubble,
        isUser ? styles.userBubble : styles.maternaBubble,
        { backgroundColor },
        alert && styles.alertBubble,
        alert && { borderColor: colors.alertBorder },
      ]}
    >
      {!isUser && (
        <Text style={[styles.senderLabel, { color: alert ? colors.alertText : colors.textMuted }]}>
          {alert ? "⚠️ Materna Alert" : "Materna"}
        </Text>
      )}
      {loading ? (
        <ActivityIndicator size="small" color={colors.accent} />
      ) : (
        <Text style={[styles.messageText, { color: isUser ? "#ffffff" : alert ? colors.alertText : colors.text }]}>
          {text}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    maxWidth: "85%",
  },
  userBubble: { alignSelf: "flex-end", borderBottomRightRadius: 4 },
  maternaBubble: { alignSelf: "flex-start", borderBottomLeftRadius: 4 },
  alertBubble: { borderWidth: 1 },
  senderLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 1, marginBottom: 4 },
  messageText: { fontSize: 15, lineHeight: 22 },
});
