import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../src/app";
import { db, pool } from "../src/db";
import { roles, userRoles, users } from "../src/db/schema";
import { hashPassword } from "../src/lib/password";
import { ROLE_NAMES } from "../src/lib/roles";
import { eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
const createdUserIds: number[] = [];
const tokens: Record<string, string> = {};
let cashierRoleId: number;
let administratorRoleId: number;

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
  await mkUser(uid("um_owner"), ROLE_NAMES.OWNER);
  await mkUser(uid("um_admin"), ROLE_NAMES.ADMINISTRATOR);
  await mkUser(uid("um_cashier"), ROLE_NAMES.CASHIER);

  const [cashierRole] = await db.select().from(roles).where(eq(roles.name, ROLE_NAMES.CASHIER)).limit(1);
  cashierRoleId = cashierRole!.id;
  const [adminRole] = await db.select().from(roles).where(eq(roles.name, ROLE_NAMES.ADMINISTRATOR)).limit(1);
  administratorRoleId = adminRole!.id;
});

afterAll(async () => {
  if (createdUserIds.length) {
    await db.delete(userRoles).where(inArray(userRoles.userId, createdUserIds));
    await db.delete(users).where(inArray(users.id, createdUserIds));
  }
  await app.close();
  await pool.end();
});

const ownerToken = () => tokens[Object.keys(tokens).find((k) => k.startsWith("um_owner"))!]!;
const adminToken = () => tokens[Object.keys(tokens).find((k) => k.startsWith("um_admin"))!]!;
const cashierToken = () => tokens[Object.keys(tokens).find((k) => k.startsWith("um_cashier"))!]!;

describe("User management (Owner-only administration)", () => {
  let newUserId: number;

  it("Owner can create a user with roles", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: auth(ownerToken()),
      payload: {
        username: uid("new_user"),
        email: `${uid("newuser")}@test.local`,
        fullName: "New Test User",
        password: "S3cure!TestPassw0rd",
        roleIds: [cashierRoleId],
      },
    });
    expect(res.statusCode).toBe(201);
    const data = res.json().data;
    expect(data.status).toBe("active");
    expect(data.roles.map((r: { name: string }) => r.name)).toEqual([ROLE_NAMES.CASHIER]);
    newUserId = data.id;
    createdUserIds.push(newUserId);
  });

  it("Administrator (non-Owner) cannot create a user", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: auth(adminToken()),
      payload: { username: uid("x"), email: "x@test.local", fullName: "X", password: "S3cure!TestPassw0rd", roleIds: [cashierRoleId] },
    });
    expect(res.statusCode).toBe(403);
  });

  it("rejects a duplicate username", async () => {
    const username = uid("dup_user");
    const payload = { username, email: `${username}@test.local`, fullName: "Dup", password: "S3cure!TestPassw0rd", roleIds: [cashierRoleId] };
    const first = await app.inject({ method: "POST", url: "/api/v1/users", headers: auth(ownerToken()), payload });
    expect(first.statusCode).toBe(201);
    createdUserIds.push(first.json().data.id);
    const second = await app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: auth(ownerToken()),
      payload: { ...payload, email: `${uid("other")}@test.local` },
    });
    expect(second.statusCode).toBe(409);
  });

  it("rejects a nonexistent role", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: auth(ownerToken()),
      payload: { username: uid("badrole"), email: `${uid("badrole")}@test.local`, fullName: "Bad Role", password: "S3cure!TestPassw0rd", roleIds: [999999] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("Owner can update a user's status and details", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/users/${newUserId}`,
      headers: auth(ownerToken()),
      payload: { fullName: "Updated Name", status: "inactive" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.fullName).toBe("Updated Name");
    expect(res.json().data.status).toBe("inactive");

    // Reactivate for subsequent tests
    const reactivate = await app.inject({
      method: "PATCH",
      url: `/api/v1/users/${newUserId}`,
      headers: auth(ownerToken()),
      payload: { status: "active" },
    });
    expect(reactivate.statusCode).toBe(200);
  });

  it("Owner cannot deactivate their own account", async () => {
    const me = await app.inject({ method: "GET", url: "/api/v1/users/me", headers: auth(ownerToken()) });
    const ownerId = me.json().user.id;
    const selfDeactivate = await app.inject({
      method: "PATCH",
      url: `/api/v1/users/${ownerId}`,
      headers: auth(ownerToken()),
      payload: { status: "inactive" },
    });
    expect(selfDeactivate.statusCode).toBe(409);
  });

  it("Owner can replace a user's roles", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/users/${newUserId}/roles`,
      headers: auth(ownerToken()),
      payload: { roleIds: [administratorRoleId] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.roles.map((r: { name: string }) => r.name)).toEqual([ROLE_NAMES.ADMINISTRATOR]);
  });

  it("Cashier cannot replace roles", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/users/${newUserId}/roles`,
      headers: auth(cashierToken()),
      payload: { roleIds: [cashierRoleId] },
    });
    expect(res.statusCode).toBe(403);
  });

  it("Owner can reset a user's password, and the new password logs in", async () => {
    const username = `reset-check-${Date.now()}`;
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: auth(ownerToken()),
      payload: { username, email: `${username}@test.local`, fullName: "Reset Check", password: "OldPassw0rd!!!!", roleIds: [cashierRoleId] },
    });
    const userId = create.json().data.id;
    createdUserIds.push(userId);

    const reset = await app.inject({
      method: "POST",
      url: `/api/v1/users/${userId}/reset-password`,
      headers: auth(ownerToken()),
      payload: { password: "NewPassw0rd!!!!" },
    });
    expect(reset.statusCode).toBe(200);

    const loginOld = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { identifier: username, password: "OldPassw0rd!!!!" } });
    expect(loginOld.statusCode).toBe(401);

    const loginNew = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { identifier: username, password: "NewPassw0rd!!!!" } });
    expect(loginNew.statusCode).toBe(200);
  });

  it("404s for a nonexistent user on update/roles/reset-password", async () => {
    const update = await app.inject({ method: "PATCH", url: "/api/v1/users/999999999", headers: auth(ownerToken()), payload: { fullName: "X" } });
    expect(update.statusCode).toBe(404);
    const rolesRes = await app.inject({ method: "PUT", url: "/api/v1/users/999999999/roles", headers: auth(ownerToken()), payload: { roleIds: [cashierRoleId] } });
    expect(rolesRes.statusCode).toBe(404);
    const resetRes = await app.inject({ method: "POST", url: "/api/v1/users/999999999/reset-password", headers: auth(ownerToken()), payload: { password: "Whatever12345!" } });
    expect(resetRes.statusCode).toBe(404);
  });
});
