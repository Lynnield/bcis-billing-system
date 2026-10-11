import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { useToast } from "@/lib/toast";
import { useAuth } from "@/lib/auth-context";
import { adjustInvoice, finalizeInvoice, getInvoiceById, voidInvoice } from "@/lib/invoice-api";
import { invoiceStatusBadge, invoiceStatusLabel } from "./invoice-status";
import { ArrowLeft, Ban, CheckCircle2, Loader2, Printer, SlidersHorizontal } from "lucide-react";

// Matches api/src/routes/invoices.ts. The backend is authoritative; these
// only decide which buttons are enabled.
const WRITE_ROLES = ["Owner / Super Admin", "Administrator"];
const ADJUST_ROLES = ["Owner / Super Admin", "Administrator", "Accounting / Auditor"];

interface InvoiceDetailProps {
  invoiceId: number;
  onBack: () => void;
}

export function InvoiceDetail({ invoiceId, onBack }: InvoiceDetailProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { success: showSuccess, error: showError } = useToast();
  const [voidOpen, setVoidOpen] = React.useState(false);
  const [voidReason, setVoidReason] = React.useState("");
  const [adjustOpen, setAdjustOpen] = React.useState(false);
  const [adjType, setAdjType] = React.useState<"debit" | "credit">("credit");
  const [adjAmount, setAdjAmount] = React.useState("");
  const [adjReason, setAdjReason] = React.useState("");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: () => getInvoiceById(invoiceId),
  });
  const invoice = data?.data;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["invoice", invoiceId] });
    queryClient.invalidateQueries({ queryKey: ["invoices"] });
  };
  const onError = (title: string) => (err: unknown) =>
    showError(title, err instanceof Error ? err.message : "Request failed");

  const finalizeMutation = useMutation({
    mutationFn: () => finalizeInvoice(invoiceId),
    onSuccess: () => {
      showSuccess("Invoice finalized");
      refresh();
    },
    onError: onError("Finalize failed"),
  });

  const voidMutation = useMutation({
    mutationFn: (reason: string) => voidInvoice(invoiceId, reason),
    onSuccess: () => {
      showSuccess("Invoice voided");
      setVoidOpen(false);
      setVoidReason("");
      refresh();
    },
    onError: onError("Void failed"),
  });

  const adjustMutation = useMutation({
    mutationFn: () => adjustInvoice(invoiceId, { type: adjType, amount: adjAmount.trim(), reason: adjReason.trim() }),
    onSuccess: () => {
      showSuccess("Adjustment posted");
      setAdjustOpen(false);
      setAdjAmount("");
      setAdjReason("");
      refresh();
    },
    onError: onError("Adjustment failed"),
  });

  const canWrite = !!user && user.roles.some((r) => WRITE_ROLES.includes(r));
  const canAdjust = !!user && user.roles.some((r) => ADJUST_ROLES.includes(r));

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading invoice…
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
          <p className="font-medium text-destructive">Failed to load invoice</p>
          <p className="text-sm text-muted-foreground mt-1">{error instanceof Error ? error.message : "Invoice not found"}</p>
          <Button onClick={() => refetch()} className="mt-4" variant="outline">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const isVoid = invoice.status === "void";
  const isDraft = invoice.status === "draft";
  const submitVoid = () => {
    if (voidMutation.isPending) return;
    if (!voidReason.trim()) {
      showError("Reason required", "A reason is required to void an invoice.");
      return;
    }
    voidMutation.mutate(voidReason.trim());
  };
  const submitAdjust = () => {
    if (adjustMutation.isPending) return;
    if (!/^\d+(\.\d{1,2})?$/.test(adjAmount.trim()) || !adjReason.trim()) {
      showError("Check the form", "Enter an amount (up to 2 decimals) and a reason.");
      return;
    }
    adjustMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Invoices
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          {isDraft && (
            <Button onClick={() => finalizeMutation.mutate()} disabled={!canWrite || finalizeMutation.isPending}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {finalizeMutation.isPending ? "Finalizing…" : "Finalize"}
            </Button>
          )}
          {!isVoid && (
            <Button variant="outline" onClick={() => setAdjustOpen(true)} disabled={!canAdjust}>
              <SlidersHorizontal className="mr-2 h-4 w-4" />
              Adjust
            </Button>
          )}
          {!isVoid && (
            <Button variant="destructive" onClick={() => setVoidOpen(true)} disabled={!canAdjust}>
              <Ban className="mr-2 h-4 w-4" />
              Void
            </Button>
          )}
          {!isDraft && (
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-baseline gap-3">
        <h2 className="text-2xl font-semibold font-mono">{invoice.invoiceNumber}</h2>
        <Badge variant={invoiceStatusBadge[invoice.status]}>{invoiceStatusLabel[invoice.status]}</Badge>
      </div>

      {isVoid && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">This invoice is void and no longer counts toward receivables.</p>
          <p className="text-muted-foreground mt-1">
            Reason: {invoice.voidReason ?? "—"}
            {invoice.voidedAt ? ` · Voided ${new Date(invoice.voidedAt).toLocaleString()}` : ""}
          </p>
        </div>
      )}
      {isDraft && (
        <div className="rounded-lg border border-warning/40 bg-warning/5 p-4 text-sm">
          This is a draft. It is not billed and does not appear on the ledger or in receivables until it is finalized.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Subscriber</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-medium">{invoice.context.firstName} {invoice.context.lastName}</p>
            <p className="text-muted-foreground font-mono">{invoice.context.accountNumber}</p>
            <p className="text-muted-foreground">Service <span className="font-mono">{invoice.context.serviceNumber}</span></p>
            <p className="text-muted-foreground">{invoice.context.serviceName} · {invoice.context.planName}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Billing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>Period: <span className="font-medium">{invoice.context.periodLabel}</span></p>
            <p>Issued: <span className="font-medium">{invoice.issueDate.slice(0, 10)}</span></p>
            <p>Due: <span className="font-medium">{invoice.dueDate.slice(0, 10)}</span></p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Total</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="text-2xl font-semibold tabular-nums">₱{invoice.totalAmount}</p>
            <p className="text-muted-foreground tabular-nums">Lines ₱{invoice.subtotal} · Adjustments ₱{invoice.adjustmentsTotal}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Line Items</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.lineItems.map((li) => (
                <TableRow key={li.id}>
                  <TableCell>{li.description}</TableCell>
                  <TableCell className="text-right tabular-nums">{li.quantity}</TableCell>
                  <TableCell className="text-right tabular-nums">{li.unitPrice}</TableCell>
                  <TableCell className="text-right tabular-nums">{li.amount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Adjustments</CardTitle>
        </CardHeader>
        <CardContent>
          {invoice.adjustments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No adjustments.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoice.adjustments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{new Date(a.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Badge variant={a.type === "credit" ? "success" : "warning"}>{a.type === "credit" ? "Credit" : "Debit"}</Badge>
                    </TableCell>
                    <TableCell>{a.reason}</TableCell>
                    <TableCell className="text-right tabular-nums">{a.type === "credit" ? "−" : ""}{a.amount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Modal
        open={voidOpen}
        onClose={() => !voidMutation.isPending && setVoidOpen(false)}
        title="Void Invoice"
        description="The invoice stays in history but is removed from receivables. An invoice with posted payments must have those payments reversed first."
        footer={
          <>
            <Button variant="outline" onClick={() => setVoidOpen(false)} disabled={voidMutation.isPending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={submitVoid} disabled={voidMutation.isPending}>
              {voidMutation.isPending ? "Voiding…" : "Confirm Void"}
            </Button>
          </>
        }
      >
        <Textarea
          label="Reason *"
          value={voidReason}
          onChange={(e) => setVoidReason(e.target.value)}
          placeholder="e.g. Billed in error — account was disconnected"
          disabled={voidMutation.isPending}
        />
      </Modal>

      <Modal
        open={adjustOpen}
        onClose={() => !adjustMutation.isPending && setAdjustOpen(false)}
        title="Adjust Invoice"
        description="A debit adds to the invoice; a credit reduces it. The change is recorded with your name and reason and shown on the ledger as its own line."
        footer={
          <>
            <Button variant="outline" onClick={() => setAdjustOpen(false)} disabled={adjustMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={submitAdjust} disabled={adjustMutation.isPending}>
              {adjustMutation.isPending ? "Posting…" : "Post Adjustment"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Select
            label="Type *"
            value={adjType}
            onChange={(e) => setAdjType(e.target.value as "debit" | "credit")}
            options={[
              { value: "credit", label: "Credit (reduce amount due)" },
              { value: "debit", label: "Debit (add a charge)" },
            ]}
          />
          <Input label="Amount (₱) *" inputMode="decimal" value={adjAmount} onChange={(e) => setAdjAmount(e.target.value)} placeholder="0.00" />
          <Textarea label="Reason *" value={adjReason} onChange={(e) => setAdjReason(e.target.value)} placeholder="e.g. Outage credit for 3 days" />
        </div>
      </Modal>
    </div>
  );
}
