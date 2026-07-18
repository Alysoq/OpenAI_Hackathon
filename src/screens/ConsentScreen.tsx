import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

export default function ConsentScreen({ onChoose }: { onChoose: (consent: boolean) => void }) {
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.brand}>MATERNA</Text>
      <Text style={styles.title}>Help improve maternal health AI?</Text>
      <Text style={styles.body}>
        You may choose to share anonymized health data to help improve Materna’s maternal-health research tools. This is optional and does not affect your care or app access.
      </Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>What may be collected</Text>
        <Text style={styles.item}>• Vital-sign trends and pregnancy week</Text>
        <Text style={styles.item}>• Reported symptoms and health-history categories</Text>
        <Text style={styles.item}>• Risk-assessment outcomes</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>How it is protected</Text>
        <Text style={styles.item}>• Direct identifiers are removed before research use</Text>
        <Text style={styles.item}>• Your choice is stored on this device</Text>
        <Text style={styles.item}>• You can change your profile information later</Text>
      </View>
      <Pressable style={styles.accept} onPress={() => onChoose(true)}>
        <Text style={styles.acceptText}>I consent to anonymized data sharing</Text>
      </Pressable>
      <Pressable style={styles.decline} onPress={() => onChoose(false)}>
        <Text style={styles.declineText}>No thanks, continue without sharing</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, padding: 24, justifyContent: "center", backgroundColor: "#05070A" },
  brand: { color: "#22C55E", fontWeight: "900", letterSpacing: 3, fontSize: 14 },
  title: { color: "#F8FAFC", fontSize: 27, lineHeight: 33, fontWeight: "900", marginTop: 13 },
  body: { color: "#CBD5E1", fontSize: 14, lineHeight: 21, marginTop: 13, marginBottom: 16 },
  card: { backgroundColor: "#101418", borderColor: "#242B33", borderWidth: 1, borderRadius: 10, padding: 14, marginBottom: 10 },
  cardTitle: { color: "#F8FAFC", fontSize: 13, fontWeight: "800", marginBottom: 7 },
  item: { color: "#CBD5E1", fontSize: 12, lineHeight: 19 },
  accept: { backgroundColor: "#22C55E", borderRadius: 9, padding: 14, alignItems: "center", marginTop: 14 },
  acceptText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  decline: { padding: 14, alignItems: "center" },
  declineText: { color: "#94A3B8", fontSize: 12, fontWeight: "700", textAlign: "center" },
});
