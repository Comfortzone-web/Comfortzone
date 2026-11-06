# DX Step 03: BOQ & Quotation

Step 03 extends the existing DX workspace, five-field project header, navigation, actions menu and footer. Steps 01 and 02 retain their engineering and extraction logic. The BOQ is populated from `tables.vrvSchedule.rows`, not an exported workbook.

## Existing integrations

- **Price List:** `loadCosting()` and authenticated `GET /api/costing`. Unit costs use the existing `priceItems[].finalPrice` and retain product IDs, descriptions and update timestamps. Exact combined products take precedence. Otherwise both exact indoor/outdoor component prices must exist; their costs are summed once per equipment set. Existing model normalization is used without fuzzy or substring matching. Missing or ambiguous prices stay blank.
- **Persistence:** the existing project save API stores `project.dx.boq`. It contains grouped rows, original schedule references and quantities, manual rows, quantity/price overrides, pricing snapshots, the overall percentage, calculated amounts, reconciliation state and linked quotation ID. The shared project/customer details remain on the workflow. No new database table or migration is required.
- **Quotations:** `POST /api/sales-crm/quotations` accepts a DX BOQ initialization request. It reads the saved workflow, validates pricing and the existing Customer Database, and reuses `normalizeSalesItem`, quotation numbering, ownership, VAT, CRM persistence and `editSalesQuotation`. The existing Sales Desk Create New Quotation screen opens with an editable **Draft**. It is never finalized by Step 03.
- **Duplicate protection:** simultaneous initialization requests for a workflow are serialized; a deterministic quotation ID in the existing CRM store makes repeated requests reopen the original draft. Reopening does not overwrite later quotation edits. Revisions remain available through the existing Sales Desk behavior.
- **Permissions/currency:** existing Workflow, Sales Desk, Costing and role checks apply. PO-only users cannot access pricing or create quotations. Formatting follows the existing Sales Desk AED currency and 5% VAT rules.

## Pricing definition

The existing Costing Sheet defines Profit Margin as gross margin. Step 03 uses the same formula internally:

`Selling Price = Unit Cost / (1 - Profit Margin / 100)`

The workflow default is 20%, editable and saved per BOQ, with the existing Costing range of 0–95%. The percentage field accepts at most two decimal places, displays two decimals on completion, and uses a decimal text input without number spinners or wheel increments. The formula explanation and source-reference lists are omitted from the BOQ presentation; source mappings remain stored internally. Currency calculations use integer cents with half-up rounding: round the unit selling price to two decimals, then round quantity × unit price per line. Total Cost sums cost lines; Total Selling and Total Amount both show the selling subtotal before VAT. Missing prices produce partial totals and block quotation creation. Zero and blank prices are distinct.

Internal unit cost, overall margin, product IDs and schedule references are retained on DX-sourced quotation records. Customer-facing quotation PDFs continue to print the existing selling-price fields only. Their layout and VAT calculation are unchanged.

## Synchronization

Repeated schedule model combinations are grouped with summed quantities and source references. Routine entry into Step 03 imports new groups while preserving saved prices and manual rows. Schedule quantity changes automatically update grouped BOQ quantities and totals on save and on entry into Step 03, preserving price snapshots. Quantities are positive whole numbers. Removed models remain marked for reconciliation; **Synchronize Schedule** requires confirmation before removing obsolete imported rows. BOQ quantity changes never modify engineering quantities.

**Refresh Prices** fetches the current ERP Price List and requires confirmation before replacing saved or manually overridden costs. **Add Row** selects a real Price List model and uses the same calculation. A red × at the right of Line Total appears on row hover and supports confirmed removal; exclusions prevent removed imported groups from immediately reappearing.

## Files

- New: `public/dx-boq.js` (shared financial, lookup and synchronization functions), `public/dx-boq-ui.js` (Step 03 UI and Sales Desk handoff).
- Updated: `public/dx-workflow.js`, `public/dx-workflow.css`, `public/index.html`, `public/app.js`, `server.js`.
- Tests: `test/dx-boq.test.js`, `test/dx-boq-integration.test.js`, `test/sales-quotation-pdf.test.js`. The quotation numbering test fixture now also copies its required `maintenance-billing.js` dependency.

## Verification

48 automated checks passed across DX selection, thermal extraction, workflow persistence/numbering, Excel exports, costing/quotation synchronization, Sales Desk numbering, PDF rendering/privacy, authentication and Staff access. The new API test uses an isolated server and the actual Price List, project and quotation endpoints; it covers simultaneous draft requests, later quotation edits, VAT, unresolved prices and denied access.

An isolated Edge browser test passed grouping, combined/component prices, missing-price validation, percentage and quantity edits, manual rows, save/reopen, schedule-change detection, confirmed reconciliation/price refresh, desktop/responsive overflow checks, existing Sales Desk form prepopulation and duplicate reopening. The existing Step 01/02 browser flow was also checked separately. The desktop result was visually reviewed against the supplied reference using the existing ERP sidebar and DX components.

## Quotation updates and linked-sheet cards

**Modify Quotation** applies the latest saved BOQ to the existing quotation, preserving its ID, number, status, terms, notes and discount. **Open Quotation** still reopens without overwriting edits. Modify refreshes items and internal pricing metadata and clears a manual subtotal so the existing quotation/VAT calculation uses the updated lines.

Quotation Financial Summary is followed by a compact **DX Selection Sheet** card for DX-sourced quotations or a matching teal **Costing Sheet** card for Costing-sourced quotations. The DX number is read from the current linked project; clicking opens its saved Step 03. Links survive quotation saves and edits. Grand Total uses 22px Inter SemiBold navy text, with a wrapped label beside the right-aligned amount. VAT keeps that font/weight/color at 13px. Unit Price is read-only and centered; the profit percentage has a fixed internal % suffix and two-decimal entry without numeric spinners.
