# Technical Documentation

BCIS Subscription Billing and Collection System — D3 deliverable per the lab
spec. This document covers requirements traceability, architecture, module
description, data model, API/IPC design, and the security model. Deployment
steps live in `docs/deployment-guide.md`; day-to-day operation lives in
`docs/user-manual.md`.

## 1. Requirements Summary

Bukidnon Cable and Internet Services needs a LAN desktop system for three
simultaneous office roles (Owner/Admin, Cashier, Operations) to manage
Internet/Cable/Combo subscriptions, monthly billing, Cash/GCash collection,
field-collector accountability, overdue receivables, management reporting,
audit trails, and database backup/restore. The full requirement set is the
lab spec PDF (`BCIS_Subscription_Billing_and_Collection_Laboratory_Activity.pdf`);
this document explains how each requirement was implemented, not restate it.

## 2. Architecture

```
PC 1: Owner/Admin Desktop   ─┐
PC 2: Cashier Desktop        ├── LAN ──> BCIS API Server ──> PostgreSQL
PC 3: Operations Desktop    ─┘                                 │
                                                   ├── Attachments (none yet, see §8)
                                                   ├── Backups (pg_dump files)
                                                   └── Audit / Logs (audit_logs table, pino)
```

- **Desktop clients** are Electron 44 + electron-vite + React 19 + TypeScript
  strict + Tailwind CSS 4 + shadcn/ui + TanStack Query. Each client is a thin
  presentation layer: it renders data and calls the API, but never computes
  money, never decides authorization, and never touches PostgreSQL.
- **API server** is Fastify 5 + Zod 4 + Drizzle ORM + PostgreSQL. All business
  rules — money math, payment allocation, invoice state transitions, RBAC,
  audit logging — live here, enforced identically no matter which client (or
  a direct HTTP call) triggers them.
- **Database** is a single shared PostgreSQL instance. Three clients talking
  to one transactional database (rather than a shared SQLite file) is what
  makes concurrent posting, locking, and consistent numbering possible —
  see `docs/deployment-guide.md` and AT-09 for the concurrency argument.

### Electron process boundary

- `contextIsolation: true`, `nodeIntegration: false` (`desktop/src/main/index.ts`).
- The renderer has no Node/Electron API surface except `window.bcis.*`,
  defined by `desktop/src/preload/index.ts` and backed by narrow
  `ipcMain.handle` channels in `desktop/src/main/index.ts`.
- The JWT issued at login is held only in the **main process** (`electron-store`
  + OS keychain via `safeStorage`). The renderer never sees the raw token; it
  only sees the decoded `AuthUser` the main process returns.

## 3. Module Description

### API (`api/src/`)

| Directory | Contents |
|---|---|
| `config/` | `env.ts` — Zod-validated environment (`DATABASE_URL`, `JWT_SECRET`, `BACKUP_DIR`, ...). |
| `db/` | `schema.ts` (Drizzle table defs), `index.ts` (pool/drizzle instance), `seed.ts` (demo dataset), `bootstrap-owner.ts` (one-time Owner creation), Drizzle `drizzle/` migrations. |
| `lib/` | Cross-cutting logic: `money.ts` (cents math), `auth.ts` (JWT verify + RBAC), `roles.ts` (role-name constants), `password.ts` (scrypt hashing), `receivables.ts` (aging-bucket math shared by receivables + reports), `backup.ts` (`pg_dump`/`pg_restore` wrapper), `report-export.ts` (ExcelJS/pdfmake rendering). |
| `routes/` | One Fastify plugin per resource (see §6). Each owns its Zod schemas, role gates, and (for multi-step writes) its own `db.transaction`. |
| `types/` | `pdfmake.d.ts` — hand-written ambient types for pdfmake's real runtime API (the published `@types/pdfmake` targets an older, different API shape). |

### Desktop (`desktop/src/`)

