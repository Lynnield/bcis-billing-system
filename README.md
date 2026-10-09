# BCIS Subscription Billing and Collection System

Desktop billing, collection, and subscriber-ledger system for Bukidnon Cable and
Internet Services. Three simultaneous LAN office clients (Owner/Admin, Cashier,
Operations) talk to a central API; no client ever opens the database directly.

## Architecture

```
PC 1: Owner/Admin Desktop   ─┐
PC 2: Cashier Desktop        ├── LAN ──> BCIS API Server ──> PostgreSQL
PC 3: Operations Desktop    ─┘
```

- **Desktop**: Electron 44 + electron-vite + React 19 + TypeScript strict + Tailwind
  CSS 4 + shadcn/ui + TanStack Query. `contextIsolation: true`, `nodeIntegration: false`;
  the renderer only reaches the backend through a narrow typed `window.bcis.*` preload
  API — it never touches PostgreSQL or the auth token directly.
- **API**: Fastify 5 + Zod 4 validation + Drizzle ORM + PostgreSQL. All business rules
  and authorization live here; the desktop clients are thin.
- **Money**: exact-cents `bigint` arithmetic throughout (`api/src/lib/money.ts`) —
  never JavaScript floating point for authoritative financial calculations.

See `docs/technical-documentation.md` for the full design, `docs/user-manual.md` for
day-to-day operation, and `docs/deployment-guide.md` for LAN setup.

## Getting started

### API

```bash
cd api
cp .env.example .env   # set a real DATABASE_URL and JWT_SECRET
npm install
npm run db:migrate     # run from a clean database
npm run db:seed        # synthetic demo data — never real subscriber data
npm run dev             # http://localhost:3000
```

### Desktop

```bash
cd desktop
cp .env.example .env
npm install
npm run dev
```

## Testing

```bash
cd api && npm test       # Vitest, runs only against the isolated bcis_billing_test DB
cd desktop && npm test    # Vitest, Node environment (no DOM) — logic/type-shape tests
```

Never point the test suite at the `bcis_billing` development database.

## Project layout

```
api/        Fastify API, Drizzle schema + migrations, Vitest suites
desktop/    Electron app (main/preload/renderer)
docs/       Technical documentation, user manual, ERD, deployment guide
tests/      Acceptance-test report and screenshot evidence
reports-samples/  Sample exported PDF/XLSX reports
```
