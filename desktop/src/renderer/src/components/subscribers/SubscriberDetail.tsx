import * as React from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { useAuth } from "@/lib/auth-context";
import { getSubscriberById, getSubscriberStatusHistory } from "@/lib/subscriber-api";
import { getServiceAccountById, getServiceAccounts } from "@/lib/service-account-api";
import { getInvoices } from "@/lib/invoice-api";
import { getPayments } from "@/lib/payment-api";
import { ServiceAccountForm } from "@/components/service-accounts/ServiceAccountForm";
import { LedgerView } from "@/components/service-accounts/LedgerView";
import { StatementOfAccountView } from "@/components/service-accounts/StatementOfAccountView";
import { invoiceStatusBadge, invoiceStatusLabel } from "@/components/invoices/invoice-status";
import { ArrowLeft, ExternalLink, Loader2, Mail, MapPin, Phone, Plus } from "lucide-react";

const statusBadgeVariant: Record<string, "default" | "success" | "warning" | "destructive" | "secondary"> = {
  active: "success",
  inactive: "secondary",
  suspended: "warning",
  disconnected: "destructive",
  pending: "default",
  pending_installation: "default",
};

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "services", label: "Services" },
  { key: "billing", label: "Billing" },
  { key: "payments", label: "Payments" },
  { key: "ledger", label: "Ledger" },
  { key: "collection", label: "Collection" },
  { key: "history", label: "Service History" },
  { key: "documents", label: "Documents" },
  { key: "audit", label: "Audit" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

// Which permission each tab needs; tabs the user cannot use are not shown.
const TAB_PERMISSION: Partial<Record<TabKey, string>> = {
  billing: "billing.view",
  payments: "payment.view",
  ledger: "report.view",
  collection: "collection.view",
  documents: "payment_proof.view",
  audit: "audit.view",
};

interface SubscriberDetailProps {
  subscriberId: number;
  onBack: () => void;
}

/** Spec 4.3 subscriber profile. */
export function SubscriberDetail({ subscriberId, onBack }: SubscriberDetailProps) {
  const { user } = useAuth();
  const can = (code?: string) => !code || !user?.permissions || user.permissions.includes(code);
  const tabs = TABS.filter((t) => can(TAB_PERMISSION[t.key]));
  const [tab, setTab] = React.useState<TabKey>("overview");

  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["subscriber", subscriberId], queryFn: () => getSubscriberById(subscriberId) });
  const subscriber = data?.data;

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  if (error || !subscriber) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
          <p className="font-medium text-destructive">Failed to load subscriber</p>
          <p className="mt-1 text-sm text-muted-foreground">{error instanceof Error ? error.message : "Subscriber not found"}</p>
          <Button onClick={() => refetch()} className="mt-4" variant="outline">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Badge variant={statusBadgeVariant[subscriber.status]}>{subscriber.status}</Badge>
      </div>
      <div>
        <h2 className="text-2xl font-semibold">
          {subscriber.firstName} {subscriber.lastName}
        </h2>
        <p className="font-mono text-muted-foreground">{subscriber.accountNumber}</p>
      </div>

      <div className="flex gap-1 overflow-x-auto overflow-y-hidden border-b" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === "overview" && <OverviewTab subscriber={subscriber} />}
        {tab === "services" && <ServicesTab subscriber={subscriber} canManage={can("service_account.manage")} />}
        {tab === "billing" && <BillingTab subscriberId={subscriberId} />}
        {tab === "payments" && <PaymentsTab subscriberId={subscriberId} />}
        {tab === "ledger" && <LedgerTab subscriberId={subscriberId} />}
        {tab === "collection" && <CollectionTab subscriberId={subscriberId} />}
        {tab === "history" && <HistoryTab subscriberId={subscriberId} />}
        {tab === "documents" && <DocumentsTab subscriberId={subscriberId} />}
        {tab === "audit" && <AuditTab subscriberId={subscriberId} />}
      </div>
    </div>
  );
}

