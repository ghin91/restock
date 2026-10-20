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


# ---------- Supplier field ----------
class TestSupplier:
    def test_create_with_supplier_persisted(self, test_stock):
        r = requests.post(f"{API}/products", json={
            "stock_id": test_stock["id"], "name": "TEST_Sup1",
            "supplier": "Acme Spa",
            "locations": [{"location": "A", "quantity": 1}],
        })
        assert r.status_code == 200, r.text
        pid = r.json()["id"]
        assert r.json()["supplier"] == "Acme Spa"
        g = requests.get(f"{API}/products/{pid}")
        assert g.status_code == 200
        assert g.json()["supplier"] == "Acme Spa"

    def test_patch_supplier(self, test_stock):
        r = requests.post(f"{API}/products", json={
            "stock_id": test_stock["id"], "name": "TEST_Sup2",
        })
        pid = r.json()["id"]
        r2 = requests.patch(f"{API}/products/{pid}", json={"supplier": "Beta Srl"})
        assert r2.status_code == 200
        assert r2.json()["supplier"] == "Beta Srl"

    def test_empty_supplier_becomes_null(self, test_stock):
        r = requests.post(f"{API}/products", json={
            "stock_id": test_stock["id"], "name": "TEST_SupEmpty",
            "supplier": "   ",
        })
        assert r.status_code == 200
        assert r.json()["supplier"] is None


class TestSuppliersEndpoint:
    def test_distinct_sorted_nonempty_scoped(self, test_stock):
        # another stock to verify scoping
        r_other = requests.post(f"{API}/stocks", json={"name": f"TEST_SupScope_{uuid.uuid4().hex[:4]}"})
        other = r_other.json()
        try:
            for name, sup in [
                ("P1", "zeta"), ("P2", "Alpha"), ("P3", "alpha"),
                ("P4", "   "), ("P5", None), ("P6", "Beta"),
            ]:
                body = {"stock_id": test_stock["id"], "name": f"TEST_{name}"}
                if sup is not None:
                    body["supplier"] = sup
                requests.post(f"{API}/products", json=body)
            requests.post(f"{API}/products", json={
                "stock_id": other["id"], "name": "TEST_OtherSup", "supplier": "OtherOnly",
            })

            r = requests.get(f"{API}/suppliers", params={"stock_id": test_stock["id"]})
            assert r.status_code == 200
            sups = r.json()
            # distinct non-empty, sorted case-insensitively, scoped to this stock
            assert "OtherOnly" not in sups
            assert "" not in sups and "   " not in sups
            lowered = [s.lower() for s in sups]
            assert lowered == sorted(lowered)
            assert "alpha" in lowered and "beta" in lowered and "zeta" in lowered
            # No duplicates
            assert len(sups) == len(set(sups))
        finally:
            requests.delete(f"{API}/stocks/{other['id']}")

    def test_suppliers_requires_stock_id(self):
        r = requests.get(f"{API}/suppliers")
        assert r.status_code in (400, 422)


