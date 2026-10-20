from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timezone


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()


@app.get("/health", include_in_schema=False)
@app.head("/health", include_in_schema=False)
async def health():
    return {"status": "ok"}


api_router = APIRouter(prefix="/api")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------- Models ----------
class Stock(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    created_at: str = Field(default_factory=now_iso)


class StockCreate(BaseModel):
    name: str


class StockUpdate(BaseModel):
    name: Optional[str] = None


class ProductLocation(BaseModel):
    location: str
    quantity: int = 0


class Product(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    stock_id: str
    name: str
    barcode: Optional[str] = None
    supplier: Optional[str] = None
    internal_code: Optional[str] = None
    supplier_code: Optional[str] = None
    locations: List[ProductLocation] = []
    min_threshold: int = 5
    unit: str = "pz"
    image_url: Optional[str] = None
    manual_reorder: bool = False
    total_quantity: int = 0
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


class ProductCreate(BaseModel):
    stock_id: str
    name: str
    barcode: Optional[str] = None
    supplier: Optional[str] = None
    internal_code: Optional[str] = None
    supplier_code: Optional[str] = None
    locations: List[ProductLocation] = []
    min_threshold: int = 5
    unit: str = "pz"
    image_url: Optional[str] = None
    manual_reorder: bool = False


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    barcode: Optional[str] = None
    supplier: Optional[str] = None
    internal_code: Optional[str] = None
    supplier_code: Optional[str] = None
    locations: Optional[List[ProductLocation]] = None
    min_threshold: Optional[int] = None
    unit: Optional[str] = None
    image_url: Optional[str] = None
    manual_reorder: Optional[bool] = None


class QuantityDelta(BaseModel):
    delta: int


class Location(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    stock_id: str
    name: str
    created_at: str = Field(default_factory=now_iso)


class LocationCreate(BaseModel):
    stock_id: str
    name: str


async def _ensure_stock(stock_id: str):
    s = await db.stocks.find_one({"id": stock_id}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="Stock not found")
    return s


async def _ensure_barcode_free(stock_id: str, barcode: Optional[str], exclude_id: Optional[str] = None):
    """A barcode can belong to only one product inside the same stock."""
    if not barcode or not barcode.strip():
        return
    query: dict = {"stock_id": stock_id, "barcode": barcode.strip()}
    if exclude_id:
        query["id"] = {"$ne": exclude_id}
    other = await db.products.find_one(query, {"_id": 0, "name": 1})
    if other:
        raise HTTPException(status_code=409, detail=f"Codice già associato a: {other['name']}")


def _hydrate_product(doc: dict) -> Product:
    locs = doc.get("locations")
    if not isinstance(locs, list) or not locs:
        # Legacy fallback (should have been migrated at startup)
        legacy_loc = doc.get("location") or "Magazzino"
        legacy_qty = int(doc.get("quantity") or 0)
        locs = [{"location": legacy_loc, "quantity": legacy_qty}]
    norm = [ProductLocation(location=l.get("location", "Magazzino"), quantity=int(l.get("quantity") or 0)) for l in locs]
    total = sum(l.quantity for l in norm)
    doc_clean = {
        "id": doc["id"],
        "stock_id": doc["stock_id"],
        "name": doc["name"],
        "barcode": doc.get("barcode"),
        "supplier": (doc.get("supplier") or "").strip() or None,
        "internal_code": (doc.get("internal_code") or "").strip() or None,
        "supplier_code": (doc.get("supplier_code") or "").strip() or None,
        "locations": [l.dict() for l in norm],
        "min_threshold": int(doc.get("min_threshold") or 0),
        "unit": doc.get("unit") or "pz",
        "image_url": doc.get("image_url"),
        "manual_reorder": bool(doc.get("manual_reorder")),
        "total_quantity": total,
        "created_at": doc.get("created_at") or now_iso(),
        "updated_at": doc.get("updated_at") or now_iso(),
    }
    return Product(**doc_clean)


# ---------- Stocks ----------
@api_router.get("/stocks", response_model=List[Stock])
async def list_stocks():
    docs = await db.stocks.find({}, {"_id": 0}).sort("created_at", 1).to_list(500)
    return [Stock(**d) for d in docs]


@api_router.post("/stocks", response_model=Stock)
async def create_stock(payload: StockCreate):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    stock = Stock(name=name)
    await db.stocks.insert_one(stock.dict())
    return stock


@api_router.patch("/stocks/{stock_id}", response_model=Stock)
async def update_stock(stock_id: str, payload: StockUpdate):
    update = {k: v for k, v in payload.dict().items() if v is not None}
    if not update:
        s = await _ensure_stock(stock_id)
        return Stock(**s)
    result = await db.stocks.update_one({"id": stock_id}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Stock not found")
    s = await db.stocks.find_one({"id": stock_id}, {"_id": 0})
    return Stock(**s)


@api_router.delete("/stocks/{stock_id}")
async def delete_stock(stock_id: str):
    count = await db.stocks.count_documents({})
    if count <= 1:
        raise HTTPException(status_code=400, detail="Cannot delete the only stock")
    await _ensure_stock(stock_id)
    await db.products.delete_many({"stock_id": stock_id})
    await db.locations.delete_many({"stock_id": stock_id})
    await db.receipts.delete_many({"stock_id": stock_id})
    await db.stocks.delete_one({"id": stock_id})
    return {"ok": True}


# ---------- Products ----------
@api_router.get("/products", response_model=List[Product])
async def list_products(stock_id: str, location: Optional[str] = None, q: Optional[str] = None):
    await _ensure_stock(stock_id)
    query: dict = {"stock_id": stock_id}
    if location:
        query["locations.location"] = location
    if q:
        rx = {"$regex": re.escape(q), "$options": "i"}
        query["$or"] = [{"name": rx}, {"internal_code": rx}, {"supplier_code": rx}, {"barcode": rx}]
    docs = await db.products.find(query, {"_id": 0}).sort("name", 1).to_list(2000)
    return [_hydrate_product(d) for d in docs]


@api_router.post("/products", response_model=Product)
async def create_product(payload: ProductCreate):
    await _ensure_stock(payload.stock_id)
    await _ensure_barcode_free(payload.stock_id, payload.barcode)
    data = payload.dict()
    if not data.get("locations"):
        data["locations"] = [{"location": "Magazzino", "quantity": 0}]
    product = Product(**data, total_quantity=sum(l["quantity"] for l in data["locations"]))
    doc = product.dict()
    await db.products.insert_one(doc)
    return _hydrate_product(doc)


@api_router.get("/products/{product_id}", response_model=Product)
async def get_product(product_id: str):
    doc = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Product not found")
    return _hydrate_product(doc)


@api_router.patch("/products/{product_id}", response_model=Product)
async def update_product(product_id: str, payload: ProductUpdate):
    update = {k: v for k, v in payload.dict().items() if v is not None}
    if update.get("barcode"):
        update["barcode"] = update["barcode"].strip()
        current = await db.products.find_one({"id": product_id}, {"_id": 0, "stock_id": 1})
        if current:
            await _ensure_barcode_free(current["stock_id"], update["barcode"], exclude_id=product_id)
    if "locations" in update:
        update["locations"] = [
            {"location": (l.get("location") if isinstance(l, dict) else l.location),
             "quantity": max(0, int((l.get("quantity") if isinstance(l, dict) else l.quantity) or 0))}
            for l in update["locations"]
        ]
    update["updated_at"] = now_iso()
    result = await db.products.update_one({"id": product_id}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    doc = await db.products.find_one({"id": product_id}, {"_id": 0})
    return _hydrate_product(doc)


@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str):
    result = await db.products.delete_one({"id": product_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"ok": True}


async def _adjust_location_quantity(product_id: str, location_name: Optional[str], delta: int) -> Product:
    doc = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Product not found")
    locs = doc.get("locations") or []
    if not locs:
        locs = [{"location": doc.get("location") or "Magazzino", "quantity": int(doc.get("quantity") or 0)}]
    if location_name is None:
        # Apply to the first (primary) location
        if not locs:
            raise HTTPException(status_code=400, detail="Product has no locations")
        locs[0]["quantity"] = max(0, int(locs[0].get("quantity") or 0) + delta)
    else:
        idx = next((i for i, l in enumerate(locs) if l.get("location") == location_name), -1)
        if idx == -1:
            if delta <= 0:
                raise HTTPException(status_code=404, detail="Location not found on this product")
            locs.append({"location": location_name, "quantity": max(0, delta)})
        else:
            locs[idx]["quantity"] = max(0, int(locs[idx].get("quantity") or 0) + delta)
    await db.products.update_one(
        {"id": product_id},
        {"$set": {"locations": locs, "updated_at": now_iso()}},
    )
    doc["locations"] = locs
    doc["updated_at"] = now_iso()
    return _hydrate_product(doc)


@api_router.post("/products/{product_id}/quantity", response_model=Product)
async def change_quantity(product_id: str, body: QuantityDelta):
    return await _adjust_location_quantity(product_id, None, body.delta)


@api_router.post("/products/{product_id}/locations/{location_name}/quantity", response_model=Product)
async def change_location_quantity(product_id: str, location_name: str, body: QuantityDelta):
    return await _adjust_location_quantity(product_id, location_name, body.delta)


class TransferBody(BaseModel):
    from_location: str
    to_location: str
    quantity: int


@api_router.post("/products/{product_id}/transfer", response_model=Product)
async def transfer_stock(product_id: str, body: TransferBody):
    """Move quantity between two locations of the same product (total unchanged)."""
    if body.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be > 0")
    if body.from_location == body.to_location:
        raise HTTPException(status_code=400, detail="Source and destination must differ")
    doc = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Product not found")
    locs = _hydrate_product(doc).dict()["locations"]
    src = next((l for l in locs if l["location"] == body.from_location), None)
    if not src:
        raise HTTPException(status_code=404, detail="Source location not found on this product")
    if src["quantity"] < body.quantity:
        raise HTTPException(status_code=400, detail=f"Only {src['quantity']} available in {body.from_location}")
    dst_known = await db.locations.find_one({"stock_id": doc["stock_id"], "name": body.to_location}, {"_id": 0})
    dst = next((l for l in locs if l["location"] == body.to_location), None)
    if not dst and not dst_known:
        raise HTTPException(status_code=404, detail="Destination location not found in this stock")
    src["quantity"] -= body.quantity
    if dst:
        dst["quantity"] += body.quantity
    else:
        locs.append({"location": body.to_location, "quantity": body.quantity})
    await db.products.update_one(
        {"id": product_id},
        {"$set": {"locations": locs, "updated_at": now_iso()}},
    )
    doc["locations"] = locs
    return _hydrate_product(doc)


@api_router.get("/suppliers", response_model=List[str])
async def list_suppliers(stock_id: str):
    await _ensure_stock(stock_id)
    names = await db.products.distinct("supplier", {"stock_id": stock_id})
    return sorted({n.strip() for n in names if isinstance(n, str) and n.strip()}, key=str.lower)


@api_router.get("/products/barcode/{code}", response_model=Product)
async def get_by_barcode(code: str, stock_id: str):
    await _ensure_stock(stock_id)
    code = code.strip()
    # iOS reports UPC-A as EAN-13 with a leading 0 (and vice versa): try both forms.
    variants = list({code, code.lstrip("0") or code, "0" + code})
    doc = await db.products.find_one({"barcode": {"$in": variants}, "stock_id": stock_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Product not found")
    return _hydrate_product(doc)


# ---------- Receipts (carico magazzino) ----------
class ReceiptItemIn(BaseModel):
    product_id: str
    quantity: int


class ReceiptCreate(BaseModel):
    stock_id: str
    location: str
    note: Optional[str] = None
    items: List[ReceiptItemIn]


class ReceiptItem(BaseModel):
    product_id: str
    name: str
    quantity: int


class Receipt(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    stock_id: str
    location: str
    note: Optional[str] = None
    items: List[ReceiptItem]
    total_pieces: int
    created_at: str = Field(default_factory=now_iso)


@api_router.post("/receipts", response_model=Receipt)
async def create_receipt(payload: ReceiptCreate):
    await _ensure_stock(payload.stock_id)
    loc = await db.locations.find_one({"stock_id": payload.stock_id, "name": payload.location}, {"_id": 0})
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found in this stock")
    items = [i for i in payload.items if i.quantity > 0]
    if not items:
        raise HTTPException(status_code=400, detail="No items to load")
    # Validate all products first so a bad line doesn't leave a half-applied load.
    names: dict = {}
    for i in items:
        doc = await db.products.find_one({"id": i.product_id, "stock_id": payload.stock_id}, {"_id": 0, "name": 1})
        if not doc:
            raise HTTPException(status_code=404, detail=f"Product {i.product_id} not found in this stock")
        names[i.product_id] = doc["name"]
    for i in items:
        await _adjust_location_quantity(i.product_id, payload.location, i.quantity)
    receipt = Receipt(
        stock_id=payload.stock_id,
        location=payload.location,
        note=(payload.note or "").strip() or None,
        items=[ReceiptItem(product_id=i.product_id, name=names[i.product_id], quantity=i.quantity) for i in items],
        total_pieces=sum(i.quantity for i in items),
    )
    await db.receipts.insert_one(receipt.dict())
    return receipt


@api_router.get("/receipts", response_model=List[Receipt])
async def list_receipts(stock_id: str, limit: int = 20):
    await _ensure_stock(stock_id)
    docs = await db.receipts.find({"stock_id": stock_id}, {"_id": 0}).sort("created_at", -1).to_list(min(limit, 100))
    return [Receipt(**d) for d in docs]


# ---------- Reorder ----------
@api_router.get("/reorder", response_model=List[Product])
async def reorder_list(stock_id: str):
    await _ensure_stock(stock_id)
    docs = await db.products.find({"stock_id": stock_id}, {"_id": 0}).to_list(5000)
    items: List[Product] = []
    for d in docs:
        p = _hydrate_product(d)
        if p.manual_reorder or p.total_quantity <= p.min_threshold:
            items.append(p)
    items.sort(key=lambda p: (p.total_quantity - p.min_threshold))
    return items


# ---------- Locations ----------
@api_router.get("/locations", response_model=List[Location])
async def list_locations(stock_id: str):
    await _ensure_stock(stock_id)
    docs = await db.locations.find({"stock_id": stock_id}, {"_id": 0}).sort("name", 1).to_list(500)
    return [Location(**d) for d in docs]


@api_router.post("/locations", response_model=Location)
async def create_location(payload: LocationCreate):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    await _ensure_stock(payload.stock_id)
    existing = await db.locations.find_one({"name": name, "stock_id": payload.stock_id}, {"_id": 0})
    if existing:
        return Location(**existing)
    loc = Location(name=name, stock_id=payload.stock_id)
    await db.locations.insert_one(loc.dict())
    return loc


@api_router.delete("/locations/{location_id}")
async def delete_location(location_id: str):
    doc = await db.locations.find_one({"id": location_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Location not found")
    in_use = await db.products.count_documents({
        "stock_id": doc["stock_id"],
        "locations.location": doc["name"],
    })
    if in_use:
        raise HTTPException(status_code=400, detail=f"Location in use by {in_use} products")
    await db.locations.delete_one({"id": location_id})
    return {"ok": True}


# ---------- Stats ----------
@api_router.get("/stats")
async def stats(stock_id: str):
    await _ensure_stock(stock_id)
    docs = await db.products.find({"stock_id": stock_id}, {"_id": 0}).to_list(5000)
    total = len(docs)
    low = 0
    out = 0
    total_units = 0
    for d in docs:
        p = _hydrate_product(d)
        total_units += p.total_quantity
        if p.manual_reorder or p.total_quantity <= p.min_threshold:
            low += 1
        if p.total_quantity == 0:
            out += 1
    return {
        "total_products": total,
        "low_stock": low,
        "out_of_stock": out,
        "total_units": total_units,
    }


# ---------- Seed & Migration ----------
SAMPLE_LOCATIONS = ["Magazzino", "Scaffale A", "Scaffale B", "Retro Negozio"]
SAMPLE_PRODUCTS = [
    {"name": "Latte Intero 1L", "barcode": "8001234500011", "locations": [{"location": "Scaffale A", "quantity": 18}, {"location": "Magazzino", "quantity": 6}], "min_threshold": 10, "unit": "bott"},
    {"name": "Pane in Cassetta", "barcode": "8001234500028", "locations": [{"location": "Scaffale A", "quantity": 6}], "min_threshold": 8, "unit": "pz"},
    {"name": "Pasta Spaghetti 500g", "barcode": "8001234500035", "locations": [{"location": "Scaffale B", "quantity": 30}, {"location": "Magazzino", "quantity": 12}], "min_threshold": 20, "unit": "pacchi"},
    {"name": "Olio Extra Vergine 1L", "barcode": "8001234500042", "locations": [{"location": "Scaffale B", "quantity": 3}], "min_threshold": 6, "unit": "bott"},
    {"name": "Caffè Macinato 250g", "barcode": "8001234500059", "locations": [{"location": "Scaffale A", "quantity": 0}], "min_threshold": 5, "unit": "pz"},
    {"name": "Zucchero 1kg", "barcode": "8001234500066", "locations": [{"location": "Magazzino", "quantity": 15}], "min_threshold": 10, "unit": "sacc"},
    {"name": "Riso Carnaroli 1kg", "barcode": "8001234500073", "locations": [{"location": "Scaffale B", "quantity": 2}], "min_threshold": 8, "unit": "pacchi"},
    {"name": "Acqua Naturale 1.5L", "barcode": "8001234500080", "locations": [{"location": "Retro Negozio", "quantity": 96}, {"location": "Scaffale A", "quantity": 24}], "min_threshold": 48, "unit": "bott"},
    {"name": "Biscotti Frollini 400g", "barcode": "8001234500097", "locations": [{"location": "Scaffale A", "quantity": 18}], "min_threshold": 10, "unit": "pz"},
    {"name": "Tonno in Scatola", "barcode": "8001234500103", "locations": [{"location": "Scaffale B", "quantity": 4}], "min_threshold": 12, "unit": "sc"},
]


async def _migrate_product_locations():
    cursor = db.products.find({"$or": [
        {"locations": {"$exists": False}},
        {"locations": {"$size": 0}},
    ]}, {"_id": 0})
    async for d in cursor:
        legacy_loc = d.get("location") or "Magazzino"
        legacy_qty = int(d.get("quantity") or 0)
        await db.products.update_one(
            {"id": d["id"]},
            {"$set": {"locations": [{"location": legacy_loc, "quantity": legacy_qty}]},
             "$unset": {"location": "", "quantity": ""}},
        )


async def seed_data():
    stock_count = await db.stocks.count_documents({})
    default_stock_id: Optional[str] = None
    if stock_count == 0:
        s = Stock(name="Negozio Principale")
        await db.stocks.insert_one(s.dict())
        default_stock_id = s.id
    else:
        first = await db.stocks.find_one({}, {"_id": 0}, sort=[("created_at", 1)])
        default_stock_id = first["id"] if first else None

    if default_stock_id:
        await db.locations.update_many({"stock_id": {"$exists": False}}, {"$set": {"stock_id": default_stock_id}})
        await db.products.update_many({"stock_id": {"$exists": False}}, {"$set": {"stock_id": default_stock_id}})
        await _migrate_product_locations()

    if default_stock_id:
        loc_count = await db.locations.count_documents({"stock_id": default_stock_id})
        if loc_count == 0:
            for name in SAMPLE_LOCATIONS:
                await db.locations.insert_one(Location(name=name, stock_id=default_stock_id).dict())
        prod_count = await db.products.count_documents({"stock_id": default_stock_id})
        if prod_count == 0:
            for p in SAMPLE_PRODUCTS:
                locs = [ProductLocation(**l).dict() for l in p["locations"]]
                total = sum(l["quantity"] for l in locs)
                doc = Product(
                    stock_id=default_stock_id,
                    name=p["name"],
                    barcode=p.get("barcode"),
                    locations=[ProductLocation(**l) for l in locs],
                    min_threshold=p["min_threshold"],
                    unit=p["unit"],
                    total_quantity=total,
                ).dict()
                await db.products.insert_one(doc)


# ---------- Mount ----------
@api_router.get("/")
async def root():
    return {"message": "StockCount Pro API"}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def on_startup():
    await seed_data()


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
