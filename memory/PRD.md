# StockCount Pro — PRD

## Overview
Mobile stock-count app (React Native / Expo) in Italian for small shop owners. The owner taps `+` / `-` on each product to update its count, scans barcodes (camera or manual), and keeps a reorder list of low-stock items. Multi-stock aware: completely isolated inventories (shops / warehouses), each with its own locations, products and reorder list.

## Users
- Single owner device (no authentication).

## Core Features
1. **Multi-stock isolation** – create, rename, delete and switch between stocks. Each stock has its own products, locations and reorder list. Data never crosses between stocks.
2. **Inventory list** – scrollable list of products with inline 44x44 `+` / `-` steppers, search bar, horizontal location-filter chips, color-coded stock-health bar (green / amber / red), and badges for `Scarso` / `Esaurito`.
3. **Barcode scanner** – native camera (`expo-camera`) with viewfinder frame + ean/upc/qr detection; manual entry fallback dialog on every screen. On scan or manual lookup a bottom sheet shows the product with a quantity stepper. Unknown codes offer a "Crea nuovo prodotto" shortcut that pre-fills the barcode.
4. **Reorder list** – auto-populated with products where `quantity <= min_threshold` or `manual_reorder = true`. Floating "Condividi lista" button generates a plain-text list prefixed with the active stock name.
5. **Product CRUD** – name, barcode, location (picker from the active stock's locations), quantity, min threshold, unit, manual reorder toggle. Create / update / delete.
6. **Locations management** – scoped to the active stock. Delete is blocked (400) if products still reference the location.

## Design
- Theme: Tactile / Playful LIGHT. Warm off-white surface `#FDFBF7`, Coral brand `#FF6B6B`, traffic-light status colors.
- Navigation: 4 bottom tabs — Home, Inventario, Scanner, Riordina. Stacks for product form, locations and stocks.
- All colors sourced from `src/theme.ts`.

## Backend (FastAPI + MongoDB)
Routes (all prefixed with `/api`):
- `GET /stocks`, `POST /stocks`, `PATCH /stocks/{id}`, `DELETE /stocks/{id}` (cascade; cannot delete last)
- `GET /products?stock_id=&q=&location=`, `GET /products/{id}`, `POST /products`, `PATCH /products/{id}`, `DELETE /products/{id}`, `POST /products/{id}/quantity {delta}`
- `GET /products/barcode/{code}?stock_id=`
- `GET /reorder?stock_id=`
- `GET /locations?stock_id=`, `POST /locations`, `DELETE /locations/{id}`
- `GET /stats?stock_id=`
- Seed on startup: creates default stock "Negozio Principale" with 4 locations and 10 sample products; migrates any legacy data to the default stock.

## Integrations
- `expo-camera` for barcode scanning (CAMERA permission declared on iOS & Android).
- `expo-haptics` for stepper feedback.
- No third-party integration or auth.

## Update — Multi-location per product (Oct 2026)
- Product now has `locations: [{location, quantity}]` + derived `total_quantity`.
- Reorder and stats use the TOTAL across all locations.
- New endpoint `POST /api/products/{id}/locations/{name}/quantity {delta}`.
- Product form: add/remove locations, each with its own quantity, live total.
- Inventory: location chip = edit that location's quantity; multi-location rows show total.
- Scanner: per-location steppers in result sheet; autofocus, torch, 2x zoom, 1D-only formats, EAN-13/UPC-A leading-zero tolerant lookup.

## Future Enhancements
- Export reorder list as CSV / email.
- Historical movements log (audit trail).
