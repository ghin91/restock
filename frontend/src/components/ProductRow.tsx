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
  // When set, the row shows and edits only that location's quantity.
  focusLocation?: string | null;
  onDelta: (id: string, location: string, delta: number) => void;
};

export function ProductRow({ product, focusLocation, onDelta }: Props) {
  const router = useRouter();
  const total = product.total_quantity;
  const low = total <= product.min_threshold;
  const out = total === 0;

  const focused = focusLocation ? product.locations.find((l) => l.location === focusLocation) : null;
  const single = product.locations.length === 1 ? product.locations[0] : null;
  const editable = focused || single;

  const locLabel = focused
    ? `${focused.location} · totale ${total}`
    : single
      ? single.location
      : `${product.locations.length} ubicazioni`;

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
          <Text style={styles.meta} numberOfLines={1}>{locLabel}</Text>
        </View>
        <Text style={styles.meta}>min {product.min_threshold} {product.unit}</Text>
        <View style={{ marginTop: spacing.xs }}>
          <StockHealthBar quantity={total} threshold={product.min_threshold} />
        </View>
      </View>
      {editable ? (
        <QuantityStepper
          testIDPrefix={`stepper-${product.id}`}
          value={editable.quantity}
          onChange={(d) => onDelta(product.id, editable.location, d)}
        />
      ) : (
        <View style={styles.totalBox} testID={`total-${product.id}`}>
          <Text style={styles.totalNum}>{total}</Text>
          <Text style={styles.totalLabel}>totale</Text>
        </View>
      )}
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
  meta: { fontSize: 12, color: colors.muted, flexShrink: 1 },
  totalBox: {
    minWidth: 64, height: 52, borderRadius: radius.md,
    backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  totalNum: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  totalLabel: { fontSize: 10, color: colors.muted, fontWeight: "700" },
});
