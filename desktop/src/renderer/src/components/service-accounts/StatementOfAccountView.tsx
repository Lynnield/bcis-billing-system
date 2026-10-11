import { useQuery } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { getSoa } from "@/lib/report-api";
import type { AgingBucketKey } from "@/shared/types";
import { formatPeso } from "@/lib/utils";
import { ArrowLeft, Printer } from "lucide-react";

interface StatementOfAccountViewProps {
  serviceAccountId: number;
  /** Omit when embedded (e.g. in the subscriber profile) to hide Back. */
  onBack?: () => void;
}

const bucketBadgeVariant: Record<string, "default" | "warning" | "destructive" | "secondary"> = {
  current: "default",
  "1-30": "warning",
  "31-60": "warning",
  "61-90": "destructive",
  "90+": "destructive",
};

export function StatementOfAccountView({ serviceAccountId, onBack }: StatementOfAccountViewProps) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["soa", serviceAccountId],
    queryFn: () => getSoa(serviceAccountId),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <p className="text-muted-foreground">Loading statement...</p>
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
          <p className="font-medium text-destructive">Failed to load statement of account</p>
          <p className="text-sm text-muted-foreground mt-1">{error instanceof Error ? error.message : "Not found"}</p>
          <Button onClick={() => refetch()} className="mt-4" variant="outline">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const { subscriber, serviceAccount, service, plan, outstandingInvoices, recentPayments, totals } = data.data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        {onBack ? (
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        ) : (
          <span />
        )}
        <Button onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          Print Statement
        </Button>
      </div>

      <div>
        <h2 className="text-2xl font-semibold">Statement of Account</h2>
        <p className="text-muted-foreground">Generated {new Date(data.meta.generatedAt).toLocaleString()}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border p-4">
          <h3 className="font-medium mb-2">Subscriber</h3>
          <dl className="text-sm space-y-1">
            <div className="flex justify-between"><dt className="text-muted-foreground">Name</dt><dd>{subscriber.name}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Account #</dt><dd className="font-mono">{subscriber.accountNumber}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Contact</dt><dd>{subscriber.contactNumber ?? "—"}</dd></div>
          </dl>
        </div>
        <div className="rounded-lg border p-4">
          <h3 className="font-medium mb-2">Service</h3>
          <dl className="text-sm space-y-1">
            <div className="flex justify-between"><dt className="text-muted-foreground">Service Account</dt><dd className="font-mono">{serviceAccount.serviceNumber}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Plan</dt><dd>{plan.name} ({service.type})</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Monthly Rate</dt><dd>{formatPeso(plan.price)}</dd></div>
          </dl>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Outstanding Balance</p>
          <p className="text-2xl font-bold tabular-nums">{formatPeso(totals.outstandingBalance)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Overdue Balance</p>
          <p className="text-2xl font-bold tabular-nums text-destructive">{formatPeso(totals.overdueBalance)}</p>
        </div>
      </div>

      <div>
        <h3 className="font-medium mb-2">Outstanding Invoices</h3>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Bucket</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {outstandingInvoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                    No outstanding invoices — account is current
                  </TableCell>
                </TableRow>
              ) : (
                outstandingInvoices.map((inv) => (
                  <TableRow key={inv.invoiceId}>
                    <TableCell className="font-mono">{inv.invoiceNumber}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatPeso(inv.totalAmount)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{formatPeso(inv.balance)}</TableCell>
                    <TableCell>{inv.dueDate}</TableCell>
                    <TableCell>
                      <Badge variant={bucketBadgeVariant[inv.bucket as AgingBucketKey]}>{inv.bucket}</Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="print:hidden">
        <h3 className="font-medium mb-2">Recent Payments</h3>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Receipt #</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentPayments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                    No payments recorded yet
                  </TableCell>
                </TableRow>
              ) : (
                recentPayments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{new Date(p.paymentDate).toLocaleDateString()}</TableCell>
                    <TableCell>{p.method}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatPeso(p.amount)}</TableCell>
                    <TableCell className="font-mono">{p.receiptNumber ?? "—"}</TableCell>
                    <TableCell>{p.status}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

    </div>
  );
}
