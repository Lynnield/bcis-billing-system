import { describe, it, expect, vi, afterEach } from "vitest";

describe("Phase 15 — GCash Verification UI", () => {
  describe("Role access (canVerifyGcashPayments)", () => {
    it("allows Owner / Super Admin, Administrator, and Accounting / Auditor", async () => {
      const { canVerifyGcashPayments } = await import("@/lib/gcash-verification");
      expect(canVerifyGcashPayments({ id: 1, username: "o", email: "o@test.com", fullName: "O", roles: ["Owner / Super Admin"] })).toBe(true);
      expect(canVerifyGcashPayments({ id: 2, username: "a", email: "a@test.com", fullName: "A", roles: ["Administrator"] })).toBe(true);
      expect(canVerifyGcashPayments({ id: 3, username: "c", email: "c@test.com", fullName: "C", roles: ["Accounting / Auditor"] })).toBe(true);
    });

    it("denies Cashier, Collection Supervisor, Technician, and Read-only Viewer", async () => {
      const { canVerifyGcashPayments } = await import("@/lib/gcash-verification");
      expect(canVerifyGcashPayments({ id: 4, username: "c", email: "c@test.com", fullName: "C", roles: ["Cashier"] })).toBe(false);
      expect(canVerifyGcashPayments({ id: 5, username: "s", email: "s@test.com", fullName: "S", roles: ["Collection Supervisor"] })).toBe(false);
      expect(canVerifyGcashPayments({ id: 6, username: "t", email: "t@test.com", fullName: "T", roles: ["Technician"] })).toBe(false);
      expect(canVerifyGcashPayments({ id: 7, username: "v", email: "v@test.com", fullName: "V", roles: ["Read-only Viewer"] })).toBe(false);
    });

    it("denies a null user", async () => {
      const { canVerifyGcashPayments } = await import("@/lib/gcash-verification");
      expect(canVerifyGcashPayments(null)).toBe(false);
    });

    it("allows a user holding an authorized role among several others", async () => {
      const { canVerifyGcashPayments } = await import("@/lib/gcash-verification");
      expect(canVerifyGcashPayments({ id: 8, username: "m", email: "m@test.com", fullName: "M", roles: ["Cashier", "Administrator"] })).toBe(true);
    });
  });

  describe("Self-review detection (isOwnGcashSubmission)", () => {
    it("is true when the current user is the submitter", async () => {
      const { isOwnGcashSubmission } = await import("@/lib/gcash-verification");
      const user = { id: 10, username: "u", email: "u@test.com", fullName: "U", roles: ["Owner / Super Admin"] };
      expect(isOwnGcashSubmission(user, 10)).toBe(true);
    });

    it("is false when a different user submitted it", async () => {
      const { isOwnGcashSubmission } = await import("@/lib/gcash-verification");
      const user = { id: 10, username: "u", email: "u@test.com", fullName: "U", roles: ["Owner / Super Admin"] };
      expect(isOwnGcashSubmission(user, 11)).toBe(false);
    });

    it("is false when there is no recorded submitter or no current user", async () => {
      const { isOwnGcashSubmission } = await import("@/lib/gcash-verification");
      const user = { id: 10, username: "u", email: "u@test.com", fullName: "U", roles: ["Owner / Super Admin"] };
      expect(isOwnGcashSubmission(user, null)).toBe(false);
      expect(isOwnGcashSubmission(null, 10)).toBe(false);
    });
  });

  describe("Combined review permission (getGcashReviewPermission)", () => {
    it("denies an unauthorized role with a role-specific message, even if not the submitter", async () => {
      const { getGcashReviewPermission } = await import("@/lib/gcash-verification");
      const cashier = { id: 20, username: "c", email: "c@test.com", fullName: "C", roles: ["Cashier"] };
      const result = getGcashReviewPermission(cashier, 999);
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/does not have permission/i);
    });

    it("denies an authorized reviewer reviewing their own submission (separation of duties)", async () => {
      const { getGcashReviewPermission } = await import("@/lib/gcash-verification");
      const owner = { id: 21, username: "o", email: "o@test.com", fullName: "O", roles: ["Owner / Super Admin"] };
      const result = getGcashReviewPermission(owner, 21);
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/cannot verify or reject.*yourself/i);
    });

    it("allows an authorized reviewer who did not submit the payment", async () => {
      const { getGcashReviewPermission } = await import("@/lib/gcash-verification");
      const auditor = { id: 22, username: "a", email: "a@test.com", fullName: "A", roles: ["Accounting / Auditor"] };
      const result = getGcashReviewPermission(auditor, 999);
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it("allows review when the submitter is unknown (postedByUserId null)", async () => {
      const { getGcashReviewPermission } = await import("@/lib/gcash-verification");
      const admin = { id: 23, username: "ad", email: "ad@test.com", fullName: "Ad", roles: ["Administrator"] };
      const result = getGcashReviewPermission(admin, null);
      expect(result.allowed).toBe(true);
    });
  });

  describe("payment-api verify/reject IPC wrappers", () => {
    const originalWindow = (globalThis as unknown as { window?: unknown }).window;

    afterEach(() => {
      (globalThis as unknown as { window?: unknown }).window = originalWindow;
      vi.resetModules();
    });

    function stubBcis(overrides: { verify?: ReturnType<typeof vi.fn>; reject?: ReturnType<typeof vi.fn> }) {
      (globalThis as unknown as { window: unknown }).window = {
        bcis: {
          payments: {
            verify: overrides.verify ?? vi.fn(),
            reject: overrides.reject ?? vi.fn(),
          },
        },
      };
    }

    it("verifyGcashPayment calls window.bcis.payments.verify with the payment id and trimmed note", async () => {
      const verify = vi.fn().mockResolvedValue({ data: { id: 5, status: "posted" } });
      stubBcis({ verify });
      const { verifyGcashPayment } = await import("@/lib/payment-api");
      const result = await verifyGcashPayment(5, "looks good");
      expect(verify).toHaveBeenCalledWith(5, "looks good");
      expect(result).toEqual({ data: { id: 5, status: "posted" } });
    });

    it("verifyGcashPayment supports an omitted note", async () => {
      const verify = vi.fn().mockResolvedValue({ data: { id: 6, status: "posted" } });
      stubBcis({ verify });
      const { verifyGcashPayment } = await import("@/lib/payment-api");
      await verifyGcashPayment(6);
      expect(verify).toHaveBeenCalledWith(6, undefined);
    });

    it("rejectGcashPayment calls window.bcis.payments.reject with the payment id and reason", async () => {
      const reject = vi.fn().mockResolvedValue({ data: { paymentId: 7, status: "cancelled" } });
      stubBcis({ reject });
      const { rejectGcashPayment } = await import("@/lib/payment-api");
      const result = await rejectGcashPayment(7, "reference did not match");
      expect(reject).toHaveBeenCalledWith(7, "reference did not match");
      expect(result).toEqual({ data: { paymentId: 7, status: "cancelled" } });
    });

    it("propagates an error from the main process (e.g. self-review or role denial) without swallowing it", async () => {
      const reject = vi.fn().mockRejectedValue(new Error("You cannot reject a payment you submitted yourself"));
      stubBcis({ reject });
      const { rejectGcashPayment } = await import("@/lib/payment-api");
      await expect(rejectGcashPayment(8, "reason")).rejects.toThrow("You cannot reject a payment you submitted yourself");
    });
  });

  describe("Type shapes", () => {
    it("VerifyPaymentRequest and RejectPaymentRequest match the backend contract", async () => {
      const { VerifyPaymentRequest, RejectPaymentRequest } = await import("../src/shared/types");
      const verifyReq: VerifyPaymentRequest = { note: "optional" };
      const verifyReqEmpty: VerifyPaymentRequest = {};
      const rejectReq: RejectPaymentRequest = { reason: "required" };
      expect(verifyReq.note).toBe("optional");
      expect(verifyReqEmpty.note).toBeUndefined();
      expect(rejectReq.reason).toBe("required");
    });

    it("BcisDesktopApi.payments exposes verify and reject", async () => {
      const { BcisDesktopApi } = await import("../src/shared/types");
      const api: BcisDesktopApi["payments"] = {
        getList: vi.fn(),
        getById: vi.fn(),
        create: vi.fn(),
        reverse: vi.fn(),
        verify: vi.fn(),
        reject: vi.fn(),
      };
      expect(typeof api.verify).toBe("function");
      expect(typeof api.reject).toBe("function");
    });
  });
});
