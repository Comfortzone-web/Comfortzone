# DX Schedule Excel export

The Selection Sheet template contains some styled Proposed cells without lookup formulas. Export now rebuilds all body-row formulas from the complete first template row, translating relative references and preserving absolute lookup ranges. Shared formulas are expanded before rows are resized, so exported schedules can also exceed the original template capacity.

Every Proposed cell from Model through Outdoor Weight receives its saved schedule value as the formula cache. This includes blank values and zeroes. Excel previews and readers that do not calculate formulas therefore display the saved schedule immediately. Manual Model/Qty overrides remain literal helper inputs, including a deliberately cleared quantity.

Every total range ends at the last exported data row. The old template's `SUMPRODUCT` ranges ended at row 164 even when the total moved to an earlier row, which included the total itself and caused circular references. Those ranges could also omit rows in longer schedules. Qty, TC, SC, airflow and ESMA power totals now refresh both their formulas and cached results. Proposed totals include each row's Qty.

Specified body cells use non-bold variants of their original styles. Existing style definitions remain intact, and headers, totals, colors, borders, alignment and catalog sheets are preserved.

Verification:

- `node --test test/dx-workbook-export.test.js`: six checks verify all 24 Proposed fields across 400 rows, template gaps, formula references, blank/partial rows, zeroes, manual quantities, all total formulas/caches at seven schedule lengths, regular body fonts and preserved original style definitions/catalog sheets.
- An isolated browser test saved and reopened an 80-row schedule with all equipment families and a manual Model/Qty change, then downloaded through the header menu. An independent ZIP/XML reader compared all 2,400 cells against the persisted schedule and checked row counts and formula presence.
- The related DX selection, numbering, PDF, extraction and costing checks also passed (30 tests total).
- The uploaded 81-row regression reproduces stale total caches and circular `SUMPRODUCT` ranges at O98:Q98. The corrected actual menu download matches all 2,430 uploaded row values and totals of 540.46 kW TC, 506.08 kW SC and 34,470 L/s. Spreadsheet-engine recalculation and a quantity change produce the expected updated totals. Before/after renders confirm regular body fonts and correct displayed totals. The six export checks plus 18 related selection, workflow, PDF and costing checks pass.
