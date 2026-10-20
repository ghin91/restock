import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Stock } from "@/src/api";

type Ctx = {
  stocks: Stock[];
  activeStock: Stock | null;
  loading: boolean;
  setActiveStockId: (id: string) => Promise<void>;
  refresh: () => void;
};

const StockCtx = createContext<Ctx | null>(null);
const KEY = "activeStockId";

export function StockProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const stocksQ = useQuery({ queryKey: ["stocks"], queryFn: api.listStocks });

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(KEY);
        if (saved) setActiveId(saved);
      } finally {
        setHydrated(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!stocksQ.data || !hydrated) return;
    const found = activeId && stocksQ.data.find((s) => s.id === activeId);
    if (!found && stocksQ.data[0]) {
      setActiveId(stocksQ.data[0].id);
      AsyncStorage.setItem(KEY, stocksQ.data[0].id).catch(() => {});
    }
  }, [stocksQ.data, hydrated, activeId]);

  const setActiveStockId = useCallback(async (id: string) => {
    setActiveId(id);
    await AsyncStorage.setItem(KEY, id);
    qc.invalidateQueries();
  }, [qc]);

  const refresh = useCallback(() => {
    stocksQ.refetch();
  }, [stocksQ]);

  const value = useMemo<Ctx>(() => ({
    stocks: stocksQ.data || [],
    activeStock: (stocksQ.data || []).find((s) => s.id === activeId) || null,
    loading: !hydrated || stocksQ.isLoading,
    setActiveStockId,
    refresh,
  }), [stocksQ.data, activeId, hydrated, stocksQ.isLoading, setActiveStockId, refresh]);

  return <StockCtx.Provider value={value}>{children}</StockCtx.Provider>;
}

export function useActiveStock(): Ctx {
  const c = useContext(StockCtx);
  if (!c) throw new Error("useActiveStock must be used within StockProvider");
  return c;
}
