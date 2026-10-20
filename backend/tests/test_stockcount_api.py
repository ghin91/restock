"""StockCount Pro API tests – multi-stock + multi-location schema (Jan 2026)."""
import os
import uuid
import pytest
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
API = f"{BASE.rstrip('/')}/api"


@pytest.fixture(scope="session")
def default_stock():
    r = requests.get(f"{API}/stocks")
    assert r.status_code == 200, r.text
    stocks = r.json()
    assert len(stocks) >= 1, "default stock missing"
    for s in stocks:
        if s["name"] == "Negozio Principale":
            return s
    return stocks[0]


@pytest.fixture()
def test_stock():
    r = requests.post(f"{API}/stocks", json={"name": f"TEST_LOC_{uuid.uuid4().hex[:6]}"})
    assert r.status_code == 200, r.text
    s = r.json()
    yield s
    requests.delete(f"{API}/stocks/{s['id']}")


# ---------- Stocks CRUD ----------
class TestStocks:
    def test_list_has_default(self, default_stock):
        assert default_stock["id"]

    def test_create_rename_delete_stock(self):
        name = f"TEST_Stock_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/stocks", json={"name": name})
        assert r.status_code == 200
        sid = r.json()["id"]
        r2 = requests.patch(f"{API}/stocks/{sid}", json={"name": name + "_r"})
        assert r2.status_code == 200
        assert r2.json()["name"] == name + "_r"
        r3 = requests.delete(f"{API}/stocks/{sid}")
        assert r3.status_code == 200


# ---------- Product locations schema ----------
class TestProductLocationsSchema:
    def test_create_product_with_multi_locations(self, test_stock):
        payload = {
            "stock_id": test_stock["id"],
            "name": "TEST_Multi",
            "barcode": f"77{uuid.uuid4().hex[:10]}",
            "locations": [
                {"location": "LocA", "quantity": 3},
                {"location": "LocB", "quantity": 7},
            ],
            "min_threshold": 5,
            "unit": "pz",
        }
        r = requests.post(f"{API}/products", json=payload)
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["total_quantity"] == 10
        assert len(p["locations"]) == 2
        assert "location" not in p  # legacy field absent
        assert "quantity" not in p  # legacy field absent

        # GET verifies persistence
        g = requests.get(f"{API}/products/{p['id']}")
        assert g.status_code == 200
        assert g.json()["total_quantity"] == 10

    def test_create_product_default_location(self, test_stock):
        r = requests.post(f"{API}/products", json={
            "stock_id": test_stock["id"], "name": "TEST_NoLoc",
        })
        assert r.status_code == 200
        p = r.json()
        assert len(p["locations"]) == 1
        assert p["locations"][0]["location"] == "Magazzino"
        assert p["total_quantity"] == 0

    def test_patch_replaces_locations_and_clamps(self, test_stock):
        r = requests.post(f"{API}/products", json={
            "stock_id": test_stock["id"], "name": "TEST_Patch",
            "locations": [{"location": "L1", "quantity": 2}, {"location": "L2", "quantity": 4}],
        })
        pid = r.json()["id"]
        r2 = requests.patch(f"{API}/products/{pid}", json={
            "locations": [{"location": "L3", "quantity": -5}, {"location": "L4", "quantity": 8}]
        })
        assert r2.status_code == 200
        p = r2.json()
        locs = {l["location"]: l["quantity"] for l in p["locations"]}
        assert locs == {"L3": 0, "L4": 8}  # clamped & replaced (L1/L2 gone)
        assert p["total_quantity"] == 8


