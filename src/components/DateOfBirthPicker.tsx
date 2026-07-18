import Button from "./Button";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import React, { useState } from "react";
import {
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type PickerColors = {
  text: string;
  textMuted: string;
  inputBg: string;
  inputBorder: string;
  placeholder: string;
  accent: string;
};

type DateOfBirthPickerProps = {
  value: string;
  onChange: (value: string) => void;
  colors: PickerColors;
};

function parseStoredDate(value: string) {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;

  const [, month, day, year] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatStoredDate(date: Date) {
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(
    date.getDate()
  ).padStart(2, "0")}/${date.getFullYear()}`;
}

/** A platform-native date picker that stores dates as MM/DD/YYYY. */
export default function DateOfBirthPicker({
  value,
  onChange,
  colors,
}: DateOfBirthPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [draftDate, setDraftDate] = useState(new Date(2000, 0, 1));
  const selectedDate = parseStoredDate(value) ?? new Date(2000, 0, 1);
  const maximumDate = new Date();
  const minimumDate = new Date(1900, 0, 1);

  function openPicker() {
    setDraftDate(selectedDate);
    setIsOpen(true);
  }

  function handleNativeChange(event: DateTimePickerEvent, nextDate?: Date) {
    if (Platform.OS === "android") {
      setIsOpen(false);
      if (event.type === "set" && nextDate) onChange(formatStoredDate(nextDate));
      return;
    }

    if (nextDate) setDraftDate(nextDate);
  }

  if (Platform.OS === "web") {
    return (
      <View style={styles.wrapper}>
        <Text style={[styles.label, { color: colors.textMuted }]}>Date of birth *</Text>
        <TextInput
          accessibilityLabel="Date of birth"
          value={value}
          onChangeText={onChange}
          placeholder="MM/DD/YYYY"
          placeholderTextColor={colors.placeholder}
          keyboardType="numbers-and-punctuation"
          style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
        />
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <Text style={[styles.label, { color: colors.textMuted }]}>Date of birth *</Text>
      <Button
        accessibilityRole="button"
        accessibilityLabel="Choose date of birth"
        onPress={openPicker}
        style={[styles.input, styles.pickerButton, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
      >
        <Text style={{ color: value ? colors.text : colors.placeholder }}>
          {value || "Choose date of birth"}
        </Text>
      </Button>

      {Platform.OS === "android" && isOpen && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display="default"
          maximumDate={maximumDate}
          minimumDate={minimumDate}
          onChange={handleNativeChange}
        />
      )}

      {Platform.OS === "ios" && (
        <Modal
          visible={isOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setIsOpen(false)}
        >
          <Button style={styles.overlay} onPress={() => setIsOpen(false)}>
            <Button
              style={[styles.sheet, { backgroundColor: colors.inputBg }]}
              onPress={() => undefined}
            >
              <Text style={[styles.sheetTitle, { color: colors.text }]}>Date of birth</Text>
              <DateTimePicker
                value={draftDate}
                mode="date"
                display="spinner"
                maximumDate={maximumDate}
                minimumDate={minimumDate}
                onChange={handleNativeChange}
                textColor={colors.text}
              />
              <View style={styles.actions}>
                <Button onPress={() => setIsOpen(false)} style={styles.action}>
                  <Text style={{ color: colors.textMuted }}>Cancel</Text>
                </Button>
                <Button
                  onPress={() => {
                    onChange(formatStoredDate(draftDate));
                    setIsOpen(false);
                  }}
                  style={styles.action}
                >
                  <Text style={{ color: colors.accent, fontWeight: "700" }}>Done</Text>
                </Button>
              </View>
            </Button>
          </Button>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 14 },
  label: { fontSize: 12, fontWeight: "600", marginBottom: 5 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15 },
  pickerButton: { minHeight: 44, justifyContent: "center" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 18 },
  sheetTitle: { fontSize: 16, fontWeight: "800", textAlign: "center" },
  actions: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 14, paddingVertical: 14, gap: 22 },
  action: { paddingVertical: 6, paddingHorizontal: 4 },
});
