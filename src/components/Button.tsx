import React from "react";
import { Pressable, type PressableProps } from "react-native";

type ButtonProps = PressableProps & {
  /** Compatibility with legacy TouchableOpacity call sites. */
  activeOpacity?: number;
};

/**
 * Shared app button primitive. It preserves caller-provided styling while
 * providing consistent pressed feedback and an accessible button role.
 */
export default function Button({
  accessibilityRole,
  activeOpacity = 0.78,
  disabled,
  style,
  ...props
}: ButtonProps) {
  return (
    <Pressable
      accessibilityRole={accessibilityRole ?? "button"}
      disabled={disabled}
      style={(state) => [
        typeof style === "function" ? style(state) : style,
        state.pressed && !disabled && { opacity: activeOpacity },
      ]}
      {...props}
    />
  );
}
