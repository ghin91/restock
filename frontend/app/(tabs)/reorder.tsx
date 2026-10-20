import React from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Share, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Icon from "@react-native-vector-icons/material-design-icons";
import { api, Product } from "@/src/api";
import { colors, radius, spacing } from "@/src/theme";
import { QuantityStepper } from "@/src/components/QuantityStepper";
import { useActiveStock } from "@/src/stock-context";
import { StockSwitcher } from "@/src/components/StockSwitcher";

export default function Reorder() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { activeStock } = useActiveStock();
  const stockId = activeStock?.id;
  const reorder = useQuery({ queryKey: ["reorder", stockId], queryFn: () => api.reorderList(stockId!), enabled: !!stockId });

  const onDelta = async (id: string, delta: number) => {
    const updated = await api.changeQuantity(id, delta);
    qc.setQueryData<Product[]>(["reorder", stockId], (prev) =>
      prev ? prev.map((p) => (p.id === id ? updated : p)) : prev
    );
    qc.invalidateQueries({ queryKey: ["products", stockId] });
    qc.invalidateQueries({ queryKey: ["stats", stockId] });
    qc.invalidateQueries({ queryKey: ["reorder", stockId] });
  };

  const share = async () => {
    const items = reorder.data || [];
    if (items.length === 0) return;
    const header = activeStock ? `Lista di riordino — ${activeStock.name}` : "Lista di riordino";
    const lines = items.map((p) => `• ${p.name} — ${p.location} — attuale ${p.quantity}${p.unit}, min ${p.min_threshold}`);
    const message = `${header}\n\n${lines.join("\n")}`;
    try { await Share.share({ message }); } catch {}
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <StockSwitcher />
        <View style={{ marginTop: spacing.sm }}>
          <Text style={styles.h1}>Da riordinare</Text>
          <Text style={styles.sub}>Prodotti sotto la soglia minima o segnati manualmente</Text>
        </View>
      </View>

      {reorder.isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>
      ) : (reorder.data?.length ?? 0) === 0 ? (
        <View style={styles.center}>
          <Icon name="package-variant" size={56} color={colors.success} />
          <Text style={styles.emptyT}>Tutto in ordine!</Text>
          <Text style={styles.emptyS}>Nessun prodotto da riordinare al momento</Text>
        </View>
      ) : (
        <>
          <FlatList
            data={reorder.data}
            keyExtractor={(p) => p.id}
            renderItem={({ item }) => <ReorderRow product={item} onDelta={onDelta} onPress={() => router.push(`/product/${item.id}` as any)} />}
            contentContainerStyle={{
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.md,
              paddingBottom: 120 + insets.bottom,
              gap: spacing.sm,
            }}
            showsVerticalScrollIndicator={false}
          />
          <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
            <Pressable testID="share-list-btn" onPress={share} style={styles.cta}>
              <Icon name="share-variant" size={20} color={colors.onBrandPrimary} />
              <Text style={styles.ctaText}>Condividi lista</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

function ReorderRow({ product, onDelta, onPress }: { product: Product; onDelta: (id: string, d: number) => void; onPress: () => void }) {
  const out = product.quantity === 0;
  return (
    <Pressable
      testID={`reorder-row-${product.id}`}
      onPress={onPress}
      style={styles.row}
    >
      <View style={[styles.badge, { backgroundColor: out ? colors.error : colors.warning }]}>
        <Text style={[styles.badgeText, { color: out ? colors.onError : colors.onWarning }]}>{product.quantity}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>{product.name}</Text>
        <Text style={styles.meta}>{product.location} · min {product.min_threshold} {product.unit}</Text>
        {product.manual_reorder && (
          <View style={styles.manualTag}>
            <Icon name="flag-outline" size={11} color={colors.info} />
            <Text style={styles.manualTagText}>Manuale</Text>
          </View>
        )}
      </View>
      <QuantityStepper testIDPrefix={`reorder-${product.id}`} value={product.quantity} onChange={(d) => onDelta(product.id, d)} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  h1: { fontSize: 26, fontWeight: "800", color: colors.onSurface },
  sub: { color: colors.muted, marginTop: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.xl },
  emptyT: { fontSize: 18, fontWeight: "800", color: colors.onSurface, marginTop: spacing.sm },
  emptyS: { color: colors.muted, textAlign: "center" },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  badge: {
    minWidth: 48, height: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  badgeText: { fontSize: 18, fontWeight: "800" },
  name: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  meta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  manualTag: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4, alignSelf: "flex-start",
    backgroundColor: "#EFF6FF", borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  manualTagText: { color: colors.info, fontSize: 10, fontWeight: "800" },
  footer: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm,
    backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border,
  },
  cta: {
    flexDirection: "row", gap: spacing.sm, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.brandPrimary, paddingVertical: spacing.md, borderRadius: radius.md,
  },
  ctaText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 15 },
});