# ---------- Per-location quantity adjust ----------
class TestLocationQuantity:
    def test_delta_existing_location(self, test_stock):
        r = requests.post(f"{API}/products", json={
            "stock_id": test_stock["id"], "name": "TEST_Delta",
            "locations": [{"location": "LocA", "quantity": 5}],
        })
        pid = r.json()["id"]
        r2 = requests.post(f"{API}/products/{pid}/locations/LocA/quantity", json={"delta": 3})
        assert r2.status_code == 200
        p = r2.json()
        assert p["locations"][0]["quantity"] == 8
        assert p["total_quantity"] == 8

    def test_delta_clamps_at_zero(self, test_stock):
        r = requests.post(f"{API}/products", json={
            "stock_id": test_stock["id"], "name": "TEST_Clamp",
            "locations": [{"location": "LocA", "quantity": 2}],
        })
        pid = r.json()["id"]
        r2 = requests.post(f"{API}/products/{pid}/locations/LocA/quantity", json={"delta": -10})
        assert r2.status_code == 200
        assert r2.json()["locations"][0]["quantity"] == 0

    def test_delta_adds_missing_location_when_positive(self, test_stock):
        r = requests.post(f"{API}/products", json={
            "stock_id": test_stock["id"], "name": "TEST_Add",
            "locations": [{"location": "LocA", "quantity": 1}],
        })
        pid = r.json()["id"]
        r2 = requests.post(f"{API}/products/{pid}/locations/LocB/quantity", json={"delta": 4})
        assert r2.status_code == 200
        p = r2.json()
        locs = {l["location"]: l["quantity"] for l in p["locations"]}
        assert locs == {"LocA": 1, "LocB": 4}
        assert p["total_quantity"] == 5

    def test_delta_missing_location_negative_404(self, test_stock):
        r = requests.post(f"{API}/products", json={
            "stock_id": test_stock["id"], "name": "TEST_MissNeg",
            "locations": [{"location": "LocA", "quantity": 1}],
        })
        pid = r.json()["id"]
        r2 = requests.post(f"{API}/products/{pid}/locations/LocB/quantity", json={"delta": -1})
        assert r2.status_code == 404


# ---------- Reorder / stats / filter / barcode ----------
class TestReorderStatsFilter:
    def test_reorder_uses_total_quantity(self, test_stock):
        requests.post(f"{API}/products", json={
            "stock_id": test_stock["id"], "name": "TEST_Low",
            "locations": [{"location": "A", "quantity": 1}, {"location": "B", "quantity": 1}],
            "min_threshold": 5,
        })
        requests.post(f"{API}/products", json={
            "stock_id": test_stock["id"], "name": "TEST_OK",
            "locations": [{"location": "A", "quantity": 5}, {"location": "B", "quantity": 5}],
            "min_threshold": 5,
        })  # total 10 > min 5 => NOT in reorder
        requests.post(f"{API}/products", json={
            "stock_id": test_stock["id"], "name": "TEST_Manual",
            "locations": [{"location": "A", "quantity": 100}],
            "min_threshold": 5,
            "manual_reorder": True,
        })
        r = requests.get(f"{API}/reorder", params={"stock_id": test_stock["id"]})
        assert r.status_code == 200
        names = {p["name"] for p in r.json()}
        assert "TEST_Low" in names
        assert "TEST_Manual" in names
        assert "TEST_OK" not in names

    def test_stats_uses_total_quantity(self, test_stock):
        requests.post(f"{API}/products", json={
            "stock_id": test_stock["id"], "name": "TEST_S1",
            "locations": [{"location": "A", "quantity": 3}, {"location": "B", "quantity": 4}],
            "min_threshold": 2,
        })
        r = requests.get(f"{API}/stats", params={"stock_id": test_stock["id"]})
        assert r.status_code == 200
        s = r.json()
        assert s["total_units"] == 7
        assert s["total_products"] == 1

    def test_filter_products_by_location(self, test_stock):
        requests.post(f"{API}/products", json={
            "stock_id": test_stock["id"], "name": "TEST_F1",
            "locations": [{"location": "XLoc", "quantity": 1}],
        })
        requests.post(f"{API}/products", json={
            "stock_id": test_stock["id"], "name": "TEST_F2",
            "locations": [{"location": "YLoc", "quantity": 1}],
        })
        r = requests.get(f"{API}/products", params={"stock_id": test_stock["id"], "location": "XLoc"})
        assert r.status_code == 200
        names = {p["name"] for p in r.json()}
        assert "TEST_F1" in names and "TEST_F2" not in names

    def test_barcode_leading_zero_variants(self, test_stock):
        # Store a UPC-A (12 digits). Scanners on iOS sometimes return EAN-13 ("0" + UPC-A).
        upc = "123456789012"
        ean = "0" + upc  # EAN-13 equivalent
        requests.post(f"{API}/products", json={
            "stock_id": test_stock["id"], "name": "TEST_BC",
            "barcode": upc,
            "locations": [{"location": "A", "quantity": 1}],
        })
        # Look up by both forms; both should resolve to the same product
        r1 = requests.get(f"{API}/products/barcode/{upc}", params={"stock_id": test_stock["id"]})
        r2 = requests.get(f"{API}/products/barcode/{ean}", params={"stock_id": test_stock["id"]})
        assert r1.status_code == 200
        assert r2.status_code == 200
        assert r1.json()["id"] == r2.json()["id"]

        # And the reverse: store as EAN-13 with leading zero, look up as UPC-A
        test_stock2_r = requests.post(f"{API}/stocks", json={"name": f"TEST_BC2_{uuid.uuid4().hex[:4]}"})
        s2 = test_stock2_r.json()
        try:
            requests.post(f"{API}/products", json={
                "stock_id": s2["id"], "name": "TEST_BC2",
                "barcode": ean,
                "locations": [{"location": "A", "quantity": 1}],
            })
            r3 = requests.get(f"{API}/products/barcode/{upc}", params={"stock_id": s2["id"]})
            assert r3.status_code == 200, f"UPC lookup on EAN-stored failed: {r3.status_code}"
        finally:
            requests.delete(f"{API}/stocks/{s2['id']}")


