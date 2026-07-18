import Button from "./Button";
import React, { useEffect, useRef, useState } from "react";
import { Animated, LayoutChangeEvent, StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import { HeartPulse, Hospital, House, TriangleAlert, UserRound } from "lucide-react-native";
import type { SensorData } from "../data/sampleSensorData";

export type PatientTab = "Today" | "Vitals" | "Hospitals" | "Profile";

type HomeBarProps = {
  activeTab: PatientTab;
  onTabChange: (tab: PatientTab) => void;
  onEmergencyPress: () => void;
  theme: "dark" | "light";
  sensorData: SensorData;
};

type Tab = {
  id: PatientTab | "Emergency";
  Icon: typeof House;
};

const tabs: Tab[] = [
  { id: "Today", Icon: House },
  { id: "Vitals", Icon: HeartPulse },
  { id: "Emergency", Icon: TriangleAlert },
  { id: "Hospitals", Icon: Hospital },
  { id: "Profile", Icon: UserRound },
];

export default function HomeBar({
  activeTab,
  onTabChange,
  onEmergencyPress,
  theme,
  sensorData,
}: HomeBarProps) {
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

        {tabs.map(({ id, Icon }) => {
          const emergency = id === "Emergency";
          const active = id === activeTab;
          const color = emergency ? "#ff4d5e" : active ? activeColor : inactiveColor;

          return (
            <Button
              key={id}
              accessibilityRole="tab"
              accessibilityLabel={emergency ? "Open emergency help" : id}
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
              onPress={() => emergency ? onEmergencyPress() : onTabChange(id)}
            >
              <View>
                <Icon size={24} color={color} strokeWidth={active ? 2.7 : 2} />
                {id === "Today" && (
                  <View style={[styles.riskDot, { backgroundColor: sensorData.risk.color }]} />
                )}
              </View>
            </Button>
          );
        })}
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    height: 104,
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    paddingBottom: 18,
    elevation: 20,
  },
  wrapper: {
    height: 70,
    borderRadius: 35,
    borderWidth: 1,
    flexDirection: "row",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 8,
  },
  indicator: {
    position: "absolute",
    top: 11,
    height: 48,
    borderRadius: 24,
  },
  tab: { flex: 1, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.72, transform: [{ scale: 0.92 }] },
  riskDot: {
    position: "absolute",
    top: -2,
    right: -5,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "#0f1117",
  },
});
