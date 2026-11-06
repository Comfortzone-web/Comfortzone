# DX Workflow redesign implementation

The existing DX canvas presentation is replaced by a two-step workspace based on the supplied screenshots. VRV keeps its existing canvas. Thermal extraction prompts, column normalization, retry/verification functions, authentication, upload storage, and original engineering workbook remain in use.

## Files

- `public/dx-workflow.js`: shared project header, two steps, selected uploads, preview navigator, extraction/append orchestration, editable tables, review state, matching controls, summaries and serialized saves.
- `public/dx-workflow.css`: scoped DX layout and responsive styling, grey/blue grouped table, warning fields, footer and local Inter font.
- `public/assets/dx-icons/`: Lucide outline assets from the existing installed package.
- `public/app.js`: DX render/save hooks, initial metadata, matching requirements applied to the existing ranking algorithm, explicit decorative family alias, inverter-family restriction, zero preservation, and additional Excel header/settings payload.
- `public/index.html`: DX assets loaded alongside existing modules.
- `server.js`: permanent unique selection-number reservations, DX PDF endpoint, consultant/contractor and match mappings, Excel equipment family aliases, and boolean cell serialization.
- `test/dx-workflow.test.js`: numbering concurrency/stability, append conflicts, matching, zero preservation and Excel boolean tests.

## Persistence and migration

No SQL schema migration is required. Existing project JSON gains `selectionNumber` and a `dx` object containing progress, review state, selected upload IDs, extraction timestamp/errors/warnings and matching settings. Consultant/contractor use existing `details` storage. Older workflows are adapted on opening and retain their rows, uploads, locks and existing proposals. Their initial matching settings preserve the former browser behavior of considering all three loads; new workflows start with only TKw enabled.

Selection numbers are reserved on the server and ignore client-supplied numbering. Local mode uses exclusive file creation under `data/dx-numbering/`. Supabase mode uses unique inserts in the existing key/value table under `dx-numbering:` keys, relying on its existing unique `key` constraint. Reservations survive workflow deletion and must be included in backups. Concurrent requests for the same workflow resolve to the same permanent binding. Gaps are possible after races/interrupted creation and are intentionally never reused. Older records without numbers receive a permanent reservation on opening/saving.

## Reused functions

`configureDxWorkflow`, `workflowCustomerNames`, `workflowProjectsForCustomer`, `applyWorkflowCustomer`, `applyWorkflowProject`, `workflowUploadFileForNode`, existing authenticated project/upload APIs, `scanThermal`, `applyExtractionReviewCells`, `normalizeDxThermalRows`, `clearTableCellReview`, `buildDxSchedule`, `chooseDxProposal`, `applyDxProposal`, `downloadTable`, `dxScheduleTableHeader`, `dxScheduleTableColgroup`, and `generateDxSelectionWorkbook`.

The server's extraction prompts, normalization, verification and targeted retries were not rewritten. DX calls extraction with `previewOnly: true` to prevent the extraction endpoint from replacing stored rows before the client can safely merge append results, then saves merged rows through the normal project API.

## New functions

Principal additions are `renderDxWorkspace`, `dxStepOne`, `dxStepTwo`, `dxMountTable`, `dxSave`, `dxAction`, `dxUpload`, `dxExtract`, `dxMergeRows`, `dxPreview`, `dxValidateTypes`, `dxApplyCatalogItem`, `createDxNumbering` and `dxExcelType`. Other DX helpers construct controls, display statuses and debounce edits.

## Engineering workbook findings

The supplied reference's Selection Sheet uses TKw as an unconditional baseline. F9/G9 toggle the optional sensible/airflow lookups. E10:G10 feed DX-Data thresholds divided by `(1 - variation)`. The browser applies the equivalent requirement multiplier to its existing capacity/quantity comparisons. It retains its existing candidate ranking, quantity estimation and compact-unit preference. It does not emulate Excel's approximate VLOOKUP/index ranking. Explicit ducted inverter requests restrict browser candidates to inverter equipment.

Export maps project/client to C4/C5, consultant/contractor to C6/C7, boolean checks to F9/G9, and percentage fractions to E10:G10. Family labels Wall Mounted/Split map to DECORATIVE, packaged labels to PACKAGED, and ducted inverter to DUCTED-INV. Unknown types are flagged for review, retaining the historical browser fallback rather than silently presenting it as verified.

The existing template export retains Data, DX-Data, styles, validations, grouped headers and engineering formulas. As before, chosen model and quantity are written to AN/AO, feeding H/I. Excel recalculates dependent technical specifications from its own catalog formulas; arbitrary browser technical overrides are persisted on screen but are not a new permanent Excel formula override mechanism. Native Excel recalculation and cached-value behavior require an Excel acceptance check.

## Verification

- Five focused DX tests pass, including 30 simultaneous number allocations and concurrent requests for the same workflow.
- Existing costing export tests and handwritten extraction UI tests pass (12 tests total with DX tests).
- Isolated headless Edge workflow checks use a temporary server/data directory and real authenticated APIs for saving, four uploads, Excel and PDF. AI responses alone are controlled test fixtures, not production mock responses.
- Confirmed extraction request contains exactly two checked upload IDs and does not mutate persisted rows prematurely.
- Confirmed manual numeric correction clears a review flag, append skips exact duplicates, and corrections/manual quantities survive append and save/reopen.
- Confirmed step navigation, default matching settings, legacy DX loading, preview navigation, search, and VRV canvas navigation.
- Reviewed screenshots of both steps. No browser errors; no whole-page overflow at 1440, 1680 and 1920px desktop widths. The technical table scrolls inside its own container.
- Inspected generated XLSX XML: header fields and all three variation inputs are correct; F9/G9 are actual boolean cells; Data, DX-Data and styles are unchanged byte-for-byte; H17 remains a formula.
- Downloaded six-column thermal Excel, engineering template Excel and real-data PDF. Rendered and visually checked the PDF.

## Deployment and remaining acceptance checks

Restart the existing Node server and hard-refresh the browser to load the backend changes and updated app assets. Existing pdfkit and font/icon assets are used; no dependency installation is required. Back up projects together with numbering reservations. Supabase needs its existing unique key constraint and insert permission for reservation records.

Live OpenAI accuracy/API behavior was not exercised with the user's real thermal documents. The existing server-side OPENAI_API_KEY requirement remains. Supabase reservation integration is implemented but was not tested against a live Supabase account. Native Microsoft Excel open/recalculation was not automated. Other ERP modules were not exhaustively retested; targeted costing/extraction tests and VRV navigation passed. These checks remain necessary before calling the change production-accepted.
