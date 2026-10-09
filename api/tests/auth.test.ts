import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../src/app";
import { db, pool } from "../src/db";
import { roles, userRoles, users } from "../src/db/schema";
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