type SubscriberT = NonNullable<Awaited<ReturnType<typeof getSubscriberById>>["data"]>;

function OverviewTab({ subscriber }: { subscriber: SubscriberT }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contact</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-muted-foreground" />
            {subscriber.contactNumber ?? "Not provided"}
          </p>
          <p className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            {subscriber.email ?? "Not provided"}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Address</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <span>
              {subscriber.addressLine1}
              {subscriber.addressLine2 && <span className="block">{subscriber.addressLine2}</span>}
              <span className="block">{[subscriber.city, subscriber.province, subscriber.postalCode].filter(Boolean).join(", ") || "—"}</span>
            </span>
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notes</CardTitle>
        </CardHeader>
        <CardContent className="whitespace-pre-line text-sm text-muted-foreground">{subscriber.notes || "No notes."}</CardContent>
      </Card>
      <p className="text-xs text-muted-foreground md:col-span-3">
        Created {new Date(subscriber.createdAt).toLocaleString()} · Updated {new Date(subscriber.updatedAt).toLocaleString()}
      </p>
    </div>
  );
}

function useAccounts(subscriberId: number) {
  return useQuery({ queryKey: ["service-accounts", "subscriber", subscriberId], queryFn: () => getServiceAccounts({ subscriberId, pageSize: 100 }) });
}

