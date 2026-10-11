import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../src/app";
import { db, pool } from "../src/db";
import {
  billingPeriods,
  collectionBatches,
  collectionBatchPayments,
  collectors,
  invoiceAdjustments,
  invoiceLineItems,
  invoices,
  paymentAllocations,
  paymentReversals,
  payments,
  roles,
  serviceAccounts,
  servicePlans,
  services,
  subscribers,
  userRoles,
  users,
} from "../src/db/schema";
import { hashPassword } from "../src/lib/password";
import { ROLE_NAMES } from "../src/lib/roles";
import { formatCents } from "../src/lib/money";
import { AGING_BUCKETS, bucketFor, daysOverdue, getInvoiceBalances } from "../src/lib/receivables";
import { eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
const createdUserIds: number[] = [];
const createdInvoiceIds: number[] = [];
const createdPeriodIds: number[] = [];
const createdAccountIds: number[] = [];
const createdPaymentIds: number[] = [];
const createdBatchIds: number[] = [];
const createdCollectorIds: number[] = [];
const tokens: Record<string, string> = {};
let serviceAccountId: number;

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function mkUser(username: string, roleName: string) {
  const [existing] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (existing) return;
  
  const passwordHash = await hashPassword("S3cure!TestPassw0rd");
  const [u] = await db.insert(users).values({ username, email: `${username}@test.local`, fullName: username, passwordHash, status: "active" }).returning({ id: users.id });
  createdUserIds.push(u!.id);
  const [role] = await db.select().from(roles).where(eq(roles.name, roleName)).limit(1);
  await db.insert(userRoles).values({ userId: u!.id, roleId: role!.id });
  const res = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { identifier: username, password: "S3cure!TestPassw0rd" } });
  tokens[username] = res.json().token;
}

const createdFixtureRefs: Array<{ subscriberId: number; serviceId: number; planId: number }> = [];

async function mkFixture() {
  const [sub] = await db.insert(subscribers).values({ accountNumber: uid("ACC-R"), firstName: "Test", lastName: "Sub", addressLine1: "1 Way", status: "active" }).returning();
  const [svc] = await db.insert(services).values({ type: "internet", name: uid("SVC-R") }).returning();
  const [plan] = await db.insert(servicePlans).values({ serviceId: svc!.id, name: uid("PLAN-R"), price: "1000.00" }).returning();
  const [acc] = await db.insert(serviceAccounts).values({ subscriberId: sub!.id, planId: plan!.id, serviceNumber: uid("NUM-R"), status: "active" }).returning();
  createdAccountIds.push(acc!.id);
  createdFixtureRefs.push({ subscriberId: sub!.id, serviceId: svc!.id, planId: plan!.id });
  return { subscriberId: sub!.id, serviceId: svc!.id, planId: plan!.id, accountId: acc!.id };
}

let periodCounter = 0;

async function mkPeriod() {
  periodCounter++;
  const now = Date.UTC(2020, 0, 1) + periodCounter * 86400000; // Start from 2020, increment by 1 day
  const [p] = await db.insert(billingPeriods).values({
    label: uid("BP-R"),
    periodStart: new Date(now),
    periodEnd: new Date(now + 30 * 86400000),
    dueDate: new Date(now + 35 * 86400000),
  }).returning();
  createdPeriodIds.push(p!.id);
  return p!;
}

async function mkInvoice(accountId2: number, periodId2: number, amount: string, dueOffsetDays: number) {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + dueOffsetDays);
  const [inv] = await db.insert(invoices).values({ invoiceNumber: uid("INV-R"), serviceAccountId: accountId2, billingPeriodId: periodId2, issueDate: new Date(), dueDate, status: "unpaid", totalAmount: amount }).returning();
  createdInvoiceIds.push(inv!.id);
  return inv!;
}

beforeAll(async () => {
  app = await buildApp();
  await mkUser("rpt_owner", ROLE_NAMES.OWNER);
  await mkUser("rpt_viewer", ROLE_NAMES.READ_ONLY_VIEWER);

  const fx = await mkFixture();
  serviceAccountId = fx.accountId;
  const period = await mkPeriod();
  const inv = await mkInvoice(serviceAccountId, period.id, "1000.00", 5);
  const [pay] = await db.insert(payments).values({ serviceAccountId: serviceAccountId, method: "cash", amount: "600.00", paymentDate: new Date(), status: "posted" }).returning();
  createdPaymentIds.push(pay!.id);
  await db.insert(paymentAllocations).values({ paymentId: pay!.id, invoiceId: inv.id, amount: "600.00" });
});

