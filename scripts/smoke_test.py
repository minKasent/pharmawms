"""End-to-end smoke test against a running backend. Standard library only.

Usage: python scripts/smoke_test.py [--base http://localhost:8080/api/v1]
Creates uniquely named data on every run, so it can be re-run against the same database.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import uuid
from datetime import date, timedelta
from urllib.error import HTTPError
from urllib.request import Request, urlopen

DEMO_PASSWORD = "Demo@123"
FORECAST_TIMEOUT_SECONDS = 300


class Api:
    def __init__(self, base: str) -> None:
        self.base = base.rstrip("/")
        self.token: str | None = None

    def call(self, method: str, path: str, body: object | None = None, headers: dict[str, str] | None = None,
             expect: int | None = None) -> tuple[int, object]:
        data = json.dumps(body).encode("utf-8") if body is not None else None
        request = Request(self.base + path, data=data, method=method)
        request.add_header("Content-Type", "application/json")
        if self.token:
            request.add_header("Authorization", f"Bearer {self.token}")
        for key, value in (headers or {}).items():
            request.add_header(key, value)
        try:
            with urlopen(request) as response:
                raw = response.read()
                status = response.status
        except HTTPError as error:
            raw = error.read()
            status = error.code
        payload = json.loads(raw) if raw else None
        if expect is not None and status != expect:
            raise AssertionError(f"{method} {path}: expected {expect}, got {status}: {payload}")
        return status, payload

    def login(self, username: str) -> dict:
        self.token = None
        _, payload = self.call("POST", "/auth/login", {"username": username, "password": DEMO_PASSWORD}, expect=200)
        self.token = payload["accessToken"]
        return payload


def check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)
    print(f"  ok  {message}")


def iso(days_from_today: int) -> str:
    return (date.today() + timedelta(days=days_from_today)).isoformat()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://localhost:8080/api/v1")
    api = Api(parser.parse_args().base)
    suffix = uuid.uuid4().hex[:6].upper()

    print("Auth")
    api.call("POST", "/auth/login", {"username": "duocsi", "password": "wrong"}, expect=401)
    session = api.login("duocsi")
    check(session["user"]["role"] == "PHARMACIST_MANAGER", "pharmacist logs in")
    _, refreshed = api.call("POST", "/auth/refresh", {"refreshToken": session["refreshToken"]}, expect=200)
    status, problem = api.call("POST", "/auth/refresh", {"refreshToken": session["refreshToken"]})
    check(status == 401, "reused refresh token is rejected")
    _, rotated = api.call("POST", "/auth/refresh", {"refreshToken": refreshed["refreshToken"]}, expect=200)
    check(bool(rotated["accessToken"]), "concurrent refresh within grace window preserves active token family")
    api.call("POST", "/auth/logout", {"refreshToken": rotated["refreshToken"]}, expect=204)
    status, _ = api.call("POST", "/auth/refresh", {"refreshToken": rotated["refreshToken"]})
    check(status == 401, "token family is revoked after logout")
    api.login("duocsi")

    print("Catalog & layout")
    _, category = api.call("POST", "/categories", {"code": f"KS{suffix}", "name": f"Kháng sinh {suffix}"}, expect=201)
    _, product = api.call("POST", "/products", {
        "sku": f"AMOX{suffix}",
        "product": {
            "name": "Amoxicillin", "activeIngredient": "Amoxicillin", "strength": "500mg",
            "dosageForm": "Viên nang", "categoryId": category["id"], "storageCondition": "NORMAL",
            "prescriptionRequired": True, "baseUnit": "Viên", "minShelfLifeOnReceiptDays": 180,
            "referenceUnitCost": 1200,
            "units": [{"unitName": "Vỉ", "factorToBase": 10}, {"unitName": "Hộp", "factorToBase": 100}],
        },
    }, expect=201)
    check({u["unitName"]: u["factorToBase"] for u in product["units"]} == {"Viên": 1, "Vỉ": 10, "Hộp": 100},
          "packaging hierarchy stored with base unit")
    _, warehouse = api.call("POST", "/warehouses", {"code": f"K{suffix}", "name": "Kho trung tâm"}, expect=201)
    _, normal_zone = api.call("POST", f"/warehouses/{warehouse['id']}/zones",
                              {"code": "A", "name": "Khu thường", "storageCondition": "NORMAL"}, expect=201)
    _, cold_zone = api.call("POST", f"/warehouses/{warehouse['id']}/zones",
                            {"code": "C", "name": "Khu lạnh", "storageCondition": "COLD"}, expect=201)
    _, loc1 = api.call("POST", f"/zones/{normal_zone['id']}/locations", {"code": "A-01"}, expect=201)
    _, loc2 = api.call("POST", f"/zones/{normal_zone['id']}/locations", {"code": "A-02"}, expect=201)
    _, cold_loc = api.call("POST", f"/zones/{cold_zone['id']}/locations", {"code": "C-01"}, expect=201)

    print("Goods receipt")
    def line(lot: str, days: int, location: int, unit: str, qty: int, cost: float = 1000) -> dict:
        return {"productId": product["id"], "lotNumber": lot, "expiryDate": iso(days), "locationId": location,
                "unitName": unit, "quantity": qty, "unitCostPerBaseUnit": cost}

    _, receipt = api.call("POST", "/goods-receipts", {"lines": [
        line("L-LATE", 700, loc1["id"], "Hộp", 5, 1100), line("L-EARLY", 300, loc2["id"], "Vỉ", 20, 1000)]},
        expect=201)
    check(sorted(l["baseQuantity"] for l in receipt["lines"]) == [200, 500], "quantities converted to base units")
    _, problem = api.call("POST", "/goods-receipts", {"lines": [line("X", 700, cold_loc["id"], "Hộp", 1)]},
                          expect=422)
    check(problem["code"] == "STORAGE_CONDITION_MISMATCH", "room-temperature drug rejected in cold zone")
    _, problem = api.call("POST", "/goods-receipts", {"lines": [line("Y", 30, loc1["id"], "Hộp", 1)]}, expect=422)
    check(problem["code"] == "SHELF_LIFE_TOO_SHORT", "short shelf life rejected on receipt")
    _, problem = api.call("POST", "/goods-receipts", {"lines": [line("L-LATE", 650, loc1["id"], "Hộp", 1)]},
                          expect=422)
    check(problem["code"] == "LOT_DATA_MISMATCH", "same lot with different expiry rejected")

    print("FEFO issue")
    issue = {"destination": "Nhà thuốc số 1", "lines": [{"productId": product["id"], "unitName": "Viên", "quantity": 250}]}
    _, preview = api.call("POST", "/goods-issues/preview", issue, expect=200)
    picks = [(a["lotNumber"], a["quantity"]) for a in preview["lines"][0]["allocations"]]
    check(picks == [("L-EARLY", 200), ("L-LATE", 50)], f"earliest expiry picked first {picks}")
    key = str(uuid.uuid4())
    _, first = api.call("POST", "/goods-issues", issue, headers={"Idempotency-Key": key}, expect=201)
    _, replay = api.call("POST", "/goods-issues", issue, headers={"Idempotency-Key": key}, expect=201)
    check(replay["replayed"] and replay["id"] == first["id"], "idempotent replay returns the original issue")
    _, problem = api.call("POST", "/goods-issues", {"destination": "X", "lines": [
        {"productId": product["id"], "unitName": "Hộp", "quantity": 10}]}, expect=422)
    check(problem["code"] == "INSUFFICIENT_STOCK", "over-issue rejected atomically")
    _, problem = api.call("POST", "/goods-issues", {"destination": "X", "minRemainingShelfLifeDays": 400, "lines": [
        {"productId": product["id"], "unitName": "Viên", "quantity": 451}]}, expect=422)
    check(problem["code"] == "INSUFFICIENT_STOCK", "minimum remaining shelf life respected")

    print("Stock views")
    _, card = api.call("GET", f"/products/{product['id']}/stock-card", expect=200)
    check(card["closingBalance"] == 450 and len(card["entries"]) == 4, "stock card reconciles (700 in, 250 out)")
    _, batches = api.call("GET", f"/batches?productId={product['id']}", expect=200)
    early = next(b for b in batches if b["lotNumber"] == "L-EARLY")
    check(early["onHand"] == 0, "early lot fully consumed")
    late = next(b for b in batches if b["lotNumber"] == "L-LATE")
    _, trace = api.call("GET", f"/batches/{late['id']}/traceability", expect=200)
    check(trace["batch"]["id"] == late["id"] and trace["totalReceived"] == 500 and trace["totalIssued"] == 50,
          "batch traceability passport reconciles received and issued totals")
    api.call("POST", f"/batches/{late['id']}/hold", {"reason": "Thu hồi theo công văn"}, expect=204)
    _, problem = api.call("POST", "/goods-issues/preview", issue, expect=200)
    check(not problem["fullyAllocatable"], "batch on hold is not issuable")
    api.call("POST", f"/batches/{late['id']}/release", expect=204)
    api.call("GET", "/dashboard/expiry-heatmap", expect=200)
    _, kpis = api.call("GET", "/dashboard/inventory-kpis", expect=200)
    check(len(kpis["issueTrend"]) == 30, "KPI trend has 30 days")

    print("Stock take (segregation of duties)")
    api.login("thukho")
    _, take = api.call("POST", "/stock-takes", {"zoneId": normal_zone["id"]}, expect=201)
    counts = [{"lineId": l["lineId"], "countedQuantity": l["systemQuantity"] - 1} for l in take["lines"]]
    api.call("PUT", f"/stock-takes/{take['header']['id']}/counts", {"counts": counts}, expect=200)
    api.call("POST", f"/stock-takes/{take['header']['id']}/submit", expect=200)
    status, _ = api.call("POST", f"/stock-takes/{take['header']['id']}/approve")
    check(status == 403, "storekeeper cannot approve adjustments")
    api.login("duocsi")
    _, approved = api.call("POST", f"/stock-takes/{take['header']['id']}/approve", expect=200)
    check(approved["header"]["status"] == "APPROVED", "pharmacist approves stock take")
    _, card = api.call("GET", f"/products/{product['id']}/stock-card", expect=200)
    check(card["closingBalance"] == 449, "adjustment booked in ledger")

    print("Purchasing (approval workflow)")
    api.login("muahang")
    _, supplier = api.call("POST", "/suppliers", {"code": f"NCC{suffix}", "details": {
        "name": f"Dược phẩm {suffix}", "phone": "0281234567", "email": "sales@example.com",
        "address": "TP.HCM", "defaultLeadTimeDays": 5}}, expect=201)
    _, fetched_supplier = api.call("GET", f"/suppliers/{supplier['id']}", expect=200)
    check(fetched_supplier["code"] == f"NCC{suffix}", "supplier detail endpoint returns created supplier")
    api.call("PUT", f"/suppliers/{supplier['id']}/products/{product['id']}",
             {"packSize": 100, "minOrderQuantity": 500, "unitPrice": 1150, "preferred": True}, expect=200)
    _, order = api.call("POST", "/purchase-orders", {"supplierId": supplier["id"], "lines": [
        {"productId": product["id"], "unitName": "Hộp", "quantity": 10}]}, expect=201)
    check(order["status"] == "DRAFT" and order["lines"][0]["quantity"] == 1000, "draft order in base units")
    check(order["lines"][0]["unitPrice"] == 1150, "unit price defaults from supplier terms")
    api.call("POST", f"/purchase-orders/{order['id']}/submit", expect=200)
    status, _ = api.call("POST", f"/purchase-orders/{order['id']}/approve")
    check(status == 403, "purchaser cannot approve orders")
    api.login("duocsi")
    _, order = api.call("POST", f"/purchase-orders/{order['id']}/approve", expect=200)
    check(order["status"] == "APPROVED", "pharmacist approves order")
    api.login("muahang")
    api.call("POST", f"/purchase-orders/{order['id']}/send", expect=200)

    api.login("thukho")
    def po_line(lot: str, boxes: int) -> dict:
        return {"productId": product["id"], "lotNumber": lot, "expiryDate": iso(720), "locationId": loc1["id"],
                "unitName": "Hộp", "quantity": boxes, "unitCostPerBaseUnit": 1150}

    _, received = api.call("POST", f"/purchase-orders/{order['id']}/receipts",
                           {"lines": [po_line(f"PO{suffix}", 6)]}, headers={"Idempotency-Key": str(uuid.uuid4())},
                           expect=201)
    check(received["order"]["status"] == "PARTIALLY_RECEIVED", "partial receipt tracked on order")
    _, problem = api.call("POST", f"/purchase-orders/{order['id']}/receipts",
                          {"lines": [po_line(f"PO{suffix}", 5)]}, expect=422)
    check(problem["code"] == "OVER_RECEIPT", "over-receipt against order rejected")
    final_rcpt_key = str(uuid.uuid4())
    _, received = api.call("POST", f"/purchase-orders/{order['id']}/receipts",
                           {"lines": [po_line(f"PO{suffix}", 4)]}, headers={"Idempotency-Key": final_rcpt_key},
                           expect=201)
    check(received["order"]["status"] == "RECEIVED", "order completes when fully received")
    _, replay_rcpt = api.call("POST", f"/purchase-orders/{order['id']}/receipts",
                              {"lines": [po_line(f"PO{suffix}", 4)]}, headers={"Idempotency-Key": final_rcpt_key},
                              expect=201)
    check(replay_rcpt["receipt"]["replayed"] and replay_rcpt["order"]["status"] == "RECEIVED",
          "final PO receipt supports idempotent replay after RECEIVED")
    _, card = api.call("GET", f"/products/{product['id']}/stock-card", expect=200)
    check(card["closingBalance"] == 1449, "order receipts booked in stock ledger")
    _, recon = api.call("GET", "/stock/reconciliation", expect=200)
    check(recon["consistent"] and recon["discrepancyCount"] == 0, "stock ledger reconciles with stock_balance")

    print("Forecasting")
    api.login("duocsi")
    _, run = api.call("POST", "/forecasting/runs", expect=202)
    deadline = time.monotonic() + FORECAST_TIMEOUT_SECONDS
    while run["status"] == "RUNNING" and time.monotonic() < deadline:
        time.sleep(1)
        _, run = api.call("GET", f"/forecasting/runs/{run['id']}", expect=200)
    check(run["status"] == "SUCCEEDED", f"forecast run succeeded via {run['source']} ({run['note']})")
    _, forecast = api.call("GET", f"/forecasting/products/{product['id']}?historyDays=30", expect=200)
    check(forecast["runId"] == run["id"] and len(forecast["history"]) == 30, "product forecast with demand history")
    _, suggestions = api.call("GET", "/purchase-suggestions?status=OPEN", expect=200)
    check(isinstance(suggestions["content"], list), "suggestions listed")
    api.login("thukho")
    status, _ = api.call("POST", "/forecasting/runs")
    check(status == 403, "storekeeper cannot run forecasts")

    print("Access control")
    api.token = None
    status, _ = api.call("GET", "/stock")
    check(status == 401, "anonymous request rejected")
    api.login("thukho")
    status, _ = api.call("POST", "/categories", {"code": "X", "name": "X"})
    check(status == 403, "storekeeper cannot manage catalog")

    print("\nAll smoke checks passed.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except AssertionError as failure:
        print(f"\nFAILED: {failure}")
        sys.exit(1)
