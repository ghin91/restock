from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
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


class Product(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    stock_id: str
    name: str
    barcode: Optional[str] = None
    location: str = "Magazzino"
    quantity: int = 0
    min_threshold: int = 5
    unit: str = "pz"
    image_url: Optional[str] = None
    manual_reorder: bool = False
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


class ProductCreate(BaseModel):
    stock_id: str
    name: str
    barcode: Optional[str] = None
    location: str = "Magazzino"
    quantity: int = 0
    min_threshold: int = 5
    unit: str = "pz"
    image_url: Optional[str] = None
    manual_reorder: bool = False


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    barcode: Optional[str] = None
    location: Optional[str] = None
    quantity: Optional[int] = None
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
    await db.stocks.delete_one({"id": stock_id})
    return {"ok": True}


# ---------- Products ----------
@api_router.get("/products", response_model=List[Product])
async def list_products(stock_id: str, location: Optional[str] = None, q: Optional[str] = None):
    await _ensure_stock(stock_id)
    query: dict = {"stock_id": stock_id}
    if location:
        query["location"] = location
    if q:
        query["name"] = {"$regex": q, "$options": "i"}
    docs = await db.products.find(query, {"_id": 0}).sort("name", 1).to_list(2000)
    return [Product(**d) for d in docs]


@api_router.post("/products", response_model=Product)
async def create_product(payload: ProductCreate):
    await _ensure_stock(payload.stock_id)
    product = Product(**payload.dict())
    await db.products.insert_one(product.dict())
    return product


@api_router.get("/products/{product_id}", response_model=Product)
async def get_product(product_id: str):
    doc = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Product not found")
    return Product(**doc)


@api_router.patch("/products/{product_id}", response_model=Product)
async def update_product(product_id: str, payload: ProductUpdate):
    update = {k: v for k, v in payload.dict().items() if v is not None}
    update["updated_at"] = now_iso()
    result = await db.products.update_one({"id": product_id}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    doc = await db.products.find_one({"id": product_id}, {"_id": 0})
    return Product(**doc)


@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str):
    result = await db.products.delete_one({"id": product_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"ok": True}


@api_router.post("/products/{product_id}/quantity", response_model=Product)
async def change_quantity(product_id: str, body: QuantityDelta):
    doc = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Product not found")
    new_qty = max(0, int(doc.get("quantity", 0)) + body.delta)
    await db.products.update_one(
        {"id": product_id},
        {"$set": {"quantity": new_qty, "updated_at": now_iso()}},
    )
    doc["quantity"] = new_qty
    doc["updated_at"] = now_iso()
    return Product(**doc)


@api_router.get("/products/barcode/{code}", response_model=Product)
async def get_by_barcode(code: str, stock_id: str):
    await _ensure_stock(stock_id)
    doc = await db.products.find_one({"barcode": code, "stock_id": stock_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Product not found")
    return Product(**doc)


# ---------- Reorder ----------
@api_router.get("/reorder", response_model=List[Product])
async def reorder_list(stock_id: str):
    await _ensure_stock(stock_id)
    docs = await db.products.find({"stock_id": stock_id}, {"_id": 0}).to_list(5000)
    items = []
    for d in docs:
        if d.get("manual_reorder") or int(d.get("quantity", 0)) <= int(d.get("min_threshold", 0)):
            items.append(Product(**d))
    items.sort(key=lambda p: (p.quantity - p.min_threshold))
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
    in_use = await db.products.count_documents({"location": doc["name"], "stock_id": doc["stock_id"]})
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
    low = sum(1 for d in docs if d.get("manual_reorder") or int(d.get("quantity", 0)) <= int(d.get("min_threshold", 0)))
    out = sum(1 for d in docs if int(d.get("quantity", 0)) == 0)
    total_units = sum(int(d.get("quantity", 0)) for d in docs)
    return {
        "total_products": total,
        "low_stock": low,
        "out_of_stock": out,
        "total_units": total_units,
    }


# ---------- Seed & Migration ----------
SAMPLE_LOCATIONS = ["Magazzino", "Scaffale A", "Scaffale B", "Retro Negozio"]
SAMPLE_PRODUCTS = [
    {"name": "Latte Intero 1L", "barcode": "8001234500011", "location": "Scaffale A", "quantity": 24, "min_threshold": 10, "unit": "bott"},
    {"name": "Pane in Cassetta", "barcode": "8001234500028", "location": "Scaffale A", "quantity": 6, "min_threshold": 8, "unit": "pz"},
    {"name": "Pasta Spaghetti 500g", "barcode": "8001234500035", "location": "Scaffale B", "quantity": 42, "min_threshold": 20, "unit": "pacchi"},
    {"name": "Olio Extra Vergine 1L", "barcode": "8001234500042", "location": "Scaffale B", "quantity": 3, "min_threshold": 6, "unit": "bott"},
    {"name": "Caffè Macinato 250g", "barcode": "8001234500059", "location": "Scaffale A", "quantity": 0, "min_threshold": 5, "unit": "pz"},
    {"name": "Zucchero 1kg", "barcode": "8001234500066", "location": "Magazzino", "quantity": 15, "min_threshold": 10, "unit": "sacc"},
    {"name": "Riso Carnaroli 1kg", "barcode": "8001234500073", "location": "Scaffale B", "quantity": 2, "min_threshold": 8, "unit": "pacchi"},
    {"name": "Acqua Naturale 1.5L", "barcode": "8001234500080", "location": "Retro Negozio", "quantity": 120, "min_threshold": 48, "unit": "bott"},
    {"name": "Biscotti Frollini 400g", "barcode": "8001234500097", "location": "Scaffale A", "quantity": 18, "min_threshold": 10, "unit": "pz"},
    {"name": "Tonno in Scatola", "barcode": "8001234500103", "location": "Scaffale B", "quantity": 4, "min_threshold": 12, "unit": "sc"},
]


async def seed_data():
    # Ensure at least one stock
    stock_count = await db.stocks.count_documents({})
    default_stock_id: Optional[str] = None
    if stock_count == 0:
        s = Stock(name="Negozio Principale")
        await db.stocks.insert_one(s.dict())
        default_stock_id = s.id
    else:
        first = await db.stocks.find_one({}, {"_id": 0}, sort=[("created_at", 1)])
        default_stock_id = first["id"] if first else None

    # Migrate legacy docs lacking stock_id to the default stock
    if default_stock_id:
        await db.locations.update_many({"stock_id": {"$exists": False}}, {"$set": {"stock_id": default_stock_id}})
        await db.products.update_many({"stock_id": {"$exists": False}}, {"$set": {"stock_id": default_stock_id}})

    # Seed sample data only if the default stock has none
    if default_stock_id:
        loc_count = await db.locations.count_documents({"stock_id": default_stock_id})
        if loc_count == 0:
            for name in SAMPLE_LOCATIONS:
                await db.locations.insert_one(Location(name=name, stock_id=default_stock_id).dict())
        prod_count = await db.products.count_documents({"stock_id": default_stock_id})
        if prod_count == 0:
            for p in SAMPLE_PRODUCTS:
                await db.products.insert_one(Product(stock_id=default_stock_id, **p).dict())


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