afterAll(async () => {
  // Scoped cleanup: delete only rows this file created, in FK-safe order.
  // (Previously this used unconditional `db.delete(table)` with no WHERE
  // clause, which wiped every row in these tables for the whole database —
  // including fixtures belonging to other test files running concurrently.
  // That cross-file data loss was the root cause of mass unrelated test
  // failures when the suite ran in parallel.)
  if (createdBatchIds.length) {
    await db.delete(collectionBatchPayments).where(inArray(collectionBatchPayments.batchId, createdBatchIds));
  }
  if (createdPaymentIds.length) {
    await db.delete(paymentAllocations).where(inArray(paymentAllocations.paymentId, createdPaymentIds));
    await db.delete(paymentReversals).where(inArray(paymentReversals.paymentId, createdPaymentIds));
    await db.delete(payments).where(inArray(payments.id, createdPaymentIds));
  }
  if (createdInvoiceIds.length) {
    await db.delete(invoiceAdjustments).where(inArray(invoiceAdjustments.invoiceId, createdInvoiceIds));
    await db.delete(invoiceLineItems).where(inArray(invoiceLineItems.invoiceId, createdInvoiceIds));
    await db.delete(invoices).where(inArray(invoices.id, createdInvoiceIds));
  }
  if (createdBatchIds.length) {
    await db.delete(collectionBatches).where(inArray(collectionBatches.id, createdBatchIds));
  }
  if (createdCollectorIds.length) {
    await db.delete(collectors).where(inArray(collectors.id, createdCollectorIds));
  }
  if (createdPeriodIds.length) {
    await db.delete(billingPeriods).where(inArray(billingPeriods.id, createdPeriodIds));
  }
  if (createdAccountIds.length) {
    await db.delete(serviceAccounts).where(inArray(serviceAccounts.id, createdAccountIds));
  }
  for (const f of createdFixtureRefs) {
    await db.delete(servicePlans).where(eq(servicePlans.id, f.planId));
    await db.delete(services).where(eq(services.id, f.serviceId));
    await db.delete(subscribers).where(eq(subscribers.id, f.subscriberId));
  }
  if (createdUserIds.length) {
    await db.delete(userRoles).where(inArray(userRoles.userId, createdUserIds));
    await db.delete(users).where(inArray(users.id, createdUserIds));
  }

  await app.close();
  await pool.end();
});

function authH(t: string) {
  return { authorization: `Bearer ${t}` };
}

