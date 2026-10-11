import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/lib/toast";
import { useAuth } from "@/lib/auth-context";
import { getPayments, getPaymentById, rejectGcashPayment, verifyGcashPayment } from "@/lib/payment-api";
import { getServiceAccountById } from "@/lib/service-account-api";
import { getGcashReviewPermission } from "@/lib/gcash-verification";
import { ProofViewer } from "./ProofViewer";
import { AlertTriangle, Loader2, RefreshCw, ShieldCheck, ShieldX } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Two-pane GCash verification queue (spec 4.3). Left: pending GCash
 * submissions. Right: the selected submission's proof preview, details and
 * verify/reject controls. Status "pending" is only ever reached by a GCash
 * submission (api/src/routes/payments.ts); the method filter is a defensive
 * belt-and-braces check.
 */
export function GcashVerificationQueue() {
  const [selectedId, setSelectedId] = React.useState<number | null>(null);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["payments", "pending-gcash-queue"],
    queryFn: () => getPayments({ status: "pending", pageSize: 100 }),
  });
  const pending = (data?.data ?? []).filter((p) => p.method === "gcash");

  // Keep a valid selection as the queue changes.
  React.useEffect(() => {
    if (pending.length === 0) setSelectedId(null);
    else if (selectedId === null || !pending.some((p) => p.id === selectedId)) setSelectedId(pending[0]!.id);
  }, [pending, selectedId]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">GCash Verification</h2>
          <p className="text-muted-foreground">
            A screenshot is evidence to review, not proof of payment. Nothing here affects any balance until it is verified.
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6">
          <p className="font-medium text-destructive">Failed to load pending GCash payments</p>
          <p className="text-sm text-muted-foreground mt-1">{error instanceof Error ? error.message : "Unknown error"}</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(260px,1fr)_2fr]">
          <div className="rounded-lg border">
            <div className="border-b px-3 py-2 text-sm font-medium">
              Pending <Badge variant="warning" className="ml-1 tabular-nums">{pending.length}</Badge>
            </div>
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading…
              </div>
            ) : pending.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">No pending GCash payments</p>
            ) : (
              <ul className="max-h-[70vh] divide-y overflow-auto" role="listbox" aria-label="Pending GCash payments">
                {pending.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={p.id === selectedId}
                      onClick={() => setSelectedId(p.id)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50",
                        p.id === selectedId && "bg-accent/10 border-l-2 border-primary",
                      )}
                    >
                      <span>
                        <span className="font-mono">#{p.id}</span>
                        <span className="block text-xs text-muted-foreground">{new Date(p.createdAt).toLocaleString()}</span>
                      </span>
                      <span className="font-medium tabular-nums">₱{p.amount}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg border p-4">
            {selectedId === null ? (
              <p className="py-12 text-center text-sm text-muted-foreground">Select a submission to review</p>
            ) : (
              <ReviewPane key={selectedId} paymentId={selectedId} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewPane({ paymentId }: { paymentId: number }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { success: showSuccess, error: showError } = useToast();
  const [note, setNote] = React.useState("");

  const { data, isLoading } = useQuery({ queryKey: ["payment", paymentId], queryFn: () => getPaymentById(paymentId) });
  const payment = data?.data;
  const { data: accountData } = useQuery({
    queryKey: ["service-account", payment?.serviceAccountId],
    queryFn: () => getServiceAccountById(payment!.serviceAccountId),
    enabled: !!payment,
  });
  const account = accountData?.data;

  const done = (msg: string) => {
    showSuccess(msg);
    setNote("");
    queryClient.invalidateQueries({ queryKey: ["payments"] });
    queryClient.invalidateQueries({ queryKey: ["payment", paymentId] });
  };
  const verify = useMutation({
    mutationFn: () => verifyGcashPayment(paymentId, note.trim() || undefined),
    onSuccess: () => done("GCash payment verified and posted"),
    onError: (err: unknown) => showError("Verification failed", err instanceof Error ? err.message : ""),
  });
  const reject = useMutation({
    mutationFn: () => rejectGcashPayment(paymentId, note.trim()),
    onSuccess: () => done("GCash payment rejected"),
    onError: (err: unknown) => showError("Rejection failed", err instanceof Error ? err.message : ""),
  });

  if (isLoading || !payment) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading submission…
      </div>
    );
  }

  const permission = getGcashReviewPermission(user, payment.postedByUserId);
  const busy = verify.isPending || reject.isPending;

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Proof</h3>
        {payment.proofs.length > 0 ? (
          payment.proofs.map((proof) => <ProofViewer key={proof.id} proof={proof} className="mb-4" />)
        ) : (
          <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              No proof file was uploaded with this submission.
              {payment.gcash?.proofAttachmentPath ? ` Recorded reference: ${payment.gcash.proofAttachmentPath}` : ""}
            </span>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Submission</h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Amount</dt>
          <dd className="text-right text-lg font-semibold tabular-nums">₱{payment.amount}</dd>
          <dt className="text-muted-foreground">GCash reference</dt>
          <dd className="text-right font-mono">{payment.gcash?.gcashReferenceNumber ?? "—"}</dd>
          <dt className="text-muted-foreground">Service account</dt>
          <dd className="text-right font-mono">{account?.serviceNumber ?? payment.serviceAccountId}</dd>
          <dt className="text-muted-foreground">Subscriber</dt>
          <dd className="text-right">{account ? `${account.subscriber.firstName} ${account.subscriber.lastName}` : "…"}</dd>
          <dt className="text-muted-foreground">Submitted</dt>
          <dd className="text-right">{new Date(payment.createdAt).toLocaleString()}</dd>
        </dl>

        <Textarea
          label="Note / rejection reason"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Required to reject; optional when verifying (e.g. matched in the GCash business app)"
          rows={3}
          disabled={busy || !permission.allowed}
        />
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => verify.mutate()} disabled={busy || !permission.allowed}>
            <ShieldCheck className="mr-2 h-4 w-4" />
            {verify.isPending ? "Verifying…" : "Verify & Post"}
          </Button>
          <Button
            variant="destructive"
            onClick={() => (note.trim() ? reject.mutate() : showError("Reason required", "Enter a reason to reject."))}
            disabled={busy || !permission.allowed}
          >
            <ShieldX className="mr-2 h-4 w-4" />
            {reject.isPending ? "Rejecting…" : "Reject"}
          </Button>
        </div>
        {!permission.allowed && <p className="text-sm text-muted-foreground">{permission.reason}</p>}
        <p className="text-xs text-muted-foreground">
          Verifying posts the payment and allocates it to the oldest unpaid invoices. Your name and the time are recorded for audit.
        </p>
      </div>
    </div>
  );
}
