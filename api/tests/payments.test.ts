import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../src/app";
import { db, pool } from "../src/db";
import {
  auditLogs,
  billingPeriods,
  collectionBatches,
  collectionBatchPayments,
  collectors,
  gcashPaymentDetails,
  invoices,
  invoiceAdjustments,
  invoiceLineItems,
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
import { and, eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
const createdUserIds: number[] = [];
const tokens: Record<string, string> = {};
let subscriberId: number;
let serviceId: number;
let planId: number;
let accountId: number;
let periodId: number;
const createdInvoiceIds: number[] = [];
const createdPaymentIds: number[] = [];
const createdPeriodIds: number[] = [];
const createdCollectorIds: number[] = [];
const createdBatchIds: number[] = [];
const createdExtraAccountIds: number[] = [];

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function mkUser(username: string, roleName: string) {
  const passwordHash = await hashPassword("S3cure!TestPassw0rd");
  const [u] = await db.insert(users).values({ username, email: `${username}@test.local`, fullName: username, passwordHash, status: "active" }).returning({ id: users.id });
  createdUserIds.push(u!.id);
  const [role] = await db.select().from(roles).where(eq(roles.name, roleName)).limit(1);
  await db.insert(userRoles).values({ userId: u!.id, roleId: role!.id });
  const res = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { identifier: username, password: "S3cure!TestPassw0rd" } });
  tokens[username] = res.json().token;
}

async function makeInvoice(account: number, period: number, invoiceNumber: string, total: string) {
  const [inv] = await db
    .insert(invoices)
    .values({ invoiceNumber, serviceAccountId: account, billingPeriodId: period, issueDate: new Date("2026-01-01"), dueDate: new Date("2099-01-31"), status: "unpaid", totalAmount: total })
    .returning();
  createdInvoiceIds.push(inv!.id);
  return inv!;
}

// Deterministic, monotonically-increasing dates far from any other fixture
// in this file or elsewhere in the suite — avoids the kind of random-date
// collision risk that comes from Date.now()-plus-small-jitter generators.
let gcashPeriodCounter = 0;
async function makeGcashPeriod() {
  gcashPeriodCounter += 1;
  const base = Date.UTC(2028, 0, 1) + gcashPeriodCounter * 86_400_000 * 40;
  const [p] = await db
    .insert(billingPeriods)
    .values({
      label: uid("GC-Period"),
      periodStart: new Date(base),
      periodEnd: new Date(base + 30 * 86_400_000),
      dueDate: new Date(base + 35 * 86_400_000),
    })
    .returning();
  createdPeriodIds.push(p!.id);
  return p!;
}

beforeAll(async () => {
  app = await buildApp();
  // Defensive pre-clean so a previously aborted run cannot poison state.
  await db.delete(userRoles).where(inArray(userRoles.userId, db.select({ id: users.id }).from(users).where(sql`${users.username} LIKE 'pay\_%'`)));
  await db.delete(users).where(sql`${users.username} LIKE 'pay\_%'`);
  await db.delete(paymentAllocations).where(sql`${paymentAllocations.paymentId} IN (SELECT id FROM payments WHERE service_account_id IN (SELECT id FROM service_accounts WHERE subscriber_id IN (SELECT id FROM subscribers WHERE account_number LIKE 'ACC-PAY-%')))`);
  await db.delete(paymentReversals).where(sql`${paymentReversals.paymentId} IN (SELECT id FROM payments WHERE service_account_id IN (SELECT id FROM service_accounts WHERE subscriber_id IN (SELECT id FROM subscribers WHERE account_number LIKE 'ACC-PAY-%')))`);
  await db.delete(payments).where(sql`${payments.serviceAccountId} IN (SELECT id FROM service_accounts WHERE subscriber_id IN (SELECT id FROM subscribers WHERE account_number LIKE 'ACC-PAY-%'))`);
  await db.delete(invoices).where(sql`${invoices.serviceAccountId} IN (SELECT id FROM service_accounts WHERE subscriber_id IN (SELECT id FROM subscribers WHERE account_number LIKE 'ACC-PAY-%'))`);
  await db.delete(serviceAccounts).where(sql`${serviceAccounts.subscriberId} IN (SELECT id FROM subscribers WHERE account_number LIKE 'ACC-PAY-%')`);
  await db.delete(subscribers).where(sql`${subscribers.accountNumber} LIKE 'ACC-PAY-%'`);
  await db.delete(servicePlans).where(eq(servicePlans.name, "Pay Plan"));
  await db.delete(services).where(eq(services.name, "Internet Pay"));
  await db.delete(billingPeriods).where(sql`${billingPeriods.label} IN ('Pay Period', 'Conc Pay')`);

  await mkUser("pay_owner", ROLE_NAMES.OWNER);
  await mkUser("pay_cashier", ROLE_NAMES.CASHIER);
  await mkUser("pay_acct", ROLE_NAMES.ACCOUNTING_AUDITOR);
  await mkUser("pay_viewer", ROLE_NAMES.READ_ONLY_VIEWER);

  const [sub] = await db.insert(subscribers).values({ accountNumber: "ACC-PAY-1", firstName: "Ana", lastName: "Reyes", addressLine1: "1 Main St", status: "active" }).returning();
  subscriberId = sub!.id;
  const [svc] = await db.insert(services).values({ type: "internet", name: "Internet Pay" }).returning();
  serviceId = svc!.id;
  const [plan] = await db.insert(servicePlans).values({ serviceId, name: "Pay Plan", price: "500.00" }).returning();
  planId = plan!.id;
  const [acc] = await db.insert(serviceAccounts).values({ subscriberId, planId, serviceNumber: "SVC-PAY-1", status: "active" }).returning();
  accountId = acc!.id;
  const [period] = await db.insert(billingPeriods).values({ label: uid("Pay Period"), periodStart: new Date("2026-01-01"), periodEnd: new Date("2026-01-31"), dueDate: new Date("2026-02-05") }).returning();
  periodId = period!.id;
});