# ---------- Transfer ----------
class TestTransfer:
    def _mk(self, stock_id, locs, name="TEST_TR"):
        r = requests.post(f"{API}/products", json={
            "stock_id": stock_id, "name": f"{name}_{uuid.uuid4().hex[:4]}",
            "locations": locs,
        })
        assert r.status_code == 200, r.text
        return r.json()

    def test_transfer_moves_total_unchanged(self, test_stock):
        requests.post(f"{API}/locations", json={"stock_id": test_stock["id"], "name": "A"})
        requests.post(f"{API}/locations", json={"stock_id": test_stock["id"], "name": "B"})
        p = self._mk(test_stock["id"], [{"location": "A", "quantity": 10}, {"location": "B", "quantity": 2}])
        r = requests.post(f"{API}/products/{p['id']}/transfer",
                          json={"from_location": "A", "to_location": "B", "quantity": 3})
        assert r.status_code == 200, r.text
        d = r.json()
        locs = {l["location"]: l["quantity"] for l in d["locations"]}
        assert locs == {"A": 7, "B": 5}
        assert d["total_quantity"] == 12

    def test_transfer_adds_destination_row(self, test_stock):
        requests.post(f"{API}/locations", json={"stock_id": test_stock["id"], "name": "A"})
        requests.post(f"{API}/locations", json={"stock_id": test_stock["id"], "name": "C"})
        p = self._mk(test_stock["id"], [{"location": "A", "quantity": 5}])
        r = requests.post(f"{API}/products/{p['id']}/transfer",
                          json={"from_location": "A", "to_location": "C", "quantity": 2})
        assert r.status_code == 200, r.text
        d = r.json()
        locs = {l["location"]: l["quantity"] for l in d["locations"]}
        assert locs == {"A": 3, "C": 2}
        assert d["total_quantity"] == 5

    def test_transfer_qty_zero_or_negative_400(self, test_stock):
        requests.post(f"{API}/locations", json={"stock_id": test_stock["id"], "name": "A"})
        requests.post(f"{API}/locations", json={"stock_id": test_stock["id"], "name": "B"})
        p = self._mk(test_stock["id"], [{"location": "A", "quantity": 5}, {"location": "B", "quantity": 1}])
        for q in (0, -2):
            r = requests.post(f"{API}/products/{p['id']}/transfer",
                              json={"from_location": "A", "to_location": "B", "quantity": q})
            assert r.status_code == 400

    def test_transfer_same_location_400(self, test_stock):
        requests.post(f"{API}/locations", json={"stock_id": test_stock["id"], "name": "A"})
        p = self._mk(test_stock["id"], [{"location": "A", "quantity": 5}])
        r = requests.post(f"{API}/products/{p['id']}/transfer",
                          json={"from_location": "A", "to_location": "A", "quantity": 1})
        assert r.status_code == 400

    def test_transfer_more_than_available_400(self, test_stock):
        requests.post(f"{API}/locations", json={"stock_id": test_stock["id"], "name": "A"})
        requests.post(f"{API}/locations", json={"stock_id": test_stock["id"], "name": "B"})
        p = self._mk(test_stock["id"], [{"location": "A", "quantity": 2}, {"location": "B", "quantity": 0}])
        r = requests.post(f"{API}/products/{p['id']}/transfer",
                          json={"from_location": "A", "to_location": "B", "quantity": 5})
        assert r.status_code == 400

    def test_transfer_source_not_on_product_404(self, test_stock):
        requests.post(f"{API}/locations", json={"stock_id": test_stock["id"], "name": "A"})
        requests.post(f"{API}/locations", json={"stock_id": test_stock["id"], "name": "B"})
        p = self._mk(test_stock["id"], [{"location": "A", "quantity": 2}])
        r = requests.post(f"{API}/products/{p['id']}/transfer",
                          json={"from_location": "Z", "to_location": "B", "quantity": 1})
        assert r.status_code == 404

    def test_transfer_destination_not_in_stock_404(self, test_stock):
        requests.post(f"{API}/locations", json={"stock_id": test_stock["id"], "name": "A"})
        p = self._mk(test_stock["id"], [{"location": "A", "quantity": 2}])
        # destination name is not an existing managed location of this stock AND not on the product
        r = requests.post(f"{API}/products/{p['id']}/transfer",
                          json={"from_location": "A", "to_location": "UnknownZZ", "quantity": 1})
        assert r.status_code == 404


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


