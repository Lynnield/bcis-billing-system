import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../src/app";
import { db, pool } from "../src/db";
import {
  auditLogs,
  billingPeriods,
  collectionBatches,
  collectionBatchPayments,
  collectors,
  roles,
  serviceAccounts,
  servicePlans,
  services,
  subscribers,
  userRoles,
  users,
  invoices,
  invoiceLineItems,
  paymentAllocations,
  payments,
} from "../src/db/schema";
import { hashPassword } from "../src/lib/password";
import { ROLE_NAMES } from "../src/lib/roles";
import { eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
const createdUserIds: number[] = [];
const createdCollectorIds: number[] = [];
const createdBatchIds: number[] = [];
const createdPaymentIds: number[] = [];
const createdInvoiceIds: number[] = [];
const createdPeriodIds: number[] = [];
const tokens: Record<string, string> = {};
let collectorId: number;

async function mkUser(username: string, roleName: string) {
  const passwordHash = await hashPassword("S3cure!TestPassw0rd");
  const [u] = await db.insert(users).values({ username, email: `${username}@test.local`, fullName: username, passwordHash, status: "active" }).returning({ id: users.id });
  createdUserIds.push(u!.id);
  const [role] = await db.select().from(roles).where(eq(roles.name, roleName)).limit(1);
  await db.insert(userRoles).values({ userId: u!.id, roleId: role!.id });
  const res = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { identifier: username, password: "S3cure!TestPassw0rd" } });
  tokens[username] = res.json().token;
}

let mkPaymentPeriodCounter = 0;

