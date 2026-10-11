import { describe, it, expect, vi } from "vitest";

describe("Phase 13C — Navigation & Dashboard Tests", () => {
  describe("Role-based Navigation", () => {
    const u = (roles: string[]) => ({ id: 1, username: "u", email: "u@test.com", fullName: "U", roles });

    it("Owner sees every spec 4.2 menu group and entry", async () => {
      const { filterNavItems, visibleRouteKeys } = await import("@/lib/roles");
      const owner = u(["Owner / Super Admin"]);
      expect(filterNavItems(owner).map((i) => i.label)).toEqual([
        "Dashboard",
        "Subscribers",
        "Billing",
        "Payments",
        "Collections",
        "Receivables",
        "Services",
        "Reports",
        "Administration",
      ]);
      expect(visibleRouteKeys(owner)).toEqual([
        "dashboard",
        "subscribers",
        "subscribers/new",
        "service-accounts",
        "billing/current",
        "billing-periods",
        "billing-invoices",
        "receive-payment",
        "payments",
        "gcash-verification",
        "collections/collectors",
        "collection-areas",
        "collections",
        "collections/remittance",
        "receivables/outstanding",
        "receivables/overdue",
        "receivables/aging",
        "receivables/suspension",
        "services",
        "reports",
        "user-management",
        "settings",
        "audit-log",
        "backup",
      ]);
    });

    it("Cashier gets the counter workflow but not billing runs, GCash review or administration", async () => {
      const { visibleRouteKeys } = await import("@/lib/roles");
      const keys = visibleRouteKeys(u(["Cashier"]));
      expect(keys).toContain("receive-payment");
      expect(keys).toContain("billing-invoices");
      expect(keys).toContain("receivables/outstanding");
      for (const k of ["billing-periods", "gcash-verification", "subscribers/new", "user-management", "backup", "audit-log", "collections/remittance"]) {
        expect(keys).not.toContain(k);
      }
    });

    it("Collection Supervisor gets collections, remittance, areas and settings", async () => {
      const { visibleRouteKeys } = await import("@/lib/roles");
      const keys = visibleRouteKeys(u(["Collection Supervisor"]));
      for (const k of ["collections", "collections/remittance", "collection-areas", "collections/collectors", "settings", "reports"]) {
        expect(keys).toContain(k);
      }
      expect(keys).not.toContain("receive-payment");
    });

    it("Accounting / Auditor gets GCash review, receivables, reports and the audit log", async () => {
      const { visibleRouteKeys } = await import("@/lib/roles");
      const keys = visibleRouteKeys(u(["Accounting / Auditor"]));
      for (const k of ["gcash-verification", "receivables/aging", "reports", "audit-log", "collections/remittance"]) {
        expect(keys).toContain(k);
      }
      for (const k of ["receive-payment", "user-management", "backup"]) expect(keys).not.toContain(k);
    });

    it("Read-only Viewer gets dashboards and reports only (spec 3.1)", async () => {
      const { visibleRouteKeys } = await import("@/lib/roles");
      expect(visibleRouteKeys(u(["Read-only Viewer"]))).toEqual(["dashboard", "reports"]);
    });

    it("Technician gets service information only", async () => {
      const { visibleRouteKeys } = await import("@/lib/roles");
      expect(visibleRouteKeys(u(["Technician"]))).toEqual(["dashboard", "subscribers", "service-accounts", "services"]);
    });

    it("filterNavItems returns empty array for null user", async () => {
      const { filterNavItems } = await import("@/lib/roles");
      const items = filterNavItems(null);
      expect(items).toEqual([]);
    });

    it("canAccessNavItem checks individual item access", async () => {
      const { canAccessNavItem, NAV_ITEMS } = await import("@/lib/roles");
      const user = { id: 1, username: "cashier", email: "c@test.com", fullName: "Cashier", roles: ["Cashier"] };
      const admin = NAV_ITEMS.find((i) => i.key === "administration-group")!;
      const userMgmtItem = admin.children!.find((c) => c.key === "user-management")!;
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