import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../src/app";
import { db, pool } from "../src/db";
import {
  auditLogs,
  billingPeriods,
  invoiceLineItems,
  invoices,
  reconnectionRecords,
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
const tag = Date.now().toString(36);
const createdUserIds: number[] = [];
const tokens: Record<string, string> = {};
const userIds: Record<string, number> = {};
let subscriberId: number;
let serviceId: number;
let planId: number;
const accountIds: number[] = [];
const periodIds: number[] = [];

async function mkUser(key: string, roleName: string) {
  const username = `sc_${key}_${tag}`;
  const passwordHash = await hashPassword("S3cure!TestPassw0rd");
  const [u] = await db.insert(users).values({ username, email: `${username}@test.local`, fullName: `SC ${key}`, passwordHash, status: "active" }).returning({ id: users.id });
  createdUserIds.push(u!.id);
  userIds[key] = u!.id;
  const [role] = await db.select().from(roles).where(eq(roles.name, roleName)).limit(1);
  await db.insert(userRoles).values({ userId: u!.id, roleId: role!.id });
  tokens[key] = (await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { identifier: username, password: "S3cure!TestPassw0rd" } })).json().token;
}
const auth = (k: string) => ({ authorization: `Bearer ${tokens[k]}` });

async function mkAccount(extra: Record<string, unknown> = {}) {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/service-accounts",
    headers: auth("admin"),
    payload: { subscriberId, planId, serviceNumber: `SVC-SC-${tag}-${accountIds.length}`, status: "active", ...extra },
  });
  expect(res.statusCode).toBe(201);
  accountIds.push(res.json().data.id);
  return res.json().data.id as number;
}

async function mkPeriod(month: number) {
  const mm = String(month).padStart(2, "0");
  const [p] = await db.insert(billingPeriods).values({ label: `SC ${tag} ${mm}`, periodStart: new Date(`2042-${mm}-01`), periodEnd: new Date(`2042-${mm}-28`), dueDate: new Date(`2042-${mm}-10`) }).returning();
  periodIds.push(p!.id);
  return p!.id;
}

async function bill(accountId: number, periodId: number) {
  return app.inject({ method: "POST", url: "/api/v1/invoices", headers: auth("admin"), payload: { serviceAccountId: accountId, billingPeriodId: periodId } });
}

beforeAll(async () => {
  app = await buildApp();
  await mkUser("owner", ROLE_NAMES.OWNER);
  await mkUser("admin", ROLE_NAMES.ADMINISTRATOR);
  await mkUser("super", ROLE_NAMES.COLLECTION_SUPERVISOR);
  await mkUser("tech", ROLE_NAMES.TECHNICIAN);
  const [sub] = await db.insert(subscribers).values({ accountNumber: `ACC-SC-${tag}`, firstName: "Service", lastName: "Control", addressLine1: "1 St", status: "active" }).returning();
  subscriberId = sub!.id;
  const [svc] = await db.insert(services).values({ type: "combo", name: `SC ${tag}` }).returning();
  serviceId = svc!.id;
  const plan = await app.inject({
    method: "POST",
    url: `/api/v1/services/${serviceId}/plans`,
    headers: auth("admin"),
    payload: { code: `CMB-${tag}`, name: `Combo ${tag}`, price: "1499.00", installationFee: "500.00", reconnectionFee: "200.00", speedMbps: 50, channelCount: 120 },
  });
  expect(plan.statusCode).toBe(201);
  planId = plan.json().data.id;
});

