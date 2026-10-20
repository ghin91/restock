import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { LogBox, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { queryClient } from "@/src/query-client";
import { StockProvider } from "@/src/stock-context";

LogBox.ignoreAllLogs(true);

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <StockProvider>
            <KeyboardProvider>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="product/[id]" options={{ presentation: "card" }} />
                <Stack.Screen name="locations" options={{ presentation: "card" }} />
                <Stack.Screen name="stocks" options={{ presentation: "card" }} />
                <Stack.Screen name="order-export" options={{ presentation: "card" }} />
                <Stack.Screen name="receiving" options={{ presentation: "card" }} />
              </Stack>
            </KeyboardProvider>
          </StockProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
