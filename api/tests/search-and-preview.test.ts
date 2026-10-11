import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../src/app";
import { db, pool } from "../src/db";
import {
  auditLogs,
  billingPeriods,
  gcashPaymentDetails,
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
const tag = Date.now().toString(36).toUpperCase();
const createdUserIds: number[] = [];
const tokens: Record<string, string> = {};
let subscriberId: number;
let serviceId: number;
let planId: number;
let accountId: number;
const periodIds: number[] = [];

async function mkUser(key: string, roleName: string) {
  const username = `sp_${key}_${tag}`.toLowerCase();
  const passwordHash = await hashPassword("S3cure!TestPassw0rd");
  const [u] = await db.insert(users).values({ username, email: `${username}@test.local`, fullName: username, passwordHash, status: "active" }).returning({ id: users.id });
  createdUserIds.push(u!.id);
  const [role] = await db.select().from(roles).where(eq(roles.name, roleName)).limit(1);
  await db.insert(userRoles).values({ userId: u!.id, roleId: role!.id });
  tokens[key] = (await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { identifier: username, password: "S3cure!TestPassw0rd" } })).json().token;
}
const auth = (k: string) => ({ authorization: `Bearer ${tokens[k]}` });

async function mkInvoice(month: number, total: string) {
  const mm = String(month).padStart(2, "0");
  const [p] = await db.insert(billingPeriods).values({ label: `SP ${tag} ${mm}`, periodStart: new Date(`2034-${mm}-01`), periodEnd: new Date(`2034-${mm}-28`), dueDate: new Date(`2099-${mm}-05`) }).returning();
  periodIds.push(p!.id);
  const [inv] = await db
    .insert(invoices)
    .values({ invoiceNumber: `INV-SP-${tag}-${mm}`, serviceAccountId: accountId, billingPeriodId: p!.id, issueDate: new Date(`2034-${mm}-01`), dueDate: new Date(`2099-${mm}-05`), status: "unpaid", totalAmount: total })
    .returning();
  return inv!;
}

beforeAll(async () => {
  app = await buildApp();
  await mkUser("cashier", ROLE_NAMES.CASHIER);
  await mkUser("tech", ROLE_NAMES.TECHNICIAN);
  const [sub] = await db
    .insert(subscribers)
    .values({ accountNumber: `ACC-SP-${tag}`, firstName: "Searchable", lastName: `Delacruz${tag}`, contactNumber: `0917${tag.slice(-6)}`, addressLine1: `Purok ${tag} Malaybalay`, status: "active" })
    .returning();
  subscriberId = sub!.id;
  const [svc] = await db.insert(services).values({ type: "internet", name: `SP ${tag}` }).returning();
  serviceId = svc!.id;
  const [plan] = await db.insert(servicePlans).values({ serviceId, name: "SP 999", price: "999.00" }).returning();
  planId = plan!.id;
  const [acc] = await db.insert(serviceAccounts).values({ subscriberId, planId, serviceNumber: `SVC-SP-${tag}`, status: "active" }).returning();
  accountId = acc!.id;
});

afterAll(async () => {
  const pays = await db.select({ id: payments.id }).from(payments).where(eq(payments.serviceAccountId, accountId));
  const payIds = pays.map((p) => p.id);
  if (payIds.length) {
    await db.delete(paymentAllocations).where(inArray(paymentAllocations.paymentId, payIds));
    await db.delete(gcashPaymentDetails).where(inArray(gcashPaymentDetails.paymentId, payIds));
    await db.delete(payments).where(inArray(payments.id, payIds));
  }
  await db.delete(invoices).where(eq(invoices.serviceAccountId, accountId));
  if (periodIds.length) await db.delete(billingPeriods).where(inArray(billingPeriods.id, periodIds));
  await db.delete(serviceAccounts).where(eq(serviceAccounts.id, accountId));
  await db.delete(servicePlans).where(eq(servicePlans.id, planId));
  await db.delete(services).where(eq(services.id, serviceId));
  await db.delete(subscribers).where(eq(subscribers.id, subscriberId));
  await db.delete(auditLogs).where(inArray(auditLogs.actorUserId, createdUserIds));
  await db.delete(userRoles).where(inArray(userRoles.userId, createdUserIds));
  await db.delete(users).where(inArray(users.id, createdUserIds));
  await app.close();
  await pool.end();
});

