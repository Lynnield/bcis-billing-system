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

export const NAV_ITEMS: NavItem[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    iconName: "LayoutDashboard",
    roles: [],
  },
  {
    key: "subscribers",
    label: "Subscribers",
    iconName: "Users",
    roles: ["Owner / Super Admin", "Administrator", "Technician", "Cashier"],
  },
  {
    key: "service-accounts",
    label: "Service Accounts",
    iconName: "CreditCard",
    roles: ["Owner / Super Admin", "Administrator", "Technician", "Cashier"],
  },
  {
    key: "services",
    label: "Services & Plans",
    iconName: "Server",
    roles: ["Owner / Super Admin", "Administrator", "Technician"],
    children: [
      {
        key: "services-list",
        label: "Services",
        roles: ["Owner / Super Admin", "Administrator", "Technician"],
      },
    ],
  },
  {
    key: "billing-invoices",
    label: "Billing & Invoices",
    iconName: "FileText",
    roles: ["Owner / Super Admin", "Administrator", "Accounting / Auditor", "Cashier"],
    children: [
      {
        key: "invoices",
        label: "Invoices",
        roles: ["Owner / Super Admin", "Administrator", "Accounting / Auditor", "Cashier"],
      },
      {
        key: "billing-periods",
        label: "Billing Periods",
        roles: ["Owner / Super Admin", "Administrator", "Accounting / Auditor", "Cashier"],
      },
    ],
  },
  {
    key: "payments",
    label: "Payments",
    iconName: "DollarSign",
    roles: ["Owner / Super Admin", "Administrator", "Cashier", "Collection Supervisor"],
  },
  {
    key: "gcash-verification",
    label: "GCash Verification",
    iconName: "ShieldCheck",
    // Matches api/src/routes/payments.ts VERIFY_ROLES exactly — the backend
    // is authoritative; this only controls whether the nav item/queue is
    // shown, not whether an action succeeds.
    roles: ["Owner / Super Admin", "Administrator", "Accounting / Auditor"],
  },
  {
    key: "collections",
    label: "Collections",
    iconName: "Truck",
    roles: ["Owner / Super Admin", "Administrator", "Collection Supervisor", "Cashier"],
  },
  {
    key: "receivables",
    label: "Receivables",
    iconName: "BarChart3",
    roles: ["Owner / Super Admin", "Administrator", "Accounting / Auditor", "Cashier"],
  },
  {
    key: "reports",
    label: "Reports",
    iconName: "BarChart3",
    roles: ["Owner / Super Admin", "Administrator", "Accounting / Auditor", "Collection Supervisor"],
  },
  {
    key: "collection-areas",
    label: "Collection Areas",
    iconName: "MapPin",
    roles: ["Owner / Super Admin", "Administrator", "Collection Supervisor"],
  },
  {
    key: "user-management",
    label: "User Management",
    iconName: "Settings",
    roles: ["Owner / Super Admin", "Administrator"],
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
  return NAV_ITEMS.filter((item) => canAccessNavItem(user, item));
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