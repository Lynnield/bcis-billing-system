import * as React from "react";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/lib/toast";
import { useAuth } from "@/lib/auth-context";
import { getPaymentById, reversePayment, verifyGcashPayment, rejectGcashPayment } from "@/lib/payment-api";
import { getServiceAccountById } from "@/lib/service-account-api";
import { getInvoiceById } from "@/lib/invoice-api";
import { getGcashReviewPermission } from "@/lib/gcash-verification";
import { ProofViewer } from "./ProofViewer";
import type { PaymentMethod, PaymentStatus, GcashVerificationStatus } from "@/shared/types";
import { ArrowLeft, Receipt, User, FileText, Undo2, Loader2, AlertTriangle, ShieldCheck, ShieldX, Printer } from "lucide-react";

// Only these roles may reverse a posted payment, matching
// api/src/routes/payments.ts REVERSE_ROLES. The backend is the authority —
// this only hides/disables the action in the UI for other roles.
const REVERSE_ROLES = ["Owner / Super Admin", "Administrator", "Accounting / Auditor"];

const paymentStatusBadge: Record<PaymentStatus, "default" | "success" | "warning" | "destructive" | "secondary"> = {
  pending: "warning",
  posted: "success",
  reversed: "destructive",
  cancelled: "secondary",
};

const gcashStatusBadge: Record<GcashVerificationStatus, "default" | "success" | "warning" | "destructive" | "secondary"> = {
  pending: "warning",
  verified: "success",
  rejected: "destructive",
};

const methodLabel: Record<PaymentMethod, string> = {
  cash: "Cash",
  gcash: "GCash",
  bank_transfer: "Bank Transfer",
  cheque: "Cheque",
  other: "Other",
};

interface PaymentDetailProps {
  paymentId: number;
  onBack: () => void;
}