| Directory | Contents |
|---|---|
| `main/index.ts` | Electron main process: window creation, all `ipcMain.handle` channels, token storage, HTTP calls to the API via `fetch`. |
| `preload/index.ts` | Defines `window.bcis.*` — the only surface the renderer can call. |
| `renderer/src/lib/` | One `*-api.ts` wrapper per resource (thin `window.bcis.x.y()` calls), `auth-context.tsx` (session + idle-lock state), `roles.ts` (nav visibility), `toast.tsx`. |
| `renderer/src/components/` | One folder per feature area: `auth`, `subscribers`, `service-accounts`, `services`, `invoices`, `billing-periods`, `payments`, `collection-areas`, `collections` (collectors/batches/route sheets), `receivables`, `reports`, `backup`, `users`, `dashboard`, and `ui` (shared primitives: `Table`, `Modal`, `Badge`, `Sidebar`, ...). |
| `shared/types.ts` | Request/response/entity TypeScript types shared between preload, main, and renderer — the single source of truth for the IPC contract's shape. |

## 4. Data Model

25 tables, migrated incrementally via Drizzle (`api/drizzle/*.sql`) — never
hand-edited. Full column-level detail is in `api/src/db/schema.ts`; this is
the summary data dictionary. See `docs/erd.png` for the relationship diagram
(`docs/erd.mmd` is the Mermaid source it was rendered from).

| Domain | Tables | Notes |
|---|---|---|
| Security | `users`, `roles`, `user_roles` | scrypt password hashing; role is a name string looked up server-side on every request, never trusted from the JWT payload. |
| Subscribers | `subscribers`, `subscriber_status_history` | Status changes are appended, never overwritten in place — satisfies "do not delete historical subscriber accounts." |
| Services | `services`, `service_plans`, `collection_areas`, `collectors` | A `service` is a type (internet/cable/combo); a `service_plan` is a priced offering under it. |
| Service accounts | `service_accounts` | One subscriber may own several; each carries its own plan, status, area, and assigned collector. |
| Billing | `billing_periods`, `invoices`, `invoice_line_items`, `invoice_adjustments` | `invoices` has a `(service_account_id, billing_period_id)` unique constraint — the single mechanism that makes duplicate billing structurally impossible (AT-11), backed by an in-transaction re-check for the concurrent case. |
| Payments | `payments`, `payment_allocations`, `payment_reversals`, `gcash_payment_details` | A payment is never edited or deleted after posting — `payment_reversals` links back to the original (AT-06). `payment_allocations` is the join table that makes oldest-first allocation auditable per invoice. |
| Collections | `collection_batches`, `collection_batch_payments` | Batch lifecycle `open → remitted → reconciled`; shortage/overage is computed and stored, never silently zeroed (AT-07/AT-08). |
| Operations | `suspension_records`, `reconnection_records` | Dedicated history tables (3.10) rather than a bare status flip — each suspend/reconnect call appends a row with reason/fee/technician/approver. |
| System | `audit_logs`, `application_settings`, `backup_history` | `audit_logs` is append-only (no UPDATE/DELETE route exists for it anywhere in the API). `application_settings` is a generic key/value store currently holding the 3.10 grace-period/suspension-threshold pair. |

### Key constraints enforced at the database level

- Unique: `subscribers.account_number`, `service_accounts.service_number`,
  `invoices.invoice_number`, `invoices(service_account_id, billing_period_id)`,
  `payments.receipt_number`, `gcash_payment_details.gcash_reference_number`,
  `payment_reversals.payment_id`, `collection_batch_payments.payment_id`.
- Check constraints on every monetary column (`>= 0` or `> 0` as appropriate)
  as a last-line defense beneath the application-level `parseMoneyToCents`
  validation.
- Indexes on every foreign key used in a hot lookup (subscriber name/account,
  invoice status/due date, payment date, collector/area) per spec §5.2.

## 5. Money and Ledger Model