afterAll(async () => {
  await db.delete(auditLogs).where(eq(auditLogs.entityType, "payment"));
  if (createdBatchIds.length) {
    await db.delete(collectionBatchPayments).where(inArray(collectionBatchPayments.batchId, createdBatchIds));
    await db.delete(collectionBatches).where(inArray(collectionBatches.id, createdBatchIds));
  }
  if (createdCollectorIds.length) {
    await db.delete(collectors).where(inArray(collectors.id, createdCollectorIds));
  }
  // Scoped by the comprehensive createdPaymentIds tracker (every payment
  // created across this whole file, cash and GCash alike, on accountId and
  // every per-test GCash account) rather than just accountId — otherwise
  // payments on the GCash tests' own per-test accounts leak past cleanup
  // and block the invoice delete below via FK restrict.
  if (createdPaymentIds.length) {
    await db.delete(paymentReversals).where(inArray(paymentReversals.paymentId, createdPaymentIds));
    await db.delete(gcashPaymentDetails).where(inArray(gcashPaymentDetails.paymentId, createdPaymentIds));
    await db.delete(paymentAllocations).where(inArray(paymentAllocations.paymentId, createdPaymentIds));
    await db.delete(payments).where(inArray(payments.id, createdPaymentIds));
  }
  await db.delete(payments).where(eq(payments.serviceAccountId, accountId));
  if (createdInvoiceIds.length) {
    await db.delete(invoiceAdjustments).where(inArray(invoiceAdjustments.invoiceId, createdInvoiceIds));
    await db.delete(invoiceLineItems).where(inArray(invoiceLineItems.invoiceId, createdInvoiceIds));
    await db.delete(invoices).where(inArray(invoices.id, createdInvoiceIds));
  }
  if (createdPeriodIds.length > 0) {
    await db.delete(billingPeriods).where(inArray(billingPeriods.id, createdPeriodIds));
  }
  await db.delete(billingPeriods).where(eq(billingPeriods.id, periodId));
  if (createdExtraAccountIds.length) {
    await db.delete(serviceAccounts).where(inArray(serviceAccounts.id, createdExtraAccountIds));
  }
  await db.delete(serviceAccounts).where(eq(serviceAccounts.id, accountId));
  await db.delete(servicePlans).where(eq(servicePlans.id, planId));
  await db.delete(services).where(eq(services.id, serviceId));
  await db.delete(subscribers).where(eq(subscribers.id, subscriberId));
  if (createdUserIds.length) {
    await db.delete(userRoles).where(inArray(userRoles.userId, createdUserIds));
    await db.delete(users).where(inArray(users.id, createdUserIds));
  }
  await app.close();
  await pool.end();
});

function auth(t: string) {
  return { authorization: `Bearer ${t}` };
}

async function postPayment(body: Record<string, unknown>, token = tokens.pay_cashier!) {
  return app.inject({ method: "POST", url: "/api/v1/payments", headers: auth(token), payload: body });
}

async function submitGcash(forAccountId: number, amount: string, token: string, refSuffix: string) {
  return postPayment(
    {
      serviceAccountId: forAccountId,
      amount,
      method: "gcash",
      gcash: { gcashReferenceNumber: uid(`GC-REF${refSuffix}`) },
    },
    token,
  );
}

function verifyPayment(paymentId: number, token: string, body: Record<string, unknown> = {}) {
  return app.inject({ method: "POST", url: `/api/v1/payments/${paymentId}/verify`, headers: auth(token), payload: body });
}

function rejectPayment(paymentId: number, token: string, body: Record<string, unknown>) {
  return app.inject({ method: "POST", url: `/api/v1/payments/${paymentId}/reject`, headers: auth(token), payload: body });
}

