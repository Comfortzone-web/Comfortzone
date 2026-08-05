import json
import math
import os
import sys
from datetime import datetime
from io import BytesIO

from reportlab.lib.pagesizes import A4
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
LETTERHEAD = os.path.join(ROOT, "public", "assets", "purchase-order-letterhead.jpg")
SEAL_IMAGE = r"D:\Al Mahira\Seal - Al mahira tech.png"
SIGN_IMAGE = r"D:\Al Mahira\Sign - 2.jpg"
GREEN = (0.0, 0.34, 0.18)
GREEN_DARK = (0.0, 0.25, 0.13)
INK = (0.08, 0.09, 0.10)
MUTED = (0.34, 0.36, 0.40)
LINE = (0.58, 0.58, 0.58)
LIGHT = (0.93, 0.96, 0.94)
BLUE_STAMP = (0.0, 0.18, 0.95)


def esc(value):
    return "" if value is None else str(value)


def number(value):
    try:
        return float(value or 0)
    except Exception:
        return 0.0


def money(value):
    return f"{number(value):,.2f}"


def amount_aed(value):
    return f"{money(value)} AED"


def fmt_date(value):
    text = esc(value).strip()
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(text[:10], fmt).strftime("%d-%m-%Y")
        except Exception:
            pass
    return text


def wrap_text(text, max_chars):
    words = esc(text).replace("\r", "\n").split()
    lines = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if len(candidate) > max_chars and current:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines or [""]


def wrap_text_width(text, max_width, font="Helvetica", size=10):
    words = esc(text).replace("\r", "\n").split()
    lines = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if stringWidth(candidate, font, size) <= max_width or not current:
            current = candidate
            continue
        lines.append(current)
        current = word
        while stringWidth(current, font, size) > max_width and len(current) > 1:
            cut = len(current)
            while cut > 1 and stringWidth(current[:cut], font, size) > max_width:
                cut -= 1
            lines.append(current[:cut])
            current = current[cut:]
    if current:
        lines.append(current)
    return lines or [""]


def draw_wrapped(c, text, x, y, max_chars, leading=13, max_lines=4, font="Helvetica", size=10):
    c.setFont(font, size)
    for line in wrap_text(text, max_chars)[:max_lines]:
        c.drawString(x, y, line)
        y -= leading
    return y


def draw_centered_wrapped(c, text, x, y, width, max_chars, leading=13, max_lines=3, font="Helvetica", size=10):
    c.setFont(font, size)
    for line in wrap_text(text, max_chars)[:max_lines]:
        c.drawCentredString(x + width / 2, y, line)
        y -= leading
    return y


def draw_background(c, width, height, page_no, total_pages):
    if os.path.exists(LETTERHEAD):
        c.drawImage(LETTERHEAD, 0, 0, width, height, preserveAspectRatio=False, mask="auto")
    else:
        c.setFillColorRGB(1, 1, 1)
        c.rect(0, 0, width, height, stroke=0, fill=1)
        c.setFillColorRGB(0.88, 0.92, 0.90)
        c.ellipse(width - 205, height - 105, width + 60, height + 75, stroke=0, fill=1)
        c.setFillColorRGB(*GREEN)
        c.setFont("Helvetica-Bold", 12)
        c.drawString(34, height - 78, "AL MAHIRA TECHNICAL SERVICES LLC")
        c.setFillColorRGB(*INK)
        c.setFont("Helvetica", 11)
        c.drawRightString(width - 42, height - 54, "Al Mahira Technical Services LLC")
        c.drawRightString(width - 42, height - 74, "Po. Box: 34310")
        c.drawRightString(width - 42, height - 94, "Dubai, UAE")
        c.drawRightString(width - 42, height - 114, "TRN: 100375425400003")
        c.setStrokeColorRGB(0.35, 0.35, 0.35)
        c.line(34, 60, width - 34, 60)
        c.setFillColorRGB(*INK)
        c.setFont("Helvetica", 9)
        c.drawCentredString(width / 2, 42, "www.mahiratech.com | info@mahiratech.com | Po box: 343105, Dubai, UAE")

    c.setFillColorRGB(1, 1, 1)
    c.rect(width / 2 - 58, 18, 116, 30, stroke=0, fill=1)
    c.setFillColorRGB(*MUTED)
    c.setFont("Helvetica", 8.5)
    c.drawCentredString(width / 2, 25, f"Page {page_no} / {total_pages}")


def draw_po_title(c, width, y):
    c.setFillColorRGB(0, 0, 0)
    c.setFont("Helvetica-Bold", 20)
    c.drawCentredString(width / 2, y, "PURCHASE ORDER")


