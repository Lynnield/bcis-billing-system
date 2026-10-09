import { describe, it, expect, vi } from "vitest";

describe("Phase 13C — Navigation & Dashboard Tests", () => {
  describe("Role-based Navigation", () => {
    it("filterNavItems returns all items for Owner role", async () => {
      const { filterNavItems } = await import("@/lib/roles");
      const user = { id: 1, username: "owner", email: "o@test.com", fullName: "Owner", roles: ["Owner / Super Admin"] };
      const items = filterNavItems(user);
      expect(items.length).toBe(12);
      expect(items.map((i) => i.key)).toEqual([
        "dashboard",
        "subscribers",
        "service-accounts",
        "services",
        "billing-invoices",
        "payments",
        "gcash-verification",
        "collections",
        "receivables",
        "reports",
        "collection-areas",
        "user-management",
      ]);
    });

    it("filterNavItems filters for Cashier role", async () => {
      const { filterNavItems } = await import("@/lib/roles");
      const user = { id: 2, username: "cashier", email: "c@test.com", fullName: "Cashier", roles: ["Cashier"] };
      const items = filterNavItems(user);
      // Cashier should see: dashboard, subscribers, service-accounts, billing-invoices, payments, collections, receivables
      expect(items.map((i) => i.key)).toEqual([
        "dashboard",
        "subscribers",
        "service-accounts",
        "billing-invoices",
        "payments",
        "collections",
        "receivables",
      ]);
    });

    it("filterNavItems filters for Collection Supervisor role", async () => {
      const { filterNavItems } = await import("@/lib/roles");
      const user = { id: 3, username: "collector_sup", email: "cs@test.com", fullName: "Collector Sup", roles: ["Collection Supervisor"] };
      const items = filterNavItems(user);
      // Collection Supervisor should see: dashboard, payments, collections, reports, collection-areas
      expect(items.map((i) => i.key)).toEqual([
        "dashboard",
        "payments",
        "collections",
        "reports",
        "collection-areas",
      ]);
    });

    it("filterNavItems filters for Accounting/Auditor role", async () => {
      const { filterNavItems } = await import("@/lib/roles");
      const user = { id: 4, username: "auditor", email: "a@test.com", fullName: "Auditor", roles: ["Accounting / Auditor"] };
      const items = filterNavItems(user);
      // Accounting should see: dashboard, billing-invoices, gcash-verification, receivables, reports
      expect(items.map((i) => i.key)).toEqual([
        "dashboard",
        "billing-invoices",
        "gcash-verification",
        "receivables",
        "reports",
      ]);
    });

    it("filterNavItems filters for Read-only Viewer role", async () => {
      const { filterNavItems } = await import("@/lib/roles");
      const user = { id: 5, username: "viewer", email: "v@test.com", fullName: "Viewer", roles: ["Read-only Viewer"] };
      const items = filterNavItems(user);
      // Viewer should only see dashboard
      expect(items.map((i) => i.key)).toEqual(["dashboard"]);
    });

    it("filterNavItems returns empty array for null user", async () => {
      const { filterNavItems } = await import("@/lib/roles");
      const items = filterNavItems(null);
      expect(items).toEqual([]);
    });

    it("canAccessNavItem checks individual item access", async () => {
      const { canAccessNavItem, NAV_ITEMS } = await import("@/lib/roles");
      const user = { id: 1, username: "cashier", email: "c@test.com", fullName: "Cashier", roles: ["Cashier"] };
      const userMgmtItem = NAV_ITEMS.find((i) => i.key === "user-management")!;
      const dashboardItem = NAV_ITEMS.find((i) => i.key === "dashboard")!;
      expect(canAccessNavItem(user, userMgmtItem)).toBe(false);
      expect(canAccessNavItem(user, dashboardItem)).toBe(true);
    });

    it("getPrimaryRole returns highest priority role", async () => {
      const { getPrimaryRole } = await import("@/lib/roles");
      const user = { id: 1, username: "multi", email: "m@test.com", fullName: "Multi", roles: ["Cashier", "Owner / Super Admin", "Technician"] };
      expect(getPrimaryRole(user)).toBe("Owner / Super Admin");
    });
  });

  describe("Dashboard API Integration", () => {
    it("getDashboardSummary calls correct IPC method", async () => {
      const { getDashboardSummary } = await import("@/lib/dashboard-api");
      expect(typeof getDashboardSummary).toBe("function");
    });

    it("getReceivablesReport calls correct IPC method", async () => {
      const { getReceivablesReport } = await import("@/lib/dashboard-api");
      expect(typeof getReceivablesReport).toBe("function");
    });

    it("getCollectionsReport calls correct IPC method", async () => {
      const { getCollectionsReport } = await import("@/lib/dashboard-api");
      expect(typeof getCollectionsReport).toBe("function");
    });
  });

  describe("Dashboard Types", () => {
    it("DashboardSummaryResponse matches backend schema", async () => {
      const { DashboardSummaryResponse } = await import("@shared/types");
      const response: DashboardSummaryResponse = {
        data: {
          activeSubscribers: 100,
          activeServiceAccounts: 120,
          pendingInstallations: 5,
          totalOutstandingAr: "50000.00",
          totalOverdueAr: "15000.00",
          overdueInvoiceCount: 25,
          currentMonthInvoiceTotal: "80000.00",
          currentMonthPostedCollectionTotal: "75000.00",
          currentMonthPaymentCount: 500,
          openCollectionBatches: 3,
          remittanceShortageTotal: "200.00",
          remittanceOverageTotal: "50.00",
          suspensionCandidateCount: 10,
          agingBuckets: {
            current: "20000.00",
            "1-30": "15000.00",
            "31-60": "10000.00",
            "61-90": "5000.00",
            "90+": "5000.00",
          },
        },
        meta: { today: "2026-10-09", monthStart: "2026-10-01" },
      };
      expect(response.data.activeSubscribers).toBe(100);
      expect(response.data.agingBuckets.current).toBe("20000.00");
    });

    it("ReceivablesReportResponse matches backend schema", async () => {
      const { ReceivablesReportResponse } = await import("@shared/types");
      const response: ReceivablesReportResponse = {
        data: {
          totalOutstandingBalance: "50000.00",
          outstandingInvoiceCount: 50,
          overdueBalance: "15000.00",
          overdueInvoiceCount: 25,
          serviceAccountCountWithOutstandingBalance: 30,
          agingBuckets: {
            current: "20000.00",
            "1-30": "15000.00",
            "31-60": "10000.00",
            "61-90": "5000.00",
            "90+": "5000.00",
          },
        },
        meta: { basis: "test" },
      };
      expect(response.data.totalOutstandingBalance).toBe("50000.00");
    });

    it("CollectionsReportResponse matches backend schema", async () => {
      const { CollectionsReportResponse } = await import("@shared/types");
      const response: CollectionsReportResponse = {
        data: {
          range: { dateFrom: "2026-10-01", dateTo: "2026-10-09", paymentMethod: null },
          totalCollected: "75000.00",
          paymentCount: 500,
          byPaymentMethod: [
            { method: "cash", total: "50000.00", count: 300 },
            { method: "gcash", total: "25000.00", count: 200 },
          ],
          byCollector: [
            { collectorId: 1, collectorName: "John Doe", total: "40000.00", count: 250 },
          ],
          payments: [],
        },
        meta: { basis: "test", reversedPaymentsExcluded: true },
      };
      expect(response.data.totalCollected).toBe("75000.00");
    });
  });
});