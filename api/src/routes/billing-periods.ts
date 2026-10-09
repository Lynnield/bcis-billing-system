import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { billingPeriods, invoices } from "../db/schema";
import { authenticate, requireRoles } from "../lib/auth";
import { ROLE_NAMES } from "../lib/roles";

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

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

const createSchema = z.object({
  label: z.string().trim().min(1).max(100),
  periodStart: dateString,
  periodEnd: dateString,
  dueDate: dateString,
}).strict();

const updateSchema = z.object({
  label: z.string().trim().min(1).max(100).optional(),
  periodStart: dateString.optional(),
  periodEnd: dateString.optional(),
  dueDate: dateString.optional(),
}).strict();

function validRange(start: string, end: string, due: string): string | null {
  if (start >= end) return "periodStart must be before periodEnd";
  if (due < start) return "dueDate must not be before periodStart";
  return null;
}

function isConflict(err: unknown): boolean {
  let current: unknown = err;
  while (typeof current === "object" && current !== null) {
    if ("code" in current && (current as { code?: string }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export default async function billingPeriodRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/billing-periods", { preHandler: [authenticate, requireRoles(...READ_ROLES)] }, async (request, reply) => {
    const query = z.object({
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
    }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ message: "Invalid query parameters" });
    const { page, pageSize } = query.data;

    const [totalRow] = await db.select({ count: sql<number>`count(*)::int` }).from(billingPeriods);
    const total = totalRow?.count ?? 0;

    const data = await db
      .select()
      .from(billingPeriods)
      .orderBy(desc(billingPeriods.periodStart))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return reply.send({
      data,
      pagination: { page, pageSize, total, totalPages: total === 0 ? 0 : Math.ceil(total / pageSize) },
    });
  });

  app.get("/api/v1/billing-periods/:id", { preHandler: [authenticate, requireRoles(...READ_ROLES)] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid billing period ID" });
    const [row] = await db.select().from(billingPeriods).where(eq(billingPeriods.id, params.data.id)).limit(1);
    if (!row) return reply.code(404).send({ message: "Billing period not found" });
    return reply.send({ data: row });
  });

  app.post("/api/v1/billing-periods", { preHandler: [authenticate, requireRoles(...WRITE_ROLES)] }, async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "Invalid billing period data", issues: parsed.error.issues });

    const rangeError = validRange(parsed.data.periodStart, parsed.data.periodEnd, parsed.data.dueDate);
    if (rangeError) return reply.code(400).send({ message: rangeError });

    try {
      const [row] = await db
        .insert(billingPeriods)
        .values({
          label: parsed.data.label,
          periodStart: new Date(parsed.data.periodStart),
          periodEnd: new Date(parsed.data.periodEnd),
          dueDate: new Date(parsed.data.dueDate),
        })
        .returning();
      return reply.code(201).send({ data: row });
    } catch (err) {
      if (isConflict(err)) return reply.code(409).send({ message: "A billing period with that label or date range already exists" });
      throw err;
    }
  });

  app.patch("/api/v1/billing-periods/:id", { preHandler: [authenticate, requireRoles(...WRITE_ROLES)] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid billing period ID" });
    const parsed = updateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "Invalid update data", issues: parsed.error.issues });
    if (Object.keys(parsed.data).length === 0) return reply.code(400).send({ message: "No fields to update" });

    const [current] = await db.select().from(billingPeriods).where(eq(billingPeriods.id, params.data.id)).limit(1);
    if (!current) return reply.code(404).send({ message: "Billing period not found" });

    const touchesDates = parsed.data.periodStart !== undefined || parsed.data.periodEnd !== undefined || parsed.data.dueDate !== undefined;
    if (touchesDates) {
      const [linked] = await db.select({ id: invoices.id }).from(invoices).where(eq(invoices.billingPeriodId, current.id)).limit(1);
      if (linked) {
        return reply.code(409).send({ message: "Billing period already has invoices; period dates cannot be changed" });
      }
      const start = parsed.data.periodStart ?? current.periodStart.toISOString().slice(0, 10);
      const end = parsed.data.periodEnd ?? current.periodEnd.toISOString().slice(0, 10);
      const due = parsed.data.dueDate ?? current.dueDate.toISOString().slice(0, 10);
      const rangeError = validRange(start, end, due);
      if (rangeError) return reply.code(400).send({ message: rangeError });
    }

    try {
      const [row] = await db
        .update(billingPeriods)
        .set({
          ...(parsed.data.label !== undefined ? { label: parsed.data.label } : {}),
          ...(parsed.data.periodStart !== undefined ? { periodStart: new Date(parsed.data.periodStart) } : {}),
          ...(parsed.data.periodEnd !== undefined ? { periodEnd: new Date(parsed.data.periodEnd) } : {}),
          ...(parsed.data.dueDate !== undefined ? { dueDate: new Date(parsed.data.dueDate) } : {}),
        })
        .where(eq(billingPeriods.id, params.data.id))
        .returning();
      return reply.send({ data: row });
    } catch (err) {
      if (isConflict(err)) return reply.code(409).send({ message: "A billing period with that label or date range already exists" });
      throw err;
    }
  });
}