Every monetary column is PostgreSQL `NUMERIC(14,2)`; every monetary value
that crosses into application logic is immediately converted to a `bigint`
of cents via `parseMoneyToCents` (`api/src/lib/money.ts`) and converted back
with `formatCents` only at the API boundary. No authoritative calculation
ever uses a JavaScript `number` for money — this is enforced by convention
and reviewed on every payments/invoices change, not by a lint rule.

The ledger (exposed via `GET /api/v1/reports/ledger/:serviceAccountId`) is
derived, not stored: it is computed on read by unioning `invoices` (debits)
and posted `payments` (credits) for one service account, ordered
chronologically, with a running balance computed in the same pass
(`computeLedger()` in `api/src/routes/reports.ts`, shared by both the ledger
endpoint and the Statement of Account). Because it is derived from the same
rows the payment-allocation logic writes, the ledger balance and the
receivables balance can never drift apart.

## 6. API Design

All routes are versioned under `/api/v1/`, authenticated via
`preHandler: [authenticate, requireRoles(...)]`, and return `{ data, ... }`
or `{ message }` on error. Representative routes (full list in each
`api/src/routes/*.ts` file and `api/tests/*.test.ts`):

| Resource | Key routes |
|---|---|
| Auth | `POST /auth/login`, `GET /auth/me` |
| Subscribers | `GET/POST /subscribers`, `PATCH /subscribers/:id`, `PATCH /subscribers/:id/status`, `GET /subscribers/:id/status-history` |
| Services & plans | `GET/POST /services`, `GET/POST /services/:id/plans`, `PATCH /service-plans/:id` |
| Service accounts | `GET/POST /service-accounts`, `PATCH .../status`, `PATCH .../suspend`, `PATCH .../reconnect`, `GET .../suspension-history`, `GET .../reconnection-history` |
| Billing | `GET/POST /billing-periods`, `GET/POST /invoices` (atomic duplicate-period guard) |
| Payments | `POST /payments` (oldest-first allocation, GCash held pending), `POST /payments/:id/verify`, `POST /payments/:id/reject`, `POST /payments/:id/reverse` |
| Collections | `GET/POST /collection-areas`, `GET/POST /collectors`, `GET/POST /collection-batches`, `POST .../payments`, `POST .../remit`, `POST .../reconcile` |
| Receivables | `GET /receivables/invoices`, `GET /receivables/aging`, `GET /receivables/suspension-candidates` |
| Reports | `GET /reports/{dashboard,collections,receivables,aging,collectors}` and matching `/export?format=pdf|xlsx`, `GET /reports/ledger/:id`, `GET /reports/soa/:id` |
| Users | `GET /users`, `POST /users`, `PATCH /users/:id`, `PUT /users/:id/roles`, `POST /users/:id/reset-password` (all writes Owner-only) |
| Backup | `GET/POST /backup`, `POST /backup/:id/verify`, `POST /backup/:id/restore` (Owner-only) |
| Settings | `GET/PUT /settings/collections` (grace period / suspension threshold) |

## 7. IPC Design (Desktop)

The renderer never calls `fetch` directly. Every operation is a named
`window.bcis.<namespace>.<method>()` call defined in
`desktop/src/preload/index.ts`, routed through `ipcRenderer.invoke` to a
matching `ipcMain.handle` in `desktop/src/main/index.ts`, which attaches the
stored bearer token and makes the real HTTP call to the API. Namespaces:
`app`, `auth`, `dashboard`, `subscribers`, `serviceAccounts`, `services`,
`plans`, `collectionAreas`, `collectors`, `collectionBatches`, `invoices`,
`billingPeriods`, `payments`, `backup`, `users`, `settings`, `receivables`,
`reports`. Every channel and its payload/response type is declared once in
`desktop/src/shared/types.ts` (`BcisDesktopApi`), so a change to an IPC
contract is a single-file compile error everywhere it's used.

## 8. Security Model

- **Authentication**: username/password, scrypt password hashing (`api/src/lib/password.ts`,
  salted, timing-safe comparison), JWT (`@fastify/jwt`) with a 1-hour
  expiry. Inactive accounts cannot log in (`users.status`).
