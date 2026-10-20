// Design tokens for StockCount Pro. Light theme only.
import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  surface: "#FDFBF7",
  onSurface: "#1A1A1A",
  surfaceSecondary: "#FFFFFF",
  onSurfaceSecondary: "#1A1A1A",
  surfaceTertiary: "#F2EFE9",
  onSurfaceTertiary: "#1A1A1A",
  surfaceInverse: "#2A2A2A",
  onSurfaceInverse: "#FFFFFF",
  muted: "#737373",

  brand: "#FF6B6B",
  onBrand: "#FFFFFF",
  brandPrimary: "#FF6B6B",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#FF8787",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#FFE3E3",
  onBrandTertiary: "#FF6B6B",

  success: "#059669",
  onSuccess: "#FFFFFF",
  warning: "#F59E0B",
  onWarning: "#1A1A1A",
  error: "#EF4444",
  onError: "#FFFFFF",
  info: "#3B82F6",
  onInfo: "#FFFFFF",

  border: "#E5E2DB",
  borderStrong: "#D4CFD1",
  divider: "#E5E2DB",
};

export type ThemeColors = typeof light;

export const defaultScheme = "light" satisfies ColorScheme;
export const themes: { light: ThemeColors; dark?: ThemeColors } = { light };

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}

setColorScheme?.(themes.dark ? null : defaultScheme);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = (system === "light" || system === "dark") && themes[system] ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}

export const colors = light;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };
export const radius = { sm: 8, md: 16, lg: 24, pill: 999 };
