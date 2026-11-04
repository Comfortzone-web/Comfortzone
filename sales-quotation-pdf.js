"use strict";

const fs = require("fs");
const path = require("path");

const COLORS = {
  text: "#111827",
  navy: "#102A5E",
  border: "#D1DCEB",
  blue: "#DCEEFF",
  stripe: "#F8FAFC",
  section: "#E5E7EB",
  cyan: "#19B5E5"
};

const INTRO = "Thank you very much for your valued enquiry. We are pleased to offer our best quotation as below.";

function pdfDate(value) {
  const text = String(value || "").trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const dmy = text.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
  return dmy ? `${dmy[1]}/${dmy[2]}/${dmy[3]}` : text;
}

function amount(value) {
  return Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function renderSalesQuotationPdf(payload, assets) {
  const { PDFDocument, headerPath, footerPath, fontPath } = assets;
  if (!fs.existsSync(headerPath) || !fs.existsSync(footerPath) || !fs.existsSync(fontPath)) {
    throw new Error("Quotation PDF artwork or font is missing");
  }
  const quote = payload.quote || payload;
  const preparedBy = payload.preparedBy || {};
  const breakupPricing = payload.variant === "breakup";
  const doc = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: false, compress: true });
  const chunks = [];
  const result = new Promise((resolve, reject) => {
    doc.on("data", chunk => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  doc.registerFont("Inter", fontPath);
  doc.registerFont("Inter-SemiBold", path.join(path.dirname(fontPath), "Inter-SemiBold.ttf"));
  doc.registerFont("Inter-Bold", path.join(path.dirname(fontPath), "Inter-Bold.ttf"));

  const pageW = 595.28;
  const pageH = 841.89;
  const left = 34;
  const right = pageW - left;
  const width = right - left;
  const bottom = 792;
  let y;
  let pageNumber = 0;

  function useFont(size = 9, bold = false, color = COLORS.text, heavy = false) {
    doc.font(heavy ? "Inter-Bold" : bold ? "Inter-SemiBold" : "Inter").fontSize(size).fillColor(color);
  }

  function print(value, x, top, w, opts = {}) {
    const text = String(value ?? "");
    useFont(opts.size || 9, opts.bold, opts.color || COLORS.text, opts.heavy);
    doc.text(text, x, top, {
      width: w,
      align: opts.align || "left",
      lineGap: opts.lineGap ?? 1,
      fill: true,
      characterSpacing: 0
    });
  }

  function height(value, w, opts = {}) {
    useFont(opts.size || 9, opts.bold, COLORS.text, opts.heavy);
    return doc.heightOfString(String(value ?? "") || " ", { width: w, lineGap: opts.lineGap ?? 1 });
  }

  function line(x1, top1, x2, top2, color = COLORS.border) {
    doc.strokeColor(color).lineWidth(0.6).moveTo(x1, top1).lineTo(x2, top2).stroke();
  }

  function page() {
    doc.addPage({ size: "A4", margin: 0 });
    pageNumber++;
    doc.save().rect(0, 0, pageW, 109).clip();
    doc.image(headerPath, 0, 0, { width: pageW, height: pageH });
    doc.restore();
    doc.save().rect(0, pageH - 48, pageW, 48).clip();
    doc.image(footerPath, 0, 0, { width: pageW, height: pageH });
    doc.restore();
    y = pageNumber === 1 ? 111 : 126;
    if (pageNumber > 1) print(`Quotation ${quote.no || ""}  |  Continued`, left, 108, width, { size: 8, color: COLORS.navy });
  }

  function ensure(required, continuation) {
    if (y + required <= bottom) return;
    page();
    if (continuation) continuation();
  }

  function title() {
    const titleW = 148;
    const center = pageW / 2;
    const top = y;
    line(left + 54, top + 15, center - titleW / 2 - 19, top + 15, COLORS.cyan);
    line(center + titleW / 2 + 19, top + 15, right - 54, top + 15, COLORS.cyan);
    print("Quotation", center - titleW / 2, top, titleW, { size: 22, heavy: true, color: COLORS.navy, align: "center" });
    y += 50;
  }

  function information() {
    const gap = 17;
    const panelW = (width - gap) / 2;
    const labelW = 95;
    const leftRows = [
      ["Customer", quote.customer],
      ["Quotation No.", quote.no],
      ["Quotation Date", pdfDate(quote.date)],
      ["Validity", quote.validity],
      ["Sales Person", quote.salesperson]
    ];
    const rightRows = [
      ["Payment Terms", quote.paymentTerms],
      ["Availability", quote.deliveryTime],
      ["Subject", quote.subject || "Supply of Daikin AC Units"],
      ["Project", quote.project],
      ["Enquiry No.", quote.warranty || quote.enquiryNo]
    ];
    const rowHeights = leftRows.map((row, index) => Math.max(21,
      height(row[1], panelW - labelW - 13, { size: 8.8 }) + 8,
      height(rightRows[index][1], panelW - labelW - 13, { size: 8.8 }) + 8));
    const totalH = rowHeights.reduce((sum, rowH) => sum + rowH, 0);
    ensure(totalH + 23);
    for (const [x, rows] of [[left, leftRows], [left + panelW + gap, rightRows]]) {
      doc.save().roundedRect(x, y, panelW, totalH, 5).clip();
      let rowY = y;
      rows.forEach((row, index) => {
        const rowH = rowHeights[index];
        doc.rect(x, rowY, labelW, rowH).fill(COLORS.blue);
        doc.rect(x + labelW, rowY, panelW - labelW, rowH).fill("#FFFFFF");
        line(x, rowY + rowH, x + panelW, rowY + rowH);
        line(x + labelW, rowY, x + labelW, rowY + rowH);
        print(row[0], x + 7, rowY + 5, labelW - 12, { size: 8.5, bold: true, color: COLORS.navy });
        print(row[1] || "-", x + labelW + 7, rowY + 5, panelW - labelW - 13, { size: 8.8 });
        rowY += rowH;
      });
      doc.restore();
      doc.roundedRect(x, y, panelW, totalH, 5).stroke(COLORS.border);
    }
    y += totalH + 17;
  }

  const itemWidths = breakupPricing ? [36, 229, 37, 38, 91, 96] : [36, 389, 50, 52];

  function itemHeader() {
    const h = 29;
    doc.rect(left, y, width, h).fill(COLORS.blue);
    let x = left;
    const labels = breakupPricing
      ? ["S.No", "Description", "Qty", "Unit", "Unit Price\n(AED)", "Amount\n(AED)"]
      : ["S.No", "Description", "Qty", "Unit"];
    labels.forEach((label, index) => {
      print(label, x + 4, y + (label.includes("\n") ? 3 : 9), itemWidths[index] - 8, {
        size: 8.2, bold: true, color: COLORS.navy,
        align: index === 1 ? "left" : breakupPricing && index >= 4 ? "right" : "center",
        lineGap: 0
      });
      x += itemWidths[index];
      if (index < labels.length - 1) line(x, y, x, y + h);
    });
    doc.rect(left, y, width, h).stroke(COLORS.border);
    y += h;
  }

  function itemRow(item, index) {
    const description = String(item.description || "");
    const rowH = Math.max(25, height(description, itemWidths[1] - 12, { size: 8.6 }) + 10);
    ensure(rowH + 1, itemHeader);
    doc.rect(left, y, width, rowH).fill(index % 2 ? COLORS.stripe : "#FFFFFF");
    const values = [index + 1, description, Number(item.qty || 0).toString(), item.unit || "Nos"];
    if (breakupPricing) {
      values.push(amount(item.unitPrice));
      values.push(amount(Number(item.qty || 0) * Number(item.unitPrice || 0)));
    }
    let x = left;
    values.forEach((value, column) => {
      print(value, x + 5, y + (column === 1 ? 5 : Math.max(5, (rowH - 11) / 2)), itemWidths[column] - 10, {
        size: 8.6, align: column === 1 ? "left" : breakupPricing && column >= 4 ? "right" : "center"
      });
      x += itemWidths[column];
      if (column < values.length - 1) line(x, y, x, y + rowH);
    });
    doc.rect(left, y, width, rowH).stroke(COLORS.border);
    y += rowH;
  }

  function totals() {
    const itemSubtotal = (quote.items || []).reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unitPrice || 0), 0);
    const manual = String(quote.manualSubtotal || "").replace(/,/g, "").trim();
    const subtotal = manual ? Number(manual || 0) : itemSubtotal;
    const discount = Number(quote.discount || 0);
    const taxable = Math.max(0, subtotal - discount);
    const vat = taxable * 0.05;
    const rows = [["Subtotal", subtotal]];
    if (discount) rows.push(["Discount", -discount]);
    rows.push(["VAT 5%", vat], ["Grand Total", taxable + vat]);
    const boxW = 230;
    const rowH = 23;
    y += 11;
    ensure(rows.length * rowH + 16);
    const x = right - boxW;
    rows.forEach(([label, value], index) => {
      const top = y + index * rowH;
      doc.rect(x, top, boxW, rowH).fill(index === rows.length - 1 ? COLORS.blue : "#FFFFFF");
      line(x + 108, top, x + 108, top + rowH);
      doc.rect(x, top, boxW, rowH).stroke(COLORS.border);
      print(label, x + 8, top + 6, 94, { size: index === rows.length - 1 ? 10 : 8.8, heavy: index === rows.length - 1, color: index === rows.length - 1 ? COLORS.navy : COLORS.text });
      print(`AED ${amount(value)}`, x + 113, top + 6, boxW - 121, { size: index === rows.length - 1 ? 10 : 8.8, heavy: index === rows.length - 1, color: index === rows.length - 1 ? COLORS.navy : COLORS.text, align: "right" });
    });
    y += rows.length * rowH + 17;
  }

  function sectionHeader(label) {
    const h = 22;
    doc.rect(left, y, width, h).fill(COLORS.section);
    doc.rect(left, y, width, h).stroke(COLORS.border);
    doc.rect(left + 9, y + 5, 9, 12).stroke(COLORS.text);
    line(left + 12, y + 9, left + 15, y + 9, COLORS.text);
    line(left + 12, y + 12, left + 15, y + 12, COLORS.text);
    print(label, left + 26, y + 5, width - 36, { size: 10.5, bold: true, color: COLORS.navy });
    y += h;
  }

  function wrappedLines(raw, maxW, size) {
    useFont(size);
    const output = [];
    for (const paragraph of String(raw || "").replace(/\r\n?/g, "\n").split("\n")) {
      if (!paragraph) { output.push(""); continue; }
      let current = "";
      for (const word of paragraph.split(/(\s+)/).filter(Boolean)) {
        const next = current + word;
        if (doc.widthOfString(next) <= maxW) { current = next; continue; }
        if (current.trim()) { output.push(current.trimEnd()); current = ""; }
        if (doc.widthOfString(word) <= maxW) { current = word.trimStart(); continue; }
        for (const char of word) {
          if (doc.widthOfString(current + char) > maxW && current) { output.push(current); current = ""; }
          current += char;
        }
      }
      output.push(current.trimEnd());
    }
    return output;
  }

  function textSection(label, content, isTerms = false) {
    if (!String(content || "").trim()) return;
    y += 4;
    ensure(53);
    sectionHeader(label);
    const lines = wrappedLines(content, width - 37, 8.7);
    let segmentStart = y;
    lines.forEach((raw, index) => {
      const isHeading = isTerms && /:\s*$/.test(raw) && raw.length < 100;
      const lineH = raw ? Math.max(12.3, height(raw, width - 36, { size: 8.7, bold: isHeading })) : 7;
      const nextH = isHeading && index < lines.length - 1 ? 12.3 : 0;
      if (y + lineH + nextH + 10 > bottom) {
        doc.rect(left, segmentStart, width, y - segmentStart + 6).stroke(COLORS.border);
        page();
        sectionHeader(`${label} (continued)`);
        segmentStart = y;
      }
      if (raw) {
        if (isTerms && isHeading) doc.rect(left + 9, y + 4, 5, 5).fill("#4B5563");
        print(raw, left + 22, y + 2, width - 36, { size: 8.7, bold: isHeading });
      }
      y += lineH;
    });
    y += 7;
    doc.rect(left, segmentStart, width, y - segmentStart).stroke(COLORS.border);
    y += 8;
  }

  function closing() {
    y += 26;
    ensure(106);
    print("Thanking You", left, y, width, { size: 9.2, bold: true });
    y += 17;
    print("For Comfort Zone AC Devices Trading LLC", left, y, width, { size: 9.2, bold: true });
    y += 22;
    print("Prepared By,", left, y, width, { size: 9.2, bold: true });
    y += 16;
    for (const value of [preparedBy.name, preparedBy.position, preparedBy.contact, preparedBy.email]) {
      if (!String(value || "").trim()) continue;
      print(value, left, y, width, { size: 8.8 });
      y += 13;
    }
  }

  page();
  title();
  information();
  const introH = height(INTRO, width, { size: 9 });
  ensure(introH + 38);
  print(INTRO, left, y, width, { size: 9 });
  y += introH + 14;
  itemHeader();
  (quote.items || []).forEach(itemRow);
  totals();
  textSection("Notes", quote.notes);
  textSection("Terms & Conditions", quote.terms, true);
  closing();
  doc.end();
  return result;
}

module.exports = { renderSalesQuotationPdf };
