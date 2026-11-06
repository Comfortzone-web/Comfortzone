# DX draft saving, numbering and table presentation

## Presentation

Table inputs and multiline locations display centered text without inset borders or grey disabled fills. Editable fields reveal a box on focus; computed proposed fields remain disabled. Warning backgrounds are retained. Match/Variation sits in the center of the schedule heading, with Lock Table, Clear Table and Add Row at the right. Narrow layouts wrap this heading while keeping the controls available.

## Saving

New DX workflows begin as unsaved drafts. A nonblank Project Name or any entered Specified value enables autosave in either step. Blank starter rows, step navigation, and client/consultant/contractor/selection-number edits alone do not enable saving. Once enabled, autosave remains active for that selection. Existing saved workflows continue autosaving. Save Draft has been removed; status appears only in the footer. Each step's options menu is beside New Workflow in the top-right header.

Uploads need an internal project record for authenticated storage. Before activation, those records remain hidden from My WorkFlows, do not commit a selection number, and do not enable general autosave. Upload/extraction bookkeeping uses that hidden record. Actual selection saving begins only through the requested triggers.

## Numbering

Number format is DX-YYYY-NNN using the current year in Asia/Dubai. The header is editable and shared by both steps. Unsaved drafts show a preview; previews do not consume a number. On first actual save the server allocates the next number unless the user explicitly edited it. For example, saving DX-2026-050 makes the next preview DX-2026-051. Existing selection edits update the numbering cursor; previously claimed numbers remain reserved to avoid duplicates. Duplicate manual numbers and malformed formats are rejected.

The registry uses compare-and-swap revisions. Local mode publishes committed immutable snapshots under data/dx-numbering/registry-v2 while protecting writes with a local mutex. Supabase mode uses its existing unique app_data key plus revision-checked updates of dx-numbering:registry-v2. No database schema migration or new dependency is needed. Backups should retain the numbering registry with project records.

Legacy DX-NNNN numbers are converted to year-prefixed bindings when the new registry is initialized from existing projects, preserving internal project IDs and records. Reopening uses the permanent registry binding. The sequence is based on the saved numbering cursor and skips numbers already owned by another selection.

## Verification

19 targeted tests passed for concurrency, stable numbering, editable suffixes, duplicate rejection, legacy bindings, workbook selection, manual rows and existing costing/extraction behavior.

An isolated browser test verified unsaved manual drafting, both autosave triggers, subsequent autosave, shared editable numbers, 050 -> 051 continuation, centered heading controls, and transparent centered computed cells. No browser errors occurred. The Supabase CAS path is implemented but was not tested against a live account.

Restart the Node server and refresh the browser to load the numbering/save updates and new assets.