afterAll(async () => {
  if (accountIds.length) {
    const invs = await db.select({ id: invoices.id }).from(invoices).where(inArray(invoices.serviceAccountId, accountIds));
    await db.delete(reconnectionRecords).where(inArray(reconnectionRecords.serviceAccountId, accountIds));
    if (invs.length) {
      await db.delete(invoiceLineItems).where(inArray(invoiceLineItems.invoiceId, invs.map((i) => i.id)));
      await db.delete(invoices).where(inArray(invoices.id, invs.map((i) => i.id)));
    }
    await db.delete(serviceAccounts).where(inArray(serviceAccounts.id, accountIds));
  }
  if (periodIds.length) await db.delete(billingPeriods).where(inArray(billingPeriods.id, periodIds));
  await db.delete(servicePlans).where(eq(servicePlans.serviceId, serviceId));
  await db.delete(services).where(eq(services.id, serviceId));
  await db.delete(subscribers).where(eq(subscribers.id, subscriberId));
  await db.delete(auditLogs).where(inArray(auditLogs.actorUserId, createdUserIds));
  await db.delete(userRoles).where(inArray(userRoles.userId, createdUserIds));
  await db.delete(users).where(inArray(users.id, createdUserIds));
  await app.close();
  await pool.end();
});

describe("plan and service account attributes (spec 3.3)", () => {
  it("stores plan code, fees, speed and channel count; codes are unique", async () => {
    const [plan] = await db.select().from(servicePlans).where(eq(servicePlans.id, planId));
    expect(plan).toMatchObject({ code: `CMB-${tag}`, installationFee: "500.00", reconnectionFee: "200.00", speedMbps: 50, channelCount: 120 });
    const dup = await app.inject({ method: "POST", url: `/api/v1/services/${serviceId}/plans`, headers: auth("admin"), payload: { code: `CMB-${tag}`, name: "Other", price: "1.00" } });
    expect(dup.statusCode).toBe(409);
  });

  it("first invoice carries the installation fee; later invoices do not", async () => {
    const acc = await mkAccount({ installationAddress: "Purok 3, Malaybalay" });
    const first = await bill(acc, await mkPeriod(1));
    expect(first.statusCode).toBe(201);
    expect(first.json().data.lineItems.map((l: { description: string }) => l.description)).toContain("Installation fee");
    expect(first.json().data.totalAmount).toBe("1999.00");
    const second = await bill(acc, await mkPeriod(2));
    expect(second.json().data.totalAmount).toBe("1499.00");
  });

  it("account rate and due day override the plan price and period due date", async () => {
    const acc = await mkAccount({ currentRate: "1200.00", billingDueDay: 15 });
    const inv = (await bill(acc, periodIds[0]!)).json().data;
    expect(inv.lineItems[0]).toMatchObject({ description: `Combo ${tag} (account rate)`, unitPrice: "1200.00" });
    expect(inv.dueDate.slice(0, 10)).toBe("2042-01-15");
  });

  it("a plan price change affects future invoices only", async () => {
    const acc = accountIds[0]!;
    const before = await db.select().from(invoices).where(eq(invoices.serviceAccountId, acc));
    const res = await app.inject({ method: "PATCH", url: `/api/v1/service-plans/${planId}`, headers: auth("admin"), payload: { price: "1599.00" } });
    expect(res.statusCode).toBe(200);
    const after = await db.select().from(invoices).where(eq(invoices.serviceAccountId, acc));
    expect(after.map((i) => i.totalAmount)).toEqual(before.map((i) => i.totalAmount));
    const third = await bill(acc, await mkPeriod(3));
    expect(third.json().data.totalAmount).toBe("1599.00");
    const [audit] = await db.select().from(auditLogs).where(eq(auditLogs.action, "service_plan.update"));
    expect((audit!.metadata as { old: { price: string } }).old.price).toBeDefined();
  });

  it("no invoice before the billing start date", async () => {
    const acc = await mkAccount({ billingStartDate: "2042-06-01" });
    const res = await bill(acc, periodIds[0]!);
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/starts on 2042-06-01/);
  });

  it("status changes are recorded in the service history", async () => {
    const acc = accountIds[1]!;
    await app.inject({ method: "PATCH", url: `/api/v1/service-accounts/${acc}/status`, headers: auth("admin"), payload: { status: "inactive", reason: "Moved away" } });
    await app.inject({ method: "PATCH", url: `/api/v1/service-accounts/${acc}/status`, headers: auth("admin"), payload: { status: "active" } });
    const hist = (await app.inject({ method: "GET", url: `/api/v1/service-accounts/${acc}/history`, headers: auth("tech") })).json().data;
    const changes = hist.filter((h: { action: string }) => h.action === "service_account.status_change");
    expect(changes).toHaveLength(2);
    expect(changes[1].metadata).toMatchObject({ previousStatus: "active", newStatus: "inactive", reason: "Moved away" });
  });
});

