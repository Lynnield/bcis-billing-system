import { useQuery } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { getServiceAccounts } from "@/lib/service-account-api";
import { getSubscriberById } from "@/lib/subscriber-api";
import { getSoa } from "@/lib/report-api";
import { getCollectorById } from "@/lib/collection-area-api";
import { formatPeso } from "@/lib/utils";
import { ArrowLeft, Printer } from "lucide-react";

interface RouteSheetProps {
  collectorId: number;
  onBack: () => void;
}

interface RouteSheetRow {
  serviceAccountId: number;
  serviceNumber: string;
  subscriberName: string;
  address: string;
  currentBill: string;
  arrears: string;
  totalDue: string;
}

export function RouteSheet({ collectorId, onBack }: RouteSheetProps) {
  const { data: collectorData } = useQuery({
    queryKey: ["collector", collectorId],
    queryFn: () => getCollectorById(collectorId),
  });

  const { data: rows, isLoading, error, refetch } = useQuery({
    queryKey: ["route-sheet", collectorId],
    queryFn: async (): Promise<RouteSheetRow[]> => {
      const accountsRes = await getServiceAccounts({ collectorId, pageSize: 100, status: "active" });
      const accounts = accountsRes.data;
      // Each account's financials are derived from the same SOA computation
      // already used/tested elsewhere (reports.ts) rather than re-deriving
      // balances here — no duplicated financial logic.
      const results = await Promise.all(
        accounts.map(async (acc) => {
          const [subscriber, soa] = await Promise.all([
            getSubscriberById(acc.subscriberId),
            getSoa(acc.id).catch(() => null),
          ]);
          const outstanding = soa ? Number(soa.data.totals.outstandingBalance) : 0;
          const overdue = soa ? Number(soa.data.totals.overdueBalance) : 0;
          return {
            serviceAccountId: acc.id,
            serviceNumber: acc.serviceNumber,
            subscriberName: `${subscriber.data.firstName} ${subscriber.data.lastName}`,
            address: [subscriber.data.addressLine1, subscriber.data.addressLine2, subscriber.data.city].filter(Boolean).join(", "),
            currentBill: (outstanding - overdue).toFixed(2),
            arrears: overdue.toFixed(2),
            totalDue: outstanding.toFixed(2),
          };
        }),
      );
      return results;
    },
  });

  const collectorName = collectorData?.data.fullName ?? `Collector #${collectorId}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button onClick={() => window.print()} disabled={isLoading || !rows?.length}>
          <Printer className="mr-2 h-4 w-4" />
          Print Route Sheet
        </Button>
      </div>

      <div>
        <h2 className="text-2xl font-semibold">Route Sheet — {collectorName}</h2>
        <p className="text-muted-foreground">Active accounts assigned to this collector, with current balances.</p>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 print:hidden">
          <p className="font-medium text-destructive">Failed to build route sheet</p>
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
                <TableHead>Account #</TableHead>
                <TableHead>Subscriber</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Current Bill</TableHead>
                <TableHead>Arrears</TableHead>
                <TableHead>Total Due</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Building route sheet...
                  </TableCell>
                </TableRow>
              ) : !rows || rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No active accounts assigned to this collector
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.serviceAccountId}>
                    <TableCell className="font-mono">{r.serviceNumber}</TableCell>
                    <TableCell className="font-medium">{r.subscriberName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.address || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatPeso(r.currentBill)}</TableCell>
                    <TableCell className="text-right tabular-nums text-destructive">{formatPeso(r.arrears)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{formatPeso(r.totalDue)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

    </div>
  );
}
