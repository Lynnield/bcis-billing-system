# User Manual

BCIS Subscription Billing and Collection System — deliverable D4. How to use
the desktop application day to day. Menus you do not see are outside your
role's permissions; ask the Owner if you need one.

## 1. Signing in

1. Start **BCIS Billing**.
2. **First time on this PC only:** below the sign-in button, check
   *Server: …*. If it does not show the office server, click **Change**,
   enter `http://<server-address>:3000` (ask IT), and click **Test & Save**.
   The address is checked before it is saved and remembered on this PC.
3. Enter your username (or email) and password, then **Sign in**.
4. After 5 wrong passwords in a row the account locks for 15 minutes. The
   Owner can unlock it sooner (*Administration → Users → unlock icon*).
5. After 15 minutes without activity the screen locks; enter your password
   to continue. Use the door icon (top right) to sign out.

**Find anything quickly:** the search box at the top of every screen
(Ctrl+K) finds a subscriber by account number, name, phone, address,
invoice number, receipt number or GCash reference.

## 2. Roles

| Role | Main tasks |
|---|---|
| Owner / Super Admin | Everything, including users, permissions, audit log and backup/restore |
| Administrator | Subscribers, plans, service accounts, billing, collections, reports |
| Cashier | Find subscribers, receive payments, print receipts, record GCash submissions |
| Collection Supervisor | Collectors, areas & routes, batches, remittance, settings |
| Accounting / Auditor | GCash verification, reversals, voids, adjustments, reports, audit log |
| Technician | Service accounts, suspension and reconnection work |
| Read-only Viewer | Dashboard and reports only |

The Owner can change exactly what each role may do in *Administration →
Roles & Permissions*. The server enforces these rules on every action;
hiding a menu item is never the safeguard.

## 3. Subscribers and services

**New subscriber:** *Subscribers → New Subscriber*. Fill in the account
number, name, contact details, address and any notes; required fields are
marked *. Subscribers are never deleted — set them to inactive instead.

**Subscriber profile:** *Subscribers → All Subscribers* → eye icon. Tabs:
Overview, Services, Billing, Payments, Ledger (with Statement of Account),
Collection, Service History, Documents (uploaded proofs) and Audit.

**Add a service:** profile → *Services* → **Add Service** (or *Subscribers →
Service Accounts → New*). Choose the plan, enter a service number, and
optionally an installation address (if different), a billing start date, a
due day (1–28) and an account-specific rate. Leave the rate blank to bill
the plan price.

**Plans:** *Services* → a service → plans. Each plan has a code, monthly
price, installation fee, reconnection fee and speed and/or channel count.
Changing a price affects only invoices generated afterwards.

## 4. Billing

**Monthly billing run:** *Billing → Generate Billing*.
1. Add the billing period if it does not exist (label, start, end, due date).
2. Click **Generate** on the period. The window shows how many active
   accounts are not yet billed.
3. Optionally tick **Create as drafts** to review before billing.
4. Click **Generate N Invoice(s)**. Running it again never creates
   duplicates — already-billed accounts are skipped.

The first invoice for a new account includes the plan's installation fee;
a completed reconnection's fee is added to the next invoice.

**Current Billing** lists the invoices of the current period; **Invoices**
lists all with search and status filter. Open an invoice to:
- **Finalize** a draft (it then counts as billed);
- **Adjust** — a credit (e.g. outage) or debit (extra charge) with a reason;
- **Void** — with a reason; only possible when no posted payment is applied
  (reverse those payments first);
- **Print** the invoice.

Statuses: Draft, Unpaid, Partially Paid, Paid, Overdue, Void, Credited.
Invoices become Overdue automatically after their due date; **Mark
Overdue** runs that check immediately.

## 5. Receiving a payment (cashier)

*Payments → Receive Payment*:
1. **Find account** — type the account number, name, phone, invoice or
   receipt number; click the account.
2. **Balance** — the outstanding and overdue amounts are shown, and the
   amount is pre-filled with the full balance.
3. **Payment** — enter the amount and method (Cash, GCash, Bank Transfer,
   Cheque, Other). For non-cash methods, add the reference and attach the
   proof file (PNG, JPEG, WEBP or PDF up to 5 MB).
4. **Allocation preview** — shows which invoices the money will pay, oldest
   first, and the balance afterwards. Any excess is kept as advance credit.
5. **Post Payment** — the system assigns the official receipt number
   (OR-…). Click **Print Receipt**, then **Next Payment**.

A posted payment is never edited or deleted. If it was wrong, an authorized
user opens it (*Payment History*) and clicks **Reverse** with a reason; the
invoices' balances are restored and both records stay visible.

## 6. GCash verification

1. The cashier records a GCash payment in *Receive Payment* with method
   **GCash**, the 13-digit reference from the customer's screenshot, and the
   screenshot file. It is held as **pending** — nothing is applied yet.
   A reference already used is refused.
