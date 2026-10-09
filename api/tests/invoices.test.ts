import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../src/app";
import { db, pool } from "../src/db";
import {
  billingPeriods,
  invoices,
  invoiceAdjustments,
  invoiceLineItems,
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
import { eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
const createdUserIds: number[] = [];
const tokens: Record<string, string> = {};
let subscriberId: number;
let serviceId: number;
let planId: number;
let accountId: number;
const createdPeriodIds: number[] = [];
const createdInvoiceIds: number[] = [];

async function mkUser(username: string, roleName: string) {
  const passwordHash = await hashPassword("S3cure!TestPassw0rd");
  const [u] = await db.insert(users).values({ username, email: `${username}@test.local`, fullName: username, passwordHash, status: "active" }).returning({ id: users.id });
  createdUserIds.push(u!.id);
  const [role] = await db.select().from(roles).where(eq(roles.name, roleName)).limit(1);
  await db.insert(userRoles).values({ userId: u!.id, roleId: role!.id });
  const res = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { identifier: username, password: "S3cure!TestPassw0rd" } });
  tokens[username] = res.json().token;
}

beforeAll(async () => {
  app = await buildApp();
  await mkUser("bill_owner", ROLE_NAMES.OWNER);
  await mkUser("bill_admin", ROLE_NAMES.ADMINISTRATOR);
  await mkUser("bill_acct", ROLE_NAMES.ACCOUNTING_AUDITOR);
  await mkUser("bill_cashier", ROLE_NAMES.CASHIER);
  await mkUser("bill_viewer", ROLE_NAMES.READ_ONLY_VIEWER);

  const [sub] = await db.insert(subscribers).values({ accountNumber: "ACC-BILL-1", firstName: "Ana", lastName: "Reyes", addressLine1: "1 Main St", status: "active" }).returning();
  subscriberId = sub!.id;
  const [svc] = await db.insert(services).values({ type: "internet", name: "Internet Bill" }).returning();
  serviceId = svc!.id;
  const [plan] = await db.insert(servicePlans).values({ serviceId, name: "Plan 999.95", price: "999.95" }).returning();
  planId = plan!.id;
  const [acc] = await db.insert(serviceAccounts).values({ subscriberId, planId, serviceNumber: "SVC-BILL-1", status: "active" }).returning();
  accountId = acc!.id;
});

