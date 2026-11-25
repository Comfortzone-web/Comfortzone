# VRV Workflow: Complete Guide

This guide describes the current **Workflow > VRV Workflow** canvas in the app. It is distinct from the Sales Desk costing and quotation pages and from the separate DX Workflow.

## At a glance

1. Create or open a VRV workflow.
2. Enter the project and client details.
3. Upload a thermal sheet, use **Open Chat** to extract its values, and review the **Export File** table.
4. Upload a VRV Selection Report, then review the generated **VRV Schedule** and material-based **BOQ/Price** table.
5. Correct extracted values, verify model matches and prices, save, and export the tables you need.

The thermal and VRV report inputs are separate. You can upload either first, but the best schedule results require both: the report supplies equipment/system rows, while the thermal table supplies load and location values to match against those rows.

## 1. Start and navigate

Open **Workflow > VRV Workflow**. Use **New Workflow** to start a fresh canvas or **My WorkFlows** to reopen a saved one. The **-**, **Fit**, and **+** controls change the canvas zoom; they do not change project data. Nodes can be moved and tables resized on the canvas.

The workflow is saved as a project. A source-file upload makes it visible in the workflow list. Changes to details and tables are saved to the project as you work; allow a save to finish before closing or switching projects.

## 2. Project / Client Details

Fill in **Customer**, **Contact Person**, **Tel. No**, **Email**, **Project**, **Date**, **Location**, **Model**, and **Prepared By**. Customer and Project provide searchable suggestions from existing records. Model defaults to **Daikin**, and Prepared By defaults to the signed-in user's name when available.

Check the customer and project carefully. If no project is entered, uploading a VRV report may derive a project name from the report or its filename. These fields identify the workflow and are also used in exports.

## 3. Thermal Sheet and Export File

Click the **Thermal Sheet** upload area to choose a source file. The file picker accepts PDF, DOC/DOCX, XLS/XLSX, PNG, and JPG/JPEG. Then click **Open Chat**. The assistant asks what to extract. For the standard VRV Export File format, request the VRV export template; you can also request specific columns or append further screenshot parts. Review the extracted values in the **Export File** table rather than assuming the scan is exact.

Typical visible Export File columns include **Indoor**, **Room**, **Mode**, **Family or Model**, **Cooling DBT**, and **Cooling WB**; the table has additional columns accessible by scrolling within it. The exact extraction depends on the uploaded source and the requested template/columns. If a value is wrong, edit its table cell, use chat to recheck, or upload a clearer page/screenshot. Additional pages can be appended rather than replacing earlier rows when requested. The node menu provides **Download Excel**, **Regenerate**, and other table actions.

Editing the thermal table triggers a rebuild of the VRV schedule's thermal lookups. In particular, names/locations and load values should be checked before relying on the schedule.

## 4. VRV Selection Report and Build Tables

Click the **VRV Selection Report** upload area. The picker accepts the same file extensions, but **automatic structured VRV extraction currently works for DOCX (and XML content)**. A PDF or image may upload successfully without producing material or schedule rows; it needs a supported conversion/OCR path. Large VRV files are uploaded in chunks by the app.

After upload, the app calls the VRV extraction service automatically. **Build Tables** reruns extraction for the uploaded report; without an upload it regenerates from already extracted data, if present. The report parser looks for a project name, material rows (models and quantities), and VRV system/selection rows. If extraction finds no usable rows, the corresponding tables remain empty. Check the on-screen message and use a readable DOCX report rather than assuming an empty table means zero equipment.

## 5. BOQ/Price

When material rows are found, the workflow builds costing from each model and quantity, looks up matching models in the Sales Desk Price List, and derives the **BOQ/Price** rows. The BOQ shows item number, description, quantity, and unit (normally **Nos**). A recognized model can supply its description and origin; an unmatched model keeps its model text and may have no price.

The workflow's internal costing calculation currently starts from the matched final price, applies its stored price-increase percentage (default **20%**), multiplies by quantity, and totals the amounts. The BOQ summary uses that total, adds **5% VAT**, and displays the net amount. Verify prices and totals against the intended quotation before issuing anything: this workflow calculation is not the same screen as the current Sales Desk Costing Sheet.

BOQ cells can be edited unless the node is locked. The node menu offers Excel download and regeneration. Regeneration can replace manual table edits, so export or verify first.

## 6. VRV Schedule

The report's VRV rows are grouped by system. The schedule combines report values with thermal-table matches and indoor/outdoor model lookup data. It inserts a system total and a separator between systems. Visible columns begin with **System**, **Name**, **Location**, **Rq TC**, **Rq SC**, **Air Flow Rate**, **FCU**, **Nominal Index**, **Country of Origin**, **Type**, and more equipment/performance columns to the right.

Review each system's model, quantity, room/name, required cooling and airflow, matched indoor/outdoor specifications, and totals. Missing or mismatched source values can leave lookup-derived cells blank or incorrect. Editable schedule cells save back to the workflow and refresh lookup/total values; generated total/separator rows are not ordinary editable items.

Use the schedule node's **Download Excel** action to produce the VRV Schedule workbook from the current rows. Its menu also includes **Regenerate**. Regenerate after correcting the source data, then recheck any manual edits.

## 7. Review, save, and export checklist

- Confirm the correct customer, project, date, and prepared-by name.
- Confirm the thermal extraction covers every required room and that units/columns are correct.
- Confirm the VRV report is a readable DOCX and that every expected system/model/material row appeared.
- Reconcile BOQ quantities and model names with the original report; check missing Price List matches.
- Check schedule system totals, thermal matches, indoor/outdoor values, and blank cells.
- Use each table node's **Download Excel** option for its output; use upload-node **Download File** to retrieve an uploaded source.
- Let the project save complete, then reopen it from **My WorkFlows** to confirm the final state.

## Common issues

| Symptom | Check |
| --- | --- |
| Uploaded report but no generated rows | Automatic VRV parsing supports DOCX/XML content; PDF/image upload alone is not structured extraction. Check the extraction message and source readability. |
| Wrong or missing thermal values in the schedule | Correct the Export File table and check names/locations used for matching; regenerate and review again. |
| BOQ item has no price | Check whether its model matches a Sales Desk Price List model exactly enough for lookup. |
| Manual edits disappear | Regenerate/re-extract rebuilds generated tables from source data. Review the source and export before regenerating. |
| Workflow not in My WorkFlows | Ensure a source file was uploaded and the project save finished. |

This guide reflects the current implementation, including its extraction and pricing limitations. It does not imply that uploaded files or AI-extracted values are independently verified.
