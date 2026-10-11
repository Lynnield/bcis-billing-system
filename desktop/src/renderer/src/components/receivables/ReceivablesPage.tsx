import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/lib/toast";
import { getOutstandingInvoices, getAgingSummary, getSuspensionCandidates } from "@/lib/receivables-api";
import { suspendServiceAccount } from "@/lib/service-account-api";
import type { AgingBucketKey } from "@/shared/types";
import { formatPeso } from "@/lib/utils";
import { AlertTriangle, Loader2 } from "lucide-react";

type Tab = "outstanding" | "overdue" | "aging" | "suspension";

const BUCKET_OPTIONS: Array<{ value: AgingBucketKey | "all"; label: string }> = [
  { value: "all", label: "All Buckets" },
  { value: "current", label: "Current" },
  { value: "1-30", label: "1-30 days" },
  { value: "31-60", label: "31-60 days" },
  { value: "61-90", label: "61-90 days" },
  { value: "90+", label: "90+ days" },
];

const bucketBadgeVariant: Record<AgingBucketKey, "default" | "warning" | "destructive" | "secondary"> = {
  current: "default",
  "1-30": "warning",
  "31-60": "warning",
  "61-90": "destructive",
  "90+": "destructive",
};

function InvoiceTable({ overdueOnly }: { overdueOnly: boolean }) {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [bucket, setBucket] = React.useState<AgingBucketKey | "all">("all");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["receivables-invoices", overdueOnly, page, pageSize, bucket],
    queryFn: () =>
      getOutstandingInvoices({
        page,
        pageSize,
        overdueOnly,
        bucket: bucket !== "all" ? bucket : undefined,
      }),
    placeholderData: (previous) => previous,
  });

  const rows = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-4">
      <Select
        value={bucket}
        onChange={(e) => {
          setBucket(e.target.value as AgingBucketKey | "all");
          setPage(1);
        }}
        options={BUCKET_OPTIONS}
        className="w-[180px]"
      />

      {error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6">
          <p className="font-medium text-destructive">Failed to load invoices</p>
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
                <TableHead>Invoice #</TableHead>
                <TableHead>Service Account</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Days Overdue</TableHead>
                <TableHead>Bucket</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && !data ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    {overdueOnly ? "No overdue invoices" : "No outstanding invoices"}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.invoiceId}>
                    <TableCell className="font-mono">{r.invoiceNumber}</TableCell>
                    <TableCell className="font-mono">{r.serviceAccountId}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{formatPeso(r.balance)}</TableCell>
                    <TableCell>{new Date(r.dueDate).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.daysOverdue > 0 ? r.daysOverdue : "—"}</TableCell>
                    <TableCell>
                      <Badge variant={bucketBadgeVariant[r.bucket]}>{r.bucket}</Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {pagination && (
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          pageSize={pagination.pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          showPageSize
        />
      )}
    </div>
  );
}

