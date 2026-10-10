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
| `08-generic-proof-attachment-field.png` | Record Payment form — "Proof Attachment Path" field with a "Browse…" button now available for every payment method (previously GCash-only). |
| `09-native-file-picker.png` | The real native Windows file picker opened by "Browse…", filtered to common proof file types. |
