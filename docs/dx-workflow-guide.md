# DX Workflow: Thermal Sheet to DX Schedule

This guide describes the DX Workflow currently implemented in the app. It covers what a user does on the canvas, what the app fills automatically, what must be checked manually, and what each Excel download contains.

## At a glance

```text
DX Workflow / New Workflow
  -> Project / Client Details
  -> Thermal Sheet upload
  -> Open Chat -> Extract Table
  -> Review and correct Export File
  -> Review and correct DX Schedule
  -> Download Export File.xlsx and/or DX Schedule.xlsx
```

DX does **not** use the VRV Selection Report, Costing Sheet, BOQ, or Quotation nodes that appear in the VRV workflow. The DX canvas consists of Project / Client Details, Thermal Sheet, Export File, and DX Schedule. A new workflow starts with empty tables.

## 1. Start a DX workflow

1. Open **Workflow > DX Workflow** in the left navigation. Use **New Workflow** to start a fresh DX canvas when needed.
2. In **Project / Client Details**, select an existing **Customer** from the customer database. The app fills its contact person, phone, and email when those values are available. An unmatched customer name is cleared on validation; select a listed customer.
3. Select or enter the **Project**. Selecting a matching saved project can fill its location and customer. The other fields are **Date**, **Location**, **Model**, and **Prepared By**. Model defaults to **Daikin** and Prepared By defaults to the logged-in user's name; review both.
4. The project/customer name becomes the workflow title. A draft canvas is created first; the workflow becomes a normal saved/visible workflow after a source upload (or an explicit save). You can reopen saved workflows from **My WorkFlows**.

These details identify the job. They do not calculate the thermal load or choose a DX unit.

## 2. Upload the Thermal Sheet

There are two ways to add the source:

- Click the upload area in the **Thermal Sheet** node and choose a file. Its file picker accepts PDF, Word, Excel, and image formats, but the AI extraction path is intended for a thermal-sheet PDF or clear screenshots; for best results use PDF, PNG, or JPG.
- Click **Open Chat** in that node and use the chat's file picker. It accepts multiple PDF, PNG, JPG, or JPEG files. This is useful when the thermal table spans several screenshots or pages.

The first file is associated with the Thermal Sheet node. Additional chat files are retained as supporting screenshots. The node menu offers **Preview File**, **Download File**, and **Delete Uploaded File** when a file is present.

**Important:** Uploading a Thermal Sheet alone does not fill the Export File or DX Schedule. Run extraction next.

## 3. Extract the DX thermal values

1. Click **Open Chat** on the Thermal Sheet node.
2. The assistant asks what to extract. In DX mode, the default target is exactly **Unit Ref, Type, Location, TKw, SKw, L/S**. The chat also states that rows missing the three load values are skipped.
3. Click **Extract Table**, or respond in chat with a request for the default DX extraction. The app sends the selected uploads to the server's vision extraction endpoint. The server requires a configured `OPENAI_API_KEY` for this step.
4. Wait for the result. If the file has multiple screenshots, the server first attempts a combined read and can fall back to reading them individually. It may retry uncertain cells and mark them for review rather than silently treating them as certain.
5. Read the chat response. If it reports unclear fields or no rows, upload a clearer, higher-resolution or zoomed screenshot and ask to **verify again**. For a continuation page, ask to **continue** or **add below** to append extracted rows instead of replacing the table. Check for duplicate rows after appending.

The DX column mapping is:

| Export File column | Meaning in the thermal sheet |
| --- | --- |
| Unit Ref | Unit/reference number, such as Units Reference / No. or Ref |
| Type | AC System and Type's Type column |
| Location | Room, area, zone, or location |
| TKw | Calculated AC Load: Total kW |
| SKw | Calculated AC Load: Sensible kW |
| L/S | Calculated AC Load: Flow Rate L/s |

The extractor is instructed to read the three adjacent **Calculated AC Load** columns as a group, not to mistake area, occupancy, outdoor air, or occupant-density numbers for the load values. It ignores floor headings, totals, blank lines, notes, and outdoor rows. The client also normalizes alternate column names and keeps only rows with a Unit Ref or Location **and** nonblank TKw, SKw, and L/S. A visible zero is still a value; a blank is not.

Extraction is an aid, not engineering approval. Compare every row and unit against the original Thermal Sheet, especially cells marked for review. Poor scans can omit or misread rows.

## 4. Check the Export File

The **Export File** node is an editable six-column preview of the extracted thermal data. Verify:

1. All expected unit references are present, in the right order, with no duplicates after multi-file extraction.
2. Type and Location belong to the same unit as the three load values.
3. TKw, SKw, and L/S are transcribed from the correct thermal-sheet columns and retain their intended units and decimal values.
4. Any highlighted/flagged cell is checked against the source. Editing a cell clears that cell's review flag.