afterAll(async () => {
  if (createdInvoiceIds.length) {
    await db.delete(invoiceAdjustments).where(inArray(invoiceAdjustments.invoiceId, createdInvoiceIds));
    await db.delete(invoiceLineItems).where(inArray(invoiceLineItems.invoiceId, createdInvoiceIds));
    await db.delete(invoices).where(inArray(invoices.id, createdInvoiceIds));
  }
  if (createdPeriodIds.length) await db.delete(billingPeriods).where(inArray(billingPeriods.id, createdPeriodIds));
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

async function createPeriod(label: string, start: string, end: string, due: string, token = tokens.bill_owner!) {
  const res = await app.inject({ method: "POST", url: "/api/v1/billing-periods", headers: auth(token), payload: { label, periodStart: start, periodEnd: end, dueDate: due } });
  if (res.statusCode === 201) createdPeriodIds.push(res.json().data.id);
  return res;
}

describe("billing periods", () => {
  it("rejects unauthenticated request with 401", async () => {
    expect((await app.inject({ method: "GET", url: "/api/v1/billing-periods" })).statusCode).toBe(401);
  });

  it("owner and admin can create periods", async () => {
    expect((await createPeriod("Oct 2026", "2026-10-01", "2026-10-31", "2026-11-05")).statusCode).toBe(201);
    expect((await createPeriod("Nov 2026", "2026-11-01", "2026-11-30", "2026-12-05", tokens.bill_admin!)).statusCode).toBe(201);
  });

  it("viewer cannot create period (403)", async () => {
    expect((await createPeriod("Dec 2026", "2026-12-01", "2026-12-31", "2027-01-05", tokens.bill_viewer!)).statusCode).toBe(403);
  });

  it("invalid date range -> 400", async () => {
    expect((await createPeriod("Bad", "2026-11-30", "2026-11-01", "2026-12-05")).statusCode).toBe(400);
  });

  it("gets and lists periods", async () => {
    const list = await app.inject({ method: "GET", url: "/api/v1/billing-periods", headers: auth(tokens.bill_viewer!) });
    expect(list.statusCode).toBe(200);
    const one = await app.inject({ method: "GET", url: `/api/v1/billing-periods/${createdPeriodIds[0]}`, headers: auth(tokens.bill_cashier!) });
    expect(one.statusCode).toBe(200);
  });

  it("updates label only when invoices exist", async () => {
    const res = await app.inject({ method: "PATCH", url: `/api/v1/billing-periods/${createdPeriodIds[0]}`, headers: auth(tokens.bill_admin!), payload: { label: "October 2026" } });
    expect(res.statusCode).toBe(200);
  });
});

describe("invoices", () => {
  it("creates invoice with exact total from plan price", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/invoices",
      headers: auth(tokens.bill_owner!),
      payload: { serviceAccountId: accountId, billingPeriodId: createdPeriodIds[0], invoiceNumber: "INV-0001" },
    });
    expect(res.statusCode).toBe(201);
    const d = res.json().data;
    expect(d.totalAmount).toBe("999.95");
    expect(d.subtotal).toBe("999.95");
    expect(d.lineItems).toHaveLength(1);
    expect(d.lineItems[0].unitPrice).toBe("999.95");
    expect(JSON.stringify(res.json())).not.toContain("password");
    createdInvoiceIds.push(d.id);
  });

  it("creates invoice with extra line items and exact credit adjustment", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/invoices",
      headers: auth(tokens.bill_admin!),
      payload: {
        serviceAccountId: accountId,
        billingPeriodId: createdPeriodIds[1],
        invoiceNumber: "INV-0002",
        quantity: 1,
        additionalLineItems: [{ description: "Installation", quantity: 2, unitPrice: "150.25" }],
        adjustments: [{ type: "credit", amount: "49.90", reason: "Promo" }],
      },
    });
    expect(res.statusCode).toBe(201);
    const d = res.json().data;
    // 999.95 + 2*150.25 - 49.90 = 1250.55
    expect(d.totalAmount).toBe("1250.55");
    expect(d.subtotal).toBe("1300.45");
    createdInvoiceIds.push(d.id);
  });

  it("duplicate invoice for same account+period -> 409", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/invoices",
      headers: auth(tokens.bill_owner!),
      payload: { serviceAccountId: accountId, billingPeriodId: createdPeriodIds[0], invoiceNumber: "INV-DUP" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("concurrent duplicate creation yields exactly one invoice and 409s", async () => {
    // Fresh account + period for the concurrency test
    const [acc2] = await db.insert(serviceAccounts).values({ subscriberId, planId, serviceNumber: "SVC-BILL-2", status: "active" }).returning();
    const [period3] = await db.insert(billingPeriods).values({ label: "Conc 2026", periodStart: new Date("2026-06-01"), periodEnd: new Date("2026-06-30"), dueDate: new Date("2026-07-05") }).returning();
    createdPeriodIds.push(period3!.id);

    const attempts = await Promise.all([
      app.inject({ method: "POST", url: "/api/v1/invoices", headers: auth(tokens.bill_owner!), payload: { serviceAccountId: acc2!.id, billingPeriodId: period3!.id, invoiceNumber: "INV-C1" } }),
      app.inject({ method: "POST", url: "/api/v1/invoices", headers: auth(tokens.bill_owner!), payload: { serviceAccountId: acc2!.id, billingPeriodId: period3!.id, invoiceNumber: "INV-C2" } }),
      app.inject({ method: "POST", url: "/api/v1/invoices", headers: auth(tokens.bill_owner!), payload: { serviceAccountId: acc2!.id, billingPeriodId: period3!.id, invoiceNumber: "INV-C3" } }),
    ]);

    const statuses = attempts.map((r) => r.statusCode).sort();
    expect(statuses.filter((s) => s === 201).length).toBe(1);
    expect(statuses.filter((s) => s === 409).length).toBe(2);

    const winner = attempts.find((r) => r.statusCode === 201)!;
    createdInvoiceIds.push(winner.json().data.id);

    const [countRow] = await db.select({ count: sql<number>`count(*)::int` }).from(invoices).where(eq(invoices.serviceAccountId, acc2!.id));
    expect(countRow!.count).toBe(1);
    const lines = await db.select().from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, winner.json().data.id));
    expect(lines).toHaveLength(1);

    await db.delete(invoices).where(eq(invoices.serviceAccountId, acc2!.id));
    await db.delete(serviceAccounts).where(eq(serviceAccounts.id, acc2!.id));
    createdInvoiceIds.pop();
  });

  it("nonexistent service account / period -> 400", async () => {
    const r1 = await app.inject({ method: "POST", url: "/api/v1/invoices", headers: auth(tokens.bill_owner!), payload: { serviceAccountId: 99999999, billingPeriodId: createdPeriodIds[1], invoiceNumber: "INV-X1" } });
    expect(r1.statusCode).toBe(400);
    const r2 = await app.inject({ method: "POST", url: "/api/v1/invoices", headers: auth(tokens.bill_owner!), payload: { serviceAccountId: accountId, billingPeriodId: 99999999, invoiceNumber: "INV-X2" } });
    expect(r2.statusCode).toBe(400);
  });

  it("client cannot override plan price (extra fields rejected)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/invoices",
      headers: auth(tokens.bill_owner!),
      payload: { serviceAccountId: accountId, billingPeriodId: createdPeriodIds[1], invoiceNumber: "INV-P1", total: "0.01" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("gets one invoice with line items and subtotal/total", async () => {
    const res = await app.inject({ method: "GET", url: `/api/v1/invoices/${createdInvoiceIds[0]}`, headers: auth(tokens.bill_acct!) });
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.totalAmount).toBe("999.95");
    expect(d.context.planName).toBe("Plan 999.95");
    expect(d.context.accountNumber).toBe("ACC-BILL-1");
  });

  it("lists invoices with filters and RBAC", async () => {
    const res = await app.inject({ method: "GET", url: `/api/v1/invoices?subscriberId=${subscriberId}&status=unpaid`, headers: auth(tokens.bill_cashier!) });
    expect(res.statusCode).toBe(200);
    expect(res.json().pagination.total).toBeGreaterThanOrEqual(1);

    const forbidden = await app.inject({ method: "POST", url: "/api/v1/invoices", headers: auth(tokens.bill_viewer!), payload: { serviceAccountId: accountId, billingPeriodId: createdPeriodIds[1], invoiceNumber: "INV-Z" } });
    expect(forbidden.statusCode).toBe(403);
  });
});
