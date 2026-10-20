import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import Icon from "@react-native-vector-icons/material-design-icons";
import * as Haptics from "expo-haptics";
import { colors, radius, spacing } from "@/src/theme";

type Props = {
  value: number;
  onChange: (delta: number) => void;
  size?: number;
  disabled?: boolean;
  testIDPrefix?: string;
};

export function QuantityStepper({ value, onChange, size = 44, disabled, testIDPrefix = "stepper" }: Props) {
  const press = (delta: number) => {
    if (disabled) return;
    try { Haptics.selectionAsync(); } catch {}
    onChange(delta);
  };
  const minusDisabled = value <= 0 || disabled;
  return (
    <View style={styles.row}>
      <Pressable
        testID={`${testIDPrefix}-minus`}
        onPress={() => press(-1)}
        disabled={minusDisabled}
        style={[styles.btn, { width: size, height: size, opacity: minusDisabled ? 0.35 : 1 }]}
      >
        <Icon name="minus" size={22} color={colors.onSurface} />
      </Pressable>
      <View style={[styles.valueBox, { height: size }]}>
        <Text testID={`${testIDPrefix}-value`} style={styles.value}>{value}</Text>
      </View>
      <Pressable
        testID={`${testIDPrefix}-plus`}
        onPress={() => press(1)}
        disabled={disabled}
        style={[styles.btnPrimary, { width: size, height: size, opacity: disabled ? 0.5 : 1 }]}
      >
        <Icon name="plus" size={22} color={colors.onBrandPrimary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  btn: {
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnPrimary: {
    borderRadius: radius.md,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  valueBox: {
    minWidth: 42,
    paddingHorizontal: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  value: { fontSize: 18, fontWeight: "700", color: colors.onSurface },
});