function ServicesTab({ subscriber, canManage }: { subscriber: SubscriberT; canManage: boolean }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [adding, setAdding] = React.useState(false);
  const { data } = useAccounts(subscriber.id);
  const accounts = data?.data ?? [];
  const details = useQueries({ queries: accounts.map((a) => ({ queryKey: ["service-account", a.id], queryFn: () => getServiceAccountById(a.id) })) });

  return (
    <div className="space-y-3">
      {canManage && (
        <Button onClick={() => setAdding(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Service
        </Button>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Service #</TableHead>
            <TableHead>Plan</TableHead>
            <TableHead>Installation Address</TableHead>
            <TableHead className="text-right">Rate</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                No service accounts yet
              </TableCell>
            </TableRow>
          ) : (
            accounts.map((a, i) => {
              const d = details[i]?.data?.data;
              return (
                <TableRow key={a.id} className="cursor-pointer" onClick={() => navigate(`/service-accounts/${a.id}`)}>
                  <TableCell className="font-mono">{a.serviceNumber}</TableCell>
                  <TableCell>{d ? `${d.plan.name} (${d.service.type})` : "…"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{d?.installationAddress ?? "Same as subscriber"}</TableCell>
                  <TableCell className="text-right tabular-nums">{d ? (d.currentRate ?? d.plan.price) : ""}</TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant[a.status] ?? "default"}>{a.status.replace("_", " ")}</Badge>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
      <ServiceAccountForm
        open={adding}
        onClose={() => setAdding(false)}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["service-accounts"] })}
        presetSubscriber={{ id: subscriber.id, accountNumber: subscriber.accountNumber, name: `${subscriber.firstName} ${subscriber.lastName}` }}
        isEditing={false}
      />
    </div>
  );
}

function BillingTab({ subscriberId }: { subscriberId: number }) {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ["invoices", "subscriber", subscriberId], queryFn: () => getInvoices({ subscriberId, pageSize: 100 }) });
  if (isLoading) return <Loader2 className="h-4 w-4 animate-spin" />;
  const rows = data?.data ?? [];
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Invoice #</TableHead>
          <TableHead>Issued</TableHead>
          <TableHead>Due</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
              No invoices
            </TableCell>
          </TableRow>
        ) : (
          rows.map((r) => (
            <TableRow key={r.id} className="cursor-pointer" onClick={() => navigate(`/billing-invoices/${r.id}`)}>
              <TableCell className="font-mono">{r.invoiceNumber}</TableCell>
              <TableCell>{r.issueDate.slice(0, 10)}</TableCell>
              <TableCell>{r.dueDate.slice(0, 10)}</TableCell>
              <TableCell>
                <Badge variant={invoiceStatusBadge[r.status]}>{invoiceStatusLabel[r.status]}</Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums">{r.totalAmount}</TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

function PaymentsTab({ subscriberId }: { subscriberId: number }) {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ["payments", "subscriber", subscriberId], queryFn: () => getPayments({ subscriberId, pageSize: 100 }) });
  if (isLoading) return <Loader2 className="h-4 w-4 animate-spin" />;
  const rows = data?.data ?? [];
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Receipt #</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Method</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
              No payments
            </TableCell>
          </TableRow>
        ) : (
          rows.map((p) => (
            <TableRow key={p.id} className="cursor-pointer" onClick={() => navigate(`/payments/${p.id}`)}>
              <TableCell className="font-mono">{p.receiptNumber ?? "—"}</TableCell>
              <TableCell>{p.paymentDate.slice(0, 10)}</TableCell>
              <TableCell>{p.method}</TableCell>
              <TableCell>
                <Badge variant={p.status === "posted" ? "success" : p.status === "pending" ? "warning" : "secondary"}>{p.status}</Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums">{p.amount}</TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

function LedgerTab({ subscriberId }: { subscriberId: number }) {
  const { data } = useAccounts(subscriberId);
  const accounts = data?.data ?? [];
  const [accountId, setAccountId] = React.useState<number | null>(null);
  const [view, setView] = React.useState<"ledger" | "soa">("ledger");
  const selected = accountId ?? accounts[0]?.id ?? null;
  if (accounts.length === 0) return <p className="text-sm text-muted-foreground">No service accounts, so no ledger yet.</p>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="ledger-account" className="text-sm font-medium">
          Service account
        </label>
        <select id="ledger-account" value={selected ?? ""} onChange={(e) => setAccountId(Number(e.target.value))} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.serviceNumber}
            </option>
          ))}
        </select>
        <Button variant={view === "ledger" ? "default" : "outline"} size="sm" onClick={() => setView("ledger")}>
          Ledger
        </Button>
        <Button variant={view === "soa" ? "default" : "outline"} size="sm" onClick={() => setView("soa")}>
          Statement of Account
        </Button>
      </div>
      {selected !== null &&
        (view === "ledger" ? (
          <LedgerView key={`l-${selected}`} serviceAccountId={selected} />
        ) : (
          <StatementOfAccountView key={`s-${selected}`} serviceAccountId={selected} />
        ))}
    </div>
  );
}

function CollectionTab({ subscriberId }: { subscriberId: number }) {
  const { data } = useAccounts(subscriberId);
  const accounts = data?.data ?? [];
  const details = useQueries({ queries: accounts.map((a) => ({ queryKey: ["service-account", a.id], queryFn: () => getServiceAccountById(a.id) })) });
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Service #</TableHead>
          <TableHead>Collection Area</TableHead>
          <TableHead>Assigned Collector</TableHead>
          <TableHead>Due Day</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {accounts.map((a, i) => {
          const d = details[i]?.data?.data;
          return (
            <TableRow key={a.id}>
              <TableCell className="font-mono">{a.serviceNumber}</TableCell>
              <TableCell>{d?.collectionArea?.name ?? "Not assigned"}</TableCell>
              <TableCell>{d?.collector?.fullName ?? "Not assigned"}</TableCell>
              <TableCell>{d?.billingDueDay ?? "Period default"}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function HistoryTab({ subscriberId }: { subscriberId: number }) {
  const { data: statusHistory } = useQuery({ queryKey: ["subscriber-status-history", subscriberId], queryFn: () => getSubscriberStatusHistory(subscriberId) });
  const { data: accountsData } = useAccounts(subscriberId);
  const accounts = accountsData?.data ?? [];
  const histories = useQueries({ queries: accounts.map((a) => ({ queryKey: ["service-history", a.id], queryFn: () => window.bcis.serviceAccounts.getHistory(a.id) })) });

  const entries = [
    ...(statusHistory?.data ?? []).map((h) => ({
      at: h.createdAt,
      what: "Subscriber",
      action: `status ${h.oldStatus ?? "—"} → ${h.newStatus}`,
      note: h.note ?? "",
      by: h.changedBy ?? "System",
    })),
    ...histories.flatMap((q, i) =>
      (q.data?.data ?? []).map((h) => {
        const m = (h.metadata ?? {}) as Record<string, unknown>;
        const change = m.previousStatus || m.newStatus ? `${String(m.previousStatus ?? "—")} → ${String(m.newStatus ?? "—")}` : "";
        return {
          at: h.at,
          what: accounts[i]!.serviceNumber,
          action: `${h.action.replace("service_account.", "").replace(/_/g, " ")} ${change}`.trim(),
          note: typeof m.reason === "string" ? m.reason : "",
          by: h.actorName ?? "—",
        };
      }),
    ),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Record</TableHead>
          <TableHead>Change</TableHead>
          <TableHead>Note</TableHead>
          <TableHead>By</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.length === 0 ? (
          <TableRow>
            <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
              No history yet
            </TableCell>
          </TableRow>
        ) : (
          entries.map((e, i) => (
            <TableRow key={i}>
              <TableCell className="whitespace-nowrap">{new Date(e.at).toLocaleString()}</TableCell>
              <TableCell className="font-mono text-sm">{e.what}</TableCell>
              <TableCell>{e.action}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{e.note || "—"}</TableCell>
              <TableCell>{e.by}</TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

function DocumentsTab({ subscriberId }: { subscriberId: number }) {
  const { data, isLoading } = useQuery({ queryKey: ["subscriber-documents", subscriberId], queryFn: () => window.bcis.paymentProofs.listBySubscriber(subscriberId) });
  if (isLoading) return <Loader2 className="h-4 w-4 animate-spin" />;
  const docs = data?.data ?? [];
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>File</TableHead>
          <TableHead>Uploaded</TableHead>
          <TableHead>Payment</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {docs.length === 0 ? (
          <TableRow>
            <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
              No documents on file
            </TableCell>
          </TableRow>
        ) : (
          docs.map((d) => (
            <TableRow key={d.id}>
              <TableCell>{d.originalName}</TableCell>
              <TableCell>{new Date(d.createdAt).toLocaleString()}</TableCell>
              <TableCell>
                {d.method} · <span className="font-mono">{d.receiptNumber ?? `#${d.paymentId}`}</span>
              </TableCell>
              <TableCell className="text-right tabular-nums">{d.amount}</TableCell>
              <TableCell>
                <Button variant="outline" size="sm" onClick={() => void window.bcis.paymentProofs.open(d.id)}>
                  <ExternalLink className="mr-1 h-3.5 w-3.5" />
                  Open
                </Button>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

function AuditTab({ subscriberId }: { subscriberId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs", "subscriber", subscriberId],
    queryFn: () => window.bcis.audit.getList({ entityType: "subscriber", entityId: subscriberId, pageSize: 100 }),
  });
  if (isLoading) return <Loader2 className="h-4 w-4 animate-spin" />;
  const rows = data?.data ?? [];
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>User</TableHead>
          <TableHead>Action</TableHead>
          <TableHead>Details</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
              No audit records
            </TableCell>
          </TableRow>
        ) : (
          rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</TableCell>
              <TableCell>{r.actorName ?? "—"}</TableCell>
              <TableCell className="font-mono text-xs">{r.action}</TableCell>
              <TableCell className="max-w-md truncate font-mono text-xs text-muted-foreground" title={JSON.stringify(r.metadata)}>
                {JSON.stringify(r.metadata)}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
