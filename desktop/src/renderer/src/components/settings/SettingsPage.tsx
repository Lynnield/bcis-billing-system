import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useToast } from "@/lib/toast";
import { useAuth } from "@/lib/auth-context";
import { getCollectionsSettings, updateCollectionsSettings } from "@/lib/settings-api";
import { Loader2 } from "lucide-react";

// Matches api/src/routes/settings.ts WRITE_ROLES (UX only).
const WRITE_ROLES = ["Owner / Super Admin", "Administrator"];

/** Spec 3.10: configurable grace period and suspension threshold. */
export function SettingsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { success: showSuccess, error: showError } = useToast();
  const canWrite = !!user && user.roles.some((r) => WRITE_ROLES.includes(r));
  const [grace, setGrace] = React.useState("");
  const [threshold, setThreshold] = React.useState("");

  const { data, isLoading, error } = useQuery({ queryKey: ["settings", "collections"], queryFn: getCollectionsSettings });
  React.useEffect(() => {
    if (data) {
      setGrace(String(data.data.gracePeriodDays));
      setThreshold(String(data.data.suspensionThresholdDays));
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () => updateCollectionsSettings({ gracePeriodDays: Number(grace), suspensionThresholdDays: Number(threshold) }),
    onSuccess: () => {
      showSuccess("Settings saved");
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["receivables-suspension"] });
    },
    onError: (err: unknown) => showError("Could not save settings", err instanceof Error ? err.message : ""),
  });

  const valid = /^\d{1,3}$/.test(grace) && /^\d{1,3}$/.test(threshold) && Number(grace) <= 365 && Number(threshold) <= 365;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Settings</h2>
        <p className="text-muted-foreground">Collection and service-control rules used by receivables and suspension candidates.</p>
      </div>
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="text-lg">Overdue &amp; Suspension</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : error ? (
            <p className="text-sm text-destructive">{error instanceof Error ? error.message : "Failed to load settings"}</p>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (valid && !save.isPending) save.mutate();
              }}
            >
              <Input
                label="Grace period (days) *"
                inputMode="numeric"
                value={grace}
                onChange={(e) => setGrace(e.target.value)}
                helperText="Days after the due date before an unpaid invoice counts toward follow-up."
                disabled={!canWrite}
                error={grace && !/^\d{1,3}$/.test(grace) ? "Enter 0–365" : undefined}
              />
              <Input
                label="Suspension threshold (days overdue) *"
                inputMode="numeric"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                helperText="Accounts overdue at least this long are listed as suspension candidates."
                disabled={!canWrite}
                error={threshold && !/^\d{1,3}$/.test(threshold) ? "Enter 0–365" : undefined}
              />
              <Button type="submit" disabled={!canWrite || !valid || save.isPending}>
                {save.isPending ? "Saving…" : "Save"}
              </Button>
              {!canWrite && <p className="text-sm text-muted-foreground">Only the Owner or an Administrator can change these settings.</p>}
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
