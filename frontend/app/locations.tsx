import React, { useState } from "react";
import {
  View, Text, StyleSheet, TextInput, Pressable, FlatList, ActivityIndicator, Platform,
  KeyboardAvoidingView, Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Icon from "@react-native-vector-icons/material-design-icons";
import { api, Location } from "@/src/api";
import { colors, radius, spacing } from "@/src/theme";
import { useActiveStock } from "@/src/stock-context";
import { StockSwitcher } from "@/src/components/StockSwitcher";

export default function Locations() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { activeStock } = useActiveStock();
  const stockId = activeStock?.id;
  const [name, setName] = useState("");

  const list = useQuery({
    queryKey: ["locations", stockId],
    queryFn: () => api.listLocations(stockId!),
    enabled: !!stockId,
  });
  const create = useMutation({
    mutationFn: (n: string) => api.createLocation(stockId!, n),
    onSuccess: () => { setName(""); qc.invalidateQueries({ queryKey: ["locations", stockId] }); },
    onError: (e: any) => Alert.alert("Errore", e?.message || "Impossibile creare"),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.deleteLocation(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["locations", stockId] }),
    onError: (e: any) => Alert.alert("Impossibile eliminare", e?.message || ""),
  });

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="back-btn" onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)/inventory" as any)} style={styles.iconBtn}>
          <Icon name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.h1}>Ubicazioni</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <StockSwitcher />
      </View>

      <View style={styles.addRow}>
        <TextInput
          testID="new-location-input"
          value={name}
          onChangeText={setName}
          placeholder="es. Scaffale C"
          placeholderTextColor={colors.muted}
          style={styles.input}
          returnKeyType="done"
          onSubmitEditing={() => name.trim() && create.mutate(name.trim())}
        />
        <Pressable
          testID="add-location-btn"
          onPress={() => name.trim() && create.mutate(name.trim())}
          disabled={!name.trim() || create.isPending}
          style={[styles.addBtn, (!name.trim() || create.isPending) && { opacity: 0.5 }]}
        >
          <Icon name="plus" size={22} color={colors.onBrandPrimary} />
        </Pressable>
      </View>

      {list.isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>
      ) : (
        <FlatList
          data={list.data || []}
          keyExtractor={(l) => l.id}
          renderItem={({ item }: { item: Location }) => (
            <View style={styles.row}>
              <View style={styles.pin}>
                <Icon name="map-marker" size={18} color={colors.brandPrimary} />
              </View>
              <Text style={styles.rowName}>{item.name}</Text>
              <Pressable
                testID={`delete-location-${item.name}`}
                onPress={() => del.mutate(item.id)}
                style={styles.delBtn}
              >
                <Icon name="trash-can-outline" size={18} color={colors.error} />
              </Pressable>
            </View>
          )}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: insets.bottom + spacing.xl }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Icon name="map-marker-off-outline" size={44} color={colors.muted} />
              <Text style={{ color: colors.muted, marginTop: spacing.sm }}>Nessuna ubicazione</Text>
            </View>
          }
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.md, paddingBottom: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface,
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.md },
  h1: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  addRow: { flexDirection: "row", gap: spacing.sm, padding: spacing.lg },
  input: {
    flex: 1, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, height: 48,
    paddingHorizontal: spacing.md, color: colors.onSurface, fontSize: 15,
    borderWidth: 1, borderColor: colors.border,
  },
  addBtn: {
    width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.brandPrimary,
    alignItems: "center", justifyContent: "center",
  },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  pin: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  rowName: { flex: 1, fontSize: 15, fontWeight: "700", color: colors.onSurface },
  delBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  center: { alignItems: "center", justifyContent: "center", padding: spacing.xl },
});