2. A reviewer (Accounting/Owner/Admin) opens *Payments → GCash
   Verification*. The left pane lists pending submissions; the right pane
   shows the screenshot, amount, reference and account. A warning appears if
   the same image was uploaded before.
3. Check the payment in the GCash business account, then **Verify & Post**
   (allocates it) or **Reject** with a reason. You cannot review a
   submission you entered yourself.

## 7. Ledger and Statement of Account

Profile → *Ledger*, or *Service Accounts* → an account. The ledger lists
every charge, payment, adjustment, reversal and void in date order with a
running balance. Click **Statement of Account**, choose **From**/**To**
dates, and **Print Statement**: it shows the opening balance, the period's
activity and the closing balance. *Reports* can export it as PDF/XLSX.

## 8. House-to-house collection

**Set-up:** *Collections → Areas & Routes* and *Collectors*. Assign each
service account to an area and collector. A collector's **route sheet**
(Collectors → route icon) lists account, address, current bill, arrears and
total due, ready to print.

**Batch lifecycle:**
1. *Collection Batches → New Batch* — the collector's route and amounts due
   are captured at this moment (expected receivable).
2. **Add Payment** for each collection recorded (status becomes *In
   Progress*).
3. **Submit Batch** when the collector returns; no more collections can be
   added.
4. **Record Remittance** — enter the cash actually handed over. Only cash is
   compared; GCash and other non-cash collections are shown separately.
   Any shortage or overage is calculated and kept.
5. **Reconcile** — if there is a difference you must tick the
   acknowledgement and write an explanation. It is never reset to balanced.
6. **Close Batch** (Supervisor/Admin/Owner) — the final sign-off.

*Remittance* lists batches waiting for their cash.

## 9. Receivables and overdue monitoring

*Receivables*: **Outstanding** and **Overdue** invoice lists (filter by
aging bucket), **Aging** totals (Current, 1–30, 31–60, 61–90, 90+ days — they
add up to the outstanding total) and **Suspension Candidates**. The
dashboard shows overdue alerts and AR aging at a glance.

## 10. Suspension and reconnection

Open the service account:
- **Suspend Account** — enter the reason and notes; your name and the date
  are recorded.
- **Reconnect Account** — allowed only when no overdue balance remains
  (collect payment first). The fee defaults to the plan's reconnection fee.
  Assign a technician and **Request Reconnection**; the account stays
  suspended until the technician (or office) clicks **Mark Completed**. Tick
  *Reconnected now* when no field visit is needed. The Owner/Admin may
  override an unpaid balance with a reason; this is audited.

Every change appears under *Service History*. Grace period and suspension
threshold are set in *Administration → Settings*.

## 11. Reports

*Reports*. **Management reports**: collection summary (daily, weekly,
monthly, annual, by method), billing vs collection, revenue by plan/service/
area, subscriber master list, collector assignments, remittance, reversals/
voids/adjustments, voided receipts, user activity and audit trail. Set the
parameters, **Run** to view, or **Export PDF/XLSX**. **Statements &
summaries**: dashboard summary, collection report, AR report, aging,
collector performance, ledger and Statement of Account.

## 12. Administration (Owner)

- **Users** — create users, assign roles, reset passwords, unlock, deactivate.
- **Roles & Permissions** — tick which roles hold each permission; **Save**.
- **Audit Log** — every recorded change with filters; click a row for the
  old/new values. Audit records cannot be edited.
- **Settings** — grace period and suspension threshold.
- **Backup & Restore** — **Create Backup** (database plus uploaded proofs),
  **Verify** (re-checks the dump and every proof file), **Restore**
  (replaces the live data; requires confirmation — anything entered after
  the backup is lost).

## 13. Troubleshooting

| Symptom | What to do |
|---|---|
| "Could not reach the BCIS server" at sign-in | Check the network cable/Wi-Fi and the *Server* address on the sign-in screen; ask IT whether the server PC is on. |
| "Too many failed sign-in attempts" | Wait 15 minutes or ask the Owner to unlock your account. |
| A menu item is missing | Your role does not have that permission — ask the Owner. |
| "An invoice already exists for this service account and billing period" | It is already billed for that period (duplicate protection). |
| "Duplicate receipt number or GCash reference" | That GCash reference was already submitted — look it up with the search box. |
| Cannot void an invoice | A posted payment is applied to it; reverse the payment first. |
| Cannot reconnect | An overdue balance remains; receive the payment first. |
| Wrong payment posted | Never edit it — use **Reverse** with a reason. |
| Batch will not reconcile | There is a shortage/overage: tick the acknowledgement and write the explanation. |
| Screen locked | Normal after 15 minutes idle; enter your password. |