function AgingTab() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["receivables-aging"],
    queryFn: getAgingSummary,
  });

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6">
        <p className="font-medium text-destructive">Failed to load aging summary</p>
        <p className="text-sm text-muted-foreground mt-1">{error instanceof Error ? error.message : "Unknown error"}</p>
        <Button onClick={() => refetch()} className="mt-4" variant="outline">
          Retry
        </Button>
      </div>
    );
  }

  if (isLoading || !data) return <p className="text-muted-foreground">Loading...</p>;

  const buckets = data.data.buckets;
  const bucketKeys: AgingBucketKey[] = ["current", "1-30", "31-60", "61-90", "90+"];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-5">
        {bucketKeys.map((b) => (
          <Card key={b}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground capitalize">{b}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-semibold tabular-nums">{formatPeso(buckets[b].amount)}</div>
              <p className="text-xs text-muted-foreground mt-1">{buckets[b].count} invoice{buckets[b].count === 1 ? "" : "s"}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Total Outstanding</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold tabular-nums">{formatPeso(data.data.total.amount)}</div>
          <p className="text-xs text-muted-foreground mt-1">{data.data.total.count} invoices across all buckets</p>
        </CardContent>
      </Card>
    </div>
  );
}

function SuspensionCandidatesTab() {
  const queryClient = useQueryClient();
  const { success: showSuccess, error: showError } = useToast();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["suspension-candidates"],
    queryFn: getSuspensionCandidates,
  });

  // Account being suspended; null while the confirmation modal is closed.
  const [suspendTarget, setSuspendTarget] = React.useState<number | null>(null);
  const [suspendReason, setSuspendReason] = React.useState("");
  const [suspendNotes, setSuspendNotes] = React.useState("");

  const suspendMutation = useMutation({
    mutationFn: (id: number) =>
      suspendServiceAccount(id, { reason: suspendReason.trim() || undefined, notes: suspendNotes.trim() || undefined }),
    onSuccess: (result) => {
      showSuccess("Service account suspended", result.message);
      setSuspendTarget(null);
      setSuspendReason("");
      setSuspendNotes("");
      queryClient.invalidateQueries({ queryKey: ["suspension-candidates"] });
      queryClient.invalidateQueries({ queryKey: ["service-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["service-account"] });
    },
    onError: (err: unknown) => showError("Failed to suspend", err instanceof Error ? err.message : "Unknown error"),
  });

  const rows = data?.data ?? [];

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6">
        <p className="font-medium text-destructive">Failed to load suspension candidates</p>
        <p className="text-sm text-muted-foreground mt-1">{error instanceof Error ? error.message : "Unknown error"}</p>
        <Button onClick={() => refetch()} className="mt-4" variant="outline">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Service Account</TableHead>
            <TableHead>Overdue Invoices</TableHead>
            <TableHead>Oldest Overdue Invoice</TableHead>
            <TableHead>Days Overdue</TableHead>
            <TableHead>Overdue Balance</TableHead>
            <TableHead className="w-[140px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                Loading...
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                No suspension candidates — nothing is overdue
              </TableCell>
            </TableRow>
          ) : (
            rows.map((c) => (
              <TableRow key={c.serviceAccountId}>
                <TableCell className="font-mono">{c.serviceAccountId}</TableCell>
                <TableCell className="text-right tabular-nums">{c.overdueInvoiceCount}</TableCell>
                <TableCell className="font-mono">{c.oldestOverdueInvoice}</TableCell>
                <TableCell className="text-right tabular-nums text-destructive">{c.oldestOverdueDays}</TableCell>
                <TableCell className="text-right tabular-nums font-medium">{formatPeso(c.overdueBalance)}</TableCell>
                <TableCell>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={suspendMutation.isPending}
                    onClick={() => setSuspendTarget(c.serviceAccountId)}
                  >
                    {suspendMutation.isPending && suspendTarget === c.serviceAccountId ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Suspend
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <Modal
        open={suspendTarget !== null}
        onClose={() => !suspendMutation.isPending && setSuspendTarget(null)}
        title={`Suspend Service Account ${suspendTarget ?? ""}`}
        description="This records a suspension entry with your identity and timestamp for audit."
        footer={
          <>
            <Button variant="outline" onClick={() => setSuspendTarget(null)} disabled={suspendMutation.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => suspendTarget !== null && suspendMutation.mutate(suspendTarget)}
              disabled={suspendMutation.isPending}
            >
              {suspendMutation.isPending ? "Suspending..." : "Confirm Suspension"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Reason" value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)} placeholder="e.g. Two months overdue" />
          <Textarea label="Notes" value={suspendNotes} onChange={(e) => setSuspendNotes(e.target.value)} placeholder="Optional additional context" rows={3} />
        </div>
      </Modal>
    </div>
  );
}

export function ReceivablesPage({ initialTab = "outstanding" }: { initialTab?: Tab } = {}) {
  const [tab, setTab] = React.useState<Tab>(initialTab);

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "outstanding", label: "Outstanding" },
    { key: "overdue", label: "Overdue" },
    { key: "aging", label: "Aging" },
    { key: "suspension", label: "Suspension Candidates" },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Receivables</h2>
        <p className="text-muted-foreground">Outstanding balances, overdue accounts, aging, and suspension candidates.</p>
      </div>

      <div className="flex gap-1 border-b">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "outstanding" && <InvoiceTable overdueOnly={false} />}
      {tab === "overdue" && <InvoiceTable overdueOnly={true} />}
      {tab === "aging" && <AgingTab />}
      {tab === "suspension" && <SuspensionCandidatesTab />}
    </div>
  );
}
