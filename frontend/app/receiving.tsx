import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator, Platform, KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Icon from "@react-native-vector-icons/material-design-icons";
import { api, Product } from "@/src/api";
import { useActiveStock } from "@/src/stock-context";
import { colors, radius, spacing } from "@/src/theme";
import { QuantityStepper } from "@/src/components/QuantityStepper";
import { BarcodeScanModal } from "@/src/components/BarcodeScanModal";
import { ProductPickerModal } from "@/src/components/ProductPickerModal";

type Line = { product: Product; qty: number };

export default function Receiving() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { activeStock } = useActiveStock();
  const stockId = activeStock?.id;

  const locations = useQuery({ queryKey: ["locations", stockId], queryFn: () => api.listLocations(stockId!), enabled: !!stockId });
  const receipts = useQuery({ queryKey: ["receipts", stockId], queryFn: () => api.listReceipts(stockId!), enabled: !!stockId });

  const [location, setLocation] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [note, setNote] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [unknownCode, setUnknownCode] = useState<string | null>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!location && locations.data?.[0]) setLocation(locations.data[0].name);
  }, [locations.data, location]);

  const showToast = (text: string, ok = true) => {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 2500);
  };

  const addLine = (p: Product, qty = 1) =>
    setLines((ls) => {
      const i = ls.findIndex((l) => l.product.id === p.id);
      if (i === -1) return [{ product: p, qty }, ...ls];
      return ls.map((l, idx) => (idx === i ? { ...l, qty: l.qty + qty } : l));
    });

  const onScanCode = async (code: string) => {
    if (!stockId) return;
    try {
      const p = await api.getByBarcode(code, stockId);
      addLine(p);
      setScanMsg(`+1 ${p.name}`);
    } catch {
      setScanOpen(false);
      setUnknownCode(code);
    }
  };

  const onPick = async (p: Product) => {
    if (unknownCode) {
      setPickerError(null);
      try {
        const updated = await api.updateProduct(p.id, { barcode: unknownCode });
        qc.invalidateQueries({ queryKey: ["products", stockId] });
        addLine(updated);
        showToast(`Codice ${unknownCode} associato a ${updated.name}`);
        setUnknownCode(null);
        setPickerOpen(false);
      } catch (e: any) {
        setPickerError(e?.message || "Associazione non riuscita");
      }
      return;
    }
    addLine(p);
    setPickerOpen(false);
  };

  const totalPieces = lines.reduce((s, l) => s + l.qty, 0);
  const canConfirm = !!location && totalPieces > 0 && !saving;

  const confirm = async () => {
    if (!canConfirm || !stockId) return;
    setSaving(true);
    try {
      await api.createReceipt({
        stock_id: stockId,
        location: location!,
        note: note.trim() || undefined,
        items: lines.filter((l) => l.qty > 0).map((l) => ({ product_id: l.product.id, quantity: l.qty })),
      });
      setLines([]);
      setNote("");
      showToast(`Carico registrato: ${totalPieces} pz in ${location}`);
      ["products", "stats", "reorder", "receipts"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    } catch (e: any) {
      showToast(e?.message || "Carico non riuscito", false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          testID="back-btn"
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)" as any))}
          style={styles.iconBtn}
        >
          <Icon name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>Carico merce</Text>
          <Text style={styles.sub} numberOfLines={1}>{activeStock?.name}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 120 + insets.bottom }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>Ubicazione di destinazione</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {(locations.data || []).map((l) => (
            <Pressable
              key={l.id}
              testID={`receiving-loc-${l.name}`}
              onPress={() => setLocation(l.name)}
              style={[styles.chip, location === l.name && styles.chipActive]}
            >
              <Text style={[styles.chipText, location === l.name && styles.chipTextActive]}>{l.name}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.addRow}>
          <Pressable testID="receiving-scan-btn" onPress={() => { setScanMsg(null); setScanOpen(true); }} style={[styles.addBtn, styles.addBtnPrimary]}>
            <Icon name="barcode-scan" size={20} color={colors.onBrandPrimary} />
            <Text style={styles.addBtnPrimaryText}>Scansiona</Text>
          </Pressable>
          <Pressable testID="receiving-search-btn" onPress={() => { setUnknownCode(null); setPickerError(null); setPickerOpen(true); }} style={styles.addBtn}>
            <Icon name="magnify" size={20} color={colors.onSurface} />
            <Text style={styles.addBtnText}>Cerca articolo</Text>
          </Pressable>
        </View>

        {unknownCode && (
          <View style={styles.unknown} testID="receiving-unknown">
            <Text style={styles.unknownText}>Codice {unknownCode} non trovato in questo stock</Text>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Pressable testID="receiving-assign" onPress={() => { setPickerError(null); setPickerOpen(true); }} style={[styles.smallBtn, { backgroundColor: colors.brandPrimary }]}>
                <Text style={styles.smallBtnTextLight}>Associa ad articolo</Text>
              </Pressable>
              <Pressable
                testID="receiving-create"
                onPress={() => { const c = unknownCode; setUnknownCode(null); router.push({ pathname: "/product/new", params: { barcode: c } } as any); }}
                style={styles.smallBtn}
              >
                <Text style={styles.smallBtnText}>Crea nuovo</Text>
              </Pressable>
              <Pressable testID="receiving-unknown-dismiss" onPress={() => setUnknownCode(null)} style={styles.smallIcon}>
                <Icon name="close" size={18} color={colors.onSurface} />
              </Pressable>
            </View>
          </View>
        )}

        {lines.length === 0 ? (
          <View style={styles.empty}>
            <Icon name="truck-delivery-outline" size={40} color={colors.muted} />
            <Text style={styles.emptyText}>Scansiona o cerca gli articoli arrivati</Text>
          </View>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {lines.map((l) => (
              <View key={l.product.id} style={styles.line} testID={`receiving-line-${l.product.id}`}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lineName} numberOfLines={2}>{l.product.name}</Text>
                  <Text style={styles.sub} numberOfLines={1}>
                    {[l.product.internal_code, l.product.supplier_code].filter(Boolean).join(" · ") || `Giacenza ${l.product.total_quantity}`}
                  </Text>
                </View>
                <QuantityStepper
                  testIDPrefix={`receiving-qty-${l.product.id}`}
                  value={l.qty}
                  onChange={(d) => setLines((ls) => ls.map((x) => (x.product.id === l.product.id ? { ...x, qty: Math.max(0, x.qty + d) } : x)))}
                />
                <Pressable
                  testID={`receiving-remove-${l.product.id}`}
                  onPress={() => setLines((ls) => ls.filter((x) => x.product.id !== l.product.id))}
                  style={styles.smallIcon}
                >
                  <Icon name="trash-can-outline" size={18} color={colors.error} />
                </Pressable>
              </View>
            ))}
            <TextInput
              testID="receiving-note"
              value={note}
              onChangeText={setNote}
              placeholder="Nota (es. DDT n. 123)"
              placeholderTextColor={colors.muted}
              style={styles.noteInput}
            />
          </View>
        )}

        <Text style={[styles.label, { marginTop: spacing.md }]}>Ultimi carichi</Text>
        {receipts.isLoading ? (
          <ActivityIndicator color={colors.brandPrimary} />
        ) : (receipts.data?.length ?? 0) === 0 ? (
          <Text style={styles.sub}>Nessun carico registrato</Text>
        ) : (
          receipts.data!.map((r) => (
            <View key={r.id} style={styles.receipt} testID={`receipt-${r.id}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.lineName}>{new Date(r.created_at).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })} · {r.location}</Text>
                <Text style={styles.sub} numberOfLines={2}>
                  {r.items.map((i) => `${i.name} ×${i.quantity}`).join(", ")}{r.note ? ` — ${r.note}` : ""}
                </Text>
              </View>
              <Text style={styles.receiptPieces}>+{r.total_pieces}</Text>
            </View>
          ))
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Pressable testID="receiving-confirm" onPress={confirm} disabled={!canConfirm} style={[styles.cta, !canConfirm && { opacity: 0.5 }]}>
          {saving ? (
            <ActivityIndicator color={colors.onBrandPrimary} />
          ) : (
            <Text style={styles.ctaText}>Conferma carico{totalPieces > 0 ? ` (${totalPieces} pz)` : ""}</Text>
          )}
        </Pressable>
      </View>

      {toast && (
        <View style={[styles.toast, { bottom: insets.bottom + 88 }, !toast.ok && { backgroundColor: colors.error }]} testID="receiving-toast">
          <Text style={styles.toastText}>{toast.text}</Text>
        </View>
      )}

      <BarcodeScanModal
        visible={scanOpen}
        continuous
        title={`Carico in ${location ?? "…"}`}
        message={scanMsg}
        onCode={onScanCode}
        onClose={() => setScanOpen(false)}
      />
      <ProductPickerModal
        visible={pickerOpen}
        title={unknownCode ? "Associa codice ad articolo" : "Aggiungi articolo al carico"}
        subtitle={unknownCode ? `Codice ${unknownCode}` : null}
        error={pickerError}
        onPick={onPick}
        onClose={() => setPickerOpen(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  h1: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  sub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  label: { fontSize: 13, fontWeight: "800", color: colors.onSurface },
  chips: { gap: spacing.sm, paddingRight: spacing.lg },
  chip: {
    flexShrink: 0, height: 36, paddingHorizontal: spacing.md, borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
  },
  chipActive: { backgroundColor: colors.onSurface, borderColor: colors.onSurface },
  chipText: { fontSize: 13, fontWeight: "600", color: colors.onSurface },
  chipTextActive: { color: colors.surface },
  addRow: { flexDirection: "row", gap: spacing.sm },
  addBtn: {
    flex: 1, flexDirection: "row", gap: spacing.sm, alignItems: "center", justifyContent: "center",
    height: 52, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border,
  },
  addBtnPrimary: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  addBtnText: { fontWeight: "700", color: colors.onSurface },
  addBtnPrimaryText: { fontWeight: "800", color: colors.onBrandPrimary },
  unknown: { backgroundColor: colors.brandTertiary, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  unknownText: { fontWeight: "700", color: colors.onSurface },
  smallBtn: {
    height: 40, paddingHorizontal: spacing.md, borderRadius: radius.sm, justifyContent: "center",
    backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border,
  },
  smallBtnText: { fontWeight: "700", color: colors.onSurface },
  smallBtnTextLight: { fontWeight: "800", color: colors.onBrandPrimary },
  smallIcon: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xl },
  emptyText: { color: colors.muted, fontWeight: "600" },
  line: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
  },
  lineName: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  noteInput: {
    height: 48, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary, paddingHorizontal: spacing.md,
    color: colors.onSurface, fontSize: 15, borderWidth: 1, borderColor: colors.border,
  },
  receipt: {
    flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
  },
  receiptPieces: { fontSize: 16, fontWeight: "800", color: colors.success },
  footer: {
    position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.sm,
    backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border,
  },
  cta: { height: 52, borderRadius: radius.md, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  ctaText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 15 },
  toast: { position: "absolute", left: spacing.lg, right: spacing.lg, backgroundColor: colors.surfaceInverse, borderRadius: radius.md, padding: spacing.md },
  toastText: { color: colors.onSurfaceInverse, fontWeight: "700", textAlign: "center" },
});
