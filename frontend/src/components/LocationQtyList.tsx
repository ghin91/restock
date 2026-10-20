import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Icon from "@react-native-vector-icons/material-design-icons";
import { Product } from "@/src/api";
import { colors, radius, spacing } from "@/src/theme";
import { QuantityStepper } from "./QuantityStepper";

type Props = {
  product: Product;
  onDelta: (location: string, delta: number) => void;
  testIDPrefix?: string;
};

// Per-location availability with its own stepper, plus the product total.
export function LocationQtyList({ product, onDelta, testIDPrefix = "loc" }: Props) {
  return (
    <View style={styles.wrap}>
      {product.locations.map((l) => (
        <View key={l.location} style={styles.row} testID={`${testIDPrefix}-row-${l.location}`}>
          <Icon name="map-marker-outline" size={18} color={colors.brandPrimary} />
          <Text style={styles.name} numberOfLines={1}>{l.location}</Text>
          <QuantityStepper
            testIDPrefix={`${testIDPrefix}-${l.location}`}
            value={l.quantity}
            onChange={(d) => onDelta(l.location, d)}
          />
        </View>
      ))}
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Totale</Text>
        <Text testID={`${testIDPrefix}-total`} style={styles.totalValue}>
          {product.total_quantity} {product.unit}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  name: { flex: 1, fontSize: 15, fontWeight: "700", color: colors.onSurface },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.md,
    backgroundColor: colors.surfaceTertiary,
  },
  totalLabel: { fontWeight: "800", color: colors.onSurface },
  totalValue: { fontWeight: "800", fontSize: 16, color: colors.onSurface },
});
