import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/lib/toast";
import { useAuth } from "@/lib/auth-context";
import { Plus, Pencil, Loader2, Zap } from "lucide-react";
import { generateBilling, getBillingPeriods } from "@/lib/billing-period-api";
import type { BillingPeriod, GenerateBillingResponse } from "@/shared/types";
import { BillingPeriodForm } from "./BillingPeriodForm";

// Matches api/src/routes/billing-periods.ts WRITE_ROLES (UX only).
const WRITE_ROLES = ["Owner / Super Admin", "Administrator"];

const day = (d: string) => d.slice(0, 10);

export function BillingPeriodList() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { success: showSuccess, error: showError } = useToast();
  const canWrite = !!user && user.roles.some((r) => WRITE_ROLES.includes(r));

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<BillingPeriod | null>(null);
  const [generating, setGenerating] = React.useState<BillingPeriod | null>(null);
  const [asDraft, setAsDraft] = React.useState(false);
  const [preview, setPreview] = React.useState<number | null>(null);
  const [result, setResult] = React.useState<GenerateBillingResponse["data"] | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["billing-periods"],
    // The API caps pageSize at 100 (api/src/routes/billing-periods.ts).
    queryFn: () => getBillingPeriods({ page: 1, pageSize: 100 }),
    placeholderData: (previous) => previous,
  });

  const previewMutation = useMutation({
    mutationFn: (periodId: number) => generateBilling(periodId, { dryRun: true }),
    onSuccess: (res) => setPreview(res.data.wouldBill ?? 0),
    onError: (err: unknown) => showError("Preview failed", err instanceof Error ? err.message : "Request failed"),
  });

  const generateMutation = useMutation({
    mutationFn: (periodId: number) => generateBilling(periodId, { asDraft }),
    onSuccess: (res) => {
      setResult(res.data);
      showSuccess("Billing generated", `${res.data.created ?? 0} invoice(s) created`);
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (err: unknown) => showError("Generation failed", err instanceof Error ? err.message : "Request failed"),
  });

  const openGenerate = (period: BillingPeriod) => {
    setGenerating(period);
    setResult(null);
    setPreview(null);
    setAsDraft(false);
    previewMutation.mutate(period.id);
  };

  const periods = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Generate Billing</h2>
          <p className="text-muted-foreground">Billing periods and the monthly invoice run</p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          disabled={!canWrite}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Billing Period
        </Button>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6">
          <p className="font-medium text-destructive">Failed to load billing periods</p>
          <p className="text-sm text-muted-foreground mt-1">{error instanceof Error ? error.message : "Unknown error"}</p>
          <Button onClick={() => refetch()} className="mt-4" variant="outline">
            Retry
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Period Start</TableHead>
                <TableHead>Period End</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead className="w-[220px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && !data ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    <Loader2 className="inline mr-2 h-4 w-4 animate-spin" />
                    Loading…
                  </TableCell>
                </TableRow>
              ) : periods.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No billing periods found
                  </TableCell>
                </TableRow>
              ) : (
                periods.map((period) => (
                  <TableRow key={period.id}>
                    <TableCell className="font-medium">{period.label}</TableCell>
                    <TableCell>{day(period.periodStart)}</TableCell>
                    <TableCell>{day(period.periodEnd)}</TableCell>
                    <TableCell>{day(period.dueDate)}</TableCell>
                    <TableCell className="flex gap-2">
                      <Button size="sm" onClick={() => openGenerate(period)} disabled={!canWrite}>
                        <Zap className="mr-1 h-4 w-4" />
                        Generate
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          setEditing(period);
                          setFormOpen(true);
                        }}
                        disabled={!canWrite}
                        aria-label={`Edit ${period.label}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {formOpen && (
        <BillingPeriodForm
          open={formOpen}
          onClose={() => setFormOpen(false)}
          onSuccess={() => {
            setFormOpen(false);
            queryClient.invalidateQueries({ queryKey: ["billing-periods"] });
          }}
          isEditing={!!editing}
          initialData={
            editing
              ? { id: editing.id, label: editing.label, periodStart: day(editing.periodStart), periodEnd: day(editing.periodEnd), dueDate: day(editing.dueDate) }
              : undefined
          }
        />
      )}

      <Modal
        open={!!generating}
        onClose={() => !generateMutation.isPending && setGenerating(null)}
        title={`Generate Billing — ${generating?.label ?? ""}`}
        description="Creates one invoice per active service account not yet billed for this period, at each plan's current price. Running it again never creates duplicates."
        footer={
          result ? (
            <Button onClick={() => setGenerating(null)}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setGenerating(null)} disabled={generateMutation.isPending}>
                Cancel
              </Button>
              <Button
                onClick={() => generating && generateMutation.mutate(generating.id)}
                disabled={generateMutation.isPending || preview === null || preview === 0}
              >
                {generateMutation.isPending ? "Generating…" : `Generate ${preview ?? ""} Invoice(s)`}
              </Button>
            </>
          )
        }
      >
        {result ? (
          <div className="space-y-2 text-sm">
            <p>
              <span className="font-semibold tabular-nums">{result.created ?? 0}</span> invoice(s) created.
            </p>
            {(result.skipped?.length ?? 0) > 0 && (
              <div>
                <p className="font-medium text-warning">{result.skipped!.length} account(s) skipped:</p>
                <ul className="list-disc pl-5 text-muted-foreground max-h-40 overflow-auto">
                  {result.skipped!.map((s) => (
                    <li key={s.serviceAccountId}>
                      <span className="font-mono">{s.serviceNumber}</span> — {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <p>
              {preview === null ? (
                <span className="text-muted-foreground">Checking unbilled accounts…</span>
              ) : (
                <>
                  <span className="font-semibold tabular-nums">{preview}</span> active service account(s) have not been billed for this period.
                </>
              )}
            </p>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={asDraft} onChange={(e) => setAsDraft(e.target.checked)} />
              Create as drafts (finalize each one after review)
            </label>
          </div>
        )}
      </Modal>
    </div>
  );
}
