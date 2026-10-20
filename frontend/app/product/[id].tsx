import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, TextInput, Pressable, ScrollView, Switch, Platform, ActivityIndicator,
  KeyboardAvoidingView, Alert, Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Icon from "@react-native-vector-icons/material-design-icons";
import { api, Product } from "@/src/api";
import { colors, radius, spacing } from "@/src/theme";
import { useActiveStock } from "@/src/stock-context";
import { TransferModal } from "@/src/components/TransferModal";
import { BarcodeScanModal } from "@/src/components/BarcodeScanModal";

export default function ProductDetails() {
  const { id, barcode: initialBarcode } = useLocalSearchParams<{ id: string; barcode?: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const { activeStock } = useActiveStock();
  const isNew = id === "new";

  const existing = useQuery({
    queryKey: ["product", id],
    queryFn: () => api.getProduct(id as string),
    enabled: !isNew,
  });
  const locations = useQuery({
    queryKey: ["locations", activeStock?.id],
    queryFn: () => api.listLocations(activeStock!.id),
    enabled: !!activeStock,
  });
  const suppliers = useQuery({
    queryKey: ["suppliers", activeStock?.id],
    queryFn: () => api.listSuppliers(activeStock!.id),
    enabled: !!activeStock,
  });
  const [transferOpen, setTransferOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);

  const [form, setForm] = useState<Partial<Product>>({
    name: "",
    barcode: typeof initialBarcode === "string" ? initialBarcode : "",
    locations: [],
    min_threshold: 5,
    unit: "pz",
    manual_reorder: false,
  });
  const [saving, setSaving] = useState(false);
  // Index of the location row whose picker is open; -1 = add a new row.
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);

  useEffect(() => {
    if (existing.data) setForm(existing.data);
  }, [existing.data]);

  useEffect(() => {
    if (!isNew) return;
    if ((form.locations?.length ?? 0) === 0 && locations.data?.[0]) {
      setForm((f) => ({ ...f, locations: [{ location: locations.data![0].name, quantity: 0 }] }));
    }
  }, [locations.data, isNew]);

  const set = <K extends keyof Product>(k: K, v: Product[K]) => setForm((f) => ({ ...f, [k]: v }));
  const rows = form.locations || [];
  const total = rows.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
  const setRowQty = (i: number, q: number) =>
    set("locations", rows.map((l, idx) => (idx === i ? { ...l, quantity: Math.max(0, q) } : l)));
  const removeRow = (i: number) => set("locations", rows.filter((_, idx) => idx !== i));
  const pickLocation = (name: string) => {
    if (pickerIndex === null) return;
    if (rows.some((l, idx) => l.location === name && idx !== pickerIndex)) {
      setPickerIndex(null);
      return;
    }
    if (pickerIndex === -1) set("locations", [...rows, { location: name, quantity: 0 }]);
    else set("locations", rows.map((l, idx) => (idx === pickerIndex ? { ...l, location: name } : l)));
    setPickerIndex(null);
  };

  const save = async () => {
    if (!form.name?.trim()) {
      Alert.alert("Nome richiesto", "Inserisci un nome prodotto");
      return;
    }
    if (isNew && !activeStock) {
      Alert.alert("Seleziona uno stock", "Devi avere uno stock attivo per creare un prodotto");
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        await api.createProduct({
          stock_id: activeStock!.id,
          name: form.name!.trim(),
          barcode: form.barcode || undefined,
          supplier: form.supplier?.trim() || undefined,
          internal_code: form.internal_code?.trim() || undefined,
          supplier_code: form.supplier_code?.trim() || undefined,
          locations: rows,
          min_threshold: Number(form.min_threshold) || 0,
          unit: form.unit || "pz",
          manual_reorder: !!form.manual_reorder,
        });
      } else {
        await api.updateProduct(id as string, {
          name: form.name,
          barcode: form.barcode ?? "",
          supplier: form.supplier?.trim() ?? "",
          internal_code: form.internal_code?.trim() ?? "",
          supplier_code: form.supplier_code?.trim() ?? "",
          locations: rows,
          min_threshold: Number(form.min_threshold) || 0,
          unit: form.unit,
          manual_reorder: !!form.manual_reorder,
        });
      }
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["reorder"] });
      qc.invalidateQueries({ queryKey: ["product", id] });
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      if (router.canGoBack()) router.back();
      else router.replace("/(tabs)/inventory" as any);
    } catch (e: any) {
      Alert.alert("Errore", e?.message || "Impossibile salvare");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (isNew) return;
    try {
      await api.deleteProduct(id as string);
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["reorder"] });
      if (router.canGoBack()) router.back();
      else router.replace("/(tabs)/inventory" as any);
    } catch (e: any) {
      Alert.alert("Errore", e?.message || "Impossibile eliminare");
    }
  };

  if (!isNew && existing.isLoading) {
    return <View style={[styles.container, styles.center]}><ActivityIndicator color={colors.brandPrimary} /></View>;
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="back-btn" onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)/inventory" as any)} style={styles.iconBtn}>
          <Icon name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.h1}>{isNew ? "Nuovo prodotto" : "Modifica prodotto"}</Text>
        {!isNew && (
          <Pressable testID="delete-btn" onPress={remove} style={styles.iconBtn}>
            <Icon name="trash-can-outline" size={22} color={colors.error} />
          </Pressable>
        )}
        {isNew && <View style={{ width: 40 }} />}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        <Field label="Nome prodotto">
          <TextInput
            testID="name-input"
            value={form.name}
            onChangeText={(v) => set("name", v)}
            placeholder="es. Latte Intero 1L"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
        </Field>

        <Field label="Codice a barre">
          <View style={styles.barcodeRow}>
            <View style={[styles.input, styles.barcodeInputWrap]}>
              <TextInput
                testID="barcode-input"
                value={form.barcode ?? ""}
                onChangeText={(v) => set("barcode", v)}
                placeholder="es. 8001234500011"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                style={styles.barcodeInput}
              />
              {!!form.barcode && (
                <Pressable testID="barcode-clear" onPress={() => set("barcode", "")} hitSlop={8}>
                  <Icon name="close-circle" size={20} color={colors.muted} />
                </Pressable>
              )}
            </View>
            <Pressable testID="barcode-scan-btn" onPress={() => setScanOpen(true)} style={styles.scanBtn}>
              <Icon name="barcode-scan" size={22} color={colors.onBrandPrimary} />
            </Pressable>
          </View>
        </Field>

        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Field label="Codice interno">
              <TextInput
                testID="internal-code-input"
                value={form.internal_code ?? ""}
                onChangeText={(v) => set("internal_code", v)}
                placeholder="es. ART-0012"
                placeholderTextColor={colors.muted}
                autoCapitalize="characters"
                style={styles.input}
              />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Codice fornitore">
              <TextInput
                testID="supplier-code-input"
                value={form.supplier_code ?? ""}
                onChangeText={(v) => set("supplier_code", v)}
                placeholder="es. RS-4471"
                placeholderTextColor={colors.muted}
                autoCapitalize="characters"
                style={styles.input}
              />
            </Field>
          </View>
        </View>

        <Field label="Fornitore">
          <TextInput
            testID="supplier-input"
            value={form.supplier ?? ""}
            onChangeText={(v) => set("supplier", v)}
            placeholder="es. Rossi Distribuzione"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
          {(suppliers.data?.length ?? 0) > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.supChips}>
              {suppliers.data!.map((s) => (
                <Pressable
                  key={s}
                  testID={`supplier-chip-${s}`}
                  onPress={() => set("supplier", s)}
                  style={[styles.supChip, form.supplier === s && styles.supChipActive]}
                >
                  <Text style={[styles.supChipText, form.supplier === s && styles.supChipTextActive]}>{s}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </Field>

        <Field label="Ubicazioni e disponibilità">
          <View style={styles.locBox}>
            {rows.map((l, i) => (
              <View key={`${l.location}-${i}`} style={styles.locRow} testID={`loc-row-${i}`}>
                <Pressable testID={`loc-picker-${i}`} onPress={() => setPickerIndex(i)} style={styles.locName}>
                  <Icon name="map-marker-outline" size={16} color={colors.brandPrimary} />
                  <Text style={styles.pickerText} numberOfLines={1}>{l.location}</Text>
                  <Icon name="chevron-down" size={16} color={colors.muted} />
                </Pressable>
                <TextInput
                  testID={`loc-qty-${i}`}
                  value={String(l.quantity ?? 0)}
                  onChangeText={(v) => setRowQty(i, Number(v.replace(/[^0-9]/g, "") || 0))}
                  keyboardType="number-pad"
                  style={styles.qtyInput}
                />
                <Pressable testID={`loc-remove-${i}`} onPress={() => removeRow(i)} style={styles.removeBtn}>
                  <Icon name="close" size={18} color={colors.error} />
                </Pressable>
              </View>
            ))}
            <Pressable testID="add-location-row" onPress={() => setPickerIndex(-1)} style={styles.addLocBtn}>
              <Icon name="plus" size={18} color={colors.brandPrimary} />
              <Text style={styles.manageBtnText}>Aggiungi ubicazione</Text>
            </Pressable>
            <View style={styles.totalRow}>
              <Text style={styles.label}>Totale</Text>
              <Text testID="form-total" style={styles.totalValue}>{total} {form.unit}</Text>
            </View>
          </View>
          {!isNew && existing.data && (
            <Pressable testID="open-transfer-btn" onPress={() => setTransferOpen(true)} style={styles.transferBtn}>
              <Icon name="swap-horizontal" size={20} color={colors.onSurface} />
              <Text style={styles.transferText}>Sposta merce tra ubicazioni</Text>
            </Pressable>
          )}
        </Field>

        <Field label="Soglia minima (sul totale)">
          <TextInput
            testID="min-threshold-input"
            value={String(form.min_threshold ?? 0)}
            onChangeText={(v) => set("min_threshold", Math.max(0, Number(v.replace(/[^0-9]/g, "") || 0)))}
            keyboardType="number-pad"
            style={styles.input}
          />
        </Field>

        <Field label="Unità di misura">
          <TextInput
            testID="unit-input"
            value={form.unit ?? ""}
            onChangeText={(v) => set("unit", v)}
            placeholder="pz, kg, bott…"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
        </Field>

        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchTitle}>Aggiungi a lista riordino</Text>
            <Text style={styles.switchDesc}>Includi sempre nella lista, anche se sopra soglia</Text>
          </View>
          <Switch
            testID="manual-reorder-switch"
            value={!!form.manual_reorder}
            onValueChange={(v) => set("manual_reorder", v)}
            trackColor={{ false: colors.border, true: colors.brandPrimary }}
            thumbColor="#fff"
          />
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Pressable testID="save-btn" onPress={save} disabled={saving} style={[styles.saveBtn, saving && { opacity: 0.6 }]}>
          {saving ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.saveText}>{isNew ? "Crea prodotto" : "Salva modifiche"}</Text>}
        </Pressable>
      </View>

      <Modal visible={pickerIndex !== null} transparent animationType="fade" onRequestClose={() => setPickerIndex(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerIndex(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Seleziona ubicazione</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {(locations.data || []).map((l) => {
                const used = rows.some((r) => r.location === l.name);
                return (
                  <Pressable
                    key={l.id}
                    testID={`location-option-${l.name}`}
                    onPress={() => pickLocation(l.name)}
                    style={[styles.locationOpt, used && { opacity: 0.4 }]}
                  >
                    <Icon name="map-marker-outline" size={18} color={colors.onSurface} />
                    <Text style={styles.locationOptText}>{l.name}</Text>
                    {used && <Icon name="check" size={18} color={colors.brandPrimary} />}
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable
              testID="manage-locations"
              onPress={() => { setPickerIndex(null); router.push("/locations" as any); }}
              style={styles.manageBtn}
            >
              <Icon name="cog-outline" size={16} color={colors.brandPrimary} />
              <Text style={styles.manageBtnText}>Gestisci ubicazioni</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
      <BarcodeScanModal
        visible={scanOpen}
        title="Associa codice a barre"
        onCode={(code) => set("barcode", code)}
        onClose={() => setScanOpen(false)}
      />
      {existing.data && (
        <TransferModal
          visible={transferOpen}
          product={existing.data}
          stockLocations={locations.data || []}
          onClose={() => setTransferOpen(false)}
          onDone={(updated) => {
            setTransferOpen(false);
            setForm((f) => ({ ...f, locations: updated.locations }));
            qc.setQueryData(["product", id], updated);
            qc.invalidateQueries({ queryKey: ["products"] });
            qc.invalidateQueries({ queryKey: ["reorder"] });
          }}
        />
      )}
    </KeyboardAvoidingView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  center: { alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.md, paddingBottom: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface,
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.md },
  h1: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  label: { fontSize: 13, fontWeight: "700", color: colors.onSurface },
  input: {
    backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, height: 48,
    paddingHorizontal: spacing.md, color: colors.onSurface, fontSize: 15,
    borderWidth: 1, borderColor: colors.border,
  },
  pickerBtn: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, height: 48,
    paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  pickerText: { flex: 1, color: colors.onSurface, fontSize: 15 },
  barcodeRow: { flexDirection: "row", gap: spacing.sm },
  barcodeInputWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  barcodeInput: { flex: 1, height: "100%", fontSize: 15, color: colors.onSurface },
  scanBtn: {
    width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.brandPrimary,
    alignItems: "center", justifyContent: "center",
  },
  locBox: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, padding: spacing.sm, gap: spacing.sm,
  },
  locRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  locName: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.xs,
    backgroundColor: colors.surfaceTertiary, borderRadius: radius.sm, height: 44, paddingHorizontal: spacing.sm,
  },
  qtyInput: {
    width: 72, height: 44, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary,
    textAlign: "center", fontSize: 16, fontWeight: "700", color: colors.onSurface,
  },
  removeBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  addLocBtn: {
    flexDirection: "row", gap: spacing.xs, alignItems: "center", justifyContent: "center",
    height: 44, borderRadius: radius.sm, borderWidth: 1, borderStyle: "dashed", borderColor: colors.brandPrimary,
  },
  totalRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: spacing.sm, paddingTop: spacing.xs,
  },
  totalValue: { fontSize: 16, fontWeight: "800", color: colors.onSurface },
  transferBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    height: 48, borderRadius: radius.md, marginTop: spacing.sm,
    backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border,
  },
  transferText: { color: colors.onSurface, fontWeight: "700" },
  supChips: { gap: spacing.sm, paddingTop: spacing.xs, paddingRight: spacing.lg },
  supChip: {
    flexShrink: 0, height: 36, paddingHorizontal: spacing.md, borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
  },
  supChipActive: { backgroundColor: colors.onSurface, borderColor: colors.onSurface },
  supChipText: { fontSize: 13, fontWeight: "600", color: colors.onSurface },
  supChipTextActive: { color: colors.surface },
  switchRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  switchTitle: { fontWeight: "700", color: colors.onSurface },
  switchDesc: { color: colors.muted, fontSize: 12, marginTop: 2 },
  footer: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm, backgroundColor: colors.surface,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  saveBtn: {
    backgroundColor: colors.brandPrimary, paddingVertical: spacing.md, borderRadius: radius.md,
    alignItems: "center",
  },
  saveText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 15 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  modalCard: { width: "100%", maxWidth: 420, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  modalTitle: { fontSize: 16, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.sm },
  locationOpt: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  locationOptText: { flex: 1, color: colors.onSurface, fontSize: 15, fontWeight: "600" },
  manageBtn: { flexDirection: "row", gap: spacing.sm, alignItems: "center", justifyContent: "center", paddingVertical: spacing.md },
  manageBtnText: { color: colors.brandPrimary, fontWeight: "700" },
});
