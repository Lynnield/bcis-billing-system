import type { InvoiceStatus } from "@/shared/types";

type BadgeVariant = "default" | "success" | "warning" | "destructive" | "secondary" | "outline";

// Badges always show the text label next to the colour (spec 4.1: status
// indicators use text + colour, never colour alone).
export const invoiceStatusBadge: Record<InvoiceStatus, BadgeVariant> = {
  draft: "outline",
  unpaid: "warning",
  partially_paid: "default",
  paid: "success",
  overdue: "destructive",
  void: "secondary",
  credited: "success",
};

export const invoiceStatusLabel: Record<InvoiceStatus, string> = {
  draft: "Draft",
  unpaid: "Unpaid",
  partially_paid: "Partially Paid",
  paid: "Paid",
  overdue: "Overdue",
  void: "Void",
  credited: "Credited",
};
