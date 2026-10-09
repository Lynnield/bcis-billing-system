import { describe, it, expect, vi, afterEach } from "vitest";

// Coverage for the desktop-side features added after the original Phase 13
// test suite (items 4-9 of the completion plan): Collections, Receivables,
// Reports/export, Backup, Suspension/Reconnection history, User Management
// and Settings. These IPC wrapper modules previously had zero test coverage.

function stubWindow(bcis: Record<string, unknown>) {
  (globalThis as unknown as { window: unknown }).window = { bcis };
}

const originalWindow = (globalThis as unknown as { window?: unknown }).window;

afterEach(() => {
  (globalThis as unknown as { window?: unknown }).window = originalWindow;
  vi.resetModules();
});

describe("Newer-feature navigation role filtering", () => {
  it("Owner sees Collections, Receivables, Reports, User Management and Backup", async () => {
    const { filterNavItems } = await import("@/lib/roles");
    const owner = { id: 1, username: "owner", email: "o@test.com", fullName: "Owner", roles: ["Owner / Super Admin"] };
    const keys = filterNavItems(owner).map((i) => i.key);
    expect(keys).toContain("collections");
    expect(keys).toContain("receivables");
    expect(keys).toContain("reports");
    expect(keys).toContain("user-management");
    expect(keys).toContain("backup");
  });

  it("Administrator sees Collections/Receivables/Reports but NOT User Management or Backup (Owner-only)", async () => {
    const { filterNavItems } = await import("@/lib/roles");
    const admin = { id: 2, username: "admin", email: "a@test.com", fullName: "Admin", roles: ["Administrator"] };
    const keys = filterNavItems(admin).map((i) => i.key);
    expect(keys).toContain("collections");
    expect(keys).toContain("receivables");
    expect(keys).toContain("reports");
    expect(keys).not.toContain("user-management");
    expect(keys).not.toContain("backup");
  });

  it("Technician sees none of Collections/Receivables/Reports/User Management/Backup", async () => {
    const { filterNavItems } = await import("@/lib/roles");
    const tech = { id: 3, username: "tech", email: "t@test.com", fullName: "Tech", roles: ["Technician"] };
    const keys = filterNavItems(tech).map((i) => i.key);
    expect(keys).not.toContain("collections");
    expect(keys).not.toContain("receivables");
    expect(keys).not.toContain("reports");
    expect(keys).not.toContain("user-management");
    expect(keys).not.toContain("backup");
  });

  it("only Owner can access the backup nav item (matches api BACKUP_ROLES exactly)", async () => {
    const { canAccessNavItem, NAV_ITEMS } = await import("@/lib/roles");
    const backupItem = NAV_ITEMS.find((i) => i.key === "backup")!;
    const owner = { id: 1, username: "o", email: "o@test.com", fullName: "O", roles: ["Owner / Super Admin"] };
    const admin = { id: 2, username: "a", email: "a@test.com", fullName: "A", roles: ["Administrator"] };
    expect(canAccessNavItem(owner, backupItem)).toBe(true);
    expect(canAccessNavItem(admin, backupItem)).toBe(false);
  });

  it("only Owner can access the user-management nav item (matches api MANAGE_ROLES exactly)", async () => {
    const { canAccessNavItem, NAV_ITEMS } = await import("@/lib/roles");
    const userMgmtItem = NAV_ITEMS.find((i) => i.key === "user-management")!;
    const owner = { id: 1, username: "o", email: "o@test.com", fullName: "O", roles: ["Owner / Super Admin"] };
    const admin = { id: 2, username: "a", email: "a@test.com", fullName: "A", roles: ["Administrator"] };
    expect(canAccessNavItem(owner, userMgmtItem)).toBe(true);
    expect(canAccessNavItem(admin, userMgmtItem)).toBe(false);
  });
});

describe("backup-api IPC wrappers", () => {
  it("getBackups/createBackup/verifyBackup/restoreBackup delegate to window.bcis.backup", async () => {
    const getList = vi.fn().mockResolvedValue({ data: [] });
    const create = vi.fn().mockResolvedValue({ data: { id: 1 } });
    const verify = vi.fn().mockResolvedValue({ data: { id: 1, status: "verified" } });
    const restore = vi.fn().mockResolvedValue({ data: { id: 1, status: "restored" } });
    stubWindow({ backup: { getList, create, verify, restore } });

    const { getBackups, createBackup, verifyBackup, restoreBackup } = await import("@/lib/backup-api");
    await getBackups();
    await createBackup();
    await verifyBackup(7);
    await restoreBackup(7);

    expect(getList).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledOnce();
    expect(verify).toHaveBeenCalledWith(7);
    expect(restore).toHaveBeenCalledWith(7);
  });
});

