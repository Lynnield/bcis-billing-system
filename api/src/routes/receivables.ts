import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AGING_BUCKETS, bucketFor, daysOverdue, getInvoiceBalances, todayDateString } from "../lib/receivables";
import { formatCents } from "../lib/money";
import { authenticate, requireRoles } from "../lib/auth";
import { ROLE_NAMES } from "../lib/roles";
import { db } from "../db";
import { serviceAccounts, subscribers } from "../db/schema";
import { eq } from "drizzle-orm";

const READ_ROLES = [
  ROLE_NAMES.OWNER,
  ROLE_NAMES.ADMINISTRATOR,
  ROLE_NAMES.CASHIER,
  ROLE_NAMES.COLLECTION_SUPERVISOR,
  ROLE_NAMES.ACCOUNTING_AUDITOR,
  ROLE_NAMES.TECHNICIAN,
  ROLE_NAMES.READ_ONLY_VIEWER,
];

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

function isOverdue(days: number): boolean {
  return days > 0;
}

function summarize(rows: Array<{ balanceCents: bigint; dueDate: Date | string }>) {
  let total = 0n;
  let overdue = 0n;
  let outstandingCount = 0;
  let overdueCount = 0;
  const bucketTotals: Record<string, bigint> = Object.fromEntries(AGING_BUCKETS.map((b) => [b, 0n]));
  for (const r of rows) {
    if (r.balanceCents <= 0n) continue;
    outstandingCount += 1;
    total += r.balanceCents;
    const days = daysOverdue(r.dueDate);
    const bucket = bucketFor(days);
    bucketTotals[bucket] = (bucketTotals[bucket] ?? 0n) + r.balanceCents;
    if (isOverdue(days)) {
      overdueCount += 1;
      overdue += r.balanceCents;
    }
  }
  return { total, overdue, outstandingCount, overdueCount, bucketTotals };
}

