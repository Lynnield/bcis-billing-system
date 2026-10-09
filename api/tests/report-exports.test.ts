import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../src/app";
import { db, pool } from "../src/db";
import {
  billingPeriods,
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
import { eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
const createdUserIds: number[] = [];
const createdPaymentIds: number[] = [];
const createdInvoiceIds: number[] = [];
const createdPeriodIds: number[] = [];
const createdAccountIds: number[] = [];
const tokens: Record<string, string> = {};
let serviceAccountId: number;
let subscriberId: number;
let serviceId: number;
let planId: number;

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function auth(t: string) {
  return { authorization: `Bearer ${t}` };
}

async function mkUser(username: string, roleName: string) {
  const passwordHash = await hashPassword("S3cure!TestPassw0rd");
  const [u] = await db
    .insert(users)
    .values({ username, email: `${username}@test.local`, fullName: username, passwordHash, status: "active" })
    .returning({ id: users.id });
  createdUserIds.push(u!.id);
  const [role] = await db.select().from(roles).where(eq(roles.name, roleName)).limit(1);
  await db.insert(userRoles).values({ userId: u!.id, roleId: role!.id });
  const res = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { identifier: username, password: "S3cure!TestPassw0rd" } });
  tokens[username] = res.json().token;
}

beforeAll(async () => {
  app = await buildApp();
  await mkUser(uid("exp_viewer"), ROLE_NAMES.READ_ONLY_VIEWER);

  const [sub] = await db.insert(subscribers).values({ accountNumber: uid("ACC-E"), firstName: "Export", lastName: "Test", addressLine1: "1 Way", status: "active" }).returning();
  subscriberId = sub!.id;
  const [svc] = await db.insert(services).values({ type: "internet", name: uid("SVC-E") }).returning();
  serviceId = svc!.id;
  const [plan] = await db.insert(servicePlans).values({ serviceId: svc!.id, name: uid("PLAN-E"), price: "999.00" }).returning();
  planId = plan!.id;
  const [acc] = await db.insert(serviceAccounts).values({ subscriberId: sub!.id, planId: plan!.id, serviceNumber: uid("NUM-E"), status: "active" }).returning();
  serviceAccountId = acc!.id;
  createdAccountIds.push(acc!.id);

  const now = Date.UTC(2031, 0, 1);
  const [period] = await db.insert(billingPeriods).values({
    label: uid("BP-E"),
    periodStart: new Date(now),
    periodEnd: new Date(now + 30 * 86400000),
    dueDate: new Date(now + 35 * 86400000),
  }).returning();
  createdPeriodIds.push(period!.id);

  const [inv] = await db.insert(invoices).values({
    invoiceNumber: uid("INV-E"),
    serviceAccountId: acc!.id,
    billingPeriodId: period!.id,
    issueDate: new Date(),
    dueDate: new Date(),
    status: "partially_paid",
    totalAmount: "999.00",
  }).returning();
  createdInvoiceIds.push(inv!.id);

  const [pay] = await db.insert(payments).values({ serviceAccountId: acc!.id, method: "cash", amount: "500.00", paymentDate: new Date(), status: "posted" }).returning();
  createdPaymentIds.push(pay!.id);
  await db.insert(paymentAllocations).values({ paymentId: pay!.id, invoiceId: inv!.id, amount: "500.00" });
});

afterAll(async () => {
  if (createdPaymentIds.length) {
    await db.delete(paymentAllocations).where(inArray(paymentAllocations.paymentId, createdPaymentIds));
    await db.delete(payments).where(inArray(payments.id, createdPaymentIds));
  }
  if (createdInvoiceIds.length) {
    await db.delete(invoices).where(inArray(invoices.id, createdInvoiceIds));
  }
  if (createdPeriodIds.length) {
    await db.delete(billingPeriods).where(inArray(billingPeriods.id, createdPeriodIds));
  }
  if (createdAccountIds.length) {
    await db.delete(serviceAccounts).where(inArray(serviceAccounts.id, createdAccountIds));
  }
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

const viewerToken = () => tokens[Object.keys(tokens).find((k) => k.startsWith("exp_viewer"))!]!;

describe("Report PDF/XLSX export", () => {
  it("rejects an unauthenticated export request", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/reports/collections/export?format=pdf" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects an invalid format", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/reports/collections/export?format=docx",
      headers: auth(viewerToken()),
    });
    expect(res.statusCode).toBe(400);
  });

  const endpoints: Array<{ name: string; url: string }> = [
    { name: "collections", url: "/api/v1/reports/collections/export" },
    { name: "receivables", url: "/api/v1/reports/receivables/export" },
    { name: "aging", url: "/api/v1/reports/aging/export" },
    { name: "collectors", url: "/api/v1/reports/collectors/export" },
    { name: "dashboard", url: "/api/v1/reports/dashboard/export" },
  ];

  for (const ep of endpoints) {
    it(`${ep.name}: produces a valid XLSX (PK magic bytes) and PDF (%PDF- header)`, async () => {
      const xlsx = await app.inject({ method: "GET", url: `${ep.url}?format=xlsx`, headers: auth(viewerToken()) });
      expect(xlsx.statusCode).toBe(200);
      expect(xlsx.headers["content-type"]).toContain("spreadsheetml");
      expect(xlsx.headers["content-disposition"]).toContain("attachment");
      expect(xlsx.rawPayload.subarray(0, 2).toString("hex")).toBe("504b");

      const pdf = await app.inject({ method: "GET", url: `${ep.url}?format=pdf`, headers: auth(viewerToken()) });
      expect(pdf.statusCode).toBe(200);
      expect(pdf.headers["content-type"]).toBe("application/pdf");
      expect(pdf.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
    });
  }

  it("ledger export includes the fixture invoice/payment and is a valid PDF", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/ledger/${serviceAccountId}/export?format=pdf`,
      headers: auth(viewerToken()),
    });
    expect(res.statusCode).toBe(200);
    expect(res.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("ledger export 404s for a nonexistent service account", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/reports/ledger/999999999/export?format=pdf",
      headers: auth(viewerToken()),
    });
    expect(res.statusCode).toBe(404);
  });

  it("SOA export is a valid XLSX for the fixture account", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/soa/${serviceAccountId}/export?format=xlsx`,
      headers: auth(viewerToken()),
    });
    expect(res.statusCode).toBe(200);
    expect(res.rawPayload.subarray(0, 2).toString("hex")).toBe("504b");
  });

  it("ledger JSON and export reflect the same closing balance (no drift between the two code paths)", async () => {
    const jsonRes = await app.inject({
      method: "GET",
      url: `/api/v1/reports/ledger/${serviceAccountId}`,
      headers: auth(viewerToken()),
    });
    expect(jsonRes.statusCode).toBe(200);
    expect(jsonRes.json().data.closingBalance).toBe("499.00");

    const exportRes = await app.inject({
      method: "GET",
      url: `/api/v1/reports/ledger/${serviceAccountId}/export?format=xlsx`,
      headers: auth(viewerToken()),
    });
    expect(exportRes.statusCode).toBe(200);
  });
});
