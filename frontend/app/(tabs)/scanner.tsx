import React, { useRef, useState } from "react";
import {
  View, Text, StyleSheet, Pressable, Modal, TextInput, Platform, ActivityIndicator, KeyboardAvoidingView, ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { CameraView, useCameraPermissions, BarcodeScanningResult } from "expo-camera";
import Icon from "@react-native-vector-icons/material-design-icons";
import * as Haptics from "expo-haptics";
import { api, Product } from "@/src/api";
import { colors, radius, spacing } from "@/src/theme";
import { LocationQtyList } from "@/src/components/LocationQtyList";
import { useQueryClient } from "@tanstack/react-query";
import { useActiveStock } from "@/src/stock-context";

// Linear (1D) retail formats only: fewer decoders = faster, more reliable reads.
const BARCODE_TYPES = ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "code93", "itf14", "codabar"] as const;

export default function Scanner() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { activeStock } = useActiveStock();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(true);
  const [torch, setTorch] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [current, setCurrent] = useState<Product | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const lastScanRef = useRef<{ code: string; ts: number } | null>(null);

  const lookup = async (code: string) => {
    if (!activeStock) return;
    setLoading(true);
    setNotFound(null);
    try {
      const p = await api.getByBarcode(code, activeStock.id);
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      setCurrent(p);
    } catch {
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
      setCurrent(null);
      setNotFound(code);
    } finally {
      setLoading(false);
    }
  };

  const onBarcode = (result: BarcodeScanningResult) => {
    const code = result.data;
    const now = Date.now();
    if (lastScanRef.current && lastScanRef.current.code === code && now - lastScanRef.current.ts < 1500) return;
    lastScanRef.current = { code, ts: now };
    setScanning(false);
    lookup(code);
  };

  const onDelta = async (location: string, delta: number) => {
    if (!current) return;
    const updated = await api.changeLocationQuantity(current.id, location, delta);
    setCurrent(updated);
    qc.invalidateQueries({ queryKey: ["products", activeStock?.id] });
    qc.invalidateQueries({ queryKey: ["stats", activeStock?.id] });
    qc.invalidateQueries({ queryKey: ["reorder", activeStock?.id] });
  };

  const closeSheet = () => {
    setCurrent(null);
    setNotFound(null);
    setScanning(true);
  };

  const submitManual = async () => {
    if (!manualCode.trim()) return;
    setManualOpen(false);
    setScanning(false);
    await lookup(manualCode.trim());
    setManualCode("");
  };

  if (!permission) {
    return <View style={[styles.container, styles.center]}><ActivityIndicator color={colors.brandPrimary} /></View>;
  }

  const resultSheet = (current || notFound || loading) ? (
    <Pressable style={styles.backdrop} onPress={closeSheet}>
      <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} onPress={() => {}}>
        {loading ? (
          <ActivityIndicator color={colors.brandPrimary} style={{ padding: spacing.xl }} />
        ) : current ? (
          <View style={{ gap: spacing.md }}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetIcon}>
                <Icon name="package-variant-closed" size={28} color={colors.brandPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle} numberOfLines={2}>{current.name}</Text>
                <Text style={styles.sheetMeta}>Totale {current.total_quantity} {current.unit} · min {current.min_threshold}</Text>
              </View>
            </View>
            <ScrollView style={{ maxHeight: 280 }}>
              <LocationQtyList product={current} onDelta={onDelta} testIDPrefix="scanner-loc" />
            </ScrollView>
            <Pressable
              testID="open-product"
              onPress={() => { const pid = current.id; closeSheet(); router.push(`/product/${pid}` as any); }}
              style={styles.secondaryBtn}
            >
              <Text style={styles.secondaryBtnText}>Apri dettagli</Text>
            </Pressable>
            <Pressable testID="scan-next" onPress={closeSheet} style={styles.primaryBtn}>
              <Text style={styles.primaryBtnText}>Scansiona il prossimo</Text>
            </Pressable>
          </View>
        ) : notFound ? (
          <View style={{ gap: spacing.md }}>
            <Icon name="help-circle-outline" size={44} color={colors.warning} style={{ alignSelf: "center" }} />
            <Text style={[styles.sheetTitle, { textAlign: "center" }]}>Codice non trovato</Text>
            <Text style={{ color: colors.muted, textAlign: "center" }}>{notFound}</Text>
            <Pressable
              testID="create-from-scan"
              onPress={() => { const code = notFound; closeSheet(); router.push({ pathname: "/product/new", params: { barcode: code! } } as any); }}
              style={styles.primaryBtn}
            >
              <Text style={styles.primaryBtnText}>Crea nuovo prodotto</Text>
            </Pressable>
            <Pressable testID="scan-again" onPress={closeSheet} style={styles.secondaryBtn}>
              <Text style={styles.secondaryBtnText}>Scansiona di nuovo</Text>
            </Pressable>
          </View>
        ) : null}
      </Pressable>
    </Pressable>
  ) : null;

  const manualDialog = (
    <ManualDialog
      visible={manualOpen} onClose={() => setManualOpen(false)}
      code={manualCode} setCode={setManualCode} onSubmit={submitManual}
    />
  );

  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.center, { padding: spacing.xl }]}>
        <Icon name="camera-off-outline" size={56} color={colors.muted} />
        <Text style={styles.permTitle}>Permesso fotocamera richiesto</Text>
        <Text style={styles.permDesc}>Per scansionare i codici a barre serve l&apos;accesso alla fotocamera.</Text>
        <Pressable testID="grant-permission" onPress={requestPermission} style={styles.primaryBtn}>
          <Text style={styles.primaryBtnText}>Concedi permesso</Text>
        </Pressable>
        <Pressable testID="manual-only" onPress={() => setManualOpen(true)} style={styles.secondaryBtn}>
          <Text style={styles.secondaryBtnText}>Inserimento manuale</Text>
        </Pressable>
        {resultSheet}
        {manualDialog}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {Platform.OS !== "web" ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          autofocus="on"
          enableTorch={torch}
          zoom={zoomed ? 0.25 : 0}
          onBarcodeScanned={scanning ? onBarcode : undefined}
          barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "#111", alignItems: "center", justifyContent: "center" }]}>
          <Icon name="camera" size={60} color="#555" />
          <Text style={{ color: "#aaa", marginTop: 12 }}>Anteprima fotocamera non disponibile su web</Text>
          <Text style={{ color: "#777", marginTop: 4, fontSize: 12 }}>Usa l&apos;inserimento manuale</Text>
        </View>
      )}

      {/* overlay */}
      <View style={[StyleSheet.absoluteFill, { pointerEvents: "box-none" }]}>
        <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
          <Text style={styles.topText}>Scansiona codice a barre</Text>
          <Text style={styles.topSub}>Tieni il codice orizzontale a 10–20 cm</Text>
        </View>

        <View style={styles.frameWrap}>
          <View style={styles.frame}>
            <View style={[styles.corner, styles.cTL]} />
            <View style={[styles.corner, styles.cTR]} />
            <View style={[styles.corner, styles.cBL]} />
            <View style={[styles.corner, styles.cBR]} />
            <View style={styles.scanLine} />
          </View>
        </View>

        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.toolsRow}>
            <Pressable
              testID="torch-toggle"
              onPress={() => setTorch((t) => !t)}
              style={[styles.toolBtn, torch && styles.toolBtnActive]}
            >
              <Icon name={torch ? "flashlight" : "flashlight-off"} size={22} color={torch ? colors.onBrandPrimary : "#FFFFFF"} />
            </Pressable>
            <Pressable testID="manual-entry-btn" onPress={() => setManualOpen(true)} style={styles.manualBtn}>
              <Icon name="keyboard-outline" size={22} color={colors.onBrandPrimary} />
              <Text style={styles.manualBtnText}>Inserimento manuale</Text>
            </Pressable>
            <Pressable
              testID="zoom-toggle"
              onPress={() => setZoomed((z) => !z)}
              style={[styles.toolBtn, zoomed && styles.toolBtnActive]}
            >
              <Icon name={zoomed ? "magnify-minus-outline" : "magnify-plus-outline"} size={22} color={zoomed ? colors.onBrandPrimary : "#FFFFFF"} />
            </Pressable>
          </View>
        </View>
      </View>

      {/* Result bottom sheet */}
      {resultSheet}

      {manualDialog}
    </View>
  );
}

