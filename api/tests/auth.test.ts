import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../src/app";
import { db, pool } from "../src/db";
import { auditLogs, roles, userRoles, users } from "../src/db/schema";
import { MAX_FAILED_ATTEMPTS } from "../src/routes/auth";
import { hashPassword } from "../src/lib/password";
import { bootstrapOwner } from "../src/db/bootstrap-owner";
import { ROLE_NAMES } from "../src/lib/roles";
import { eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
const createdUserIds: number[] = [];

async function createUser(username: string, status: "active" | "inactive", roleName?: string) {
  const passwordHash = await hashPassword("S3cure!TestPassw0rd");
  const [u] = await db
    .insert(users)
    .values({
      username,
      email: `${username}@test.local`,
      fullName: `Test ${username}`,
      passwordHash,
      status,
    })
    .returning({ id: users.id });
  createdUserIds.push(u!.id);

  if (roleName) {
    const [role] = await db.select().from(roles).where(eq(roles.name, roleName)).limit(1);
    await db.insert(userRoles).values({ userId: u!.id, roleId: role!.id });
  }
  return u!.id;
}

beforeAll(async () => {
  app = await buildApp();
  await createUser("test_owner", "active", ROLE_NAMES.OWNER);
  await createUser("test_cashier", "active", ROLE_NAMES.CASHIER);
  await createUser("test_inactive", "inactive", ROLE_NAMES.ADMINISTRATOR);
});

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await db.delete(userRoles).where(inArray(userRoles.userId, createdUserIds));
    await db.delete(users).where(inArray(users.id, createdUserIds));
  }
  // Clean up any bootstrapped test owner
  const bootstrapped = await db.select({ id: users.id }).from(users).where(eq(users.username, "bootstrap_owner"));
  for (const b of bootstrapped) {
    await db.delete(userRoles).where(eq(userRoles.userId, b.id));
    await db.delete(users).where(eq(users.id, b.id));
  }
  await app.close();
  await pool.end();
});

async function login(username: string, password: string) {
  return app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { identifier: username, password },
  });
}

describe("auth", () => {
  it("logs in with valid credentials and returns safe user info", async () => {
    const res = await login("test_owner", "S3cure!TestPassw0rd");
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.token).toBe("string");
    expect(body.user.username).toBe("test_owner");
    expect(body.user.roles).toContain(ROLE_NAMES.OWNER);
    expect(JSON.stringify(body)).not.toContain("passwordHash");
    expect(JSON.stringify(body)).not.toContain("password_hash");
  });

  it("rejects invalid password with a generic 401", async () => {
    const res = await login("test_owner", "wrong-password");
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe("Invalid username/email or password");
  });

  it("rejects nonexistent user with a generic 401", async () => {
    const res = await login("no_such_user", "whatever12345");
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe("Invalid username/email or password");
  });

  it("rejects inactive user with a generic 401", async () => {
    const res = await login("test_inactive", "S3cure!TestPassw0rd");
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe("Invalid username/email or password");
  });

  it("rejects missing JWT on /auth/me", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/auth/me" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects invalid JWT on /auth/me", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { authorization: "Bearer not-a-real-token" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns the authenticated profile on /auth/me", async () => {
    const loginRes = await login("test_owner", "S3cure!TestPassw0rd");
    const { token } = loginRes.json();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.username).toBe("test_owner");
    expect(body.user.roles).toContain(ROLE_NAMES.OWNER);
    expect(JSON.stringify(body)).not.toContain("passwordHash");
  });

  it("allows an owner to list users (200)", async () => {
    const loginRes = await login("test_owner", "S3cure!TestPassw0rd");
    const { token } = loginRes.json();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/users",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().users)).toBe(true);
    expect(JSON.stringify(res.json())).not.toContain("passwordHash");
  });

  it("forbids a cashier from listing users (403)", async () => {
    const loginRes = await login("test_cashier", "S3cure!TestPassw0rd");
    const { token } = loginRes.json();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/users",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("allows any authenticated user to get their own profile", async () => {
    const loginRes = await login("test_cashier", "S3cure!TestPassw0rd");
    const { token } = loginRes.json();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/users/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.username).toBe("test_cashier");
  });

  it("rejects unauthenticated access to roles (401)", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/roles" });
    expect(res.statusCode).toBe(401);
  });

  it("owner bootstrap is idempotent and assigns the Owner role", async () => {
    const input = {
      username: "bootstrap_owner",
      email: "bootstrap_owner@test.local",
      fullName: "Bootstrap Owner",
      password: "B00tstrap!Passw0rd123",
    };
    const first = await bootstrapOwner(input);
    expect(first.created).toBe(true);
    const second = await bootstrapOwner(input);
    expect(second.created).toBe(false);
    expect(second.userId).toBe(first.userId);

    const assignments = await db
      .select({ roleName: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(eq(userRoles.userId, first.userId));
    expect(assignments.filter((a) => a.roleName === ROLE_NAMES.OWNER)).toHaveLength(1);
  });
});

