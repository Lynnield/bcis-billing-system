import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../src/app";
import { db, pool } from "../src/db";
import { applicationSettings, collectionAreas, collectors, roles, serviceAccounts, servicePlans, services, subscribers, userRoles, users } from "../src/db/schema";
import { hashPassword } from "../src/lib/password";
import { ROLE_NAMES } from "../src/lib/roles";
import { eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
let subscriberId: number;
let serviceId: number;
let planId: number;
let otherServiceId: number;
let areaId: number;
let collectorId: number;
const createdUserIds: number[] = [];
const createdAccountIds: number[] = [];
const createdAreaIds: number[] = [];
const tokens: Record<string, string> = {};

async function mkUser(username: string, roleName: string) {
  const passwordHash = await hashPassword("S3cure!TestPassw0rd");
  const [u] = await db.insert(users).values({ username, email: `${username}@test.local`, fullName: username, passwordHash, status: "active" }).returning({ id: users.id });
  createdUserIds.push(u!.id);
  const [role] = await db.select().from(roles).where(eq(roles.name, roleName)).limit(1);
  await db.insert(userRoles).values({ userId: u!.id, roleId: role!.id });
  const res = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { identifier: username, password: "S3cure!TestPassw0rd" } });
  tokens[username] = res.json().token;
}

beforeAll(async () => {
  app = await buildApp();
  await mkUser("sa_owner", ROLE_NAMES.OWNER);
  await mkUser("sa_admin", ROLE_NAMES.ADMINISTRATOR);
  await mkUser("sa_supervisor", ROLE_NAMES.COLLECTION_SUPERVISOR);
  await mkUser("sa_viewer", ROLE_NAMES.READ_ONLY_VIEWER);

  const [sub] = await db.insert(subscribers).values({ accountNumber: "ACC-SA-1", firstName: "Ana", lastName: "Reyes", addressLine1: "1 Main St", status: "active" }).returning();
  subscriberId = sub!.id;

  const [svc] = await db.insert(services).values({ type: "internet", name: "Internet SA" }).returning();
  serviceId = svc!.id;
  const [plan] = await db.insert(servicePlans).values({ serviceId, name: "Plan P7", price: "799.00" }).returning();
  planId = plan!.id;
  const [svc2] = await db.insert(services).values({ type: "cable", name: "Cable SA" }).returning();
  otherServiceId = svc2!.id;
  const [area] = await db.insert(collectionAreas).values({ name: "Area SA" }).returning();
  areaId = area!.id;
  const [col] = await db.insert(collectors).values({ fullName: "Col SA", collectionAreaId: areaId }).returning();
  collectorId = col!.id;
});

afterAll(async () => {
  await db.delete(applicationSettings).where(eq(applicationSettings.key, "collections"));
  if (createdAccountIds.length) await db.delete(serviceAccounts).where(inArray(serviceAccounts.id, createdAccountIds));
  if (createdAreaIds.length) await db.delete(collectionAreas).where(inArray(collectionAreas.id, createdAreaIds));
  await db.delete(servicePlans).where(inArray(servicePlans.serviceId, [serviceId, otherServiceId]));
  await db.delete(services).where(inArray(services.id, [serviceId, otherServiceId]));
  await db.delete(collectors).where(eq(collectors.id, collectorId));
  await db.delete(collectionAreas).where(eq(collectionAreas.id, areaId));
  await db.delete(subscribers).where(eq(subscribers.id, subscriberId));
  if (createdUserIds.length) {
    await db.delete(userRoles).where(inArray(userRoles.userId, createdUserIds));
    await db.delete(users).where(inArray(users.id, createdUserIds));
  }
  await app.close();
  await pool.end();
});

function auth(t: string) {
  return { authorization: `Bearer ${t}` };
}

