import React, { useState } from "react";
import {
  View, Text, StyleSheet, TextInput, Pressable, FlatList, Platform,
  KeyboardAvoidingView, Alert, ActivityIndicator, Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Icon from "@react-native-vector-icons/material-design-icons";
import { api, Stock } from "@/src/api";
import { useActiveStock } from "@/src/stock-context";
import { colors, radius, spacing } from "@/src/theme";

export default function Stocks() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { stocks, activeStock, setActiveStockId } = useActiveStock();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<Stock | null>(null);
  const [editName, setEditName] = useState("");

  const create = useMutation({
    mutationFn: (n: string) => api.createStock(n),
    onSuccess: async (s) => {
      setName("");
      await qc.invalidateQueries({ queryKey: ["stocks"] });
      await setActiveStockId(s.id);
    },
    onError: (e: any) => Alert.alert("Errore", e?.message || "Impossibile creare"),
  });

  const update = useMutation({
    mutationFn: ({ id, n }: { id: string; n: string }) => api.updateStock(id, n),
    onSuccess: () => { setEditing(null); qc.invalidateQueries({ queryKey: ["stocks"] }); },
    onError: (e: any) => Alert.alert("Errore", e?.message || "Impossibile aggiornare"),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.deleteStock(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["stocks"] });
      await qc.invalidateQueries();
    },
    onError: (e: any) => Alert.alert("Impossibile eliminare", e?.message || ""),
  });

  const confirmDelete = (s: Stock) => {
    Alert.alert(
      "Elimina stock",
      `Vuoi davvero eliminare "${s.name}"? Verranno rimossi anche prodotti e ubicazioni collegati.`,
      [
        { text: "Annulla", style: "cancel" },
        { text: "Elimina", style: "destructive", onPress: () => del.mutate(s.id) },
      ],
    );
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="back-btn" onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)" as any)} style={styles.iconBtn}>
          <Icon name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.h1}>Stock</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.helper}>
        <Icon name="information-outline" size={16} color={colors.info} />
        <Text style={styles.helperText}>Ogni stock ha prodotti e ubicazioni separati. Dati mai incrociati.</Text>
      </View>

      <View style={styles.addRow}>
        <TextInput
          testID="new-stock-input"
          value={name}
          onChangeText={setName}
          placeholder="es. Negozio Milano"
          placeholderTextColor={colors.muted}
          style={styles.input}
          returnKeyType="done"
          onSubmitEditing={() => name.trim() && create.mutate(name.trim())}
        />
        <Pressable
          testID="add-stock-btn"
          onPress={() => name.trim() && create.mutate(name.trim())}
          disabled={!name.trim() || create.isPending}
          style={[styles.addBtn, (!name.trim() || create.isPending) && { opacity: 0.5 }]}
        >
          <Icon name="plus" size={22} color={colors.onBrandPrimary} />
        </Pressable>
      </View>

      <FlatList
        data={stocks}
        keyExtractor={(s) => s.id}
        renderItem={({ item }) => {
          const active = item.id === activeStock?.id;
          return (
            <Pressable
              testID={`stock-row-${item.name}`}
              onPress={() => setActiveStockId(item.id)}
              style={[styles.row, active && styles.rowActive]}
            >
              <View style={[styles.icon, active && { backgroundColor: colors.brandPrimary }]}>
                <Icon name="warehouse" size={20} color={active ? colors.onBrandPrimary : colors.brandPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{item.name}</Text>
                {active && <Text style={styles.rowActiveLabel}>Attivo</Text>}
              </View>
              <Pressable
                testID={`edit-stock-${item.name}`}
                onPress={() => { setEditing(item); setEditName(item.name); }}
                style={styles.sqBtn}
              >
                <Icon name="pencil-outline" size={18} color={colors.onSurface} />
              </Pressable>
              <Pressable
                testID={`delete-stock-${item.name}`}
                onPress={() => confirmDelete(item)}
                disabled={stocks.length <= 1}
                style={[styles.sqBtn, stocks.length <= 1 && { opacity: 0.3 }]}
              >
                <Icon name="trash-can-outline" size={18} color={colors.error} />
              </Pressable>
            </Pressable>
          );
        }}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: insets.bottom + spacing.xl }}
        ListEmptyComponent={
          stocks.length === 0 ? (
            <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>
          ) : null
        }
      />

      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalBackdrop}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Rinomina stock</Text>
            <TextInput
              testID="edit-stock-input"
              value={editName}
              onChangeText={setEditName}
              placeholder="Nome"
              placeholderTextColor={colors.muted}
              style={styles.input}
              autoFocus
            />
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Pressable onPress={() => setEditing(null)} style={[styles.secondaryBtn, { flex: 1 }]}>
                <Text style={styles.secondaryBtnText}>Annulla</Text>
              </Pressable>
              <Pressable
                testID="save-stock-rename"
                onPress={() => editing && editName.trim() && update.mutate({ id: editing.id, n: editName.trim() })}
                style={[styles.primaryBtn, { flex: 1 }]}
              >
                <Text style={styles.primaryBtnText}>Salva</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  helper: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    marginHorizontal: spacing.lg, marginTop: spacing.md,
    padding: spacing.md, borderRadius: radius.md, backgroundColor: "#EFF6FF",
  },
  helperText: { color: colors.info, fontSize: 12, flex: 1, fontWeight: "600" },
  addRow: { flexDirection: "row", gap: spacing.sm, padding: spacing.lg, paddingTop: spacing.md },
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
  rowActive: { borderColor: colors.brandPrimary, borderWidth: 1.5 },
  icon: {
    width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.brandTertiary,
    alignItems: "center", justifyContent: "center",
  },
  rowName: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  rowActiveLabel: { fontSize: 11, color: colors.brandPrimary, fontWeight: "800", marginTop: 2 },
  sqBtn: { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceTertiary },
  center: { padding: spacing.xl, alignItems: "center" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  modalCard: { width: "100%", maxWidth: 420, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  modalTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  primaryBtn: { backgroundColor: colors.brandPrimary, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: "center" },
  primaryBtnText: { color: colors.onBrandPrimary, fontWeight: "800" },
  secondaryBtn: { backgroundColor: colors.surfaceSecondary, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: "center", borderWidth: 1, borderColor: colors.border },
  secondaryBtnText: { color: colors.onSurface, fontWeight: "700" },
});
