import React from "react";
import { StyleSheet } from "react-native";
import Button from "./Button";
import { MotiView } from "moti";
import { Easing } from "react-native-reanimated";

type ToggleButtonProps = {
  isActive: boolean;
  onPress: () => void;
  size?: number;
  accessibilityLabel: string;
  activeTrackColor?: string;
  inactiveTrackColor?: string;
  disabled?: boolean;
};

/** An animated, controlled replacement for React Native's Switch. */
export default function ToggleButton({
  isActive,
  onPress,
  size = 20,
  accessibilityLabel,
  activeTrackColor = "black",
  inactiveTrackColor = "lightgray",
  disabled = false,
}: ToggleButtonProps) {
  const height = size;
  const width = size * 2.3;
  const transition = {
    type: "timing" as const,
    duration: 500,
    easing: Easing.inOut(Easing.ease),
  };

  return (
    <Button
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: isActive, disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.pressable, pressed && !disabled && styles.pressed]}
    >
      <MotiView
        animate={{ backgroundColor: isActive ? activeTrackColor : inactiveTrackColor }}
        transition={transition}
        style={{
          height,
          width,
          borderRadius: height / 2,
          alignItems: "center",
          justifyContent: "center",
          elevation: 7,
        }}
      >
        <MotiView
          animate={{ transform: [{ translateX: isActive ? width / 4 : -width / 4 }] }}
          transition={transition}
          style={{
            height: height * 1.3,
            aspectRatio: 1,
            borderRadius: 100,
            alignItems: "center",
            justifyContent: "center",
            padding: 5,
            backgroundColor: "white",
          }}
        >
          <MotiView
            animate={{
              borderColor: isActive ? activeTrackColor : inactiveTrackColor,
              width: isActive ? 0 : "100%",
            }}
            transition={transition}
            style={{
              borderWidth: height * 0.2,
              height: "100%",
              borderRadius: 100,
            }}
          />
        </MotiView>
      </MotiView>
    </Button>
  );
}

const styles = StyleSheet.create({
  pressable: { alignSelf: "center" },
  pressed: { opacity: 0.8 },
});