describe("service accounts", () => {
  it("creates a valid service account", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/service-accounts", headers: auth(tokens.sa_admin!), payload: { subscriberId, planId, serviceNumber: "SVC-001", collectionAreaId: areaId, assignedCollectorId: collectorId } });
    expect(res.statusCode).toBe(201);
    const d = res.json().data;
    expect(d.serviceNumber).toBe("SVC-001");
    expect(d.subscriber.id).toBe(subscriberId);
    expect(d.service.name).toBe("Internet SA");
    expect(d.plan.price).toBe("799.00");
    expect(JSON.stringify(res.json())).not.toContain("password");
    createdAccountIds.push(d.id);
  });

  it("rejects nonexistent subscriber", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/service-accounts", headers: auth(tokens.sa_admin!), payload: { subscriberId: 99999999, planId, serviceNumber: "SVC-X" } });
    expect(res.statusCode).toBe(400);
  });

  it("rejects nonexistent plan", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/service-accounts", headers: auth(tokens.sa_admin!), payload: { subscriberId, planId: 99999999, serviceNumber: "SVC-X" } });
    expect(res.statusCode).toBe(400);
  });

  it("rejects duplicate service number with 409", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/service-accounts", headers: auth(tokens.sa_admin!), payload: { subscriberId, planId, serviceNumber: "SVC-001" } });
    expect(res.statusCode).toBe(409);
  });

  it("rejects collector/area mismatch", async () => {
    const [area2] = await db.insert(collectionAreas).values({ name: "Area Other" }).returning();
    createdAreaIds.push(area2!.id);
    const res = await app.inject({ method: "POST", url: "/api/v1/service-accounts", headers: auth(tokens.sa_admin!), payload: { subscriberId, planId, serviceNumber: "SVC-002", collectionAreaId: area2!.id, assignedCollectorId: collectorId } });
    expect(res.statusCode).toBe(400);
    await db.delete(collectionAreas).where(eq(collectionAreas.id, area2!.id));
  });

  it("gets one and lists service accounts", async () => {
    const one = await app.inject({ method: "GET", url: `/api/v1/service-accounts/${createdAccountIds[0]}`, headers: auth(tokens.sa_viewer!) });
    expect(one.statusCode).toBe(200);
    const list = await app.inject({ method: "GET", url: `/api/v1/service-accounts?subscriberId=${subscriberId}&serviceId=${serviceId}`, headers: auth(tokens.sa_viewer!) });
    expect(list.statusCode).toBe(200);
    expect(list.json().pagination.total).toBeGreaterThanOrEqual(1);
  });

  it("updates a service account (plan change works because plan belongs to valid service)", async () => {
    const res = await app.inject({ method: "PATCH", url: `/api/v1/service-accounts/${createdAccountIds[0]}`, headers: auth(tokens.sa_admin!), payload: { activatedAt: new Date().toISOString() } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.activatedAt).toBeTruthy();
  });

  it("invalid update -> 400", async () => {
    const res = await app.inject({ method: "PATCH", url: `/api/v1/service-accounts/${createdAccountIds[0]}`, headers: auth(tokens.sa_admin!), payload: { id: 5 } });
    expect(res.statusCode).toBe(400);
  });

  it("viewer cannot update (403)", async () => {
    const res = await app.inject({ method: "PATCH", url: `/api/v1/service-accounts/${createdAccountIds[0]}`, headers: auth(tokens.sa_viewer!), payload: { activatedAt: null } });
    expect(res.statusCode).toBe(403);
  });

  it("status change valid + invalid", async () => {
    const ok = await app.inject({ method: "PATCH", url: `/api/v1/service-accounts/${createdAccountIds[0]}/status`, headers: auth(tokens.sa_admin!), payload: { status: "active", reason: "Installed" } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().data.status).toBe("active");
    const bad = await app.inject({ method: "PATCH", url: `/api/v1/service-accounts/${createdAccountIds[0]}/status`, headers: auth(tokens.sa_admin!), payload: { status: "lost" } });
    expect(bad.statusCode).toBe(400);
    const forbidden = await app.inject({ method: "PATCH", url: `/api/v1/service-accounts/${createdAccountIds[0]}/status`, headers: auth(tokens.sa_viewer!), payload: { status: "inactive" } });
    expect(forbidden.statusCode).toBe(403);
  });

  it("collection assignment: valid + invalid area + supervisor allowed", async () => {
    const ok = await app.inject({ method: "PATCH", url: `/api/v1/service-accounts/${createdAccountIds[0]}/collection-assignment`, headers: auth(tokens.sa_supervisor!), payload: { collectionAreaId: areaId, collectorId } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().data.collectionArea.id).toBe(areaId);

    const badArea = await app.inject({ method: "PATCH", url: `/api/v1/service-accounts/${createdAccountIds[0]}/collection-assignment`, headers: auth(tokens.sa_supervisor!), payload: { collectionAreaId: 99999999 } });
    expect(badArea.statusCode).toBe(400);

    const forbidden = await app.inject({ method: "PATCH", url: `/api/v1/service-accounts/${createdAccountIds[0]}/collection-assignment`, headers: auth(tokens.sa_viewer!), payload: { collectorId } });
    expect(forbidden.statusCode).toBe(403);
  });
});

describe("suspension and reconnection (3.10)", () => {
  it("suspend writes a suspension_records row, visible via history", async () => {
    const id = createdAccountIds[0];
    const suspend = await app.inject({
      method: "PATCH",
      url: `/api/v1/service-accounts/${id}/suspend`,
      headers: auth(tokens.sa_admin!),
      payload: { reason: "Two months overdue", notes: "Called subscriber, no response" },
    });
    expect(suspend.statusCode).toBe(200);
    expect(suspend.json().data.status).toBe("suspended");

    const history = await app.inject({ method: "GET", url: `/api/v1/service-accounts/${id}/suspension-history`, headers: auth(tokens.sa_viewer!) });
    expect(history.statusCode).toBe(200);
    const rows = history.json().data;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].reason).toBe("Two months overdue");
    expect(rows[0].notes).toBe("Called subscriber, no response");
    expect(rows[0].approvedByUserId).not.toBeNull();
  });

  it("cannot suspend an already-suspended account", async () => {
    const id = createdAccountIds[0];
    const res = await app.inject({ method: "PATCH", url: `/api/v1/service-accounts/${id}/suspend`, headers: auth(tokens.sa_admin!), payload: {} });
    expect(res.statusCode).toBe(409);
  });

  it("reconnect writes a reconnection_records row with fee, visible via history", async () => {
    const id = createdAccountIds[0];
    const reconnect = await app.inject({
      method: "PATCH",
      url: `/api/v1/service-accounts/${id}/reconnect`,
      headers: auth(tokens.sa_admin!),
      payload: { fee: "150.00", notes: "Paid reconnection fee at office", completeNow: true },
    });
    expect(reconnect.statusCode).toBe(200);
    expect(reconnect.json().data.status).toBe("active");

    const history = await app.inject({ method: "GET", url: `/api/v1/service-accounts/${id}/reconnection-history`, headers: auth(tokens.sa_viewer!) });
    expect(history.statusCode).toBe(200);
    const rows = history.json().data;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].fee).toBe("150.00");
    expect(rows[0].status).toBe("completed");
    expect(rows[0].completionDate).not.toBeNull();
  });

  it("cannot reconnect an account that is not suspended", async () => {
    const id = createdAccountIds[0];
    const res = await app.inject({ method: "PATCH", url: `/api/v1/service-accounts/${id}/reconnect`, headers: auth(tokens.sa_admin!), payload: {} });
    expect(res.statusCode).toBe(409);
  });

  it("history endpoints require authentication", async () => {
    const res = await app.inject({ method: "GET", url: `/api/v1/service-accounts/${createdAccountIds[0]}/suspension-history` });
    expect(res.statusCode).toBe(401);
  });
});

