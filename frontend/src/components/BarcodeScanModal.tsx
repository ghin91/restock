import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, Modal, Pressable, TextInput, Platform, KeyboardAvoidingView, ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions, BarcodeScanningResult } from "expo-camera";
import Icon from "@react-native-vector-icons/material-design-icons";
import * as Haptics from "expo-haptics";
import { colors, radius, spacing } from "@/src/theme";

export const BARCODE_TYPES = ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "code93", "itf14", "codabar"] as const;

type Props = {
  visible: boolean;
  title?: string;
  // Keep the camera open after each read (used by "Carico merce").
  continuous?: boolean;
  // Feedback line shown over the camera (e.g. "+1 Latte Intero").
  message?: string | null;
  onCode: (code: string) => void;
  onClose: () => void;
};

export function BarcodeScanModal({ visible, title = "Scansiona codice", continuous, message, onCode, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [manual, setManual] = useState("");
  const last = useRef<{ code: string; ts: number } | null>(null);

  useEffect(() => {
    if (visible) { setManual(""); setTorch(false); last.current = null; }
  }, [visible]);

  const emit = (code: string) => {
    const c = code.trim();
    if (!c) return;
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    onCode(c);
    setManual("");
    if (!continuous) onClose();
  };

  const onScan = (r: BarcodeScanningResult) => {
    const now = Date.now();
    if (last.current && last.current.code === r.data && now - last.current.ts < 1500) return;
    last.current = { code: r.data, ts: now };
    emit(r.data);
  };

  const cameraReady = Platform.OS !== "web" && permission?.granted;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.root}>
        {cameraReady ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            autofocus="on"
            enableTorch={torch}
            onBarcodeScanned={visible ? onScan : undefined}
            barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.noCam]}>
            {!permission ? (
              <ActivityIndicator color={colors.brandPrimary} />
            ) : Platform.OS === "web" ? (
              <Text style={styles.noCamText}>Fotocamera non disponibile nel browser: usa il campo qui sotto</Text>
            ) : (
              <View style={{ alignItems: "center", gap: spacing.md, padding: spacing.xl }}>
                <Icon name="camera-off-outline" size={48} color="#FFFFFF" />
                <Text style={styles.noCamText}>Serve la fotocamera per leggere i codici a barre</Text>
                {permission.canAskAgain ? (
                  <Pressable testID="scan-modal-grant" onPress={requestPermission} style={styles.grantBtn}>
                    <Text style={styles.grantText}>Consenti fotocamera</Text>
                  </Pressable>
                ) : (
                  <Text style={styles.noCamText}>Abilitala dalle Impostazioni del telefono</Text>
                )}
              </View>
            )}
          </View>
        )}

        <View style={[styles.top, { paddingTop: insets.top + spacing.sm }]}>
          <Pressable testID="scan-modal-close" onPress={onClose} style={styles.roundBtn}>
            <Icon name="close" size={22} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {cameraReady ? (
            <Pressable testID="scan-modal-torch" onPress={() => setTorch((t) => !t)} style={[styles.roundBtn, torch && { backgroundColor: colors.brandPrimary }]}>
              <Icon name={torch ? "flashlight" : "flashlight-off"} size={22} color="#FFFFFF" />
            </Pressable>
          ) : <View style={{ width: 44 }} />}
        </View>

        {cameraReady && (
          <View style={styles.frameWrap} pointerEvents="none">
            <View style={styles.frame}><View style={styles.line} /></View>
          </View>
        )}

        <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing.md }]}>
          {message ? (
            <View style={styles.msg} testID="scan-modal-message">
              <Text style={styles.msgText} numberOfLines={2}>{message}</Text>
            </View>
          ) : null}
          <View style={styles.inputRow}>
            <TextInput
              testID="scan-modal-input"
              value={manual}
              onChangeText={setManual}
              placeholder="Oppure digita il codice"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              returnKeyType="done"
              onSubmitEditing={() => emit(manual)}
              style={styles.input}
            />
            {manual.length > 0 && (
              <Pressable testID="scan-modal-clear" onPress={() => setManual("")} style={styles.clearBtn} hitSlop={8}>
                <Icon name="close-circle" size={20} color={colors.muted} />
              </Pressable>
            )}
            <Pressable testID="scan-modal-submit" onPress={() => emit(manual)} style={styles.okBtn}>
              <Icon name="check" size={22} color={colors.onBrandPrimary} />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000000" },
  noCam: { alignItems: "center", justifyContent: "center", backgroundColor: "#111111" },
  noCamText: { color: "#DDDDDD", textAlign: "center", paddingHorizontal: spacing.xl },
  grantBtn: { backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.lg, height: 48, borderRadius: radius.md, justifyContent: "center" },
  grantText: { color: colors.onBrandPrimary, fontWeight: "800" },
  top: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md },
  title: { flex: 1, color: "#FFFFFF", fontSize: 17, fontWeight: "800", textAlign: "center" },
  roundBtn: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" },
  frameWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  frame: { width: 300, height: 160, borderWidth: 3, borderColor: colors.brandPrimary, borderRadius: radius.md, justifyContent: "center" },
  line: { height: 2, marginHorizontal: spacing.lg, backgroundColor: colors.brandPrimary, opacity: 0.8 },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, gap: spacing.sm },
  msg: { backgroundColor: colors.surfaceInverse, borderRadius: radius.md, padding: spacing.md },
  msgText: { color: colors.onSurfaceInverse, fontWeight: "700", textAlign: "center" },
  inputRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.xs, paddingLeft: spacing.md,
  },
  input: { flex: 1, height: 44, fontSize: 16, color: colors.onSurface },
  clearBtn: { width: 32, height: 44, alignItems: "center", justifyContent: "center" },
  okBtn: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
});
