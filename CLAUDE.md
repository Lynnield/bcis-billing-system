# BCIS Subscription Billing and Collection System

Electron + React 19 + TypeScript desktop app (three simultaneous LAN clients:
Owner/Admin, Cashier, Operations) talking to a Fastify 5 + Drizzle ORM + PostgreSQL
API. Built for the BCIS lab activity spec in `docs/` — see
`docs/technical-documentation.md` for the full requirements trace.

## Non-negotiable rules

- **Money is bigint cents, never floating point.** Use `parseMoneyToCents`/`formatCents`
  (`api/src/lib/money.ts`) for every monetary value. Never do authoritative financial
  math with JS `number`.
- **The Electron renderer never talks to PostgreSQL directly** and never holds the JWT.
  `contextIsolation: true`, `nodeIntegration: false`. The main process alone holds the
  token (`electron-store` + `safeStorage`). Renderer only calls `window.bcis.*`
  (defined in `desktop/src/preload/index.ts`).
- **RBAC is enforced server-side only.** `requirePermission("code")` preHandlers in
  `api/src/routes/*.ts` are authoritative. Permission codes and their default role grants
  live in `api/src/lib/permissions.ts` (synced on start-up; the Owner edits grants).
  Desktop-side checks (`desktop/src/renderer/src/lib/roles.ts`) are UX convenience only — hiding a button is not authorization.
- **Posted financial records are reversed/adjusted, never deleted.** Payments go through
  `POST /payments/:id/reverse`; invoices are voided, not dropped.
- **Every schema change is a Drizzle migration.** Edit `api/src/db/schema.ts`, generate
  a migration, never hand-edit the database.
- **All external input is Zod-validated** at the route boundary (`api/src/routes/*.ts`).
- Never modify, reset, or seed the `bcis_billing` development database from a test run.
  Automated tests use `bcis_billing_test` only (see `api/vitest.config.ts`).
- Never commit `.env`, only `.env.example`.

## Commands

- API: `cd api && npm run dev` (port 3000), `npm run typecheck`, `npm test`
- Desktop: `cd desktop && npm run dev`, `npm run typecheck`, `npm test`
- Both test suites run against `bcis_billing_test`, never the dev database.

## Reusable patterns worth following

- `api/src/routes/payments.ts` is the reference implementation for a route module:
  Zod schemas, permission-gated preHandlers, a DB transaction for multi-step financial
  posting, and an audit-log write on every mutation.
- `desktop/src/renderer/src/components/dashboard/PlaceholderPage.tsx` is the stand-in
  used for nav items not yet wired to a real screen — check `App.tsx` for which routes
  still point at it before assuming a feature is done.
- New desktop screens should match the design tokens in
  `desktop/src/renderer/src/index.css` (navy/accent-blue/canvas per the lab spec) and
  the `Table`/`Badge`/`KPICard` components already have sticky headers and tabular
  numerals built in — reuse them rather than new ad hoc markup.
