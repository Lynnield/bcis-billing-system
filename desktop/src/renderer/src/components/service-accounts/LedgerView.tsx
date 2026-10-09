import { useQuery } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { getLedger } from "@/lib/report-api";
import { ArrowLeft, Printer } from "lucide-react";

interface LedgerViewProps {
  serviceAccountId: number;
  onBack: () => void;
}

export function LedgerView({ serviceAccountId, onBack }: LedgerViewProps) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["ledger", serviceAccountId],
    queryFn: () => getLedger(serviceAccountId),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <p className="text-muted-foreground">Loading ledger...</p>
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
          <p className="font-medium text-destructive">Failed to load ledger</p>
          <p className="text-sm text-muted-foreground mt-1">{error instanceof Error ? error.message : "Not found"}</p>
          <Button onClick={() => refetch()} className="mt-4" variant="outline">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const { serviceAccount, entries, closingBalance } = data.data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between no-print">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          Print
        </Button>
      </div>

      <div>
        <h2 className="text-2xl font-semibold">Subscriber Ledger — {serviceAccount.subscriberName}</h2>
        <p className="text-muted-foreground">
          Service Account {serviceAccount.serviceNumber} · Closing balance:{" "}
          <span className="font-semibold text-foreground">₱{closingBalance}</span>
        </p>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Debit</TableHead>
              <TableHead>Credit</TableHead>
              <TableHead>Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No ledger entries yet
                </TableCell>
              </TableRow>
            ) : (
              entries.map((e, i) => (
                <TableRow key={i}>
                  <TableCell>{e.date}</TableCell>
                  <TableCell className="font-mono text-sm">{e.reference}</TableCell>
                  <TableCell className="text-sm">{e.description}</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(e.debit) > 0 ? `₱${e.debit}` : ""}</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(e.credit) > 0 ? `₱${e.credit}` : ""}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">₱{e.runningBalance}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
        }
      `}</style>
    </div>
  );
}
