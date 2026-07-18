import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

type AnimatedWaveProps = {
  color: string;
};

function WaveBar({ delay, color }: { delay: number; color: string }) {
  const animation = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(animation, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(animation, { toValue: 0.3, duration: 400, useNativeDriver: true }),
      ])
    );

    loop.start();
    return () => loop.stop();
  }, [animation, delay]);

  return (
    <Animated.View
      style={[
        styles.bar,
        { backgroundColor: color, opacity: animation, transform: [{ scaleY: animation }] },
      ]}
    />
  );
}

/** A compact, looping waveform used beneath vital readings. */
export default function AnimatedWave({ color }: AnimatedWaveProps) {
  const delays = [0, 80, 160, 240, 320, 240, 160, 80, 0, 80, 160, 240];

  return (
    <View style={styles.wave}>
      {delays.map((delay, index) => (
        <WaveBar key={index} delay={delay} color={color} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wave: { flexDirection: "row", alignItems: "center", height: 20, marginTop: 10 },
  bar: { width: 3, height: 14, borderRadius: 2, marginHorizontal: 1.5 },
});