# ---------- Internal/Supplier codes & search ----------
class TestInternalSupplierCodes:
    def test_create_persists_codes(self, test_stock):
        r = requests.post(f"{API}/products", json={
            "stock_id": test_stock["id"], "name": "TEST_Codes1",
            "internal_code": "INT-001", "supplier_code": "SUP-ABC",
        })
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["internal_code"] == "INT-001"
        assert p["supplier_code"] == "SUP-ABC"
        # Verify via GET
        g = requests.get(f"{API}/products/{p['id']}")
        assert g.json()["internal_code"] == "INT-001"
        assert g.json()["supplier_code"] == "SUP-ABC"

    def test_empty_codes_become_null(self, test_stock):
        r = requests.post(f"{API}/products", json={
            "stock_id": test_stock["id"], "name": "TEST_CodesEmpty",
            "internal_code": "   ", "supplier_code": "",
        })
        assert r.status_code == 200
        p = r.json()
        assert p["internal_code"] is None
        assert p["supplier_code"] is None

    def test_patch_codes(self, test_stock):
        r = requests.post(f"{API}/products", json={
            "stock_id": test_stock["id"], "name": "TEST_CodesPatch",
        })
        pid = r.json()["id"]
        r2 = requests.patch(f"{API}/products/{pid}", json={
            "internal_code": "NEW-INT", "supplier_code": "NEW-SUP",
        })
        assert r2.status_code == 200
        assert r2.json()["internal_code"] == "NEW-INT"
        assert r2.json()["supplier_code"] == "NEW-SUP"

    def test_search_matches_codes_and_barcode(self, test_stock):
        bc = f"BC{uuid.uuid4().hex[:10]}"
        requests.post(f"{API}/products", json={
            "stock_id": test_stock["id"], "name": "TEST_SearchA",
            "internal_code": "ZZINT123", "supplier_code": "ZZSUP456",
            "barcode": bc,
        })
        requests.post(f"{API}/products", json={
            "stock_id": test_stock["id"], "name": "TEST_SearchB",
            "internal_code": "OTHER", "supplier_code": "OTHERSUP",
        })
        # by internal_code (case-insensitive)
        r = requests.get(f"{API}/products", params={"stock_id": test_stock["id"], "q": "zzint"})
        names = {p["name"] for p in r.json()}
        assert "TEST_SearchA" in names and "TEST_SearchB" not in names
        # by supplier_code
        r = requests.get(f"{API}/products", params={"stock_id": test_stock["id"], "q": "ZZSUP"})
        names = {p["name"] for p in r.json()}
        assert "TEST_SearchA" in names and "TEST_SearchB" not in names
        # by barcode
        r = requests.get(f"{API}/products", params={"stock_id": test_stock["id"], "q": bc})
        names = {p["name"] for p in r.json()}
        assert "TEST_SearchA" in names
        # by name
        r = requests.get(f"{API}/products", params={"stock_id": test_stock["id"], "q": "searchb"})
        names = {p["name"] for p in r.json()}
        assert "TEST_SearchB" in names

    def test_search_regex_escaped(self, test_stock):
        # Dot in code should not act as wildcard
        requests.post(f"{API}/products", json={
            "stock_id": test_stock["id"], "name": "TEST_Dot",
            "internal_code": "A.B",
        })
        requests.post(f"{API}/products", json={
            "stock_id": test_stock["id"], "name": "TEST_NoDot",
            "internal_code": "AXB",
        })
        r = requests.get(f"{API}/products", params={"stock_id": test_stock["id"], "q": "A.B"})
        names = {p["name"] for p in r.json()}
        assert "TEST_Dot" in names and "TEST_NoDot" not in names


