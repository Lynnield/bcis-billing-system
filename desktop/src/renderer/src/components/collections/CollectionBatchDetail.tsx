import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Modal } from "@/components/ui/Modal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useToast } from "@/lib/toast";
import { formatPeso } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import {
  getCollectionBatchById,
  addPaymentToBatch,
  remitCollectionBatch,
  reconcileCollectionBatch,
  submitCollectionBatch,
  closeCollectionBatch,
} from "@/lib/collection-batch-api";
import { batchStatusBadge, batchStatusLabel } from "./batch-status";
import { ArrowLeft, Plus, Banknote, CheckCircle2, Loader2, Send, Lock } from "lucide-react";

// Matches api/src/routes/collection-batches.ts CLOSE_ROLES (UX only).
const CLOSE_ROLES = ["Owner / Super Admin", "Administrator", "Collection Supervisor"];

interface CollectionBatchDetailProps {
  batchId: number;
  onBack: () => void;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "danger" | "success" | "muted" }) {
  const toneClass = tone === "danger" ? "text-destructive" : tone === "success" ? "text-success" : tone === "muted" ? "text-muted-foreground" : "";
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className={`text-xl font-semibold tabular-nums text-right ${toneClass}`}>{value}</CardContent>
    </Card>
  );
}

export function CollectionBatchDetail({ batchId, onBack }: CollectionBatchDetailProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { success: showSuccess, error: showError } = useToast();
  const canClose = !!user && user.roles.some((r) => CLOSE_ROLES.includes(r));

  const [addPaymentOpen, setAddPaymentOpen] = React.useState(false);
  const [paymentIdInput, setPaymentIdInput] = React.useState("");
  const [remitOpen, setRemitOpen] = React.useState(false);
  const [remittedAmount, setRemittedAmount] = React.useState("");
  const [remitNotes, setRemitNotes] = React.useState("");
  const [reconcileOpen, setReconcileOpen] = React.useState(false);
  const [acknowledged, setAcknowledged] = React.useState(false);
  const [reconcileNotes, setReconcileNotes] = React.useState("");
  const [closeOpen, setCloseOpen] = React.useState(false);
  const [closeNotes, setCloseNotes] = React.useState("");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["collection-batch", batchId],
    queryFn: () => getCollectionBatchById(batchId),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["collection-batch", batchId] });
    queryClient.invalidateQueries({ queryKey: ["collection-batches"] });
  };
  const fail = (title: string) => (err: unknown) => showError(title, err instanceof Error ? err.message : "Unknown error");

  const addPaymentMutation = useMutation({
    mutationFn: (paymentId: number) => addPaymentToBatch(batchId, paymentId),
    onSuccess: () => {
      showSuccess("Payment added to batch");
      setAddPaymentOpen(false);
      setPaymentIdInput("");
      invalidate();
    },
    onError: fail("Could not add payment"),
  });

  const submitMutation = useMutation({
    mutationFn: () => submitCollectionBatch(batchId),
    onSuccess: () => {
      showSuccess("Batch submitted", "No further collections can be recorded on it.");
      invalidate();
    },
    onError: fail("Submit failed"),
  });

  const remitMutation = useMutation({
    mutationFn: () => remitCollectionBatch(batchId, { remittedAmount: remittedAmount.trim(), reconciliationNotes: remitNotes.trim() || undefined }),
    onSuccess: (result) => {
      const r = result.data;
      if (r.shortageAmount !== "0.00") showError("Remittance recorded — shortage detected", `₱${r.shortageAmount} short`);
      else if (r.overageAmount !== "0.00") showSuccess("Remittance recorded — overage detected", `₱${r.overageAmount} over`);
      else showSuccess("Remittance recorded — balanced");
      setRemitOpen(false);
      invalidate();
    },
    onError: fail("Remittance failed"),
  });

  const reconcileMutation = useMutation({
    mutationFn: () =>
      reconcileCollectionBatch(batchId, {
        ...(acknowledged ? { acknowledgeDifference: true } : {}),
        ...(reconcileNotes.trim() ? { notes: reconcileNotes.trim() } : {}),
      }),
    onSuccess: () => {
      showSuccess("Batch reconciled");
      setReconcileOpen(false);
      invalidate();
    },
    onError: fail("Reconciliation failed"),
  });

  const closeMutation = useMutation({
    mutationFn: () => closeCollectionBatch(batchId, { confirm: true, ...(closeNotes.trim() ? { notes: closeNotes.trim() } : {}) }),
    onSuccess: () => {
      showSuccess("Batch closed");
      setCloseOpen(false);
      invalidate();
    },
    onError: fail("Close failed"),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6">
          <p className="font-medium text-destructive">Failed to load batch</p>
          <p className="text-sm text-muted-foreground mt-1">{error instanceof Error ? error.message : "Not found"}</p>
          <Button onClick={() => refetch()} className="mt-4" variant="outline">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const batch = data.data;
  const sum = batch.summary;
  const collecting = batch.status === "open" || batch.status === "in_progress";
  const hasDifference = batch.shortageAmount !== "0.00" || batch.overageAmount !== "0.00";
  const differenceLabel =
    batch.shortageAmount !== "0.00" ? `Shortage of ₱${batch.shortageAmount}` : `Overage of ₱${batch.overageAmount}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Badge variant={batchStatusBadge[batch.status]} className="text-sm">
          {batchStatusLabel[batch.status]}
        </Badge>
      </div>

      <div>
        <h2 className="text-2xl font-semibold">Batch #{batch.id}</h2>
        <p className="text-muted-foreground">
          {batch.collector?.fullName ?? `Collector #${batch.collectorId}`} · {new Date(batch.batchDate).toLocaleDateString()}
        </p>
      </div>

      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Collection</h3>
      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Expected Receivable (route)" value={formatPeso(sum.expectedReceivable)} />
        <Stat label="Cash Collected" value={formatPeso(sum.cashCollected)} />
        <Stat label="GCash / Non-cash Collected" value={formatPeso(sum.nonCashCollected)} />
        <Stat label="Uncollected" value={formatPeso(sum.uncollected)} tone="muted" />
      </div>
      <p className="text-sm text-muted-foreground">
        Accounts collected: <span className="font-medium tabular-nums">{sum.accountsCollected}</span> of{" "}
        <span className="font-medium tabular-nums">{sum.accountsOnRoute}</span> on the route at batch open.
      </p>

      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Cash Reconciliation</h3>
      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Expected Cash" value={formatPeso(sum.expectedCash)} />
        <Stat label="Remitted Cash" value={formatPeso(sum.remittedCash)} />
        <Stat label="Shortage" value={formatPeso(batch.shortageAmount)} tone={batch.shortageAmount !== "0.00" ? "danger" : undefined} />
        <Stat label="Overage" value={formatPeso(batch.overageAmount)} tone={batch.overageAmount !== "0.00" ? "success" : undefined} />
      </div>

      <div className="flex flex-wrap gap-2">
        {collecting && (
          <>
            <Button variant="outline" onClick={() => setAddPaymentOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Payment
            </Button>
            <Button variant="outline" onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending}>
              <Send className="mr-2 h-4 w-4" />
              Submit Batch
            </Button>
          </>
        )}
        {(collecting || batch.status === "submitted") && (
          <Button
            onClick={() => {
              setRemittedAmount(sum.expectedCash);
              setRemitOpen(true);
            }}
          >
            <Banknote className="mr-2 h-4 w-4" />
            Record Remittance
          </Button>
        )}
        {batch.status === "remitted" && (
          <Button
            onClick={() => {
              setAcknowledged(false);
              setReconcileNotes("");
              setReconcileOpen(true);
            }}
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Reconcile
          </Button>
        )}
        {batch.status === "reconciled" && (
          <Button onClick={() => setCloseOpen(true)} disabled={!canClose}>
            <Lock className="mr-2 h-4 w-4" />
            Close Batch
          </Button>
        )}
      </div>

      {hasDifference && batch.status !== "open" && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
          <p className="font-medium text-warning">Exception: {differenceLabel}</p>
          <p className="text-muted-foreground mt-1">
            {batch.status === "remitted"
              ? "This difference must be acknowledged with an explanation before the batch can be reconciled."
              : "Recorded and preserved on this batch; it is never reset to balanced."}
          </p>
          {batch.reconciliationNotes && <p className="mt-1 text-muted-foreground">Notes: {batch.reconciliationNotes}</p>}
        </div>
      )}
      {batch.status === "closed" && (
        <p className="text-sm text-muted-foreground">
          Closed {batch.closedAt ? new Date(batch.closedAt).toLocaleString() : ""}
          {batch.closingNotes ? ` — ${batch.closingNotes}` : ""}
        </p>
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Payment ID</TableHead>
              <TableHead>Service Account</TableHead>
              <TableHead>Method</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {batch.payments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No payments assigned to this batch yet
                </TableCell>
              </TableRow>
            ) : (
              batch.payments.map((p) => (
                <TableRow key={p.paymentId}>
                  <TableCell className="font-mono">#{p.paymentId}</TableCell>
                  <TableCell className="font-mono">{p.serviceAccountId}</TableCell>
                  <TableCell>{p.method === "cash" ? "Cash" : p.method === "gcash" ? "GCash (non-cash)" : `${p.method} (non-cash)`}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatPeso(p.amount)}</TableCell>
                  <TableCell>{new Date(p.paymentDate).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Badge variant={p.status === "posted" ? "success" : "secondary"}>{p.status}</Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Modal
        open={addPaymentOpen}
        onClose={() => !addPaymentMutation.isPending && setAddPaymentOpen(false)}
        title="Add Payment to Batch"
        description="Enter the ID of a posted payment collected by this collector (find payment IDs on the Payments screen)."
        footer={
          <>
            <Button variant="outline" onClick={() => setAddPaymentOpen(false)} disabled={addPaymentMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={() => addPaymentMutation.mutate(Number(paymentIdInput))} disabled={addPaymentMutation.isPending || !paymentIdInput.trim()}>
              {addPaymentMutation.isPending ? "Adding..." : "Add"}
            </Button>
          </>
        }
      >
        <Input label="Payment ID *" type="number" min="1" value={paymentIdInput} onChange={(e) => setPaymentIdInput(e.target.value)} placeholder="e.g. 42" />
      </Modal>

      <Modal
        open={remitOpen}
        onClose={() => !remitMutation.isPending && setRemitOpen(false)}
        title="Record Remittance"
        description="Enter the actual Cash the collector turned in. Shortage/overage is computed against expected Cash only — GCash and other non-cash payments never pass through the collector."
        footer={
          <>
            <Button variant="outline" onClick={() => setRemitOpen(false)} disabled={remitMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={() => remitMutation.mutate()} disabled={remitMutation.isPending || !remittedAmount.trim()}>
              {remitMutation.isPending ? "Recording..." : "Record Remittance"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Remitted Cash *"
            inputMode="decimal"
            value={remittedAmount}
            onChange={(e) => setRemittedAmount(e.target.value)}
            placeholder="0.00"
            helperText={`Expected Cash: ₱${sum.expectedCash}`}
          />
          <Textarea label="Notes" value={remitNotes} onChange={(e) => setRemitNotes(e.target.value)} placeholder="Optional notes" rows={3} />
        </div>
      </Modal>

      <Modal
        open={reconcileOpen}
        onClose={() => !reconcileMutation.isPending && setReconcileOpen(false)}
        title="Reconcile Batch"
        description={hasDifference ? `${differenceLabel}. It stays on record; reconciling only confirms it has been reviewed.` : "Expected and remitted Cash match."}
        footer={
          <>
            <Button variant="outline" onClick={() => setReconcileOpen(false)} disabled={reconcileMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => reconcileMutation.mutate()}
              disabled={reconcileMutation.isPending || (hasDifference && (!acknowledged || !reconcileNotes.trim()))}
            >
              {reconcileMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirm Reconciliation
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {hasDifference && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
              I have reviewed the {batch.shortageAmount !== "0.00" ? "shortage" : "overage"} and it is recorded as an exception, not as balanced.
            </label>
          )}
          <Textarea
            label={hasDifference ? "Explanation *" : "Notes"}
            value={reconcileNotes}
            onChange={(e) => setReconcileNotes(e.target.value)}
            placeholder={hasDifference ? "e.g. Collector to repay ₱500 from next payout" : "Optional"}
            rows={3}
          />
        </div>
      </Modal>

      <Modal
        open={closeOpen}
        onClose={() => !closeMutation.isPending && setCloseOpen(false)}
        title="Close Batch"
        description="Closing is the final sign-off. A closed batch cannot be changed."
        footer={
          <>
            <Button variant="outline" onClick={() => setCloseOpen(false)} disabled={closeMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={() => closeMutation.mutate()} disabled={closeMutation.isPending}>
              {closeMutation.isPending ? "Closing..." : "Confirm Close"}
            </Button>
          </>
        }
      >
        <Textarea label="Notes" value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} placeholder="Optional closing notes" rows={3} />
      </Modal>
    </div>
  );
}