describe("reconnection workflow (spec 3.10)", () => {
  it("refuses while an overdue balance remains; Owner may override with a reason", async () => {
    // Account 0 has unpaid invoices due in 2042... make one overdue.
    const acc = accountIds[0]!;
    const [inv] = await db.select().from(invoices).where(eq(invoices.serviceAccountId, acc)).limit(1);
    await db.update(invoices).set({ dueDate: new Date("2020-01-01") }).where(eq(invoices.id, inv!.id));
    await app.inject({ method: "PATCH", url: `/api/v1/service-accounts/${acc}/suspend`, headers: auth("super"), payload: { reason: "Overdue" } });

    const refused = await app.inject({ method: "PATCH", url: `/api/v1/service-accounts/${acc}/reconnect`, headers: auth("super"), payload: {} });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().overdueBalance).toBeDefined();

    const supervisorOverride = await app.inject({ method: "PATCH", url: `/api/v1/service-accounts/${acc}/reconnect`, headers: auth("super"), payload: { overrideUnpaid: true, reason: "x" } });
    expect(supervisorOverride.statusCode).toBe(403);

    const ownerOverride = await app.inject({
      method: "PATCH",
      url: `/api/v1/service-accounts/${acc}/reconnect`,
      headers: auth("owner"),
      payload: { overrideUnpaid: true, reason: "Promise to pay on Friday", completeNow: true },
    });
    expect(ownerOverride.statusCode).toBe(200);
    expect(ownerOverride.json().data.status).toBe("active");
  });

  it("request -> technician completes -> fee billed on the next invoice", async () => {
    const acc = accountIds[1]!; // no overdue balance
    await app.inject({ method: "PATCH", url: `/api/v1/service-accounts/${acc}/suspend`, headers: auth("super"), payload: {} });

    const req = await app.inject({ method: "PATCH", url: `/api/v1/service-accounts/${acc}/reconnect`, headers: auth("super"), payload: { technicianUserId: userIds.tech } });
    expect(req.statusCode).toBe(200);
    expect(req.json().data.status).toBe("suspended");
    const recon = req.json().reconnection;
    expect(recon).toMatchObject({ status: "requested", fee: "200.00", technicianUserId: userIds.tech });

    const again = await app.inject({ method: "PATCH", url: `/api/v1/service-accounts/${acc}/reconnect`, headers: auth("super"), payload: {} });
    expect(again.statusCode).toBe(409);

    const done = await app.inject({ method: "POST", url: `/api/v1/service-accounts/${acc}/reconnections/${recon.id}/complete`, headers: auth("tech"), payload: { notes: "Line restored" } });
    expect(done.statusCode).toBe(200);
    expect(done.json().data.status).toBe("active");

    const next = (await bill(acc, await mkPeriod(4))).json().data;
    expect(next.lineItems.some((l: { description: string; amount: string }) => l.description.startsWith("Reconnection fee") && l.amount === "200.00")).toBe(true);
    const [row] = await db.select().from(reconnectionRecords).where(eq(reconnectionRecords.id, recon.id));
    expect(row!.billedInvoiceId).toBe(next.id);

    // Billed once only.
    const later = (await bill(acc, await mkPeriod(5))).json().data;
    expect(later.lineItems.some((l: { description: string }) => l.description.startsWith("Reconnection fee"))).toBe(false);
  });
});
