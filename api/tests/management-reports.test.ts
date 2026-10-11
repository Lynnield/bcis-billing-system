import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../src/app";
import { db, pool } from "../src/db";
import {
  auditLogs,
  billingPeriods,
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
import { eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

// All data lives in 2041 so date-filtered totals are exact regardless of
// what other test files leave in the shared test database.
let app: FastifyInstance;
const tag = Date.now().toString(36);
const createdUserIds: number[] = [];
const tokens: Record<string, string> = {};
let subscriberId: number;
let serviceId: number;
let planId: number;
let accountId: number;
let periodId: number;

async function mkUser(key: string, roleName: string) {
  const username = `mr_${key}_${tag}`;
  const passwordHash = await hashPassword("S3cure!TestPassw0rd");
  const [u] = await db.insert(users).values({ username, email: `${username}@test.local`, fullName: `MR ${key}`, passwordHash, status: "active" }).returning({ id: users.id });
  createdUserIds.push(u!.id);
  const [role] = await db.select().from(roles).where(eq(roles.name, roleName)).limit(1);
  await db.insert(userRoles).values({ userId: u!.id, roleId: role!.id });
  tokens[key] = (await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { identifier: username, password: "S3cure!TestPassw0rd" } })).json().token;
}
const auth = (k: string) => ({ authorization: `Bearer ${tokens[k]}` });
const run = (k: string, slug: string, qs = "") => app.inject({ method: "GET", url: `/api/v1/reports/run/${slug}?${qs}`, headers: auth(k) });

beforeAll(async () => {
  app = await buildApp();
  await mkUser("owner", ROLE_NAMES.OWNER);
  await mkUser("acct", ROLE_NAMES.ACCOUNTING_AUDITOR);
  await mkUser("viewer", ROLE_NAMES.READ_ONLY_VIEWER);
  await mkUser("cashier", ROLE_NAMES.CASHIER);
  await mkUser("tech", ROLE_NAMES.TECHNICIAN);

  const [sub] = await db.insert(subscribers).values({ accountNumber: `ACC-MR-${tag}`, firstName: "Report", lastName: "Subject", addressLine1: "1 St", status: "active" }).returning();
  subscriberId = sub!.id;
  const [svc] = await db.insert(services).values({ type: "cable", name: `MR ${tag}` }).returning();
  serviceId = svc!.id;
  const [plan] = await db.insert(servicePlans).values({ serviceId, name: `MR Plan ${tag}`, price: "1000.00" }).returning();
  planId = plan!.id;
  const [acc] = await db.insert(serviceAccounts).values({ subscriberId, planId, serviceNumber: `SVC-MR-${tag}`, status: "active" }).returning();
  accountId = acc!.id;
  const [p] = await db.insert(billingPeriods).values({ label: `MR ${tag}`, periodStart: new Date("2041-03-01"), periodEnd: new Date("2041-03-31"), dueDate: new Date("2041-04-05") }).returning();
  periodId = p!.id;
  await db.insert(invoices).values({ invoiceNumber: `INV-MR-${tag}`, serviceAccountId: accountId, billingPeriodId: periodId, issueDate: new Date("2041-03-01"), dueDate: new Date("2041-04-05"), status: "partially_paid", totalAmount: "1000.00" });

  // Two cash and one GCash posted in March 2041, one reversed cash payment.
  const base = { serviceAccountId: accountId, status: "posted" as const };
  await db.insert(payments).values([
    { ...base, method: "cash", amount: "300.00", paymentDate: new Date("2041-03-02"), receiptNumber: `OR-MR-${tag}-1` },
    { ...base, method: "cash", amount: "200.50", paymentDate: new Date("2041-03-20"), receiptNumber: `OR-MR-${tag}-2` },
    { ...base, method: "gcash", amount: "99.50", paymentDate: new Date("2041-03-21"), receiptNumber: `OR-MR-${tag}-3` },
  ]);
  const [rev] = await db.insert(payments).values({ ...base, status: "reversed", method: "cash", amount: "50.00", paymentDate: new Date("2041-03-22"), receiptNumber: `OR-MR-${tag}-4` }).returning();
  await db.insert(paymentReversals).values({ paymentId: rev!.id, reason: `Wrong account ${tag}`, reversedAt: new Date("2041-03-23T10:00:00Z") });
});

