import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { collectors, collectionAreas } from "../db/schema";
import { authenticate, requireRoles } from "../lib/auth";
import { ROLE_NAMES } from "../lib/roles";

const STATUS_VALUES = ["active", "inactive"] as const;

const READ_ROLES = [
  ROLE_NAMES.OWNER,
  ROLE_NAMES.ADMINISTRATOR,
  ROLE_NAMES.CASHIER,
  ROLE_NAMES.COLLECTION_SUPERVISOR,
  ROLE_NAMES.ACCOUNTING_AUDITOR,
  ROLE_NAMES.TECHNICIAN,
  ROLE_NAMES.READ_ONLY_VIEWER,
];
const MANAGE_ROLES = [ROLE_NAMES.OWNER, ROLE_NAMES.ADMINISTRATOR, ROLE_NAMES.COLLECTION_SUPERVISOR];

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

const createAreaSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(2000).optional(),
  status: z.enum(STATUS_VALUES).optional(),
}).strict();

const updateAreaSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  status: z.enum(STATUS_VALUES).optional(),
}).strict();

const createCollectorSchema = z.object({
  fullName: z.string().trim().min(1).max(255),
  contactNumber: z.string().trim().max(50).optional(),
  collectionAreaId: z.number().int().positive().optional(),
  status: z.enum(STATUS_VALUES).optional(),
}).strict();

const updateCollectorSchema = z.object({
  fullName: z.string().trim().min(1).max(255).optional(),
  contactNumber: z.string().trim().max(50).nullable().optional(),
  collectionAreaId: z.number().int().positive().nullable().optional(),
  status: z.enum(STATUS_VALUES).optional(),
}).strict();

function isConflict(err: unknown): boolean {
  let current: unknown = err;
  while (typeof current === "object" && current !== null) {
    if ("code" in current && (current as { code?: string }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export default async function collectionRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/collection-areas", { preHandler: [authenticate, requireRoles(...READ_ROLES)] }, async (request, reply) => {
    const query = z.object({ status: z.enum(STATUS_VALUES).optional() }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ message: "Invalid query parameters" });
    const rows = query.data.status
      ? await db.select().from(collectionAreas).where(eq(collectionAreas.status, query.data.status))
      : await db.select().from(collectionAreas);
    return reply.send({ data: rows });
  });

  app.get("/api/v1/collection-areas/:id", { preHandler: [authenticate, requireRoles(...READ_ROLES)] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid collection area ID" });
    const [row] = await db.select().from(collectionAreas).where(eq(collectionAreas.id, params.data.id)).limit(1);
    if (!row) return reply.code(404).send({ message: "Collection area not found" });
    return reply.send({ data: row });
  });

  app.post("/api/v1/collection-areas", { preHandler: [authenticate, requireRoles(...MANAGE_ROLES)] }, async (request, reply) => {
    const parsed = createAreaSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "Invalid collection area data", issues: parsed.error.issues });
    try {
      const [row] = await db.insert(collectionAreas).values(parsed.data).returning();
      return reply.code(201).send({ data: row });
    } catch (err) {
      if (isConflict(err)) return reply.code(409).send({ message: "A collection area with that name already exists" });
      throw err;
    }
  });

  app.patch("/api/v1/collection-areas/:id", { preHandler: [authenticate, requireRoles(...MANAGE_ROLES)] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid collection area ID" });
    const parsed = updateAreaSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "Invalid update data", issues: parsed.error.issues });
    if (Object.keys(parsed.data).length === 0) return reply.code(400).send({ message: "No fields to update" });
    try {
      const [row] = await db.update(collectionAreas).set(parsed.data).where(eq(collectionAreas.id, params.data.id)).returning();
      if (!row) return reply.code(404).send({ message: "Collection area not found" });
      return reply.send({ data: row });
    } catch (err) {
      if (isConflict(err)) return reply.code(409).send({ message: "A collection area with that name already exists" });
      throw err;
    }
  });

  app.get("/api/v1/collectors", { preHandler: [authenticate, requireRoles(...READ_ROLES)] }, async (request, reply) => {
    const query = z.object({ status: z.enum(STATUS_VALUES).optional() }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ message: "Invalid query parameters" });
    const rows = query.data.status
      ? await db.select().from(collectors).where(eq(collectors.status, query.data.status))
      : await db.select().from(collectors);
    return reply.send({ data: rows });
  });

  app.get("/api/v1/collectors/:id", { preHandler: [authenticate, requireRoles(...READ_ROLES)] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid collector ID" });
    const [row] = await db.select().from(collectors).where(eq(collectors.id, params.data.id)).limit(1);
    if (!row) return reply.code(404).send({ message: "Collector not found" });
    return reply.send({ data: row });
  });

  app.post("/api/v1/collectors", { preHandler: [authenticate, requireRoles(...MANAGE_ROLES)] }, async (request, reply) => {
    const parsed = createCollectorSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "Invalid collector data", issues: parsed.error.issues });
    if (parsed.data.collectionAreaId !== undefined) {
      const [area] = await db.select({ id: collectionAreas.id }).from(collectionAreas).where(eq(collectionAreas.id, parsed.data.collectionAreaId)).limit(1);
      if (!area) return reply.code(400).send({ message: "Collection area does not exist" });
    }
    const [row] = await db.insert(collectors).values(parsed.data).returning();
    return reply.code(201).send({ data: row });
  });

  app.patch("/api/v1/collectors/:id", { preHandler: [authenticate, requireRoles(...MANAGE_ROLES)] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid collector ID" });
    const parsed = updateCollectorSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "Invalid update data", issues: parsed.error.issues });
    if (Object.keys(parsed.data).length === 0) return reply.code(400).send({ message: "No fields to update" });
    if (parsed.data.collectionAreaId) {
      const [area] = await db.select({ id: collectionAreas.id }).from(collectionAreas).where(eq(collectionAreas.id, parsed.data.collectionAreaId)).limit(1);
      if (!area) return reply.code(400).send({ message: "Collection area does not exist" });
    }
    const [row] = await db.update(collectors).set(parsed.data).where(eq(collectors.id, params.data.id)).returning();
    if (!row) return reply.code(404).send({ message: "Collector not found" });
    return reply.send({ data: row });
  });
}
