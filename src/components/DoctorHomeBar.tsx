import Button from "./Button";
import React, { useEffect, useRef, useState } from "react";
import { Animated, LayoutChangeEvent, StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import { FileText, House, UserRound, Users } from "lucide-react-native";

export type DoctorTab = "home" | "patients" | "reports" | "profile";

type DoctorHomeBarProps = {
  activeTab: DoctorTab;
  onTabChange: (tab: DoctorTab) => void;
  theme: "dark" | "light";
};

const tabs = [
  { id: "home" as const, label: "Home", Icon: House },
  { id: "patients" as const, label: "Patients", Icon: Users },
  { id: "reports" as const, label: "Reports", Icon: FileText },
  { id: "profile" as const, label: "Profile", Icon: UserRound },
];

export default function DoctorHomeBar({ activeTab, onTabChange, theme }: DoctorHomeBarProps) {
  const [tabWidth, setTabWidth] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;
  const dark = theme === "dark";
  const activeIndex = tabs.findIndex((tab) => tab.id === activeTab);
  const activeColor = dark ? "#ffffff" : "#0f172a";
  const inactiveColor = dark ? "rgba(255,255,255,0.58)" : "rgba(15,23,42,0.48)";

  useEffect(() => {
    if (!tabWidth || activeIndex < 0) return;
    Animated.spring(translateX, {
      toValue: activeIndex * tabWidth,
      damping: 18,
      stiffness: 240,
      useNativeDriver: true,
    }).start();
  }, [activeIndex, tabWidth, translateX]);

  function handleLayout(event: LayoutChangeEvent) {
    setTabWidth(event.nativeEvent.layout.width / tabs.length);
  }

  return (
    <View style={styles.safeArea} pointerEvents="box-none">
      <BlurView
        intensity={dark ? 48 : 64}
        tint={dark ? "dark" : "light"}
        style={[
          styles.wrapper,
          {
            backgroundColor: dark ? "rgba(15,17,23,0.22)" : "rgba(255,255,255,0.24)",
            borderColor: dark ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.65)",
          },
        ]}
        onLayout={handleLayout}
      >
        {tabWidth > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.indicator,
              {
                width: tabWidth - 12,
                backgroundColor: dark ? "rgba(255,255,255,0.15)" : "rgba(15,23,42,0.09)",
                transform: [{ translateX: Animated.add(translateX, 6) }],
              },
            ]}
          />
        )}
        {tabs.map(({ id, label, Icon }) => {
          const active = activeTab === id;
          return (
            <Button
              key={id}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
              onPress={() => onTabChange(id)}
            >
              <Icon size={24} color={active ? activeColor : inactiveColor} strokeWidth={active ? 2.7 : 2} />
            </Button>
          );
        })}
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 10, elevation: 20, height: 104, justifyContent: "flex-end", paddingHorizontal: 16, paddingBottom: 18 },
  wrapper: { height: 70, borderRadius: 35, borderWidth: 1, flexDirection: "row", overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.28, shadowRadius: 12, elevation: 8 },
  indicator: { position: "absolute", top: 11, height: 48, borderRadius: 24 },
  tab: { flex: 1, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.72, transform: [{ scale: 0.92 }] },
});
