import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../db";
import {
  auditLogs,
  billingPeriods,
  collectionAreas,
  collectionBatchPayments,
  collectionBatches,
  collectors,
  invoices,
  paymentAllocations,
  paymentReversals,
  payments,
  serviceAccounts,
  servicePlans,
  services,
  subscribers,
} from "../db/schema";
import { authenticate, requireRoles } from "../lib/auth";
import { ROLE_NAMES } from "../lib/roles";
import { AGING_BUCKETS, bucketFor, daysOverdue, getInvoiceBalances, todayDateString } from "../lib/receivables";
import { formatCents, parseMoneyToCents } from "../lib/money";

const READ_ROLES = [
  ROLE_NAMES.OWNER,
  ROLE_NAMES.ADMINISTRATOR,
  ROLE_NAMES.CASHIER,
  ROLE_NAMES.COLLECTION_SUPERVISOR,
  ROLE_NAMES.ACCOUNTING_AUDITOR,
  ROLE_NAMES.TECHNICIAN,
  ROLE_NAMES.READ_ONLY_VIEWER,
];

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

function dateRangeQuery(where: string) {
  return z.object({
    dateFrom: dateString.optional(),
    dateTo: dateString.optional(),
    paymentMethod: z.enum(["cash", "gcash", "bank_transfer", "cheque", "other"]).optional(),
    collectorId: z.coerce.number().int().positive().optional(),
    collectionAreaId: z.coerce.number().int().positive().optional(),
    status: z.string().optional(),
  });
}

