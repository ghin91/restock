const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

export type Stock = { id: string; name: string; created_at: string };

export type ProductLocation = { location: string; quantity: number };

export type Product = {
  id: string;
  stock_id: string;
  name: string;
  barcode?: string | null;
  supplier?: string | null;
  internal_code?: string | null;
  supplier_code?: string | null;
  locations: ProductLocation[];
  min_threshold: number;
  unit: string;
  image_url?: string | null;
  manual_reorder: boolean;
  total_quantity: number;
  created_at: string;
  updated_at: string;
};

export type Location = { id: string; stock_id: string; name: string; created_at: string };
export type Receipt = {
  id: string;
  stock_id: string;
  location: string;
  note?: string | null;
  items: { product_id: string; name: string; quantity: number }[];
  total_pieces: number;
  created_at: string;
};
export type Stats = { total_products: number; low_stock: number; out_of_stock: number; total_units: number };

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    let detail = text;
    try { detail = JSON.parse(text).detail || text; } catch {}
    throw new Error(typeof detail === "string" ? detail : `${res.status}`);
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
  changeLocationQuantity: (id: string, locationName: string, delta: number) =>
    req<Product>(`/products/${id}/locations/${encodeURIComponent(locationName)}/quantity`, { method: "POST", body: JSON.stringify({ delta }) }),
  transfer: (id: string, from_location: string, to_location: string, quantity: number) =>
    req<Product>(`/products/${id}/transfer`, {
      method: "POST",
      body: JSON.stringify({ from_location, to_location, quantity }),
    }),
  listSuppliers: (stockId: string) => req<string[]>(`/suppliers${qs({ stock_id: stockId })}`),
  getByBarcode: (code: string, stockId: string) =>
    req<Product>(`/products/barcode/${encodeURIComponent(code)}${qs({ stock_id: stockId })}`),

  // Reorder
  reorderList: (stockId: string) => req<Product[]>(`/reorder${qs({ stock_id: stockId })}`),

  // Locations
  listLocations: (stockId: string) => req<Location[]>(`/locations${qs({ stock_id: stockId })}`),
  createLocation: (stockId: string, name: string) =>
    req<Location>("/locations", { method: "POST", body: JSON.stringify({ name, stock_id: stockId }) }),
  deleteLocation: (id: string) => req<{ ok: boolean }>(`/locations/${id}`, { method: "DELETE" }),

  // Receipts (carico magazzino)
  createReceipt: (data: { stock_id: string; location: string; note?: string; items: { product_id: string; quantity: number }[] }) =>
    req<Receipt>("/receipts", { method: "POST", body: JSON.stringify(data) }),
  listReceipts: (stockId: string) => req<Receipt[]>(`/receipts${qs({ stock_id: stockId })}`),

  // Stats
  stats: (stockId: string) => req<Stats>(`/stats${qs({ stock_id: stockId })}`),
};
