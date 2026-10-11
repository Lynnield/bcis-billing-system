import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../src/app";
import { db, pool } from "../src/db";
import { auditLogs, roles, userRoles, users } from "../src/db/schema";
import { hashPassword } from "../src/lib/password";
import { ROLE_NAMES } from "../src/lib/roles";
import { eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
const tag = Date.now().toString(36);
const createdUserIds: number[] = [];
const tokens: Record<string, string> = {};

async function mkUser(key: string, roleName: string) {
  const username = `au_${key}_${tag}`;
  const passwordHash = await hashPassword("S3cure!TestPassw0rd");
  const [u] = await db.insert(users).values({ username, email: `${username}@test.local`, fullName: `Audit ${key}`, passwordHash, status: "active" }).returning({ id: users.id });
  createdUserIds.push(u!.id);
  const [role] = await db.select().from(roles).where(eq(roles.name, roleName)).limit(1);
  await db.insert(userRoles).values({ userId: u!.id, roleId: role!.id });
  tokens[key] = (await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { identifier: username, password: "S3cure!TestPassw0rd" } })).json().token;
  return u!.id;
}
const auth = (k: string) => ({ authorization: `Bearer ${tokens[k]}` });

beforeAll(async () => {
  app = await buildApp();
  const ownerId = await mkUser("owner", ROLE_NAMES.OWNER);
  await mkUser("acct", ROLE_NAMES.ACCOUNTING_AUDITOR);
  await mkUser("cashier", ROLE_NAMES.CASHIER);
  await mkUser("admin", ROLE_NAMES.ADMINISTRATOR);
  await db.insert(auditLogs).values([
    { actorUserId: ownerId, action: `test_${tag}.alpha`, entityType: `test_${tag}`, entityId: 1, metadata: { n: 1 } },
    { actorUserId: ownerId, action: `test_${tag}.beta`, entityType: `test_${tag}`, entityId: 2, metadata: { n: 2 } },
  ]);
});

afterAll(async () => {
  await db.delete(auditLogs).where(inArray(auditLogs.actorUserId, createdUserIds));
  await db.delete(userRoles).where(inArray(userRoles.userId, createdUserIds));
  await db.delete(users).where(inArray(users.id, createdUserIds));
  await app.close();
  await pool.end();
});

describe("audit log viewer (spec 4.4)", () => {
  it("owner and auditor can read and filter, with actor names", async () => {
    for (const k of ["owner", "acct"]) {
      const res = await app.inject({ method: "GET", url: `/api/v1/audit-logs?action=test_${tag}.al`, headers: auth(k) });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toHaveLength(1);
      expect(res.json().data[0].actorName).toBe("Audit owner");
    }
    const byEntity = await app.inject({ method: "GET", url: `/api/v1/audit-logs?entityType=test_${tag}&entityId=2`, headers: auth("acct") });
    expect(byEntity.json().data[0].action).toBe(`test_${tag}.beta`);
  });

  it("cashier and administrator are refused (403)", async () => {
    for (const k of ["cashier", "admin"]) {
      expect((await app.inject({ method: "GET", url: "/api/v1/audit-logs", headers: auth(k) })).statusCode).toBe(403);
    }
  });

  it("exposes no way to change or delete an audit record", async () => {
    const [row] = await db.select().from(auditLogs).where(eq(auditLogs.action, `test_${tag}.alpha`));
    for (const method of ["PUT", "PATCH", "DELETE"] as const) {
      const res = await app.inject({ method, url: `/api/v1/audit-logs/${row!.id}`, headers: auth("owner"), payload: {} });
      expect(res.statusCode).toBe(404);
    }
  });
});
