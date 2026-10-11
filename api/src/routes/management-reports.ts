import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { and, desc, eq, gte, inArray, lt, lte, notInArray, sql } from "drizzle-orm";
import { db } from "../db";
import {
  auditLogs,
  collectionAreas,
  collectionBatches,
  collectors,
  invoiceAdjustments,
  invoices,
  paymentReversals,
  payments,
  serviceAccounts,
  servicePlans,
  services,
  subscribers,
  users,
} from "../db/schema";
import { authenticate, requireRoles } from "../lib/auth";
import { ROLE_NAMES } from "../lib/roles";
import { formatCents, parseMoneyToCents } from "../lib/money";
import { getInvoiceBalances } from "../lib/receivables";
import { buildPdfBuffer, buildXlsxBuffer, exportContentType, exportFilename, type ReportColumn } from "../lib/report-export";
import { AUDIT_READ_ROLES } from "./audit";

// Spec 3.11 management reports. Each report is one definition that produces
// a table; the same definition backs the JSON view and the PDF/XLSX export,
// so what is shown on screen and what is exported can never disagree.

const MANAGEMENT_ROLES = [
  ROLE_NAMES.OWNER,
  ROLE_NAMES.ADMINISTRATOR,
  ROLE_NAMES.ACCOUNTING_AUDITOR,
  ROLE_NAMES.COLLECTION_SUPERVISOR,
  ROLE_NAMES.READ_ONLY_VIEWER,
];

// Exports are complete up to this many rows; beyond it the subtitle says so.
const MAX_ROWS = 50_000;

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const paramsSchema = z.object({
  dateFrom: dateString.optional(),
  dateTo: dateString.optional(),
  period: z.enum(["day", "week", "month", "year"]).optional(),
  groupBy: z.enum(["plan", "service", "area"]).optional(),
  collectorId: z.coerce.number().int().positive().optional(),
  collectionAreaId: z.coerce.number().int().positive().optional(),
});
type Params = z.infer<typeof paramsSchema>;

interface ReportResult {
  title: string;
  subtitle: string;
  columns: ReportColumn[];
  rows: Array<Record<string, string | number>>;
  totals?: Record<string, string | number>;
}

interface ReportDef {
  title: string;
  description: string;
  roles: readonly string[];
  params: Array<keyof Params>;
  run: (p: Params) => Promise<ReportResult>;
}

const money = (v: string | null | undefined) => formatCents(parseMoneyToCents(v ?? "0") ?? 0n);
const day = (d: Date | string | null | undefined) => (d ? (typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10)) : "");
const rangeLabel = (p: Params) => `${p.dateFrom ?? "(start)"} to ${p.dateTo ?? "(today)"}`;
/** Exclusive upper bound for a date-only "to" filter. */
const nextDay = (d: string) => new Date(new Date(`${d}T00:00:00Z`).getTime() + 86_400_000);

function percent(numer: bigint, denom: bigint): string {
  if (denom <= 0n) return "—";
  const basisPoints = (numer * 10000n) / denom;
  return `${formatCents(basisPoints)}%`;
}

function truncated(rows: unknown[]): string {
  return rows.length >= MAX_ROWS ? ` · First ${MAX_ROWS.toLocaleString()} rows only — narrow the date range for the rest` : "";
}

const METHODS = ["cash", "gcash", "bank_transfer", "cheque", "other"] as const;

