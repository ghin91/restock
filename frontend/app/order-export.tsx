import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, SectionList, ActivityIndicator, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import Icon from "@react-native-vector-icons/material-design-icons";
import { api, Product } from "@/src/api";
import { useActiveStock } from "@/src/stock-context";
import { colors, radius, spacing } from "@/src/theme";
import { QuantityStepper } from "@/src/components/QuantityStepper";
import { exportOrderPdf, suggestedQty } from "@/src/utils/order-pdf";
import { storage } from "@/src/utils/storage";

const NO_SUPPLIER = "Senza fornitore";

export default function OrderExport() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { activeStock } = useActiveStock();
  const stockId = activeStock?.id;
  const reorder = useQuery({ queryKey: ["reorder", stockId], queryFn: () => api.reorderList(stockId!), enabled: !!stockId });

  // Editable quantity to order per product id.
  const [qty, setQty] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Customer printed on the PDF, remembered per stock.
  const [client, setClient] = useState("");
  const clientKey = stockId ? `order_client_${stockId}` : null;

  useEffect(() => {
    if (!clientKey) return;
    storage.getItem(clientKey, "").then((v) => setClient(typeof v === "string" ? v : ""));
  }, [clientKey]);

  const changeClient = (v: string) => {
    setClient(v);
    if (clientKey) storage.setItem(clientKey, v);
  };

  useEffect(() => {
    if (!reorder.data) return;
    setQty((prev) => {
      const next = { ...prev };
      reorder.data!.forEach((p) => {
        if (next[p.id] === undefined) next[p.id] = suggestedQty(p.total_quantity, p.min_threshold);
      });
      return next;
    });
  }, [reorder.data]);

  const sections = useMemo(() => {
    const groups: Record<string, Product[]> = {};
    (reorder.data || []).forEach((p) => {
      const key = p.supplier || NO_SUPPLIER;
      (groups[key] ||= []).push(p);
    });
    return Object.keys(groups)
      .sort((a, b) => (a === NO_SUPPLIER ? 1 : b === NO_SUPPLIER ? -1 : a.localeCompare(b)))
      .map((title) => ({ title, data: groups[title] }));
  }, [reorder.data]);

  const exportSupplier = async (title: string, items: Product[]) => {
    const lines = items
      .filter((p) => (qty[p.id] ?? 0) > 0)
      .map((p) => ({
        name: p.name,
        supplier_code: p.supplier_code,
        barcode: p.barcode,
        unit: p.unit,
        qty: qty[p.id],
      }));
    if (lines.length === 0) {
      setToast("Nessuna quantità da ordinare per questo fornitore");
      setTimeout(() => setToast(null), 2500);
      return;
    }
    setBusy(title);
    try {
      await exportOrderPdf(client.trim(), title, lines);
    } catch {
      setToast("Esportazione PDF non riuscita");
      setTimeout(() => setToast(null), 2500);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          testID="back-btn"
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/reorder" as any))}
          style={styles.iconBtn}
        >
          <Icon name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>Ordini fornitori</Text>
          <Text style={styles.sub} numberOfLines={1}>{activeStock?.name}</Text>
        </View>
      </View>

      <View style={styles.clientBox}>
        <Text style={styles.clientLabel}>Cliente sul PDF</Text>
        <View style={styles.clientRow}>
          <Icon name="account-outline" size={18} color={colors.muted} />
          <TextInput
            testID="order-client-input"
            value={client}
            onChangeText={changeClient}
            placeholder="Nome cliente / ragione sociale"
            placeholderTextColor={colors.muted}
            style={styles.clientInput}
          />
          {client.length > 0 && (
            <Pressable testID="order-client-clear" onPress={() => changeClient("")} hitSlop={8}>
              <Icon name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          )}
        </View>
      </View>

      {reorder.isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>
      ) : sections.length === 0 ? (
        <View style={styles.center}>
          <Icon name="check-circle-outline" size={48} color={colors.success} />
          <Text style={styles.emptyT}>Niente da ordinare</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(p) => p.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl, gap: spacing.sm }}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader} testID={`supplier-section-${section.title}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                <Text style={styles.sub}>{section.data.length} prodotti</Text>
              </View>
              <Pressable
                testID={`export-pdf-${section.title}`}
                onPress={() => exportSupplier(section.title, section.data)}
                disabled={busy !== null}
                style={[styles.pdfBtn, busy !== null && { opacity: 0.6 }]}
              >
                {busy === section.title ? (
                  <ActivityIndicator color={colors.onBrandPrimary} />
                ) : (
                  <>
                    <Icon name="file-pdf-box" size={18} color={colors.onBrandPrimary} />
                    <Text style={styles.pdfText}>PDF</Text>
                  </>
                )}
              </Pressable>
            </View>
          )}
          renderItem={({ item }) => (
            <View style={styles.row} testID={`order-row-${item.id}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
                {item.supplier_code ? <Text style={styles.sub}>Cod. fornitore {item.supplier_code}</Text> : null}
                <Text style={styles.sub}>Giacenza {item.total_quantity} · min {item.min_threshold} {item.unit}</Text>
              </View>
              <QuantityStepper
                testIDPrefix={`order-qty-${item.id}`}
                value={qty[item.id] ?? 0}
                onChange={(d) => setQty((q) => ({ ...q, [item.id]: Math.max(0, (q[item.id] ?? 0) + d) }))}
              />
            </View>
          )}
        />
      )}

      {toast && (
        <View style={[styles.toast, { bottom: insets.bottom + spacing.lg }]} testID="order-toast">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingBottom: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  h1: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  sub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm },
  clientBox: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.xs },
  clientLabel: { fontSize: 13, fontWeight: "700", color: colors.onSurface },
  clientRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm, height: 48,
    backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, paddingHorizontal: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  clientInput: { flex: 1, height: "100%", fontSize: 15, color: colors.onSurface },
  emptyT: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
  sectionHeader: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    marginTop: spacing.md, marginBottom: spacing.xs,
  },
  sectionTitle: { fontSize: 17, fontWeight: "800", color: colors.onSurface },
  pdfBtn: {
    flexDirection: "row", alignItems: "center", gap: spacing.xs,
    backgroundColor: colors.brandPrimary, height: 40, minWidth: 80, paddingHorizontal: spacing.md,
    borderRadius: radius.pill, justifyContent: "center",
  },
  pdfText: { color: colors.onBrandPrimary, fontWeight: "800" },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  name: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  toast: {
    position: "absolute", left: spacing.lg, right: spacing.lg,
    backgroundColor: colors.surfaceInverse, borderRadius: radius.md, padding: spacing.md,
  },
  toastText: { color: colors.onSurfaceInverse, fontWeight: "600", textAlign: "center" },
});
