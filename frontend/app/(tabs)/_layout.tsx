import React from "react";
import { Tabs } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { Platform } from "react-native";
import { colors } from "@/src/theme";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surfaceSecondary,
          borderTopColor: colors.border,
          ...(Platform.OS === "web" ? { height: 64 } : {}),
        },
        tabBarItemStyle: { alignSelf: "center" },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => <Icon name="view-dashboard-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: "Inventario",
          tabBarIcon: ({ color, size }) => <Icon name="package-variant" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="scanner"
        options={{
          title: "Scanner",
          tabBarIcon: ({ color, size }) => <Icon name="barcode-scan" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="reorder"
        options={{
          title: "Riordina",
          tabBarIcon: ({ color, size }) => <Icon name="clipboard-list-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
