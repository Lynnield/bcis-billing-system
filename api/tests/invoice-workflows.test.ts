import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../src/app";
import { db, pool } from "../src/db";
import {
  auditLogs,
  billingPeriods,
  invoiceAdjustments,
  invoiceLineItems,
  invoices,
  paymentAllocations,
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
import { deriveInvoiceStatus, markOverdueInvoices } from "../src/lib/invoice-status";
import { and, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
const createdUserIds: number[] = [];
const tokens: Record<string, string> = {};
let subscriberId: number;
let serviceId: number;
let planId: number;
let accountId: number;
const periodIds: number[] = [];
const tag = Date.now().toString(36);

async function mkUser(username: string, roleName: string) {
  const passwordHash = await hashPassword("S3cure!TestPassw0rd");
  const [u] = await db.insert(users).values({ username, email: `${username}@test.local`, fullName: username, passwordHash, status: "active" }).returning({ id: users.id });
  createdUserIds.push(u!.id);
  const [role] = await db.select().from(roles).where(eq(roles.name, roleName)).limit(1);
  await db.insert(userRoles).values({ userId: u!.id, roleId: role!.id });
  const res = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { identifier: username, password: "S3cure!TestPassw0rd" } });
  tokens[username] = res.json().token;
}

function auth(t: string) {
  return { authorization: `Bearer ${t}` };
}

async function mkPeriod(month: number, due: string) {
  const mm = String(month).padStart(2, "0");
  const [p] = await db
    .insert(billingPeriods)
    .values({ label: `WF ${tag} ${mm}`, periodStart: new Date(`2031-${mm}-01`), periodEnd: new Date(`2031-${mm}-28`), dueDate: new Date(due) })
    .returning();
  periodIds.push(p!.id);
  return p!.id;
}

async function createInvoice(periodId: number, extra: Record<string, unknown> = {}) {
  return app.inject({
    method: "POST",
    url: "/api/v1/invoices",
    headers: auth(tokens.wf_admin!),
    payload: { serviceAccountId: accountId, billingPeriodId: periodId, ...extra },
  });
}

beforeAll(async () => {
  app = await buildApp();
  await mkUser(`wf_admin_${tag}`, ROLE_NAMES.ADMINISTRATOR);
  await mkUser(`wf_acct_${tag}`, ROLE_NAMES.ACCOUNTING_AUDITOR);
  await mkUser(`wf_cashier_${tag}`, ROLE_NAMES.CASHIER);
  tokens.wf_admin = tokens[`wf_admin_${tag}`]!;
  tokens.wf_acct = tokens[`wf_acct_${tag}`]!;
  tokens.wf_cashier = tokens[`wf_cashier_${tag}`]!;

  const [sub] = await db.insert(subscribers).values({ accountNumber: `ACC-WF-${tag}`, firstName: "Wf", lastName: "Test", addressLine1: "1 Main St", status: "active" }).returning();
  subscriberId = sub!.id;
  const [svc] = await db.insert(services).values({ type: "internet", name: `Internet WF ${tag}` }).returning();
  serviceId = svc!.id;
  const [plan] = await db.insert(servicePlans).values({ serviceId, name: "WF 999", price: "999.00" }).returning();
  planId = plan!.id;
  const [acc] = await db.insert(serviceAccounts).values({ subscriberId, planId, serviceNumber: `SVC-WF-${tag}`, status: "active" }).returning();
  accountId = acc!.id;
});

afterAll(async () => {
  const invs = await db.select({ id: invoices.id }).from(invoices).where(inArray(invoices.billingPeriodId, periodIds.length ? periodIds : [-1]));
  const invIds = invs.map((i) => i.id);
  if (invIds.length) {
    const allocs = await db.select().from(paymentAllocations).where(inArray(paymentAllocations.invoiceId, invIds));
    const payIds = [...new Set(allocs.map((a) => a.paymentId))];
    await db.delete(paymentAllocations).where(inArray(paymentAllocations.invoiceId, invIds));
    if (payIds.length) await db.delete(payments).where(inArray(payments.id, payIds));
    await db.delete(invoiceAdjustments).where(inArray(invoiceAdjustments.invoiceId, invIds));
    await db.delete(invoiceLineItems).where(inArray(invoiceLineItems.invoiceId, invIds));
    await db.delete(invoices).where(inArray(invoices.id, invIds));
  }
  await db.delete(payments).where(eq(payments.serviceAccountId, accountId));
  if (periodIds.length) await db.delete(billingPeriods).where(inArray(billingPeriods.id, periodIds));
  await db.delete(serviceAccounts).where(eq(serviceAccounts.id, accountId));
  await db.delete(servicePlans).where(eq(servicePlans.id, planId));
  await db.delete(services).where(eq(services.id, serviceId));
  await db.delete(subscribers).where(eq(subscribers.id, subscriberId));
  if (createdUserIds.length) {
    await db.delete(auditLogs).where(inArray(auditLogs.actorUserId, createdUserIds));
    await db.delete(userRoles).where(inArray(userRoles.userId, createdUserIds));
    await db.delete(users).where(inArray(users.id, createdUserIds));
  }
  await app.close();
  await pool.end();
});