# ---------- Locations endpoints ----------
class TestLocations:
    def test_delete_location_blocked_when_in_use(self, test_stock):
        # create a managed location
        r = requests.post(f"{API}/locations", json={"stock_id": test_stock["id"], "name": "InUse"})
        assert r.status_code == 200
        lid = r.json()["id"]
        # product referencing it
        requests.post(f"{API}/products", json={
            "stock_id": test_stock["id"], "name": "TEST_UseLoc",
            "locations": [{"location": "InUse", "quantity": 1}],
        })
        r2 = requests.delete(f"{API}/locations/{lid}")
        assert r2.status_code == 400

    def test_delete_location_ok_when_free(self, test_stock):
        r = requests.post(f"{API}/locations", json={"stock_id": test_stock["id"], "name": "Free"})
        lid = r.json()["id"]
        r2 = requests.delete(f"{API}/locations/{lid}")
        assert r2.status_code == 200


# ---------- Validation ----------
class TestValidation:
    def test_invalid_stock_id_product(self):
        r = requests.post(f"{API}/products", json={"stock_id": "nope-" + uuid.uuid4().hex, "name": "x"})
        assert r.status_code == 404

    def test_list_products_missing_stock_id(self):
        r = requests.get(f"{API}/products")
        assert r.status_code in (400, 422)


# ---------- Isolation ----------
class TestIsolation:
    def test_products_scoped(self, default_stock, test_stock):
        shared_bc = f"TESTBC{uuid.uuid4().hex[:8]}"
        # create in default
        ra = requests.post(f"{API}/products", json={
            "stock_id": default_stock["id"], "name": "TEST_IsoA",
            "barcode": shared_bc,
            "locations": [{"location": "A", "quantity": 1}],
        })
        pa_id = ra.json()["id"]
        try:
            # create same barcode in test stock
            rb = requests.post(f"{API}/products", json={
                "stock_id": test_stock["id"], "name": "TEST_IsoB",
                "barcode": shared_bc,
                "locations": [{"location": "A", "quantity": 1}],
            })
            assert rb.status_code == 200
            # barcode lookups must be scoped
            ga = requests.get(f"{API}/products/barcode/{shared_bc}", params={"stock_id": default_stock["id"]})
            gb = requests.get(f"{API}/products/barcode/{shared_bc}", params={"stock_id": test_stock["id"]})
            assert ga.status_code == 200 and gb.status_code == 200
            assert ga.json()["id"] != gb.json()["id"]
            assert ga.json()["stock_id"] == default_stock["id"]
            assert gb.json()["stock_id"] == test_stock["id"]
        finally:
            requests.delete(f"{API}/products/{pa_id}")


# ---------- Migration ----------
class TestMigration:
    def test_seeded_products_have_locations(self, default_stock):
        r = requests.get(f"{API}/products", params={"stock_id": default_stock["id"]})
        assert r.status_code == 200
        products = r.json()
        # DB may contain only real user data; verify every existing product
        # has the new multi-location schema and no legacy fields.
        for p in products:
            assert isinstance(p.get("locations"), list)
            assert len(p["locations"]) >= 1
            assert "total_quantity" in p
            assert "quantity" not in p
            assert "location" not in p