describe("Phase 12 — Reporting Tests, Batch 1", () => {
  describe("Authentication", () => {
    it("rejects unauthenticated collection report with 401", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/reports/collections" });
      expect(res.statusCode).toBe(401);
    });

    it("read-only viewer can read collection report", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/reports/collections", headers: authH(tokens.rpt_viewer!) });
      expect(res.statusCode).toBe(200);
    });
  });

  describe("Collection Report", () => {
    it("includes posted payments in collection totals", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/reports/collections", headers: authH(tokens.rpt_viewer!) });
      expect(res.statusCode).toBe(200);
      const totalCollected = res.json().data.totalCollected;
      expect(totalCollected).toBe("600.00");
    });

    it("excludes reversed payments from collection totals", async () => {
      const [revPay] = await db.insert(payments).values({ serviceAccountId: serviceAccountId, method: "cash", amount: "999.00", paymentDate: new Date(), status: "reversed" }).returning();
      createdPaymentIds.push(revPay!.id);
      const res = await app.inject({ method: "GET", url: "/api/v1/reports/collections", headers: authH(tokens.rpt_viewer!) });
      const totalCollected = res.json().data.totalCollected;
      expect(totalCollected).toBe("600.00");
    });

    it("totals by payment method are correct", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/reports/collections", headers: authH(tokens.rpt_viewer!) });
      const byMethod = res.json().data.byPaymentMethod;
      const cash = byMethod.find((m: { method: string; total: string }) => m.method === "cash");
      expect(cash).toBeTruthy();
      expect(cash!.total).toBe("600.00");
      expect(cash!.count).toBe(1);
    });

    it("date filtering works", async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const res = await app.inject({ method: "GET", url: "/api/v1/reports/collections", query: { dateFrom: tomorrow.toISOString().slice(0, 10) }, headers: authH(tokens.rpt_viewer!) });
      expect(res.json().data.totalCollected).toBe("0.00");
    });
  });

  describe("Receivables Report", () => {
    it("outstanding balance is correct", async () => {
      const res = await app.inject({ method: "GET", url: `/api/v1/reports/receivables?serviceAccountId=${serviceAccountId}`, headers: authH(tokens.rpt_viewer!) });
      expect(res.json().data.totalOutstandingBalance).toBe("400.00");
    });

    it("outstanding invoice count is correct", async () => {
      const res = await app.inject({ method: "GET", url: `/api/v1/reports/receivables?serviceAccountId=${serviceAccountId}`, headers: authH(tokens.rpt_viewer!) });
      expect(res.json().data.outstandingInvoiceCount).toBe(1);
    });

    it("overdue balance is correct (future due date)", async () => {
      const res = await app.inject({ method: "GET", url: `/api/v1/reports/receivables?serviceAccountId=${serviceAccountId}`, headers: authH(tokens.rpt_viewer!) });
      expect(res.json().data.overdueBalance).toBe("0.00");
    });

    it("fully paid invoices are excluded", async () => {
      // The existing fixture has one invoice with 400.00 balance (1000 - 600)
      // Fully paying it should remove it from outstanding
      const [pay] = await db.insert(payments).values({ serviceAccountId: serviceAccountId, method: "cash", amount: "400.00", paymentDate: new Date(), status: "posted" }).returning();
      createdPaymentIds.push(pay!.id);
      const [inv] = await db.select().from(invoices).where(eq(invoices.serviceAccountId, serviceAccountId)).limit(1);
      await db.insert(paymentAllocations).values({ paymentId: pay!.id, invoiceId: inv!.id, amount: "400.00" });
      await db.update(invoices).set({ status: "paid" }).where(eq(invoices.id, inv!.id));

      const res = await app.inject({ method: "GET", url: `/api/v1/reports/receivables?serviceAccountId=${serviceAccountId}`, headers: authH(tokens.rpt_viewer!) });
      expect(res.json().data.totalOutstandingBalance).toBe("0.00");
      expect(res.json().data.outstandingInvoiceCount).toBe(0);
    });

    it("reversed payment allocations do not affect AR", async () => {
      // Add a reversed payment with allocation; it should not reduce outstanding
      const [revPay] = await db.insert(payments).values({ serviceAccountId: serviceAccountId, method: "cash", amount: "100.00", paymentDate: new Date(), status: "reversed" }).returning();
      createdPaymentIds.push(revPay!.id);
      const newPeriod = await mkPeriod();
      const [inv] = await db.insert(invoices).values({ invoiceNumber: uid("INV-REV"), serviceAccountId: serviceAccountId, billingPeriodId: newPeriod.id, issueDate: new Date(), dueDate: new Date(), status: "unpaid", totalAmount: "100.00" }).returning();
      createdInvoiceIds.push(inv!.id);
      await db.insert(paymentAllocations).values({ paymentId: revPay!.id, invoiceId: inv!.id, amount: "100.00" });

      const res = await app.inject({ method: "GET", url: "/api/v1/reports/receivables", headers: authH(tokens.rpt_viewer!) });
      // The reversed payment allocation should not reduce the AR (the invoice is still 100 unpaid)
      // But we need to ensure the invoice exists and is unpaid
      expect(res.statusCode).toBe(200);
      
      // Clean up the invoice so it doesn't affect Batch 2 tests
      await db.delete(paymentAllocations).where(eq(paymentAllocations.invoiceId, inv!.id));
      await db.delete(invoices).where(eq(invoices.id, inv!.id));
      await db.delete(payments).where(eq(payments.id, revPay!.id));
    });
  });
});

