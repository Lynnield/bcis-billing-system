import { and, eq, inArray } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { db } from "../db";
import { permissions, rolePermissions, roles } from "../db/schema";
import { ROLE_NAMES } from "./roles";

// Spec 4.4 / 5: granular permissions. Routes are guarded by a permission
// code; which roles hold which permission is data (role_permissions), edited
// by the Owner. The defaults below reproduce the spec 3.1 role matrix.

const OWNER = ROLE_NAMES.OWNER;
const ADMIN = ROLE_NAMES.ADMINISTRATOR;
const CASHIER = ROLE_NAMES.CASHIER;
const SUPERVISOR = ROLE_NAMES.COLLECTION_SUPERVISOR;
const AUDITOR = ROLE_NAMES.ACCOUNTING_AUDITOR;
const TECHNICIAN = ROLE_NAMES.TECHNICIAN;
const VIEWER = ROLE_NAMES.READ_ONLY_VIEWER;

const EVERYONE = [OWNER, ADMIN, CASHIER, SUPERVISOR, AUDITOR, TECHNICIAN, VIEWER];
// Financial read access: everyone except the Technician (spec 3.1:
// service and suspension/reconnection information only).
const FINANCIAL_READERS = [OWNER, ADMIN, CASHIER, SUPERVISOR, AUDITOR, VIEWER];
// Spec 3.1: management reports for the Owner, Administrator, Accounting,
// Collection Supervisor and Read-only Viewer (not the Cashier).
const REPORT_READERS = [OWNER, ADMIN, SUPERVISOR, AUDITOR, VIEWER];

export const PERMISSIONS = {
  "subscriber.view": { group: "Subscribers", description: "View subscribers", defaults: EVERYONE },
  "subscriber.manage": { group: "Subscribers", description: "Create and edit subscribers, change status", defaults: [OWNER, ADMIN] },
  "plan.view": { group: "Services", description: "View services and plans", defaults: EVERYONE },
  "plan.manage": { group: "Services", description: "Create and edit services and plans (prices)", defaults: [OWNER, ADMIN] },
  "service_account.view": { group: "Services", description: "View service accounts and service history", defaults: EVERYONE },
  "service_account.manage": { group: "Services", description: "Create and edit service accounts, plan, rate and status", defaults: [OWNER, ADMIN] },
  "service.suspend": { group: "Service control", description: "Suspend a service account", defaults: [OWNER, ADMIN, SUPERVISOR] },
  "service.reconnect": { group: "Service control", description: "Request a reconnection", defaults: [OWNER, ADMIN, SUPERVISOR] },
  "service.reconnect_complete": { group: "Service control", description: "Mark a reconnection completed", defaults: [OWNER, ADMIN, SUPERVISOR, TECHNICIAN] },
  "service.reconnect_override": { group: "Service control", description: "Reconnect despite an overdue balance", defaults: [OWNER, ADMIN] },
  "billing.view": { group: "Billing", description: "View billing periods and invoices", defaults: FINANCIAL_READERS },
  "billing.generate": { group: "Billing", description: "Create billing periods, generate and finalize invoices", defaults: [OWNER, ADMIN] },
  "invoice.void": { group: "Billing", description: "Void an invoice", defaults: [OWNER, ADMIN, AUDITOR] },
  "invoice.adjust": { group: "Billing", description: "Post a debit/credit adjustment", defaults: [OWNER, ADMIN, AUDITOR] },
  "payment.view": { group: "Payments", description: "View payments and receipts", defaults: FINANCIAL_READERS },
  "payment.create": { group: "Payments", description: "Receive payments, issue receipts, upload proofs", defaults: [OWNER, ADMIN, CASHIER] },
  "payment.verify_gcash": { group: "Payments", description: "Verify or reject GCash submissions", defaults: [OWNER, ADMIN, AUDITOR] },
  "payment.reverse": { group: "Payments", description: "Reverse a posted payment", defaults: [OWNER, ADMIN, AUDITOR] },
  "payment_proof.view": { group: "Payments", description: "View uploaded payment proofs", defaults: [OWNER, ADMIN, CASHIER, SUPERVISOR, AUDITOR] },
  "collection.view": { group: "Collections", description: "View areas, collectors, batches and route sheets", defaults: EVERYONE.filter((r) => r !== TECHNICIAN) },
  "collection.manage_routes": { group: "Collections", description: "Manage areas, collectors and account assignments", defaults: [OWNER, ADMIN, SUPERVISOR] },
  "collection.manage_batches": { group: "Collections", description: "Open batches, record collections, submit", defaults: [OWNER, ADMIN, CASHIER, SUPERVISOR] },
  "collection.reconcile": { group: "Collections", description: "Record remittance and reconcile batches", defaults: [OWNER, ADMIN, SUPERVISOR, AUDITOR] },
  "collection.close": { group: "Collections", description: "Close a reconciled batch", defaults: [OWNER, ADMIN, SUPERVISOR] },
  "receivable.view": { group: "Receivables", description: "View outstanding, overdue, aging and suspension candidates", defaults: FINANCIAL_READERS },
  "dashboard.view": { group: "Reports", description: "View the dashboard KPIs", defaults: EVERYONE },
  "report.view": { group: "Reports", description: "View management reports, ledgers and statements", defaults: [...REPORT_READERS, CASHIER] },
  "report.export": { group: "Reports", description: "Export reports to PDF/XLSX", defaults: [...REPORT_READERS, CASHIER] },
  "report.management": { group: "Reports", description: "Run the management report catalog (spec 3.11)", defaults: REPORT_READERS },
  "report.financial_corrections": { group: "Reports", description: "Reversal, void and voided-receipt reports", defaults: [OWNER, ADMIN, AUDITOR] },
  "audit.view": { group: "Administration", description: "View the audit trail and user activity", defaults: [OWNER, AUDITOR] },
  "search.financial": { group: "Administration", description: "Find invoices, receipts and GCash references in search", defaults: FINANCIAL_READERS },
  "settings.view": { group: "Administration", description: "View collection settings", defaults: [OWNER, ADMIN, SUPERVISOR] },
  "settings.manage": { group: "Administration", description: "Change grace period and suspension threshold", defaults: [OWNER, ADMIN] },
  "user.view": { group: "Administration", description: "View users and roles", defaults: [OWNER, ADMIN] },
  "user.manage": { group: "Administration", description: "Create users, assign roles, reset passwords, edit permissions", defaults: [OWNER] },
  "backup.manage": { group: "Administration", description: "Create and verify backups", defaults: [OWNER] },
  "backup.restore": { group: "Administration", description: "Restore the database from a backup", defaults: [OWNER] },
} as const satisfies Record<string, { group: string; description: string; defaults: readonly string[] }>;