describe("payment posting", () => {
  it("rejects unauthenticated posting (401)", async () => {
    expect((await app.inject({ method: "POST", url: "/api/v1/payments", payload: {} })).statusCode).toBe(401);
  });

  it("rejects read-only viewer posting (403)", async () => {
    expect((await postPayment({ serviceAccountId: accountId, amount: "100.00", method: "cash" }, tokens.pay_viewer!)).statusCode).toBe(403);
  });

  it("rejects zero/negative amounts and invalid method", async () => {
    expect((await postPayment({ serviceAccountId: accountId, amount: "0.00", method: "cash" })).statusCode).toBe(400);
    expect((await postPayment({ serviceAccountId: accountId, amount: "-10.00", method: "cash" })).statusCode).toBe(400);
    expect((await postPayment({ serviceAccountId: accountId, amount: "10.00", method: "bitcoin" })).statusCode).toBe(400);
    expect((await postPayment({ serviceAccountId: 99999999, amount: "10.00", method: "cash" })).statusCode).toBe(400);
  });

  it("cash payment allocates exact to oldest invoice and marks it paid", async () => {
    const inv = await makeInvoice(accountId, periodId, "INV-P1", "500.00");
    const res = await postPayment({ serviceAccountId: accountId, amount: "500.00", method: "cash" });
    expect(res.statusCode).toBe(201);
    const d = res.json().data;
    expect(d.amount).toBe("500.00");
    expect(d.allocations).toEqual([{ invoiceId: inv.id, amount: "500.00" }]);
    expect(d.unappliedAmount).toBe("0.00");
    createdPaymentIds.push(d.id);

    const [invAfter] = await db.select().from(invoices).where(eq(invoices.id, inv.id));
    expect(invAfter!.status).toBe("paid");
  });

  // Invoices for the same service account must use distinct billing periods
  // (DB constraint: one invoice per service account per period).
  async function makePeriod(label: string) {
    const [p] = await db.insert(billingPeriods).values({ label, periodStart: new Date(`2026-${label}-01`), periodEnd: new Date(`2026-${label}-28`), dueDate: new Date(`2026-${label}-05`) }).returning();
    createdPeriodIds.push(p!.id);
    return p!;
  }

  it("partial payment leaves partially_paid", async () => {
    const p2 = await makePeriod('02');
    const inv = await makeInvoice(accountId, p2.id, "INV-P2", "500.00");
    const res = await postPayment({ serviceAccountId: accountId, amount: "300.00", method: "cheque" });
    expect(res.statusCode).toBe(201);
    createdPaymentIds.push(res.json().data.id);
    const [invAfter] = await db.select().from(invoices).where(eq(invoices.id, inv.id));
    expect(invAfter!.status).toBe("partially_paid");
  });

  it("oldest-first multi-invoice allocation", async () => {
    // INV-P2 has 200 remaining. New payment 250 should cover 200 + 50 on INV-P3.
    const p3 = await makePeriod('03');
    const inv3 = await makeInvoice(accountId, p3.id, "INV-P3", "700.00");
    const res = await postPayment({ serviceAccountId: accountId, amount: "250.00", method: "bank_transfer" });
    expect(res.statusCode).toBe(201);
    const d = res.json().data;
    const allocMap = new Map(d.allocations.map((a: { invoiceId: number; amount: string }) => [a.invoiceId, a.amount]));
    const p2 = createdInvoiceIds[1]!;
    expect(allocMap.get(p2)).toBe("200.00");
    expect(allocMap.get(inv3.id)).toBe("50.00");
    createdPaymentIds.push(d.id);

    const [i2] = await db.select().from(invoices).where(eq(invoices.id, p2));
    expect(i2!.status).toBe("paid");
    const [i3] = await db.select().from(invoices).where(eq(invoices.id, inv3.id));
    expect(i3!.status).toBe("partially_paid");
  });

  it("advance payment preserves unapplied amount", async () => {
    // Outstanding balance on INV-P3: 650. Pay 2000 -> 650 allocated, 1350 unapplied.
    const inv3 = createdInvoiceIds[2]!;
    const res = await postPayment({ serviceAccountId: accountId, amount: "2000.00", method: "other" });
    expect(res.statusCode).toBe(201);
    const d = res.json().data;
    createdPaymentIds.push(d.id);
    expect(d.unappliedAmount).toBe("1350.00");
    const p3alloc = d.allocations.find((a: { invoiceId: number }) => a.invoiceId === inv3);
    expect(p3alloc.amount).toBe("650.00");
    const [i3] = await db.select().from(invoices).where(eq(invoices.id, inv3));
    expect(i3!.status).toBe("paid");
  });

  it("GCash payment records pending verification and rejects duplicate references", async () => {
    const res = await postPayment({
      serviceAccountId: accountId,
      amount: "100.00",
      method: "gcash",
      gcash: { gcashReferenceNumber: "GC-DUP-1", proofAttachmentPath: "attachments/gc1.png" },
    });
    expect(res.statusCode).toBe(201);
    const pid = res.json().data.id;
    createdPaymentIds.push(pid);

    const [detail] = await db.select().from(gcashPaymentDetails).where(eq(gcashPaymentDetails.paymentId, pid));
    expect(detail!.verificationStatus).toBe("pending");
    expect(detail!.gcashReferenceNumber).toBe("GC-DUP-1");

    const dup = await postPayment({
      serviceAccountId: accountId,
      amount: "50.00",
      method: "gcash",
      gcash: { gcashReferenceNumber: "GC-DUP-1" },
    });
    expect(dup.statusCode).toBe(409);
  });

  it("audit log rows exist for posting", async () => {
    const [row] = await db.select().from(auditLogs).where(eq(auditLogs.action, "payment.post")).limit(1);
    expect(row).toBeTruthy();
    expect(row!.entityType).toBe("payment");
    expect(JSON.stringify(row!.metadata)).not.toContain("password");
  });
});

