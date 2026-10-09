import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { services, servicePlans } from "../db/schema";
import { authenticate, requireRoles } from "../lib/auth";
import { ROLE_NAMES } from "../lib/roles";

const STATUS_VALUES = ["active", "inactive"] as const;
const SERVICE_TYPES = ["internet", "cable", "combo"] as const;

const READ_ROLES = [
  ROLE_NAMES.OWNER,
  ROLE_NAMES.ADMINISTRATOR,
  ROLE_NAMES.CASHIER,
  ROLE_NAMES.COLLECTION_SUPERVISOR,
  ROLE_NAMES.ACCOUNTING_AUDITOR,
  ROLE_NAMES.TECHNICIAN,
  ROLE_NAMES.READ_ONLY_VIEWER,
];
const WRITE_ROLES = [ROLE_NAMES.OWNER, ROLE_NAMES.ADMINISTRATOR];

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });
const serviceIdParamSchema = z.object({ serviceId: z.coerce.number().int().positive() });

const createServiceSchema = z.object({
  type: z.enum(SERVICE_TYPES),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(2000).optional(),
  status: z.enum(STATUS_VALUES).optional(),
}).strict();

const updateServiceSchema = z.object({
  type: z.enum(SERVICE_TYPES).optional(),
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  status: z.enum(STATUS_VALUES).optional(),
}).strict();

const priceSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, "Price must be a non-negative amount with up to 2 decimal places");

const createPlanSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(2000).optional(),
  price: priceSchema,
  status: z.enum(STATUS_VALUES).optional(),
}).strict();

const updatePlanSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  price: priceSchema.optional(),
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

export default async function serviceRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/services", { preHandler: [authenticate, requireRoles(...READ_ROLES)] }, async (request, reply) => {
    const query = z.object({ status: z.enum(STATUS_VALUES).optional() }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ message: "Invalid query parameters" });
    const rows = query.data.status
      ? await db.select().from(services).where(eq(services.status, query.data.status))
      : await db.select().from(services);
    return reply.send({ data: rows });
  });

  app.get("/api/v1/services/:id", { preHandler: [authenticate, requireRoles(...READ_ROLES)] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid service ID" });
    const [row] = await db.select().from(services).where(eq(services.id, params.data.id)).limit(1);
    if (!row) return reply.code(404).send({ message: "Service not found" });
    return reply.send({ data: row });
  });

  app.post("/api/v1/services", { preHandler: [authenticate, requireRoles(...WRITE_ROLES)] }, async (request, reply) => {
    const parsed = createServiceSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "Invalid service data", issues: parsed.error.issues });
    try {
      const [row] = await db.insert(services).values(parsed.data).returning();
      return reply.code(201).send({ data: row });
    } catch (err) {
      if (isConflict(err)) return reply.code(409).send({ message: "A service with that name already exists" });
      throw err;
    }
  });

  app.patch("/api/v1/services/:id", { preHandler: [authenticate, requireRoles(...WRITE_ROLES)] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid service ID" });
    const parsed = updateServiceSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "Invalid update data", issues: parsed.error.issues });
    if (Object.keys(parsed.data).length === 0) return reply.code(400).send({ message: "No fields to update" });
    try {
      const [row] = await db.update(services).set(parsed.data).where(eq(services.id, params.data.id)).returning();
      if (!row) return reply.code(404).send({ message: "Service not found" });
      return reply.send({ data: row });
    } catch (err) {
      if (isConflict(err)) return reply.code(409).send({ message: "A service with that name already exists" });
      throw err;
    }
  });

  app.get("/api/v1/services/:serviceId/plans", { preHandler: [authenticate, requireRoles(...READ_ROLES)] }, async (request, reply) => {
    const params = serviceIdParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid service ID" });
    const query = z.object({ status: z.enum(STATUS_VALUES).optional() }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ message: "Invalid query parameters" });
    const [service] = await db.select({ id: services.id }).from(services).where(eq(services.id, params.data.serviceId)).limit(1);
    if (!service) return reply.code(404).send({ message: "Service not found" });
    const rows = query.data.status
      ? await db
          .select()
          .from(servicePlans)
          .where(and(eq(servicePlans.serviceId, params.data.serviceId), eq(servicePlans.status, query.data.status)))
      : await db.select().from(servicePlans).where(eq(servicePlans.serviceId, params.data.serviceId));
    return reply.send({ data: rows });
  });

  app.get("/api/v1/service-plans/:id", { preHandler: [authenticate, requireRoles(...READ_ROLES)] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid plan ID" });
    const [row] = await db.select().from(servicePlans).where(eq(servicePlans.id, params.data.id)).limit(1);
    if (!row) return reply.code(404).send({ message: "Service plan not found" });
    return reply.send({ data: row });
  });

  app.post("/api/v1/services/:serviceId/plans", { preHandler: [authenticate, requireRoles(...WRITE_ROLES)] }, async (request, reply) => {
    const params = serviceIdParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid service ID" });
    const parsed = createPlanSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "Invalid plan data", issues: parsed.error.issues });
    const [service] = await db.select({ id: services.id }).from(services).where(eq(services.id, params.data.serviceId)).limit(1);
    if (!service) return reply.code(404).send({ message: "Service not found" });
    try {
      const [row] = await db.insert(servicePlans).values({ ...parsed.data, serviceId: service.id }).returning();
      return reply.code(201).send({ data: row });
    } catch (err) {
      if (isConflict(err)) return reply.code(409).send({ message: "A plan with that name already exists for this service" });
      throw err;
    }
  });

  app.patch("/api/v1/service-plans/:id", { preHandler: [authenticate, requireRoles(...WRITE_ROLES)] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid plan ID" });
    const parsed = updatePlanSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "Invalid update data", issues: parsed.error.issues });
    if (Object.keys(parsed.data).length === 0) return reply.code(400).send({ message: "No fields to update" });
    try {
      const [row] = await db.update(servicePlans).set(parsed.data).where(eq(servicePlans.id, params.data.id)).returning();
      if (!row) return reply.code(404).send({ message: "Service plan not found" });
      return reply.send({ data: row });
    } catch (err) {
      if (isConflict(err)) return reply.code(409).send({ message: "A plan with that name already exists for this service" });
      throw err;
    }
  });
}
