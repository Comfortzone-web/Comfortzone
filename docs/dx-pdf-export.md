# DX Schedule PDF export

The export now follows the supplied PDF: landscape Letter (792 x 612 points), the exact two embedded company/dealer logos, and one full-width 30-column engineering table. Specified headers are grey and Proposed headers are blue, with centered compact data, complete technical columns, thin grid lines and multiline locations. Logos, populated details and grouped headings repeat on continuation pages; page numbering is included.

Project, Client, Consultant and Contractor values come from the current workflow. Empty or whitespace-only values omit the entire corresponding label/value row. Data comes from the actual schedule payload, including selected models and quantities; sample/reference rows are not used in production.

The header uses the newly supplied full-resolution PNG logos. At the requested 30% scale, the left company logo fits within 66 x 22.8 points; the right dealer logo fits within 48 x 22.8 points. Both retain their original proportions, align vertically within the same header band, and repeat on every page. Project details start below this band, with spacing adjusted to the smaller logos.

Files: dx-schedule-pdf.js, server.js, public/assets/dx-export-comfort-zone.png, public/assets/dx-export-daikin.png and test/dx-schedule-pdf.test.js. The endpoint remains /api/export/dx-schedule-pdf. It uses the existing PDFKit dependency and requires no new packages or configuration.

Visual verification rendered populated and continuation pages and compared the overall layout with the supplied reference. Automated checks cover landscape size, both logos on every page, grouped headings, pagination without lost rows, multiline locations, actual metadata values and omitted blank labels. An isolated browser test downloaded the PDF through the top-right options menu and confirmed its current Project/Client values while blank Consultant/Contractor were absent.

The related UI changes are also complete: no top save notification or Save Draft button; footer save status remains; Project Name or Specified values start autosave; step-specific three-dot options appear beside New Workflow in both steps. Excel downloads, locking and other existing actions remain connected to their existing handlers.

Restart the Node server to load the new renderer and refresh the browser for the autosave/menu changes.