export const REPORTS: Record<string, ReportDef> = {
  "collections-summary": {
    title: "Collection Summary",
    description: "Posted collections per day, week, month or year, split by payment method.",
    roles: MANAGEMENT_ROLES,
    params: ["dateFrom", "dateTo", "period"],
    async run(p) {
      const period = p.period ?? "month";
      // period comes from a validated enum, so it is inlined as a literal: the
      // GROUP BY must repeat the exact same expression, which bound
      // parameters ($1 vs $6) would not be.
      const fmt = period === "year" ? "YYYY" : period === "month" ? "YYYY-MM" : "YYYY-MM-DD";
      const bucket = sql<string>`to_char(date_trunc(${sql.raw(`'${period}'`)}, ${payments.paymentDate}::timestamp), ${sql.raw(`'${fmt}'`)})`;
      const conditions = [eq(payments.status, "posted")];
      if (p.dateFrom) conditions.push(gte(payments.paymentDate, new Date(p.dateFrom)));
      if (p.dateTo) conditions.push(lte(payments.paymentDate, new Date(p.dateTo)));
      const raw = await db
        .select({ bucket, method: payments.method, total: sql<string>`sum(${payments.amount})::numeric(14,2)`, count: sql<number>`count(*)::int` })
        .from(payments)
        .where(and(...conditions))
        .groupBy(bucket, payments.method)
        .orderBy(bucket);

      const byBucket = new Map<string, Record<string, bigint | number>>();
      const grand: Record<string, bigint> = Object.fromEntries([...METHODS, "total"].map((m) => [m, 0n]));
      let grandCount = 0;
      for (const r of raw) {
        const b = byBucket.get(r.bucket) ?? { count: 0, ...Object.fromEntries([...METHODS, "total"].map((m) => [m, 0n])) };
        const cents = parseMoneyToCents(r.total) ?? 0n;
        b[r.method] = (b[r.method] as bigint) + cents;
        b.total = (b.total as bigint) + cents;
        b.count = (b.count as number) + r.count;
        grand[r.method] = grand[r.method]! + cents;
        grand.total = grand.total! + cents;
        grandCount += r.count;
        byBucket.set(r.bucket, b);
      }
      const label = { day: "Date", week: "Week of", month: "Month", year: "Year" }[period];
      return {
        title: `${{ day: "Daily", week: "Weekly", month: "Monthly", year: "Annual" }[period]} Collection Report`,
        subtitle: `${rangeLabel(p)} · posted payments only; reversed payments excluded`,
        columns: [
          { key: "bucket", header: label },
          { key: "cash", header: "Cash", align: "right" },
          { key: "gcash", header: "GCash", align: "right" },
          { key: "bank_transfer", header: "Bank Transfer", align: "right" },
          { key: "cheque", header: "Cheque", align: "right" },
          { key: "other", header: "Other", align: "right" },
          { key: "total", header: "Total", align: "right" },
          { key: "count", header: "Payments", align: "right" },
        ],
        rows: [...byBucket.entries()].map(([bucketKey, b]) => ({
          bucket: bucketKey,
          ...Object.fromEntries([...METHODS, "total"].map((m) => [m, formatCents(b[m] as bigint)])),
          count: b.count as number,
        })),
        totals: { bucket: "Total", ...Object.fromEntries(Object.entries(grand).map(([k, v]) => [k, formatCents(v)])), count: grandCount },
      };
    },
  },

  "billing-vs-collection": {
    title: "Billing vs Collection",
    description: "Amount billed against amount collected per month, with the collection rate.",
    roles: MANAGEMENT_ROLES,
    params: ["dateFrom", "dateTo"],
    async run(p) {
      const invMonth = sql<string>`to_char(${invoices.issueDate}, 'YYYY-MM')`;
      const invConditions = [notInArray(invoices.status, ["draft", "void"])];
      if (p.dateFrom) invConditions.push(gte(invoices.issueDate, new Date(p.dateFrom)));
      if (p.dateTo) invConditions.push(lte(invoices.issueDate, new Date(p.dateTo)));
      const billed = await db
        .select({ month: invMonth, total: sql<string>`sum(${invoices.totalAmount})::numeric(14,2)`, count: sql<number>`count(*)::int` })
        .from(invoices)
        .where(and(...invConditions))
        .groupBy(invMonth);

      const payMonth = sql<string>`to_char(${payments.paymentDate}, 'YYYY-MM')`;
      const payConditions = [eq(payments.status, "posted")];
      if (p.dateFrom) payConditions.push(gte(payments.paymentDate, new Date(p.dateFrom)));
      if (p.dateTo) payConditions.push(lte(payments.paymentDate, new Date(p.dateTo)));
      const collected = await db
        .select({ month: payMonth, total: sql<string>`sum(${payments.amount})::numeric(14,2)` })
        .from(payments)
        .where(and(...payConditions))
        .groupBy(payMonth);

      const months = [...new Set([...billed.map((b) => b.month), ...collected.map((c) => c.month)])].sort();
      let tb = 0n;
      let tc = 0n;
      const rows = months.map((m) => {
        const b = parseMoneyToCents(billed.find((x) => x.month === m)?.total ?? "0") ?? 0n;
        const c = parseMoneyToCents(collected.find((x) => x.month === m)?.total ?? "0") ?? 0n;
        tb += b;
        tc += c;
        return { month: m, invoices: billed.find((x) => x.month === m)?.count ?? 0, billed: formatCents(b), collected: formatCents(c), difference: formatCents(b - c), rate: percent(c, b) };
      });
      return {
        title: "Billing vs Collection",
        subtitle: `${rangeLabel(p)} · billed = finalized invoices by issue month (drafts and voids excluded); collected = posted payments by payment month`,
        columns: [
          { key: "month", header: "Month" },
          { key: "invoices", header: "Invoices", align: "right" },
          { key: "billed", header: "Billed", align: "right" },
          { key: "collected", header: "Collected", align: "right" },
          { key: "difference", header: "Uncollected", align: "right" },
          { key: "rate", header: "Collection Rate", align: "right" },
        ],
        rows,
        totals: { month: "Total", invoices: rows.reduce((t, r) => t + r.invoices, 0), billed: formatCents(tb), collected: formatCents(tc), difference: formatCents(tb - tc), rate: percent(tc, tb) },
      };
    },
  },

  "revenue-by": {
    title: "Revenue by Plan / Service / Area",
    description: "Billed and collected amounts grouped by plan, service type or collection area.",
    roles: MANAGEMENT_ROLES,
    params: ["dateFrom", "dateTo", "groupBy"],
    async run(p) {
      const groupBy = p.groupBy ?? "plan";
      const key =
        groupBy === "plan"
          ? sql<string>`${servicePlans.name}`
          : groupBy === "service"
            ? sql<string>`${services.type}::text`
            : sql<string>`coalesce(${collectionAreas.name}, '(no area)')`;

      const invConditions = [notInArray(invoices.status, ["draft", "void"])];
      if (p.dateFrom) invConditions.push(gte(invoices.issueDate, new Date(p.dateFrom)));
      if (p.dateTo) invConditions.push(lte(invoices.issueDate, new Date(p.dateTo)));
      const billed = await db
        .select({ key, total: sql<string>`sum(${invoices.totalAmount})::numeric(14,2)`, accounts: sql<number>`count(distinct ${serviceAccounts.id})::int` })
        .from(invoices)
        .innerJoin(serviceAccounts, eq(serviceAccounts.id, invoices.serviceAccountId))
        .innerJoin(servicePlans, eq(servicePlans.id, serviceAccounts.planId))
        .innerJoin(services, eq(services.id, servicePlans.serviceId))
        .leftJoin(collectionAreas, eq(collectionAreas.id, serviceAccounts.collectionAreaId))
        .where(and(...invConditions))
        .groupBy(key);

      const payConditions = [eq(payments.status, "posted")];
      if (p.dateFrom) payConditions.push(gte(payments.paymentDate, new Date(p.dateFrom)));
      if (p.dateTo) payConditions.push(lte(payments.paymentDate, new Date(p.dateTo)));
      const collected = await db
        .select({ key, total: sql<string>`sum(${payments.amount})::numeric(14,2)` })
        .from(payments)
        .innerJoin(serviceAccounts, eq(serviceAccounts.id, payments.serviceAccountId))
        .innerJoin(servicePlans, eq(servicePlans.id, serviceAccounts.planId))
        .innerJoin(services, eq(services.id, servicePlans.serviceId))
        .leftJoin(collectionAreas, eq(collectionAreas.id, serviceAccounts.collectionAreaId))
        .where(and(...payConditions))
        .groupBy(key);

      const keys = [...new Set([...billed.map((b) => b.key), ...collected.map((c) => c.key)])].sort();
      let tb = 0n;
      let tc = 0n;
      const rows = keys.map((k) => {
        const b = parseMoneyToCents(billed.find((x) => x.key === k)?.total ?? "0") ?? 0n;
        const c = parseMoneyToCents(collected.find((x) => x.key === k)?.total ?? "0") ?? 0n;
        tb += b;
        tc += c;
        return { key: k, accounts: billed.find((x) => x.key === k)?.accounts ?? 0, billed: formatCents(b), collected: formatCents(c), rate: percent(c, b) };
      });
      const label = { plan: "Plan", service: "Service Type", area: "Collection Area" }[groupBy];
      return {
        title: `Revenue by ${label}`,
        subtitle: rangeLabel(p),
        columns: [
          { key: "key", header: label },
          { key: "accounts", header: "Billed Accounts", align: "right" },
          { key: "billed", header: "Billed", align: "right" },
          { key: "collected", header: "Collected", align: "right" },
          { key: "rate", header: "Collection Rate", align: "right" },
        ],
        rows,
        totals: { key: "Total", accounts: "", billed: formatCents(tb), collected: formatCents(tc), rate: percent(tc, tb) },
      };
    },
  },

  "subscriber-master": {
    title: "Subscriber Master List",
    description: "Every subscriber and service account with plan, area, collector, status and balance.",
    roles: MANAGEMENT_ROLES,
    params: ["collectionAreaId", "collectorId"],
    async run(p) {
      const conditions = [];
      if (p.collectionAreaId) conditions.push(eq(serviceAccounts.collectionAreaId, p.collectionAreaId));
      if (p.collectorId) conditions.push(eq(serviceAccounts.assignedCollectorId, p.collectorId));
      const rows = await db
        .select({
          serviceAccountId: serviceAccounts.id,
          accountNumber: subscribers.accountNumber,
          name: sql<string>`${subscribers.lastName} || ', ' || ${subscribers.firstName}`,
          contact: subscribers.contactNumber,
          address: subscribers.addressLine1,
          subscriberStatus: subscribers.status,
          serviceNumber: serviceAccounts.serviceNumber,
          plan: servicePlans.name,
          serviceStatus: serviceAccounts.status,
          area: collectionAreas.name,
          collector: collectors.fullName,
        })
        .from(serviceAccounts)
        .innerJoin(subscribers, eq(subscribers.id, serviceAccounts.subscriberId))
        .innerJoin(servicePlans, eq(servicePlans.id, serviceAccounts.planId))
        .leftJoin(collectionAreas, eq(collectionAreas.id, serviceAccounts.collectionAreaId))
        .leftJoin(collectors, eq(collectors.id, serviceAccounts.assignedCollectorId))
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(subscribers.lastName, subscribers.firstName, serviceAccounts.serviceNumber)
        .limit(MAX_ROWS);

      const balances = new Map<number, bigint>();
      for (const b of await getInvoiceBalances()) {
        if (b.balanceCents > 0n) balances.set(b.serviceAccountId, (balances.get(b.serviceAccountId) ?? 0n) + b.balanceCents);
      }
      let total = 0n;
      return {
        title: "Subscriber Master List",
        subtitle: `${rows.length} service account(s)${truncated(rows)}`,
        columns: [
          { key: "accountNumber", header: "Account #" },
          { key: "name", header: "Subscriber" },
          { key: "contact", header: "Contact" },
          { key: "address", header: "Address" },
          { key: "serviceNumber", header: "Service #" },
          { key: "plan", header: "Plan" },
          { key: "serviceStatus", header: "Service Status" },
          { key: "area", header: "Area" },
          { key: "collector", header: "Collector" },
          { key: "balance", header: "Balance", align: "right" },
        ],
        rows: rows.map((r) => {
          const bal = balances.get(r.serviceAccountId) ?? 0n;
          total += bal;
          return { ...r, contact: r.contact ?? "", area: r.area ?? "", collector: r.collector ?? "", balance: formatCents(bal), subscriberStatus: r.subscriberStatus };
        }),
        totals: { accountNumber: "Total", balance: formatCents(total) },
      };
    },
  },

  "collector-assignments": {
    title: "Collector Assignments",
    description: "Accounts assigned to each collector and the receivable on their route.",
    roles: MANAGEMENT_ROLES,
    params: ["collectionAreaId"],
    async run(p) {
      const list = await db
        .select({ id: collectors.id, name: collectors.fullName, status: collectors.status, area: collectionAreas.name })
        .from(collectors)
        .leftJoin(collectionAreas, eq(collectionAreas.id, collectors.collectionAreaId))
        .where(p.collectionAreaId ? eq(collectors.collectionAreaId, p.collectionAreaId) : undefined)
        .orderBy(collectors.fullName);
      const accounts = await db
        .select({ id: serviceAccounts.id, collectorId: serviceAccounts.assignedCollectorId, status: serviceAccounts.status })
        .from(serviceAccounts)
        .where(sql`${serviceAccounts.assignedCollectorId} is not null`);
      const balances = await getInvoiceBalances();
      const due = new Map<number, { total: bigint; overdue: bigint }>();
      const today = new Date().toISOString().slice(0, 10);
      for (const b of balances) {
        if (b.balanceCents <= 0n) continue;
        const d = due.get(b.serviceAccountId) ?? { total: 0n, overdue: 0n };
        d.total += b.balanceCents;
        if (day(b.dueDate) < today) d.overdue += b.balanceCents;
        due.set(b.serviceAccountId, d);
      }
      return {
        title: "Collector Assignment Report",
        subtitle: `As of ${today}`,
        columns: [
          { key: "name", header: "Collector" },
          { key: "area", header: "Area" },
          { key: "status", header: "Status" },
          { key: "assigned", header: "Assigned Accounts", align: "right" },
          { key: "active", header: "Active", align: "right" },
          { key: "withBalance", header: "With Balance", align: "right" },
          { key: "receivable", header: "Receivable", align: "right" },
          { key: "overdue", header: "Overdue", align: "right" },
        ],
        rows: list.map((c) => {
          const mine = accounts.filter((a) => a.collectorId === c.id);
          let rec = 0n;
          let ovd = 0n;
          let withBal = 0;
          for (const a of mine) {
            const d = due.get(a.id);
            if (d) {
              rec += d.total;
              ovd += d.overdue;
              withBal += 1;
            }
          }
          return {
            name: c.name,
            area: c.area ?? "",
            status: c.status,
            assigned: mine.length,
            active: mine.filter((a) => a.status === "active").length,
            withBalance: withBal,
            receivable: formatCents(rec),
            overdue: formatCents(ovd),
          };
        }),
      };
    },
  },

  remittances: {
    title: "Remittance Report",
    description: "Every collection batch with expected cash, remitted cash and any shortage or overage.",
    roles: MANAGEMENT_ROLES,
    params: ["dateFrom", "dateTo", "collectorId"],
    async run(p) {
      const conditions = [];
      if (p.dateFrom) conditions.push(gte(collectionBatches.batchDate, new Date(p.dateFrom)));
      if (p.dateTo) conditions.push(lte(collectionBatches.batchDate, new Date(p.dateTo)));
      if (p.collectorId) conditions.push(eq(collectionBatches.collectorId, p.collectorId));
      const rows = await db
        .select({
          id: collectionBatches.id,
          batchDate: collectionBatches.batchDate,
          collector: collectors.fullName,
          status: collectionBatches.status,
          expected: collectionBatches.expectedAmount,
          remitted: collectionBatches.remittedAmount,
          shortage: collectionBatches.shortageAmount,
          overage: collectionBatches.overageAmount,
          notes: collectionBatches.reconciliationNotes,
        })
        .from(collectionBatches)
        .innerJoin(collectors, eq(collectors.id, collectionBatches.collectorId))
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(collectionBatches.batchDate, collectionBatches.id)
        .limit(MAX_ROWS);
      const sum = (k: "expected" | "remitted" | "shortage" | "overage") => formatCents(rows.reduce((t, r) => t + (parseMoneyToCents(r[k]) ?? 0n), 0n));
      return {
        title: "Remittance Report",
        subtitle: `${rangeLabel(p)} · shortages and overages are shown as recorded, never netted${truncated(rows)}`,
        columns: [
          { key: "id", header: "Batch #" },
          { key: "batchDate", header: "Date" },
          { key: "collector", header: "Collector" },
          { key: "status", header: "Status" },
          { key: "expected", header: "Expected Cash", align: "right" },
          { key: "remitted", header: "Remitted", align: "right" },
          { key: "shortage", header: "Shortage", align: "right" },
          { key: "overage", header: "Overage", align: "right" },
          { key: "notes", header: "Notes" },
        ],
        rows: rows.map((r) => ({ ...r, batchDate: day(r.batchDate), expected: money(r.expected), remitted: money(r.remitted), shortage: money(r.shortage), overage: money(r.overage), notes: r.notes ?? "" })),
        totals: { id: "Total", expected: sum("expected"), remitted: sum("remitted"), shortage: sum("shortage"), overage: sum("overage") },
      };
    },
  },

  "reversals-adjustments": {
    title: "Reversals, Voids & Adjustments",
    description: "Payment reversals, voided invoices and post-issue invoice adjustments with reason and approver.",
    roles: [ROLE_NAMES.OWNER, ROLE_NAMES.ADMINISTRATOR, ROLE_NAMES.ACCOUNTING_AUDITOR],
    params: ["dateFrom", "dateTo"],
    async run(p) {
      const from = p.dateFrom ? new Date(`${p.dateFrom}T00:00:00Z`) : undefined;
      const to = p.dateTo ? nextDay(p.dateTo) : undefined;

      const rev = await db
        .select({ at: paymentReversals.reversedAt, ref: payments.receiptNumber, paymentId: payments.id, amount: payments.amount, reason: paymentReversals.reason, by: users.fullName })
        .from(paymentReversals)
        .innerJoin(payments, eq(payments.id, paymentReversals.paymentId))
        .leftJoin(users, eq(users.id, paymentReversals.reversedByUserId))
        .where(and(from ? gte(paymentReversals.reversedAt, from) : undefined, to ? lt(paymentReversals.reversedAt, to) : undefined));

      const voids = await db
        .select({ at: invoices.voidedAt, ref: invoices.invoiceNumber, amount: invoices.totalAmount, reason: invoices.voidReason, by: users.fullName })
        .from(invoices)
        .leftJoin(users, eq(users.id, invoices.voidedByUserId))
        .where(and(eq(invoices.status, "void"), from ? gte(invoices.voidedAt, from) : undefined, to ? lt(invoices.voidedAt, to) : undefined));

      const adjs = await db
        .select({ at: invoiceAdjustments.createdAt, ref: invoices.invoiceNumber, type: invoiceAdjustments.type, amount: invoiceAdjustments.amount, reason: invoiceAdjustments.reason, by: users.fullName })
        .from(invoiceAdjustments)
        .innerJoin(invoices, eq(invoices.id, invoiceAdjustments.invoiceId))
        .leftJoin(users, eq(users.id, invoiceAdjustments.createdByUserId))
        .where(and(eq(invoiceAdjustments.postIssue, true), from ? gte(invoiceAdjustments.createdAt, from) : undefined, to ? lt(invoiceAdjustments.createdAt, to) : undefined));

      const rows = [
        ...rev.map((r) => ({ at: r.at, kind: "Payment reversal", ref: r.ref ?? `payment #${r.paymentId}`, amount: money(r.amount), reason: r.reason, by: r.by ?? "" })),
        ...voids.map((r) => ({ at: r.at, kind: "Invoice void", ref: r.ref, amount: money(r.amount), reason: r.reason ?? "", by: r.by ?? "" })),
        ...adjs.map((r) => ({ at: r.at, kind: r.type === "credit" ? "Credit adjustment" : "Debit adjustment", ref: r.ref, amount: money(r.amount), reason: r.reason, by: r.by ?? "" })),
      ]
        .sort((a, b) => (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0))
        .map((r) => ({ ...r, at: r.at ? r.at.toISOString().replace("T", " ").slice(0, 16) : "" }));

      return {
        title: "Payment Adjustment, Reversal & Void Report",
        subtitle: rangeLabel(p),
        columns: [
          { key: "at", header: "Date / Time" },
          { key: "kind", header: "Type" },
          { key: "ref", header: "Reference" },
          { key: "amount", header: "Amount", align: "right" },
          { key: "reason", header: "Reason" },
          { key: "by", header: "By" },
        ],
        rows,
      };
    },
  },

  "voided-receipts": {
    title: "Voided Receipts",
    description: "Receipts belonging to reversed payments. Their numbers stay reserved and are never reused.",
    roles: [ROLE_NAMES.OWNER, ROLE_NAMES.ADMINISTRATOR, ROLE_NAMES.ACCOUNTING_AUDITOR],
    params: ["dateFrom", "dateTo"],
    async run(p) {
      const conditions = [inArray(payments.status, ["reversed", "cancelled"]), sql`${payments.receiptNumber} is not null`];
      if (p.dateFrom) conditions.push(gte(payments.paymentDate, new Date(p.dateFrom)));
      if (p.dateTo) conditions.push(lte(payments.paymentDate, new Date(p.dateTo)));
      const rows = await db
        .select({
          receipt: payments.receiptNumber,
          paymentDate: payments.paymentDate,
          method: payments.method,
          amount: payments.amount,
          status: payments.status,
          reason: paymentReversals.reason,
          voidedAt: paymentReversals.reversedAt,
          by: users.fullName,
        })
        .from(payments)
        .leftJoin(paymentReversals, eq(paymentReversals.paymentId, payments.id))
        .leftJoin(users, eq(users.id, paymentReversals.reversedByUserId))
        .where(and(...conditions))
        .orderBy(payments.receiptNumber)
        .limit(MAX_ROWS);
      return {
        title: "Voided Receipt Report",
        subtitle: `${rangeLabel(p)} · receipt numbers remain reserved${truncated(rows)}`,
        columns: [
          { key: "receipt", header: "Receipt #" },
          { key: "paymentDate", header: "Payment Date" },
          { key: "method", header: "Method" },
          { key: "amount", header: "Amount", align: "right" },
          { key: "status", header: "Status" },
          { key: "voidedAt", header: "Voided" },
          { key: "reason", header: "Reason" },
          { key: "by", header: "By" },
        ],
        rows: rows.map((r) => ({ ...r, receipt: r.receipt ?? "", paymentDate: day(r.paymentDate), amount: money(r.amount), reason: r.reason ?? "", voidedAt: day(r.voidedAt), by: r.by ?? "" })),
      };
    },
  },

  "user-activity": {
    title: "User Activity",
    description: "Sign-ins, failed sign-ins and recorded actions per user.",
    roles: AUDIT_READ_ROLES,
    params: ["dateFrom", "dateTo"],
    async run(p) {
      const conditions = [];
      if (p.dateFrom) conditions.push(gte(auditLogs.createdAt, new Date(`${p.dateFrom}T00:00:00Z`)));
      if (p.dateTo) conditions.push(lt(auditLogs.createdAt, nextDay(p.dateTo)));
      const rows = await db
        .select({
          user: sql<string>`coalesce(${users.fullName}, '(deleted user)')`,
          username: users.username,
          logins: sql<number>`count(*) filter (where ${auditLogs.action} = 'auth.login')::int`,
          failed: sql<number>`count(*) filter (where ${auditLogs.action} in ('auth.login_failed', 'auth.locked', 'auth.login_refused_locked'))::int`,
          payments: sql<number>`count(*) filter (where ${auditLogs.action} in ('payment.post', 'payment.gcash_submit'))::int`,
          reviews: sql<number>`count(*) filter (where ${auditLogs.action} in ('payment.gcash_verify', 'payment.gcash_reject'))::int`,
          corrections: sql<number>`count(*) filter (where ${auditLogs.action} in ('payment.reverse', 'invoice.void', 'invoice.adjust'))::int`,
          total: sql<number>`count(*)::int`,
          last: sql<Date>`max(${auditLogs.createdAt})`,
        })
        .from(auditLogs)
        .leftJoin(users, eq(users.id, auditLogs.actorUserId))
        .where(conditions.length ? and(...conditions) : undefined)
        .groupBy(users.fullName, users.username)
        .orderBy(desc(sql`count(*)`));
      return {
        title: "User Activity Report",
        subtitle: rangeLabel(p),
        columns: [
          { key: "user", header: "User" },
          { key: "username", header: "Username" },
          { key: "logins", header: "Sign-ins", align: "right" },
          { key: "failed", header: "Failed / Locked", align: "right" },
          { key: "payments", header: "Payments Recorded", align: "right" },
          { key: "reviews", header: "GCash Reviews", align: "right" },
          { key: "corrections", header: "Reversals / Voids / Adjustments", align: "right" },
          { key: "total", header: "All Actions", align: "right" },
          { key: "last", header: "Last Activity" },
        ],
        rows: rows.map((r) => ({ ...r, username: r.username ?? "", last: r.last ? new Date(r.last).toISOString().replace("T", " ").slice(0, 16) : "" })),
      };
    },
  },

  "audit-trail": {
    title: "Audit Trail",
    description: "Every audited change in the period, oldest first.",
    roles: AUDIT_READ_ROLES,
    params: ["dateFrom", "dateTo"],
    async run(p) {
      const conditions = [];
      if (p.dateFrom) conditions.push(gte(auditLogs.createdAt, new Date(`${p.dateFrom}T00:00:00Z`)));
      if (p.dateTo) conditions.push(lt(auditLogs.createdAt, nextDay(p.dateTo)));
      const rows = await db
        .select({ at: auditLogs.createdAt, user: users.fullName, action: auditLogs.action, entityType: auditLogs.entityType, entityId: auditLogs.entityId, metadata: auditLogs.metadata })
        .from(auditLogs)
        .leftJoin(users, eq(users.id, auditLogs.actorUserId))
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(auditLogs.createdAt, auditLogs.id)
        .limit(MAX_ROWS);
      return {
        title: "Audit Trail Report",
        subtitle: `${rangeLabel(p)}${truncated(rows)}`,
        columns: [
          { key: "at", header: "Date / Time" },
          { key: "user", header: "User" },
          { key: "action", header: "Action" },
          { key: "record", header: "Record" },
          { key: "details", header: "Details" },
        ],
        rows: rows.map((r) => ({
          at: r.at.toISOString().replace("T", " ").slice(0, 19),
          user: r.user ?? "",
          action: r.action,
          record: `${r.entityType}${r.entityId !== null ? ` #${r.entityId}` : ""}`,
          details: r.metadata ? JSON.stringify(r.metadata).slice(0, 300) : "",
        })),
      };
    },
  },
};