describe("deriveInvoiceStatus", () => {
  const today = "2031-06-15";
  it("unpaid before due date, overdue after", () => {
    expect(deriveInvoiceStatus(99900n, 0n, "2031-06-30", today)).toBe("unpaid");
    expect(deriveInvoiceStatus(99900n, 0n, "2031-06-14", today)).toBe("overdue");
  });
  it("partial payment stays partially_paid until due, then overdue", () => {
    expect(deriveInvoiceStatus(99900n, 50000n, "2031-06-30", today)).toBe("partially_paid");
    expect(deriveInvoiceStatus(99900n, 50000n, "2031-06-01", today)).toBe("overdue");
  });
  it("fully paid is paid regardless of due date; zeroed by credits is credited", () => {
    expect(deriveInvoiceStatus(99900n, 99900n, "2031-06-01", today)).toBe("paid");
    expect(deriveInvoiceStatus(0n, 0n, "2031-06-01", today)).toBe("credited");
  });
});

describe("invoice numbering and drafts", () => {
  it("assigns a server-side INV- number when none is supplied", async () => {
    const res = await createInvoice(await mkPeriod(1, "2099-02-05"));
    expect(res.statusCode).toBe(201);
    expect(res.json().data.invoiceNumber).toMatch(/^INV-\d+$/);
    expect(res.json().data.status).toBe("unpaid");
  });

  it("a draft is excluded from receivables until finalized", async () => {
    const res = await createInvoice(await mkPeriod(2, "2099-03-05"), { asDraft: true });
    expect(res.statusCode).toBe(201);
    const inv = res.json().data;
    expect(inv.status).toBe("draft");

    const open = await app.inject({ method: "GET", url: `/api/v1/receivables/invoices?serviceAccountId=${accountId}`, headers: auth(tokens.wf_admin!) });
    expect(JSON.stringify(open.json())).not.toContain(inv.invoiceNumber);

    const fin = await app.inject({ method: "POST", url: `/api/v1/invoices/${inv.id}/finalize`, headers: auth(tokens.wf_admin!) });
    expect(fin.statusCode).toBe(200);
    expect(fin.json().data.status).toBe("unpaid");

    const again = await app.inject({ method: "POST", url: `/api/v1/invoices/${inv.id}/finalize`, headers: auth(tokens.wf_admin!) });
    expect(again.statusCode).toBe(409);
  });
});