export default async function receivableRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/receivables/service-accounts/:id", { preHandler: [authenticate, requireRoles(...READ_ROLES)] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid service account ID" });

    const [account] = await db
      .select({
        id: serviceAccounts.id,
        serviceNumber: serviceAccounts.serviceNumber,
        status: serviceAccounts.status,
        subscriberId: serviceAccounts.subscriberId,
        accountNumber: subscribers.accountNumber,
        firstName: subscribers.firstName,
        lastName: subscribers.lastName,
      })
      .from(serviceAccounts)
      .innerJoin(subscribers, eq(subscribers.id, serviceAccounts.subscriberId))
      .where(eq(serviceAccounts.id, params.data.id))
      .limit(1);
    if (!account) return reply.code(404).send({ message: "Service account not found" });

    const rows = await getInvoiceBalances({ serviceAccountId: account.id });
    const outstanding = rows.filter((r) => r.balanceCents > 0n);
    const summary = summarize(rows);
    const oldestOverdue = outstanding
      .filter((r) => isOverdue(daysOverdue(r.dueDate)))
      .sort((a, b) => daysOverdue(b.dueDate) - daysOverdue(a.dueDate))[0];

    return reply.send({
      data: {
        serviceAccount: account,
        outstandingInvoiceCount: summary.outstandingCount,
        overdueInvoiceCount: summary.overdueCount,
        outstandingBalance: formatCents(summary.total),
        overdueBalance: formatCents(summary.overdue),
        aging: Object.fromEntries(AGING_BUCKETS.map((b) => [b, formatCents(summary.bucketTotals[b] ?? 0n)])),
        oldestOverdue: oldestOverdue
          ? {
              invoiceId: oldestOverdue.invoiceId,
              invoiceNumber: oldestOverdue.invoiceNumber,
              dueDate: oldestOverdue.dueDate,
              daysOverdue: daysOverdue(oldestOverdue.dueDate),
              balance: formatCents(oldestOverdue.balanceCents),
            }
          : null,
        invoices: outstanding.map((r) => ({
          invoiceId: r.invoiceId,
          invoiceNumber: r.invoiceNumber,
          status: r.status,
          totalAmount: r.totalAmount,
          allocated: r.allocated,
          balance: formatCents(r.balanceCents),
          dueDate: r.dueDate,
          daysOverdue: daysOverdue(r.dueDate),
          bucket: bucketFor(daysOverdue(r.dueDate)),
        })),
      },
    });
  });

  app.get("/api/v1/receivables/invoices", { preHandler: [authenticate, requireRoles(...READ_ROLES)] }, async (request, reply) => {
    const query = z.object({
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
      serviceAccountId: z.coerce.number().int().positive().optional(),
      subscriberId: z.coerce.number().int().positive().optional(),
      billingPeriodId: z.coerce.number().int().positive().optional(),
      overdueOnly: z.enum(["true", "false"]).optional(),
      bucket: z.enum(AGING_BUCKETS).optional(),
    }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ message: "Invalid query parameters" });
    const { page, pageSize, serviceAccountId, subscriberId, billingPeriodId, overdueOnly, bucket } = query.data;

    const rows = await getInvoiceBalances({ serviceAccountId, subscriberId, billingPeriodId });
    let outstanding = rows.filter((r) => r.balanceCents > 0n);
    if (overdueOnly === "true") outstanding = outstanding.filter((r) => isOverdue(daysOverdue(r.dueDate)));
    if (bucket) outstanding = outstanding.filter((r) => bucketFor(daysOverdue(r.dueDate)) === bucket);

    const total = outstanding.length;
    const pageRows = outstanding.slice((page - 1) * pageSize, page * pageSize);

    return reply.send({
      data: pageRows.map((r) => ({
        invoiceId: r.invoiceId,
        invoiceNumber: r.invoiceNumber,
        status: r.status,
        totalAmount: r.totalAmount,
        allocated: r.allocated,
        balance: formatCents(r.balanceCents),
        dueDate: r.dueDate,
        daysOverdue: daysOverdue(r.dueDate),
        bucket: bucketFor(daysOverdue(r.dueDate)),
        serviceAccountId: r.serviceAccountId,
        subscriberId: r.subscriberId,
      })),
      pagination: { page, pageSize, total, totalPages: total === 0 ? 0 : Math.ceil(total / pageSize) },
    });
  });

  app.get("/api/v1/receivables/aging", { preHandler: [authenticate, requireRoles(...READ_ROLES)] }, async (request, reply) => {
    const query = z.object({
      serviceAccountId: z.coerce.number().int().positive().optional(),
      subscriberId: z.coerce.number().int().positive().optional(),
    }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ message: "Invalid query parameters" });

    const rows = await getInvoiceBalances(query.data);
    const bucketTotals: Record<AgingBucketKey, bigint> = { current: 0n, "1-30": 0n, "31-60": 0n, "61-90": 0n, "90+": 0n };
    const bucketCounts: Record<AgingBucketKey, number> = { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };

    for (const r of rows) {
      if (r.balanceCents <= 0n) continue;
      const bucket = bucketFor(daysOverdue(r.dueDate));
      bucketTotals[bucket] += r.balanceCents;
      bucketCounts[bucket] += 1;
    }

    const summary = {
      current: { count: bucketCounts.current, amount: formatCents(bucketTotals.current) },
      "1-30": { count: bucketCounts["1-30"], amount: formatCents(bucketTotals["1-30"]) },
      "31-60": { count: bucketCounts["31-60"], amount: formatCents(bucketTotals["31-60"]) },
      "61-90": { count: bucketCounts["61-90"], amount: formatCents(bucketTotals["61-90"]) },
      "90+": { count: bucketCounts["90+"], amount: formatCents(bucketTotals["90+"]) },
    };

    const total = AGING_BUCKETS.reduce((acc, b) => acc + bucketTotals[b], 0n);
    return reply.send({ data: { buckets: summary, total: { count: Object.values(bucketCounts).reduce((a, b) => a + b, 0), amount: formatCents(total) } } });
  });

  app.get("/api/v1/receivables/suspension-candidates", { preHandler: [authenticate, requireRoles(...READ_ROLES)] }, async (request, reply) => {
    // Explicit rule: an account is a candidate when it has at least one
    // outstanding invoice whose due date is before today (overdue).
    const rows = await getInvoiceBalances();
    const byAccount = new Map<number, { overdue: bigint; invoices: typeof rows }>();

    for (const r of rows) {
      if (r.balanceCents <= 0n || !isOverdue(daysOverdue(r.dueDate))) continue;
      const entry = byAccount.get(r.serviceAccountId) ?? { overdue: 0n, invoices: [] as typeof rows };
      entry.overdue += r.balanceCents;
      entry.invoices.push(r);
      byAccount.set(r.serviceAccountId, entry);
    }

    const candidates = [];
    for (const [accountId, entry] of byAccount) {
      const oldest = entry.invoices.sort((a, b) => daysOverdue(b.dueDate) - daysOverdue(a.dueDate))[0]!;
      candidates.push({
        serviceAccountId: accountId,
        subscriberId: oldest.subscriberId,
        overdueBalance: formatCents(entry.overdue),
        overdueInvoiceCount: entry.invoices.length,
        oldestOverdueDays: daysOverdue(oldest.dueDate),
        oldestOverdueInvoice: oldest.invoiceNumber,
      });
    }

    return reply.send({ data: candidates });
  });
}

type AgingBucketKey = (typeof AGING_BUCKETS)[number];
