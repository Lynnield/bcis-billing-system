import { describe, it, expect, vi, afterEach } from "vitest";

// IPC-wrapper coverage for the invoice void/adjust/finalize workflow and the
// bulk billing generator.

function stubWindow(bcis: Record<string, unknown>) {
  (globalThis as unknown as { window: unknown }).window = { bcis };
}

const originalWindow = (globalThis as unknown as { window?: unknown }).window;

afterEach(() => {
  (globalThis as unknown as { window?: unknown }).window = originalWindow;
  vi.resetModules();
});

describe("invoice workflow wrappers", () => {
  it("forward id and payload unchanged", async () => {
    const finalize = vi.fn().mockResolvedValue({ data: {} });
    const voidFn = vi.fn().mockResolvedValue({ data: {} });
    const adjust = vi.fn().mockResolvedValue({ data: {} });
    const markOverdue = vi.fn().mockResolvedValue({ data: { changed: 2 } });
    stubWindow({ invoices: { finalize, void: voidFn, adjust, markOverdue } });

    const api = await import("@/lib/invoice-api");
    await api.finalizeInvoice(7);
    await api.voidInvoice(7, "Billed in error");
    await api.adjustInvoice(7, { type: "credit", amount: "100.00", reason: "Outage" });
    const res = await api.markOverdueInvoices();

    expect(finalize).toHaveBeenCalledWith(7);
    expect(voidFn).toHaveBeenCalledWith(7, "Billed in error");
    // Money stays a decimal string end to end — never a JS number.
    expect(adjust).toHaveBeenCalledWith(7, { type: "credit", amount: "100.00", reason: "Outage" });
    expect(res.data.changed).toBe(2);
  });
});

describe("billing generation wrapper", () => {
  it("passes dryRun/asDraft options through", async () => {
    const generate = vi.fn().mockResolvedValue({ data: { wouldBill: 3 } });
    stubWindow({ billingPeriods: { generate } });

    const { generateBilling } = await import("@/lib/billing-period-api");
    await generateBilling(4, { dryRun: true });
    await generateBilling(4, { asDraft: true });

    expect(generate).toHaveBeenNthCalledWith(1, 4, { dryRun: true });
    expect(generate).toHaveBeenNthCalledWith(2, 4, { asDraft: true });
  });
});

describe("invoice status labels", () => {
  it("every API status has a text label (status is never colour-only)", async () => {
    const { invoiceStatusLabel, invoiceStatusBadge } = await import("@/components/invoices/invoice-status");
    for (const s of ["draft", "unpaid", "partially_paid", "paid", "overdue", "void", "credited"] as const) {
      expect(invoiceStatusLabel[s]).toBeTruthy();
      expect(invoiceStatusBadge[s]).toBeTruthy();
    }
  });
});
