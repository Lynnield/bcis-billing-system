import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Modal } from "@/components/ui/Modal";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { useToast } from "@/lib/toast";
import { useAuth } from "@/lib/auth-context";
import { useNavigate } from "react-router-dom";
import {
  getServiceAccountById,
  suspendServiceAccount,
  reconnectServiceAccount,
  getSuspensionHistory,
  getReconnectionHistory,
} from "@/lib/service-account-api";
import type { ServiceAccountDetail, ServiceAccountStatus } from "@/shared/types";
import { formatPeso } from "@/lib/utils";
import { ArrowLeft, User, CreditCard, MapPin, Calendar, AlertTriangle, RotateCcw, Loader2, History } from "lucide-react";

const statusBadgeVariant: Record<ServiceAccountStatus, "default" | "success" | "warning" | "destructive" | "secondary"> = {
  active: "success",
  inactive: "secondary",
  suspended: "warning",
  disconnected: "destructive",
  pending_installation: "default",
};

const subscriberStatusBadgeVariant: Record<string, "default" | "success" | "warning" | "destructive" | "secondary"> = {
  active: "success",
  inactive: "secondary",
  suspended: "warning",
  disconnected: "destructive",
  pending: "default",
};

interface ServiceAccountDetailProps {
  accountId: number;
  onBack: () => void;
}

