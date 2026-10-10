# Acceptance Test Report

D5 deliverable. Results for the 12 mandatory acceptance tests (lab spec §7),
plus the required test-evidence summary and bug log (§7.1). All automated
tests run against the isolated `bcis_billing_test` database via
`cd api && npm test` (Vitest + Fastify `inject`, no real HTTP socket) and
`cd desktop && npm test` (Vitest, Node environment). Last full run: 181/181
API tests passing, 58/58 desktop tests passing.

## AT-01 — Exact payment

**Test data**: Invoice ₱999; payment ₱999.
**Expected**: Remaining ₱0; invoice PAID; ledger balanced; receipt created.
**Result: PASS.**
`api/tests/payments.test.ts` → `describe("payment posting") > it("cash payment allocates exact to oldest invoice and marks it paid")`.
Asserts the invoice status becomes `paid`, the full amount is allocated via
`payment_allocations`, and a `receiptNumber` is present on the posted
payment.

## AT-02 — Partial payment

**Test data**: Invoice ₱999; payment ₱500.
**Expected**: Remaining ₱499; PARTIALLY_PAID; allocation and ledger correct.
**Result: PASS.**
`api/tests/payments.test.ts` → `it("partial payment leaves partially_paid")`.
Asserts invoice status `partially_paid` and an allocation row of exactly
₱500.00.

## AT-03 — Advance payment

**Test data**: Monthly ₱1,000; payment ₱3,000.
**Expected**: Allocation/credit follows documented policy without losing
value.
**Result: PASS.**
`api/tests/payments.test.ts` → `it("advance payment preserves unapplied amount")`.
Documented policy: oldest-first allocation consumes every open invoice in
date order; any amount left over after every open invoice is fully paid is
returned as `unappliedAmount` on the payment response rather than being
discarded — it is available to apply the moment the next invoice is
generated for that account (same oldest-first rule then applies it first).
No value is ever lost or silently dropped.

## AT-04 — Oldest-first arrears

**Test data**: August ₱999 + September ₱999; payment ₱1,200.
**Expected**: August ₱0; September ₱798 remaining.
**Result: PASS.**
`api/tests/payments.test.ts` → `it("oldest-first multi-invoice allocation")`
and `it("verification allocates oldest-first across multiple invoices with exact remainder")`
(GCash path). Allocation order is `ORDER BY issue_date ASC, id ASC`
(`allocateToOpenInvoices` in `api/src/routes/payments.ts`), applied
identically whether the payment posts immediately (cash) or on GCash
verification.

## AT-05 — Duplicate GCash reference

**Test data**: Post an already-used verified GCash reference.
**Expected**: System blocks or explicitly warns per documented policy.
**Result: PASS.**
`api/tests/payments.test.ts` → `it("GCash payment records pending verification and rejects duplicate references")`.
Documented policy: `gcash_payment_details.gcash_reference_number` has a
database unique index — a second submission with the same reference is
rejected with `409 Duplicate receipt number or GCash reference` at the
`POST /payments` boundary, before it can ever reach verification.

## AT-06 — Payment reversal

**Test data**: Reverse an incorrectly posted payment.
**Expected**: Original remains visible; linked reversal exists; balances
restore; actor/reason audited.
**Result: PASS.**
`api/tests/payments.test.ts` → `describe("payment reversal") > it("reverses payment, restores invoice state, writes audit row")`.
The original `payments` row is never deleted (status flips to `reversed`);
a `payment_reversals` row links back to it with reason + `reversed_by_user_id`;
affected invoices are recalculated from remaining posted allocations; an
`audit_logs` row with action `payment.reverse` is written in the same
transaction.

## AT-07 — Collector balanced remittance

**Test data**: Cash collected ₱20,000; remitted ₱20,000.
**Expected**: Difference ₱0; batch may reconcile/close.
**Result: PASS.**
`api/tests/collection-batches.test.ts` → `it("balanced remittance")`.

## AT-08 — Collector shortage

**Test data**: Cash collected ₱20,000; remitted ₱19,500.
**Expected**: ₱500 shortage displayed; cannot silently close as balanced.
**Result: PASS.**
`api/tests/collection-batches.test.ts` → `it("shortage")` (and `it("overage")`
for the symmetric case). `shortage_amount`/`overage_amount` are stored
columns, always computed and shown — never coerced to zero.

## AT-09 — Concurrent users

**Test data**: Two/three PCs post/read different valid operations.
**Expected**: No data corruption, duplicate numbering, or unauthorized
cross-session effect.
**Result: PASS.**
Covered per-operation, each exercising real overlapping requests via
`Promise.all`/parallel `app.inject` calls against the same row:
- `api/tests/invoices.test.ts` → `it("concurrent duplicate creation yields exactly one invoice and 409s")`.
- `api/tests/payments.test.ts` → `it("two concurrent payments cannot over-allocate the same invoice")`,
  `it("concurrent verify requests on the same pending payment: exactly one succeeds, no duplicate allocation")`,
  `it("concurrent verify and reject race on the same pending payment: exactly one succeeds, end state is consistent")`.
- `api/tests/collection-batches.test.ts` → `it("concurrent remit safety: only one succeeds")`.
- `api/tests/receivables.test.ts` → `it("concurrent suspend: one 200 and one 409, status suspended once")`.

Manual three-client procedure for the live demo is documented in
`docs/deployment-guide.md` §5.

## AT-10 — Authorization

