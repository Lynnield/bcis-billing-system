import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { KPICard } from "@/components/ui/KPICard";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { getDashboardSummary } from "@/lib/dashboard-api";
import { AlertTriangle, DollarSign, FileText, Receipt, RefreshCw, Users } from "lucide-react";

const AGING = [
  { key: "current", label: "Current", color: "var(--color-primary)" },
  { key: "1-30", label: "1–30 days", color: "var(--color-warning)" },
  { key: "31-60", label: "31–60 days", color: "var(--color-warning)" },
  { key: "61-90", label: "61–90 days", color: "var(--color-destructive)" },
  { key: "90+", label: "90+ days", color: "var(--color-destructive)" },
];

const METHOD_LABEL: Record<string, string> = { cash: "Cash", gcash: "GCash", bank_transfer: "Bank Transfer", cheque: "Cheque", other: "Other" };

const TOOLTIP_STYLE = {
  background: "var(--color-card)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  fontSize: 12,
};
const AXIS_TICK = { fontSize: 12, fill: "var(--color-muted-foreground)" };
const peso = (v: string) => `₱${Number(v).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const monthLabel = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-PH", { month: "short", year: "2-digit", timeZone: "UTC" });

/** Spec 4.3 dashboard: compact KPIs, billing vs collection, method mix, AR aging, collector performance, overdue alerts, recent payments. */
export function Dashboard() {
  const navigate = useNavigate();
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["dashboard", "summary"],
    queryFn: getDashboardSummary,
    staleTime: 30_000,
    retry: 1,
  });
  const d = data?.data;

  if (isLoading) {
    return (
      <div className="grid animate-pulse gap-4 md:grid-cols-3 lg:grid-cols-5">
        {[1, 2, 3, 4, 5].map((i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="mb-4 h-4 w-3/4 rounded bg-muted" />
              <div className="h-8 w-1/2 rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error || !d) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-6">
        <AlertTriangle className="h-6 w-6 flex-shrink-0 text-destructive" />
        <div className="flex-1">
          <p className="font-medium text-destructive">Failed to load dashboard data</p>
          <p className="text-sm text-muted-foreground">{error instanceof Error ? error.message : "Unknown error"}</p>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const billingData = (d.billingVsCollection ?? []).map((r) => ({ month: monthLabel(r.month), billed: Number(r.billed), collected: Number(r.collected), billedText: r.billed, collectedText: r.collected }));
  const agingData = AGING.map((b) => ({ ...b, amount: Number(d.agingBuckets[b.key] ?? 0), display: d.agingBuckets[b.key] ?? "0.00" }));
  const methodTotal = (d.paymentMethodMix ?? []).reduce((t, m) => t + Number(m.total), 0);
  const methods = [...(d.paymentMethodMix ?? [])].sort((a, b) => Number(b.total) - Number(a.total));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Dashboard</h2>
          <p className="text-muted-foreground">As of {data!.meta.today}</p>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* 4–6 compact KPIs */}
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        <KPICard title="Active Subscribers" value={d.activeSubscribers.toLocaleString()} icon={<Users className="h-5 w-5" />} description={`${d.activeServiceAccounts} active services · ${d.pendingInstallations} pending install`} />
        <KPICard title="Outstanding AR" value={peso(d.totalOutstandingAr)} icon={<DollarSign className="h-5 w-5" />} variant="negative" description={`${d.overdueInvoiceCount} overdue invoices`} />
        <KPICard title="Overdue AR" value={peso(d.totalOverdueAr)} icon={<AlertTriangle className="h-5 w-5" />} variant="warning" description={`${d.suspensionCandidateCount} accounts for follow-up`} />
        <KPICard title="Billed This Month" value={peso(d.currentMonthInvoiceTotal)} icon={<FileText className="h-5 w-5" />} description={`${d.openCollectionBatches} open collection batches`} />
        <KPICard title="Collected This Month" value={peso(d.currentMonthPostedCollectionTotal)} icon={<Receipt className="h-5 w-5" />} variant="positive" description={`${d.currentMonthPaymentCount} posted payments`} />
      </div>

      {d.billingVsCollection && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Billing vs Collection</CardTitle>
              <div className="flex gap-4 text-xs text-muted-foreground" aria-label="Legend">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--chart-series-1)" }} aria-hidden="true" />
                  Billed
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--chart-series-2)" }} aria-hidden="true" />
                  Collected
                </span>
              </div>
            </CardHeader>
            <CardContent>
              {billingData.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">No billing in the last six months</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={billingData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} barGap={2}>
                    <CartesianGrid vertical={false} stroke="var(--color-border)" strokeOpacity={0.6} />
                    <XAxis dataKey="month" tickLine={false} axisLine={{ stroke: "var(--color-border)" }} tick={AXIS_TICK} />
                    <YAxis tickLine={false} axisLine={false} tick={AXIS_TICK} tickFormatter={(v: number) => v.toLocaleString()} width={64} />
                    <Tooltip
                      cursor={{ fill: "var(--color-muted)" }}
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(_v, name, item) => [peso(name === "billed" ? item.payload.billedText : item.payload.collectedText), name === "billed" ? "Billed" : "Collected"]}
                    />
                    <Bar dataKey="billed" fill="var(--chart-series-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                    <Bar dataKey="collected" fill="var(--chart-series-2)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Payment Methods — This Month</CardTitle>
            </CardHeader>
            <CardContent>
              {methods.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">No posted payments this month</p>
              ) : (
                <ul className="space-y-3">
                  {methods.map((m) => (
                    <li key={m.method}>
                      <div className="flex justify-between text-sm">
                        <span>{METHOD_LABEL[m.method] ?? m.method}</span>
                        <span className="tabular-nums font-medium">{peso(m.total)}</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-muted" aria-hidden="true">
                        <div className="h-1.5 rounded-full" style={{ width: `${methodTotal ? (Number(m.total) / methodTotal) * 100 : 0}%`, background: "var(--chart-series-1)" }} />
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{m.count} payment(s)</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">AR Aging</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={agingData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--color-border)" strokeOpacity={0.6} />
                <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "var(--color-border)" }} tick={AXIS_TICK} />
                <YAxis tickLine={false} axisLine={false} tick={AXIS_TICK} tickFormatter={(v: number) => v.toLocaleString()} width={64} />
                <Tooltip cursor={{ fill: "var(--color-muted)" }} contentStyle={TOOLTIP_STYLE} formatter={(_v, _n, item) => [peso(item.payload.display), "Outstanding"]} />
                <Bar dataKey="amount" radius={[4, 4, 0, 0]} maxBarSize={56}>
                  {agingData.map((e) => (
                    <Cell key={e.key} fill={e.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {d.overdueAlerts && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Overdue Alerts</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate("/receivables/overdue")}>
                View all
              </Button>
            </CardHeader>
            <CardContent>
              {d.overdueAlerts.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No overdue accounts</p>
              ) : (
                <ul className="divide-y text-sm">
                  {d.overdueAlerts.map((a) => (
                    <li key={a.serviceAccountId}>
                      <button className="flex w-full items-center justify-between gap-2 py-2 text-left hover:bg-muted/40" onClick={() => navigate(`/service-accounts/${a.serviceAccountId}`)}>
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{a.name}</span>
                          <span className="font-mono text-xs text-muted-foreground">{a.serviceNumber}</span>
                        </span>
                        <span className="text-right">
                          <span className="block tabular-nums font-medium">{peso(a.overdueBalance)}</span>
                          <Badge variant={a.daysOverdue > 60 ? "destructive" : "warning"}>{a.daysOverdue} days</Badge>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {d.collectorPerformance && d.recentPayments && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Collector Performance — This Month</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Collector</TableHead>
                    <TableHead className="text-right">Batches</TableHead>
                    <TableHead className="text-right">Accounts</TableHead>
                    <TableHead className="text-right">Collected</TableHead>
                    <TableHead className="text-right">Shortage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.collectorPerformance.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                        No active collectors
                      </TableCell>
                    </TableRow>
                  ) : (
                    d.collectorPerformance.map((c) => (
                      <TableRow key={c.collectorId}>
                        <TableCell>{c.collectorName}</TableCell>
                        <TableCell className="text-right tabular-nums">{c.batches}</TableCell>
                        <TableCell className="text-right tabular-nums">{c.accounts}</TableCell>
                        <TableCell className="text-right tabular-nums">{peso(c.collected)}</TableCell>
                        <TableCell className={`text-right tabular-nums ${c.shortage !== "0.00" ? "text-destructive" : ""}`}>{peso(c.shortage)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Recent Payments</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate("/payments")}>
                View all
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Receipt</TableHead>
                    <TableHead>Subscriber</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.recentPayments.map((p) => (
                    <TableRow key={p.id} className="cursor-pointer" onClick={() => navigate(`/payments/${p.id}`)}>
                      <TableCell className="font-mono text-xs">{p.receiptNumber ?? "—"}</TableCell>
                      <TableCell className="max-w-[160px] truncate">{p.name}</TableCell>
                      <TableCell>
                        {METHOD_LABEL[p.method] ?? p.method}
                        {p.status !== "posted" && (
                          <Badge variant={p.status === "pending" ? "warning" : "secondary"} className="ml-1">
                            {p.status}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{peso(p.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