export function PaymentDetail({ paymentId, onBack }: PaymentDetailProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { success: showSuccess, error: showError } = useToast();
  const [reversalOpen, setReversalOpen] = React.useState(false);
  const [reversalReason, setReversalReason] = React.useState("");
  const [verifyOpen, setVerifyOpen] = React.useState(false);
  const [verifyNote, setVerifyNote] = React.useState("");
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [rejectReason, setRejectReason] = React.useState("");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["payment", paymentId],
    queryFn: () => getPaymentById(paymentId),
    enabled: !!paymentId,
  });

  const payment = data?.data;

  const { data: accountData } = useQuery({
    queryKey: ["service-account", payment?.serviceAccountId],
    queryFn: () => getServiceAccountById(payment!.serviceAccountId),
    enabled: !!payment?.serviceAccountId,
  });

  const invoiceQueries = useQueries({
    queries: (payment?.allocations ?? []).map((alloc) => ({
      queryKey: ["invoice", alloc.invoiceId],
      queryFn: () => getInvoiceById(alloc.invoiceId),
      enabled: !!payment,
    })),
  });

  const reverseMutation = useMutation({
    mutationFn: (reason: string) => reversePayment(paymentId, reason),
    onSuccess: () => {
      showSuccess("Payment reversed");
      setReversalOpen(false);
      setReversalReason("");
      queryClient.invalidateQueries({ queryKey: ["payment", paymentId] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to reverse payment";
      showError("Reversal failed", message);
    },
  });

  const canReverse = !!user && user.roles.some((r) => REVERSE_ROLES.includes(r));
  const alreadyReversed = payment?.status === "reversed";
  const reviewPermission = getGcashReviewPermission(user, payment?.postedByUserId ?? null);

  const submitReversal = () => {
    if (reverseMutation.isPending) return; // ignore accidental double-submit
    const reason = reversalReason.trim();
    if (!reason) {
      showError("Reason required", "A reason is required to reverse a payment.");
      return;
    }
    reverseMutation.mutate(reason);
  };

  const verifyMutation = useMutation({
    mutationFn: (note: string) => verifyGcashPayment(paymentId, note || undefined),
    onSuccess: () => {
      showSuccess("GCash payment verified", "The payment has been posted and allocated.");
      setVerifyOpen(false);
      setVerifyNote("");
      queryClient.invalidateQueries({ queryKey: ["payment", paymentId] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to verify payment";
      showError("Verification failed", message);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (reason: string) => rejectGcashPayment(paymentId, reason),
    onSuccess: () => {
      showSuccess("GCash payment rejected");
      setRejectOpen(false);
      setRejectReason("");
      queryClient.invalidateQueries({ queryKey: ["payment", paymentId] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to reject payment";
      showError("Rejection failed", message);
    },
  });

  const submitVerify = () => {
    if (verifyMutation.isPending) return; // ignore accidental double-submit
    verifyMutation.mutate(verifyNote.trim());
  };

  const submitReject = () => {
    if (rejectMutation.isPending) return; // ignore accidental double-submit
    const reason = rejectReason.trim();
    if (!reason) {
      showError("Reason required", "A reason is required to reject a GCash payment.");
      return;
    }
    rejectMutation.mutate(reason);
  };

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={onBack} disabled>
            <Loader2 className="h-4 w-4 animate-spin" />
          </Button>
          <div className="h-6 bg-muted rounded w-48" />
        </div>
      </div>
    );
  }

  if (error || !payment) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
          <p className="font-medium text-destructive">Failed to load payment</p>
          <p className="text-sm text-muted-foreground mt-1">
            {error instanceof Error ? error.message : "Payment not found"}
          </p>
          <Button onClick={() => refetch()} className="mt-4" variant="outline">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const account = accountData?.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to List
        </Button>
        <div className="flex items-center gap-2">
          {payment.status === "posted" && (
            <Button variant="outline" onClick={() => window.print()} className="gap-2">
              <Printer className="h-4 w-4" />
              Print Receipt
            </Button>
          )}
          <Badge variant={paymentStatusBadge[payment.status]}>{payment.status}</Badge>
        </div>
      </div>

      {/* Print-only clean receipt layout — hidden on screen, shown only when
          printing (Layout.tsx already hides the sidebar/header on print). */}
      {payment.status === "posted" && (
        <div className="hidden print:block">
          <div className="max-w-md mx-auto border rounded-lg p-8 space-y-4">
            <div className="text-center space-y-1">
              <h2 className="text-xl font-bold">Bukidnon Cable &amp; Internet Services</h2>
              <p className="text-sm text-muted-foreground">Official Receipt</p>
            </div>
            <div className="border-t border-dashed" />
            <dl className="text-sm space-y-2">
              <div className="flex justify-between"><dt className="text-muted-foreground">Receipt #</dt><dd className="font-mono font-medium">{payment.receiptNumber ?? "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Date</dt><dd>{new Date(payment.paymentDate).toLocaleDateString()}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Service Account</dt><dd className="font-mono">{account?.serviceNumber ?? payment.serviceAccountId}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Subscriber</dt><dd>{account ? `${account.subscriber.firstName} ${account.subscriber.lastName}` : "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Method</dt><dd>{methodLabel[payment.method]}</dd></div>
              {payment.referenceNumber && (
                <div className="flex justify-between"><dt className="text-muted-foreground">Reference #</dt><dd className="font-mono">{payment.referenceNumber}</dd></div>
              )}
            </dl>
            <div className="border-t border-dashed" />
            <div className="flex justify-between text-lg font-bold">
              <span>Amount Paid</span>
              <span>₱{payment.amount}</span>
            </div>
            {Number(payment.unappliedAmount) > 0 && (
              <p className="text-xs text-muted-foreground text-right">Includes ₱{payment.unappliedAmount} kept as advance/unapplied balance</p>
            )}
            <div className="border-t border-dashed pt-4 text-center text-xs text-muted-foreground">
              This receipt confirms a posted, allocated payment. Thank you.
            </div>
          </div>
        </div>
      )}

      {/* Everything below is the on-screen detail view; hidden entirely when
          printing so only the receipt block above appears on paper. */}
      <div className="print:hidden space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Receipt className="h-5 w-5 text-muted-foreground" />
              Payment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">Amount</p>
              <p className="text-2xl font-semibold">₱{payment.amount}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Method</p>
              <p className="font-medium">{methodLabel[payment.method]}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Payment Date</p>
              <p className="font-medium">{new Date(payment.paymentDate).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Unapplied (Advance) Amount</p>
              <p className="font-medium">₱{payment.unappliedAmount}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5 text-muted-foreground" />
              Receipt / Reference
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">Receipt Number</p>
              <p className="font-mono font-medium">{payment.receiptNumber ?? "—"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Reference Number</p>
              <p className="font-mono font-medium">{payment.referenceNumber ?? "—"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Posted At</p>
              <p className="font-medium">{new Date(payment.postedAt).toLocaleString()}</p>
            </div>
            {payment.method !== "gcash" && payment.proofs.length === 0 && payment.proofAttachmentPath && (
              <div>
                <p className="text-sm text-muted-foreground">Proof Reference</p>
                <p className="font-medium break-all">{payment.proofAttachmentPath}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5 text-muted-foreground" />
              Service Account
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {account ? (
              <>
                <div>
                  <p className="text-sm text-muted-foreground">Service Number</p>
                  <p className="font-mono font-medium">{account.serviceNumber}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Subscriber</p>
                  <p className="font-medium">{account.subscriber.firstName} {account.subscriber.lastName}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Account Status</p>
                  <Badge variant="outline">{account.status.replace("_", " ")}</Badge>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Loading…</p>
            )}
          </CardContent>
        </Card>
      </div>

      {payment.gcash && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-muted-foreground" />
              GCash Verification
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Badge variant={gcashStatusBadge[payment.gcash.verificationStatus]}>
                {payment.gcash.verificationStatus}
              </Badge>
              {payment.gcash.verificationStatus === "pending" && (
                <p className="text-sm text-muted-foreground">
                  This payment is not yet posted — it does not affect any invoice balance until it is
                  verified.
                </p>
              )}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-sm text-muted-foreground">Submitted</p>
                <p className="font-medium">{new Date(payment.createdAt).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">GCash Reference Number</p>
                <p className="font-mono font-medium">{payment.gcash.gcashReferenceNumber}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Proof</p>
                <p className="font-medium break-all">
                  {payment.proofs.length > 0
                    ? `${payment.proofs.length} file(s) attached — see Proof of Payment below`
                    : payment.gcash.proofAttachmentPath ?? "No proof file attached"}
                </p>
              </div>
              {payment.gcash.verificationStatus !== "pending" && (
                <>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {payment.gcash.verificationStatus === "verified" ? "Verified At" : "Rejected At"}
                    </p>
                    <p className="font-medium">
                      {payment.gcash.verifiedAt ? new Date(payment.gcash.verifiedAt).toLocaleString() : "—"}
                    </p>
                  </div>
                  {payment.gcash.verificationNote && (
                    <div>
                      <p className="text-sm text-muted-foreground">
                        {payment.gcash.verificationStatus === "verified" ? "Verification Note" : "Rejection Reason"}
                      </p>
                      <p className="font-medium">{payment.gcash.verificationNote}</p>
                    </div>
                  )}
                </>
              )}
            </div>

            {payment.gcash.verificationStatus === "pending" && (
              <div className="flex flex-wrap items-center gap-3 pt-2 border-t">
                <Button onClick={() => setVerifyOpen(true)} disabled={!reviewPermission.allowed}>
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Verify Payment
                </Button>
                <Button variant="destructive" onClick={() => setRejectOpen(true)} disabled={!reviewPermission.allowed}>
                  <ShieldX className="mr-2 h-4 w-4" />
                  Reject Payment
                </Button>
                {!reviewPermission.allowed && (
                  <p className="text-sm text-muted-foreground">{reviewPermission.reason}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {payment.proofs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Proof of Payment</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {payment.proofs.map((proof) => (
              <ProofViewer key={proof.id} proof={proof} />
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Invoice Allocations</CardTitle>
        </CardHeader>
        <CardContent>
          {payment.allocations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {payment.status === "pending"
                ? "No allocations yet — this GCash submission has not been verified, so it has not been applied to any invoice."
                : "No allocations — the full amount is held as an unapplied/advance balance."}
            </p>
          ) : (
            <div className="divide-y">
              {payment.allocations.map((alloc, index) => {
                const invoiceQuery = invoiceQueries[index];
                const invoice = invoiceQuery?.data?.data;
                return (
                  <div key={alloc.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="font-mono font-medium">
                        {invoice ? invoice.invoiceNumber : `Invoice #${alloc.invoiceId}`}
                      </p>
                      {invoice && (
                        <p className="text-sm text-muted-foreground">
                          Total {invoice.totalAmount} — status {invoice.status}
                        </p>
                      )}
                    </div>
                    <p className="font-medium">₱{alloc.amount}</p>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {payment.reversal ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Undo2 className="h-5 w-5 text-destructive" />
              Reversal
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">Reason</p>
            <p className="font-medium">{payment.reversal.reason}</p>
            <p className="text-sm text-muted-foreground mt-2">
              Reversed at {new Date(payment.reversal.reversedAt).toLocaleString()}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Reversal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Posted payments can never be edited or deleted. A reversal restores the affected
              invoices' balances and is permanently recorded with the reason given below.
            </p>
            <Button
              variant="destructive"
              onClick={() => setReversalOpen(true)}
              disabled={!canReverse || alreadyReversed}
            >
              <Undo2 className="mr-2 h-4 w-4" />
              Reverse Payment
            </Button>
            {!canReverse && (
              <p className="text-sm text-muted-foreground">
                Your role does not have permission to reverse payments.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Modal
        open={reversalOpen}
        onClose={() => {
          if (!reverseMutation.isPending) {
            setReversalOpen(false);
            setReversalReason("");
          }
        }}
        title="Reverse Payment"
        description="This cannot be undone. The payment will be marked reversed and affected invoice balances will be restored."
        footer={
          <>
            <Button variant="outline" onClick={() => setReversalOpen(false)} disabled={reverseMutation.isPending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={submitReversal} disabled={reverseMutation.isPending}>
              {reverseMutation.isPending ? "Reversing..." : "Confirm Reversal"}
            </Button>
          </>
        }
      >
        <Textarea
          label="Reason *"
          value={reversalReason}
          onChange={(e) => setReversalReason(e.target.value)}
          placeholder="Explain why this payment is being reversed"
          disabled={reverseMutation.isPending}
        />
      </Modal>

      <Modal
        open={verifyOpen}
        onClose={() => {
          if (!verifyMutation.isPending) {
            setVerifyOpen(false);
            setVerifyNote("");
          }
        }}
        title="Verify GCash Payment"
        description="This will post the payment and allocate it to open invoices oldest-first. This cannot be undone from this screen — use reversal afterward if needed."
        footer={
          <>
            <Button variant="outline" onClick={() => setVerifyOpen(false)} disabled={verifyMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={submitVerify} disabled={verifyMutation.isPending}>
              {verifyMutation.isPending ? "Verifying..." : "Confirm Verification"}
            </Button>
          </>
        }
      >
        <Textarea
          label="Note (optional)"
          value={verifyNote}
          onChange={(e) => setVerifyNote(e.target.value)}
          placeholder="e.g. Confirmed against the GCash business dashboard"
          disabled={verifyMutation.isPending}
        />
      </Modal>

      <Modal
        open={rejectOpen}
        onClose={() => {
          if (!rejectMutation.isPending) {
            setRejectOpen(false);
            setRejectReason("");
          }
        }}
        title="Reject GCash Payment"
        description="This will mark the submission as cancelled. No invoice balance is affected since a pending payment was never allocated."
        footer={
          <>
            <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={rejectMutation.isPending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={submitReject} disabled={rejectMutation.isPending}>
              {rejectMutation.isPending ? "Rejecting..." : "Confirm Rejection"}
            </Button>
          </>
        }
      >
        <Textarea
          label="Reason *"
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder="Explain why this GCash submission is being rejected"
          disabled={rejectMutation.isPending}
        />
      </Modal>
      </div>
    </div>
  );
}
