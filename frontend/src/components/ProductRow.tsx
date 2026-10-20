import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { Product } from "@/src/api";
import { colors, radius, spacing } from "@/src/theme";
import { QuantityStepper } from "./QuantityStepper";
import { StockHealthBar } from "./StockHealthBar";

type Props = {
  product: Product;
  onDelta: (id: string, delta: number) => void;
};

export function ProductRow({ product, onDelta }: Props) {
  const router = useRouter();
  const low = product.quantity <= product.min_threshold;
  const out = product.quantity === 0;
  return (
    <Pressable
      testID={`product-row-${product.id}`}
      onPress={() => router.push(`/product/${product.id}` as any)}
      style={styles.row}
    >
      <View style={styles.thumb}>
        <Icon name="package-variant-closed" size={26} color={colors.brandPrimary} />
      </View>
      <View style={styles.center}>
        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={1}>{product.name}</Text>
          {out ? (
            <View style={[styles.badge, { backgroundColor: colors.error }]}>
              <Text style={styles.badgeText}>Esaurito</Text>
            </View>
          ) : low ? (
            <View style={[styles.badge, { backgroundColor: colors.warning }]}>
              <Text style={[styles.badgeText, { color: colors.onWarning }]}>Scarso</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.metaRow}>
          <Icon name="map-marker-outline" size={14} color={colors.muted} />
          <Text style={styles.meta}>{product.location}</Text>
          <Text style={styles.dot}>·</Text>
          <Text style={styles.meta}>min {product.min_threshold} {product.unit}</Text>
        </View>
        <View style={{ marginTop: spacing.xs }}>
          <StockHealthBar quantity={product.quantity} threshold={product.min_threshold} />
        </View>
      </View>
      <QuantityStepper
        testIDPrefix={`stepper-${product.id}`}
        value={product.quantity}
        onChange={(d) => onDelta(product.id, d)}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  center: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  name: { flexShrink: 1, fontSize: 15, fontWeight: "700", color: colors.onSurface },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill },
  badgeText: { fontSize: 10, fontWeight: "800", color: colors.onError, letterSpacing: 0.3 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  meta: { fontSize: 12, color: colors.muted },
  dot: { color: colors.muted, marginHorizontal: 2 },
});
