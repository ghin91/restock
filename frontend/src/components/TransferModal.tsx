import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/material-design-icons";
import { api, Location, Product } from "@/src/api";
import { colors, radius, spacing } from "@/src/theme";
import { QuantityStepper } from "./QuantityStepper";

type Props = {
  visible: boolean;
  product: Product;
  stockLocations: Location[];
  onClose: () => void;
  onDone: (updated: Product) => void;
};

// Bottom sheet to move goods between two locations of the same product.
export function TransferModal({ visible, product, stockLocations, onClose, onDone }: Props) {
  const insets = useSafeAreaInsets();
  const sources = product.locations.filter((l) => l.quantity > 0);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setFrom(sources[0]?.location ?? null);
    setTo(null);
    setQty(1);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const available = product.locations.find((l) => l.location === from)?.quantity ?? 0;
  const destinations = stockLocations.map((l) => l.name).filter((n) => n !== from);
  const canSubmit = !!from && !!to && qty > 0 && qty <= available && !saving;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.transfer(product.id, from!, to!, qty);
      onDone(updated);
    } catch (e: any) {
      setError(e?.message || "Spostamento non riuscito");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} onPress={() => {}}>
          <Text style={styles.title}>Sposta merce</Text>
          <Text style={styles.sub}>{product.name}</Text>

          {sources.length === 0 ? (
            <Text style={styles.empty}>Nessuna ubicazione con merce disponibile da spostare.</Text>
          ) : (
            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: spacing.md }}>
              <Text style={styles.label}>Da</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {sources.map((l) => (
                  <Pressable
                    key={l.location}
                    testID={`transfer-from-${l.location}`}
                    onPress={() => { setFrom(l.location); if (to === l.location) setTo(null); setQty(1); }}
                    style={[styles.chip, from === l.location && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, from === l.location && styles.chipTextActive]}>
                      {l.location} ({l.quantity})
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              <Text style={styles.label}>A</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {destinations.map((name) => (
                  <Pressable
                    key={name}
                    testID={`transfer-to-${name}`}
                    onPress={() => setTo(name)}
                    style={[styles.chip, to === name && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, to === name && styles.chipTextActive]}>{name}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              <View style={styles.qtyRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Quantità</Text>
                  <Text style={styles.hint}>Disponibili: {available} {product.unit}</Text>
                </View>
                <QuantityStepper
                  testIDPrefix="transfer-qty"
                  value={qty}
                  onChange={(d) => setQty((q) => Math.min(available, Math.max(1, q + d)))}
                />
              </View>
              <Pressable testID="transfer-all" onPress={() => setQty(Math.max(1, available))} style={styles.allBtn}>
                <Text style={styles.allText}>Sposta tutto ({available})</Text>
              </Pressable>
            </ScrollView>
          )}

          {error && <Text testID="transfer-error" style={styles.error}>{error}</Text>}

          <View style={styles.actions}>
            <Pressable testID="transfer-cancel" onPress={onClose} style={[styles.secondaryBtn, { flex: 1 }]}>
              <Text style={styles.secondaryText}>Annulla</Text>
            </Pressable>
            <Pressable
              testID="transfer-confirm"
              onPress={submit}
              disabled={!canSubmit}
              style={[styles.primaryBtn, { flex: 1 }, !canSubmit && { opacity: 0.5 }]}
            >
              {saving ? (
                <ActivityIndicator color={colors.onBrandPrimary} />
              ) : (
                <View style={styles.btnInner}>
                  <Icon name="swap-horizontal" size={18} color={colors.onBrandPrimary} />
                  <Text style={styles.primaryText}>Sposta</Text>
                </View>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    padding: spacing.lg, gap: spacing.sm,
  },
  title: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  sub: { color: colors.muted, marginBottom: spacing.sm },
  empty: { color: colors.muted, paddingVertical: spacing.lg },
  label: { fontSize: 13, fontWeight: "700", color: colors.onSurface },
  hint: { fontSize: 12, color: colors.muted, marginTop: 2 },
  chips: { gap: spacing.sm, paddingRight: spacing.lg },
  chip: {
    flexShrink: 0, height: 36, paddingHorizontal: spacing.md, borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
  },
  chipActive: { backgroundColor: colors.onSurface, borderColor: colors.onSurface },
  chipText: { fontSize: 13, fontWeight: "600", color: colors.onSurface },
  chipTextActive: { color: colors.surface },
  qtyRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  allBtn: { alignSelf: "flex-start", paddingVertical: spacing.xs },
  allText: { color: colors.brandPrimary, fontWeight: "700" },
  error: { color: colors.error, fontWeight: "600" },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  primaryBtn: { backgroundColor: colors.brandPrimary, height: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  primaryText: { color: colors.onBrandPrimary, fontWeight: "800" },
  btnInner: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  secondaryBtn: {
    backgroundColor: colors.surfaceSecondary, height: 48, borderRadius: radius.md,
    alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border,
  },
  secondaryText: { color: colors.onSurface, fontWeight: "700" },
});
