import type { CollectionBatchStatus } from "@/shared/types";

type BadgeVariant = "default" | "success" | "warning" | "secondary" | "outline" | "destructive";

export const batchStatusBadge: Record<CollectionBatchStatus, BadgeVariant> = {
  open: "outline",
  in_progress: "default",
  submitted: "warning",
  remitted: "warning",
  reconciled: "success",
  closed: "secondary",
};

export const batchStatusLabel: Record<CollectionBatchStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  submitted: "Submitted",
  remitted: "Remitted",
  reconciled: "Reconciled",
  closed: "Closed",
};
