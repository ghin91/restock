const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

export type Stock = { id: string; name: string; created_at: string };

export type Product = {
  id: string;
  stock_id: string;
  name: string;
  barcode?: string | null;
  location: string;
  quantity: number;
  min_threshold: number;
  unit: string;
  image_url?: string | null;
  manual_reorder: boolean;
  created_at: string;
  updated_at: string;
};

export type Location = { id: string; stock_id: string; name: string; created_at: string };
export type Stats = { total_products: number; low_stock: number; out_of_stock: number; total_units: number };

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

function qs(params: Record<string, string | undefined>) {
  const s = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") s.set(k, String(v)); });
  const str = s.toString();
  return str ? `?${str}` : "";
}

export const api = {
  // Stocks
  listStocks: () => req<Stock[]>("/stocks"),
  createStock: (name: string) => req<Stock>("/stocks", { method: "POST", body: JSON.stringify({ name }) }),
  updateStock: (id: string, name: string) => req<Stock>(`/stocks/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  deleteStock: (id: string) => req<{ ok: boolean }>(`/stocks/${id}`, { method: "DELETE" }),

  // Products
  listProducts: (stockId: string, params?: { location?: string; q?: string }) =>
    req<Product[]>(`/products${qs({ stock_id: stockId, location: params?.location, q: params?.q })}`),
  getProduct: (id: string) => req<Product>(`/products/${id}`),
  createProduct: (data: Partial<Product> & { stock_id: string; name: string }) =>
    req<Product>("/products", { method: "POST", body: JSON.stringify(data) }),
  updateProduct: (id: string, data: Partial<Product>) =>
    req<Product>(`/products/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteProduct: (id: string) => req<{ ok: boolean }>(`/products/${id}`, { method: "DELETE" }),
  changeQuantity: (id: string, delta: number) =>
    req<Product>(`/products/${id}/quantity`, { method: "POST", body: JSON.stringify({ delta }) }),
  getByBarcode: (code: string, stockId: string) =>
    req<Product>(`/products/barcode/${encodeURIComponent(code)}${qs({ stock_id: stockId })}`),

  // Reorder
  reorderList: (stockId: string) => req<Product[]>(`/reorder${qs({ stock_id: stockId })}`),

  // Locations
  listLocations: (stockId: string) => req<Location[]>(`/locations${qs({ stock_id: stockId })}`),
  createLocation: (stockId: string, name: string) =>
    req<Location>("/locations", { method: "POST", body: JSON.stringify({ name, stock_id: stockId }) }),
  deleteLocation: (id: string) => req<{ ok: boolean }>(`/locations/${id}`, { method: "DELETE" }),

  // Stats
  stats: (stockId: string) => req<Stats>(`/stats${qs({ stock_id: stockId })}`),
};
