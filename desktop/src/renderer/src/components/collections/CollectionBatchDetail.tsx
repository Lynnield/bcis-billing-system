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
import { getCollectionBatchById, addPaymentToBatch, remitCollectionBatch, reconcileCollectionBatch } from "@/lib/collection-batch-api";
import type { CollectionBatchStatus } from "@/shared/types";
import { ArrowLeft, Plus, Banknote, CheckCircle2, Loader2 } from "lucide-react";

const statusBadgeVariant: Record<CollectionBatchStatus, "default" | "success" | "warning" | "secondary"> = {
  open: "default",
  closed: "secondary",
  remitted: "warning",
  reconciled: "success",
};

interface CollectionBatchDetailProps {
  batchId: number;
  onBack: () => void;
}

export function CollectionBatchDetail({ batchId, onBack }: CollectionBatchDetailProps) {
  const queryClient = useQueryClient();
  const { success: showSuccess, error: showError } = useToast();

  const [addPaymentOpen, setAddPaymentOpen] = React.useState(false);
  const [paymentIdInput, setPaymentIdInput] = React.useState("");
  const [remitOpen, setRemitOpen] = React.useState(false);
  const [remittedAmount, setRemittedAmount] = React.useState("");
  const [reconciliationNotes, setReconciliationNotes] = React.useState("");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["collection-batch", batchId],
    queryFn: () => getCollectionBatchById(batchId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["collection-batch", batchId] });

  const addPaymentMutation = useMutation({
    mutationFn: (paymentId: number) => addPaymentToBatch(batchId, paymentId),
    onSuccess: () => {
      showSuccess("Payment added to batch");
      setAddPaymentOpen(false);
      setPaymentIdInput("");
      invalidate();
    },
    onError: (err: unknown) => showError("Could not add payment", err instanceof Error ? err.message : "Unknown error"),
  });

  const remitMutation = useMutation({
    mutationFn: () => remitCollectionBatch(batchId, { remittedAmount, reconciliationNotes: reconciliationNotes.trim() || undefined }),
    onSuccess: (result) => {
      const shortage = Number(result.data.shortageAmount);
      const overage = Number(result.data.overageAmount);
      if (shortage > 0) showError("Remittance recorded — shortage detected", `₱${result.data.shortageAmount} short`);
      else if (overage > 0) showSuccess("Remittance recorded — overage detected", `₱${result.data.overageAmount} over`);
      else showSuccess("Remittance recorded — balanced");
      setRemitOpen(false);
      invalidate();
    },
    onError: (err: unknown) => showError("Remittance failed", err instanceof Error ? err.message : "Unknown error"),
  });

  const reconcileMutation = useMutation({
    mutationFn: () => reconcileCollectionBatch(batchId),
    onSuccess: () => {
      showSuccess("Batch reconciled and closed");
      invalidate();
    },
    onError: (err: unknown) => showError("Reconciliation failed", err instanceof Error ? err.message : "Unknown error"),
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Badge variant={statusBadgeVariant[batch.status]} className="text-sm">
          {batch.status}
        </Badge>
      </div>

      <div>
        <h2 className="text-2xl font-semibold">Batch #{batch.id}</h2>
        <p className="text-muted-foreground">
          {batch.collector?.fullName ?? `Collector #${batch.collectorId}`} · {new Date(batch.batchDate).toLocaleDateString()}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Expected</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold tabular-nums">₱{batch.expectedAmountComputed}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Remitted</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold tabular-nums">₱{batch.remittedAmount}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Shortage</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold tabular-nums text-destructive">₱{batch.shortageAmount}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Overage</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold tabular-nums text-success">₱{batch.overageAmount}</CardContent>
        </Card>
      </div>

      <div className="flex gap-2">
        {batch.status === "open" && (
          <>
            <Button variant="outline" onClick={() => setAddPaymentOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Payment
            </Button>
            <Button onClick={() => { setRemittedAmount(batch.expectedAmountComputed); setRemitOpen(true); }}>
              <Banknote className="mr-2 h-4 w-4" />
              Record Remittance
            </Button>
          </>
        )}
        {batch.status === "closed" && (
          <Button onClick={() => { setRemittedAmount(batch.expectedAmountComputed); setRemitOpen(true); }}>
            <Banknote className="mr-2 h-4 w-4" />
            Record Remittance
          </Button>
        )}
        {batch.status === "remitted" && (
          <Button onClick={() => reconcileMutation.mutate()} disabled={reconcileMutation.isPending}>
            {reconcileMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            Confirm Reconciliation
          </Button>
        )}
      </div>

      {batch.status === "remitted" && (Number(batch.shortageAmount) > 0 || Number(batch.overageAmount) > 0) && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
          <p className="font-medium text-warning">
            {Number(batch.shortageAmount) > 0 ? `Shortage of ₱${batch.shortageAmount}` : `Overage of ₱${batch.overageAmount}`} must be reviewed before this batch can be closed as reconciled.
          </p>
          {batch.reconciliationNotes && <p className="mt-1 text-muted-foreground">Notes: {batch.reconciliationNotes}</p>}
        </div>
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Payment ID</TableHead>
              <TableHead>Service Account</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Amount</TableHead>
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
                  <TableCell>{p.method}</TableCell>
                  <TableCell className="text-right tabular-nums">₱{p.amount}</TableCell>
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
            <Button
              onClick={() => addPaymentMutation.mutate(Number(paymentIdInput))}
              disabled={addPaymentMutation.isPending || !paymentIdInput.trim()}
            >
              {addPaymentMutation.isPending ? "Adding..." : "Add"}
            </Button>
          </>
        }
      >
        <Input
          label="Payment ID *"
          type="number"
          min="1"
          value={paymentIdInput}
          onChange={(e) => setPaymentIdInput(e.target.value)}
          placeholder="e.g. 42"
        />
      </Modal>

      <Modal
        open={remitOpen}
        onClose={() => !remitMutation.isPending && setRemitOpen(false)}
        title="Record Remittance"
        description="Enter the actual Cash the collector turned in. Shortage/overage is computed automatically against the expected total and is never hidden."
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
            label="Remitted Amount *"
            inputMode="decimal"
            value={remittedAmount}
            onChange={(e) => setRemittedAmount(e.target.value)}
            placeholder="0.00"
            helperText={`Expected: ₱${batch.expectedAmountComputed}`}
          />
          <Textarea
            label="Notes"
            value={reconciliationNotes}
            onChange={(e) => setReconciliationNotes(e.target.value)}
            placeholder="Optional reconciliation notes"
            rows={3}
          />
        </div>
      </Modal>
    </div>
  );
}
