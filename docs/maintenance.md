# Maintenance module

The office module is at `/maintenance/dashboard` and is available to Admin and MTS login roles below Projects. The technician PWA is at `/field/`. It shares maintenance records with the office module but uses its own one-time access links and server-side assignment checks.

## Setup

- Install dependencies with `pnpm install` (or the project's usual package manager) and start with `pnpm dev`.
- Keep a long, private `SESSION_SECRET` or `FIELD_SESSION_SECRET` in `.env` and production environment settings. Changing it invalidates existing field sessions. The local `.env` is ignored by Git.
- For production, configure the existing `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_TABLE`, and private `SUPABASE_BUCKET`. The maintenance store uses one `maintenance-v1` row in the existing `app_data` table, with compare-and-swap writes. Without Supabase, it uses atomic local `data/maintenance.json`; this is suitable for one persistent server, not ephemeral or multi-instance hosting.
- Serve the PWA over HTTPS in production. Loopback HTTP is accepted by supporting browsers for local development.
- To enable device push, generate a VAPID key pair with `npx web-push generate-vapid-keys` and set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` (a `mailto:` contact). Restart the server. Until configured or subscribed, assignment and review notices stay in the technician inbox and office delivery status remains `Not Subscribed` or `Failed`. The technician must enable alerts on their device. iPhone users need the PWA added to the Home Screen for web push support.
- Handwritten extraction uses the existing `OPENAI_API_KEY` and optional `OPENAI_MODEL`. Without it, the original upload is still retained and technicians can enter the extracted fields manually. Extracted values must be reviewed before submission.

## Office workflow

1. Type a customer name directly when creating an AMC in Maintenance; it is separate from Sales Desk and has no inherited customer dropdown. Planned visits appear in the AMC Schedule tab and PM calendar.
2. Create technicians, then choose a planned visit or create a non-AMC job. A PM assignment requires 2-5 individual technicians and one lead. Drafts remain unpublished; Save & Notify publishes one work order, checks overlaps, creates notification records, and attempts web push.
3. Open a technician record and generate Field Access. Verify the technician using the registered contact details, then share the one-time link privately. It expires after 48 hours if unused. The signed-in Field session lasts 90 days and renews during active use when fewer than 30 days remain. Revoke access from the same record if the device or link is compromised.
4. Assigned technicians can check in and out. Only the lead can submit a digital checklist or upload a handwritten report. Office review can approve, request revision, or reject. Only approval marks the work order and linked AMC visit Completed.
5. Review delivery status in the technician detail panel. Retry failed or unsubscribed notifications after the device has subscribed.

Maintenance uploads are private, limited to 12 MB, and restricted to supported images or PDF documents. Report PDFs can be downloaded by Admin and MTS users. The service worker caches only the field app shell, never authenticated API responses or private files.

Run `pnpm test` for the isolated maintenance API lifecycle test. The supplied workbook named in the original request was not available in this workspace, so no Excel import or column mapping was performed.

For a clean local installation, `node scripts/seed-maintenance-samples.js` adds three clearly labeled sample AMCs, three PM work orders, and three sample technicians. The script is idempotent; rerunning it does not duplicate the sample records.
