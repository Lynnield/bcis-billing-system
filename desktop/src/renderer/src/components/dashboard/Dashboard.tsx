import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { KPICard } from "@/components/ui/KPICard";
import { getDashboardSummary, getReceivablesReport, getCollectionsReport } from "@/lib/dashboard-api";
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

  const { data: collections, isLoading: collectionsLoading } = useQuery({
    queryKey: ["dashboard", "collections"],
    queryFn: getCollectionsReport,
    staleTime: 30_000,
    retry: 1,
  });

  const isLoading = summaryLoading || receivablesLoading;
  const error = summaryError;

  const AGING_BUCKET_LABELS: Record<string, string> = {
    current: "Current",
    "1-30": "1–30 days",
    "31-60": "31–60 days",
    "61-90": "61–90 days",
    "90+": "90+ days",
  };
  const AGING_BUCKET_COLOR: Record<string, string> = {
    current: "var(--color-primary)",
    "1-30": "var(--color-warning)",
    "31-60": "var(--color-warning)",
    "61-90": "var(--color-destructive)",
    "90+": "var(--color-destructive)",
  };
  const AGING_BUCKET_ORDER = ["current", "1-30", "31-60", "61-90", "90+"];

  const agingChartData = React.useMemo(() => {
    const buckets = receivables?.data?.agingBuckets as AgingBucketRecord | undefined;
    if (!buckets) return [];
    return AGING_BUCKET_ORDER.filter((key) => key in buckets).map((key) => ({
      bucket: key,
      label: AGING_BUCKET_LABELS[key] ?? key,
      amount: Number(buckets[key]) || 0,
      display: buckets[key],
      color: AGING_BUCKET_COLOR[key] ?? "var(--color-muted-foreground)",
    }));
  }, [receivables?.data]);

  const PAYMENT_METHOD_LABELS: Record<string, string> = {
    cash: "Cash",
    gcash: "GCash",
    bank_transfer: "Bank Transfer",
    cheque: "Cheque",
    other: "Other",
  };
  const PAYMENT_METHOD_COLORS = [
    "var(--color-primary)",
    "var(--color-ring)",
    "var(--color-success)",
    "var(--color-warning)",
    "var(--color-muted-foreground)",
  ];

  const paymentMethodChartData = React.useMemo(() => {
    const rows = collections?.data?.byPaymentMethod ?? [];
    return rows
      .filter((r) => Number(r.total) > 0)
      .map((r, i) => ({
        method: r.method,
        label: PAYMENT_METHOD_LABELS[r.method] ?? r.method,
        value: Number(r.total) || 0,
        display: r.total,
        count: r.count,
        color: PAYMENT_METHOD_COLORS[i % PAYMENT_METHOD_COLORS.length],
      }));
  }, [collections?.data]);

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

      {/* Aging & Payment Method Charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">AR Aging</CardTitle>
            <p className="text-xs text-muted-foreground">Outstanding balance by days overdue</p>
          </CardHeader>
          <CardContent>
            {agingChartData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-12 text-center">No outstanding balances</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={agingChartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={{ stroke: "var(--color-border)" }}
                    tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
                    tickFormatter={(v: number) => v.toLocaleString()}
                    width={56}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--color-muted)" }}
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "var(--radius-md)",
                      fontSize: 12,
                    }}
                    formatter={(_value, _name, item) => [item.payload.display, "Outstanding"]}
                  />
                  <Bar dataKey="amount" radius={[4, 4, 0, 0]} maxBarSize={56}>
                    {agingChartData.map((entry) => (
                      <Cell key={entry.bucket} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Payment Method Mix</CardTitle>
            <p className="text-xs text-muted-foreground">All-time posted payments</p>
          </CardHeader>
          <CardContent>
            {collectionsLoading ? (
              <p className="text-sm text-muted-foreground py-12 text-center">Loading...</p>
            ) : paymentMethodChartData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-12 text-center">No posted payments yet</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={paymentMethodChartData}
                      dataKey="value"
                      nameKey="label"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={2}
                      strokeWidth={0}
                    >
                      {paymentMethodChartData.map((entry) => (
                        <Cell key={entry.method} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "var(--color-card)",
                        border: "1px solid var(--color-border)",
                        borderRadius: "var(--radius-md)",
                        fontSize: 12,
                      }}
                      formatter={(_value, _name, item) => [item.payload.display, item.payload.label]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <ul className="space-y-1.5 mt-2">
                  {paymentMethodChartData.map((entry) => (
                    <li key={entry.method} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} aria-hidden="true" />
                        {entry.label}
                      </span>
                      <span className="tabular-nums font-medium">{entry.display}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}