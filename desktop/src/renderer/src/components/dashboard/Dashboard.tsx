import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { KPICard } from "@/components/ui/KPICard";
import { getDashboardSummary, getReceivablesReport } from "@/lib/dashboard-api";
import { Users, DollarSign, AlertTriangle, TrendingUp, CreditCard, Receipt } from "lucide-react";

interface KPIData {
  label: string;
  value: string;
  icon: React.ReactNode;
  variant?: "default" | "positive" | "negative" | "warning";
  description?: string;
}

interface AgingBucketRecord {
  [bucket: string]: string;
}

export function Dashboard() {
  const { data: summary, isLoading: summaryLoading, error: summaryError, refetch: refetchSummary } = useQuery({
    queryKey: ["dashboard", "summary"],
    queryFn: getDashboardSummary,
    staleTime: 30_000,
    retry: 1,
  });

  const { data: receivables, isLoading: receivablesLoading } = useQuery({
    queryKey: ["dashboard", "receivables"],
    queryFn: getReceivablesReport,
    staleTime: 30_000,
    retry: 1,
  });

  const isLoading = summaryLoading || receivablesLoading;
  const error = summaryError;

  const kpiCards: KPIData[] = React.useMemo(() => {
    if (!summary?.data) return [];

    const data = summary.data;
    return [
      {
        label: "Active Subscribers",
        value: data.activeSubscribers.toLocaleString(),
        icon: <Users className="h-5 w-5" />,
        variant: "default",
        description: `${data.activeServiceAccounts} active service accounts`,
      },
      {
        label: "Total Outstanding AR",
        value: data.totalOutstandingAr,
        icon: <DollarSign className="h-5 w-5" />,
        variant: "negative",
        description: `${data.overdueInvoiceCount} invoices overdue`,
      },
      {
        label: "Overdue Accounts",
        value: data.totalOverdueAr,
        icon: <AlertTriangle className="h-5 w-5" />,
        variant: "warning",
        description: `${data.suspensionCandidateCount} suspension candidates`,
      },
      {
        label: "Monthly Collections",
        value: data.currentMonthPostedCollectionTotal,
        icon: <Receipt className="h-5 w-5" />,
        variant: "positive",
        description: `${data.currentMonthPaymentCount} payments posted`,
      },
    ];
  }, [summary?.data]);

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Dashboard</h2>
            <p className="text-muted-foreground">Loading key metrics...</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="h-4 bg-muted rounded w-3/4 mb-4" />
                <div className="h-8 bg-muted rounded w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Dashboard</h2>
            <p className="text-muted-foreground">Overview of key billing and collection metrics</p>
          </div>
        </div>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-6 w-6 text-destructive flex-shrink-0" />
            <div>
              <p className="font-medium text-destructive">Failed to load dashboard data</p>
              <p className="text-sm text-muted-foreground">{error instanceof Error ? error.message : "Unknown error"}</p>
            </div>
          </div>
          <button onClick={() => refetchSummary()} className="ml-auto px-4 py-2 bg-destructive text-white rounded-md hover:bg-destructive/90">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Dashboard</h2>
          <p className="text-muted-foreground">Overview of key billing and collection metrics</p>
        </div>
        <button
          onClick={() => refetchSummary()}
          disabled={summaryLoading}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
        >
          {summaryLoading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpiCards.map((kpi) => (
          <KPICard
            key={kpi.label}
            title={kpi.label}
            value={kpi.value}
            icon={kpi.icon}
            variant={kpi.variant}
            description={kpi.description}
          />
        ))}
      </div>

      {/* Additional Metrics Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Installations</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.data?.pendingInstallations ?? 0}</div>
            <p className="text-xs text-muted-foreground">Awaiting field installation</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open Collection Batches</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.data?.openCollectionBatches ?? 0}</div>
            <p className="text-xs text-muted-foreground">Batches awaiting remittance</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Remittance Shortages</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{summary?.data?.remittanceShortageTotal ?? "0.00"}</div>
            <p className="text-xs text-muted-foreground">Total shortage across all batches</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Remittance Overages</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{summary?.data?.remittanceOverageTotal ?? "0.00"}</div>
            <p className="text-xs text-muted-foreground">Total overage across all batches</p>
          </CardContent>
        </Card>
      </div>

      {/* Aging Summary */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {receivables?.data?.agingBuckets &&
          Object.entries(receivables.data.agingBuckets as AgingBucketRecord).map(([bucket, amount]) => (
            <Card key={bucket}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{bucket}</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{amount}</div>
                <p className="text-xs text-muted-foreground">Outstanding balance</p>
              </CardContent>
            </Card>
          ))}
      </div>
    </div>
  );
}