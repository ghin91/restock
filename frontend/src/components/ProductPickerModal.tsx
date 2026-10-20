import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, Modal, Pressable, TextInput, FlatList, ActivityIndicator, Platform, KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Icon from "@react-native-vector-icons/material-design-icons";
import { api, Product } from "@/src/api";
import { useActiveStock } from "@/src/stock-context";
import { colors, radius, spacing } from "@/src/theme";

type Props = {
  visible: boolean;
  title: string;
  subtitle?: string | null;
  error?: string | null;
  onPick: (p: Product) => void;
  onClose: () => void;
};

// Searchable list of the active stock's products (name, internal/supplier code, barcode).
export function ProductPickerModal({ visible, title, subtitle, error, onPick, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { activeStock } = useActiveStock();
  const [q, setQ] = useState("");
  useEffect(() => { if (visible) setQ(""); }, [visible]);

  const list = useQuery({
    queryKey: ["products", activeStock?.id, q, "picker"],
    queryFn: () => api.listProducts(activeStock!.id, { q: q || undefined }),
    enabled: visible && !!activeStock,
  });

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={[styles.root, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.header}>
          <Pressable testID="picker-close" onPress={onClose} style={styles.iconBtn}>
            <Icon name="close" size={22} color={colors.onSurface} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.sub} numberOfLines={1}>{subtitle}</Text> : null}
          </View>
        </View>
        <View style={styles.search}>
          <Icon name="magnify" size={18} color={colors.muted} />
          <TextInput
            testID="picker-search"
            value={q}
            onChangeText={setQ}
            placeholder="Nome, codice interno, codice fornitore…"
            placeholderTextColor={colors.muted}
            style={styles.input}
            autoFocus
          />
          {q.length > 0 && (
            <Pressable testID="picker-search-clear" onPress={() => setQ("")} hitSlop={8}>
              <Icon name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          )}
        </View>
        {error ? <Text testID="picker-error" style={styles.error}>{error}</Text> : null}
        {list.isLoading ? (
          <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.xl }} />
        ) : (
          <FlatList
            data={list.data || []}
            keyExtractor={(p) => p.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: insets.bottom + spacing.xl }}
            ListEmptyComponent={<Text style={styles.empty}>Nessun articolo trovato</Text>}
            renderItem={({ item }) => (
              <Pressable testID={`picker-item-${item.id}`} onPress={() => onPick(item)} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {[item.internal_code && `Int. ${item.internal_code}`, item.supplier_code && `Forn. ${item.supplier_code}`, item.barcode ? `EAN ${item.barcode}` : "senza codice a barre"]
                      .filter(Boolean).join(" · ")}
                  </Text>
                </View>
                <Text style={styles.qty}>{item.total_quantity}</Text>
              </Pressable>
            )}
          />
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  sub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  search: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm, margin: spacing.lg, marginBottom: 0,
    backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 48,
  },
  input: { flex: 1, fontSize: 15, color: colors.onSurface },
  error: { color: colors.error, fontWeight: "700", marginHorizontal: spacing.lg, marginTop: spacing.sm },
  empty: { color: colors.muted, textAlign: "center", marginTop: spacing.xl },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
  },
  name: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  meta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  qty: { fontSize: 16, fontWeight: "800", color: colors.onSurface },
});