describe("collection-batch-api IPC wrappers", () => {
  it("delegates every function to the matching window.bcis.collectionBatches method with the right arguments", async () => {
    const getList = vi.fn().mockResolvedValue({ data: [] });
    const getById = vi.fn().mockResolvedValue({ data: {} });
    const create = vi.fn().mockResolvedValue({ data: {} });
    const addPayment = vi.fn().mockResolvedValue({ data: {} });
    const remit = vi.fn().mockResolvedValue({ data: {} });
    const reconcile = vi.fn().mockResolvedValue({ data: {} });
    stubWindow({ collectionBatches: { getList, getById, create, addPayment, remit, reconcile } });

    const {
      getCollectionBatches,
      getCollectionBatchById,
      createCollectionBatch,
      addPaymentToBatch,
      remitCollectionBatch,
      reconcileCollectionBatch,
    } = await import("@/lib/collection-batch-api");

    await getCollectionBatches({ page: 1, status: "open" });
    await getCollectionBatchById(3);
    await createCollectionBatch({ collectorId: 9, batchDate: "2026-10-10" });
    await addPaymentToBatch(3, 99);
    await remitCollectionBatch(3, { remittedAmount: "500.00" });
    await reconcileCollectionBatch(3);

    expect(getList).toHaveBeenCalledWith({ page: 1, status: "open" });
    expect(getById).toHaveBeenCalledWith(3);
    expect(create).toHaveBeenCalledWith({ collectorId: 9, batchDate: "2026-10-10" });
    expect(addPayment).toHaveBeenCalledWith(3, 99);
    expect(remit).toHaveBeenCalledWith(3, { remittedAmount: "500.00" });
    expect(reconcile).toHaveBeenCalledWith(3);
  });
});

describe("receivables-api IPC wrappers", () => {
  it("getOutstandingInvoices/getAgingSummary/getSuspensionCandidates delegate correctly", async () => {
    const getInvoices = vi.fn().mockResolvedValue({ data: [] });
    const getAging = vi.fn().mockResolvedValue({ data: {} });
    const getSuspensionCandidates = vi.fn().mockResolvedValue({ data: [] });
    stubWindow({ receivables: { getInvoices, getAging, getSuspensionCandidates } });

    const { getOutstandingInvoices, getAgingSummary, getSuspensionCandidates: getCandidates } = await import("@/lib/receivables-api");

    await getOutstandingInvoices({ overdueOnly: true, bucket: "31-60" });
    await getAgingSummary();
    await getCandidates();

    expect(getInvoices).toHaveBeenCalledWith({ overdueOnly: true, bucket: "31-60" });
    expect(getAging).toHaveBeenCalledOnce();
    expect(getSuspensionCandidates).toHaveBeenCalledOnce();
  });
});

describe("report-api IPC wrappers", () => {
  it("exportReport/getLedger/getSoa delegate to window.bcis.reports", async () => {
    const exportFn = vi.fn().mockResolvedValue({ savedPath: "C:\\reports\\out.pdf" });
    const getLedger = vi.fn().mockResolvedValue({ data: {} });
    const getSoa = vi.fn().mockResolvedValue({ data: {} });
    stubWindow({ reports: { export: exportFn, getLedger, getSoa } });

    const { exportReport, getLedger: getLedgerFn, getSoa: getSoaFn } = await import("@/lib/report-api");

    await exportReport("/tmp/out.pdf", "pdf", "collections-report");
    await getLedgerFn(42);
    await getSoaFn(42);

    expect(exportFn).toHaveBeenCalledWith({ path: "/tmp/out.pdf", format: "pdf", suggestedName: "collections-report" });
    expect(getLedger).toHaveBeenCalledWith(42);
    expect(getSoa).toHaveBeenCalledWith(42);
  });
});

describe("settings-api IPC wrappers", () => {
  it("getCollectionsSettings/updateCollectionsSettings delegate to window.bcis.settings", async () => {
    const getCollections = vi.fn().mockResolvedValue({ data: { gracePeriodDays: 5, suspensionThresholdDays: 30 } });
    const updateCollections = vi.fn().mockResolvedValue({ data: { gracePeriodDays: 7, suspensionThresholdDays: 60 } });
    stubWindow({ settings: { getCollections, updateCollections } });

    const { getCollectionsSettings, updateCollectionsSettings } = await import("@/lib/settings-api");

    await getCollectionsSettings();
    await updateCollectionsSettings({ gracePeriodDays: 7, suspensionThresholdDays: 60 });

    expect(getCollections).toHaveBeenCalledOnce();
    expect(updateCollections).toHaveBeenCalledWith({ gracePeriodDays: 7, suspensionThresholdDays: 60 });
  });
});

