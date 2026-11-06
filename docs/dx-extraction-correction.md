# DX thermal extraction correction

The three supplied PNG screenshots contain 26, 31 and 12 equipment rows (69 total). The Type child column contains FCU, while the separate System column contains Chilled Water. Seven equipment rows have a merged Location cell containing both LR and Storage lines. The supplied export incorrectly substituted System for Type and shifted Occupant Density into TKw on continuation screenshots.

## Changes

- Original DX uploads retain their pixels; the prior JPEG/downsize optimization remains available to VRV.
- Node detects table rules, and two independent vision layout reads lock the column indices and source-page order. A third reading resolves disagreements; unresolved layout disagreement stops extraction.
- The six relevant source columns are cropped from the real PNG pixels. Irrelevant System, area, occupancy and DCV columns are physically absent from subsequent row-reading images.
- Equipment rows are grouped into small bands at actual full-row boundaries. Tall merged cells stay together. Source-row labels provide stable identity even when FCU references repeat.
- Each band has two independent reads; disagreements receive a third read. A two-read agreement can correct the first pass. Unresolved values remain flagged. Missing/duplicate source-row IDs stop extraction rather than shifting values silently.
- Rows carry upload ID, filename and source-row provenance. Continuation-only append requests can reuse the previously saved header image as context without extracting it again.
- Location uses a multiline editor. Export File Excel preserves line breaks, wraps text and increases the affected row heights.
- Append conflicts use reference AND location; a repeated FCU reference in another room is not a duplicate. Reappending the same source row preserves manual corrections.
- Literal FCU/AHU/FAHU types are preserved as source data; DX compatibility is reported separately from OCR uncertainty. Equipment selection formulas are not rewritten.
- The legacy PDF/non-grid path keeps its existing extraction services, with clearer Type/merged-location instructions, safer named-column mapping and stricter repeated-reference identity matching.

## Verification

`test/fixtures/dx-thermal/` contains the three original PNGs and manually reviewed expected rows for reproducible tests. These are fixtures only; production uses the uploaded image pixels and real vision responses.

Tests verify the actual image grid/row geometry, all 69 output rows under controlled vision responses, full merged text, source order with shuffled uploads, correction of injected Type/numeric errors, ambiguity flags, missing-row rejection, repeated-reference append behavior, saved-header context, and failure on conflicting header layouts. Independent API responses are mocked in these regression tests. No fixture values are used by production code.

Browser verification on an isolated server checked 69 literal FCU rows, multiline editing/persistence, Excel download, the existing upload/append/save/reopen workflow, and VRV navigation. Exported XLSX XML was checked for complete multiline text, wrapping and increased row heights.

## Environment and limits

Restart the Node server and refresh the browser to use the changes. PNG processing uses the already installed PDFKit PNG decoder and built-in Node/zlib, with no Python service or new package installation. The same environment's configured server-side OPENAI_API_KEY is required for vision requests.

This workspace has no OPENAI_API_KEY configured, so a live OpenAI pass over these screenshots could not be run. Source geometry, deterministic validation and browser behavior were verified, but live model accuracy is not certified. AI transcription cannot be guaranteed perfect; unresolved cells remain subject to review.

The new geometric extraction path handles ruled PNG thermal tables. PDFs, JPEGs and unruled images continue through the legacy extraction path. It does not silently guess a new column layout when continuation grids do not match. Saved bad extractions are not automatically overwritten; rerun extraction after restarting the server.