function ManualDialog({
  visible, onClose, code, setCode, onSubmit,
}: { visible: boolean; onClose: () => void; code: string; setCode: (v: string) => void; onSubmit: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.modalBackdrop}
      >
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Inserisci codice a barre</Text>
          <TextInput
            testID="manual-code-input"
            value={code}
            onChangeText={setCode}
            placeholder="es. 8001234500011"
            placeholderTextColor={colors.muted}
            keyboardType="number-pad"
            autoFocus
            style={styles.input}
          />
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Pressable onPress={onClose} style={[styles.secondaryBtn, { flex: 1 }]}>
              <Text style={styles.secondaryBtnText}>Annulla</Text>
            </Pressable>
            <Pressable testID="manual-submit" onPress={onSubmit} style={[styles.primaryBtn, { flex: 1 }]}>
              <Text style={styles.primaryBtnText}>Cerca</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  center: { alignItems: "center", justifyContent: "center", gap: spacing.md, backgroundColor: colors.surface },
  topBar: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, alignItems: "center", gap: 4 },
  topText: { color: "#fff", fontSize: 18, fontWeight: "800" },
  topSub: { color: "rgba(255,255,255,0.75)", fontSize: 13 },
  frameWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  frame: { width: 300, height: 160 },
  scanLine: {
    position: "absolute", left: 16, right: 16, top: "50%", height: 2,
    backgroundColor: colors.brandPrimary, opacity: 0.8,
  },
  toolsRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  toolBtn: {
    width: 48, height: 48, borderRadius: radius.pill,
    backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center",
  },
  toolBtnActive: { backgroundColor: colors.brandPrimary },
  corner: { position: "absolute", width: 28, height: 28, borderColor: colors.brandPrimary },
  cTL: { top: 0, left: 0, borderLeftWidth: 4, borderTopWidth: 4, borderTopLeftRadius: 10 },
  cTR: { top: 0, right: 0, borderRightWidth: 4, borderTopWidth: 4, borderTopRightRadius: 10 },
  cBL: { bottom: 0, left: 0, borderLeftWidth: 4, borderBottomWidth: 4, borderBottomLeftRadius: 10 },
  cBR: { bottom: 0, right: 0, borderRightWidth: 4, borderBottomWidth: 4, borderBottomRightRadius: 10 },
  bottomBar: { paddingHorizontal: spacing.lg, alignItems: "center" },
  manualBtn: {
    flexDirection: "row", gap: spacing.sm, alignItems: "center",
    backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md, borderRadius: radius.pill,
  },
  manualBtnText: { color: colors.onBrandPrimary, fontWeight: "800" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    gap: spacing.md,
  },
  sheetHeader: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  sheetIcon: {
    width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.brandTertiary,
    alignItems: "center", justifyContent: "center",
  },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  sheetMeta: { color: colors.muted, marginTop: 2 },
  qtyRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  qtyLabel: { fontWeight: "700", color: colors.onSurface, fontSize: 15 },
  primaryBtn: {
    backgroundColor: colors.brandPrimary, paddingVertical: spacing.md, borderRadius: radius.md,
    alignItems: "center",
  },
  primaryBtnText: { color: colors.onBrandPrimary, fontWeight: "800" },
  secondaryBtn: {
    backgroundColor: colors.surfaceSecondary, paddingVertical: spacing.md, borderRadius: radius.md,
    alignItems: "center", borderWidth: 1, borderColor: colors.border,
  },
  secondaryBtnText: { color: colors.onSurface, fontWeight: "700" },
  permTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface, textAlign: "center" },
  permDesc: { color: colors.muted, textAlign: "center" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  modalCard: {
    width: "100%", maxWidth: 420,
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md,
  },
  modalTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  input: {
    backgroundColor: colors.surfaceTertiary, borderRadius: radius.md,
    paddingHorizontal: spacing.md, height: 48, color: colors.onSurface, fontSize: 15,
  },
});
