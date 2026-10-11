# UI Evidence Screenshots

Real screenshots of the packaged/dev desktop app, captured live during the UI
sweep referenced in `tests/acceptance-test-report.md` ("E2E/manual desktop
evidence"). Taken with the Windows click+screenshot technique documented in
`.claude/skills/verify-desktop-ui/SKILL.md`.

| File | Shows |
|---|---|
| `01-dashboard.png` | Dashboard with live KPIs (active subscribers, AR aging, payment method mix) after login. |
| `02-gcash-verify-success.png` | GCash Verification detail after confirming "Verify Payment" — status flips to `posted`/`verified`, unapplied amount settles to ₱0.00. |
| `03-gcash-reject-success.png` | GCash Verification detail after confirming "Reject Payment" by a different user than the submitter — status `rejected`, reason recorded, self-review correctly blocked for the submitter. |
| `04-collection-batch-created.png` | Collections → new batch created for a collector, status `open`. |
| `05-collection-batch-add-payment.png` | A posted cash payment added to the batch; Expected total updates. |
| `06-collection-batch-shortage-detected.png` | Record Remittance with an intentional ₱99.00 shortage — shortage/overage math and the "must be reviewed" warning are never hidden. |
| `07-collection-batch-reconciled-closed.png` | Batch reconciled and closed after the shortage was recorded. |
| `08-generic-proof-attachment-field.png` | *Superseded by 15:* Record Payment form — "Proof Attachment Path" field with a "Browse…" button now available for every payment method (previously GCash-only). |
| `09-native-file-picker.png` | *Superseded by 15:* The real native Windows file picker opened by "Browse…", filtered to common proof file types. |
| `10-dashboard-kpis-billing-vs-collection.png` | Spec 4.3 dashboard: KPI tiles and the billing-vs-collection chart (seeded data). |
| `11-dashboard-aging-overdue-alerts.png` | Dashboard AR aging and overdue alerts panels. |
| `12-global-search.png` | Global search (Ctrl+K) matching account, invoice, receipt and GCash reference. |
| `13-subscriber-profile-tabs.png` | Subscriber profile with its 9 tabs (Overview…Audit). |
| `14-subscriber-ledger-tab.png` | Ledger tab: charges, payments, reversals with running balance. |
| `15-receive-payment-allocation-preview.png` | Receive Payment: balance, uploaded proof and server-computed oldest-first allocation preview (replaces the old file-path field of 08/09). |
| `16-receive-payment-posted-receipt.png` | Payment posted with the server-assigned OR receipt number. |
| `17-gcash-two-pane-queue.png` | GCash verification queue: pending list and proof viewer side by side. |
| `18-batch-reconciliation-shortage.png` | AT-08 evidence: batch with a shortage that cannot be reconciled without acknowledgement. |
| `19-receivables-aging.png` | Receivables aging buckets summing to the outstanding total. |
| `20-management-report-billing-vs-collection.png` | Management report (billing vs collection) run in-app before export. |
| `21-roles-and-permissions.png` | Owner-editable role × permission matrix. |
| `22-service-account-plan-fields.png` | Service account form: plan, installation address, start date, due day, account rate. |
| `23-login-server-address.png` | Login screen with the per-PC server-address setting. |

Screenshots 10–23 were taken live against a freshly migrated and seeded
database (`npm run db:migrate && npm run db:seed`). Automated end-to-end
coverage of the same flows: `desktop/e2e/workflows.e2e.ts` (`npm run e2e`).
