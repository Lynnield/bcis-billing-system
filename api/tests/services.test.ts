import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../src/app";
import { db, pool } from "../src/db";
import { collectionAreas, collectors, roles, serviceAccounts, servicePlans, services, userRoles, users } from "../src/db/schema";
import { hashPassword } from "../src/lib/password";
import { ROLE_NAMES } from "../src/lib/roles";
import { eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
const createdUserIds: number[] = [];
const createdServiceIds: number[] = [];
const createdPlanIds: number[] = [];
const createdAreaIds: number[] = [];
const createdCollectorIds: number[] = [];
const createdAccountIds: number[] = [];
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
  await mkUser("cat_owner", ROLE_NAMES.OWNER);
  await mkUser("cat_viewer", ROLE_NAMES.READ_ONLY_VIEWER);
  await mkUser("cat_supervisor", ROLE_NAMES.COLLECTION_SUPERVISOR);
  await mkUser("cat_cashier", ROLE_NAMES.CASHIER);
});

afterAll(async () => {
  if (createdAccountIds.length) await db.delete(serviceAccounts).where(inArray(serviceAccounts.id, createdAccountIds));
  if (createdPlanIds.length) await db.delete(servicePlans).where(inArray(servicePlans.id, createdPlanIds));
  if (createdServiceIds.length) await db.delete(services).where(inArray(services.id, createdServiceIds));
  if (createdCollectorIds.length) await db.delete(collectors).where(inArray(collectors.id, createdCollectorIds));
  if (createdAreaIds.length) await db.delete(collectionAreas).where(inArray(collectionAreas.id, createdAreaIds));
  if (createdUserIds.length) {
    await db.delete(userRoles).where(inArray(userRoles.userId, createdUserIds));
    await db.delete(users).where(inArray(users.id, createdUserIds));
  }
  await app.close();
  await pool.end();
});

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

describe("services catalog", () => {
  it("rejects unauthenticated requests", async () => {
    expect((await app.inject({ method: "GET", url: "/api/v1/services" })).statusCode).toBe(401);
  });

  it("rejects invalid JWT", async () => {
    expect((await app.inject({ method: "GET", url: "/api/v1/services", headers: { authorization: "Bearer x" } })).statusCode).toBe(401);
  });

  it("owner creates a service", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/services", headers: auth(tokens.cat_owner!), payload: { type: "internet", name: "Internet Phase7", description: "Test internet" } });
    expect(res.statusCode).toBe(201);
    createdServiceIds.push(res.json().data.id);
  });

  it("viewer cannot create a service (403)", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/services", headers: auth(tokens.cat_viewer!), payload: { type: "cable", name: "Cable X" } });
    expect(res.statusCode).toBe(403);
  });

  it("duplicate service name -> 409", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/services", headers: auth(tokens.cat_owner!), payload: { type: "internet", name: "Internet Phase7" } });
    expect(res.statusCode).toBe(409);
  });

  it("invalid service data -> 400", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/services", headers: auth(tokens.cat_owner!), payload: { type: "dialup", name: "" } });
    expect(res.statusCode).toBe(400);
  });

  it("lists and gets services", async () => {
    const list = await app.inject({ method: "GET", url: "/api/v1/services", headers: auth(tokens.cat_cashier!) });
    expect(list.statusCode).toBe(200);
    const one = await app.inject({ method: "GET", url: `/api/v1/services/${createdServiceIds[0]}`, headers: auth(tokens.cat_cashier!) });
    expect(one.statusCode).toBe(200);
    expect(one.json().data.name).toBe("Internet Phase7");
  });

  it("updates a service", async () => {
    const res = await app.inject({ method: "PATCH", url: `/api/v1/services/${createdServiceIds[0]}`, headers: auth(tokens.cat_owner!), payload: { description: "Updated desc" } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.description).toBe("Updated desc");
  });

  it("plans: create/get/update + validation + RBAC", async () => {
    const created = await app.inject({ method: "POST", url: `/api/v1/services/${createdServiceIds[0]}/plans`, headers: auth(tokens.cat_owner!), payload: { name: "Plan A", price: "999.00" } });
    expect(created.statusCode).toBe(201);
    const planId = created.json().data.id;
    createdPlanIds.push(planId);

    const badService = await app.inject({ method: "POST", url: "/api/v1/services/99999999/plans", headers: auth(tokens.cat_owner!), payload: { name: "Ghost", price: "10.00" } });
    expect(badService.statusCode).toBe(404);

    const invalidPrice = await app.inject({ method: "POST", url: `/api/v1/services/${createdServiceIds[0]}/plans`, headers: auth(tokens.cat_owner!), payload: { name: "Bad", price: "9.999" } });
    expect(invalidPrice.statusCode).toBe(400);

    const one = await app.inject({ method: "GET", url: `/api/v1/service-plans/${planId}`, headers: auth(tokens.cat_cashier!) });
    expect(one.statusCode).toBe(200);

    const updated = await app.inject({ method: "PATCH", url: `/api/v1/service-plans/${planId}`, headers: auth(tokens.cat_owner!), payload: { price: "1099.50" } });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().data.price).toBe("1099.50");

    const forbidden = await app.inject({ method: "PATCH", url: `/api/v1/service-plans/${planId}`, headers: auth(tokens.cat_viewer!), payload: { price: "1.00" } });
    expect(forbidden.statusCode).toBe(403);
  });

  it("collection areas & collectors managed by supervisor, not viewer", async () => {
    const area = await app.inject({ method: "POST", url: "/api/v1/collection-areas", headers: auth(tokens.cat_supervisor!), payload: { name: "Area 7" } });
    expect(area.statusCode).toBe(201);
    createdAreaIds.push(area.json().data.id);

    const collector = await app.inject({ method: "POST", url: "/api/v1/collectors", headers: auth(tokens.cat_supervisor!), payload: { fullName: "Collector Seven", collectionAreaId: createdAreaIds[0] } });
    expect(collector.statusCode).toBe(201);
    createdCollectorIds.push(collector.json().data.id);

    const forbiddenArea = await app.inject({ method: "POST", url: "/api/v1/collection-areas", headers: auth(tokens.cat_viewer!), payload: { name: "Nope" } });
    expect(forbiddenArea.statusCode).toBe(403);

    const forbiddenCollector = await app.inject({ method: "PATCH", url: `/api/v1/collectors/${createdCollectorIds[0]}`, headers: auth(tokens.cat_viewer!), payload: { fullName: "X" } });
    expect(forbiddenCollector.statusCode).toBe(403);

    expect(JSON.stringify(area.json())).not.toContain("password");
  });
});