# ---------- Barcode uniqueness per stock ----------
class TestBarcodeUniqueness:
    def test_duplicate_barcode_same_stock_409(self, test_stock):
        bc = f"UQ{uuid.uuid4().hex[:10]}"
        r1 = requests.post(f"{API}/products", json={
            "stock_id": test_stock["id"], "name": "TEST_BC_First", "barcode": bc,
        })
        assert r1.status_code == 200
        r2 = requests.post(f"{API}/products", json={
            "stock_id": test_stock["id"], "name": "TEST_BC_Dup", "barcode": bc,
        })
        assert r2.status_code == 409
        assert "TEST_BC_First" in r2.json()["detail"]
        assert "Codice già associato a:" in r2.json()["detail"]

    def test_same_barcode_different_stock_ok(self, test_stock):
        bc = f"UQ{uuid.uuid4().hex[:10]}"
        r1 = requests.post(f"{API}/products", json={
            "stock_id": test_stock["id"], "name": "TEST_S1", "barcode": bc,
        })
        assert r1.status_code == 200
        r_other = requests.post(f"{API}/stocks", json={"name": f"TEST_BCOther_{uuid.uuid4().hex[:4]}"})
        other = r_other.json()
        try:
            r2 = requests.post(f"{API}/products", json={
                "stock_id": other["id"], "name": "TEST_S2", "barcode": bc,
            })
            assert r2.status_code == 200
        finally:
            requests.delete(f"{API}/stocks/{other['id']}")

    def test_patch_own_barcode_allowed(self, test_stock):
        bc = f"UQ{uuid.uuid4().hex[:10]}"
        r = requests.post(f"{API}/products", json={
            "stock_id": test_stock["id"], "name": "TEST_Own", "barcode": bc,
        })
        pid = r.json()["id"]
        # Patching with the same barcode should not raise
        r2 = requests.patch(f"{API}/products/{pid}", json={"barcode": bc})
        assert r2.status_code == 200
        assert r2.json()["barcode"] == bc

    def test_patch_duplicate_barcode_409(self, test_stock):
        bc = f"UQ{uuid.uuid4().hex[:10]}"
        requests.post(f"{API}/products", json={
            "stock_id": test_stock["id"], "name": "TEST_Owner", "barcode": bc,
        })
        r2 = requests.post(f"{API}/products", json={
            "stock_id": test_stock["id"], "name": "TEST_WantsIt",
        })
        pid2 = r2.json()["id"]
        r3 = requests.patch(f"{API}/products/{pid2}", json={"barcode": bc})
        assert r3.status_code == 409
        assert "TEST_Owner" in r3.json()["detail"]