describe("failed-login lockout (spec 4.4)", () => {
  it("locks after 5 consecutive failures, refuses even the right password, and the Owner can unlock", async () => {
    const username = `lockout_${Date.now()}`;
    const passwordHash = await hashPassword("Correct!Passw0rd");
    const [u] = await db.insert(users).values({ username, email: `${username}@test.local`, fullName: username, passwordHash, status: "active" }).returning({ id: users.id });
    const [role] = await db.select().from(roles).where(eq(roles.name, ROLE_NAMES.CASHIER)).limit(1);
    await db.insert(userRoles).values({ userId: u!.id, roleId: role!.id });
    const login = (password: string) => app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { identifier: username, password } });

    try {
      for (let i = 1; i < MAX_FAILED_ATTEMPTS; i++) expect((await login("wrong")).statusCode).toBe(401);
      const locking = await login("wrong");
      expect(locking.statusCode).toBe(423);
      expect((await login("Correct!Passw0rd")).statusCode).toBe(423);

      const audit = await db.select().from(auditLogs).where(eq(auditLogs.entityId, u!.id));
      expect(audit.map((a) => a.action)).toContain("auth.locked");
      expect(JSON.stringify(audit)).not.toContain("wrong");

      // Owner unlock.
      const ownerName = `lockout_owner_${Date.now()}`;
      const [o] = await db.insert(users).values({ username: ownerName, email: `${ownerName}@test.local`, fullName: ownerName, passwordHash, status: "active" }).returning({ id: users.id });
      const [ownerRole] = await db.select().from(roles).where(eq(roles.name, ROLE_NAMES.OWNER)).limit(1);
      await db.insert(userRoles).values({ userId: o!.id, roleId: ownerRole!.id });
      const ownerToken = (await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { identifier: ownerName, password: "Correct!Passw0rd" } })).json().token;
      const unlock = await app.inject({ method: "POST", url: `/api/v1/users/${u!.id}/unlock`, headers: { authorization: `Bearer ${ownerToken}` } });
      expect(unlock.statusCode).toBe(200);
      const ok = await login("Correct!Passw0rd");
      expect(ok.statusCode).toBe(200);

      const [after] = await db.select().from(users).where(eq(users.id, u!.id));
      expect(after!.failedLoginCount).toBe(0);
      expect(after!.lastLoginAt).not.toBeNull();

      await db.delete(auditLogs).where(eq(auditLogs.actorUserId, o!.id));
      await db.delete(userRoles).where(eq(userRoles.userId, o!.id));
      await db.delete(users).where(eq(users.id, o!.id));
    } finally {
      await db.delete(auditLogs).where(eq(auditLogs.actorUserId, u!.id));
      await db.delete(auditLogs).where(eq(auditLogs.entityId, u!.id));
      await db.delete(userRoles).where(eq(userRoles.userId, u!.id));
      await db.delete(users).where(eq(users.id, u!.id));
    }
  });

  it("an unknown username is rejected with the same message as a wrong password", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { identifier: `nobody_${Date.now()}`, password: "x" } });
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe("Invalid username/email or password");
  });
});