async function runReport(slug: string, query: unknown, roles: string[], reply: FastifyReply): Promise<ReportResult | null> {
  const def = REPORTS[slug];
  if (!def) {
    reply.code(404).send({ message: "Unknown report" });
    return null;
  }
  if (!roles.some((r) => def.roles.includes(r))) {
    reply.code(403).send({ message: "You do not have permission to access this resource" });
    return null;
  }
  const parsed = paramsSchema.safeParse(query);
  if (!parsed.success) {
    reply.code(400).send({ message: "Invalid report parameters", issues: parsed.error.issues });
    return null;
  }
  if (parsed.data.dateFrom && parsed.data.dateTo && parsed.data.dateFrom > parsed.data.dateTo) {
    reply.code(400).send({ message: "dateFrom must not be after dateTo" });
    return null;
  }
  return def.run(parsed.data);
}

const ANY_REPORT_ROLE = [...new Set(Object.values(REPORTS).flatMap((d) => d.roles))];

export default async function managementReportRoutes(app: FastifyInstance): Promise<void> {
  // Catalog of the reports this user may run, for the Reports screen.
  app.get("/api/v1/reports/catalog", { preHandler: [authenticate, requireRoles(...ANY_REPORT_ROLE)] }, async (request, reply) => {
    const mine = Object.entries(REPORTS)
      .filter(([, d]) => request.currentUser!.roles.some((r) => d.roles.includes(r)))
      .map(([slug, d]) => ({ slug, title: d.title, description: d.description, params: d.params }));
    return reply.send({ data: mine });
  });

  app.get("/api/v1/reports/run/:slug", { preHandler: [authenticate, requireRoles(...ANY_REPORT_ROLE)] }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const result = await runReport(slug, request.query, request.currentUser!.roles, reply);
    if (!result) return reply;
    return reply.send({ data: result });
  });

  app.get("/api/v1/reports/run/:slug/export", { preHandler: [authenticate, requireRoles(...ANY_REPORT_ROLE)] }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const { format, ...rest } = (request.query ?? {}) as Record<string, string>;
    if (format !== "pdf" && format !== "xlsx") return reply.code(400).send({ message: "format must be pdf or xlsx" });
    const result = await runReport(slug, rest, request.currentUser!.roles, reply);
    if (!result) return reply;
    const rows = result.totals ? [...result.rows, result.totals] : result.rows;
    const buffer = format === "pdf" ? await buildPdfBuffer({ ...result, rows }) : await buildXlsxBuffer({ ...result, rows });
    reply.header("Content-Type", exportContentType(format));
    reply.header("Content-Disposition", `attachment; filename="${exportFilename(slug, format)}"`);
    return reply.send(buffer);
  });
}