describe("global search (spec 3.2)", () => {
  const search = (k: string, q: string) => app.inject({ method: "GET", url: `/api/v1/search?q=${encodeURIComponent(q)}`, headers: auth(k) });
  const ids = (res: Awaited<ReturnType<typeof search>>) => res.json().data.map((h: { serviceAccountId: number }) => h.serviceAccountId);

  it("finds by account number, name, contact number and address", async () => {
    for (const q of [`ACC-SP-${tag}`, `Delacruz${tag}`, `0917${tag.slice(-6)}`, `Purok ${tag}`]) {
      expect(ids(await search("cashier", q)), q).toContain(accountId);
    }
  });

  it("finds by invoice number, receipt number and GCash reference", async () => {
    await mkInvoice(1, "999.00");
    const pay = await app.inject({ method: "POST", url: "/api/v1/payments", headers: auth("cashier"), payload: { serviceAccountId: accountId, amount: "100.00", method: "cash", receiptNumber: `OR-SP-${tag}` } });
    expect(pay.statusCode).toBe(201);
    const gc = await app.inject({ method: "POST", url: "/api/v1/payments", headers: auth("cashier"), payload: { serviceAccountId: accountId, amount: "50.00", method: "gcash", gcash: { gcashReferenceNumber: `GCREF${tag}` } } });
    expect(gc.statusCode).toBe(201);

    const inv = (await search("cashier", `INV-SP-${tag}`)).json().data;
    expect(inv.some((h: { kind: string; serviceAccountId: number }) => h.kind === "invoice" && h.serviceAccountId === accountId)).toBe(true);
    const rc = (await search("cashier", `OR-SP-${tag}`)).json().data;
    expect(rc.some((h: { kind: string }) => h.kind === "payment")).toBe(true);
    const g = (await search("cashier", `GCREF${tag}`)).json().data;
    expect(g.some((h: { matchedOn: string }) => h.matchedOn === "GCash reference")).toBe(true);
  });

  it("treats % and _ literally, requires 2+ characters, and hides financial documents from technicians", async () => {
    expect((await search("cashier", "%")).statusCode).toBe(400);
    expect((await search("cashier", "%%")).json().data).toEqual([]);
    const tech = (await search("tech", `INV-SP-${tag}`)).json().data;
    expect(tech.filter((h: { kind: string }) => h.kind !== "service_account")).toEqual([]);
  });
});

describe("allocation preview (spec 4.3)", () => {
  it("previews AT-04 oldest-first allocation without writing anything", async () => {
    // Fresh account state: August 999 + September 999 (on top of earlier test data cleared below).
    await db.delete(paymentAllocations).where(inArray(paymentAllocations.paymentId, (await db.select({ id: payments.id }).from(payments).where(eq(payments.serviceAccountId, accountId))).map((p) => p.id)));
    await db.update(payments).set({ status: "reversed" }).where(eq(payments.serviceAccountId, accountId));
    await db.delete(invoices).where(eq(invoices.serviceAccountId, accountId));
    const aug = await mkInvoice(8, "999.00");
    const sep = await mkInvoice(9, "999.00");

    const res = await app.inject({ method: "GET", url: `/api/v1/payments/allocation-preview?serviceAccountId=${accountId}&amount=1200.00`, headers: auth("cashier") });
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.balanceBefore).toBe("1998.00");
    expect(d.allocations[0]).toMatchObject({ invoiceId: aug.id, applied: "999.00", remainingBalance: "0.00", statusAfter: "paid" });
    expect(d.allocations[1]).toMatchObject({ invoiceId: sep.id, applied: "201.00", remainingBalance: "798.00", statusAfter: "partially_paid" });
    expect(d.unapplied).toBe("0.00");

    const [row] = await db.select().from(invoices).where(eq(invoices.id, aug.id));
    expect(row!.status).toBe("unpaid");
  });

  it("reports the advance portion of an overpayment as unapplied", async () => {
    const res = await app.inject({ method: "GET", url: `/api/v1/payments/allocation-preview?serviceAccountId=${accountId}&amount=3000.00`, headers: auth("cashier") });
    expect(res.json().data.unapplied).toBe("1002.00");
  });

  it("technician cannot use the cashier preview (403)", async () => {
    const res = await app.inject({ method: "GET", url: `/api/v1/payments/allocation-preview?serviceAccountId=${accountId}&amount=1.00`, headers: auth("tech") });
    expect(res.statusCode).toBe(403);
  });
});

describe("subscriber profile data (spec 4.3)", () => {
  it("filters payments by subscriber", async () => {
    const res = await app.inject({ method: "GET", url: `/api/v1/payments?subscriberId=${subscriberId}`, headers: auth("cashier") });
    expect(res.statusCode).toBe(200);
    const list = res.json().data as Array<{ serviceAccountId: number }>;
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((p) => p.serviceAccountId === accountId)).toBe(true);
  });

  it("lists a subscriber's documents and refuses deletion with 405", async () => {
    const docs = await app.inject({ method: "GET", url: `/api/v1/payment-proofs?subscriberId=${subscriberId}`, headers: auth("cashier") });
    expect(docs.statusCode).toBe(200);
    expect(Array.isArray(docs.json().data)).toBe(true);
    expect((await app.inject({ method: "DELETE", url: `/api/v1/subscribers/${subscriberId}`, headers: auth("cashier") })).statusCode).toBe(403);
  });
});