Click a cell to edit it; the value is committed when the cell loses focus. Changing an Export File cell rebuilds the DX Schedule from the Export File rows. The node's three-dot menu includes **Download Excel**, **Regenerate**, **Lock/Unlock**, and **Delete**. **Download Excel** saves `Export File.xlsx` with the current six-column table. Regenerate/clear actions can replace or empty data, so use them deliberately.

## 5. Understand the DX Schedule

The **DX Schedule** appears below the Export File and has two groups:

- **SPECIFIED:** Ref, Type, Location, TKw, SKw, L/S. These are copied from the reviewed Export File (`Unit Ref` becomes `Ref`).
- **PROPOSED:** a suggested indoor/outdoor model, quantity, nominal TR, type, refrigerant, temperatures, total/sensible capacity, airflow, speed, power input, COP, ESP, power supply, dimensions, and weights. The table is wide; scroll inside it to inspect the remaining columns.

For each specified row, the app uses a built-in Daikin DX proposal catalog. It interprets Type containing **PACKAGE** or **UATQ** as Packaged Unit, **WALL** or **SPLIT** as Wall Mounted, and other types as Ducted. It compares required TKw, SKw, and L/S with catalog total capacity, sensible capacity, and airflow. It estimates the quantity needed for each candidate and selects from candidates requiring at most two units when available; otherwise it considers the full family. The proposal fields come from the selected catalog entry. If all three requirements are zero or cannot be parsed as numbers, it leaves the proposal blank.

**This is a preliminary catalog match, not a verified equipment selection.** Confirm capacity, airflow, operating conditions, model availability, electrical requirements, dimensions, and all manufacturer data before using the schedule for a customer or purchase decision. The automatic family fallback to Ducted and the two-unit preference are especially worth checking.

Schedule cells are editable while the node is unlocked. Editing a **Specified** cell (Ref, Type, Location, TKw, SKw, or L/S) recalculates that row's proposed fields. Edits to other schedule cells can be made for review/correction, but rebuilding or regenerating the schedule from the Export File may overwrite them. For a durable correction to the six specified values, edit the **Export File first**, then review the regenerated schedule again.

The DX Schedule node menu provides **Download Excel**, **Regenerate**, **Lock/Unlock**, and **Delete**. Regenerate rebuilds it from the current Export File rows. Locking prevents table-cell editing; it does not validate the engineering selection.

## 6. Download the results

- **Export File > three dots > Download Excel** creates `Export File.xlsx` from the displayed thermal rows.
- **DX Schedule > three dots > Download Excel** creates `DX Schedule.xlsx`. This uses the stored DX Selection Sheet Excel template, writes project/customer and the specified rows, writes selected model/quantity into the template, and retains its template formulas/formatting for the proposed schedule. A missing template causes this download to fail.

Download after the last edits have been committed by leaving the active table cell. Open the resulting workbook and check the populated rows and recalculated formulas in Excel, particularly if it is being shared outside the team.

## 7. Saving and resuming

After a source upload, changes to project details and table cells are saved to the workflow project. The app debounces some field saves; allow a moment for saving before closing the page. **My WorkFlows** is the place to reopen a previously saved DX project. An empty new canvas is not the same as a completed, saved DX selection.

## Common issues

| Symptom | What to check |
| --- | --- |
| Thermal Sheet uploaded, but both tables are blank | Open Chat and run **Extract Table**. Upload is not extraction. |
| No rows detected | Use a clearer/zoomed PDF or screenshot showing unit references and all three Calculated AC Load columns; retry. |
| Some rows missing | Rows with blank TKw, SKw, or L/S are filtered out. Check the source and upload the missing page or a clearer crop. |
| Numbers appear under the wrong heading | Compare against the source's Total kW, Sensible kW, Flow Rate L/s group; correct the Export File cells. |
| Proposal looks unsuitable | Check the unit Type and required values; review/adjust the model against engineering and manufacturer data. The catalog match is only a suggestion. |
| Schedule edits disappear | A new extraction, Export File edit, or Regenerate rebuilds the schedule. Correct source values in Export File, then review proposed values last. |
| Extraction says the API key is missing | The server needs `OPENAI_API_KEY`; a workspace administrator must configure it. |
| DX Schedule Excel fails to download | Check that the server has its DX Selection Sheet template and that the workflow is saved. |

## Technical reference

- Canvas controls, extraction chat, editable tables, schedule generation, and downloads: `public/app.js`.
- Workflow persistence, vision extraction, and DX Excel export endpoints: `server.js`.
- DX workbook template expected by the server: `data/dx-selection-template.xlsx`.

The on-screen DX Schedule and the downloaded Excel are related but not identical renderers: the browser fills a proposal from its built-in catalog, while the workbook preserves the template's own formulas. Review **both** outputs before relying on either.