async function mkPayment(amount: string, method: "cash" | "gcash" | "bank_transfer" = "cash") {
  const [sub] = await db.insert(subscribers).values({ accountNumber: `ACC-CB-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, firstName: "Test", lastName: "Sub", addressLine1: "1 Way", status: "active" }).returning();
  const [svc] = await db.insert(services).values({ type: "internet", name: `SVC-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }).returning();
  const [plan] = await db.insert(servicePlans).values({ serviceId: svc!.id, name: `Plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, price: amount }).returning();
  const [acc] = await db.insert(serviceAccounts).values({ subscriberId: sub!.id, planId: plan!.id, serviceNumber: `S-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, status: "active" }).returning();
  const groupKey = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  mkPaymentPeriodCounter += 1;
  const now = Date.now() + mkPaymentPeriodCounter * 1000000000;
  const periodStart = new Date(now);
  const periodEnd = new Date(now + 30 * 86400000);
  const dueDate = new Date(now + 27 * 86400000);
  const [period] = await db.insert(billingPeriods).values({ label: `CB-${groupKey}`, periodStart, periodEnd, dueDate }).returning();
  createdPeriodIds.push(period!.id);
  // [account, subscriberId, serviceId, planId]
  accountsMeta.push({ accountId: acc!.id, subscriberId: sub!.id, serviceId: svc!.id, planId: plan!.id });
  const [inv] = await db.insert(invoices).values({ invoiceNumber: `INV-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, serviceAccountId: acc!.id, billingPeriodId: period!.id, issueDate: new Date(), dueDate: new Date(), status: "unpaid", totalAmount: amount }).returning();
  createdInvoiceIds.push(inv!.id);
  const [pay] = await db.insert(payments).values({ serviceAccountId: acc!.id, method, amount, paymentDate: new Date(), status: "posted" }).returning();
  createdPaymentIds.push(pay!.id);
  // Allocate so it can be posted consistently
  await db.insert(paymentAllocations).values({ paymentId: pay!.id, invoiceId: inv!.id, amount });
  await db.update(invoices).set({ status: "paid" }).where(eq(invoices.id, inv!.id));
  return pay!;
}

const accountsMeta: Array<{ accountId: number; subscriberId: number; serviceId: number; planId: number }> = [];

beforeAll(async () => {
  app = await buildApp();
  await mkUser("cb_owner", ROLE_NAMES.OWNER);
  await mkUser("cb_cashier", ROLE_NAMES.CASHIER);
  await mkUser("cb_supervisor", ROLE_NAMES.COLLECTION_SUPERVISOR);
  await mkUser("cb_acct", ROLE_NAMES.ACCOUNTING_AUDITOR);
  await mkUser("cb_viewer", ROLE_NAMES.READ_ONLY_VIEWER);
  const [col] = await db.insert(collectors).values({ fullName: "Collector One", status: "active" }).returning();
  collectorId = col!.id;
  createdCollectorIds.push(collectorId);
});

afterAll(async () => {
  await db.delete(auditLogs).where(eq(auditLogs.entityType, "collection_batch"));
  if (createdBatchIds.length) {
    await db.delete(collectionBatchPayments).where(inArray(collectionBatchPayments.batchId, createdBatchIds));
    await db.delete(collectionBatches).where(inArray(collectionBatches.id, createdBatchIds));
  }
  if (createdPaymentIds.length) {
    await db.delete(paymentAllocations).where(inArray(paymentAllocations.paymentId, createdPaymentIds));
    await db.delete(payments).where(inArray(payments.id, createdPaymentIds));
  }
  if (createdInvoiceIds.length) {
    await db.delete(invoiceLineItems).where(inArray(invoiceLineItems.invoiceId, createdInvoiceIds));
    await db.delete(invoices).where(inArray(invoices.id, createdInvoiceIds));
  }
  if (createdPeriodIds.length) await db.delete(billingPeriods).where(inArray(billingPeriods.id, createdPeriodIds));
  for (const m of accountsMeta) {
    await db.delete(serviceAccounts).where(eq(serviceAccounts.id, m.accountId));
    await db.delete(servicePlans).where(eq(servicePlans.id, m.planId));
    await db.delete(services).where(eq(services.id, m.serviceId));
    await db.delete(subscribers).where(eq(subscribers.id, m.subscriberId));
  }
  if (createdCollectorIds.length) await db.delete(collectors).where(inArray(collectors.id, createdCollectorIds));
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

async function createBatch(token = tokens.cb_cashier!, batchDate = "2026-04-15") {
  const res = await app.inject({ method: "POST", url: "/api/v1/collection-batches", headers: auth(token), payload: { collectorId, batchDate } });
  if (res.statusCode === 201) createdBatchIds.push(res.json().data.id);
  return res;
}

describe("collection batches", () => {
  it("rejects unauthenticated creation (401)", async () => {
    expect((await app.inject({ method: "POST", url: "/api/v1/collection-batches", payload: {} })).statusCode).toBe(401);
  });

  it("rejects viewer creation (403)", async () => {
    expect((await createBatch(tokens.cb_viewer!)).statusCode).toBe(403);
  });

  it("creates a batch", async () => {
    const res = await createBatch();
    expect(res.statusCode).toBe(201);
    expect(res.json().data.status).toBe("open");
  });

  it("rejects invalid collector (400)", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/collection-batches", headers: auth(tokens.cb_cashier!), payload: { collectorId: 99999999, batchDate: "2026-04-15" } });
    expect(res.statusCode).toBe(400);
  });

  it("views batches per RBAC", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/collection-batches", headers: auth(tokens.cb_viewer!) });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().data)).toBe(true);
  });

  let addBatchId: number;

  it("adds payments and computes expected amount", async () => {
    const batchRes = await createBatch();
    addBatchId = batchRes.json().data.id;
    const p1 = await mkPayment("500.00");
    const p2 = await mkPayment("300.00");
    const p3 = await mkPayment("200.00");

    for (const pid of [p1.id, p2.id, p3.id]) {
      const add = await app.inject({ method: "POST", url: `/api/v1/collection-batches/${addBatchId}/payments`, headers: auth(tokens.cb_cashier!), payload: { paymentId: pid } });
      expect(add.statusCode).toBe(201);
    }

    const detail = await app.inject({ method: "GET", url: `/api/v1/collection-batches/${addBatchId}`, headers: auth(tokens.cb_acct!) });
    expect(detail.json().data.expectedAmount).toBe("1000.00");
    expect(detail.json().data.expectedAmountComputed).toBe("1000.00");
  });

  it("reversed payment cannot be added (400)", async () => {
    const batchRes = await createBatch();
    const batchId = batchRes.json().data.id;
    const pay = await mkPayment("100.00");
    await db.update(payments).set({ status: "reversed" }).where(eq(payments.id, pay.id));
    const res = await app.inject({ method: "POST", url: `/api/v1/collection-batches/${batchId}/payments`, headers: auth(tokens.cb_cashier!), payload: { paymentId: pay.id } });
    expect(res.statusCode).toBe(400);
  });

  it("duplicate payment in same batch -> 409", async () => {
    // Use batch from earlier test (index 1 in createdBatchIds) and first payment
    const list = await db.select().from(collectionBatchPayments).where(eq(collectionBatchPayments.batchId, addBatchId)).limit(1);
    const res = await app.inject({ method: "POST", url: `/api/v1/collection-batches/${addBatchId}/payments`, headers: auth(tokens.cb_cashier!), payload: { paymentId: list[0]!.paymentId } });
    expect(res.statusCode).toBe(409);
  });

  it("payment cannot be assigned to another batch -> 409", async () => {
    const list = await db.select().from(collectionBatchPayments).where(eq(collectionBatchPayments.batchId, addBatchId)).limit(1);
    // create a different batch
    const batch2 = await createBatch(tokens.cb_cashier!, "2026-04-16");
    const res = await app.inject({ method: "POST", url: `/api/v1/collection-batches/${batch2.json().data.id}/payments`, headers: auth(tokens.cb_cashier!), payload: { paymentId: list[0]!.paymentId } });
    expect(res.statusCode).toBe(409);
  });

  it("balanced remittance", async () => {
    const res = await app.inject({ method: "POST", url: `/api/v1/collection-batches/${addBatchId}/remit`, headers: auth(tokens.cb_supervisor!), payload: { remittedAmount: "1000.00" } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.shortageAmount).toBe("0.00");
    expect(res.json().data.overageAmount).toBe("0.00");
    expect(res.json().data.status).toBe("remitted");

    const recon = await app.inject({ method: "POST", url: `/api/v1/collection-batches/${addBatchId}/reconcile`, headers: auth(tokens.cb_acct!) });
    expect(recon.statusCode).toBe(200);
    expect(recon.json().data.status).toBe("reconciled");
  });

  it("shortage", async () => {
    const batchRes = await createBatch();
    const batchId = batchRes.json().data.id;
    const pay = await mkPayment("1000.00");
    await app.inject({ method: "POST", url: `/api/v1/collection-batches/${batchId}/payments`, headers: auth(tokens.cb_cashier!), payload: { paymentId: pay.id } });
    const res = await app.inject({ method: "POST", url: `/api/v1/collection-batches/${batchId}/remit`, headers: auth(tokens.cb_supervisor!), payload: { remittedAmount: "900.00" } });
    expect(res.json().data.shortageAmount).toBe("100.00");
    expect(res.json().data.overageAmount).toBe("0.00");
  });

  it("overage", async () => {
    const batchRes = await createBatch();
    const batchId = batchRes.json().data.id;
    const pay = await mkPayment("1000.00");
    await app.inject({ method: "POST", url: `/api/v1/collection-batches/${batchId}/payments`, headers: auth(tokens.cb_cashier!), payload: { paymentId: pay.id } });
    const res = await app.inject({ method: "POST", url: `/api/v1/collection-batches/${batchId}/remit`, headers: auth(tokens.cb_supervisor!), payload: { remittedAmount: "1100.00" } });
    expect(res.json().data.overageAmount).toBe("100.00");
    expect(res.json().data.shortageAmount).toBe("0.00");
  });

  it("second remit is rejected (409)", async () => {
    const res = await app.inject({ method: "POST", url: `/api/v1/collection-batches/${addBatchId}/remit`, headers: auth(tokens.cb_supervisor!), payload: { remittedAmount: "1000.00" } });
    expect(res.statusCode).toBe(409);
  });

  it("reconcile before remit rejected (409)", async () => {
    const batchRes = await createBatch();
    const batchId = batchRes.json().data.id;
    const res = await app.inject({ method: "POST", url: `/api/v1/collection-batches/${batchId}/reconcile`, headers: auth(tokens.cb_supervisor!) });
    expect(res.statusCode).toBe(409);
  });

  it("read-only viewer cannot modify batches (403)", async () => {
    const batchId = createdBatchIds[createdBatchIds.length - 1]!;
    const res = await app.inject({ method: "POST", url: `/api/v1/collection-batches/${batchId}/remit`, headers: auth(tokens.cb_viewer!), payload: { remittedAmount: "0.00" } });
    expect(res.statusCode).toBe(403);
  });

  it("audit rows exist for batch/payment/remit/reconcile", async () => {
    const rows = await db.select().from(auditLogs).where(eq(auditLogs.entityType, "collection_batch"));
    const actions = rows.map((r) => r.action);
    expect(actions).toContain("collection_batch.create");
    expect(actions).toContain("collection_batch.payment_added");
    expect(actions.some((a) => a.startsWith("collection_batch.remit."))).toBe(true);
    expect(actions.some((a) => a.startsWith("collection_batch.reconcile."))).toBe(true);
  });

  it("concurrent remit safety: only one succeeds", async () => {
    const batchRes = await createBatch();
    const batchId = batchRes.json().data.id;
    const [payA] = [await mkPayment("400.00")];
    const [payB] = [await mkPayment("600.00")];
    await app.inject({ method: "POST", url: `/api/v1/collection-batches/${batchId}/payments`, headers: auth(tokens.cb_cashier!), payload: { paymentId: payA!.id } });
    await app.inject({ method: "POST", url: `/api/v1/collection-batches/${batchId}/payments`, headers: auth(tokens.cb_cashier!), payload: { paymentId: payB!.id } });

    const results = await Promise.all([
      app.inject({ method: "POST", url: `/api/v1/collection-batches/${batchId}/remit`, headers: auth(tokens.cb_supervisor!), payload: { remittedAmount: "1000.00" } }),
      app.inject({ method: "POST", url: `/api/v1/collection-batches/${batchId}/remit`, headers: auth(tokens.cb_supervisor!), payload: { remittedAmount: "1000.00" } }),
    ]);
    const statuses = results.map((r) => r.statusCode).sort();
    expect(statuses).toEqual([200, 409]);
  });

  it("no secret leakage in responses", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/collection-batches", headers: auth(tokens.cb_viewer!) });
    expect(JSON.stringify(res.json())).not.toContain("password");
    expect(JSON.stringify(res.json())).not.toContain("token");
  });
});

describe("collection batch lifecycle (spec 3.8)", () => {
  async function add(batchId: number, paymentId: number) {
    return app.inject({ method: "POST", url: `/api/v1/collection-batches/${batchId}/payments`, headers: auth(tokens.cb_cashier!), payload: { paymentId } });
  }

  it("open -> in_progress on first collection -> submitted; no collections after submit", async () => {
    const batchId = (await createBatch()).json().data.id;
    const added = await add(batchId, (await mkPayment("300.00")).id);
    expect(added.json().data.status).toBe("in_progress");

    const sub = await app.inject({ method: "POST", url: `/api/v1/collection-batches/${batchId}/submit`, headers: auth(tokens.cb_cashier!) });
    expect(sub.statusCode).toBe(200);
    expect(sub.json().data.status).toBe("submitted");

    const late = await add(batchId, (await mkPayment("50.00")).id);
    expect(late.statusCode).toBe(409);
  });

  it("non-cash collections are summarized separately and never create a shortage", async () => {
    const batchId = (await createBatch()).json().data.id;
    await add(batchId, (await mkPayment("1000.00", "cash")).id);
    await add(batchId, (await mkPayment("500.00", "gcash")).id);

    const remit = await app.inject({ method: "POST", url: `/api/v1/collection-batches/${batchId}/remit`, headers: auth(tokens.cb_supervisor!), payload: { remittedAmount: "1000.00" } });
    expect(remit.json().data.expectedAmount).toBe("1000.00");
    expect(remit.json().data.shortageAmount).toBe("0.00");

    const detail = (await app.inject({ method: "GET", url: `/api/v1/collection-batches/${batchId}`, headers: auth(tokens.cb_acct!) })).json().data;
    expect(detail.summary.cashCollected).toBe("1000.00");
    expect(detail.summary.nonCashCollected).toBe("500.00");
    expect(detail.summary.accountsCollected).toBe(2);
    expect(detail.summary.difference).toBe("0.00");
  });

  it("AT-08: a shortage cannot be reconciled without acknowledgement, and closing needs confirmation", async () => {
    const batchId = (await createBatch()).json().data.id;
    await add(batchId, (await mkPayment("20000.00")).id);
    const remit = await app.inject({ method: "POST", url: `/api/v1/collection-batches/${batchId}/remit`, headers: auth(tokens.cb_supervisor!), payload: { remittedAmount: "19500.00" } });
    expect(remit.json().data.shortageAmount).toBe("500.00");

    const silent = await app.inject({ method: "POST", url: `/api/v1/collection-batches/${batchId}/reconcile`, headers: auth(tokens.cb_acct!) });
    expect(silent.statusCode).toBe(409);
    expect(silent.json().requiresAcknowledgement).toBe(true);

    const acked = await app.inject({
      method: "POST",
      url: `/api/v1/collection-batches/${batchId}/reconcile`,
      headers: auth(tokens.cb_acct!),
      payload: { acknowledgeDifference: true, notes: "Collector to repay 500.00 from next payout" },
    });
    expect(acked.statusCode).toBe(200);
    expect(acked.json().data.status).toBe("reconciled");
    // The shortage is preserved, never zeroed.
    expect(acked.json().data.shortageAmount).toBe("500.00");

    const cashierClose = await app.inject({ method: "POST", url: `/api/v1/collection-batches/${batchId}/close`, headers: auth(tokens.cb_cashier!), payload: { confirm: true } });
    expect(cashierClose.statusCode).toBe(403);

    const noConfirm = await app.inject({ method: "POST", url: `/api/v1/collection-batches/${batchId}/close`, headers: auth(tokens.cb_supervisor!), payload: {} });
    expect(noConfirm.statusCode).toBe(400);

    const closed = await app.inject({ method: "POST", url: `/api/v1/collection-batches/${batchId}/close`, headers: auth(tokens.cb_supervisor!), payload: { confirm: true } });
    expect(closed.statusCode).toBe(200);
    expect(closed.json().data.status).toBe("closed");
  });

  it("a batch that is not reconciled cannot be closed", async () => {
    const batchId = (await createBatch()).json().data.id;
    const res = await app.inject({ method: "POST", url: `/api/v1/collection-batches/${batchId}/close`, headers: auth(tokens.cb_owner!), payload: { confirm: true } });
    expect(res.statusCode).toBe(409);
  });

  it("snapshots the collector's route and expected receivable at open", async () => {
    // An unpaid 750.00 invoice on an account assigned to this collector.
    const [sub] = await db.insert(subscribers).values({ accountNumber: `ACC-CBR-${Date.now()}`, firstName: "Route", lastName: "Sub", addressLine1: "2 Way", status: "active" }).returning();
    const [svc] = await db.insert(services).values({ type: "cable", name: `SVC-R-${Date.now()}` }).returning();
    const [plan] = await db.insert(servicePlans).values({ serviceId: svc!.id, name: "Route Plan", price: "750.00" }).returning();
    const [acc] = await db.insert(serviceAccounts).values({ subscriberId: sub!.id, planId: plan!.id, serviceNumber: `S-R-${Date.now()}`, status: "active", assignedCollectorId: collectorId }).returning();
    accountsMeta.push({ accountId: acc!.id, subscriberId: sub!.id, serviceId: svc!.id, planId: plan!.id });
    const [period] = await db.insert(billingPeriods).values({ label: `CBR-${Date.now()}`, periodStart: new Date("2033-01-01"), periodEnd: new Date("2033-01-31"), dueDate: new Date("2033-02-05") }).returning();
    createdPeriodIds.push(period!.id);
    const [inv] = await db.insert(invoices).values({ invoiceNumber: `INV-R-${Date.now()}`, serviceAccountId: acc!.id, billingPeriodId: period!.id, issueDate: new Date(), dueDate: new Date("2033-02-05"), status: "unpaid", totalAmount: "750.00" }).returning();
    createdInvoiceIds.push(inv!.id);

    const batchId = (await createBatch()).json().data.id;
    const detail = (await app.inject({ method: "GET", url: `/api/v1/collection-batches/${batchId}`, headers: auth(tokens.cb_acct!) })).json().data;
    expect(detail.routeAccounts.map((r: { serviceAccountId: number }) => r.serviceAccountId)).toContain(acc!.id);
    expect(detail.summary.expectedReceivable).toBe("750.00");
    expect(detail.summary.uncollected).toBe("750.00");
  });
});
