# Three-PC Concurrency Demo Checklist (AT-09)

The automated suite already proves this at the database level
(`api/tests/payments.test.ts`, `invoices.test.ts`). This checklist is for
proving it live, on three physical machines on one LAN, per
`docs/deployment-guide.md` §5.

## Roles for this run

| Machine | Role | Login |
|---|---|---|
| PC 1 | Owner / Super Admin | `admin` / `lynnield12344` |
| PC 2 | Cashier | `demo.cashier` / `Demo@12345` |
| PC 3 | Collection Supervisor (Operations) | `demo.supervisor` / `Demo@12345` |
| Server | API + PostgreSQL, port 3000 | can be one of the three PCs above |

## Phase 0 — Server & network ready

- [ ] **API bound to the LAN, not just localhost.** Confirm `api/.env` has
      `HOST=0.0.0.0` — the default `localhost` refuses connections from the
      other two PCs.
      ```
      cd api
      npm run dev   # or: npm run build && npm start
      ```
- [ ] **Health check reachable from a *different* PC.** Run this from PC 2
      or PC 3, not the server itself:
      ```
      curl http://<server-lan-ip>:3000/health
      ```
      Expect `200 OK`. If it times out, check the server's firewall allows
      inbound TCP 3000 for the LAN subnet.
- [ ] **Demo users exist.** If this server's database doesn't already have
      the seeded demo roster:
      ```
      npm run db:seed
      ```

## Phase 1 — Point each desktop at the server

Repeat on all three physical machines, including the one running the server.

- [ ] **Set the client's API base URL.** Edit `desktop/.env` on every
      machine — never `localhost`, unless that client is the server itself:
      ```
      VITE_API_BASE_URL=http://<server-lan-ip>:3000
      ```
- [ ] **Launch the desktop app.**
      ```
      cd desktop
      npm run dev
      ```
- [ ] **Log in with the matching role on each PC**, using the credentials
      from the table above.
      Expect: all three Dashboards show the *same* numbers (active
      subscribers, outstanding total) — confirms all three are reading one
      shared database, not three local copies.

## Phase 2 — Concurrency Test A: payment vs. invoice, different accounts

- [ ] **Pick two service accounts and note their numbers.** e.g. Account A
      for the Cashier's payment, Account B for the Admin's invoice.
- [ ] **Stage both screens, don't submit yet.**
  - PC 2 (Cashier): Payments → Record Payment → Account A filled in, ready
    to click Post.
  - PC 1 (Owner): Billing → Invoices → Create Invoice → Account B filled
    in, ready to click Create.
- [ ] **Fire both on a three-count.** Count down out loud (or over a call)
      and click both submit buttons as close together as two humans can
      manage.
- [ ] **Check both results.** Expect: both actions succeed with no error
      toast. The payment gets one receipt number, the invoice gets one
      invoice number — neither repeats a number already in use. Refresh the
      Payments and Invoices lists on both PCs: each shows the other's new
      record too.

## Phase 3 — Optional, stronger evidence: race on the *same* GCash payment

Mirrors the automated test "concurrent verify and reject race on the same
pending payment: exactly one succeeds." More convincing than Test A because
both PCs touch the exact same row.

- [ ] **Submit a GCash payment from a role not sitting at PC 1 or PC 3.** On
      PC 2, record a GCash payment (any amount, any account). It lands as
      `pending`. Because the Cashier submitted it, the Cashier can't be the
      one who verifies it — that's the self-review guard, not a bug.
- [ ] **Open the same pending payment on both other PCs.** GCash
      Verification → the payment from the previous step. Both reviewers
      have the Verify/Reject buttons ready, pointed at the identical payment
      row.
- [ ] **Click Verify on one, Reject on the other — simultaneously.**
      Expect: exactly one of the two succeeds. The other gets a clear
      "already decided" error, not a silent failure or a duplicated
      allocation. Whichever one won, the payment's final status matches it —
      no split-brain state between the two PCs after both refresh.

## Phase 4 — RBAC spot-check

AT-10's "even if the API is called directly" condition, shown live rather
than just asserted in a test file.

- [ ] **Confirm Operations can't reach Owner-only screens.** On PC 3
      (Collection Supervisor), check the sidebar: Backup & Restore and User
      Management should either be absent or visibly disabled.
- [ ] **Confirm the server enforces it too, not just the UI.** From PC 3's
      machine, try the API directly with that session's own token:
      ```
      curl http://<server-lan-ip>:3000/api/v1/backup \
        -H "Authorization: Bearer <collection-supervisor-token>"
      ```
      Expect `403 Forbidden` — rejected by the route's own role check,
      independent of whatever the desktop UI shows.

## Phase 5 — Capture the evidence

What actually gets submitted — do this before anyone closes a window.

- [ ] **Screenshot all three screens right after the simultaneous click.**
      Capture each machine's result screen (or success toast) from Phase 2,
      and Phase 3 if you ran it.
- [ ] **Save into a dated evidence folder.**
      ```
      mkdir -p tests/screenshots/live-demo-$(date +%Y-%m-%d)
      # drop the screenshots from all three PCs in here
      ```
- [ ] **Note the account numbers, receipt/invoice numbers, and exact
      timestamps.** A short paragraph is enough — it's what lets a reader
      confirm "no duplicate numbering" without re-running the test
      themselves.

## Phase 6 — Wrap up

- [ ] **Take a backup.** Owner on PC 1 → Administration → Backup & Restore →
      Create Backup. Standard end-of-session practice per
      `docs/deployment-guide.md` §6, doubly worth it right after a live
      data-mutating demo.
- [ ] **Record the run in the acceptance test report.** Add a line under
      AT-09 in `tests/acceptance-test-report.md` noting the date and that it
      was additionally verified live on three physical machines, pointing at
      the new evidence folder.
- [ ] **Commit and push the evidence.**
      ```
      git add tests/screenshots/live-demo-* tests/acceptance-test-report.md
      git commit -m "Record live 3-PC concurrency demo evidence (AT-09)"
      git push
      ```
