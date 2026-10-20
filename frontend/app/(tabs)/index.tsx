import React from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import Icon from "@react-native-vector-icons/material-design-icons";
import { api } from "@/src/api";
import { colors, radius, spacing } from "@/src/theme";
import { useActiveStock } from "@/src/stock-context";
import { StockSwitcher } from "@/src/components/StockSwitcher";

export default function Home() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { activeStock } = useActiveStock();
  const stockId = activeStock?.id;
  const stats = useQuery({ queryKey: ["stats", stockId], queryFn: () => api.stats(stockId!), enabled: !!stockId });
  const reorder = useQuery({ queryKey: ["reorder", stockId], queryFn: () => api.reorderList(stockId!), enabled: !!stockId });

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + spacing.md,
          paddingBottom: spacing.xl,
          paddingHorizontal: spacing.lg,
          gap: spacing.lg,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ gap: spacing.sm }}>
          <StockSwitcher />
          <Text style={styles.hello}>Ciao 👋</Text>
          <Text style={styles.title}>StockCount Pro</Text>
        </View>

        <View style={styles.tilesRow}>
          <View style={[styles.tile, { backgroundColor: colors.brandTertiary }]} testID="tile-total">
            <Icon name="package-variant" size={22} color={colors.brandPrimary} />
            <Text style={styles.tileNum}>{stats.data?.total_products ?? "–"}</Text>
            <Text style={styles.tileLabel}>Prodotti</Text>
          </View>
          <View style={[styles.tile, { backgroundColor: "#FFF4E0" }]} testID="tile-low">
            <Icon name="alert-circle-outline" size={22} color={colors.warning} />
            <Text style={styles.tileNum}>{stats.data?.low_stock ?? "–"}</Text>
            <Text style={styles.tileLabel}>Da riordinare</Text>
          </View>
          <View style={[styles.tile, { backgroundColor: "#E7F6EE" }]} testID="tile-units">
            <Icon name="layers-triple-outline" size={22} color={colors.success} />
            <Text style={styles.tileNum}>{stats.data?.total_units ?? "–"}</Text>
            <Text style={styles.tileLabel}>Unità totali</Text>
          </View>
        </View>

        <Pressable
          testID="hero-scan"
          onPress={() => router.push("/(tabs)/scanner" as any)}
          style={styles.hero}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>Scansiona per contare</Text>
            <Text style={styles.heroSub}>Punta la fotocamera al codice a barre</Text>
          </View>
          <View style={styles.heroIcon}>
            <Icon name="barcode-scan" size={30} color={colors.onBrandPrimary} />
          </View>
        </Pressable>

        <View style={styles.actionsRow}>
          <Pressable
            testID="action-new-product"
            onPress={() => router.push("/product/new" as any)}
            style={styles.action}
          >
            <Icon name="plus-box-outline" size={22} color={colors.onSurface} />
            <Text style={styles.actionText}>Nuovo prodotto</Text>
          </Pressable>
          <Pressable
            testID="action-locations"
            onPress={() => router.push("/locations" as any)}
            style={styles.action}
          >
            <Icon name="map-marker-multiple-outline" size={22} color={colors.onSurface} />
            <Text style={styles.actionText}>Ubicazioni</Text>
          </Pressable>
        </View>

        <View>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Avvisi scorte basse</Text>
            <Pressable testID="see-all-reorder" onPress={() => router.push("/(tabs)/reorder" as any)}>
              <Text style={styles.link}>Vedi tutti</Text>
            </Pressable>
          </View>
          {reorder.isLoading ? (
            <ActivityIndicator color={colors.brandPrimary} />
          ) : (reorder.data?.length ?? 0) === 0 ? (
            <View style={styles.empty}>
              <Icon name="check-circle-outline" size={28} color={colors.success} />
              <Text style={styles.emptyText}>Tutto in ordine, nessun prodotto scarso!</Text>
            </View>
          ) : (
            <View style={{ gap: spacing.sm }}>
              {reorder.data!.slice(0, 3).map((p) => (
                <View key={p.id} style={styles.lowCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.lowName}>{p.name}</Text>
                    <Text style={styles.lowMeta}>{p.location} · min {p.min_threshold}</Text>
                  </View>
                  <View style={styles.qtyBadge}>
                    <Text style={styles.qtyBadgeText}>{p.quantity}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  hello: { fontSize: 14, color: colors.muted },
  title: { fontSize: 28, fontWeight: "800", color: colors.onSurface, marginTop: 2 },
  tilesRow: { flexDirection: "row", gap: spacing.sm },
  tile: {
    flex: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 6,
  },
  tileNum: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
  tileLabel: { fontSize: 11, color: colors.onSurface, fontWeight: "600" },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 10 },
      android: { elevation: 4 },
    }),
  },
  heroTitle: { color: colors.onBrandPrimary, fontSize: 18, fontWeight: "800" },
  heroSub: { color: colors.onBrandPrimary, fontSize: 13, marginTop: 2, opacity: 0.9 },
  heroIcon: {
    width: 56, height: 56, borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center",
  },
  actionsRow: { flexDirection: "row", gap: spacing.sm },
  action: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  actionText: { fontWeight: "700", color: colors.onSurface },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
  link: { color: colors.brandPrimary, fontWeight: "700" },
  empty: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyText: { color: colors.onSurface, fontWeight: "600", flex: 1 },
  lowCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  lowName: { fontWeight: "700", color: colors.onSurface },
  lowMeta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  qtyBadge: {
    minWidth: 44, height: 32, borderRadius: radius.pill,
    backgroundColor: colors.error, alignItems: "center", justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  qtyBadgeText: { color: colors.onError, fontWeight: "800" },
});
