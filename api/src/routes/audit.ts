import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, gte, ilike, lt, sql } from "drizzle-orm";
import { db } from "../db";
import { auditLogs, users } from "../db/schema";
import { authenticate } from "../lib/auth";
import { requirePermission } from "../lib/permissions";


const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  actorUserId: z.coerce.number().int().positive().optional(),
  // Prefix match, e.g. "payment." or "invoice.void".
  action: z.string().trim().max(100).optional(),
  entityType: z.string().trim().max(100).optional(),
  entityId: z.coerce.number().int().positive().optional(),
  dateFrom: dateString.optional(),
  dateTo: dateString.optional(),
});

export type AuditQuery = z.infer<typeof auditQuerySchema>;

export function auditWhere(q: Omit<AuditQuery, "page" | "pageSize">) {
  const conditions = [];
  if (q.actorUserId) conditions.push(eq(auditLogs.actorUserId, q.actorUserId));
  if (q.action) conditions.push(ilike(auditLogs.action, `${q.action.replace(/[\\%_]/g, (c) => `\\${c}`)}%`));
  if (q.entityType) conditions.push(eq(auditLogs.entityType, q.entityType));
  if (q.entityId) conditions.push(eq(auditLogs.entityId, q.entityId));
  if (q.dateFrom) conditions.push(gte(auditLogs.createdAt, new Date(`${q.dateFrom}T00:00:00Z`)));
  if (q.dateTo) conditions.push(lt(auditLogs.createdAt, new Date(new Date(`${q.dateTo}T00:00:00Z`).getTime() + 86_400_000)));
  return conditions.length ? and(...conditions) : undefined;
}

export const auditColumns = {
  id: auditLogs.id,
  createdAt: auditLogs.createdAt,
  actorUserId: auditLogs.actorUserId,
  actorUsername: users.username,
  actorName: users.fullName,
  action: auditLogs.action,
  entityType: auditLogs.entityType,
  entityId: auditLogs.entityId,
  metadata: auditLogs.metadata,
};

export default async function auditRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/audit-logs", { preHandler: [authenticate, requirePermission("audit.view")] }, async (request, reply) => {
    const parsed = auditQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ message: "Invalid query parameters" });
    const { page, pageSize, ...filters } = parsed.data;
    const where = auditWhere(filters);

    const [totalRow] = await db.select({ count: sql<number>`count(*)::int` }).from(auditLogs).where(where);
    const total = totalRow?.count ?? 0;
    const data = await db
      .select(auditColumns)
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorUserId))
      .where(where)
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return reply.send({ data, pagination: { page, pageSize, total, totalPages: total === 0 ? 0 : Math.ceil(total / pageSize) } });
  });

  // Distinct action names, for the filter dropdown.
  app.get("/api/v1/audit-logs/actions", { preHandler: [authenticate, requirePermission("audit.view")] }, async (_request, reply) => {
    const rows = await db.selectDistinct({ action: auditLogs.action }).from(auditLogs).orderBy(auditLogs.action);
    return reply.send({ data: rows.map((r) => r.action) });
  });
}