# ---------- Receipts (carico magazzino) ----------
class TestReceipts:
    def _loc(self, stock_id, name):
        requests.post(f"{API}/locations", json={"stock_id": stock_id, "name": name})

    def test_receipt_adds_to_existing_location(self, test_stock):
        self._loc(test_stock["id"], "Magazzino")
        p = requests.post(f"{API}/products", json={
            "stock_id": test_stock["id"], "name": "TEST_Rec1",
            "locations": [{"location": "Magazzino", "quantity": 2}],
        }).json()
        r = requests.post(f"{API}/receipts", json={
            "stock_id": test_stock["id"], "location": "Magazzino",
            "note": "test load", "items": [{"product_id": p["id"], "quantity": 5}],
        })
        assert r.status_code == 200, r.text
        rec = r.json()
        assert rec["total_pieces"] == 5
        assert rec["items"][0]["name"] == "TEST_Rec1"
        assert rec["note"] == "test load"
        # Verify stock increased
        g = requests.get(f"{API}/products/{p['id']}").json()
        locs = {l["location"]: l["quantity"] for l in g["locations"]}
        assert locs["Magazzino"] == 7

    def test_receipt_adds_missing_location_row(self, test_stock):
        self._loc(test_stock["id"], "NewLoc")
        p = requests.post(f"{API}/products", json={
            "stock_id": test_stock["id"], "name": "TEST_Rec2",
            "locations": [{"location": "Magazzino", "quantity": 1}],
        }).json()
        r = requests.post(f"{API}/receipts", json={
            "stock_id": test_stock["id"], "location": "NewLoc",
            "items": [{"product_id": p["id"], "quantity": 4}],
        })
        assert r.status_code == 200
        g = requests.get(f"{API}/products/{p['id']}").json()
        locs = {l["location"]: l["quantity"] for l in g["locations"]}
        assert locs.get("NewLoc") == 4

    def test_receipt_skips_zero_and_neg(self, test_stock):
        self._loc(test_stock["id"], "Magazzino")
        p1 = requests.post(f"{API}/products", json={
            "stock_id": test_stock["id"], "name": "TEST_RecZ1",
            "locations": [{"location": "Magazzino", "quantity": 0}],
        }).json()
        p2 = requests.post(f"{API}/products", json={
            "stock_id": test_stock["id"], "name": "TEST_RecZ2",
            "locations": [{"location": "Magazzino", "quantity": 0}],
        }).json()
        r = requests.post(f"{API}/receipts", json={
            "stock_id": test_stock["id"], "location": "Magazzino",
            "items": [
                {"product_id": p1["id"], "quantity": 0},
                {"product_id": p2["id"], "quantity": 3},
            ],
        })
        assert r.status_code == 200
        assert r.json()["total_pieces"] == 3
        assert len(r.json()["items"]) == 1

    def test_receipt_no_items_400(self, test_stock):
        self._loc(test_stock["id"], "Magazzino")
        r = requests.post(f"{API}/receipts", json={
            "stock_id": test_stock["id"], "location": "Magazzino", "items": [],
        })
        assert r.status_code == 400

    def test_receipt_unknown_location_404(self, test_stock):
        p = requests.post(f"{API}/products", json={
            "stock_id": test_stock["id"], "name": "TEST_RecUL",
        }).json()
        r = requests.post(f"{API}/receipts", json={
            "stock_id": test_stock["id"], "location": "DOES_NOT_EXIST",
            "items": [{"product_id": p["id"], "quantity": 1}],
        })
        assert r.status_code == 404

    def test_receipt_unknown_product_404_no_partial_apply(self, test_stock):
        self._loc(test_stock["id"], "Magazzino")
        p = requests.post(f"{API}/products", json={
            "stock_id": test_stock["id"], "name": "TEST_RecPG",
            "locations": [{"location": "Magazzino", "quantity": 0}],
        }).json()
        before = requests.get(f"{API}/products/{p['id']}").json()
        before_qty = {l["location"]: l["quantity"] for l in before["locations"]}.get("Magazzino", 0)
        r = requests.post(f"{API}/receipts", json={
            "stock_id": test_stock["id"], "location": "Magazzino",
            "items": [
                {"product_id": p["id"], "quantity": 5},
                {"product_id": "nope-" + uuid.uuid4().hex, "quantity": 2},
            ],
        })
        assert r.status_code == 404
        after = requests.get(f"{API}/products/{p['id']}").json()
        after_qty = {l["location"]: l["quantity"] for l in after["locations"]}.get("Magazzino", 0)
        assert after_qty == before_qty, "Receipt should not have been partially applied"

    def test_list_receipts_newest_first(self, test_stock):
        self._loc(test_stock["id"], "Magazzino")
        p = requests.post(f"{API}/products", json={
            "stock_id": test_stock["id"], "name": "TEST_RecList",
            "locations": [{"location": "Magazzino", "quantity": 0}],
        }).json()
        r1 = requests.post(f"{API}/receipts", json={
            "stock_id": test_stock["id"], "location": "Magazzino",
            "note": "first", "items": [{"product_id": p["id"], "quantity": 1}],
        }).json()
        r2 = requests.post(f"{API}/receipts", json={
            "stock_id": test_stock["id"], "location": "Magazzino",
            "note": "second", "items": [{"product_id": p["id"], "quantity": 2}],
        }).json()
        lst = requests.get(f"{API}/receipts", params={"stock_id": test_stock["id"]}).json()
        assert lst[0]["id"] == r2["id"]
        ids = [x["id"] for x in lst]
        assert ids.index(r2["id"]) < ids.index(r1["id"])

    def test_delete_stock_removes_receipts(self):
        s = requests.post(f"{API}/stocks", json={"name": f"TEST_RecDel_{uuid.uuid4().hex[:6]}"}).json()
        requests.post(f"{API}/locations", json={"stock_id": s["id"], "name": "M"})
        p = requests.post(f"{API}/products", json={
            "stock_id": s["id"], "name": "TEST_PRecDel",
            "locations": [{"location": "M", "quantity": 0}],
        }).json()
        requests.post(f"{API}/receipts", json={
            "stock_id": s["id"], "location": "M",
            "items": [{"product_id": p["id"], "quantity": 1}],
        })
        # Need a second stock so delete isn't blocked by "only one stock" rule
        s2 = requests.post(f"{API}/stocks", json={"name": f"TEST_RecDel2_{uuid.uuid4().hex[:6]}"}).json()
        try:
            dr = requests.delete(f"{API}/stocks/{s['id']}")
            assert dr.status_code == 200
            # Receipts for this stock should be gone - re-create stock and verify no receipts remain
            lst = requests.get(f"{API}/receipts", params={"stock_id": s2["id"]}).json()
            assert all(x["stock_id"] == s2["id"] for x in lst)
        finally:
            requests.delete(f"{API}/stocks/{s2['id']}")

