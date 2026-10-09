# User Manual

BCIS Subscription Billing and Collection System — D4 deliverable. Written for
office staff operating the desktop client day to day. For setup/installation
see `docs/deployment-guide.md`; for internal design see
`docs/technical-documentation.md`.

## 1. Logging In

1. Launch the BCIS desktop application.
2. Enter your username (or email) and password, then **Sign In**.
3. Your available menu items depend on your role — see §2. If a menu item
   you expect is missing, your account may not have the right role; ask an
   Administrator or the Owner to check **User Management**.
4. **Session lock**: after 15 minutes without mouse/keyboard activity, the
   screen locks automatically. Re-enter your password to continue, or click
   **Not you? Sign out** to switch users. You can also lock manually with
   the lock icon next to your name in the top-right.

## 2. Roles

| Role | Can do |
|---|---|
| Owner / Super Admin | Everything, including User Management and Backup & Restore. |
| Administrator | Subscribers, plans, service accounts, billing, payments, collections, reports. Cannot manage users or run backups. |
| Cashier | Search subscribers, receive payments, view balances, submit/process GCash. |
| Collection Supervisor | Collection areas, collectors, collection batches, remittance, reports. |
| Accounting / Auditor | Reports, GCash verification, reversals review, receivables, audit trail. |
| Technician | Service accounts and suspension/reconnection information (read-focused). |
| Read-only Viewer | Dashboard and reports only — no changes of any kind. |

A hidden menu item never means "the feature doesn't exist" — it means your
role doesn't have it. Every permission check is also enforced by the server,
so even a direct API call from a lower-privileged account is rejected.

## 3. Subscriber Registration

1. **Subscribers → All Subscribers → New Subscriber** (visible to
   Owner/Administrator).
2. Fill in account number, name, contact info, and address. Status starts as
   `pending` unless you set it to `active`.
3. Save. The subscriber now appears in the list and can be searched by
   account number, name, contact number, or address.
4. To add an Internet/Cable/Combo subscription for this subscriber, go to
   **Subscribers → Service Accounts → New** and select a plan. The
   subscriber must be `active` before a service account can be created.
5. Subscriber records are never deleted — to stop billing a subscriber,
   change their status instead (`inactive`/`suspended`/`disconnected`). The
   full status history is kept and visible on the subscriber's profile.

## 4. Billing

1. **Billing & Invoices → Billing Periods**: create a period with a label
   (e.g. "October 2026"), a start/end date, and a due date.
2. **Billing & Invoices → Invoices → New**: pick a service account and a
   billing period. The invoice amount is taken automatically from the
   service account's current plan price — you cannot type a different
   price. You may add extra line items (e.g. a reconnection fee) or
   debit/credit adjustments with a reason.
3. The system will not let you bill the same service account for the same
   billing period twice — if you try, you'll get a clear "already exists"
   message instead of a duplicate invoice.
4. Every invoice posts a debit to that subscriber's ledger immediately; you
   can see it right away under **Service Accounts → (account) → Ledger**.

## 5. Receiving a Payment

1. **Payments → Receive Payment**. Search for the subscriber or service
   account.
2. Enter the amount and method (Cash, GCash, Bank Transfer, Cheque, Other).
3. For Cash/Bank Transfer/Cheque/Other, the payment posts immediately and is
   applied **oldest unpaid invoice first**. If the amount is more than the
   oldest invoice owes, the remainder rolls forward to the next invoice,
   and so on; any amount left over after every open invoice is covered
   stays as an unapplied credit (an advance payment) ready to apply to the
   next invoice generated.
4. For GCash, see §6 — it is held pending until verified.
5. Once posted, click **Print Receipt** to show the clean, navigation-free
   receipt layout and print it.
6. **Correcting a mistake**: a posted payment is never edited or deleted.
   Open the payment and use **Reverse**, enter a reason. The invoice
   balances it affected are recalculated automatically, and the original
   payment stays visible in history with a note showing it was reversed.

## 6. GCash Verification

1. A customer sends proof of a GCash transfer to the company Facebook Page.
2. A Cashier records it: **Payments → Receive Payment**, method GCash,
   enter the GCash reference number (and attach the screenshot if the
   proof-attachment field is available). The payment is created with
   status **pending** — it is *not* applied to any invoice yet.
3. **Payments → GCash Verification** shows the queue of pending
   submissions, each with the reference number and amount. A screenshot
   alone is evidence to review, not proof of payment by itself.