export default async function reportRoutes(app: FastifyInstance): Promise<void> {
  // ------------------------------------------------------------------
  // A. COLLECTION REPORT
  // ------------------------------------------------------------------
  app.get("/api/v1/reports/collections", { preHandler: [authenticate, requireRoles(...READ_ROLES)] }, async (request, reply) => {
    const parsed = dateRangeQuery("").safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ message: "Invalid query parameters" });
    const { dateFrom, dateTo, paymentMethod, collectorId, collectionAreaId } = parsed.data;
    if (dateFrom && dateTo && dateFrom > dateTo) {
      return reply.code(400).send({ message: "dateFrom must not be after dateTo" });
    }

    const conditions = [eq(payments.status, "posted")];
    if (dateFrom) conditions.push(gte(payments.paymentDate, new Date(dateFrom)));
    if (dateTo) conditions.push(lte(payments.paymentDate, new Date(dateTo)));
    if (paymentMethod) conditions.push(eq(payments.method, paymentMethod));
    if (collectorId) conditions.push(eq(collectionBatches.collectorId, collectorId));
    if (collectionAreaId) conditions.push(eq(collectors.collectionAreaId, collectionAreaId));
    const where = and(...conditions);

    const [totals] = await db
      .select({
        totalCollected: sql<string>`coalesce(sum(${payments.amount}), 0)::numeric(14,2)`,
        paymentCount: sql<number>`count(*)::int`,
      })
      .from(payments)
      .leftJoin(collectionBatchPayments, eq(collectionBatchPayments.paymentId, payments.id))
      .leftJoin(collectionBatches, eq(collectionBatches.id, collectionBatchPayments.batchId))
      .leftJoin(collectors, eq(collectors.id, collectionBatches.collectorId))
      .where(where);

    const byMethod = await db
      .select({
        method: payments.method,
        total: sql<string>`coalesce(sum(${payments.amount}), 0)::numeric(14,2)`,
        count: sql<number>`count(*)::int`,
      })
      .from(payments)
      .leftJoin(collectionBatchPayments, eq(collectionBatchPayments.paymentId, payments.id))
      .leftJoin(collectionBatches, eq(collectionBatches.id, collectionBatchPayments.batchId))
      .leftJoin(collectors, eq(collectors.id, collectionBatches.collectorId))
      .where(where)
      .groupBy(payments.method);

    const byCollector = await db
      .select({
        collectorId: collectors.id,
        collectorName: collectors.fullName,
        total: sql<string>`coalesce(sum(${payments.amount}), 0)::numeric(14,2)`,
        count: sql<number>`count(*)::int`,
      })
      .from(payments)
      .innerJoin(collectionBatchPayments, eq(collectionBatchPayments.paymentId, payments.id))
      .innerJoin(collectionBatches, eq(collectionBatches.id, collectionBatchPayments.batchId))
      .innerJoin(collectors, eq(collectors.id, collectionBatches.collectorId))
      .where(and(...conditions, eq(payments.status, "posted")))
      .groupBy(collectors.id, collectors.fullName);

    const rows = await db
      .select({
        id: payments.id,
        serviceAccountId: payments.serviceAccountId,
        amount: payments.amount,
        method: payments.method,
        paymentDate: payments.paymentDate,
        receiptNumber: payments.receiptNumber,
        referenceNumber: payments.referenceNumber,
        collectorId: collectors.id,
        collectorName: collectors.fullName,
      })
      .from(payments)
      .leftJoin(collectionBatchPayments, eq(collectionBatchPayments.paymentId, payments.id))
      .leftJoin(collectionBatches, eq(collectionBatches.id, collectionBatchPayments.batchId))
      .leftJoin(collectors, eq(collectors.id, collectionBatches.collectorId))
      .where(where)
      .orderBy(payments.paymentDate, payments.id)
      .limit(500);

    return reply.send({
      data: {
        range: { dateFrom: dateFrom ?? null, dateTo: dateTo ?? null, paymentMethod: paymentMethod ?? null },
        totalCollected: totals?.totalCollected ?? "0.00",
        paymentCount: totals?.paymentCount ?? 0,
        byPaymentMethod: byMethod,
        byCollector,
        payments: rows,
      },
      meta: { basis: "UTC date-only payment_date; status='posted' only", reversedPaymentsExcluded: true },
    });
  });

  // ------------------------------------------------------------------
  // B. ACCOUNTS RECEIVABLE REPORT
  // ------------------------------------------------------------------
  app.get("/api/v1/reports/receivables", { preHandler: [authenticate, requireRoles(...READ_ROLES)] }, async (request, reply) => {
    const query = request.query as { serviceAccountId?: string };
    const options: { serviceAccountId?: number } = {};
    if (query?.serviceAccountId) {
      const parsed = z.coerce.number().int().positive().safeParse(query.serviceAccountId);
      if (parsed.success) {
        options.serviceAccountId = parsed.data;
      }
    }
    const rows = await getInvoiceBalances(options);
    const outstanding = rows.filter((r) => r.balanceCents > 0n);
    let totalOutstanding = 0n;
    let overdueBalance = 0n;
    let overdueCount = 0;
    const accountIdsWithBalance = new Set<number>();
    const bucketTotals: Record<string, bigint> = Object.fromEntries(AGING_BUCKETS.map((b) => [b, 0n]));

    for (const r of outstanding) {
      totalOutstanding += r.balanceCents;
      accountIdsWithBalance.add(r.serviceAccountId);
      const days = daysOverdue(r.dueDate);
      if (days > 0) {
        overdueBalance += r.balanceCents;
        overdueCount += 1;
      }
      bucketTotals[bucketFor(days)] = (bucketTotals[bucketFor(days)] ?? 0n) + r.balanceCents;
    }

    return reply.send({
      data: {
        totalOutstandingBalance: formatCents(totalOutstanding),
        outstandingInvoiceCount: outstanding.length,
        overdueBalance: formatCents(overdueBalance),
        overdueInvoiceCount: overdueCount,
        serviceAccountCountWithOutstandingBalance: accountIdsWithBalance.size,
        agingBuckets: Object.fromEntries(AGING_BUCKETS.map((b) => [b, formatCents(bucketTotals[b] ?? 0n)])),
      },
      meta: { basis: "invoices.totalAmount - SUM(allocations on posted payments); today's date = " + todayDateString() },
    });
  });

  // ------------------------------------------------------------------
  // C. AR AGING REPORT
  // ------------------------------------------------------------------
  app.get("/api/v1/reports/aging", { preHandler: [authenticate, requireRoles(...READ_ROLES)] }, async (request, reply) => {
    const rows = await getInvoiceBalances();
    const buckets: Record<string, { count: number; amount: bigint }> = Object.fromEntries(
      AGING_BUCKETS.map((b) => [b, { count: 0, amount: 0n }]),
    );
    let totalCount = 0;
    let totalAmount = 0n;

    for (const r of rows) {
      if (r.balanceCents <= 0n) continue;
      const b = bucketFor(daysOverdue(r.dueDate));
      buckets[b]!.count += 1;
      buckets[b]!.amount += r.balanceCents;
      totalCount += 1;
      totalAmount += r.balanceCents;
    }

    return reply.send({
      data: {
        buckets: Object.fromEntries(
          AGING_BUCKETS.map((b) => [b, { count: buckets[b]!.count, amount: formatCents(buckets[b]!.amount) }]),
        ),
        totalInvoiceCount: totalCount,
        totalOutstandingAmount: formatCents(totalAmount),
      },
      meta: { basis: "Phase 11 boundary rules (days<=0 current; <=30 1-30; <=60 31-60; <=90 61-90; else 90+)" },
    });
  });

  // ------------------------------------------------------------------
  // D. LEDGER
  // ------------------------------------------------------------------
  app.get("/api/v1/reports/ledger/:serviceAccountId", { preHandler: [authenticate, requireRoles(...READ_ROLES)] }, async (request, reply) => {
    const params = z.object({ serviceAccountId: z.coerce.number().int().positive() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid service account ID" });

    const [account] = await db
      .select({
        id: serviceAccounts.id,
        serviceNumber: serviceAccounts.serviceNumber,
        status: serviceAccounts.status,
        subscriberId: serviceAccounts.subscriberId,
        subscriberName: sql<string>`${subscribers.firstName} || ' ' || ${subscribers.lastName}`,
      })
      .from(serviceAccounts)
      .innerJoin(subscribers, eq(subscribers.id, serviceAccounts.subscriberId))
      .where(eq(serviceAccounts.id, params.data.serviceAccountId))
      .limit(1);
    if (!account) return reply.code(404).send({ message: "Service account not found" });

    const accountInvoices = await db
      .select()
      .from(invoices)
      .where(eq(invoices.serviceAccountId, account.id))
      .orderBy(invoices.issueDate, invoices.id);

    const entries: Array<{ date: string; type: string; reference: string; description: string; debitCents: bigint; creditCents: bigint; runningBalanceCents: bigint }> = [];
    let running = 0n;

    // Build chronological entries: invoice debits, posted-allocation credits,
    // reversal debits for reversed payments (net-reversal effect is zero when
    // allocations were posted... they restore the balance).
    for (const inv of accountInvoices) {
      entries.push({
        date: inv.issueDate.toISOString().slice(0, 10),
        type: "invoice",
        reference: inv.invoiceNumber,
        description: `Invoice ${inv.invoiceNumber}`,
        debitCents: parseMoneyToCents(inv.totalAmount) ?? 0n,
        creditCents: 0n,
        runningBalanceCents: 0n,
      });
    }

    const allocations = await db
      .select({
        allocationId: paymentAllocations.id,
        invoiceId: paymentAllocations.invoiceId,
        amount: paymentAllocations.amount,
        paymentId: paymentAllocations.paymentId,
        paymentStatus: payments.status,
        paymentDate: payments.paymentDate,
        postedAt: payments.postedAt,
        reversalDate: paymentReversals.reversedAt,
      })
      .from(paymentAllocations)
      .innerJoin(payments, eq(payments.id, paymentAllocations.paymentId))
      .leftJoin(paymentReversals, eq(paymentReversals.paymentId, payments.id))
      .where(eq(payments.serviceAccountId, account.id));

    for (const a of allocations) {
      const amt = parseMoneyToCents(a.amount) ?? 0n;
      const paymentDateStr = a.postedAt ? a.postedAt.toISOString().slice(0, 10) : a.paymentDate.toISOString().slice(0, 10);
      if (a.paymentStatus === "posted") {
        entries.push({
          date: paymentDateStr,
          type: "payment",
          reference: `payment #${a.paymentId}`,
          description: `Payment allocation #${a.allocationId} for invoice #${a.invoiceId}`,
          debitCents: 0n,
          creditCents: amt,
          runningBalanceCents: 0n,
        });
      } else if (a.paymentStatus === "reversed") {
        entries.push({
          date: paymentDateStr,
          type: "payment (reversed)",
          reference: `payment #${a.paymentId}`,
          description: `Payment #${a.paymentId} (later reversed) applied to invoice #${a.invoiceId}`,
          debitCents: 0n,
          creditCents: amt,
          runningBalanceCents: 0n,
        });
        entries.push({
          date: a.reversalDate ? a.reversalDate.toISOString().slice(0, 10) : paymentDateStr,
          type: "reversal",
          reference: `reversal of payment #${a.paymentId}`,
          description: `Reversal restores invoice #${a.invoiceId} balance`,
          debitCents: amt,
          creditCents: 0n,
          runningBalanceCents: 0n,
        });
      }
    }

    // Sort chronological: by date, then invoices before payments before reversals on the same day.
    const typeOrder: Record<string, number> = { invoice: 0, payment: 1, "payment (reversed)": 1, reversal: 2 };
    entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (typeOrder[a.type] ?? 9) - (typeOrder[b.type] ?? 9)));
    for (const e of entries) {
      running += e.debitCents - e.creditCents;
      e.runningBalanceCents = running;
    }

    return reply.send({
      data: {
        serviceAccount: account,
        entries: entries.map((e) => ({
          date: e.date,
          type: e.type,
          reference: e.reference,
          description: e.description,
          debit: formatCents(e.debitCents),
          credit: formatCents(e.creditCents),
          runningBalance: formatCents(e.runningBalanceCents),
        })),
        closingBalance: formatCents(running),
      },
      meta: { basis: "debits: invoices; credits: posted-payment allocations; reversed payments net to zero via reversal entry" },
    });
  });

  // ------------------------------------------------------------------
  // E. STATEMENT OF ACCOUNT
  // ------------------------------------------------------------------
  app.get("/api/v1/reports/soa/:serviceAccountId", { preHandler: [authenticate, requireRoles(...READ_ROLES)] }, async (request, reply) => {
    const params = z.object({ serviceAccountId: z.coerce.number().int().positive() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Invalid service account ID" });

    const [acc] = await db
      .select({
        id: serviceAccounts.id,
        serviceNumber: serviceAccounts.serviceNumber,
        status: serviceAccounts.status,
        subscriberId: serviceAccounts.subscriberId,
        planId: serviceAccounts.planId,
        accountNumber: subscribers.accountNumber,
        firstName: subscribers.firstName,
        lastName: subscribers.lastName,
        email: subscribers.email,
        contactNumber: subscribers.contactNumber,
        planName: servicePlans.name,
        planPrice: servicePlans.price,
        serviceName: services.name,
        serviceType: services.type,
      })
      .from(serviceAccounts)
      .innerJoin(subscribers, eq(subscribers.id, serviceAccounts.subscriberId))
      .innerJoin(servicePlans, eq(servicePlans.id, serviceAccounts.planId))
      .innerJoin(services, eq(services.id, servicePlans.serviceId))
      .where(eq(serviceAccounts.id, params.data.serviceAccountId))
      .limit(1);
    if (!acc) return reply.code(404).send({ message: "Service account not found" });

    const balanceRows = await getInvoiceBalances({ serviceAccountId: acc.id });
    const outstanding = balanceRows.filter((r) => r.balanceCents > 0n);

    let outstandingTotal = 0n;
    let overdueTotal = 0n;
    const bucketTotals: Record<string, bigint> = Object.fromEntries(AGING_BUCKETS.map((b) => [b, 0n]));
    for (const r of outstanding) {
      outstandingTotal += r.balanceCents;
      const days = daysOverdue(r.dueDate);
      if (days > 0) overdueTotal += r.balanceCents;
      bucketTotals[bucketFor(days)] = (bucketTotals[bucketFor(days)] ?? 0n) + r.balanceCents;
    }

    const recentPayments = await db
      .select({
        id: payments.id,
        amount: payments.amount,
        method: payments.method,
        status: payments.status,
        paymentDate: payments.paymentDate,
        receiptNumber: payments.receiptNumber,
      })
      .from(payments)
      .where(eq(payments.serviceAccountId, acc.id))
      .orderBy(desc(payments.id))
      .limit(50);

    return reply.send({
      data: {
        subscriber: { id: acc.subscriberId, accountNumber: acc.accountNumber, name: `${acc.firstName} ${acc.lastName}`, email: acc.email, contactNumber: acc.contactNumber },
        serviceAccount: { id: acc.id, serviceNumber: acc.serviceNumber, status: acc.status },
        service: { name: acc.serviceName, type: acc.serviceType },
        plan: { name: acc.planName, price: acc.planPrice },
        outstandingInvoices: outstanding.map((r) => ({
          invoiceId: r.invoiceId,
          invoiceNumber: r.invoiceNumber,
          totalAmount: r.totalAmount,
          allocated: r.allocated,
          balance: formatCents(r.balanceCents),
          dueDate: r.dueDate,
          daysOverdue: daysOverdue(r.dueDate),
          bucket: bucketFor(daysOverdue(r.dueDate)),
        })),
        recentPayments,
        totals: {
          outstandingBalance: formatCents(outstandingTotal),
          overdueBalance: formatCents(overdueTotal),
          aging: Object.fromEntries(AGING_BUCKETS.map((b) => [b, formatCents(bucketTotals[b] ?? 0n)])),
        },
      },
      meta: { generatedAt: new Date().toISOString(), basis: "Derived from existing transactional data; safe for PDF SOA rendering" },
    });
  });

  // ------------------------------------------------------------------
  // F. COLLECTOR REPORT
  // ------------------------------------------------------------------
  app.get("/api/v1/reports/collectors", { preHandler: [authenticate, requireRoles(...READ_ROLES)] }, async (request, reply) => {
    const parsed = z.object({
      dateFrom: dateString.optional(),
      dateTo: dateString.optional(),
      collectorId: z.coerce.number().int().positive().optional(),
      collectionAreaId: z.coerce.number().int().positive().optional(),
    }).safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ message: "Invalid query parameters" });
    const { dateFrom, dateTo, collectorId, collectionAreaId } = parsed.data;
    if (dateFrom && dateTo && dateFrom > dateTo) {
      return reply.code(400).send({ message: "dateFrom must not be after dateTo" });
    }

    const conditions = [];
    if (dateFrom) conditions.push(gte(collectionBatches.batchDate, new Date(dateFrom)));
    if (dateTo) conditions.push(lte(collectionBatches.batchDate, new Date(dateTo)));
    if (collectorId) conditions.push(eq(collectionBatches.collectorId, collectorId));
    if (collectionAreaId) conditions.push(eq(collectors.collectionAreaId, collectionAreaId));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        collectorId: collectors.id,
        collectorName: collectors.fullName,
        collectionAreaId: collectors.collectionAreaId,
        collectionAreaName: collectionAreas.name,
        batchCount: sql<number>`count(*)::int`,
        expectedAmount: sql<string>`coalesce(sum(${collectionBatches.expectedAmount}), 0)::numeric(14,2)`,
        remittedAmount: sql<string>`coalesce(sum(${collectionBatches.remittedAmount}), 0)::numeric(14,2)`,
        shortageAmount: sql<string>`coalesce(sum(${collectionBatches.shortageAmount}), 0)::numeric(14,2)`,
        overageAmount: sql<string>`coalesce(sum(${collectionBatches.overageAmount}), 0)::numeric(14,2)`,
        openCount: sql<number>`count(*) filter (where ${collectionBatches.status} = 'open')::int`,
        remittedCount: sql<number>`count(*) filter (where ${collectionBatches.status} = 'remitted')::int`,
        reconciledCount: sql<number>`count(*) filter (where ${collectionBatches.status} = 'reconciled')::int`,
      })
      .from(collectionBatches)
      .innerJoin(collectors, eq(collectors.id, collectionBatches.collectorId))
      .leftJoin(collectionAreas, eq(collectionAreas.id, collectors.collectionAreaId))
      .where(where)
      .groupBy(collectors.id, collectors.fullName, collectors.collectionAreaId, collectionAreas.name);

    return reply.send({
      data: rows,
      meta: { basis: "Aggregated from collection_batches; shortages/overages preserved, never hidden" },
    });
  });

  // ------------------------------------------------------------------
  // G. DASHBOARD SUMMARY
  // ------------------------------------------------------------------
  app.get("/api/v1/reports/dashboard", { preHandler: [authenticate, requireRoles(...READ_ROLES)] }, async (request, reply) => {
    const activeSubscribers = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(subscribers)
      .where(eq(subscribers.status, "active"));
    const activeAccounts = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(serviceAccounts)
      .where(eq(serviceAccounts.status, "active"));
    const pendingInstalls = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(serviceAccounts)
      .where(eq(serviceAccounts.status, "pending_installation"));

    const arRows = await getInvoiceBalances();
    let totalOutstanding = 0n;
    let totalOverdue = 0n;
    let overdueCount = 0;
    const accountIdsWithOverdue = new Set<number>();
    const agingTotals: Record<string, bigint> = Object.fromEntries(AGING_BUCKETS.map((b) => [b, 0n]));
    for (const r of arRows) {
      if (r.balanceCents <= 0n) continue;
      totalOutstanding += r.balanceCents;
      const days = daysOverdue(r.dueDate);
      agingTotals[bucketFor(days)] = (agingTotals[bucketFor(days)] ?? 0n) + r.balanceCents;
      if (days > 0) {
        totalOverdue += r.balanceCents;
        overdueCount += 1;
        accountIdsWithOverdue.add(r.serviceAccountId);
      }
    }

    const today = todayDateString();
    const monthStart = today.slice(0, 7) + "-01";

    const [monthInvoices] = await db
      .select({ total: sql<string>`coalesce(sum(${invoices.totalAmount}), 0)::numeric(14,2)`, count: sql<number>`count(*)::int` })
      .from(invoices)
      .where(gte(invoices.issueDate, new Date(monthStart)));

    const [monthPayments] = await db
      .select({ total: sql<string>`coalesce(sum(${payments.amount}), 0)::numeric(14,2)`, count: sql<number>`count(*)::int` })
      .from(payments)
      .where(and(gte(payments.paymentDate, new Date(monthStart)), eq(payments.status, "posted")));

    const [openBatches] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(collectionBatches)
      .where(eq(collectionBatches.status, "open"));

    const [remittanceTotals] = await db
      .select({
        shortage: sql<string>`coalesce(sum(${collectionBatches.shortageAmount}), 0)::numeric(14,2)`,
        overage: sql<string>`coalesce(sum(${collectionBatches.overageAmount}), 0)::numeric(14,2)`,
      })
      .from(collectionBatches);

    return reply.send({
      data: {
        activeSubscribers: activeSubscribers[0]?.count ?? 0,
        activeServiceAccounts: activeAccounts[0]?.count ?? 0,
        pendingInstallations: pendingInstalls[0]?.count ?? 0,
        totalOutstandingAr: formatCents(totalOutstanding),
        totalOverdueAr: formatCents(totalOverdue),
        overdueInvoiceCount: overdueCount,
        currentMonthInvoiceTotal: monthInvoices?.total ?? "0.00",
        currentMonthPostedCollectionTotal: monthPayments?.total ?? "0.00",
        currentMonthPaymentCount: monthPayments?.count ?? 0,
        openCollectionBatches: openBatches?.count ?? 0,
        remittanceShortageTotal: remittanceTotals?.shortage ?? "0.00",
        remittanceOverageTotal: remittanceTotals?.overage ?? "0.00",
        suspensionCandidateCount: accountIdsWithOverdue.size,
        agingBuckets: Object.fromEntries(AGING_BUCKETS.map((b) => [b, formatCents(agingTotals[b] ?? 0n)])),
      },
      meta: { today, monthStart },
    });
  });
}