export function ServiceAccountDetail({ accountId, onBack }: ServiceAccountDetailProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { success: showSuccess, error: showError } = useToast();

  const { data: accountData, isLoading: accountLoading, error: accountError, refetch: refetchAccount } = useQuery({
    queryKey: ["service-account", accountId],
    queryFn: () => getServiceAccountById(accountId),
    enabled: !!accountId,
  });

  const { data: suspensionHistoryData } = useQuery({
    queryKey: ["suspension-history", accountId],
    queryFn: () => getSuspensionHistory(accountId),
    enabled: !!accountId,
  });

  const { data: reconnectionHistoryData } = useQuery({
    queryKey: ["reconnection-history", accountId],
    queryFn: () => getReconnectionHistory(accountId),
    enabled: !!accountId,
  });

  const [suspendOpen, setSuspendOpen] = React.useState(false);
  const [suspendReason, setSuspendReason] = React.useState("");
  const [suspendNotes, setSuspendNotes] = React.useState("");
  const [reconnectOpen, setReconnectOpen] = React.useState(false);
  // Blank fee = the plan's reconnection fee (decided server-side).
  const [reconnectFee, setReconnectFee] = React.useState("");
  const [reconnectNotes, setReconnectNotes] = React.useState("");
  const [reconnectReason, setReconnectReason] = React.useState("");
  const [technicianId, setTechnicianId] = React.useState("");
  const [completeNow, setCompleteNow] = React.useState(false);
  const [overrideUnpaid, setOverrideUnpaid] = React.useState(false);
  const { user } = useAuth();
  const canOverride = !!user && user.roles.some((r) => r === "Owner / Super Admin" || r === "Administrator");

  // Technician picker: the user list is Owner/Admin-only on the API, so other
  // roles simply get no picker (the request can still be raised).
  const { data: usersData } = useQuery({
    queryKey: ["users"],
    queryFn: () => window.bcis.users.getList(),
    enabled: reconnectOpen && canOverride,
  });
  const technicians = (usersData?.users ?? []).filter((u) => u.status === "active" && u.roles.includes("Technician"));

  const { data: historyData } = useQuery({
    queryKey: ["service-history", accountId],
    queryFn: () => window.bcis.serviceAccounts.getHistory(accountId),
  });
  const serviceHistory = historyData?.data ?? [];

  const completeMutation = useMutation({
    mutationFn: (reconnectionId: number) => window.bcis.serviceAccounts.completeReconnection(accountId, reconnectionId),
    onSuccess: () => {
      showSuccess("Reconnection completed", "The account is active again.");
      queryClient.invalidateQueries({ queryKey: ["service-account", accountId] });
      queryClient.invalidateQueries({ queryKey: ["reconnection-history", accountId] });
      queryClient.invalidateQueries({ queryKey: ["service-history", accountId] });
    },
    onError: (err: unknown) => showError("Could not complete reconnection", err instanceof Error ? err.message : ""),
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["service-account", accountId] });
    queryClient.invalidateQueries({ queryKey: ["suspension-history", accountId] });
    queryClient.invalidateQueries({ queryKey: ["reconnection-history", accountId] });
  };

  const suspendMutation = useMutation({
    mutationFn: () => suspendServiceAccount(accountId, { reason: suspendReason.trim() || undefined, notes: suspendNotes.trim() || undefined }),
    onSuccess: (data) => {
      showSuccess("Service account suspended", data.message);
      setSuspendOpen(false);
      setSuspendReason("");
      setSuspendNotes("");
      invalidateAll();
    },
    onError: (err: unknown) => showError("Failed to suspend", err instanceof Error ? err.message : "Unknown error"),
  });

  const reconnectMutation = useMutation({
    mutationFn: () =>
      reconnectServiceAccount(accountId, {
        ...(reconnectFee.trim() ? { fee: reconnectFee.trim() } : {}),
        ...(reconnectNotes.trim() ? { notes: reconnectNotes.trim() } : {}),
        ...(reconnectReason.trim() ? { reason: reconnectReason.trim() } : {}),
        ...(technicianId ? { technicianUserId: Number(technicianId) } : {}),
        completeNow,
        ...(overrideUnpaid ? { overrideUnpaid: true } : {}),
      }),
    onSuccess: (data) => {
      showSuccess(completeNow ? "Service account reconnected" : "Reconnection requested", data.message);
      setReconnectOpen(false);
      setReconnectFee("");
      setReconnectNotes("");
      setReconnectReason("");
      setTechnicianId("");
      setCompleteNow(false);
      setOverrideUnpaid(false);
      queryClient.invalidateQueries({ queryKey: ["service-history", accountId] });
      invalidateAll();
    },
    onError: (err: unknown) => showError("Failed to reconnect", err instanceof Error ? err.message : "Unknown error"),
  });

  const account = accountData?.data;
  const suspensionHistory = suspensionHistoryData?.data ?? [];
  const reconnectionHistory = reconnectionHistoryData?.data ?? [];

  if (accountLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={onBack} disabled>
            <Loader2 className="h-4 w-4 animate-spin" />
          </Button>
          <div className="h-6 bg-muted rounded w-48" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="h-4 bg-muted rounded w-1/2 mb-2" />
                <div className="h-8 bg-muted rounded w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (accountError || !account) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
          <p className="font-medium text-destructive">Failed to load service account</p>
          <p className="text-sm text-muted-foreground mt-1">{accountError instanceof Error ? accountError.message : "Service account not found"}</p>
          <Button onClick={() => refetchAccount()} className="mt-4" variant="outline">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const canSuspend = account.status === "active";
  const canReconnect = account.status === "suspended";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to List
        </Button>
        <div className="flex items-center gap-2">
          <Badge variant={statusBadgeVariant[account.status]}>
            {account.status.replace("_", " ")}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-muted-foreground" />
              Service Account
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Service Number</p>
              <p className="text-lg font-mono font-semibold">{account.serviceNumber}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <Badge variant={statusBadgeVariant[account.status]}>
                {account.status.replace("_", " ")}
              </Badge>
            </div>
            {account.activatedAt && (
              <div>
                <p className="text-sm text-muted-foreground">Activated At</p>
                <p className="font-medium">{new Date(account.activatedAt).toLocaleString()}</p>
              </div>
            )}
            <div>
              <p className="text-sm text-muted-foreground">Installation Address</p>
              <p className="font-medium">{account.installationAddress ?? "Same as subscriber address"}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-sm text-muted-foreground">Billing Starts</p>
                <p className="font-medium">{account.billingStartDate ? account.billingStartDate.slice(0, 10) : "—"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Due Day</p>
                <p className="font-medium">{account.billingDueDay ?? "Period default"}</p>
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Current Rate</p>
              <p className="font-medium tabular-nums">
                ₱{account.currentRate ?? account.plan.price}
                {account.currentRate ? <span className="ml-1 text-xs text-muted-foreground">(account rate)</span> : <span className="ml-1 text-xs text-muted-foreground">(plan price)</span>}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5 text-muted-foreground" />
              Subscriber
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">Account Number</p>
              <p className="font-mono font-medium">{account.subscriber.accountNumber}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Name</p>
              <p className="font-medium">{account.subscriber.firstName} {account.subscriber.lastName}</p>
              <button className="text-sm text-primary underline underline-offset-2" onClick={() => navigate(`/subscribers/${account.subscriber.id}`)}>
                Open subscriber profile
              </button>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Subscriber Status</p>
              <Badge variant={subscriberStatusBadgeVariant[account.subscriber.status] ?? "default"}>
                {account.subscriber.status}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-muted_foreground" />
              Service Plan
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">Plan</p>
              <p className="font-medium">
                {account.plan.code && <span className="mr-2 font-mono text-xs text-muted-foreground">{account.plan.code}</span>}
                {account.plan.name}
              </p>
            </div>
            {(account.plan.speedMbps || account.plan.channelCount) && (
              <div>
                <p className="text-sm text-muted-foreground">Includes</p>
                <p className="font-medium">
                  {[account.plan.speedMbps ? `${account.plan.speedMbps} Mbps` : null, account.plan.channelCount ? `${account.plan.channelCount} channels` : null].filter(Boolean).join(" · ")}
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-sm text-muted-foreground">Installation Fee</p>
                <p className="font-medium tabular-nums">{formatPeso(account.plan.installationFee)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Reconnection Fee</p>
                <p className="font-medium tabular-nums">{formatPeso(account.plan.reconnectionFee)}</p>
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Service</p>
              <p className="font-medium">{account.service.name} ({account.service.type})</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Monthly Price</p>
              <p className="font-medium">{formatPeso(account.plan.price)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Plan Status</p>
              <Badge variant={account.plan.status === "active" ? "success" : "secondary"}>
                {account.plan.status}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <MapPin className="h-5 w-5 text-muted-foreground" />
            Collection Assignment
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-sm text-muted-foreground">Collection Area</p>
            <p className="font-medium">{account.collectionArea?.name ?? "Not assigned"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Assigned Collector</p>
            <p className="font-medium">{account.collector?.fullName ?? "Not assigned"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Collector Area</p>
            <p className="font-medium text-muted-foreground">
              {(account.collector as any)?.collectionAreaId ? "Assigned" : "—"}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            Timestamps
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-sm text-muted-foreground">Created At</p>
            <p className="font-medium">{new Date(account.createdAt).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Updated At</p>
            <p className="font-medium">{new Date(account.updatedAt).toLocaleString()}</p>
          </div>
          {account.activatedAt && (
            <div>
              <p className="text-sm text-muted-foreground">Activated At</p>
              <p className="font-medium">{new Date(account.activatedAt).toLocaleString()}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-muted_foreground" />
            Status Actions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button
              variant={canSuspend ? "destructive" : "outline"}
              onClick={() => setSuspendOpen(true)}
              disabled={suspendMutation.isPending || !canSuspend}
            >
              <AlertTriangle className="mr-2 h-4 w-4" />
              Suspend Account
            </Button>
            <Button
              variant={canReconnect ? "default" : "outline"}
              onClick={() => setReconnectOpen(true)}
              disabled={reconnectMutation.isPending || !canReconnect}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Reconnect Account
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Suspend: Only active accounts can be suspended. Reconnect: Only suspended accounts can be reconnected.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <History className="h-5 w-5 text-muted-foreground" />
            Suspension &amp; Reconnection History
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h4 className="text-sm font-medium mb-2">Suspensions</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Effective Date</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suspensionHistory.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-4 text-muted-foreground text-sm">
                      No suspensions recorded
                    </TableCell>
                  </TableRow>
                ) : (
                  suspensionHistory.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>{new Date(s.effectiveDate).toLocaleString()}</TableCell>
                      <TableCell>{s.reason ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{s.notes ?? "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div>
            <h4 className="text-sm font-medium mb-2">Reconnections</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Request Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Completion Date</TableHead>
                  <TableHead className="text-right">Fee</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {reconnectionHistory.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-4 text-muted-foreground text-sm">
                      No reconnections recorded
                    </TableCell>
                  </TableRow>
                ) : (
                  reconnectionHistory.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{new Date(r.requestDate).toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant={r.status === "completed" ? "success" : "warning"}>{r.status === "completed" ? "Completed" : "Requested"}</Badge>
                      </TableCell>
                      <TableCell>{r.completionDate ? new Date(r.completionDate).toLocaleString() : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPeso(r.fee)}
                        {r.billedInvoiceId ? <span className="block text-xs text-muted-foreground">billed</span> : null}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-pre-line">{r.notes ?? "—"}</TableCell>
                      <TableCell>
                        {r.status === "requested" && (
                          <Button size="sm" onClick={() => completeMutation.mutate(r.id)} disabled={completeMutation.isPending}>
                            Mark Completed
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <History className="h-5 w-5 text-muted-foreground" />
            Service History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {serviceHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recorded changes yet.</p>
          ) : (
            <ul className="divide-y text-sm">
              {serviceHistory.map((h) => {
                const m = (h.metadata ?? {}) as Record<string, unknown>;
                const detail =
                  m.previousStatus || m.newStatus
                    ? `${String(m.previousStatus ?? "—")} → ${String(m.newStatus ?? "—")}`
                    : m.new
                      ? Object.keys(m.new as object).join(", ")
                      : "";
                return (
                  <li key={h.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                    <span>
                      <span className="font-mono text-xs">{h.action.replace("service_account.", "")}</span>
                      {detail && <span className="ml-2 text-muted-foreground">{detail}</span>}
                      {typeof m.reason === "string" && m.reason && <span className="ml-2 text-muted-foreground">— {m.reason}</span>}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {h.actorName ?? "—"} · {new Date(h.at).toLocaleString()}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Modal
        open={suspendOpen}
        onClose={() => !suspendMutation.isPending && setSuspendOpen(false)}
        title="Suspend Service Account"
        description="This records a suspension entry with your identity and timestamp for audit."
        footer={
          <>
            <Button variant="outline" onClick={() => setSuspendOpen(false)} disabled={suspendMutation.isPending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => suspendMutation.mutate()} disabled={suspendMutation.isPending}>
              {suspendMutation.isPending ? "Suspending..." : "Confirm Suspension"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Reason"
            value={suspendReason}
            onChange={(e) => setSuspendReason(e.target.value)}
            placeholder="e.g. Two months overdue"
          />
          <Textarea
            label="Notes"
            value={suspendNotes}
            onChange={(e) => setSuspendNotes(e.target.value)}
            placeholder="Optional additional context"
            rows={3}
          />
        </div>
      </Modal>

      <Modal
        open={reconnectOpen}
        onClose={() => !reconnectMutation.isPending && setReconnectOpen(false)}
        title="Reconnect Service Account"
        description="Requires the overdue balance to be paid. Raises a reconnection request for a technician; the account becomes active when it is marked completed."
        footer={
          <>
            <Button variant="outline" onClick={() => setReconnectOpen(false)} disabled={reconnectMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={() => reconnectMutation.mutate()} disabled={reconnectMutation.isPending || (overrideUnpaid && !reconnectReason.trim())}>
              {reconnectMutation.isPending ? "Saving..." : completeNow ? "Reconnect Now" : "Request Reconnection"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Reconnection Fee"
            inputMode="decimal"
            value={reconnectFee}
            onChange={(e) => setReconnectFee(e.target.value)}
            placeholder={`${account.plan.reconnectionFee} (plan fee)`}
            helperText="Charged on the account's next invoice. Leave blank to use the plan's fee."
          />
          {technicians.length > 0 && (
            <div className="space-y-1.5">
              <label htmlFor="reconnect-technician" className="text-sm font-medium leading-none">
                Technician
              </label>
              <select
                id="reconnect-technician"
                value={technicianId}
                onChange={(e) => setTechnicianId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Not assigned yet</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName}
                  </option>
                ))}
              </select>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={completeNow} onChange={(e) => setCompleteNow(e.target.checked)} />
            Reconnected now (no field visit needed)
          </label>
          {canOverride && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={overrideUnpaid} onChange={(e) => setOverrideUnpaid(e.target.checked)} />
              Reconnect even though an overdue balance remains (reason required, audited)
            </label>
          )}
          <Input
            label={overrideUnpaid ? "Reason *" : "Reason"}
            value={reconnectReason}
            onChange={(e) => setReconnectReason(e.target.value)}
            placeholder="e.g. Paid in full at the office"
          />
          <Textarea
            label="Notes"
            value={reconnectNotes}
            onChange={(e) => setReconnectNotes(e.target.value)}
            placeholder="e.g. Technician assigned, fee paid at office"
            rows={3}
          />
        </div>
      </Modal>
    </div>
  );
}