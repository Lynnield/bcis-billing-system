/**
 * Role-based navigation visibility utilities.
 * Maps navigation items to the minimum roles required to access them.
 * This is a client-side convenience only — API authorization is enforced by the backend.
 */

import type { AuthUser } from "@/lib/api-client";

export interface NavItem {
  key: string;
  label: string;
  iconName?: string;
  href?: string;
  roles?: string[];
  children?: NavItem[];
}

const OWNER = "Owner / Super Admin";
const ADMIN = "Administrator";
const CASHIER = "Cashier";
const SUPERVISOR = "Collection Supervisor";
const AUDITOR = "Accounting / Auditor";
const TECHNICIAN = "Technician";
const VIEWER = "Read-only Viewer";

// Spec 4.2 navigation tree. Every child key is a route path registered in
// App.tsx (Sidebar renders <NavLink to={key}>). Role lists mirror the API
// route guards in api/src/routes/*.ts — the API is the authority; these only
// decide what is shown.
export const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", label: "Dashboard", iconName: "LayoutDashboard", roles: [] },
  {
    key: "subscribers-group",
    label: "Subscribers",
    iconName: "Users",
    roles: [OWNER, ADMIN, TECHNICIAN, CASHIER],
    children: [
      { key: "subscribers", label: "All Subscribers", roles: [OWNER, ADMIN, TECHNICIAN, CASHIER] },
      // api/src/routes/subscribers.ts WRITE_ROLES
      { key: "subscribers/new", label: "New Subscriber", roles: [OWNER, ADMIN] },
      { key: "service-accounts", label: "Service Accounts", roles: [OWNER, ADMIN, TECHNICIAN, CASHIER] },
    ],
  },
  {
    key: "billing-group",
    label: "Billing",
    iconName: "FileText",
    roles: [OWNER, ADMIN, AUDITOR, CASHIER],
    children: [
      { key: "billing/current", label: "Current Billing", roles: [OWNER, ADMIN, AUDITOR, CASHIER] },
      // api/src/routes/billing-periods.ts WRITE_ROLES
      { key: "billing-periods", label: "Generate Billing", roles: [OWNER, ADMIN] },
      { key: "billing-invoices", label: "Invoices", roles: [OWNER, ADMIN, AUDITOR, CASHIER] },
    ],
  },
  {
    key: "payments-group",
    label: "Payments",
    iconName: "DollarSign",
    roles: [OWNER, ADMIN, CASHIER, SUPERVISOR, AUDITOR],
    children: [
      // api/src/routes/payments.ts POST_ROLES
      { key: "receive-payment", label: "Receive Payment", roles: [OWNER, ADMIN, CASHIER] },
      { key: "payments", label: "Payment History", roles: [OWNER, ADMIN, CASHIER, SUPERVISOR, AUDITOR] },
      // api/src/routes/payments.ts VERIFY_ROLES
      { key: "gcash-verification", label: "GCash Verification", roles: [OWNER, ADMIN, AUDITOR] },
    ],
  },
  {
    key: "collections-group",
    label: "Collections",
    iconName: "Truck",
    roles: [OWNER, ADMIN, SUPERVISOR, CASHIER, AUDITOR],
    children: [
      { key: "collections/collectors", label: "Collectors", roles: [OWNER, ADMIN, SUPERVISOR, CASHIER] },
      // api/src/routes/collections.ts MANAGE_ROLES
      { key: "collection-areas", label: "Areas & Routes", roles: [OWNER, ADMIN, SUPERVISOR] },
      { key: "collections", label: "Collection Batches", roles: [OWNER, ADMIN, SUPERVISOR, CASHIER] },
      // api/src/routes/collection-batches.ts REMIT_ROLES
      { key: "collections/remittance", label: "Remittance", roles: [OWNER, ADMIN, SUPERVISOR, AUDITOR] },
    ],
  },
  {
    key: "receivables-group",
    label: "Receivables",
    iconName: "BarChart3",
    roles: [OWNER, ADMIN, AUDITOR, CASHIER, SUPERVISOR],
    children: [
      { key: "receivables/outstanding", label: "Outstanding", roles: [OWNER, ADMIN, AUDITOR, CASHIER, SUPERVISOR] },
      { key: "receivables/overdue", label: "Overdue", roles: [OWNER, ADMIN, AUDITOR, CASHIER, SUPERVISOR] },
      { key: "receivables/aging", label: "Aging", roles: [OWNER, ADMIN, AUDITOR, CASHIER, SUPERVISOR] },
      { key: "receivables/suspension", label: "Suspension Candidates", roles: [OWNER, ADMIN, AUDITOR, SUPERVISOR] },
    ],
  },
  { key: "services", label: "Services", iconName: "Server", roles: [OWNER, ADMIN, TECHNICIAN] },
  // Spec 3.1: Read-only Viewer gets dashboards and reports.
  { key: "reports", label: "Reports", iconName: "Receipt", roles: [OWNER, ADMIN, AUDITOR, SUPERVISOR, VIEWER] },
  {
    key: "administration-group",
    label: "Administration",
    iconName: "Settings",
    roles: [OWNER, ADMIN, SUPERVISOR, AUDITOR],
    children: [
      // api/src/routes/users.ts MANAGE_ROLES — Owner only.
      { key: "user-management", label: "Users", roles: [OWNER] },
      // api/src/routes/settings.ts READ_ROLES
      { key: "settings", label: "Settings", roles: [OWNER, ADMIN, SUPERVISOR] },
      // api/src/routes/audit.ts READ_ROLES
      { key: "audit-log", label: "Audit Log", roles: [OWNER, AUDITOR] },
      // api/src/routes/backup.ts BACKUP_ROLES — Owner only.
      { key: "backup", label: "Backup & Restore", roles: [OWNER] },
    ],
  },
];

/**
 * Check if a user has any of the required roles for a navigation item.
 */
export function canAccessNavItem(user: AuthUser | null, item: NavItem): boolean {
  if (!user) return false;
  if (!item.roles || item.roles.length === 0) return true;
  return user.roles.some((role) => item.roles!.includes(role));
}

/**
 * Filter navigation items based on user's roles.
 */
export function filterNavItems(user: AuthUser | null): NavItem[] {
  const visible: NavItem[] = [];
  for (const item of NAV_ITEMS) {
    if (!canAccessNavItem(user, item)) continue;
    if (!item.children) {
      visible.push(item);
      continue;
    }
    // Each child carries its own role list; a group with nothing left to
    // show is dropped entirely.
    const children = item.children.filter((child) => canAccessNavItem(user, child));
    if (children.length > 0) visible.push({ ...item, children });
  }
  return visible;
}

/** Every clickable route path the user can reach, in menu order. */
export function visibleRouteKeys(user: AuthUser | null): string[] {
  return filterNavItems(user).flatMap((item) => (item.children ? item.children.map((c) => c.key) : [item.key]));
}

/**
 * Get user's primary role for display purposes.
 */
export function getPrimaryRole(user: AuthUser | null): string {
  if (!user || user.roles.length === 0) return "No Role";
  const priority = [
    "Owner / Super Admin",
    "Administrator",
    "Collection Supervisor",
    "Accounting / Auditor",
    "Cashier",
    "Technician",
    "Read-only Viewer",
  ];
  for (const role of priority) {
    if (user.roles.includes(role)) return role;
  }
  return user.roles[0];
}