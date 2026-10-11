import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../src/app";
import { db, pool } from "../src/db";
import { roles, subscribers, subscriberStatusHistory, userRoles, users } from "../src/db/schema";
import { hashPassword } from "../src/lib/password";
import { ROLE_NAMES } from "../src/lib/roles";
import { eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
const createdUserIds: number[] = [];
const createdSubscriberIds: number[] = [];
const tokens: { owner: string; admin: string; viewer: string; cashier: string } = {
  owner: "",
  admin: "",
  viewer: "",
  cashier: "",
};

async function createUserWithRole(username: string, roleName: string) {
  const passwordHash = await hashPassword("S3cure!TestPassw0rd");
  const [u] = await db
    .insert(users)
    .values({ username, email: `${username}@test.local`, fullName: `Test ${username}`, passwordHash, status: "active" })
    .returning({ id: users.id });
  createdUserIds.push(u!.id);
  const [role] = await db.select().from(roles).where(eq(roles.name, roleName)).limit(1);
  await db.insert(userRoles).values({ userId: u!.id, roleId: role!.id });
}

async function loginToken(username: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { identifier: username, password: "S3cure!TestPassw0rd" },
  });
  return res.json().token;
}

async function createSubscriberViaApi(token: string, accountNumber: string) {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/subscribers",
    headers: { authorization: `Bearer ${token}` },
    payload: {
      accountNumber,
      firstName: "Juan",
      lastName: "Dela Cruz",
      contactNumber: "09171234567",
      email: `${accountNumber}@example.test`,
      addressLine1: "123 Test St",
      city: "Test City",
    },
  });
  if (res.statusCode === 201) {
    createdSubscriberIds.push(res.json().data.id);
  }
  return res;
}

beforeAll(async () => {
  app = await buildApp();
  await createUserWithRole("sub_owner", ROLE_NAMES.OWNER);
  await createUserWithRole("sub_admin", ROLE_NAMES.ADMINISTRATOR);
  await createUserWithRole("sub_viewer", ROLE_NAMES.READ_ONLY_VIEWER);
  await createUserWithRole("sub_cashier", ROLE_NAMES.CASHIER);
  tokens.owner = await loginToken("sub_owner");
  tokens.admin = await loginToken("sub_admin");
  tokens.viewer = await loginToken("sub_viewer");
  tokens.cashier = await loginToken("sub_cashier");
});

afterAll(async () => {
  if (createdSubscriberIds.length > 0) {
    await db.delete(subscriberStatusHistory).where(inArray(subscriberStatusHistory.subscriberId, createdSubscriberIds));
    await db.delete(subscribers).where(inArray(subscribers.id, createdSubscriberIds));
  }
  if (createdUserIds.length > 0) {
    await db.delete(userRoles).where(inArray(userRoles.userId, createdUserIds));
    await db.delete(users).where(inArray(users.id, createdUserIds));
  }
  await app.close();
  await pool.end();
});