- **Authorization**: every mutating and most read routes carry
  `requireRoles(...)`, resolved from the database on every request
  (`loadActiveUserWithRoles` in `api/src/lib/auth.ts`) — never trusted from
  the JWT payload itself. Desktop-side role checks (`desktop/src/renderer/src/lib/roles.ts`)
  only hide navigation; they are UX convenience, not a security boundary.
  Verified directly in `api/tests/*.test.ts` by calling routes with the
  "wrong" role and asserting 403 (AT-10), and in
  `desktop/tests/newer-features.test.ts` by asserting the desktop nav gating
  matches each route's server-side role list exactly.
- **Separation of duties**: a GCash submitter cannot verify or reject their
  own submission (`payments.ts`, enforced server-side, covered by
  `payments.test.ts`).
- **Audit trail**: every posted financial mutation (payment post/verify/
  reject/reverse, invoice create, suspend/reconnect, user create/update/
  role-change/password-reset, settings change, backup create/restore)
  writes an `audit_logs` row with actor, action, entity, and a metadata
  blob of old/new values. There is no route anywhere in the API that
  updates or deletes an `audit_logs` row.
- **Session lock**: 15 minutes of renderer inactivity
  (`desktop/src/renderer/src/lib/auth-context.tsx`) shows a full-screen
  `LockScreen` that requires the current user's password to clear — it
  reuses the login route rather than a parallel "verify password" endpoint,
  and never discards the stored token, so the user doesn't have to
  re-authenticate against the server, only prove presence.
- **Attachment handling**: GCash proof images are stored by path
  (`gcash_payment_details.proof_attachment_path`); a generic file-picker
  with server-side type/size validation for non-GCash payment proofs was
  scoped in planning but deferred — see Limitations below.
- **Secrets**: `.env` is gitignored; only `.env.example` is committed.
  Passwords are never logged (pino redaction is unnecessary because the
  password never appears in a logged object — it's consumed and discarded
  before any log line is written).

## 9. Backup & Restore

`api/src/lib/backup.ts` wraps `pg_dump -Fc` / `pg_restore --clean` as child
processes (not a hand-rolled export) against `BACKUP_DIR`, a directory
outside the web root that the API itself never serves. Every backup gets a
`backup_history` row with a SHA-256 checksum of the dump file. `POST
/backup/:id/verify` re-hashes the file and runs `pg_restore --list` against
it as a non-destructive structural check. `POST /backup/:id/restore`
requires an explicit confirmation flag in the request body and is
Owner-only. See `api/tests/backup.test.ts` for the full create → mutate →
restore → integrity-check cycle (AT-12), exercised against a disposable
scratch database so the shared test database is never put at risk.

## 10. Testing Strategy

See `tests/acceptance-test-report.md` for the AT-01…AT-12 results. In
summary: 181 API tests (Vitest + Fastify `inject`, run only against
`bcis_billing_test`) cover every financial rule, RBAC boundary, and
concurrency scenario; 58 desktop tests (Vitest, Node environment) cover
role-based navigation, IPC-wrapper argument correctness, and shared-type
shape agreement with the backend contract.

## 11. Known Limitations / Future Work

- Non-GCash payment proof attachments (bank transfer/cheque scans) do not
  yet have a dedicated file-picker + server-side validation path; GCash
  proof attachment (`proof_attachment_path`) works today.
- Collector mobile/PWA, SMS/email reminders, a customer self-service portal,
  and GIS mapping are explicitly out of scope per the lab spec's "Optional
  Enhancement Tasks" — not attempted, to keep focus on the mandatory
  financial/security/testing requirements per the spec's own bonus rule.
- Load testing against the spec's reliability target (20,000 subscribers /
  500,000 invoices / 500,000 payments) has not been performed; the schema's
  indexing follows §5.2 but has not been benchmarked at that scale.
