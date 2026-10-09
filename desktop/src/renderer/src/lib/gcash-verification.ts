/**
 * GCash verification/rejection permission rules for the renderer UI.
 * Mirrors api/src/routes/payments.ts VERIFY_ROLES and the self-review
 * (separation of duties) check exactly — but this is a UX convenience only.
 * The backend re-validates both rules on every request and is the sole
 * authority; nothing here is a substitute for that.
 */

import type { AuthUser } from "@/lib/api-client";

export const GCASH_VERIFY_ROLES = ["Owner / Super Admin", "Administrator", "Accounting / Auditor"];

export function canVerifyGcashPayments(user: AuthUser | null): boolean {
  return !!user && user.roles.some((role) => GCASH_VERIFY_ROLES.includes(role));
}

export function isOwnGcashSubmission(user: AuthUser | null, postedByUserId: number | null): boolean {
  return !!user && postedByUserId !== null && user.id === postedByUserId;
}

export interface GcashReviewPermission {
  allowed: boolean;
  reason?: string;
}

export function getGcashReviewPermission(user: AuthUser | null, postedByUserId: number | null): GcashReviewPermission {
  if (!canVerifyGcashPayments(user)) {
    return { allowed: false, reason: "Your role does not have permission to verify or reject GCash payments." };
  }
  if (isOwnGcashSubmission(user, postedByUserId)) {
    return { allowed: false, reason: "You cannot verify or reject a GCash payment you submitted yourself." };
  }
  return { allowed: true };
}
