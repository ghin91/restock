import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, Modal, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { useActiveStock } from "@/src/stock-context";
import { colors, radius, spacing } from "@/src/theme";

export function StockSwitcher() {
  const { stocks, activeStock, setActiveStockId } = useActiveStock();
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <Pressable testID="stock-switcher" onPress={() => setOpen(true)} style={styles.switcher}>
        <Icon name="warehouse" size={16} color={colors.brandPrimary} />
        <Text style={styles.switcherText} numberOfLines={1}>{activeStock?.name || "Nessuno stock"}</Text>
        <Icon name="chevron-down" size={16} color={colors.muted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.title}>Seleziona stock</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {stocks.map((s) => {
                const selected = s.id === activeStock?.id;
                return (
                  <Pressable
                    key={s.id}
                    testID={`stock-option-${s.name}`}
                    onPress={async () => { await setActiveStockId(s.id); setOpen(false); }}
                    style={[styles.opt, selected && styles.optActive]}
                  >
                    <Icon name="warehouse" size={20} color={selected ? colors.brandPrimary : colors.onSurface} />
                    <Text style={[styles.optText, selected && { color: colors.brandPrimary }]}>{s.name}</Text>
                    {selected && <Icon name="check" size={18} color={colors.brandPrimary} />}
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable
              testID="manage-stocks-btn"
              onPress={() => { setOpen(false); router.push("/stocks" as any); }}
              style={styles.manage}
            >
              <Icon name="cog-outline" size={16} color={colors.brandPrimary} />
              <Text style={styles.manageText}>Gestisci stock</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  switcher: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: colors.brandTertiary,
    paddingHorizontal: spacing.md, paddingVertical: 6,
    borderRadius: radius.pill, maxWidth: 220,
  },
  switcherText: { color: colors.onSurface, fontWeight: "700", fontSize: 13, flexShrink: 1 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    padding: spacing.lg, gap: spacing.sm,
  },
  title: { fontSize: 16, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.sm },
  opt: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingVertical: spacing.md, paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  optActive: { backgroundColor: colors.brandTertiary },
  optText: { flex: 1, color: colors.onSurface, fontWeight: "600", fontSize: 15 },
  manage: {
    flexDirection: "row", gap: spacing.sm, alignItems: "center", justifyContent: "center",
    paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.sm,
  },
  manageText: { color: colors.brandPrimary, fontWeight: "700" },
});
