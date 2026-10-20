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

  const [form, setForm] = useState<Partial<Product>>({
    name: "",
    barcode: typeof initialBarcode === "string" ? initialBarcode : "",
    location: "Magazzino",
    quantity: 0,
    min_threshold: 5,
    unit: "pz",
    manual_reorder: false,
  });
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (existing.data) setForm(existing.data);
  }, [existing.data]);

  useEffect(() => {
    if (!isNew) return;
    if (!form.location && locations.data?.[0]) {
      setForm((f) => ({ ...f, location: locations.data![0].name }));
    }
  }, [locations.data, isNew]);

  const set = <K extends keyof Product>(k: K, v: Product[K]) => setForm((f) => ({ ...f, [k]: v }));

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
          location: form.location || "Magazzino",
          quantity: Number(form.quantity) || 0,
          min_threshold: Number(form.min_threshold) || 0,
          unit: form.unit || "pz",
          manual_reorder: !!form.manual_reorder,
        });
      } else {
        await api.updateProduct(id as string, {
          ...form,
          quantity: Number(form.quantity) || 0,
          min_threshold: Number(form.min_threshold) || 0,
        });
      }
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["reorder"] });
      qc.invalidateQueries({ queryKey: ["product", id] });
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
          <TextInput
            testID="barcode-input"
            value={form.barcode ?? ""}
            onChangeText={(v) => set("barcode", v)}
            placeholder="es. 8001234500011"
            placeholderTextColor={colors.muted}
            keyboardType="number-pad"
            style={styles.input}
          />
        </Field>

        <Field label="Ubicazione">
          <Pressable testID="location-picker" onPress={() => setPickerOpen(true)} style={styles.pickerBtn}>
            <Icon name="map-marker-outline" size={18} color={colors.onSurface} />
            <Text style={styles.pickerText}>{form.location || "Seleziona"}</Text>
            <Icon name="chevron-down" size={18} color={colors.muted} />
          </Pressable>
        </Field>

        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Field label="Quantità attuale">
              <TextInput
                testID="quantity-input"
                value={String(form.quantity ?? 0)}
                onChangeText={(v) => set("quantity", Math.max(0, Number(v.replace(/[^0-9]/g, "") || 0)))}
                keyboardType="number-pad"
                style={styles.input}
              />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Soglia minima">
              <TextInput
                testID="min-threshold-input"
                value={String(form.min_threshold ?? 0)}
                onChangeText={(v) => set("min_threshold", Math.max(0, Number(v.replace(/[^0-9]/g, "") || 0)))}
                keyboardType="number-pad"
                style={styles.input}
              />
            </Field>
          </View>
        </View>

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

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Seleziona ubicazione</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {(locations.data || []).map((l) => (
                <Pressable
                  key={l.id}
                  testID={`location-option-${l.name}`}
                  onPress={() => { set("location", l.name); setPickerOpen(false); }}
                  style={styles.locationOpt}
                >
                  <Icon name="map-marker-outline" size={18} color={colors.onSurface} />
                  <Text style={styles.locationOptText}>{l.name}</Text>
                  {form.location === l.name && <Icon name="check" size={18} color={colors.brandPrimary} />}
                </Pressable>
              ))}
            </ScrollView>
            <Pressable
              testID="manage-locations"
              onPress={() => { setPickerOpen(false); router.push("/locations" as any); }}
              style={styles.manageBtn}
            >
              <Icon name="cog-outline" size={16} color={colors.brandPrimary} />
              <Text style={styles.manageBtnText}>Gestisci ubicazioni</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
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