describe("payment reversal", () => {
  it("reverses payment, restores invoice state, writes audit row", async () => {
    // Find the exact payment from the first test (INV-P1 paid 500).
    const allocs = await db.select().from(paymentAllocations).where(eq(paymentAllocations.invoiceId, createdInvoiceIds[0]!));
    const paymentId = allocs[0]!.paymentId;

    const res = await app.inject({ method: "POST", url: `/api/v1/payments/${paymentId}/reverse`, headers: auth(tokens.pay_acct!), payload: { reason: "Posted in error" } });
    expect(res.statusCode).toBe(200);

    const [inv] = await db.select().from(invoices).where(eq(invoices.id, createdInvoiceIds[0]!));
    expect(inv!.status).toBe("unpaid");

    const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId));
    expect(payment!.status).toBe("reversed");

    // Allocation rows preserved.
    const allocsAfter = await db.select().from(paymentAllocations).where(eq(paymentAllocations.paymentId, paymentId));
    expect(allocsAfter).toHaveLength(1);

    const [auditRow] = await db.select().from(auditLogs).where(eq(auditLogs.action, "payment.reverse")).limit(1);
    expect(auditRow).toBeTruthy();
  });

  it("rejects double reversal with 409", async () => {
    const allocs = await db.select().from(paymentAllocations).where(eq(paymentAllocations.invoiceId, createdInvoiceIds[0]!));
    const paymentId = allocs[0]!.paymentId;
    const res = await app.inject({ method: "POST", url: `/api/v1/payments/${paymentId}/reverse`, headers: auth(tokens.pay_acct!), payload: { reason: "again" } });
    expect(res.statusCode).toBe(409);
  });

  it("forbids viewer from reversing (403)", async () => {
    const allocs = await db.select().from(paymentAllocations).where(eq(paymentAllocations.invoiceId, createdInvoiceIds[0]!));
    const res = await app.inject({ method: "POST", url: `/api/v1/payments/${allocs[0]!.paymentId}/reverse`, headers: auth(tokens.pay_viewer!), payload: { reason: "x" } });
    expect(res.statusCode).toBe(403);
  });
});

describe("concurrency", () => {
  it("two concurrent payments cannot over-allocate the same invoice", async () => {
    const [acc2] = await db.insert(serviceAccounts).values({ subscriberId, planId, serviceNumber: "SVC-PAY-2", status: "active" }).returning();
    const [p2] = await db.insert(billingPeriods).values({ label: "Conc Pay", periodStart: new Date("2026-03-01"), periodEnd: new Date("2026-03-31"), dueDate: new Date("2026-04-05") }).returning();
    const inv = await makeInvoice(acc2!.id, p2!.id, "INV-CONC-1", "500.00");

    const results = await Promise.all([
      postPayment({ serviceAccountId: acc2!.id, amount: "300.00", method: "cash" }),
      postPayment({ serviceAccountId: acc2!.id, amount: "300.00", method: "cash" }),
    ]);

    const bothPayments = results.map((r) => r.statusCode);
    expect(bothPayments).toEqual([201, 201]);

    for (const r of results) createdPaymentIds.push(r.json().data.id);

    const [allocSum] = await db
      .select({ total: sql<string>`coalesce(sum(${paymentAllocations.amount}), 0)::numeric(14,2)` })
      .from(paymentAllocations)
      .innerJoin(payments, eq(payments.id, paymentAllocations.paymentId))
      .where(and(eq(paymentAllocations.invoiceId, inv.id), eq(payments.status, "posted")));
    expect(allocSum!.total).toBe("500.00");

    const [invAfter] = await db.select().from(invoices).where(eq(invoices.id, inv.id));
    expect(invAfter!.status).toBe("paid");

    await db.delete(paymentAllocations).where(inArray(paymentAllocations.paymentId, createdPaymentIds.slice(-2)));
    await db.delete(invoiceAdjustments).where(eq(invoiceAdjustments.invoiceId, inv.id));
    await db.delete(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, inv.id));
    await db.delete(invoices).where(eq(invoices.id, inv.id));
    createdInvoiceIds.pop();
    for (const id of createdPaymentIds.slice(-2)) {
      await db.delete(payments).where(eq(payments.id, id));
    }
    createdPaymentIds.splice(-2, 2);
    await db.delete(billingPeriods).where(eq(billingPeriods.id, p2!.id));
    await db.delete(serviceAccounts).where(eq(serviceAccounts.id, acc2!.id));
  });
});