export type PermissionCode = keyof typeof PERMISSIONS;
export const PERMISSION_CODES = Object.keys(PERMISSIONS) as PermissionCode[];

/**
 * Ensure every catalog permission exists. Default role grants are applied
 * only when a permission row is first created, so the Owner's later edits to
 * the matrix are never undone by a restart.
 */
export async function syncPermissions(): Promise<void> {
  const roleRows = await db.select().from(roles);
  // Before roles are seeded there is nobody to grant to; wait for the next
  // start rather than creating permissions without their defaults.
  if (roleRows.length === 0) return;
  const roleIdByName = new Map(roleRows.map((r) => [r.name, r.id]));
  for (const code of PERMISSION_CODES) {
    const def = PERMISSIONS[code];
    const [created] = await db
      .insert(permissions)
      .values({ code, groupName: def.group, description: def.description })
      .onConflictDoNothing({ target: permissions.code })
      .returning({ id: permissions.id });
    if (!created) continue;
    const grants = def.defaults.map((r) => roleIdByName.get(r)).filter((id): id is number => id !== undefined);
    if (grants.length) {
      await db.insert(rolePermissions).values(grants.map((roleId) => ({ roleId, permissionId: created.id }))).onConflictDoNothing();
    }
  }
}

export async function loadPermissionsForRoles(roleNames: string[]): Promise<string[]> {
  if (roleNames.length === 0) return [];
  const rows = await db
    .selectDistinct({ code: permissions.code })
    .from(rolePermissions)
    .innerJoin(roles, eq(roles.id, rolePermissions.roleId))
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(inArray(roles.name, roleNames));
  return rows.map((r) => r.code);
}

export function hasPermission(request: FastifyRequest, code: PermissionCode): boolean {
  return !!request.currentUser?.permissions.includes(code);
}

/** Route guard: the caller's roles must grant this permission (server-side, spec 4.4). */
export function requirePermission(code: PermissionCode) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.currentUser) return reply.code(401).send({ message: "Authentication required" });
    if (!hasPermission(request, code)) {
      return reply.code(403).send({ message: "You do not have permission to access this resource", requiredPermission: code });
    }
  };
}

export async function roleHasPermission(roleId: number, code: PermissionCode): Promise<boolean> {
  const [row] = await db
    .select({ id: rolePermissions.roleId })
    .from(rolePermissions)
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(and(eq(rolePermissions.roleId, roleId), eq(permissions.code, code)))
    .limit(1);
  return !!row;
}
