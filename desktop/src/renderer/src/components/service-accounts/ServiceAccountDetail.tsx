import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/lib/toast";
import { getServiceAccountById } from "@/lib/service-account-api";
import type { ServiceAccountDetail, ServiceAccountStatus } from "@/shared/types";
import { ArrowLeft, User, CreditCard, MapPin, Calendar, AlertTriangle, RotateCcw, Loader2 } from "lucide-react";

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
  const { success: showSuccess, error: showError } = useToast();

  const { data: accountData, isLoading: accountLoading, error: accountError, refetch: refetchAccount } = useQuery({
    queryKey: ["service-account", accountId],
    queryFn: () => getServiceAccountById(accountId),
    enabled: !!accountId,
  });

  const suspendMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) => window.bcis.serviceAccounts.suspend(id, reason),
    onSuccess: (data) => {
      showSuccess("Service account suspended", data.message);
      queryClient.invalidateQueries({ queryKey: ["service-account", accountId] });
    },
    onError: (err: Error) => showError("Failed to suspend", err.message),
  });

  const reconnectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) => window.bcis.serviceAccounts.reconnect(id, reason),
    onSuccess: (data) => {
      showSuccess("Service account reconnected", data.message);
      queryClient.invalidateQueries({ queryKey: ["service-account", accountId] });
    },
    onError: (err: Error) => showError("Failed to reconnect", err.message),
  });

  const account = accountData?.data;

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
              <p className="text-sm text-muted-foreground">Plan Name</p>
              <p className="font-medium">{account.plan.name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Service</p>
              <p className="font-medium">{account.service.name} ({account.service.type})</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Monthly Price</p>
              <p className="font-medium">₱{account.plan.price}</p>
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
              onClick={() => {
                const reason = prompt("Reason for suspension (optional):");
                if (reason !== null) suspendMutation.mutate({ id: accountId, reason });
              }}
              disabled={suspendMutation.isPending || !canSuspend}
            >
              {suspendMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Suspending...
                </>
              ) : (
                <>
                  <AlertTriangle className="mr-2 h-4 w-4" />
                  Suspend Account
                </>
              )}
            </Button>
            <Button
              variant={canReconnect ? "default" : "outline"}
              onClick={() => {
                const reason = prompt("Reason for reconnection (optional):");
                if (reason !== null) reconnectMutation.mutate({ id: accountId, reason });
              }}
              disabled={reconnectMutation.isPending || !canReconnect}
            >
              {reconnectMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Reconnecting...
                </>
              ) : (
                <>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Reconnect Account
                </>
              )}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Suspend: Only active accounts can be suspended. Reconnect: Only suspended accounts can be reconnected.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}