4. An Owner, Administrator, or Accounting/Auditor opens a submission and
   either **Verify** (posts and allocates it, oldest-first, exactly like a
   cash payment) or **Reject** (requires a reason; the payment is cancelled
   and nothing is allocated).
5. The system blocks a duplicate GCash reference number outright — if the
   same reference has already been used on a verified payment, a new
   submission with that reference is rejected by the server.
6. You cannot verify or reject a GCash submission you entered yourself —
   a different authorized user must review it.

## 7. Subscriber Ledger & Statement of Account

- **Service Accounts → (account) → Ledger**: the complete chronological
  debit (invoices) / credit (posted payments) history with a running
  balance, exactly like a bank statement.
- **Service Accounts → (account) → Statement of Account**: pick a date
  range and print a clean Statement of Account for the subscriber.

## 8. House-to-House Collection

1. **Collections → Collection Areas**: define the geographic areas (e.g.
   "Poblacion Area").
2. **Collections → Collectors**: add field collectors and assign each to
   an area.
3. **Collections → Collection Batches → New**: open a batch for a
   collector and a date. Print the **Route Sheet** — it lists every
   assigned account's address, current bill, arrears, and total due, in a
   clean print layout.
4. As the collector returns payments, add each posted Cash/GCash payment to
   the batch.
5. At day's end, **Remit**: enter how much Cash the collector actually
   turned in. The system computes the difference automatically — a
   shortage or overage is shown explicitly and is never silently treated
   as balanced.
6. **Reconcile** to close the batch once the shortage/overage has been
   reviewed and confirmed. A reconciled/closed batch cannot be remitted
   again.

## 9. Receivables & Overdue Monitoring

**Receivables** (Owner/Administrator/Accounting/Cashier) has four views:

- **Outstanding**: every invoice with a balance still owed.
- **Overdue**: invoices past their due date, with subscriber, service,
  area, collector, months unpaid, and total arrears.
- **Aging**: totals bucketed into Current, 1–30, 31–60, 61–90, and 90+ days
  overdue.
- **Suspension Candidates**: accounts that have crossed the configured
  suspension threshold and have not been suspended yet.

Filter any of these by collector, collection area, plan, or service type.

## 10. Suspension and Reconnection

1. Open the delinquent account: **Service Accounts → (account)**.
2. **Suspend**: enter a reason and optional notes. The account status
   changes to `suspended` and a suspension record (reason, effective date,
   approver) is kept permanently, visible in **Suspension History** on
   that account.
3. Once the subscriber has paid, **Reconnect**: enter a reconnection fee
   (if applicable) and assign a technician. The account returns to
   `active`, and a reconnection record (fee, technician, request/
   completion dates) is kept in **Reconnection History**.
4. The configurable grace period and suspension threshold (in days) are set
   by an Owner/Administrator under the collections settings panel on the
   Receivables page.

## 11. Reports

**Reports** lets you pick a report (Daily/Weekly/Monthly/Annual Collection,
Payment-Method Summary, Billing vs Collection, AR Aging, Collector
Performance, Subscriber Master List, Payment Adjustment/Reversal, Audit
Trail, Dashboard summary) and **Export PDF** or **Export XLSX**. The file
save dialog is handled by the desktop app; choose where to save and the
report downloads with the same figures shown on screen.

## 12. Backup & Restore (Owner only)

1. **Administration → Backup & Restore**.
2. **Create Backup** runs a full database dump and records it with a
   checksum.
3. **Verify** re-checks a backup's integrity without touching the live
   database — safe to run any time.
4. **Restore** replaces the live database with a backup's contents. This is
   destructive and requires an explicit confirmation step — use it only
   when you intend to discard everything written after that backup.

## 13. Troubleshooting

| Symptom | What to check |
|---|---|
| "Failed to load..." error on any screen | The API server may be stopped, or you lost network connectivity to it. Confirm with IT that the API/PostgreSQL host is reachable on the LAN. |
| A menu item you need is missing | Your role doesn't include it — ask an Owner/Administrator to check or change your roles under User Management. |
| "An invoice already exists for this service account and billing period" | That account was already billed for that period — this is a deliberate duplicate-billing guard, not a bug. |
| A GCash submission is rejected | Open the reason recorded against it — common causes are a mismatched reference number or an amount that doesn't match the proof. |
| You need to undo a payment | Never try to "edit" it — use **Reverse** with a reason instead; this preserves the audit trail. |
| Session suddenly locked | Normal after 15 minutes idle — re-enter your password, or sign out if it's not you. |