def draw_party_and_details(c, po, x, y, width):
    c.setFillColorRGB(0, 0, 0)
    c.setFont("Helvetica", 11)
    supplier_lines = []
    if po.get("supplierName"):
        supplier_lines.append(po.get("supplierName"))
    supplier_lines.extend(wrap_text(po.get("supplierAddress"), 34)[:4])
    if po.get("trn"):
        supplier_lines.append(f"VAT: {po.get('trn')}")
    for idx, line in enumerate(supplier_lines[:7]):
        c.setFont("Helvetica", 11)
        c.drawString(x, y - idx * 17, line)

    right_x = width - 262
    value_x = width - 58
    details = [
        ("PO No:", po.get("poNo")),
        ("PO Date:", fmt_date(po.get("poDate"))),
        ("Project Name:", po.get("projectName")),
        ("Reference:", po.get("quotationNo")),
        ("Payment Terms:", po.get("paymentTerms")),
        ("Purchase Rep:", po.get("purchaseRepresentative")),
    ]
    visible_details = [(label, value) for label, value in details if esc(value).strip()]
    for idx, (label, value) in enumerate(visible_details):
        row_y = y - idx * 18
        c.setFont("Helvetica-Bold", 11)
        c.drawString(right_x, row_y, label)
        c.setFont("Helvetica", 10.5)
        value_lines = wrap_text_width(value, 114, "Helvetica", 10.5)[:2]
        for line_idx, line in enumerate(value_lines):
            c.drawRightString(value_x, row_y - line_idx * 11, line)


def item_row_height(item):
    desc_width = 176 - 18
    desc_lines = max(1, min(8, len(wrap_text_width(item.get("description"), desc_width, "Helvetica", 9.2))))
    return max(28, 12 + desc_lines * 13)


def draw_table_header(c, x, y, col_widths):
    headers = ["S.No", "Item Description", "QTY", "UNIT PRICE", "TAXES", "AMOUNT"]
    c.setFillColorRGB(*GREEN)
    c.rect(x, y - 30, sum(col_widths), 30, stroke=0, fill=1)
    c.setStrokeColorRGB(0.75, 0.75, 0.75)
    c.setLineWidth(0.45)
    pos = x
    for idx, head in enumerate(headers):
        c.line(pos, y - 30, pos, y)
        c.setFillColorRGB(1, 1, 1)
        c.setFont("Helvetica-Bold", 10.5)
        if idx == 1:
            c.drawString(pos + 10, y - 20, head)
        else:
            c.drawCentredString(pos + col_widths[idx] / 2, y - 20, head)
        pos += col_widths[idx]
    c.line(pos, y - 30, pos, y)
    return y - 30


def draw_item_row(c, item, x, y, col_widths, serial_no):
    row_h = item_row_height(item)
    base = number(item.get("qty")) * number(item.get("unitPrice"))
    vat_percent = number(item.get("vatPercent"))
    c.setStrokeColorRGB(*LINE)
    c.setLineWidth(0.45)
    c.rect(x, y - row_h, sum(col_widths), row_h, stroke=1, fill=0)
    pos = x
    for width in col_widths[:-1]:
        pos += width
        c.line(pos, y - row_h, pos, y)

    c.setFillColorRGB(0, 0, 0)
    text_y = y - (row_h / 2) - 3
    c.setFont("Helvetica", 10.2)
    c.drawCentredString(x + col_widths[0] / 2, text_y, str(serial_no))
    desc_x = x + col_widths[0]
    desc_lines = wrap_text_width(item.get("description"), col_widths[1] - 18, "Helvetica", 9.2)[:8]
    desc_start_y = y - (row_h - len(desc_lines) * 13) / 2 - 9
    c.setFont("Helvetica", 9.2)
    for line in desc_lines:
        c.drawString(desc_x + 10, desc_start_y, line)
        desc_start_y -= 13

    qty_x = desc_x + col_widths[1]
    c.setFont("Helvetica", 10.2)
    c.drawCentredString(qty_x + col_widths[2] / 2, text_y, f"{money(item.get('qty'))} Nos")
    unit_x = qty_x + col_widths[2]
    c.drawCentredString(unit_x + col_widths[3] / 2, text_y, money(item.get("unitPrice")))
    tax_x = unit_x + col_widths[3]
    c.drawCentredString(tax_x + col_widths[4] / 2, text_y, f"{money(vat_percent).rstrip('0').rstrip('.')}%")
    amount_x = tax_x + col_widths[4]
    c.drawCentredString(amount_x + col_widths[5] / 2, text_y, money(base))
    return y - row_h


