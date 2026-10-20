"""StockCount Pro API tests – multi-stock schema (Jan 2026)."""
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
    # pick the one named Negozio Principale if present else first
    for s in stocks:
        if s["name"] == "Negozio Principale":
            return s
    return stocks[0]


# ---------- Stocks CRUD ----------
class TestStocks:
    def test_list_has_default(self, default_stock):
        assert default_stock["id"]
        assert "Negozio" in default_stock["name"] or default_stock["name"]

    def test_create_rename_delete_stock(self, default_stock):
        name = f"TEST_Stock_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/stocks", json={"name": name})
        assert r.status_code == 200, r.text
        sid = r.json()["id"]
        assert r.json()["name"] == name

        # rename
        new_name = name + "_r"
        r2 = requests.patch(f"{API}/stocks/{sid}", json={"name": new_name})
        assert r2.status_code == 200
        assert r2.json()["name"] == new_name

        # delete
        r3 = requests.delete(f"{API}/stocks/{sid}")
        assert r3.status_code == 200

        # verify gone
        r4 = requests.get(f"{API}/stocks")
        assert sid not in [s["id"] for s in r4.json()]

    def test_cannot_delete_only_stock(self, default_stock):
        # count current stocks
        r = requests.get(f"{API}/stocks")
        extras = [s for s in r.json() if s["id"] != default_stock["id"]]
        # delete all extras
        for s in extras:
            requests.delete(f"{API}/stocks/{s['id']}")
        # now try deleting the last one
        r2 = requests.delete(f"{API}/stocks/{default_stock['id']}")
        assert r2.status_code == 400


# ---------- Isolation ----------
class TestIsolation:
    @pytest.fixture
    def two_stocks(self, default_stock):
        a = default_stock
        rb = requests.post(f"{API}/stocks", json={"name": f"TEST_B_{uuid.uuid4().hex[:4]}"})
        assert rb.status_code == 200
        b = rb.json()
        yield a, b
        requests.delete(f"{API}/stocks/{b['id']}")

    def test_products_scoped(self, two_stocks):
        a, b = two_stocks
        # create product in B with same barcode as a sample in A
        payload = {
            "stock_id": b["id"],
            "name": "TEST_IsoProd",
            "barcode": "8001234500011",  # same as Latte Intero in A
            "quantity": 7,
            "min_threshold": 2,
        }
        r = requests.post(f"{API}/products", json=payload)
        assert r.status_code == 200, r.text
        pb_id = r.json()["id"]

        # list B should contain the product
        rb = requests.get(f"{API}/products", params={"stock_id": b["id"]})
        assert rb.status_code == 200
        assert any(p["id"] == pb_id for p in rb.json())

        # list A should NOT contain B's product
        ra = requests.get(f"{API}/products", params={"stock_id": a["id"]})
        assert all(p["id"] != pb_id for p in ra.json())

        # barcode lookup scoped
        rba = requests.get(f"{API}/products/barcode/8001234500011", params={"stock_id": a["id"]})
        rbb = requests.get(f"{API}/products/barcode/8001234500011", params={"stock_id": b["id"]})
        assert rba.status_code == 200 and rbb.status_code == 200
        assert rba.json()["id"] != rbb.json()["id"]
        assert rba.json()["stock_id"] == a["id"]
        assert rbb.json()["stock_id"] == b["id"]

    def test_stats_reorder_locations_scoped(self, two_stocks):
        a, b = two_stocks
        # fresh B should be empty
        rs = requests.get(f"{API}/stats", params={"stock_id": b["id"]})
        assert rs.status_code == 200
        assert rs.json()["total_products"] == 0

        rr = requests.get(f"{API}/reorder", params={"stock_id": b["id"]})
        assert rr.status_code == 200
        assert rr.json() == []

        rl = requests.get(f"{API}/locations", params={"stock_id": b["id"]})
        assert rl.status_code == 200
        assert rl.json() == []

        # A should be populated (seeded)
        rsa = requests.get(f"{API}/stats", params={"stock_id": a["id"]})
        assert rsa.json()["total_products"] >= 10


# ---------- Validation ----------
class TestValidation:
    def test_invalid_stock_id_product(self):
        r = requests.post(f"{API}/products", json={"stock_id": "nope-" + uuid.uuid4().hex, "name": "x"})
        assert r.status_code == 404

    def test_invalid_stock_id_location(self):
        r = requests.post(f"{API}/locations", json={"stock_id": "nope-" + uuid.uuid4().hex, "name": "x"})
        assert r.status_code == 404

    def test_list_products_missing_stock_id(self):
        r = requests.get(f"{API}/products")
        assert r.status_code in (400, 422)


# ---------- Migration ----------
class TestMigration:
    def test_seeded_products_have_stock_id(self, default_stock):
        r = requests.get(f"{API}/products", params={"stock_id": default_stock["id"]})
        assert r.status_code == 200
        products = r.json()
        assert len(products) >= 10
        for p in products:
            assert p.get("stock_id") == default_stock["id"]
