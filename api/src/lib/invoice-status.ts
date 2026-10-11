import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "../db";
import { invoices, paymentAllocations, payments } from "../db/schema";
import { parseMoneyToCents } from "./money";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Tx;

export type DerivedInvoiceStatus = "unpaid" | "partially_paid" | "paid" | "overdue" | "credited";

// Statuses that are never recomputed from balances: a draft is not yet
// billable, and a void invoice is permanently out of receivables.
export const FROZEN_STATUSES = ["draft", "void"] as const;

// Statuses that still carry a collectible balance.
export const OPEN_STATUSES = ["unpaid", "partially_paid", "overdue"] as const;

export function isInvoiceOpen(status: string): boolean {
  return (OPEN_STATUSES as readonly string[]).includes(status);
}

export function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Single source of truth for a finalized invoice's status, derived from its
 * total, the allocations from posted payments, and its due date.
 *
 * - balance <= 0 with nothing paid → "credited" (credit adjustments zeroed it)
 * - balance <= 0 otherwise → "paid"
 * - past due with a balance → "overdue" (whether or not partially paid)
 * - some allocations → "partially_paid", none → "unpaid"
 */
export function deriveInvoiceStatus(
  totalCents: bigint,
  allocatedCents: bigint,
  dueDate: Date | string,
  today = todayDate(),
): DerivedInvoiceStatus {
  const balance = totalCents - allocatedCents;
  if (balance <= 0n) return allocatedCents > 0n ? "paid" : "credited";
  const due = typeof dueDate === "string" ? dueDate.slice(0, 10) : dueDate.toISOString().slice(0, 10);
  if (due < today) return "overdue";
  return allocatedCents > 0n ? "partially_paid" : "unpaid";
}

export async function postedAllocatedCents(exec: Executor, invoiceId: number): Promise<bigint> {
  const [row] = await exec
    .select({ total: sql<string>`coalesce(sum(${paymentAllocations.amount}), 0)::numeric(14,2)` })
    .from(paymentAllocations)
    .innerJoin(payments, eq(payments.id, paymentAllocations.paymentId))
    .where(and(eq(paymentAllocations.invoiceId, invoiceId), eq(payments.status, "posted")));
  return parseMoneyToCents(row?.total ?? "0") ?? 0n;
}

/** Recompute and persist one invoice's status (no-op for draft/void). */
export async function refreshInvoiceStatus(exec: Executor, invoiceId: number): Promise<string | null> {
  const [inv] = await exec.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!inv) return null;
  if ((FROZEN_STATUSES as readonly string[]).includes(inv.status)) return inv.status;
  const allocated = await postedAllocatedCents(exec, inv.id);
  const next = deriveInvoiceStatus(parseMoneyToCents(inv.totalAmount) ?? 0n, allocated, inv.dueDate);
  if (next !== inv.status) {
    await exec.update(invoices).set({ status: next }).where(eq(invoices.id, inv.id));
  }
  return next;
}

/**
 * Move every open invoice whose due date has passed to "overdue". Run on API
 * start-up, on a timer, and on demand via POST /invoices/mark-overdue.
 * Returns the number of invoices changed.
 */
export async function markOverdueInvoices(today = todayDate()): Promise<number> {
  const updated = await db
    .update(invoices)
    .set({ status: "overdue" })
    .where(and(inArray(invoices.status, ["unpaid", "partially_paid"]), lt(invoices.dueDate, new Date(today))))
    .returning({ id: invoices.id });
  return updated.length;
}
