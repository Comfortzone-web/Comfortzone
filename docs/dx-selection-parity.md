# DX Selection Sheet parity correction

Step 2 now uses the supplied workbook's Data C6:Y29 catalog and DX-Data C5:K30 lookup thresholds, embedded in public/dx-selection-data.js. The reference and existing export template contain the same thresholds and catalog values. No extraction rules were changed for this correction.

## Rules

TKw is always the baseline. Each enabled SKw / L/S checkbox adds its own approximate lookup in the selected family's range. Unchecked criteria contribute no index. The highest resulting index selects the model, matching MAX(AJ:AL) and the AN model lookup. Automatic quantity is 1, matching AO; the earlier browser quantity/capacity ranking is removed.

Families use the workbook's exact row ranges: DUCTED 5:11, DUCTED-INV 12:18, DECORATIVE 19:23, PACKAGED 24:30. Wall Mounted and Split are UI aliases for DECORATIVE. Unsupported types do not silently become Ducted. Empty TKw gives no automatic selection. The terminal CHOOSE MANUALLY entries are preserved.

Variation changes the lookup threshold through threshold / (1 - variation), matching DX-Data D/F/H. Table order and duplicate thresholds are preserved, including the repeated inverter airflow thresholds. The supplied inverter sensible thresholds include a decrease (6.83 then 6.61). Approximate VLOOKUP normally requires ascending keys; the browser uses binary approximate lookup against the original order rather than silently changing engineering data. That nonmonotonic source range merits native Excel acceptance checking.

For the user's Ducted 10 kW / 9 kW / 800 L/s example: TKw baseline selects FDMRN50AVKU - RR50AYKU. SKw matching alone retains that model. Enabling L/S selects FDMRN60AVKU - RR60AYKU, Qty 1, 5 TR, TC 13.5, SC 12.28, airflow 826 L/s.

## Editing and export

All proposed technical fields are disabled and protected in the edit handler. Only Model and Qty remain editable. Model must be a catalog entry; selecting it reloads all 22 technical values from its Data row. Qty is a positive integer and does not multiply per-unit specifications. The existing aggregate summaries account for quantity.

Opening Step 2 refreshes automatic proposals using the corrected rules. Manual model/quantity overrides are preserved, with derived specifications refreshed from the selected model. Regeneration or matching changes confirm before replacing manual proposals.

Automatic Excel rows retain AN/AO selection formulas with matching cached values. Manual selections override AN/AO. The displayed H/I and downstream lookup formulas remain intact. Matching checkbox booleans and variations still map to F9/G9 and E10:G10.

## Verification

20 targeted tests pass, covering the supplied example, all checkbox combinations, family boundaries, variation, duplicate lookup thresholds, over-range/manual selection, catalog specifications, manual rows, extraction regressions, and costing exports.

Isolated browser checks passed for live editing, checkbox updates, blue-column restrictions, model/default changes, manual quantity, save/reopen and Excel exports. XML checks confirmed automatic AN/AO formulas remain formulas and manual overrides remain values. Native Microsoft Excel recalculation was not automated; the source's nonmonotonic sensible threshold range remains an explicit acceptance-check item.

Restart the Node server for the export update, then refresh the browser to load the catalog and selection code. No new packages or database migration are required.
