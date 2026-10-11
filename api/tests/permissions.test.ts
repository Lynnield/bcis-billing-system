import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../src/app";
import { db, pool } from "../src/db";
import { auditLogs, roles, userRoles, users } from "../src/db/schema";
import { hashPassword } from "../src/lib/password";
import { ROLE_NAMES } from "../src/lib/roles";
import { PERMISSION_CODES } from "../src/lib/permissions";
import { eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
const tag = Date.now().toString(36);
const createdUserIds: number[] = [];
const tokens: Record<string, string> = {};

async function mkUser(key: string, roleName: string) {
  const username = `pm_${key}_${tag}`;
  const passwordHash = await hashPassword("S3cure!TestPassw0rd");
  const [u] = await db.insert(users).values({ username, email: `${username}@test.local`, fullName: username, passwordHash, status: "active" }).returning({ id: users.id });
  createdUserIds.push(u!.id);
  const [role] = await db.select().from(roles).where(eq(roles.name, roleName)).limit(1);
  await db.insert(userRoles).values({ userId: u!.id, roleId: role!.id });
  tokens[key] = (await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { identifier: username, password: "S3cure!TestPassw0rd" } })).json().token;
}
const auth = (k: string) => ({ authorization: `Bearer ${tokens[k]}` });

async function matrix() {
  return (await app.inject({ method: "GET", url: "/api/v1/permissions", headers: auth("owner") })).json().data as {
    permissions: Array<{ code: string }>;
    roles: Array<{ id: number; name: string; permissions: string[] }>;
  };
}

beforeAll(async () => {
  app = await buildApp();
  await mkUser("owner", ROLE_NAMES.OWNER);
  await mkUser("acct", ROLE_NAMES.ACCOUNTING_AUDITOR);
  await mkUser("tech", ROLE_NAMES.TECHNICIAN);
  await mkUser("admin", ROLE_NAMES.ADMINISTRATOR);
});

afterAll(async () => {
  await db.delete(auditLogs).where(inArray(auditLogs.actorUserId, createdUserIds));
  await db.delete(userRoles).where(inArray(userRoles.userId, createdUserIds));
  await db.delete(users).where(inArray(users.id, createdUserIds));
  await app.close();
  await pool.end();
});

describe("granular permissions (spec 4.4)", () => {
  it("the catalog includes the spec's example permissions and /auth/me reports a user's grants", async () => {
    for (const code of ["subscriber.view", "billing.generate", "payment.create", "payment.reverse", "collection.reconcile", "report.export", "user.manage", "backup.restore"]) {
      expect(PERMISSION_CODES).toContain(code);
    }
    const m = await matrix();
    expect(m.permissions.map((p) => p.code).sort()).toEqual([...PERMISSION_CODES].sort());
    const me = (await app.inject({ method: "GET", url: "/api/v1/auth/me", headers: auth("acct") })).json().user;
    expect(me.permissions).toContain("payment.reverse");
    expect(me.permissions).not.toContain("backup.restore");
  });

  it("Technician sees service information but no financial records (spec 3.1)", async () => {
    expect((await app.inject({ method: "GET", url: "/api/v1/service-accounts", headers: auth("tech") })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/v1/payments", headers: auth("tech") })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: "/api/v1/receivables/aging", headers: auth("tech") })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: "/api/v1/reports/dashboard", headers: auth("tech") })).statusCode).toBe(200);
  });

  it("revoking a permission takes effect on the next request; the change is audited; restoring it works", async () => {
    const m = await matrix();
    const acct = m.roles.find((r) => r.name === ROLE_NAMES.ACCOUNTING_AUDITOR)!;
    const without = acct.permissions.filter((c) => c !== "payment.reverse");

    const put = await app.inject({ method: "PUT", url: `/api/v1/roles/${acct.id}/permissions`, headers: auth("owner"), payload: { permissions: without } });
    expect(put.statusCode).toBe(200);
    try {
      const res = await app.inject({ method: "POST", url: "/api/v1/payments/999999/reverse", headers: auth("acct"), payload: { reason: "x" } });
      expect(res.statusCode).toBe(403);
      expect(res.json().requiredPermission).toBe("payment.reverse");
      const [audit] = await db.select().from(auditLogs).where(eq(auditLogs.action, "role.permissions_update"));
      expect((audit!.metadata as { revoked: string[] }).revoked).toEqual(["payment.reverse"]);
    } finally {
      await app.inject({ method: "PUT", url: `/api/v1/roles/${acct.id}/permissions`, headers: auth("owner"), payload: { permissions: acct.permissions } });
    }
    const back = await app.inject({ method: "POST", url: "/api/v1/payments/999999/reverse", headers: auth("acct"), payload: { reason: "x" } });
    expect(back.statusCode).toBe(404);
  });

  it("only user.manage may edit the matrix; the Owner role keeps user.manage; unknown codes are rejected", async () => {
    const m = await matrix();
    const owner = m.roles.find((r) => r.name === ROLE_NAMES.OWNER)!;
    expect((await app.inject({ method: "PUT", url: `/api/v1/roles/${owner.id}/permissions`, headers: auth("admin"), payload: { permissions: [] } })).statusCode).toBe(403);
    expect((await app.inject({ method: "PUT", url: `/api/v1/roles/${owner.id}/permissions`, headers: auth("owner"), payload: { permissions: ["subscriber.view"] } })).statusCode).toBe(409);
    expect((await app.inject({ method: "PUT", url: `/api/v1/roles/${owner.id}/permissions`, headers: auth("owner"), payload: { permissions: ["user.manage", "nope.code"] } })).statusCode).toBe(400);
    // Administrators can read the matrix but not change it.
    expect((await app.inject({ method: "GET", url: "/api/v1/permissions", headers: auth("admin") })).statusCode).toBe(200);
  });
});

describe("dashboard panels (spec 4.3)", () => {
  it("includes billing vs collection, method mix, collector performance, overdue alerts and recent payments for financial roles only", async () => {
    const acct = (await app.inject({ method: "GET", url: "/api/v1/reports/dashboard", headers: auth("acct") })).json().data;
    for (const k of ["billingVsCollection", "paymentMethodMix", "collectorPerformance", "overdueAlerts", "recentPayments"]) {
      expect(Array.isArray(acct[k]), k).toBe(true);
    }
    const tech = (await app.inject({ method: "GET", url: "/api/v1/reports/dashboard", headers: auth("tech") })).json().data;
    expect(tech.recentPayments).toBeUndefined();
    expect(tech.activeSubscribers).toBeTypeOf("number");
  });
});
