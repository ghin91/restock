import React, { useMemo, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput, ScrollView, ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Icon from "@react-native-vector-icons/material-design-icons";
import { api, Product } from "@/src/api";
import { colors, radius, spacing } from "@/src/theme";
import { ProductRow } from "@/src/components/ProductRow";
import { useActiveStock } from "@/src/stock-context";
import { StockSwitcher } from "@/src/components/StockSwitcher";

export default function Inventory() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { activeStock } = useActiveStock();
  const stockId = activeStock?.id;
  const [q, setQ] = useState("");
  const [loc, setLoc] = useState<string | null>(null);

  const products = useQuery({
    queryKey: ["products", stockId, q, loc],
    queryFn: () => api.listProducts(stockId!, { q: q || undefined, location: loc || undefined }),
    enabled: !!stockId,
  });
  const locations = useQuery({ queryKey: ["locations", stockId], queryFn: () => api.listLocations(stockId!), enabled: !!stockId });

  const onDelta = async (id: string, location: string, delta: number) => {
    try {
      const updated = await api.changeLocationQuantity(id, location, delta);
      qc.setQueryData<Product[]>(["products", stockId, q, loc], (prev) =>
        prev ? prev.map((p) => (p.id === id ? updated : p)) : prev
      );
      qc.invalidateQueries({ queryKey: ["stats", stockId] });
      qc.invalidateQueries({ queryKey: ["reorder", stockId] });
    } catch (e) {
      console.warn(e);
    }
  };

  const chips = useMemo(() => [{ id: "all", name: "Tutte" }, ...(locations.data || [])], [locations.data]);

  return (
    <View style={styles.container}>
      {/* Sticky header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <StockSwitcher />
            <Text style={[styles.h1, { marginTop: spacing.sm }]}>Inventario</Text>
          </View>
          <Pressable
            testID="add-product-btn"
            onPress={() => router.push("/product/new" as any)}
            style={styles.addBtn}
          >
            <Icon name="plus" size={20} color={colors.onBrandPrimary} />
          </Pressable>
        </View>
        <View style={styles.searchBox}>
          <Icon name="magnify" size={18} color={colors.muted} />
          <TextInput
            testID="search-input"
            value={q}
            onChangeText={setQ}
            placeholder="Cerca prodotto…"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
          />
          {q.length > 0 && (
            <Pressable onPress={() => setQ("")}>
              <Icon name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          )}
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {chips.map((c) => {
            const selected = (c.id === "all" && !loc) || c.name === loc;
            return (
              <Pressable
                key={c.id}
                testID={`chip-${c.name}`}
                onPress={() => setLoc(c.id === "all" ? null : c.name)}
                style={[styles.chip, selected && styles.chipActive]}
              >
                <Text style={[styles.chipText, selected && styles.chipTextActive]}>{c.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {products.isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>
      ) : (products.data?.length ?? 0) === 0 ? (
        <View style={styles.center}>
          <Icon name="package-variant-closed" size={48} color={colors.muted} />
          <Text style={styles.emptyT}>Nessun prodotto trovato</Text>
          <Pressable style={styles.addProductBtn} onPress={() => router.push("/product/new" as any)}>
            <Text style={styles.addProductText}>+ Aggiungi prodotto</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={products.data}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => <ProductRow product={item} focusLocation={loc} onDelta={onDelta} />}
          contentContainerStyle={{
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.md,
            paddingBottom: spacing.xl,
            gap: spacing.sm,
          }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  h1: { fontSize: 26, fontWeight: "800", color: colors.onSurface },
  addBtn: {
    width: 40, height: 40, borderRadius: radius.md,
    backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center",
  },
  searchBox: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.md, paddingHorizontal: spacing.md, height: 44,
  },
  searchInput: { flex: 1, color: colors.onSurface, fontSize: 15 },
  chipsRow: { paddingVertical: spacing.sm, gap: spacing.sm, paddingRight: spacing.lg },
  chip: {
    flexShrink: 0,
    height: 36, paddingHorizontal: spacing.md,
    borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.onSurface, borderColor: colors.onSurface },
  chipText: { fontSize: 13, color: colors.onSurface, fontWeight: "600" },
  chipTextActive: { color: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xl },
  emptyT: { color: colors.muted, fontWeight: "600" },
  addProductBtn: {
    backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.md,
  },
  addProductText: { color: colors.onBrandPrimary, fontWeight: "700" },
});