**Test data**: Cashier attempts admin-only user/backup operation.
**Expected**: Server rejects operation even if the API is called directly.
**Result: PASS.**
`api/tests/backup.test.ts` → `it("AT-10 style: a non-Owner role is rejected by the server even though it never sees the button")`
(explicitly named for this test). Every route file additionally has its own
401 (unauthenticated) and 403 (wrong role) tests — e.g.
`api/tests/users.test.ts` → `it("Administrator (non-Owner) cannot create a user")`,
`it("Cashier cannot replace roles")`. These call the route directly via
`app.inject`, bypassing any UI, which is exactly the "even if the API is
called directly" condition.

## AT-11 — Duplicate billing

**Test data**: Run billing generation twice for the same period.
**Expected**: No duplicate finalized invoice for the same service
account/period.
**Result: PASS.**
`api/tests/invoices.test.ts` → `it("duplicate invoice for same account+period -> 409")`
and `it("concurrent duplicate creation yields exactly one invoice and 409s")`.
Enforced at two layers: the `invoices_service_account_period_unique`
database constraint, and an in-transaction re-check before insert (so the
concurrent case returns a clean `409`, not a raw constraint-violation
error).

## AT-12 — Backup/restore

**Test data**: Create test backup, change data, restore approved backup.
**Expected**: Restored database passes integrity check and expected records
return.
**Result: PASS.**
`api/tests/backup.test.ts` → `describe("AT-12: full dump -> mutate -> restore integrity cycle") > it("restores a database to its backed-up state, losing only post-backup changes")`.
Run against a disposable scratch PostgreSQL database (created via a raw
`pg.Client` against the `postgres` maintenance database, dropped after the
test) specifically so this destructive scenario never touches the shared
`bcis_billing_test` that the other 12 test files depend on.

## Summary

| ID | Scenario | Result |
|---|---|---|
| AT-01 | Exact payment | PASS |
| AT-02 | Partial payment | PASS |
| AT-03 | Advance payment | PASS |
| AT-04 | Oldest-first arrears | PASS |
| AT-05 | Duplicate GCash reference | PASS |
| AT-06 | Payment reversal | PASS |
| AT-07 | Collector balanced remittance | PASS |
| AT-08 | Collector shortage | PASS |
| AT-09 | Concurrent users | PASS |
| AT-10 | Authorization | PASS |
| AT-11 | Duplicate billing | PASS |
| AT-12 | Backup/restore | PASS |

## Required Test Evidence

- **Automated test output for domain/business rules**: `api/tests/*.test.ts`
  (181 tests) — money math, allocation, invoice state machine, suspension/
  reconnection, settings.
- **API/integration test results for posting flows**: same suite, run via
  Fastify `inject` against a real PostgreSQL transaction — not mocked.
- **E2E/manual desktop evidence**: live-clicked verification during
  development for Backup, Reports export, Collections, Receivables,
  Ledger/Statement of Account, Suspend/Reconnect modals, User Management,
  and session lock, using the Windows screenshot/click technique documented
  in `.claude/skills/verify-desktop-ui/SKILL.md`; `desktop/tests/*.test.ts`
  (58 tests) covers IPC-wrapper correctness and role-based navigation at
  the unit level. The GCash verify/reject flow and the full Collection
  Batch lifecycle (create → add payment → remit with a shortage →
  reconcile/close), previously untested live, were swept the same way —
  see `tests/screenshots/` below.
- **Screenshots / report evidence**: `reports-samples/` contains a real PDF
  and XLSX exported from the running system against the seeded demo
  dataset; `tests/screenshots/` contains real captures of the Dashboard,
  GCash verify/reject, the Collection Batch lifecycle (including an
  intentional shortage), and the generic payment-proof file picker, with an
  index in `tests/screenshots/README.md`.
- **Bug log**: below.

## Bug Log

### Bug 1 — "Rendered fewer hooks than expected" crash in Service Account list

- **Discovered**: while adding the ledger/Statement-of-Account "View"
  navigation to `desktop/src/renderer/src/components/service-accounts/ServiceAccountList.tsx`.
- **Symptom**: clicking a row's new "View" button crashed the renderer with
  React's `"Rendered fewer hooks than expected"` error. Not caught by
  TypeScript or ESLint under this project's configuration.
- **Root cause**: three new conditional early-`return` statements
  (`viewingAccountId` / `ledgerAccountId` / `soaAccountId`) were placed
  immediately after the component's `useQuery` call, but *before*
  `const handleSearch = React.useCallback(...)`, which is declared further
  down in the same component. On the branch that took an early return,
  `handleSearch`'s `useCallback` never ran — violating the Rules of Hooks
  (every hook must run unconditionally, in the same order, on every
  render).
- **Diagnosis method**: root-caused with a temporary
  `mainWindow.webContents.on("console-message", ...)` listener forwarded to
  the terminal, reproducing the crash live and reading the exact React
  error and component stack, rather than guessing from the symptom.
- **Fix**: moved all three early-return blocks to immediately after the
  last hook call in the component (`handleSearch`'s declaration), with a
  comment recording the constraint so it isn't reintroduced:
  `// All hooks above must run unconditionally on every render (Rules of
  Hooks) — these navigation early-returns come after the last one.`
- **Regression test**: this specific failure mode (hook-order violation) is
  not mechanically testable by Vitest in a Node environment without a
  rendering harness; the standing practice adopted afterward is to grep
  every new/modified component for an early `return` placed before a hook
  declaration as part of review, and to live-click every new navigation
  path before marking a UI change done (per `.claude/skills/verify-desktop-ui/SKILL.md`).
  Verified fixed by re-running the exact click sequence that originally
  crashed and confirming the Ledger/Statement/Detail views now render.