// Each GCash test below gets its own brand-new service account rather than
// sharing one across the describe block: several of these tests deliberately
// leave a GCash payment pending/unresolved to test that exact state, which
// would otherwise leave an open invoice behind to race oldest-first
// allocation against whatever the next test creates (the same reason the
// "concurrency" block above creates its own fresh account per test).
async function makeGcashAccount(): Promise<number> {
  const [acc] = await db
    .insert(serviceAccounts)
    .values({ subscriberId, planId, serviceNumber: uid("SVC-PAY-GC"), status: "active" })
    .returning();
  createdExtraAccountIds.push(acc!.id);
  return acc!.id;
}

describe("GCash verification and rejection", () => {
  it("GCash submission is held pending with no allocation or invoice balance change", async () => {
    const gcashAccountId = await makeGcashAccount();
    const period = await makeGcashPeriod();
    const inv = await makeInvoice(gcashAccountId, period.id, uid("INV-GC-PEND"), "123.45");

    const res = await submitGcash(gcashAccountId, "123.45", tokens.pay_cashier!, "-PEND");
    expect(res.statusCode).toBe(201);
    const d = res.json().data;
    expect(d.status).toBe("pending");
    expect(d.allocations).toEqual([]);
    expect(d.unappliedAmount).toBe("123.45");
    createdPaymentIds.push(d.id);

    const [invAfter] = await db.select().from(invoices).where(eq(invoices.id, inv.id));
    expect(invAfter!.status).toBe("unpaid");

    const detailRes = await app.inject({ method: "GET", url: `/api/v1/payments/${d.id}`, headers: auth(tokens.pay_viewer!) });
    expect(detailRes.statusCode).toBe(200);
    const detail = detailRes.json().data;
    expect(detail.status).toBe("pending");
    expect(detail.allocations).toEqual([]);
    expect(detail.gcash.verificationStatus).toBe("pending");
    expect(detail.unappliedAmount).toBe("123.45");

    const allocs = await db.select().from(paymentAllocations).where(eq(paymentAllocations.paymentId, d.id));
    expect(allocs).toHaveLength(0);
  });

  it("pending GCash payment is excluded from receivables, collections, and dashboard totals, and cannot be added to a collection batch", async () => {
    const gcashAccountId = await makeGcashAccount();
    const period = await makeGcashPeriod();
    const inv = await makeInvoice(gcashAccountId, period.id, uid("INV-GC-EXCL"), "300.00");

    const before = await app.inject({ method: "GET", url: "/api/v1/reports/dashboard", headers: auth(tokens.pay_viewer!) });
    const beforeData = before.json().data;
    const beforeCollections = await app.inject({ method: "GET", url: "/api/v1/reports/collections", headers: auth(tokens.pay_viewer!) });
    const beforeCollectionsTotal = beforeCollections.json().data.totalCollected;

    const res = await submitGcash(gcashAccountId, "300.00", tokens.pay_cashier!, "-EXCL");
    expect(res.statusCode).toBe(201);
    const paymentId = res.json().data.id;
    createdPaymentIds.push(paymentId);

    // Invoice balance must be completely unaffected by the pending submission.
    const [invAfter] = await db.select().from(invoices).where(eq(invoices.id, inv.id));
    expect(invAfter!.status).toBe("unpaid");

    const receivablesRes = await app.inject({
      method: "GET",
      url: `/api/v1/receivables/service-accounts/${gcashAccountId}`,
      headers: auth(tokens.pay_viewer!),
    });
    expect(receivablesRes.statusCode).toBe(200);
    const invoiceEntry = receivablesRes.json().data.invoices.find((i: { invoiceId: number }) => i.invoiceId === inv.id);
    expect(invoiceEntry).toBeTruthy();
    expect(invoiceEntry.balance).toBe("300.00");

    // Dashboard/collections totals must be byte-for-byte unchanged by a pending submission.
    const after = await app.inject({ method: "GET", url: "/api/v1/reports/dashboard", headers: auth(tokens.pay_viewer!) });
    const afterData = after.json().data;
    expect(afterData.currentMonthPostedCollectionTotal).toBe(beforeData.currentMonthPostedCollectionTotal);
    expect(afterData.totalOutstandingAr).toBe(beforeData.totalOutstandingAr);
    expect(afterData.totalOverdueAr).toBe(beforeData.totalOverdueAr);

    const collectionsRes = await app.inject({ method: "GET", url: "/api/v1/reports/collections", headers: auth(tokens.pay_viewer!) });
    expect(collectionsRes.json().data.totalCollected).toBe(beforeCollectionsTotal);

    // A pending payment is not "posted" and must be rejected from a collection batch.
    const [collector] = await db.insert(collectors).values({ fullName: uid("GC Collector"), status: "active" }).returning();
    createdCollectorIds.push(collector!.id);
    const batchRes = await app.inject({
      method: "POST",
      url: "/api/v1/collection-batches",
      headers: auth(tokens.pay_owner!),
      payload: { collectorId: collector!.id, batchDate: "2028-01-01" },
    });
    expect(batchRes.statusCode).toBe(201);
    const batchId = batchRes.json().data.id;
    createdBatchIds.push(batchId);
    const addRes = await app.inject({
      method: "POST",
      url: `/api/v1/collection-batches/${batchId}/payments`,
      headers: auth(tokens.pay_owner!),
      payload: { paymentId },
    });
    expect(addRes.statusCode).toBe(400);
  });

  it("authorized reviewer verifies a pending GCash payment: posts, allocates, records metadata and audit log", async () => {
    const gcashAccountId = await makeGcashAccount();
    const period = await makeGcashPeriod();
    const inv = await makeInvoice(gcashAccountId, period.id, uid("INV-GC-VERIFY"), "400.00");
    const res = await submitGcash(gcashAccountId, "400.00", tokens.pay_cashier!, "-VERIFY");
    const paymentId = res.json().data.id;
    createdPaymentIds.push(paymentId);

    const verifyRes = await verifyPayment(paymentId, tokens.pay_acct!, { note: "Confirmed in GCash business dashboard" });
    expect(verifyRes.statusCode).toBe(200);
    const d = verifyRes.json().data;
    expect(d.status).toBe("posted");
    expect(d.allocations).toEqual([{ invoiceId: inv.id, amount: "400.00" }]);
    expect(d.unappliedAmount).toBe("0.00");

    const [invAfter] = await db.select().from(invoices).where(eq(invoices.id, inv.id));
    expect(invAfter!.status).toBe("paid");

    const [gcashAfter] = await db.select().from(gcashPaymentDetails).where(eq(gcashPaymentDetails.paymentId, paymentId));
    expect(gcashAfter!.verificationStatus).toBe("verified");
    expect(gcashAfter!.verificationNote).toBe("Confirmed in GCash business dashboard");
    expect(gcashAfter!.verifiedAt).toBeTruthy();

    const [acctUser] = await db.select().from(users).where(eq(users.username, "pay_acct"));
    expect(gcashAfter!.verifiedByUserId).toBe(acctUser!.id);

    const [auditRow] = await db.select().from(auditLogs).where(eq(auditLogs.action, "payment.gcash_verify")).limit(1);
    expect(auditRow).toBeTruthy();
    expect(JSON.stringify(auditRow!.metadata)).not.toContain("password");
  });

  it("verification allocates oldest-first across multiple invoices with exact remainder", async () => {
    const gcashAccountId = await makeGcashAccount();
    const period1 = await makeGcashPeriod();
    const period2 = await makeGcashPeriod();
    const invA = await makeInvoice(gcashAccountId, period1.id, uid("INV-GC-MULTI-A"), "400.00");
    const invB = await makeInvoice(gcashAccountId, period2.id, uid("INV-GC-MULTI-B"), "250.00");

    const res = await submitGcash(gcashAccountId, "500.00", tokens.pay_cashier!, "-MULTI");
    const paymentId = res.json().data.id;
    createdPaymentIds.push(paymentId);

    const verifyRes = await verifyPayment(paymentId, tokens.pay_owner!);
    expect(verifyRes.statusCode).toBe(200);
    const d = verifyRes.json().data;
    const allocMap = new Map(d.allocations.map((a: { invoiceId: number; amount: string }) => [a.invoiceId, a.amount]));
    expect(allocMap.get(invA.id)).toBe("400.00");
    expect(allocMap.get(invB.id)).toBe("100.00");
    expect(d.unappliedAmount).toBe("0.00");

    const [aAfter] = await db.select().from(invoices).where(eq(invoices.id, invA.id));
    expect(aAfter!.status).toBe("paid");
    const [bAfter] = await db.select().from(invoices).where(eq(invoices.id, invB.id));
    expect(bAfter!.status).toBe("partially_paid");
  });

  it("rejecting a pending GCash payment requires a reason and creates no allocations", async () => {
    const gcashAccountId = await makeGcashAccount();
    const period = await makeGcashPeriod();
    const inv = await makeInvoice(gcashAccountId, period.id, uid("INV-GC-REJECT"), "90.00");
    const res = await submitGcash(gcashAccountId, "90.00", tokens.pay_cashier!, "-REJECT");
    const paymentId = res.json().data.id;
    createdPaymentIds.push(paymentId);

    const noReason = await rejectPayment(paymentId, tokens.pay_owner!, {});
    expect(noReason.statusCode).toBe(400);

    const reason = "GCash reference could not be matched to any incoming transfer";
    const rejectRes = await rejectPayment(paymentId, tokens.pay_owner!, { reason });
    expect(rejectRes.statusCode).toBe(200);
    expect(rejectRes.json().data).toEqual({ paymentId, status: "cancelled" });

    const [paymentAfter] = await db.select().from(payments).where(eq(payments.id, paymentId));
    expect(paymentAfter!.status).toBe("cancelled");

    const allocs = await db.select().from(paymentAllocations).where(eq(paymentAllocations.paymentId, paymentId));
    expect(allocs).toHaveLength(0);

    const [invAfter] = await db.select().from(invoices).where(eq(invoices.id, inv.id));
    expect(invAfter!.status).toBe("unpaid");

    const [gcashAfter] = await db.select().from(gcashPaymentDetails).where(eq(gcashPaymentDetails.paymentId, paymentId));
    expect(gcashAfter!.verificationStatus).toBe("rejected");
    expect(gcashAfter!.verificationNote).toBe(reason);

    const [ownerUser] = await db.select().from(users).where(eq(users.username, "pay_owner"));
    expect(gcashAfter!.verifiedByUserId).toBe(ownerUser!.id);

    const [auditRow] = await db.select().from(auditLogs).where(eq(auditLogs.action, "payment.gcash_reject")).limit(1);
    expect(auditRow).toBeTruthy();
  });

  it("cashier and viewer cannot verify or reject a pending GCash payment (403), and anonymous requests are rejected (401)", async () => {
    const gcashAccountId = await makeGcashAccount();
    const period = await makeGcashPeriod();
    await makeInvoice(gcashAccountId, period.id, uid("INV-GC-AUTHZ"), "120.00");
    // Submitted by the owner so these attempts are purely role-based, not self-review.
    const res = await submitGcash(gcashAccountId, "120.00", tokens.pay_owner!, "-AUTHZ");
    const paymentId = res.json().data.id;
    createdPaymentIds.push(paymentId);

    expect((await verifyPayment(paymentId, tokens.pay_cashier!)).statusCode).toBe(403);
    expect((await rejectPayment(paymentId, tokens.pay_viewer!, { reason: "no" })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: `/api/v1/payments/${paymentId}/verify`, payload: {} })).statusCode).toBe(401);
  });

  it("a reviewer cannot verify or reject their own submission (separation of duties)", async () => {
    const gcashAccountId = await makeGcashAccount();
    const period = await makeGcashPeriod();
    await makeInvoice(gcashAccountId, period.id, uid("INV-GC-SELF"), "150.00");
    // pay_owner is authorized to verify (Owner role) but submits this one themselves.
    const res = await submitGcash(gcashAccountId, "150.00", tokens.pay_owner!, "-SELF");
    const paymentId = res.json().data.id;
    createdPaymentIds.push(paymentId);

    const selfVerify = await verifyPayment(paymentId, tokens.pay_owner!);
    expect(selfVerify.statusCode).toBe(403);
    const selfReject = await rejectPayment(paymentId, tokens.pay_owner!, { reason: "self attempt" });
    expect(selfReject.statusCode).toBe(403);

    // The blocked attempts must not have mutated anything.
    const [stillPending] = await db.select().from(payments).where(eq(payments.id, paymentId));
    expect(stillPending!.status).toBe("pending");

    // A different authorized reviewer can still complete it.
    const otherVerify = await verifyPayment(paymentId, tokens.pay_acct!);
    expect(otherVerify.statusCode).toBe(200);
    expect(otherVerify.json().data.status).toBe("posted");
  });

  it("verify rejects a nonexistent payment, a non-GCash method, and an already-decided payment", async () => {
    const notFound = await verifyPayment(99999999, tokens.pay_acct!);
    expect(notFound.statusCode).toBe(404);

    // The very first payment in this file is a cash payment and is never pending.
    const cashPaymentId = createdPaymentIds[0]!;
    const wrongMethod = await verifyPayment(cashPaymentId, tokens.pay_acct!);
    expect(wrongMethod.statusCode).toBe(400);

    const gcashAccountId = await makeGcashAccount();
    const period = await makeGcashPeriod();
    await makeInvoice(gcashAccountId, period.id, uid("INV-GC-STATE"), "60.00");
    const res = await submitGcash(gcashAccountId, "60.00", tokens.pay_cashier!, "-STATE");
    const paymentId = res.json().data.id;
    createdPaymentIds.push(paymentId);

    const firstVerify = await verifyPayment(paymentId, tokens.pay_acct!);
    expect(firstVerify.statusCode).toBe(200);

    const secondVerify = await verifyPayment(paymentId, tokens.pay_owner!);
    expect(secondVerify.statusCode).toBe(409);

    const rejectAfterVerify = await rejectPayment(paymentId, tokens.pay_owner!, { reason: "too late" });
    expect(rejectAfterVerify.statusCode).toBe(409);
  });

  it("reject rejects an already-rejected payment, and verify rejects an already-rejected payment, with 409", async () => {
    const gcashAccountId = await makeGcashAccount();
    const period = await makeGcashPeriod();
    await makeInvoice(gcashAccountId, period.id, uid("INV-GC-STATE2"), "70.00");
    const res = await submitGcash(gcashAccountId, "70.00", tokens.pay_cashier!, "-STATE2");
    const paymentId = res.json().data.id;
    createdPaymentIds.push(paymentId);

    const firstReject = await rejectPayment(paymentId, tokens.pay_acct!, { reason: "first" });
    expect(firstReject.statusCode).toBe(200);

    const secondReject = await rejectPayment(paymentId, tokens.pay_owner!, { reason: "second" });
    expect(secondReject.statusCode).toBe(409);

    const verifyAfterReject = await verifyPayment(paymentId, tokens.pay_owner!);
    expect(verifyAfterReject.statusCode).toBe(409);
  });

  it("concurrent verify requests on the same pending payment: exactly one succeeds, no duplicate allocation", async () => {
    const gcashAccountId = await makeGcashAccount();
    const period = await makeGcashPeriod();
    const inv = await makeInvoice(gcashAccountId, period.id, uid("INV-GC-CONCV"), "80.00");
    const res = await submitGcash(gcashAccountId, "80.00", tokens.pay_cashier!, "-CONCV");
    const paymentId = res.json().data.id;
    createdPaymentIds.push(paymentId);

    const results = await Promise.all([
      verifyPayment(paymentId, tokens.pay_acct!),
      verifyPayment(paymentId, tokens.pay_owner!),
    ]);
    const statuses = results.map((r) => r.statusCode).sort();
    expect(statuses).toEqual([200, 409]);

    const allocs = await db.select().from(paymentAllocations).where(eq(paymentAllocations.paymentId, paymentId));
    expect(allocs).toHaveLength(1);
    expect(allocs[0]!.amount).toBe("80.00");

    const [invAfter] = await db.select().from(invoices).where(eq(invoices.id, inv.id));
    expect(invAfter!.status).toBe("paid");
  });

  it("concurrent verify and reject race on the same pending payment: exactly one succeeds, end state is consistent", async () => {
    const gcashAccountId = await makeGcashAccount();
    const period = await makeGcashPeriod();
    const inv = await makeInvoice(gcashAccountId, period.id, uid("INV-GC-CONCVR"), "95.00");
    const res = await submitGcash(gcashAccountId, "95.00", tokens.pay_cashier!, "-CONCVR");
    const paymentId = res.json().data.id;
    createdPaymentIds.push(paymentId);

    const [verifyResult, rejectResult] = await Promise.all([
      verifyPayment(paymentId, tokens.pay_acct!),
      rejectPayment(paymentId, tokens.pay_owner!, { reason: "race" }),
    ]);
    const statuses = [verifyResult.statusCode, rejectResult.statusCode].sort();
    expect(statuses).toEqual([200, 409]);

    const [paymentAfter] = await db.select().from(payments).where(eq(payments.id, paymentId));
    const allocs = await db.select().from(paymentAllocations).where(eq(paymentAllocations.paymentId, paymentId));
    const [invAfter] = await db.select().from(invoices).where(eq(invoices.id, inv.id));

    if (paymentAfter!.status === "posted") {
      expect(allocs).toHaveLength(1);
      expect(invAfter!.status).toBe("paid");
    } else {
      expect(paymentAfter!.status).toBe("cancelled");
      expect(allocs).toHaveLength(0);
      expect(invAfter!.status).toBe("unpaid");
    }
  });

  it("pending and cancelled GCash payments cannot be reversed (409)", async () => {
    const gcashAccountId = await makeGcashAccount();
    const period1 = await makeGcashPeriod();
    await makeInvoice(gcashAccountId, period1.id, uid("INV-GC-REVG1"), "40.00");
    const pendingRes = await submitGcash(gcashAccountId, "40.00", tokens.pay_cashier!, "-REVG1");
    const pendingId = pendingRes.json().data.id;
    createdPaymentIds.push(pendingId);

    const reverseWhilePending = await app.inject({
      method: "POST",
      url: `/api/v1/payments/${pendingId}/reverse`,
      headers: auth(tokens.pay_acct!),
      payload: { reason: "too soon" },
    });
    expect(reverseWhilePending.statusCode).toBe(409);

    const period2 = await makeGcashPeriod();
    await makeInvoice(gcashAccountId, period2.id, uid("INV-GC-REVG2"), "45.00");
    const rejectedRes = await submitGcash(gcashAccountId, "45.00", tokens.pay_cashier!, "-REVG2");
    const rejectedId = rejectedRes.json().data.id;
    createdPaymentIds.push(rejectedId);
    await rejectPayment(rejectedId, tokens.pay_owner!, { reason: "rejecting" });

    const reverseWhileCancelled = await app.inject({
      method: "POST",
      url: `/api/v1/payments/${rejectedId}/reverse`,
      headers: auth(tokens.pay_acct!),
      payload: { reason: "also too late" },
    });
    expect(reverseWhileCancelled.statusCode).toBe(409);
  });

  it("a verified GCash payment can be reversed like any posted payment", async () => {
    const gcashAccountId = await makeGcashAccount();
    const period = await makeGcashPeriod();
    const inv = await makeInvoice(gcashAccountId, period.id, uid("INV-GC-REVOK"), "55.00");
    const res = await submitGcash(gcashAccountId, "55.00", tokens.pay_cashier!, "-REVOK");
    const paymentId = res.json().data.id;
    createdPaymentIds.push(paymentId);

    await verifyPayment(paymentId, tokens.pay_acct!);

    const reverseRes = await app.inject({
      method: "POST",
      url: `/api/v1/payments/${paymentId}/reverse`,
      headers: auth(tokens.pay_owner!),
      payload: { reason: "customer disputed the GCash transfer" },
    });
    expect(reverseRes.statusCode).toBe(200);

    const [paymentAfter] = await db.select().from(payments).where(eq(payments.id, paymentId));
    expect(paymentAfter!.status).toBe("reversed");

    const [invAfter] = await db.select().from(invoices).where(eq(invoices.id, inv.id));
    expect(invAfter!.status).toBe("unpaid");
  });
});