def draw_summary(c, po, x, y):
    w = 210
    row_h = 36
    discount = number(po.get("discount"))
    rows = [
        ("Untaxed Amount", amount_aed(po.get("subtotal"))),
    ]
    if discount:
        rows.append(("Discount", f"-{amount_aed(discount)}"))
    rows.extend([
        ("VAT 5%", amount_aed(po.get("vatTotal"))),
        ("Total", amount_aed(po.get("grandTotal"))),
    ])
    c.setLineWidth(0.45)
    for idx, (label, value) in enumerate(rows):
        row_y = y - idx * row_h
        if idx == len(rows) - 1:
            c.setFillColorRGB(*GREEN)
        else:
            c.setFillColorRGB(1, 1, 1)
        c.rect(x, row_y - row_h, w, row_h, stroke=1, fill=1)
        c.line(x + 120, row_y - row_h, x + 120, row_y)
        c.setFillColorRGB(1, 1, 1) if idx == len(rows) - 1 else c.setFillColorRGB(0, 0, 0)
        c.setFont("Helvetica-Bold" if idx == len(rows) - 1 else "Helvetica", 10.5)
        c.drawString(x + 10, row_y - 23, label)
        c.drawRightString(x + w - 10, row_y - 23, value)
    return y - row_h * len(rows)


def draw_notes(c, notes, x, y, max_chars=92):
    c.setFillColorRGB(0, 0, 0)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(x, y, "Note:")
    c.setFont("Helvetica", 9.8)
    note_lines = esc(notes).replace("\r\n", "\n").replace("\r", "\n").split("\n")
    y -= 22
    for line in note_lines[:12]:
        if not line.strip():
            y -= 15
            continue
        for wrapped in wrap_text(line.rstrip(), max_chars)[:4]:
            c.drawString(x, y, wrapped)
            y -= 15
    return y


def draw_seal_and_signature(c, x, y):
    seal_size = 164
    sign_w = 82
    sign_h = 42
    top_y = y - 8
    bottom_y = top_y - seal_size
    if bottom_y < 68:
        top_y = 232
        bottom_y = top_y - seal_size

    if os.path.exists(SEAL_IMAGE):
        c.drawImage(SEAL_IMAGE, x + 22, bottom_y, seal_size, seal_size, preserveAspectRatio=True, mask="auto")
    if os.path.exists(SIGN_IMAGE):
        sign_y = bottom_y + 58
        c.drawImage(SIGN_IMAGE, x + 190, sign_y, sign_w, sign_h, preserveAspectRatio=True, mask="auto")
    return bottom_y - 8


def paginate_items(items, first_limit=430, other_limit=520):
    pages = []
    current = []
    used = 0
    limit = first_limit
    for item in items:
        row_h = item_row_height(item)
        if current and used + row_h > limit:
            pages.append(current)
            current = []
            used = 0
            limit = other_limit
        current.append(item)
        used += row_h
    pages.append(current or [])
    return pages


def page_items_height(items):
    return sum(item_row_height(item) for item in items or [])


def reserve_summary_page_if_needed(pages):
    if not pages:
        return [[]]
    last_page_start_y = 528 if len(pages) == 1 else 626
    last_page_end_y = last_page_start_y - page_items_height(pages[-1])
    if pages[-1] and last_page_end_y < 330:
        pages.append([])
    return pages


def main():
    payload = json.load(sys.stdin)
    po = payload.get("order") or payload
    items = po.get("items") or []

    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    margin = 36
    table_x = margin
    table_w = width - margin * 2
    col_widths = [42, 176, 80, 86, 70, table_w - 454]
    pages = reserve_summary_page_if_needed(paginate_items(items))
    total_pages = len(pages)

    for page_no, page_items in enumerate(pages, 1):
        draw_background(c, width, height, page_no, total_pages)
        if page_no == 1:
            draw_po_title(c, width, 704)
            draw_party_and_details(c, po, margin, 662, width)
            y = 558
        else:
            draw_po_title(c, width, 700)
            y = 656

        y = draw_table_header(c, table_x, y, col_widths)
        start_index = sum(len(page) for page in pages[:page_no - 1])
        for offset, item in enumerate(page_items, 1):
            y = draw_item_row(c, item, table_x, y, col_widths, start_index + offset)

        if page_no == total_pages:
            summary_bottom = draw_summary(c, po, table_x + table_w - 210, y)
            notes_beside_summary = bool(page_items and y >= 330)
            notes_y = y - 22 if notes_beside_summary else max(118, summary_bottom - 12)
            after_notes_y = draw_notes(c, po.get("notes"), margin, notes_y, 58 if notes_beside_summary else 92)
            draw_seal_and_signature(c, margin, after_notes_y)

        c.showPage()

    c.save()
    sys.stdout.buffer.write(buf.getvalue())


if __name__ == "__main__":
    main()