describe("subscribers authentication & authorization", () => {
  it("rejects unauthenticated list with 401", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/subscribers" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects invalid JWT with 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/subscribers",
      headers: { authorization: "Bearer garbage" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("owner can create a subscriber", async () => {
    const res = await createSubscriberViaApi(tokens.owner, "ACC-0001");
    expect(res.statusCode).toBe(201);
    expect(res.json().data.accountNumber).toBe("ACC-0001");
  });

  it("administrator can create a subscriber", async () => {
    const res = await createSubscriberViaApi(tokens.admin, "ACC-0002");
    expect(res.statusCode).toBe(201);
  });

  it("read-only viewer cannot create a subscriber (403)", async () => {
    const res = await createSubscriberViaApi(tokens.viewer, "ACC-0003");
    expect(res.statusCode).toBe(403);
  });

  it("read-only viewer can read subscribers", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/subscribers",
      headers: { authorization: `Bearer ${tokens.viewer}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.pagination.page).toBe(1);
    expect(body.pagination.pageSize).toBe(20);
  });

  it("cashier cannot update a subscriber (403)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/subscribers/${createdSubscriberIds[0]}`,
      headers: { authorization: `Bearer ${tokens.cashier}` },
      payload: { firstName: "Hacked" },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("subscribers CRUD", () => {
  it("rejects invalid create payload with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/subscribers",
      headers: { authorization: `Bearer ${tokens.owner}` },
      payload: { accountNumber: "", firstName: "x" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("gets one subscriber", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/subscribers/${createdSubscriberIds[0]}`,
      headers: { authorization: `Bearer ${tokens.viewer}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.accountNumber).toBe("ACC-0001");
  });

  it("returns 404 for a nonexistent subscriber", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/subscribers/99999999",
      headers: { authorization: `Bearer ${tokens.viewer}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("updates allowed fields only", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/subscribers/${createdSubscriberIds[0]}`,
      headers: { authorization: `Bearer ${tokens.admin}` },
      payload: { firstName: "Updated", city: "New City" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.firstName).toBe("Updated");
    expect(res.json().data.city).toBe("New City");
  });

  it("rejects invalid update with 400", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/subscribers/${createdSubscriberIds[0]}`,
      headers: { authorization: `Bearer ${tokens.admin}` },
      payload: { email: "not-an-email" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects duplicate account numbers with 409", async () => {
    const res = await createSubscriberViaApi(tokens.owner, "ACC-0001");
    expect(res.statusCode).toBe(409);
  });

  it("does not allow hard deletion", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/subscribers/${createdSubscriberIds[0]}`,
      headers: { authorization: `Bearer ${tokens.owner}` },
    });
    expect(res.statusCode).toBe(405);
    expect(res.json().message).toContain("cannot be deleted");
  });
});

describe("subscriber status & history", () => {
  it("changes status and records history", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/subscribers/${createdSubscriberIds[0]}/status`,
      headers: { authorization: `Bearer ${tokens.owner}` },
      payload: { status: "active", reason: "Installation completed" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("active");

    const history = await app.inject({
      method: "GET",
      url: `/api/v1/subscribers/${createdSubscriberIds[0]}/status-history`,
      headers: { authorization: `Bearer ${tokens.viewer}` },
    });
    expect(history.statusCode).toBe(200);
    const rows = history.json().data;
    const change = rows.find((r: { note: string | null }) => r.note === "Installation completed");
    expect(change).toBeTruthy();
    expect(change.oldStatus).toBe("pending");
    expect(change.newStatus).toBe("active");
    expect(change.changedBy).toBe("sub_owner");
  });

  it("does not create history for a no-op status change", async () => {
    const before = await db
      .select()
      .from(subscriberStatusHistory)
      .where(eq(subscriberStatusHistory.subscriberId, createdSubscriberIds[0]!));
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/subscribers/${createdSubscriberIds[0]}/status`,
      headers: { authorization: `Bearer ${tokens.owner}` },
      payload: { status: "active" },
    });
    expect(res.statusCode).toBe(409);
    const after = await db
      .select()
      .from(subscriberStatusHistory)
      .where(eq(subscriberStatusHistory.subscriberId, createdSubscriberIds[0]!));
    expect(after.length).toBe(before.length);
  });

  it("rejects invalid status with 400", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/subscribers/${createdSubscriberIds[0]}/status`,
      headers: { authorization: `Bearer ${tokens.owner}` },
      payload: { status: "banana" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns history newest first", async () => {
    await app.inject({
      method: "PATCH",
      url: `/api/v1/subscribers/${createdSubscriberIds[0]}/status`,
      headers: { authorization: `Bearer ${tokens.owner}` },
      payload: { status: "suspended", reason: "Missed payments" },
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/subscribers/${createdSubscriberIds[0]}/status-history`,
      headers: { authorization: `Bearer ${tokens.admin}` },
    });
    const rows = res.json().data;
    expect(rows[0].newStatus).toBe("suspended");
    expect(rows[rows.length - 1].oldStatus).toBeNull();
  });

  it("returns 404 for history of a nonexistent subscriber", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/subscribers/99999999/status-history",
      headers: { authorization: `Bearer ${tokens.viewer}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("never exposes password hashes in responses", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/subscribers/${createdSubscriberIds[0]}/status-history`,
      headers: { authorization: `Bearer ${tokens.admin}` },
    });
    expect(JSON.stringify(res.json())).not.toContain("passwordHash");
    expect(JSON.stringify(res.json())).not.toContain("password_hash");
  });
});