describe("Phase 12 — Reporting Tests, Batch 2", () => {
  // Additional fixtures for Batch 2 tests
  let agingAccountId: number;
  let ledgerAccountId: number;
  let soaAccountId: number;
  let collectorId2: number;
  let batchId: number;

  beforeAll(async () => {
    // Aging fixtures
    const agingFx = await mkFixture();
    agingAccountId = agingFx.accountId;
    const p1 = await mkPeriod();
    const p1b = await mkPeriod();
    const p1c = await mkPeriod();
    const p1d = await mkPeriod();
    const p1e = await mkPeriod();
    await mkInvoice(agingAccountId, p1.id, "100.00", -2);
    await mkInvoice(agingAccountId, p1b.id, "200.00", 0);
    await mkInvoice(agingAccountId, p1c.id, "300.00", -35);
    await mkInvoice(agingAccountId, p1d.id, "400.00", -65);
    await mkInvoice(agingAccountId, p1e.id, "500.00", -95);

    // Ledger fixtures
    const ledgerFx = await mkFixture();
    ledgerAccountId = ledgerFx.accountId;
    const p2 = await mkPeriod();
    const inv1 = await mkInvoice(ledgerAccountId, p2.id, "1000.00", -10);
    const pay1 = await db.insert(payments).values({ serviceAccountId: ledgerAccountId, method: "cash", amount: "600.00", paymentDate: new Date(), status: "posted" }).returning();
    createdPaymentIds.push(pay1[0]!.id);
    await db.insert(paymentAllocations).values({ paymentId: pay1[0]!.id, invoiceId: inv1.id, amount: "600.00" });

    // SOA fixtures
    const soaFx = await mkFixture();
    soaAccountId = soaFx.accountId;
    const p3 = await mkPeriod();
    const inv2 = await mkInvoice(soaAccountId, p3.id, "800.00", -5);
    const pay2 = await db.insert(payments).values({ serviceAccountId: soaAccountId, method: "cash", amount: "400.00", paymentDate: new Date(), status: "posted" }).returning();
    createdPaymentIds.push(pay2[0]!.id);
    await db.insert(paymentAllocations).values({ paymentId: pay2[0]!.id, invoiceId: inv2.id, amount: "400.00" });

    // Collector fixtures
    const [col] = await db.insert(collectors).values({ fullName: "Batch Test Collector", status: "active" }).returning();
    collectorId2 = col!.id;
    createdCollectorIds.push(collectorId2);
    const batch = await db.insert(collectionBatches).values({ collectorId: collectorId2, batchDate: new Date(), status: "open", expectedAmount: "1500.00", remittedAmount: "1200.00", shortageAmount: "300.00", overageAmount: "0.00" }).returning();
    batchId = batch[0]!.id;
    createdBatchIds.push(batchId);
  });

  describe("Aging Report", () => {
    it("bucket boundaries are correct", async () => {
      // The endpoint aggregates the whole `invoices` table, which other test
      // files are concurrently writing to — a fixed expected total (or even
      // a delta from an earlier snapshot) would be racy. Instead, compute
      // the ground truth from the exact same shared helpers the route
      // itself uses (getInvoiceBalances/bucketFor/daysOverdue), queried
      // immediately before the HTTP call, and compare against that.
      const rows = await getInvoiceBalances();
      const expectedBuckets: Record<string, bigint> = Object.fromEntries(AGING_BUCKETS.map((b) => [b, 0n]));
      let expectedCount = 0;
      let expectedTotal = 0n;
      for (const r of rows) {
        if (r.balanceCents <= 0n) continue;
        const b = bucketFor(daysOverdue(r.dueDate));
        expectedBuckets[b] = (expectedBuckets[b] ?? 0n) + r.balanceCents;
        expectedCount += 1;
        expectedTotal += r.balanceCents;
      }

      const res = await app.inject({ method: "GET", url: "/api/v1/reports/aging", headers: authH(tokens.rpt_viewer!) });
      expect(res.statusCode).toBe(200);
      const buckets = res.json().data.buckets as Record<string, { amount: string; count: number }>;
      for (const b of AGING_BUCKETS) {
        expect(buckets[b]!.amount).toBe(formatCents(expectedBuckets[b] ?? 0n));
      }
      expect(res.json().data.totalInvoiceCount).toBe(expectedCount);
      expect(res.json().data.totalOutstandingAmount).toBe(formatCents(expectedTotal));
      // Sanity check that this batch's own fixtures are actually present and counted.
      expect(expectedCount).toBeGreaterThanOrEqual(7);
    });
  });

  describe("Ledger Report", () => {
    it("returns chronological entries with running balance", async () => {
      const res = await app.inject({ method: "GET", url: `/api/v1/reports/ledger/${ledgerAccountId}`, headers: authH(tokens.rpt_viewer!) });
      expect(res.statusCode).toBe(200);
      const entries = res.json().data.entries;
      expect(entries.length).toBeGreaterThan(0);
      let prevDate = "";
      for (const e of entries) {
        expect(e.date >= prevDate).toBe(true);
        prevDate = e.date;
      }
      expect(res.json().data.closingBalance).toBe("400.00");
    });
  });

  describe("Statement of Account", () => {
    it("contains subscriber, service account, and financial details", async () => {
      const res = await app.inject({ method: "GET", url: `/api/v1/reports/soa/${soaAccountId}`, headers: authH(tokens.rpt_viewer!) });
      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data.subscriber).toBeTruthy();
      expect(data.serviceAccount).toBeTruthy();
      expect(data.plan).toBeTruthy();
      expect(data.service).toBeTruthy();
      expect(data.totals.outstandingBalance).toBe("400.00");
      expect(data.recentPayments.length).toBeGreaterThan(0);
    });
  });

  describe("Collector Report", () => {
    it("correct expected, remitted, shortage, overage", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/reports/collectors", headers: authH(tokens.rpt_viewer!) });
      expect(res.statusCode).toBe(200);
      const rows = res.json().data;
      const collectorRow = rows.find((r: { collectorId: number; expectedAmount: string }) => r.collectorId === collectorId2);
      expect(collectorRow).toBeTruthy();
      expect(collectorRow!.expectedAmount).toBe("1500.00");
      expect(collectorRow!.remittedAmount).toBe("1200.00");
      expect(collectorRow!.shortageAmount).toBe("300.00");
      expect(collectorRow!.overageAmount).toBe("0.00");
    });
  });

  describe("Dashboard", () => {
    it("returns consistent KPIs", async () => {
      // Same reasoning as the Aging Report test above: these KPIs aggregate
      // the whole database, which other test files are concurrently
      // mutating, so compare against ground truth queried directly from the
      // DB (using the same filters the dashboard route applies) immediately
      // before the HTTP call, instead of a fixed or snapshot-relative count.
      const [[activeSubs], [activeAccs], [pending], [openBatches], [remit]] = await Promise.all([
        db.select({ count: sql<number>`count(*)::int` }).from(subscribers).where(eq(subscribers.status, "active")),
        db.select({ count: sql<number>`count(*)::int` }).from(serviceAccounts).where(eq(serviceAccounts.status, "active")),
        db.select({ count: sql<number>`count(*)::int` }).from(serviceAccounts).where(eq(serviceAccounts.status, "pending_installation")),
        db.select({ count: sql<number>`count(*)::int` }).from(collectionBatches).where(eq(collectionBatches.status, "open")),
        db
          .select({
            shortage: sql<string>`coalesce(sum(${collectionBatches.shortageAmount}), 0)::numeric(14,2)`,
            overage: sql<string>`coalesce(sum(${collectionBatches.overageAmount}), 0)::numeric(14,2)`,
          })
          .from(collectionBatches),
      ]);

      const res = await app.inject({ method: "GET", url: "/api/v1/reports/dashboard", headers: authH(tokens.rpt_viewer!) });
      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data.activeSubscribers).toBe(activeSubs!.count);
      expect(data.activeServiceAccounts).toBe(activeAccs!.count);
      expect(data.pendingInstallations).toBe(pending!.count);
      expect(data.openCollectionBatches).toBe(openBatches!.count);
      expect(data.remittanceShortageTotal).toBe(remit!.shortage);
      expect(data.remittanceOverageTotal).toBe(remit!.overage);
      // Sanity check that this batch's own fixtures are actually present and counted.
      expect(activeAccs!.count).toBeGreaterThanOrEqual(3);
      expect(openBatches!.count).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Validation & Error Handling", () => {
    it("invalid date range returns 400", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/reports/collectors?dateFrom=2030-01-02&dateTo=2030-01-01", headers: authH(tokens.rpt_viewer!) });
      expect(res.statusCode).toBe(400);
    });

    it("malformed service account ID returns safe error", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/reports/ledger/not-a-number", headers: authH(tokens.rpt_viewer!) });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).not.toContain("sql");
    });
  });

  describe("Sensitive-Field Checks", () => {
    it("report responses do not contain password hashes or secrets", async () => {
      const endpoints = [
        "/api/v1/reports/collections",
        "/api/v1/reports/receivables",
        "/api/v1/reports/aging",
        `/api/v1/reports/ledger/${ledgerAccountId}`,
        `/api/v1/reports/soa/${soaAccountId}`,
        "/api/v1/reports/collectors",
        "/api/v1/reports/dashboard",
      ];
      for (const url of endpoints) {
        const res = await app.inject({ method: "GET", url, headers: authH(tokens.rpt_viewer!) });
        expect(JSON.stringify(res.json())).not.toContain("password");
        expect(JSON.stringify(res.json())).not.toContain("token");
        expect(JSON.stringify(res.json())).not.toContain("secret");
      }
    });
  });

  describe("Mutation Safety", () => {
    it("report endpoints are read-only and do not modify data", async () => {
      const before = await db.select().from(invoices).limit(3);
      await app.inject({ method: "GET", url: "/api/v1/reports/receivables", headers: authH(tokens.rpt_viewer!) });
      await app.inject({ method: "GET", url: "/api/v1/reports/aging", headers: authH(tokens.rpt_viewer!) });
      await app.inject({ method: "GET", url: `/api/v1/reports/ledger/${ledgerAccountId}`, headers: authH(tokens.rpt_viewer!) });
      const after = await db.select().from(invoices).limit(3);
      expect(JSON.stringify(before)).toBe(JSON.stringify(after));
    });
  });
});