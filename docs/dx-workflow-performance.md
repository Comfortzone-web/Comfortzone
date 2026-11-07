# DX Workflow responsiveness

New DX workflows render immediately with a stable local ID and editable blank fields. The existing draft endpoint loads server-owned lookup data, price data and selection-number preview in the background. Its response updates metadata only; it never replaces typed details, thermal rows, the active step or the local workflow ID. Actual saving/number reservation continues through the existing project API. No sample pricing is introduced.

Workflow opening requests carry a sequence guard so a slower previous VRV/project response cannot replace a newer DX opening. Existing sidebar/New Workflow behavior is retained.

Step 01/02/03 navigation and schedule regeneration render before waiting for persistence. Saves remain serialized through `dxSaveTail`; pending and failed status remains visible. Uploads, extraction, exports and quotation creation still wait where server persistence is required for correctness.

Thermal upload and extraction show an animated circular status indicator beside **Thermal Sheet Upload**, with accessible labels. Both success and failure paths clear it in `finally`.

Verification: three durable regression checks cover immediate navigation with failed/delayed saves, safe draft hydration, and stale opening responses. In an isolated Edge test with a 2.5-second draft-response delay, DX rendered in 101 ms; Step 02 rendered in 208 ms with delayed PUT responses. Early edits, actual upload, extraction loading states, completion and persisted data were checked. Extraction text was controlled for this UI test; the production extraction path is unchanged. The related 50-check suite passed, and the additional stale-opening regression also passed.