describe("void workflow", () => {
  it("voids an unpaid invoice with a reason, keeps the row, writes audit, removes it from receivables", async () => {
    const created = (await createInvoice(await mkPeriod(3, "2099-04-05"))).json().data;

    const noReason = await app.inject({ method: "POST", url: `/api/v1/invoices/${created.id}/void`, headers: auth(tokens.wf_acct!), payload: {} });
    expect(noReason.statusCode).toBe(400);

    const res = await app.inject({ method: "POST", url: `/api/v1/invoices/${created.id}/void`, headers: auth(tokens.wf_acct!), payload: { reason: "Billed in error" } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("void");
    expect(res.json().data.voidReason).toBe("Billed in error");

    const [audit] = await db.select().from(auditLogs).where(and(eq(auditLogs.action, "invoice.void"), eq(auditLogs.entityId, created.id)));
    expect(audit).toBeDefined();

    const ledger = await app.inject({ method: "GET", url: `/api/v1/reports/ledger/${accountId}`, headers: auth(tokens.wf_admin!) });
    const entries = ledger.json().data.entries as Array<{ type: string; reference: string; credit: string }>;
    const voidEntry = entries.find((e) => e.type === "void" && e.reference === created.invoiceNumber);
    expect(voidEntry?.credit).toBe("999.00");

    const again = await app.inject({ method: "POST", url: `/api/v1/invoices/${created.id}/void`, headers: auth(tokens.wf_acct!), payload: { reason: "x" } });
    expect(again.statusCode).toBe(409);
  });

  it("refuses to void an invoice that has posted payments applied", async () => {
    const created = (await createInvoice(await mkPeriod(4, "2099-05-05"))).json().data;
    const pay = await app.inject({ method: "POST", url: "/api/v1/payments", headers: auth(tokens.wf_cashier!), payload: { serviceAccountId: accountId, amount: "2100.00", method: "cash" } });
    // Oldest-first: clears the two earlier open invoices, then 102.00 lands on this one.
    expect(pay.statusCode).toBe(201);
    expect(pay.json().data.receiptNumber).toMatch(/^OR-\d+$/);

    const res = await app.inject({ method: "POST", url: `/api/v1/invoices/${created.id}/void`, headers: auth(tokens.wf_acct!), payload: { reason: "Try" } });
    expect(res.statusCode).toBe(409);
  });

  it("cashier cannot void (403)", async () => {
    const [inv] = await db.select().from(invoices).where(eq(invoices.serviceAccountId, accountId)).limit(1);
    const res = await app.inject({ method: "POST", url: `/api/v1/invoices/${inv!.id}/void`, headers: auth(tokens.wf_cashier!), payload: { reason: "x" } });
    expect(res.statusCode).toBe(403);
  });
});

describe("post-issue adjustments", () => {
  it("a full credit marks the invoice CREDITED and logs old/new totals", async () => {
    const created = (await createInvoice(await mkPeriod(5, "2099-06-05"))).json().data;
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/invoices/${created.id}/adjustments`,
      headers: auth(tokens.wf_acct!),
      payload: { type: "credit", amount: "999.00", reason: "Service outage credit" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.totalAmount).toBe("0.00");
    expect(res.json().data.status).toBe("credited");

    const [audit] = await db.select().from(auditLogs).where(and(eq(auditLogs.action, "invoice.adjust"), eq(auditLogs.entityId, created.id)));
    expect((audit!.metadata as { old: { totalAmount: string } }).old.totalAmount).toBe("999.00");
  });

  it("a credit larger than the open balance is rejected", async () => {
    const created = (await createInvoice(await mkPeriod(6, "2099-07-05"))).json().data;
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/invoices/${created.id}/adjustments`,
      headers: auth(tokens.wf_acct!),
      payload: { type: "credit", amount: "1000.00", reason: "Too much" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("ledger shows the issued amount and the adjustment as separate lines", async () => {
    const created = (await createInvoice(await mkPeriod(7, "2099-08-05"))).json().data;
    await app.inject({
      method: "POST",
      url: `/api/v1/invoices/${created.id}/adjustments`,
      headers: auth(tokens.wf_acct!),
      payload: { type: "debit", amount: "150.00", reason: "Reconnection fee" },
    });
    const ledger = await app.inject({ method: "GET", url: `/api/v1/reports/ledger/${accountId}`, headers: auth(tokens.wf_admin!) });
    const entries = ledger.json().data.entries as Array<{ type: string; reference: string; debit: string }>;
    expect(entries.find((e) => e.type === "invoice" && e.reference === created.invoiceNumber)?.debit).toBe("999.00");
    expect(entries.find((e) => e.type === "adjustment" && e.reference === created.invoiceNumber)?.debit).toBe("150.00");
  });
});

describe("overdue sweep", () => {
  it("moves past-due open invoices to OVERDUE", async () => {
    const created = (await createInvoice(await mkPeriod(8, "2099-09-05"))).json().data;
    // Backdate the due date to simulate the passage of time.
    await db.update(invoices).set({ dueDate: new Date("2031-01-01") }).where(eq(invoices.id, created.id));
    expect(await markOverdueInvoices("2031-06-01")).toBeGreaterThanOrEqual(1);
    const [row] = await db.select().from(invoices).where(eq(invoices.id, created.id));
    expect(row!.status).toBe("overdue");
  });
});

describe("bulk billing generation (AT-11)", () => {
  it("bills each active account once; a second run creates nothing for it", async () => {
    const periodId = await mkPeriod(9, "2099-10-05");
    const dry = await app.inject({ method: "POST", url: `/api/v1/billing-periods/${periodId}/generate`, headers: auth(tokens.wf_admin!), payload: { dryRun: true } });
    expect(dry.statusCode).toBe(200);
    expect(dry.json().data.accounts.map((a: { id: number }) => a.id)).toContain(accountId);

    const first = await app.inject({ method: "POST", url: `/api/v1/billing-periods/${periodId}/generate`, headers: auth(tokens.wf_admin!), payload: {} });
    expect(first.statusCode).toBe(200);
    expect(first.json().data.invoices.map((i: { serviceAccountId: number }) => i.serviceAccountId)).toContain(accountId);

    const second = await app.inject({ method: "POST", url: `/api/v1/billing-periods/${periodId}/generate`, headers: auth(tokens.wf_admin!), payload: {} });
    expect(second.statusCode).toBe(200);
    expect(second.json().data.created).toBe(0);

    const mine = await db.select().from(invoices).where(and(eq(invoices.serviceAccountId, accountId), eq(invoices.billingPeriodId, periodId)));
    expect(mine).toHaveLength(1);
  });

  it("cashier cannot generate billing (403)", async () => {
    const res = await app.inject({ method: "POST", url: `/api/v1/billing-periods/${periodIds[0]}/generate`, headers: auth(tokens.wf_cashier!), payload: {} });
    expect(res.statusCode).toBe(403);
  });
});
