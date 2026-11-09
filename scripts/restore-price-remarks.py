import json
import sys
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

source = Path(sys.argv[1])
target = Path(__file__).resolve().parents[1] / "data" / "costing-sheets.json"
with zipfile.ZipFile(source) as archive:
    shared = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    strings = ["".join(item.itertext()) for item in shared if item.tag.endswith("}si")]
    sheet = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))

prices = {}
for row in sheet.iter():
    if not row.tag.endswith("}row"):
        continue
    cells = {}
    for cell in row:
        if not cell.tag.endswith("}c"):
            continue
        value = next((child.text for child in cell if child.tag.endswith("}v")), None)
        if value is None:
            continue
        col = "".join(char for char in cell.attrib["r"] if char.isalpha())
        cells[col] = strings[int(value)] if cell.attrib.get("t") == "s" else value
    model = cells.get("B", "").strip().upper()
    if model and model != "MODEL":
        price = round(float(cells["H"]), 2)
        remark = cells.get("I", "").strip()
        if model in prices and prices[model] != (price, remark):
            raise ValueError(f"Conflicting workbook rows for {model}")
        prices[model] = (price, remark)

data = json.loads(target.read_text(encoding="utf-8"))
missing = [item["model"] for item in data["priceItems"] if item["model"].strip().upper() not in prices]
if missing:
    raise ValueError(f"Models missing from workbook: {missing}")
changed = sum(round(float(item.get("finalPrice", 0)), 2) != prices[item["model"].strip().upper()][0] for item in data["priceItems"])
for item in data["priceItems"]:
    item["finalPrice"], item["remarks"] = prices[item["model"].strip().upper()]
    item["history"] = []
data["priceVersion"] = 2
target.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"Synced {len(data['priceItems'])} prices ({changed} changed), {sum(bool(item['remarks']) for item in data['priceItems'])} remarks; priceVersion=2")
