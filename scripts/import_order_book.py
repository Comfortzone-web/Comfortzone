"""Import the historical Order Book workbook into the local Sales CRM store.

Run with --check first. Existing orders and every non-Order-Book collection are
left intact. A repeat import refuses to overwrite matching order numbers.
"""

import argparse
import json
import os
import uuid
from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path

from openpyxl import load_workbook


ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(r"C:\Users\HP\Downloads\Order Book - 2023-26.xlsx")
TARGET = ROOT / "data" / "sales-crm.json"


def text(value):
    return str(value).strip() if value is not None else ""


def number(value):
    if value is None or text(value) == "":
        return 0.0
    try:
        return float(Decimal(text(value).replace(",", "")))
    except InvalidOperation as exc:
        raise ValueError(f"Invalid number: {value!r}") from exc


def money(value):
    return round(number(value), 2)


def display_date(value):
    if isinstance(value, (datetime, date)):
        return value.strftime("%d/%m/%Y")
    return text(value)


def record_id(kind, value):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"comfortzone/order-book/{kind}/{value}"))


def delivery_status(source, balance, value_missing):
    if not value_missing and abs(balance) <= 0.01:
        return "Delivered"
    label = text(source).casefold()
    if label in {"completed", "delivery completed", "commissioned"}:
        return "Delivered"
    if label == "partially done":
        return "Partially Delivered"
    return "Pending Delivery"


def order_status(value, received, value_missing):
    if value_missing:
        return "Payment Pending"
    if abs(value - received) <= 0.01:
        return "Completed"
    if received <= 0:
        return "Payment Pending"
    if value > 0 and received >= value - 0.01:
        return "Completed"
    return "Partially Paid"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="validate without writing")
    args = parser.parse_args()
    workbook = load_workbook(SOURCE, read_only=True, data_only=True)
    orders_sheet = workbook["Orders"]
    payments_sheet = workbook["Payment Received"]

    payments = defaultdict(list)
    skipped_payments = defaultdict(list)
    for row_number, cells in enumerate(payments_sheet.iter_rows(min_row=5, values_only=True), 5):
        order_no = text(cells[3])
        if not order_no:
            continue
        if cells[8] is None or text(cells[8]) == "":
            skipped_payments[order_no].append(row_number)
            continue
        payments[order_no].append({
            "id": record_id("payment", f"{order_no}/{row_number}"),
            "invoiceDate": display_date(cells[2]),
            "invoiceNo": text(cells[7]),
            "totalAmount": money(cells[8]),
            "remarks": text(cells[9]),
        })

    imported = []
    seen = set()
    for row_number, cells in enumerate(orders_sheet.iter_rows(min_row=5, values_only=True), 5):
        order_no = text(cells[2])
        if not order_no:
            continue
        if order_no in seen:
            raise ValueError(f"Duplicate order number: {order_no}")
        seen.add(order_no)
        value_missing = cells[10] is None or text(cells[10]) == ""
        date_missing = cells[3] is None or text(cells[3]) == ""
        value = money(cells[17])
        received = round(sum(item["totalAmount"] for item in payments[order_no]), 2)
        expected_received = money(cells[18])
        if abs(received - expected_received) > 0.02:
            raise ValueError(f"Payment mismatch for {order_no}: Excel {expected_received}, details {received}")
        balance = round(value - received, 2)
        notes = []
        if value_missing:
            notes.append("Value without VAT is blank in Excel; confirm the order value")
        if date_missing:
            notes.append("Order date is blank in Excel")
        if skipped_payments[order_no]:
            notes.append(f"Payment row(s) {', '.join(map(str, skipped_payments[order_no]))} skipped because amount is blank")
        equipment_value = money(cells[12])
        equipment_cost = money(cells[13])
        equipment_profit = round(equipment_value - equipment_cost, 2)
        imported.append({
            "id": record_id("order", order_no),
            "importedFromOrderBook": True,
            "orderNo": order_no,
            "date": display_date(cells[3]),
            "customer": text(cells[4]),
            "jobDescription": text(cells[5]),
            "salesPerson": text(cells[6]),
            "division": text(cells[7]),
            "typeOfUnit": text(cells[8]),
            "brand": text(cells[9]),
            "valueWithoutVat": money(cells[10]),
            "installationValue": money(cells[11]),
            "equipmentValue": equipment_value,
            "equipmentCost": equipment_cost,
            "otherCosts": money(cells[14]),
            "equipmentProfit": equipment_profit,
            "grossMargin": round(equipment_profit / equipment_value * 100, 4) if equipment_value else 0,
            "vatAmount": round(value - money(cells[10]), 2) if not value_missing else 0,
            "orderValue": value,
            "paymentReceived": received,
            "balance": balance,
            "status": order_status(value, received, value_missing),
            "deliveryStatus": delivery_status(cells[21], balance, value_missing),
            "remarks": text(cells[22]),
            "invoices": payments[order_no],
            "sourceValueMissing": value_missing,
            "sourceDateMissing": date_missing,
            "importReview": "; ".join(notes),
        })

    if len(imported) != 454 or sum(map(len, payments.values())) != 554:
        raise ValueError("Workbook row counts changed; review the import mapping")
    unknown_payment_orders = set(payments) - seen
    if unknown_payment_orders:
        raise ValueError(f"Payments with no matching order: {sorted(unknown_payment_orders)}")
    store = json.loads(TARGET.read_text(encoding="utf-8"))
    existing = {text(item.get("orderNo")): item for item in store.get("orderBook", [])}
    overlap = seen & set(existing)
    if overlap:
        raise ValueError(f"Existing Order Book numbers would be overwritten: {sorted(overlap)[:5]}")
    print(json.dumps({
        "orders": len(imported),
        "payment_rows_imported": sum(map(len, payments.values())),
        "payment_rows_skipped": sum(map(len, skipped_payments.values())),
        "orders_to_review": sum(bool(item["importReview"]) for item in imported),
        "total_order_value": round(sum(item["orderValue"] for item in imported), 2),
        "total_payment_received": round(sum(item["paymentReceived"] for item in imported), 2),
        "dry_run": args.check,
    }, indent=2))
    if args.check:
        return
    store["orderBook"] = list(reversed(imported)) + store.get("orderBook", [])
    temporary = TARGET.with_suffix(".importing.json")
    try:
        temporary.write_text(json.dumps(store, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        os.replace(temporary, TARGET)
    finally:
        temporary.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