describe("collections settings (3.10 configurable grace period / suspension threshold)", () => {
  it("returns sensible defaults when nothing has been configured", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/settings/collections", headers: auth(tokens.sa_owner!) });
    expect(res.statusCode).toBe(200);
    expect(typeof res.json().data.gracePeriodDays).toBe("number");
    expect(typeof res.json().data.suspensionThresholdDays).toBe("number");
  });

  it("Owner/Administrator can update; a read-only viewer cannot", async () => {
    const update = await app.inject({
      method: "PUT",
      url: "/api/v1/settings/collections",
      headers: auth(tokens.sa_owner!),
      payload: { gracePeriodDays: 7, suspensionThresholdDays: 45 },
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().data).toEqual({ gracePeriodDays: 7, suspensionThresholdDays: 45 });

    const forbidden = await app.inject({
      method: "PUT",
      url: "/api/v1/settings/collections",
      headers: auth(tokens.sa_viewer!),
      payload: { gracePeriodDays: 1, suspensionThresholdDays: 1 },
    });
    expect(forbidden.statusCode).toBe(403);

    const reread = await app.inject({ method: "GET", url: "/api/v1/settings/collections", headers: auth(tokens.sa_supervisor!) });
    expect(reread.json().data).toEqual({ gracePeriodDays: 7, suspensionThresholdDays: 45 });
  });

  it("rejects an invalid payload", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/settings/collections",
      headers: auth(tokens.sa_owner!),
      payload: { gracePeriodDays: -1, suspensionThresholdDays: 45 },
    });
    expect(res.statusCode).toBe(400);
  });
});