afterAll(async () => {
  const pays = await db.select({ id: payments.id }).from(payments).where(eq(payments.serviceAccountId, accountId));
  const ids = pays.map((p) => p.id);
  if (ids.length) {
    await db.delete(paymentReversals).where(inArray(paymentReversals.paymentId, ids));
    await db.delete(paymentAllocations).where(inArray(paymentAllocations.paymentId, ids));
    await db.delete(payments).where(inArray(payments.id, ids));
  }
  await db.delete(invoices).where(eq(invoices.serviceAccountId, accountId));
  await db.delete(billingPeriods).where(eq(billingPeriods.id, periodId));
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

const MARCH = "dateFrom=2041-03-01&dateTo=2041-03-31";

describe("management reports (spec 3.11)", () => {
  it("monthly and daily collection summaries split by method, excluding reversed payments", async () => {
    const monthly = (await run("owner", "collections-summary", `${MARCH}&period=month`)).json().data;
    expect(monthly.rows).toEqual([expect.objectContaining({ bucket: "2041-03", cash: "500.50", gcash: "99.50", total: "600.00", count: 3 })]);
    const daily = (await run("owner", "collections-summary", `${MARCH}&period=day`)).json().data;
    expect(daily.rows.map((r: { bucket: string }) => r.bucket)).toEqual(["2041-03-02", "2041-03-20", "2041-03-21"]);
    expect(daily.totals.total).toBe("600.00");
    const annual = (await run("owner", "collections-summary", `${MARCH}&period=year`)).json().data;
    expect(annual.title).toBe("Annual Collection Report");
  });

  it("billing vs collection gives the collection rate", async () => {
    const d = (await run("acct", "billing-vs-collection", MARCH)).json().data;
    expect(d.rows).toEqual([expect.objectContaining({ month: "2041-03", billed: "1000.00", collected: "600.00", difference: "400.00", rate: "60.00%" })]);
  });

  it("revenue by service type", async () => {
    const d = (await run("owner", "revenue-by", `${MARCH}&groupBy=service`)).json().data;
    expect(d.rows.find((r: { key: string }) => r.key === "cable")).toMatchObject({ billed: "1000.00", collected: "600.00" });
  });

  it("voided receipts and the reversal report list the reversed payment with its reason", async () => {
    const vr = (await run("acct", "voided-receipts", MARCH)).json().data;
    expect(vr.rows.map((r: { receipt: string }) => r.receipt)).toContain(`OR-MR-${tag}-4`);
    const ra = (await run("acct", "reversals-adjustments", MARCH)).json().data;
    expect(ra.rows.some((r: { kind: string; reason: string }) => r.kind === "Payment reversal" && r.reason === `Wrong account ${tag}`)).toBe(true);
  });

  it("subscriber master list includes the account with its balance", async () => {
    const d = (await run("viewer", "subscriber-master")).json().data;
    const row = d.rows.find((r: { serviceNumber: string }) => r.serviceNumber === `SVC-MR-${tag}`);
    expect(row).toBeDefined();
    expect(row.balance).toBe("1000.00"); // no allocations recorded in this fixture
  });

  it("user activity counts sign-ins", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const d = (await run("acct", "user-activity", `dateFrom=${today}&dateTo=${today}`)).json().data;
    expect(d.rows.find((r: { user: string }) => r.user === "MR owner")?.logins).toBeGreaterThanOrEqual(1);
  });

  it("exports real PDF and XLSX files", async () => {
    const pdf = await app.inject({ method: "GET", url: `/api/v1/reports/run/billing-vs-collection/export?format=pdf&${MARCH}`, headers: auth("owner") });
    expect(pdf.statusCode).toBe(200);
    expect(pdf.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
    const xlsx = await app.inject({ method: "GET", url: `/api/v1/reports/run/remittances/export?format=xlsx&${MARCH}`, headers: auth("owner") });
    expect(xlsx.statusCode).toBe(200);
    expect(xlsx.rawPayload.subarray(0, 2).toString()).toBe("PK");
  });

  it("enforces per-report roles and lists only permitted reports", async () => {
    expect((await run("cashier", "audit-trail")).statusCode).toBe(403);
    expect((await run("viewer", "reversals-adjustments")).statusCode).toBe(403);
    expect((await run("tech", "collections-summary")).statusCode).toBe(403);
    expect((await run("owner", "nope")).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/api/v1/reports/catalog", headers: auth("cashier") })).statusCode).toBe(403);
    const viewerCat = (await app.inject({ method: "GET", url: "/api/v1/reports/catalog", headers: auth("viewer") })).json().data;
    const slugs = viewerCat.map((c: { slug: string }) => c.slug);
    expect(slugs).toContain("collections-summary");
    expect(slugs).not.toContain("audit-trail");
  });

  it("rejects an inverted date range", async () => {
    expect((await run("owner", "remittances", "dateFrom=2041-04-01&dateTo=2041-03-01")).statusCode).toBe(400);
  });
});

describe("Statement of Account for a date range (spec 3.5)", () => {
  it("carries the balance before the period as the opening balance", async () => {
    const whole = (await app.inject({ method: "GET", url: `/api/v1/reports/soa/${accountId}?dateFrom=2041-03-01&dateTo=2041-03-31`, headers: auth("owner") })).json().data.statement;
    expect(whole).toMatchObject({ openingBalance: "0.00", charges: "1000.00", closingBalance: "1000.00" });
    expect(whole.entries).toHaveLength(1);

    const later = (await app.inject({ method: "GET", url: `/api/v1/reports/soa/${accountId}?dateFrom=2041-03-02&dateTo=2041-03-31`, headers: auth("owner") })).json().data.statement;
    expect(later).toMatchObject({ openingBalance: "1000.00", charges: "0.00", closingBalance: "1000.00" });
    expect(later.entries).toHaveLength(0);

    const pdf = await app.inject({ method: "GET", url: `/api/v1/reports/soa/${accountId}/export?format=pdf&dateFrom=2041-03-01&dateTo=2041-03-31`, headers: auth("owner") });
    expect(pdf.statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: `/api/v1/reports/soa/${accountId}?dateFrom=2041-04-01&dateTo=2041-03-01`, headers: auth("owner") })).statusCode).toBe(400);
  });
});