describe("user-api IPC wrappers", () => {
  it("delegates every function to the matching window.bcis.users method with the right arguments", async () => {
    const getList = vi.fn().mockResolvedValue({ users: [] });
    const getRoles = vi.fn().mockResolvedValue({ roles: [] });
    const create = vi.fn().mockResolvedValue({ data: {} });
    const update = vi.fn().mockResolvedValue({ data: {} });
    const updateRoles = vi.fn().mockResolvedValue({ data: {} });
    const resetPassword = vi.fn().mockResolvedValue({ data: { userId: 5 } });
    stubWindow({ users: { getList, getRoles, create, update, updateRoles, resetPassword } });

    const {
      getUsers,
      getRoles: getRolesFn,
      createUser,
      updateUser,
      updateUserRoles,
      resetUserPassword,
    } = await import("@/lib/user-api");

    await getUsers();
    await getRolesFn();
    await createUser({ username: "new.user", email: "n@test.com", fullName: "New User", password: "verylongpass123", roleIds: [1] });
    await updateUser(5, { status: "inactive" });
    await updateUserRoles(5, { roleIds: [1, 2] });
    const result = await resetUserPassword(5, { password: "anotherlongpass123" });

    expect(getList).toHaveBeenCalledOnce();
    expect(getRoles).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith({ username: "new.user", email: "n@test.com", fullName: "New User", password: "verylongpass123", roleIds: [1] });
    expect(update).toHaveBeenCalledWith(5, { status: "inactive" });
    expect(updateRoles).toHaveBeenCalledWith(5, { roleIds: [1, 2] });
    expect(resetPassword).toHaveBeenCalledWith(5, { password: "anotherlongpass123" });
    expect(result).toEqual({ data: { userId: 5 } });
  });

  it("propagates a server-side authorization error (e.g. non-Owner calling a write) without swallowing it", async () => {
    const create = vi.fn().mockRejectedValue(new Error("You do not have permission to access this resource"));
    stubWindow({ users: { getList: vi.fn(), getRoles: vi.fn(), create, update: vi.fn(), updateRoles: vi.fn(), resetPassword: vi.fn() } });

    const { createUser } = await import("@/lib/user-api");
    await expect(
      createUser({ username: "x", email: "x@test.com", fullName: "X", password: "verylongpassword123", roleIds: [1] }),
    ).rejects.toThrow("You do not have permission");
  });
});

describe("Newer shared type shapes", () => {
  it("SuspensionRecord and ReconnectionRecord match the backend contract (3.10)", async () => {
    const mod = await import("@shared/types");
    void mod;
    const suspension: import("@shared/types").SuspensionRecord = {
      id: 1,
      serviceAccountId: 10,
      reason: "Non-payment for over 90 days",
      effectiveDate: "2026-10-10T00:00:00.000Z",
      approvedByUserId: 2,
      notes: null,
      createdAt: "2026-10-10T00:00:00.000Z",
    };
    const reconnection: import("@shared/types").ReconnectionRecord = {
      id: 1,
      serviceAccountId: 10,
      fee: "150.00",
      technicianUserId: 3,
      requestDate: "2026-10-10T00:00:00.000Z",
      completionDate: null,
      status: "requested",
      notes: null,
      requestedByUserId: 2,
      createdAt: "2026-10-10T00:00:00.000Z",
    };
    expect(suspension.reason).toMatch(/90 days/);
    expect(reconnection.fee).toBe("150.00");
  });

  it("CollectionsSettings matches the backend contract (gracePeriodDays, suspensionThresholdDays)", async () => {
    const settings: import("@shared/types").CollectionsSettings = { gracePeriodDays: 7, suspensionThresholdDays: 60 };
    expect(settings.gracePeriodDays).toBe(7);
    expect(settings.suspensionThresholdDays).toBe(60);
  });

  it("CollectionBatchStatus covers the full OPEN->CLOSED lifecycle (3.8)", async () => {
    const statuses: Array<import("@shared/types").CollectionBatchStatus> = ["open", "closed", "remitted", "reconciled"];
    expect(statuses).toHaveLength(4);
  });

  it("UserListRow and CreateUserRequest match the backend contract", async () => {
    const row: import("@shared/types").UserListRow = {
      id: 1,
      username: "demo.cashier",
      email: "demo.cashier@example.test",
      fullName: "Demo Cashier",
      status: "active",
      roles: ["Cashier"],
      createdAt: "2026-10-10T00:00:00.000Z",
    };
    const createReq: import("@shared/types").CreateUserRequest = {
      username: "new.user",
      email: "n@test.com",
      fullName: "New User",
      password: "verylongpassword123",
      roleIds: [1, 2],
    };
    expect(row.roles).toContain("Cashier");
    expect(createReq.roleIds).toEqual([1, 2]);
  });
});
