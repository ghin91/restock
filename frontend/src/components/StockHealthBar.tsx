import React from "react";
import { View, StyleSheet } from "react-native";
import { colors, radius } from "@/src/theme";

export function StockHealthBar({ quantity, threshold }: { quantity: number; threshold: number }) {
  const target = Math.max(threshold * 2, 1);
  const pct = Math.min(1, quantity / target);
  const color =
    quantity === 0 ? colors.error : quantity <= threshold ? colors.warning : colors.success;
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 6,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: radius.pill },
});
