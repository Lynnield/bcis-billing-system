import * as React from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { getPayments, getPaymentById } from "@/lib/payment-api";
import { getServiceAccountById } from "@/lib/service-account-api";
import { PaymentDetail } from "./PaymentDetail";
import { Eye, Loader2, RefreshCw } from "lucide-react";

/**
 * Pending GCash verification queue. Status "pending" is only ever reached
 * by a GCash submission (every other method is posted immediately — see
 * api/src/routes/payments.ts), so filtering the existing payments list by
 * status=pending already is the GCash queue; the method check below is a
 * defensive, belt-and-suspenders filter in case that ever changes.
 */
export function GcashVerificationQueue() {
  const [selectedPaymentId, setSelectedPaymentId] = React.useState<number | null>(null);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["payments", "pending-gcash-queue"],
    queryFn: () => getPayments({ status: "pending", pageSize: 100 }),
  });

  const pendingGcashPayments = (data?.data ?? []).filter((p) => p.method === "gcash");

  const detailQueries = useQueries({
    queries: pendingGcashPayments.map((p) => ({
      queryKey: ["payment", p.id],
      queryFn: () => getPaymentById(p.id),
    })),
  });

  const accountIds = [...new Set(pendingGcashPayments.map((p) => p.serviceAccountId))];
  const accountQueries = useQueries({
    queries: accountIds.map((id) => ({
      queryKey: ["service-account", id],
      queryFn: () => getServiceAccountById(id),
    })),
  });
  const accountById = new Map(accountQueries.map((q, i) => [accountIds[i], q.data?.data]));

  if (selectedPaymentId !== null) {
    return <PaymentDetail paymentId={selectedPaymentId} onBack={() => setSelectedPaymentId(null)} />;
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">GCash Verification</h2>
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading pending GCash payments...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">GCash Verification</h2>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6">
          <p className="font-medium text-destructive">Failed to load pending GCash payments</p>
          <p className="text-sm text-muted-foreground mt-1">{error instanceof Error ? error.message : "Unknown error"}</p>
          <Button onClick={() => refetch()} className="mt-4" variant="outline">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">GCash Verification</h2>
          <p className="text-muted-foreground">
            Pending GCash submissions awaiting verification or rejection. None of these have been applied
            to any invoice balance yet.
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Service Account</TableHead>
              <TableHead>Subscriber</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead>GCash Reference</TableHead>
              <TableHead>Proof on File</TableHead>
              <TableHead className="w-[80px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pendingGcashPayments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No pending GCash payments
                </TableCell>
              </TableRow>
            ) : (
              pendingGcashPayments.map((payment, index) => {
                const account = accountById.get(payment.serviceAccountId);
                const detail = detailQueries[index]?.data?.data;
                return (
                  <TableRow key={payment.id}>
                    <TableCell className="font-mono">{account?.serviceNumber ?? payment.serviceAccountId}</TableCell>
                    <TableCell>
                      {account ? `${account.subscriber.firstName} ${account.subscriber.lastName}` : "Loading..."}
                    </TableCell>
                    <TableCell className="font-medium">₱{payment.amount}</TableCell>
                    <TableCell>{new Date(payment.createdAt).toLocaleString()}</TableCell>
                    <TableCell className="font-mono">{detail?.gcash?.gcashReferenceNumber ?? "Loading..."}</TableCell>
                    <TableCell className="max-w-[160px] truncate" title={detail?.gcash?.proofAttachmentPath ?? undefined}>
                      {detail?.gcash?.proofAttachmentPath ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setSelectedPaymentId(payment.id)}
                        aria-label={`Review payment ${payment.id}`}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      {pendingGcashPayments.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Proof attachments are shown by their recorded path only — there is no file upload or in-app
          preview available yet. Open "Review" for full details, including verify/reject actions.
        </p>
      )}
    </div>
  );
}
